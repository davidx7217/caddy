// The install flow. background.js opens it once, on reason === 'install'.
//
// It asks four things and only four: what Caddy is, which cards you carry, the
// questions those picks actually raise, and whether it may run by itself.
// Everything else the extension knows how to do -- tie-breakers, the blocklist,
// the activity log -- is either learned at checkout or has a defensible default,
// and asking about it here would trade a one-minute setup for a form nobody can
// answer on the day they installed something.
//
// It writes the same storage keys Options writes and nothing else, so there is
// no setup state to get out of step with the settings page: this flow is a
// friendlier path into `instances`, `valuations` and the <all_urls> grant, not
// a second source of truth for them.

import { fontFaceCss, fontStack } from './engine.js';
import { CURRENCY, ISSUER, mark, money } from './issuers.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const j = n => fetch(chrome.runtime.getURL(`data/${n}.json`)).then(r => r.json());
const [products, baseVals] = await Promise.all([j('cards'), j('valuations')]);
// Sorted by `common`, the editorial popularity rank in cards.json. See the
// _common_note there for what that rank is and is not.
const productIds = Object.keys(products).filter(k => !k.startsWith('_'))
  .sort((a, b) => products[a].common - products[b].common);

const fonts = document.createElement('style');
fonts.textContent = fontFaceCss(chrome.runtime.getURL);
document.head.appendChild(fonts);
document.documentElement.style.setProperty('--font', fontStack());

// ---------- state ----------
let picked = new Set();   // productId, in the order they were chosen
let configs = {};         // productId -> the same `config` object Options writes
let valuations = {};      // currency -> cents per point, only where overridden
let auto = false;         // <all_urls> as actually granted, never as asked for
let stepId = 'intro';
let query = '';

async function load() {
  const s = await chrome.storage.local.get(['instances', 'valuations', 'theme']);
  // Someone can reach this page with a wallet already built -- by URL, or by
  // removing and re-adding the extension over the same profile. Show what is
  // there, or Continue would quietly overwrite it with an empty picker.
  for (const inst of s.instances || []) {
    if (!products[inst.productId]) continue;
    picked.add(inst.productId);
    configs[inst.productId] = inst.config || {};
  }
  valuations = s.valuations || {};
  document.documentElement.dataset.theme =
    s.theme === 'light' || s.theme === 'dark' ? s.theme
      : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  auto = await chrome.permissions.contains({ origins: ['<all_urls>'] });
}

// Written on every step change, not at the end. Someone who closes the tab
// after picking their cards keeps their cards; the alternative is a flow that
// throws the work away unless it is finished in one sitting.
const save = () => chrome.storage.local.set({
  instances: [...picked].map(id => ({ productId: id, config: configs[id] || {} })),
  valuations
});

// ---------- steps ----------
// Both of these are derived from the picks, which is why step three exists only
// when the picks earn it. A cash-back-only wallet has nothing to answer here.
const tunableCards = () => [...picked].filter(id => products[id].user_config);
const liveCurrencies = () => {
  const live = new Set([...picked].map(id => products[id].currency));
  // cash is 1.0 by definition. An input for it is a question with one answer.
  return Object.keys(baseVals)
    .filter(k => !k.startsWith('_') && k !== 'cash' && live.has(k));
};

const steps = () => [
  { id: 'intro', label: 'Welcome' },
  { id: 'cards', label: 'Your cards' },
  ...(tunableCards().length || liveCurrencies().length
    ? [{ id: 'tune', label: 'Fine-tune' }] : []),
  { id: 'mode', label: 'Turn it on' }
];

// ---------- panes ----------
function pickRow(id) {
  const p = products[id];
  const on = picked.has(id);
  return `<button class="pick" data-pick="${esc(id)}" aria-pressed="${on}">
    ${mark(p.issuer)}
    <span class="grow">
      <span class="row-name">${esc(p.name)}</span>
      <span class="row-meta">${esc(ISSUER[p.issuer] || p.issuer)} &middot; ${money(p.annual_fee)} &middot; ${esc(CURRENCY[p.currency] || p.currency)}</span>
      ${p.caution ? `<span class="caution">${esc(p.caution)}</span>` : ''}
    </span>
    <span class="state">${on ? '&#9632; ADDED' : '&#9633; ADD'}</span>
  </button>`;
}

function paneCards() {
  const q = query.trim().toLowerCase();
  const hits = productIds.filter(id => !q ||
    `${products[id].name} ${ISSUER[products[id].issuer] || products[id].issuer}`
      .toLowerCase().includes(q));
  const body = hits.length
    ? `<div class="w-list">${hits.map(pickRow).join('')}</div>`
    : `<div class="empty">Nothing in the catalogue matches "${esc(query.trim())}".
         Clear the search to see all ${productIds.length}.</div>`;

  return `<div class="w-title">Your cards</div>
    <p class="w-blurb">Pick every card you carry. Caddy ranks these and nothing else, and it
      ships with no wallet by design, so this is the one step it cannot do for you. Rates come
      from published issuer terms, each with a source and a date you can check later.</p>
    <input class="w-search" id="q" placeholder="Search by card or bank" value="${esc(query)}"
           spellcheck="false" autocomplete="off">
    ${body}`;
}

function paneTune() {
  const cards = tunableCards().map(id => {
    const p = products[id], uc = p.user_config, cfg = configs[id] || {};
    let controls = '';
    for (const g of uc.selections || []) {
      // A group's picks are its own option ids, so slot n is the nth saved
      // selection that belongs to this group.
      const chosen = (cfg.selections || []).filter(k => g.options[k]);
      for (let slot = 0; slot < (g.max || 1); slot++) {
        controls += `<label>${esc(g.label)}${(g.max || 1) > 1 ? ` ${slot + 1}` : ''}
          <select data-k="cat" data-id="${esc(id)}">
            <option value="">choose...</option>
            ${Object.entries(g.options).map(([k, label]) =>
              `<option value="${esc(k)}" ${chosen[slot] === k ? 'selected' : ''}>${esc(label)}</option>`).join('')}
          </select></label>`;
      }
    }
    if (uc.tier_multiplier) {
      controls += `<label>${esc(uc.tier_multiplier.label)}
        <select data-k="tier" data-id="${esc(id)}">
          ${Object.entries(uc.tier_multiplier.options).map(([label, v]) =>
            `<option value="${v}" ${(cfg.tier_multiplier || 1) === v ? 'selected' : ''}>${esc(label)}</option>`).join('')}
        </select></label>`;
    }
    return `<div class="w-tune">
      <div class="w-tune-head">${mark(p.issuer)}<span class="row-name">${esc(p.name)}</span></div>
      <div class="cfg">${controls}</div>
    </div>`;
  }).join('');

  const curr = liveCurrencies();
  const points = curr.length ? `
    <div class="sub-head">Point values</div>
    <p class="hint">Cents per point. These are opinions, not facts, and they decide which card
      wins a close call: at 1.5 cpp a 3x dining card beats a 2% cash card, and at 1.0 it does
      not. The defaults are reasonable. Change them if you disagree.</p>
    <div class="grid points">${curr.map(k => `
      <div class="pt">
        <div class="pt-label">${esc(CURRENCY[k] || k)}</div>
        <div class="pt-in">
          <input type="number" step="0.1" min="0" data-val="${esc(k)}"
                 value="${valuations[k] ?? baseVals[k]}"><span>cpp</span>
        </div>
      </div>`).join('')}</div>` : '';

  return `<div class="w-title">Fine-tune</div>
    <p class="w-blurb">Only the questions your picks actually raise. Everything here has a
      working default, so skipping it costs you accuracy on close calls, not the product.</p>
    ${cards ? `<div class="sub-head">Card settings</div>${cards}` : ''}
    ${points}`;
}

function paneMode() {
  const modes = [
    { key: 'ask', label: 'Only when you ask', on: !auto,
      desc: 'Nothing runs until you click the toolbar icon on a page. Caddy asks for no permissions at all.' },
    { key: 'auto', label: 'On every shop', on: auto,
      desc: 'The dock appears by itself on any store you visit. Chrome will ask you to allow it. It still never sends anything anywhere.' }
  ];
  return `<div class="w-title">Turn it on</div>
    <p class="w-blurb">Caddy can wait to be asked, or it can watch for stores by itself. The
      second one needs Chrome's permission to read the pages you visit. That is why it is off
      until you choose it here, and why installing this extension prompted you for nothing.</p>
    <div class="grid modes">${modes.map(m => `
      <button class="mode${m.on ? ' on' : ''}" data-auto="${m.key}" aria-pressed="${m.on}">
        <div class="mode-state">${m.on ? '&#9632; SELECTED' : '&#9633; SELECT'}</div>
        <div class="mode-label">${esc(m.label)}</div>
        <div class="mode-desc">${esc(m.desc)}</div>
      </button>`).join('')}</div>
    <p class="hint">Either way, nothing leaves your browser. You can switch modes, block
      individual sites, and change any of this in Settings.</p>`;
}

const PANES = {
  intro: () => `<div class="w-title">Welcome</div>
    <p class="lede">Caddy tells you which card to use, on the page where you are about to pay.</p>
    <div class="spec w-spec">
      <div><span>Account</span><span>None. There is nothing to sign in to.</span></div>
      <div><span>Bank linking</span><span>None. Caddy never sees a transaction.</span></div>
      <div><span>Network calls</span><span>None. Every rate ships inside the extension.</span></div>
    </div>
    <p class="w-blurb">It reads the page you are on: which merchant, and whether you have
      reached checkout. Then it ranks the cards you own against their published issuer terms.
      Setup is three short steps, and everything you choose is changeable afterwards.</p>`,
  cards: paneCards,
  tune: paneTune,
  mode: paneMode
};

// ---------- render ----------
function render() {
  const list = steps();
  const i = list.findIndex(s => s.id === stepId);
  const last = i === list.length - 1;

  $('#steps').innerHTML = list.map((s, n) =>
    `<li ${n <= i ? 'data-on' : ''}>${esc(s.label)}</li>`).join('');
  $('#pane').innerHTML = PANES[stepId]();

  $('#back').hidden = i === 0;
  $('#next').textContent = last ? 'FINISH' : 'CONTINUE';
  // The only hard gate in the flow. Nothing downstream means anything without
  // at least one card, and an empty ranking is not a product.
  $('#next').disabled = stepId === 'cards' && picked.size === 0;
  $('#note').textContent = stepId === 'cards'
    ? `${picked.size} card${picked.size === 1 ? '' : 's'} selected`
    : `Step ${i + 1} of ${list.length}`;
}

async function go(delta) {
  const list = steps();
  const next = list[list.findIndex(s => s.id === stepId) + delta];
  await save();
  if (!next) { location.replace(chrome.runtime.getURL('src/options.html')); return; }
  stepId = next.id;
  query = '';
  render();
  scrollTo(0, 0);
}

// chrome.permissions.request must run inside a user gesture, so nothing may be
// awaited before it -- this is called straight from the click handler.
async function setAuto(on) {
  if (on) await chrome.permissions.request({ origins: ['<all_urls>'] });
  else await chrome.permissions.remove({ origins: ['<all_urls>'] });
  // Trust the permission, never the button. A user can decline the prompt, and
  // rendering what we asked for rather than what we got would leave the tile
  // reading "selected" while nothing actually runs.
  auto = await chrome.permissions.contains({ origins: ['<all_urls>'] });
  render();
}

// ---------- events ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t || t.disabled) return;
  const d = t.dataset;
  if (d.pick) {
    if (picked.has(d.pick)) picked.delete(d.pick); else picked.add(d.pick);
    render();
    return;
  }
  if (d.auto) { setAuto(d.auto === 'auto'); return; }
  if (d.nav) go(+d.nav);
});

document.addEventListener('input', e => {
  if (e.target.id !== 'q') return;
  query = e.target.value;
  const at = e.target.selectionStart;
  render();
  // render() replaced the field, so put the cursor back where it was typed.
  const box = $('#q');
  box.focus();
  box.setSelectionRange(at, at);
});

document.addEventListener('change', e => {
  const d = e.target.dataset;
  if (d.k === 'cat') {
    configs[d.id] = configs[d.id] || {};
    // Read every control in this card's block: the engine takes one flat array.
    const picks = [...e.target.closest('.cfg').querySelectorAll('select[data-k="cat"]')]
      .map(x => x.value).filter(Boolean);
    configs[d.id].selections = [...new Set(picks)];
  }
  if (d.k === 'tier') {
    configs[d.id] = configs[d.id] || {};
    configs[d.id].tier_multiplier = parseFloat(e.target.value);
  }
  if (d.val) {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v) && v >= 0) valuations[d.val] = v;
    else delete valuations[d.val];
  }
});

await load();
render();
