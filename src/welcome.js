// The install flow. background.js opens it once, on reason === 'install'.
//
// It asks four things and only four: what Caddy is, which cards you carry, the
// questions those picks actually raise, and whether it may run by itself.
// Everything else the extension knows how to do -- tie-breakers, the blocklist,
// the activity log -- is either learned at checkout or has a defensible default,
// and asking about it here would trade a one-minute setup for a form nobody can
// answer on the day they installed something.
//
// It writes the same storage keys Options writes, so there is no setup state to
// get out of step with the settings page: this flow is a friendlier path into
// `instances`, `valuations` and the <all_urls> grant, not a second source of
// truth for them. The one key of its own is `setupPending`, which says only that
// first-run setup is unfinished and where it was left -- see background.js.

import { fontFaceCss, fontStack } from './engine.js';
import { CURRENCY, mark, matchesSearch, money } from './issuers.js';
import * as setup from './setup.js';

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
let theme = 'system';     // 'system' | 'light' | 'dark'; the key Options writes
let stepId = 'intro';
let query = '';
let page = 0;             // which slice of the catalogue is on screen
let pending = null;       // step id while first-run setup is unfinished, else null

async function load() {
  const s = await chrome.storage.local.get(['instances', 'valuations', 'theme', 'setupPending']);
  // Someone can reach this page with a wallet already built -- by URL, or by
  // removing and re-adding the extension over the same profile. Show what is
  // there, or Continue would quietly overwrite it with an empty picker.
  for (const inst of s.instances || []) {
    if (!products[inst.productId]) continue;
    picked.add(inst.productId);
    configs[inst.productId] = inst.config || {};
  }
  valuations = s.valuations || {};
  // Back from a closed tab, the toolbar icon or Settings: pick up at the step
  // that was reached, with the picks above already restored.
  pending = s.setupPending || null;
  stepId = setup.resumeAt(pending, picked, products, baseVals);
  theme = s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system';
  applyTheme();
  const { prefs = {} } = await chrome.storage.local.get('prefs');
  auto = prefs.autoMode !== false;   // absent means ON
}

// Written on every step change, not at the end. Someone who closes the tab
// after picking their cards keeps their cards; the alternative is a flow that
// throws the work away unless it is finished in one sitting.
const save = () => chrome.storage.local.set({
  instances: setup.toInstances(picked, configs),
  valuations
});

// ---------- steps ----------
// Bound to this flow's state. The decisions themselves are in src/setup.js,
// which has no DOM in it and is covered by tools/test-setup.mjs -- everything a
// reader could be shown wrongly is decided there rather than here.
const tunableCards = () => setup.tunableCards(picked, products);
const liveCurrencies = () => setup.liveCurrencies(picked, products, baseVals);
const steps = () => setup.steps(picked, products, baseVals);

// ---------- panes ----------
function pickRow(id) {
  const p = products[id];
  const on = picked.has(id);
  return `<button class="pick" data-pick="${esc(id)}" aria-pressed="${on}">
    ${mark(p.issuer)}
    <span class="grow">
      <span class="row-name">${esc(p.name)}</span>
      <span class="row-meta">${money(p.annual_fee)} &middot; ${esc(CURRENCY[p.currency] || p.currency)}</span>
    </span>
    <span class="state">${on ? '&#9632; ADDED' : '&#9633; ADD'}</span>
  </button>`;
}

// Six, not the ten Options pages by, because this step carries a title, a blurb
// and a search box above the list. Six rows is what still fits under all three
// without the step needing a scroll.
const PER_PAGE = 6;

function paneCards() {
  const q = query.trim().toLowerCase();
  const hits = productIds.filter(id => !q || matchesSearch(products[id], q));

  // A search that shrinks the catalogue under the cursor can leave `page` past
  // the end. Clamp on read rather than resetting on every keystroke, so the
  // page you were on survives a search you then clear.
  const pages = Math.max(1, Math.ceil(hits.length / PER_PAGE));
  page = Math.max(0, Math.min(page, pages - 1));
  const slice = hits.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  // Same pager Options uses, down to the markup: one construction for paging a
  // card catalogue, and the reader meets it twice in the first five minutes.
  const body = hits.length
    ? `<div class="w-list">${slice.map(pickRow).join('')}</div>
       <div class="pager">
         <span class="pager-count">${slice.length} of ${hits.length}</span>
         <span class="pager-nav">${pages < 2 ? '' : `
           <button class="btn" data-page="prev" ${page === 0 ? 'disabled' : ''}>&lsaquo; PREV</button>
           <span class="pager-at">Page ${page + 1} of ${pages}</span>
           <button class="btn" data-page="next" ${page === pages - 1 ? 'disabled' : ''}>NEXT &rsaquo;</button>`}
         </span>
       </div>`
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
  // On the sourcing in this copy, checked 2026-09-13. There is no community
  // standard and no issuer figure: the going rates are published estimates from
  // rewards outlets, and they disagree because each prices a different
  // redemption. TPG's September 2026 table has Chase points at 2.05 cpp
  // (thepointsguy.com/loyalty-programs/monthly-valuations/); Bankrate counts the
  // same point at 1.0 because it prices a cash-out
  // (bankrate.com/credit-cards/rewards/chase-ultimate-rewards/); NerdWallet
  // publishes two numbers per currency, portal and best transfer partner
  // (nerdwallet.com/travel/learn/airline-miles-and-hotel-points-valuations).
  // Caddy's defaults sit between them, which is what the copy says.
  const points = curr.length ? `
    <div class="sub-head">Point values</div>
    <p class="hint">Cents per point. No issuer publishes one, so the going rates come from
      rewards sites like The Points Guy, NerdWallet and Bankrate, and those disagree, because
      each prices a different redemption. TPG had Chase points at 2.05 cents in September
      2026; Bankrate counts the same point at 1.0, since it assumes you cash out. Caddy's
      defaults sit between the two and assume you book through the issuer's own travel portal.
      Change them if you would like: at 1.5 cpp a 3x dining card beats a 2% cash card, and at
      1.0 it does not.</p>
    <div class="grid points">${curr.map(k => `
      <div class="pt">
        <div class="pt-label">${esc(CURRENCY[k] || k)}</div>
        <div class="pt-in">
          <input type="number" step="0.1" min="0" data-val="${esc(k)}"
                 value="${valuations[k] ?? baseVals[k]}"><span>cpp</span>
        </div>
      </div>`).join('')}</div>` : '';

  // The blurb has to hold whether this step is showing card settings, point
  // values or both -- `steps()` includes it when either is earned -- so it names
  // the two as examples of one thing rather than promising both are below.
  return `<div class="w-title">What you earn</div>
    <p class="w-blurb">Everything here is something the issuer's published terms cannot
      settle: which bonus categories you chose, what a point is worth to you. Caddy fills in
      a working answer for each, so skipping this step costs you accuracy on close calls, not
      the product.</p>
    ${cards ? `<div class="sub-head">Card settings</div>${cards}` : ''}
    ${points}`;
}

function paneMode() {
  const modes = [
    { key: 'auto', label: 'On every shop', on: auto,
      desc: 'The default. The dock appears by itself on any store you visit, and tells you which card wins before you pay.' },
    { key: 'ask', label: 'Only when you ask', on: !auto,
      desc: 'Nothing appears on a page unless you click the toolbar icon. The ranking is still one click away.' }
  ];
  return `<div class="w-title">How it runs</div>
    <p class="w-blurb">Caddy watches for stores by itself, which is what makes the dock appear
      without you asking. That is the default and you can leave it. Switching to the second
      option stops it reading any page until you click the toolbar icon.</p>
    <div class="grid modes">${modes.map(m => `
      <button class="mode${m.on ? ' on' : ''}" data-auto="${m.key}" aria-pressed="${m.on}">
        <div class="mode-state">${m.on ? '&#9632; SELECTED' : '&#9633; SELECT'}</div>
        <div class="mode-label">${esc(m.label)}</div>
        <div class="mode-desc">${esc(m.desc)}</div>
      </button>`).join('')}</div>
    <p class="hint">Either way, nothing leaves your browser: no account, no bank linking, and
      no network calls of any kind. You can switch modes, block individual sites, and change
      any of this later in Settings.</p>
    <div class="sub-head">Appearance</div>
    <p class="hint">Auto follows your browser's light or dark setting and changes when it
      does. Pick one of the other two if you would rather Caddy stayed put.</p>
    <div class="w-theme">${[['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]
      .map(([k, label]) => `
      <button class="${theme === k ? 'on' : ''}" data-theme="${k}"
              aria-pressed="${theme === k}">${label}</button>`).join('')}</div>`;
}

const PANES = {
  // Three claims that hold for the life of the product. "No account" and "no
  // network calls" used to be here and are not any more: a paid tier would need
  // a licence of some kind, and the natural thing to sell is fresher rate data,
  // which is a fetch. Neither is decided, and a welcome screen is the wrong
  // place to promise something a later version might have to take back. What is
  // left is what cannot change -- Caddy has no route to a bank account, earns
  // nothing from its own advice, and reads its numbers off the issuer.
  intro: () => `<div class="w-title">Welcome</div>
    <p class="lede">Caddy tells you which card to use, on the page where you are about to pay.</p>
    <div class="spec w-spec">
      <div><span>Bank linking</span><span>None. Nothing to connect, and no card number to type.</span></div>
      <div><span>Affiliate links</span><span>None. No issuer pays Caddy for what it recommends.</span></div>
      <div><span>Where rates come from</span><span>The issuer's own page, with the date on every card.</span></div>
    </div>
    <p class="w-blurb">It reads the page you are on: which merchant, and whether you have
      reached checkout. Then it ranks the cards you own against their published issuer terms.
      Setup takes about a minute, and everything you choose is changeable afterwards.</p>`,
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
  if (!next) {
    // FINISH is the only thing that ends first-run setup. Cleared before the
    // redirect, or Settings would read it and send the reader straight back.
    await chrome.storage.local.remove('setupPending');
    location.replace(chrome.runtime.getURL('src/options.html'));
    return;
  }
  stepId = next.id;
  // Only while setup is pending. Reached by URL after it was finished, this page
  // must not re-arm the key and pull a set-up reader back into it.
  if (pending) await chrome.storage.local.set({ setupPending: stepId });
  query = '';
  page = 0;
  render();
  scrollTo(0, 0);
}

// A stored preference, not a permission request. <all_urls> is declared in the
// manifest now, so there is nothing to prompt for and nothing to decline.
// System mode is the ABSENCE of the attribute, not a resolved colour stamped on
// it. Leaving it off is what lets ui.css's media query answer, and keep
// answering if the browser flips while this page is open.
function applyTheme() {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

// Written straight through, like setAuto: the page repaints under the choice,
// so a theme that only landed on Continue would look like it had not taken.
// 'system' clears the key rather than storing the word -- see the note in
// options.js, which owns the same contract.
async function setTheme(next) {
  theme = next;
  applyTheme();
  if (next === 'system') await chrome.storage.local.remove('theme');
  else await chrome.storage.local.set({ theme: next });
  render();
}

async function setAuto(on) {
  const { prefs = {} } = await chrome.storage.local.get('prefs');
  prefs.autoMode = on;
  await chrome.storage.local.set({ prefs });
  auto = on;
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
  if (d.theme) { setTheme(d.theme); return; }
  if (d.page) { page += d.page === 'next' ? 1 : -1; render(); scrollTo(0, 0); return; }
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
