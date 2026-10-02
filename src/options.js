import { pruneInstances, fontFaceCss, fontStack } from './engine.js';
import { CURRENCY, ISSUER, KIND_LABEL, kindOf, mark, matchesSearch, money, networkName } from './issuers.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SECTIONS = [
  { id: 'cards',   label: 'Cards',         title: 'Cards',
    blurb: 'Every card Caddy ranks, with the fees, categories and caps it reasons over.' },
  { id: 'ranking', label: 'Ranking',       title: 'Ranking',
    blurb: 'What decides a close call, and what the big number shows.' },
  { id: 'runs',    label: 'Where it runs', title: 'Where it runs',
    blurb: 'On by default. Turn it off and Caddy waits to be asked.' },
  { id: 'data',    label: 'Data',          title: 'Data',
    blurb: 'What Caddy keeps, where it keeps it, and how to take it with you.' }
];

// Settings is where setup ENDS. Reached while it is unfinished -- from
// chrome://extensions, or a tab left open -- the page hands over to setup rather
// than opening on a catalogue with no explanation. See background.js. The await
// never settles on purpose: the page is being replaced, and nothing below should
// run in the meantime.
if ((await chrome.storage.local.get('setupPending')).setupPending) {
  location.replace(chrome.runtime.getURL('src/welcome.html'));
  await new Promise(() => {});
}

const j = n => fetch(chrome.runtime.getURL(`data/${n}.json`)).then(r => r.json());
const [products, baseVals, categories] = await Promise.all([j('cards'), j('valuations'), j('categories')]);
// Sorted by `common`, the editorial popularity rank in cards.json. File order
// is arrival order, which put five Chase cards at the top of the catalogue for
// no reason but the order they happened to be written.
const productIds = Object.keys(products).filter(k => !k.startsWith('_'))
  .sort((a, b) => products[a].common - products[b].common);
const VERSION = chrome.runtime.getManifest().version;

let instances = [], valuations = {}, prefs = {}, blocked = [], activity = [], dropped = 0;
// `auto` is what the reader ASKED for, a stored pref that defaults to on.
// `running` is whether a content script is actually registered, which is the
// only thing that puts a dock on a page. They can disagree -- Chrome's own
// site-access control can withhold the host permission -- and saying so is the
// whole point of reading both.
let auto = true, permitted = true, running = false, bytes = 0;
let section = 'cards';
let detail = null;   // productId whose dialog is open, or null when it is shut
// Catalogue filters. Everything here narrows the ADD A CARD list and nothing
// else; none of it is stored, because a filter you have to remember turning off
// is a filter that makes the catalogue look permanently short.
let f = { q: '', kind: '', scope: '', fee: '', cat: '' };
let page = 1;
const PER_PAGE = 10;
// 'system', 'light' or 'dark' -- a MODE, not a resolved colour. 'system' is the
// absence of a stored value: every surface decides by testing for exactly
// 'light' or 'dark', so the way to follow the browser is to store nothing and
// let ui.css's media query answer.
let theme = 'system';

async function load() {
  const s = await chrome.storage.local.get(
    ['instances', 'valuations', 'prefs', 'blocked', 'activity', 'theme']);
  const raw = s.instances || [];
  instances = pruneInstances(raw, products);
  dropped = raw.length - instances.length;
  valuations = s.valuations || {};
  blocked = s.blocked || [];
  activity = s.activity || [];
  prefs = s.prefs || {};
  prefs.categoryDefaults = prefs.categoryDefaults || {};
  // Assigned rather than conditionally overwritten: clearing the key has to take
  // `theme` back to 'system', and the old form would have left the last pin in
  // place on the reload that follows the write.
  theme = s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system';
  await readAuto();
  bytes = await chrome.storage.local.getBytesInUse(null);
  applyFont();
}

/** The worker owns the registration, so it is the only honest source for this. */
async function readAuto() {
  const st = await chrome.runtime.sendMessage({ type: 'AUTO_STATE' }).catch(() => null);
  auto = st ? !!st.wanted : prefs.autoMode !== false;
  permitted = st ? !!st.permitted : true;
  running = !!(st && st.registered);
  return st;
}

function applyFont() {
  let tag = document.getElementById('font-faces');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'font-faces';
    document.head.appendChild(tag);
  }
  tag.textContent = fontFaceCss(chrome.runtime.getURL);
  document.documentElement.style.setProperty('--font', fontStack());
}

// Reloading the extension orphans an open options page exactly as it orphans a
// content script. Without this, every control here keeps updating the screen
// while chrome.storage.set throws in the background -- so a cleared tie choice
// looks cleared, is not saved, and comes back on the next page you visit.
let dead = false;
function contextAlive() {
  try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
}
function die() {
  if (dead) return;
  dead = true;
  flash('This page is out of date because the extension was reloaded. ' +
        'Nothing here can be saved. Close this tab and open Options again.', true);
}

// Banners live outside the pane so a re-render does not wipe them.
function flash(msg, sticky = false) {
  const el = document.createElement('div');
  el.className = 'banner';
  el.textContent = msg;
  $('#alerts').appendChild(el);
  if (!sticky) setTimeout(() => el.remove(), 6000);
}

// The overlay writes prefs too (Always use), and the worker writes activity, so
// this page must never assume its copy is current.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || saving) return;
  if (changes.prefs || changes.instances || changes.valuations || changes.activity) {
    await load(); render();
  }
});
let saving = false;

/**
 * Write ONE key, then re-read and render from what storage actually holds.
 *
 * Two rules, both learned the hard way. Write only the key you changed: a
 * blanket multi-key write clobbers whatever another surface wrote in between.
 * And never render from memory after a write -- doing that is how a cleared tie
 * choice looked cleared, was never saved, and came back on the next page.
 */
async function commit(key, { redraw = true } = {}) {
  if (dead) return;
  if (!contextAlive()) { die(); return; }
  saving = true;
  try {
    // Following the browser is a key that is not there. Writing the string
    // 'system' would be a fourth value for the popup, the overlay and setup to
    // learn, all of which already read absence correctly.
    if (key === 'theme' && theme === 'system') await chrome.storage.local.remove('theme');
    else await chrome.storage.local.set(
      { [key]: { instances, valuations, prefs, blocked, activity, theme }[key] });
  } catch (e) {
    die();
    return;
  } finally {
    saving = false;
  }
  await load();
  if (redraw) render();
}

// ---------- shared bits ----------
const sec = () => SECTIONS.find(x => x.id === section) || SECTIONS[0];
const ownedProducts = () => instances.map(i => products[i.productId]).filter(Boolean);

function ratesDate() {
  const pool = ownedProducts().length ? ownedProducts() : productIds.map(id => products[id]);
  return pool.map(p => p.last_verified).filter(Boolean).sort()[0] || '';
}

function liveCurrencies() {
  const live = new Set(ownedProducts().map(p => p.currency));
  return Object.keys(baseVals).filter(k => !k.startsWith('_') && live.has(k));
}

const catLabel = k => (categories[k] && categories[k].label) || String(k).replace(/_/g, ' ');

// ---------- section renderers ----------
function blockOwned() {
  if (!instances.length) {
    return `<div class="list"><div class="empty">No cards yet. Add one below.</div></div>`;
  }
  // A row, not a card: everything that made the old cell tall -- the caution,
  // the per-card dropdowns -- lives in the detail dialog now, so the summary
  // only has to be identifiable.
  // The row is a div holding two buttons, not one button: Remove has to live
  // out here as well as in the dialog, and a button inside a button is invalid
  // markup that never fires.
  return `<div class="list">${instances.map(inst => {
    const p = products[inst.productId];
    return `<div class="card-row">
      <button class="card-open" data-open="${esc(inst.productId)}">
        ${mark(p.issuer)}
        <span class="grow">
          <span class="row-name">${esc(p.name)}</span>
          <span class="row-meta">${esc(networkName(p.network))} &middot; ${money(p.annual_fee)} &middot; ${esc(CURRENCY[p.currency] || p.currency)}</span>
        </span>
        <span class="chev" aria-hidden="true">&rsaquo;</span>
      </button>
      <button class="btn" data-rm="${esc(inst.productId)}">REMOVE</button>
    </div>`;
  }).join('')}</div>`;
}

// Categories worth offering: the ones some card in the catalogue actually
// bonuses. `other` is the base rate, which is not a bonus category.
const bonusCats = () => [...new Set(productIds.flatMap(id =>
  (products[id].rules || []).map(r => r.category)))]
  .filter(k => k !== 'other').sort((a, b) => catLabel(a).localeCompare(catLabel(b)));

function blockFilters() {
  const opt = (v, label, sel) =>
    `<option value="${esc(v)}" ${sel === v ? 'selected' : ''}>${esc(label)}</option>`;
  // No issuer dropdown: the search box already matches issuer names, so typing
  // "chase" does the same job with one less control on screen.
  return `<div class="cfg filters">
    <label>Search
      <input type="search" data-f="q" value="${esc(f.q)}" placeholder="Card or bank"
             spellcheck="false" autocomplete="off"></label>
    <label>Earns
      <select data-f="kind">${opt('', 'Any', f.kind)}
        ${opt('cash', KIND_LABEL.cash, f.kind)}${opt('points', KIND_LABEL.points, f.kind)}
      </select></label>
    <label>Account
      <select data-f="scope">${opt('', 'Any', f.scope)}
        ${opt('personal', 'Personal', f.scope)}${opt('business', 'Business', f.scope)}
      </select></label>
    <label>Annual fee
      <select data-f="fee">${opt('', 'Any', f.fee)}
        ${opt('none', 'No annual fee', f.fee)}${opt('has', 'Has a fee', f.fee)}
      </select></label>
    <label>Bonuses
      <select data-f="cat">${opt('', 'Any category', f.cat)}
        ${bonusCats().map(k => opt(k, catLabel(k), f.cat)).join('')}
      </select></label>
  </div>`;
}

function blockPager(shown, matched, pages) {
  const filtering = Object.values(f).some(Boolean);
  return `<div class="pager">
    <span class="pager-count">${shown} of ${matched}</span>
    ${filtering ? '<button class="btn" data-clearfilters="1">CLEAR FILTERS</button>' : ''}
    <span class="pager-nav">${pages < 2 ? '' : `
      <button class="btn" data-page="prev" ${page === 1 ? 'disabled' : ''}>&lsaquo; PREV</button>
      <span class="pager-at">Page ${page} of ${pages}</span>
      <button class="btn" data-page="next" ${page === pages ? 'disabled' : ''}>NEXT &rsaquo;</button>`}
    </span>
  </div>`;
}

function matchesFilters(id) {
  const p = products[id];
  const q = f.q.trim().toLowerCase();
  if (q && !matchesSearch(p, q)) return false;
  if (f.kind && kindOf(p.currency) !== f.kind) return false;
  if (f.scope && (f.scope === 'business') !== !!p.business) return false;
  if (f.fee === 'none' && p.annual_fee) return false;
  if (f.fee === 'has' && !p.annual_fee) return false;
  if (f.cat && !(p.rules || []).some(r => r.category === f.cat)) return false;
  return true;
}

// ADD is a ghost button, not a solid one. Solid marks the single forward action
// in a view and there is never more than one on screen; a catalogue of twelve
// unowned cards put twelve of them on this pane, which made the list read as
// twelve competing calls to action rather than a list you pick from.
function blockCatalog() {
  const owned = new Set(instances.map(x => x.productId));
  const rest = productIds.filter(id => !owned.has(id));
  if (!rest.length) return `<div class="empty">Every card in the catalogue is already in your list.</div>`;
  const hits = rest.filter(matchesFilters);
  const pages = Math.max(1, Math.ceil(hits.length / PER_PAGE));
  // A filter that empties the last page would otherwise leave you on a page that
  // no longer exists, looking at nothing.
  if (page > pages) page = pages;
  const bar = blockFilters();
  if (!hits.length) {
    return `<div class="catalogue">${bar}
      <div class="list" style="--rows:${PER_PAGE}"><div class="empty">No card matches
        these filters. Clear them to see all ${rest.length}.</div></div>
      ${blockPager(0, 0, 1)}</div>`;
  }
  const shown = hits.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  // Same two-button row as YOUR CARDS: the body opens the dialog, the button on
  // the end adds the card. One button cannot do both, and a button inside a
  // button is invalid markup that never fires.
  // --rows is what stops the page jumping: the list reserves ten rows' height
  // whatever this page holds, so narrowing a search shortens the RESULTS and
  // not the document under the reader's cursor.
  return `<div class="catalogue">${bar}<div class="list" style="--rows:${PER_PAGE}">${shown.map(id => {
    const p = products[id];
    return `<div class="card-row">
      <button class="card-open" data-open="${esc(id)}">
        ${mark(p.issuer)}
        <span class="grow">
          <span class="row-name">${esc(p.name)}</span>
          <span class="row-meta">${esc(ISSUER[p.issuer] || p.issuer)} &middot; ${money(p.annual_fee)} &middot; ${esc(CURRENCY[p.currency] || p.currency)}</span>
        </span>
        <span class="chev" aria-hidden="true">&rsaquo;</span>
      </button>
      <button class="btn" data-add="${esc(id)}">ADD</button>
    </div>`;
  }).join('')}</div>${blockPager(shown.length, hits.length, pages)}</div>`;
}

// ---------- card detail ----------
const day = d => d
  ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  : '';

/** Every qualifier the ranker actually reads, for one earn rule. */
function ruleNotes(r) {
  const notes = [];
  if (r.portal_only) notes.push(`${r.portal || 'Issuer portal'} only`);
  if (r.cap) notes.push(`capped at $${r.cap.amount.toLocaleString()} per ${r.cap.period}, then ${r.cap.then_rate}x`);
  if (r.window && r.window.end) notes.push(`ends ${day(r.window.end)}`);
  if (r.requires_activation) notes.push('needs activation with the issuer');
  if (r.merchant_allowlist) notes.push(`only at ${r.merchant_allowlist.join(', ')}`);
  if (r.merchant_denylist) notes.push(`not at ${r.merchant_denylist.slice(0, 3).join(', ')}` +
    (r.merchant_denylist.length > 3 ? ` and ${r.merchant_denylist.length - 3} more` : ''));
  if (r.caveat) notes.push(r.caveat);
  return notes;
}

/** Rules that share a rate and every qualifier collapse into one cell, so a
    picker's six choices with one caveat print the caveat once. */
function ruleGroups(rules) {
  const groups = new Map();
  for (const r of rules) {
    const notes = ruleNotes(r);
    const key = r.rate + '|' + notes.join('|');
    const g = groups.get(key) || { rate: r.rate, notes, cats: [] };
    const label = catLabel(r.category);
    if (!g.cats.includes(label)) g.cats.push(label);
    groups.set(key, g);
  }
  return [...groups.values()];
}

function ruleCell(g) {
  return `<div class="rule">
    <span class="rule-rate">${g.rate}x</span>
    <span>
      <span class="rule-cat">${g.cats.map(esc).join(', ')}</span>
      ${g.notes.length ? `<div class="rule-note">${g.notes.map(esc).join(' &middot; ')}</div>` : ''}
    </span>
  </div>`;
}

function renderDetail() {
  const dlg = $('#detail');
  if (detail === null || !products[detail]) { if (dlg.open) dlg.close(); return; }
  const p = products[detail];
  // The catalogue opens this dialog too, so the card may not be in the wallet.
  // Everything above the footer reads the same either way -- what a card earns
  // is a fact about the card, not about owning it.
  const inst = instances.find(x => x.productId === detail) || null;
  const uc = p.user_config || {};
  const cfg = (inst && inst.config) || {};

  let controls = '';
  for (const g of uc.selections || []) {
    // A group's picks are just its own option ids, so the chosen ones are the
    // saved selections filtered to this group -- slot n takes the nth of them.
    const chosen = (cfg.selections || []).filter(id => g.options[id]);
    for (let slot = 0; slot < (g.max || 1); slot++) {
      controls += `<label>${esc(g.label)}${(g.max || 1) > 1 ? ` ${slot + 1}` : ''}
        <select data-id="${esc(p.id)}" data-k="cat">
          <option value="">choose...</option>
          ${Object.entries(g.options).map(([id, label]) =>
            `<option value="${esc(id)}" ${chosen[slot] === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}
        </select></label>`;
    }
  }
  if (uc.tier_multiplier) {
    controls += `<label>${esc(uc.tier_multiplier.label)}
      <select data-id="${esc(p.id)}" data-k="tier">
        ${Object.entries(uc.tier_multiplier.options).map(([k, v]) =>
          `<option value="${v}" ${(cfg.tier_multiplier || 1) === v ? 'selected' : ''}>${esc(k)}</option>`).join('')}
      </select></label>`;
  }

  const rules = (p.rules || []).slice().sort((a, b) => b.rate - a.rate);

  dlg.innerHTML = `
    <div class="dlg-head">
      ${mark(p.issuer)}
      <span class="dlg-title">${esc(p.name)}</span>
      <button class="icon-btn" data-close="1" aria-label="Close">&times;</button>
    </div>
    <div class="dlg-body">
      <div class="spec">
        <div><span>ISSUER</span><span>${esc(ISSUER[p.issuer] || p.issuer)}</span></div>
        <div><span>NETWORK</span><span>${esc(networkName(p.network))}</span></div>
        <div><span>ANNUAL FEE</span><span>${money(p.annual_fee)}</span></div>
        <div><span>EARNS</span><span>${esc(CURRENCY[p.currency] || p.currency)}</span></div>
        <div><span>BASE RATE</span><span>${p.base_rate}x</span></div>
        ${p.only_at ? `<div><span>WORKS AT</span><span>${esc(p.only_at.join(', '))} only</span></div>` : ''}
        <div><span>RATES VERIFIED</span><span>${esc(day(p.last_verified) || 'unverified')}</span></div>
      </div>
      ${inst && controls ? `<div class="cfg">${controls}</div>` : ''}
      ${!inst && controls ? `<p class="rule-note">Add this card to choose its categories.</p>` : ''}
      <div>
        <div class="sub-head" style="margin-top:0">Bonus categories</div>
        ${rules.length
          ? `<div class="rules">${ruleGroups(rules).map(ruleCell).join('')}</div>`
          : `<p class="rule-note" style="margin-top:12px">${p.only_at
              ? 'A store card: it earns its base rate at the store above and works nowhere else.'
              : 'No bonus categories. Everything earns the base rate.'}</p>`}
        ${p.caution ? `<p class="rule-note" style="margin-top:16px">${esc(p.caution)}</p>` : ''}
      </div>
    </div>
    <div class="dlg-foot">
      ${inst
        ? `<button class="btn" data-rm="${esc(p.id)}">REMOVE CARD</button>`
        : `<button class="btn" data-add="${esc(p.id)}">ADD CARD</button>`}
      <a class="btn solid" href="${esc(p.source_url)}" target="_blank" rel="noopener noreferrer">ISSUER TERMS &nearr;</a>
    </div>`;
  if (!dlg.open) dlg.showModal();
}

function blockTies() {
  const chosen = Object.entries(prefs.categoryDefaults).filter(([, id]) => products[id]);
  if (!chosen.length) {
    return `<div class="empty">Nothing saved. You'll be asked at the moment of purchase.</div>`;
  }
  return `<div class="list">
    ${chosen.map(([cat, id]) => `<div class="row">
      <div class="tie-cat">${esc(catLabel(cat))}</div>
      <div class="tie-use">always use <strong>${esc(products[id].name)}</strong></div>
      <button class="btn" data-cleardefault="${esc(cat)}">CLEAR</button>
    </div>`).join('')}
    ${chosen.length > 1 ? `<div class="bar"><button class="btn" data-clearalldefaults="1">CLEAR ALL</button></div>` : ''}
  </div>`;
}

function blockLead() {
  const lead = prefs.lead === 'multiplier' ? 'multiplier' : 'value';
  const opts = [
    { key: 'value', label: 'Value', desc: 'The percentage leads, e.g. 10.50% est. The multiplier sits beneath it.' },
    { key: 'multiplier', label: 'Multiplier', desc: 'What the card earns leads, e.g. 7x. The estimated value sits beneath it.' }
  ];
  return `<div class="grid modes">${opts.map(o => `
    <button class="mode${o.key === lead ? ' on' : ''}" data-lead="${o.key}" aria-pressed="${o.key === lead}">
      <div class="mode-state">${o.key === lead ? '&#9632; SELECTED' : '&#9633; SELECT'}</div>
      <div class="mode-label">${esc(o.label)}</div>
      <div class="mode-desc">${esc(o.desc)}</div>
    </button>`).join('')}</div>`;
}

function blockModes() {
  const modes = [
    { key: 'auto', label: 'On every shop', on: auto,
      desc: 'The default. The dock appears by itself on any store you visit, and still never sends anything anywhere.' },
    { key: 'ask', label: 'Only when you ask', on: !auto,
      desc: 'Nothing appears on a page unless you click the toolbar icon.' }
  ];
  // Wanted but not running: the switch says on and nothing happens. Say which
  // of the two reasons it is, rather than leaving the reader to guess between a
  // broken extension and a page that simply does not qualify.
  const broken = auto && !running ? `<div class="banner">${permitted
    ? 'Automatic mode is on, but no content script is registered, so the dock cannot appear by itself.'
    : 'Chrome is withholding site access for Caddy, so the dock cannot appear by itself. ' +
      'Right-click the toolbar icon, and under "This can read and change site data" choose "On all sites".'}
      <button class="btn" data-retryauto="1">TRY AGAIN</button>
    </div>` : '';
  return broken + `<div class="grid modes">${modes.map(m => `
    <button class="mode${m.on ? ' on' : ''}" data-auto="${m.key}" aria-pressed="${m.on}">
      <div class="mode-state">${m.on ? '&#9632; SELECTED' : '&#9633; SELECT'}</div>
      <div class="mode-label">${esc(m.label)}</div>
      <div class="mode-desc">${esc(m.desc)}</div>
    </button>`).join('')}</div>`;
}

function blockBlocked() {
  return `<div class="blocked">
    <textarea id="blocked" spellcheck="false" placeholder="paylocity.com&#10;mybank.com"></textarea>
    <div class="count">${blocked.length} DOMAIN${blocked.length === 1 ? '' : 'S'} &middot; SUBDOMAINS INCLUDED</div>
  </div>`;
}

function blockPoints() {
  const live = liveCurrencies();
  if (!live.length) return `<div class="empty">Add a card to set what its points are worth.</div>`;
  return `<div class="grid points">${live.map(k => `
    <div class="pt">
      <div class="pt-label">${esc(CURRENCY[k] || k)}</div>
      <div class="pt-in">
        <input type="number" step="0.05" min="0" inputmode="decimal"
               data-val="${esc(k)}" value="${valuations[k] ?? baseVals[k]}">
        <span>c/pt</span>
      </div>
    </div>`).join('')}</div>`;
}

function blockActivity() {
  const on = !!prefs.activityLog;
  const day = at => new Date(at)
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toUpperCase();
  // Rows already written stay readable after recording is turned off, or the
  // only way to see what was kept would be to turn it back on.
  const rows = activity.length
    ? activity.map(r => `<div class="act-row">
        <span class="act-date">${esc(day(r.at))}</span>
        <span class="act-merchant">${esc(r.host)}</span>
        <span class="act-cat">${esc(catLabel(r.category))}</span>
        <span>${esc(r.card)}</span>
        <span class="act-rate">${r.value.toFixed(2)}%${r.est ? ' est.' : ''}</span>
      </div>`).join('')
    : `<div class="empty">${on
        ? 'Nothing yet. Visit a shop and the recommendation lands here.'
        : 'Recording is off, so nothing is being written here.'}</div>`;
  return `<div class="act">
    <div class="act-row act-head">
      <span>Date</span><span>Merchant</span><span>Category</span><span>Recommended</span>
      <span class="act-rate">Rate</span>
    </div>
    ${rows}
    <div class="act-foot">
      <p>${on
        ? 'Recording. Domain, category and card only -- no amounts, no card numbers -- stored on this computer and never sent anywhere.'
        : 'This is the only record Caddy keeps of where you have been, so it stays off until you ask for it. Turned on, it holds the last thirty recommendations on this computer and sends nothing anywhere.'}</p>
      <div class="acts">
        ${activity.length ? `<button class="btn" data-clearactivity="1">CLEAR HISTORY</button>` : ''}
        <button class="btn${on ? '' : ' solid'}" data-activitylog="${on ? 'off' : 'on'}">${
          on ? 'STOP RECORDING' : 'START RECORDING'}</button>
      </div>
    </div>
  </div>`;
}

function blockAbout() {
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `<div class="about">
    <p class="lede">Caddy reads the page you are on, in your browser, to tell a shop from a checkout. Nothing leaves your browser.</p>
    <div class="spec">
      <div><span>VERSION</span><span>${esc(VERSION)}</span></div>
      <div><span>RATE DATA</span><span>${esc(ratesDate() || 'unknown')}</span></div>
      <div><span>STORAGE</span><span>${kb} KB LOCAL</span></div>
    </div>
    <!-- Both ghost. They are a matched pair of utilities, and solid on one of
         them implied a hierarchy that is not there. It also put a second solid
         button on this pane beside START RECORDING, which is the one forward
         action the Data pane actually has. -->
    <div class="about-acts">
      <button class="btn" data-export="1">EXPORT SETTINGS</button>
      <button class="btn" data-import="1">IMPORT</button>
    </div>
  </div>`;
}

const head = (title, hint) =>
  `<div class="sub-head">${title}</div>` + (hint ? `<p class="hint">${hint}</p>` : '');

const PANES = {
  cards: () =>
    (dropped ? `<div class="banner">Removed ${dropped} saved card${dropped > 1 ? 's' : ''} that no longer exist.</div>` : '') +
    head('Your cards') + blockOwned() +
    head('Add a card', 'Rates come from published issuer terms, each with a source and a date.') +
    blockCatalog(),

  ranking: () =>
    head('Tie-breakers', 'Saved by "Always use" at checkout. Clear one to be asked again.') + blockTies() +
    head('Point values', 'Cents per point. These are opinions, and they decide which card wins.') + blockPoints() +
    head('Lead with', 'What the big number shows. Ranking always sorts by estimated value.') + blockLead(),

  runs: () =>
    head('Mode') + blockModes() +
    head('Blocked sites', 'One domain per line. On these, Caddy never even reads the page.') +
    blockBlocked(),

  data: () =>
    head('Activity', 'Off until you turn it on. Then: the last thirty recommendations, so you can check its judgement.') +
    blockActivity() +
    head('About') + blockAbout()
};

// ---------- render ----------
function render() {
  // No attribute at all in system mode, which is what lets the stylesheet follow
  // the browser -- and keep following it if the browser changes while this page
  // is open. Stamping a resolved colour here would freeze it at load.
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  $('#brandsub').textContent = `v${VERSION}`;

  $('#nav').innerHTML = SECTIONS.map(x => `
    <button data-section="${x.id}" ${x.id === section ? 'aria-current="page"' : ''}>
      <span class="label">${esc(x.label)}</span>
    </button>`).join('');

  document.querySelectorAll('.theme button').forEach(b =>
    b.classList.toggle('on', b.dataset.theme === theme));

  const s = sec();
  $('#crumb').textContent = 'SETTINGS';
  $('#title').textContent = s.title;
  $('#blurb').textContent = s.blurb;

  const unverified = ownedProducts().filter(p => !p.verified).length;
  const date = ratesDate();
  $('#headmeta').innerHTML =
    `<div${auto && !running ? ' class="warn"' : ''}>MODE: ${
      auto ? (running ? 'ON EVERY SHOP' : 'NOT RUNNING') : 'ONLY WHEN YOU ASK'}</div>` +
    (date ? `<div>RATES ${esc(date)}</div>` : '') +
    (unverified ? `<div class="warn">${unverified} CARD${unverified > 1 ? 'S' : ''} UNVERIFIED</div>` : '');

  $('#pane').innerHTML = PANES[s.id]();

  renderDetail();

  // Only repaint the textarea when it is not being edited, or typing would
  // fight the re-render.
  const box = $('#blocked');
  if (box && document.activeElement !== box) box.value = blocked.join('\n');
}

// ---------- events ----------
// A stored preference, not a permission request: <all_urls> is declared in the
// manifest, so the browser has already granted it and there is nothing to
// prompt for. Turning this off unregisters the content scripts, which is what
// actually stops the dock appearing.
async function setAuto(on) {
  prefs.autoMode = on;
  await chrome.storage.local.set({ prefs });
  // Trust what is RUNNING, never the button. A preference that is on while no
  // content script is registered leaves the tile reading "selected" while
  // nothing actually happens, which is exactly the failure these flags exist
  // to make visible.
  await readAuto();
  render();
}

async function exportSettings() {
  const data = await chrome.storage.local.get(['instances', 'valuations', 'prefs', 'blocked']);
  const blob = new Blob(
    [JSON.stringify({ app: 'caddy', version: VERSION, exported: new Date().toISOString(), ...data }, null, 2)],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `caddy-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// A file the user picked is the one place here that is a real trust boundary, so
// this is the one place that validates. Anything unrecognised is dropped rather
// than written, or a hand-edited export would put shapes into storage that the
// ranker then has to defend against on every page.
async function importSettings(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { data = null; }
  if (!data || typeof data !== 'object') { flash('That file is not valid JSON.'); return; }

  const nextInstances = Array.isArray(data.instances)
    ? data.instances
        .filter(x => x && typeof x.productId === 'string' && products[x.productId])
        .map(x => ({ productId: x.productId, config: (x.config && typeof x.config === 'object') ? x.config : {} }))
    : null;
  const nextVals = (data.valuations && typeof data.valuations === 'object')
    ? Object.fromEntries(Object.entries(data.valuations)
        .filter(([k, v]) => baseVals[k] !== undefined && Number.isFinite(v) && v >= 0))
    : null;
  const nextBlocked = Array.isArray(data.blocked)
    ? data.blocked.filter(x => typeof x === 'string').map(x => x.trim()).filter(Boolean)
    : null;
  const srcDefaults = data.prefs && typeof data.prefs === 'object' ? data.prefs.categoryDefaults : null;
  const nextDefaults = (srcDefaults && typeof srcDefaults === 'object')
    ? Object.fromEntries(Object.entries(srcDefaults).filter(([, id]) => products[id]))
    : null;

  if (!nextInstances && !nextVals && !nextBlocked && !nextDefaults) {
    flash('Nothing in that file looked like Caddy settings.');
    return;
  }
  if (nextInstances) { instances = nextInstances; await commit('instances', { redraw: false }); }
  if (nextVals)      { valuations = nextVals;     await commit('valuations', { redraw: false }); }
  if (nextBlocked)   { blocked = nextBlocked;     await commit('blocked', { redraw: false }); }
  if (nextDefaults)  { prefs.categoryDefaults = nextDefaults; await commit('prefs', { redraw: false }); }
  render();
  flash(`Imported ${instances.length} card${instances.length === 1 ? '' : 's'} and their settings.`);
}

document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  const d = t.dataset;
  if (d.section) { section = d.section; render(); return; }
  if (d.open) { detail = d.open; renderDetail(); return; }
  if (d.close) { $('#detail').close(); return; }
  if (d.theme)   { theme = d.theme; commit('theme'); return; }
  if (d.add)  { instances.push({ productId: d.add, config: {} }); commit('instances'); }
  // Closing first: the dialog is showing a card that is about to stop existing,
  // and commit() re-renders from storage.
  if (d.rm)   {
    $('#detail').close();
    instances.splice(instances.findIndex(x => x.productId === d.rm), 1);
    commit('instances');
  }
  if (d.clearfilters) { f = { q: '', kind: '', scope: '', fee: '', cat: '' }; page = 1; render(); return; }
  if (d.page) { page += d.page === 'next' ? 1 : -1; render(); return; }
  if (d.cleardefault) { delete prefs.categoryDefaults[d.cleardefault]; commit('prefs'); }
  if (d.clearalldefaults) { prefs.categoryDefaults = {}; commit('prefs'); }
  if (d.clearactivity) { activity = []; commit('activity'); }
  if (d.activitylog) { prefs.activityLog = d.activitylog === 'on'; commit('prefs'); }
  if (d.lead) { prefs.lead = d.lead; commit('prefs'); }
  if (d.auto) { setAuto(d.auto === 'auto'); }
  if (d.retryauto) {
    readAuto().then(st => {
      if (!running) {
        flash('Still not registered' + (st && st.error ? `: ${st.error}` : '.') +
              ' Reload Caddy at chrome://extensions and open this page again.', true);
      }
      render();
    });
    return;
  }
  if (d.export) { exportSettings(); }
  if (d.import) { $('#importfile').click(); }
});

$('#detail').addEventListener('close', () => { detail = null; });
// A native dialog's backdrop is part of the dialog element, so a click that
// lands on the element itself rather than on its content is a backdrop click.
$('#detail').addEventListener('click', e => { if (e.target.id === 'detail') e.target.close(); });

// Filters are view state, not settings: they redraw the pane and write nothing.
document.addEventListener('input', e => {
  if (e.target.dataset.f !== 'q') return;
  f.q = e.target.value;
  page = 1;
  const at = e.target.selectionStart;
  render();
  // render() replaced the field, so put the cursor back where it was typed.
  const box = document.querySelector('[data-f="q"]');
  if (box) { box.focus(); box.setSelectionRange(at, at); }
});

document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (d.f && d.f !== 'q') { f[d.f] = t.value; page = 1; render(); return; }
  if (d.k === 'cat') {
    const inst = instances.find(x => x.productId === d.id);
    if (!inst) return;
    inst.config = inst.config || {};
    const picks = [...t.closest('.cfg').querySelectorAll('select[data-k="cat"]')]
      .map(x => x.value).filter(Boolean);
    inst.config.selections = [...new Set(picks)];
    commit('instances');
  }
  if (d.k === 'tier') {
    const inst = instances.find(x => x.productId === d.id);
    if (!inst) return;
    inst.config = inst.config || {};
    inst.config.tier_multiplier = parseFloat(t.value);
    commit('instances');
  }
  if (t.id === 'blocked') {
    blocked = t.value.split('\n').map(x => x.trim()).filter(Boolean);
    commit('blocked', { redraw: false });
  }
  if (d.val) {
    const v = parseFloat(t.value);
    if (Number.isFinite(v) && v >= 0) valuations[d.val] = v;
    else delete valuations[d.val];
    commit('valuations');
  }
  if (t.id === 'importfile' && t.files[0]) {
    importSettings(t.files[0]);
    t.value = '';
  }
});

await load();
render();
