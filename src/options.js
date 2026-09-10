import { pruneInstances, fontFaceCss, fontStack } from './engine.js';
import { CURRENCY, mark, money } from './issuers.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SECTIONS = [
  { id: 'cards',   num: '01', label: 'Cards',         title: 'Cards',
    blurb: 'Every card Caddy ranks, with the fees, categories and caps it reasons over.' },
  { id: 'ranking', num: '02', label: 'Ranking',       title: 'Ranking',
    blurb: 'The two things you can change that decide which card wins a close call.' },
  { id: 'runs',    num: '03', label: 'Where it runs', title: 'Where it runs',
    blurb: 'Off by default, which is why installing asks for nothing.' },
  { id: 'data',    num: '04', label: 'Data',          title: 'Data',
    blurb: 'What Caddy keeps, where it keeps it, and how to take it with you.' }
];

const j = n => fetch(chrome.runtime.getURL(`data/${n}.json`)).then(r => r.json());
const [products, baseVals, categories] = await Promise.all([j('cards'), j('valuations'), j('categories')]);
const productIds = Object.keys(products).filter(k => !k.startsWith('_'));
const VERSION = chrome.runtime.getManifest().version;

let instances = [], valuations = {}, prefs = {}, blocked = [], activity = [], dropped = 0;
let auto = false, bytes = 0;
let section = 'cards';
let detail = null;   // index into instances, or null when the dialog is shut
let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

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
  if (s.theme === 'light' || s.theme === 'dark') theme = s.theme;
  auto = await chrome.permissions.contains({ origins: ['<all_urls>'] });
  bytes = await chrome.storage.local.getBytesInUse(null);
  applyFont();
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
    await chrome.storage.local.set(
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

function counts() {
  return {
    cards: instances.length,
    ranking: Object.entries(prefs.categoryDefaults).filter(([, id]) => products[id]).length,
    runs: blocked.length,
    data: activity.length
  };
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
  return `<div class="list">${instances.map((inst, i) => {
    const p = products[inst.productId];
    return `<div class="card-row">
      <button class="card-open" data-open="${i}">
        ${mark(p.issuer)}
        <span class="grow">
          <span class="row-name">${esc(p.name)}</span>
          <span class="row-meta">${esc(p.network)} &middot; ${money(p.annual_fee)} &middot; ${esc(CURRENCY[p.currency] || p.currency)}</span>
        </span>
        ${p.caution ? '<span class="flag" title="Has a caution">!</span>' : ''}
        <span class="chev" aria-hidden="true">&rsaquo;</span>
      </button>
      <button class="btn" data-rm="${i}">REMOVE</button>
    </div>`;
  }).join('')}</div>`;
}

// ADD is a ghost button, not a solid one. Solid marks the single forward action
// in a view and there is never more than one on screen; a catalogue of twelve
// unowned cards put twelve of them on this pane, which made the list read as
// twelve competing calls to action rather than a list you pick from.
function blockCatalog() {
  const owned = new Set(instances.map(x => x.productId));
  const rest = productIds.filter(id => !owned.has(id));
  if (!rest.length) return `<div class="empty">Every card in the catalogue is already in your list.</div>`;
  return `<div class="list">${rest.map(id => {
    const p = products[id];
    return `<div class="row">
      ${mark(p.issuer)}
      <div class="grow">
        <div class="row-name">${esc(p.name)}</div>
        <div class="row-meta">${esc(p.network)} &middot; ${money(p.annual_fee)}</div>
      </div>
      <button class="btn" data-add="${esc(id)}">ADD</button>
    </div>`;
  }).join('')}</div>`;
}

// ---------- card detail ----------
const day = d => d
  ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  : '';

/** One earn rule, with every qualifier the ranker actually reads. */
function ruleLine(r) {
  const notes = [];
  if (r.portal_only) notes.push(`${r.portal || 'Issuer portal'} only`);
  if (r.cap) notes.push(`capped at $${r.cap.amount.toLocaleString()} per ${r.cap.period}, then ${r.cap.then_rate}x`);
  if (r.window && r.window.end) notes.push(`ends ${day(r.window.end)}`);
  if (r.requires_activation) notes.push('needs activation with the issuer');
  if (r.merchant_allowlist) notes.push(`only at ${r.merchant_allowlist.join(', ')}`);
  if (r.merchant_denylist) notes.push(`not at ${r.merchant_denylist.slice(0, 3).join(', ')}` +
    (r.merchant_denylist.length > 3 ? ` and ${r.merchant_denylist.length - 3} more` : ''));
  if (r.caveat) notes.push(r.caveat);
  return `<div class="rule">
    <span class="rule-rate">${r.rate}x</span>
    <span>
      <span class="rule-cat">${esc(catLabel(r.category))}</span>
      ${notes.length ? `<div class="rule-note">${notes.map(esc).join(' &middot; ')}</div>` : ''}
    </span>
  </div>`;
}

function renderDetail() {
  const dlg = $('#detail');
  if (detail === null || !instances[detail]) { if (dlg.open) dlg.close(); return; }
  const i = detail;
  const inst = instances[i];
  const p = products[inst.productId];
  const uc = p.user_config || {};
  const cfg = inst.config || {};

  let controls = '';
  if (uc.selection) {
    controls += `<label>${esc(uc.selection.label)}
      <select data-i="${i}" data-k="cat">
        <option value="">choose...</option>
        ${Object.entries(uc.selection.options).map(([id, label]) =>
          `<option value="${esc(id)}" ${(cfg.selections || []).includes(id) ? 'selected' : ''}>${esc(label)}</option>`).join('')}
      </select></label>`;
  }
  if (uc.tier_multiplier) {
    controls += `<label>${esc(uc.tier_multiplier.label)}
      <select data-i="${i}" data-k="tier">
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
      ${p.caution ? `<div class="note">${esc(p.caution)}</div>` : ''}
      <div class="spec">
        <div><span>ISSUER</span><span>${esc(p.issuer)}</span></div>
        <div><span>NETWORK</span><span>${esc(p.network)}</span></div>
        <div><span>ANNUAL FEE</span><span>${money(p.annual_fee)}</span></div>
        <div><span>EARNS</span><span>${esc(CURRENCY[p.currency] || p.currency)}</span></div>
        <div><span>BASE RATE</span><span>${p.base_rate}x</span></div>
        <div><span>RATES VERIFIED</span><span>${esc(day(p.last_verified) || 'unverified')}</span></div>
      </div>
      ${controls ? `<div class="cfg">${controls}</div>` : ''}
      <div>
        <div class="sub-head" style="margin-top:0">Bonus categories</div>
        ${rules.length
          ? `<div class="rules">${rules.map(ruleLine).join('')}</div>`
          : `<p class="rule-note" style="margin-top:12px">No bonus categories. Everything earns the base rate.</p>`}
      </div>
    </div>
    <div class="dlg-foot">
      <button class="btn" data-rm="${i}">REMOVE CARD</button>
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

function blockModes() {
  const modes = [
    { key: 'ask', label: 'Only when you ask', on: !auto,
      desc: 'Nothing runs until you click the toolbar icon on a page.' },
    { key: 'auto', label: 'On every shop', on: auto,
      desc: 'The dock appears by itself on any store you visit. It still never sends anything anywhere.' }
  ];
  return `<div class="grid modes">${modes.map(m => `
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
        <span class="act-rate">${r.value.toFixed(2)}%</span>
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
    <p class="lede">Caddy reads the domain of the page you are on. Nothing else leaves your browser.</p>
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
    head('Point values', 'Cents per point. These are opinions, and they decide which card wins.') + blockPoints(),

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
  document.documentElement.dataset.theme = theme;
  $('#brandsub').textContent = `WHICH-CARD / v${VERSION}`;

  const n = counts();
  $('#nav').innerHTML = SECTIONS.map(x => `
    <button data-section="${x.id}" ${x.id === section ? 'aria-current="page"' : ''}>
      <span class="num">${x.num}</span>
      <span class="label">${esc(x.label)}</span>
      <span class="count">${n[x.id]}</span>
    </button>`).join('');

  document.querySelectorAll('.theme button').forEach(b =>
    b.classList.toggle('on', b.dataset.theme === theme));

  const s = sec();
  $('#crumb').textContent = `SETTINGS / ${s.num}`;
  $('#title').textContent = s.title;
  $('#blurb').textContent = s.blurb;

  const unverified = ownedProducts().filter(p => !p.verified).length;
  const date = ratesDate();
  $('#headmeta').innerHTML =
    `<div>MODE: ${auto ? 'ALWAYS ON' : 'ON REQUEST'}</div>` +
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
// chrome.permissions.request must run inside a user gesture, so this lives in the
// click handler and is never called from render() or load().
async function setAuto(on) {
  if (on) await chrome.permissions.request({ origins: ['<all_urls>'] });
  else await chrome.permissions.remove({ origins: ['<all_urls>'] });
  // Trust the permission, never the button. A user can decline the prompt, and
  // rendering from what we asked for rather than from what we got would leave the
  // tile reading "selected" while nothing actually runs.
  auto = await chrome.permissions.contains({ origins: ['<all_urls>'] });
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
  if (d.open) { detail = +d.open; renderDetail(); return; }
  if (d.close) { $('#detail').close(); return; }
  if (d.theme)   { theme = d.theme; commit('theme'); return; }
  if (d.add)  { instances.push({ productId: d.add, config: {} }); commit('instances'); }
  // Closing first: the dialog is showing a card that is about to stop existing,
  // and commit() re-renders from storage.
  if (d.rm)   { $('#detail').close(); instances.splice(+d.rm, 1); commit('instances'); }
  if (d.cleardefault) { delete prefs.categoryDefaults[d.cleardefault]; commit('prefs'); }
  if (d.clearalldefaults) { prefs.categoryDefaults = {}; commit('prefs'); }
  if (d.clearactivity) { activity = []; commit('activity'); }
  if (d.activitylog) { prefs.activityLog = d.activitylog === 'on'; commit('prefs'); }
  if (d.auto) { setAuto(d.auto === 'auto'); }
  if (d.export) { exportSettings(); }
  if (d.import) { $('#importfile').click(); }
});

$('#detail').addEventListener('close', () => { detail = null; });
// A native dialog's backdrop is part of the dialog element, so a click that
// lands on the element itself rather than on its content is a backdrop click.
$('#detail').addEventListener('click', e => { if (e.target.id === 'detail') e.target.close(); });

document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (d.k === 'cat') {
    const inst = instances[+d.i];
    inst.config = inst.config || {};
    inst.config.selections = t.value ? [t.value] : [];
    commit('instances');
  }
  if (d.k === 'tier') {
    const inst = instances[+d.i];
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
