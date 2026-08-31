import { pruneInstances, isPinned, DEFAULT_FONT, fontFaceCss, fontStack } from './engine.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CURRENCY = {
  cash: 'Cash back', ur: 'Chase points', mr: 'Amex points',
  aeroplan: 'Aeroplan points', c1: 'Capital One miles', citi: 'Citi points',
  disco: 'Discover cash back'
};
const money = c => c ? `$${c}/yr` : 'no annual fee';
const day = d => d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined,
  { day: 'numeric', month: 'short', year: 'numeric' }) : null;

const j = n => fetch(chrome.runtime.getURL(`data/${n}.json`)).then(r => r.json());
const [products, baseVals] = await Promise.all([j('cards'), j('valuations')]);
const productIds = Object.keys(products).filter(k => !k.startsWith('_'));

let instances = [], valuations = {}, prefs = {}, dropped = 0;

async function load() {
  const s = await chrome.storage.local.get(['instances', 'valuations', 'prefs']);
  const raw = s.instances || [];
  instances = pruneInstances(raw, products);
  dropped = raw.length - instances.length;
  valuations = s.valuations || {};
  prefs = s.prefs || {};
  prefs.categoryDefaults = prefs.categoryDefaults || {};
  applyFont(DEFAULT_FONT);
}

function applyFont(key) {
  let tag = document.getElementById('font-faces');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'font-faces';
    document.head.appendChild(tag);
  }
  tag.textContent = fontFaceCss(key, chrome.runtime.getURL);
  document.documentElement.style.setProperty('--font', fontStack(key));
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
  document.querySelector('.page').insertAdjacentHTML('afterbegin',
    '<div class="banner">This page is out of date because the extension was reloaded. ' +
    'Nothing here can be saved. Close this tab and open Options again.</div>');
}

// The overlay writes prefs too (Always use), so this page must never assume its
// copy is current.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || saving) return;
  if (changes.prefs || changes.instances || changes.valuations) { await load(); render(); }
});
let saving = false;

/**
 * Write ONE key, then re-read and render from what storage actually holds.
 *
 * Two rules, both learned the hard way. Write only the key you changed: a
 * blanket three-key write clobbers whatever another surface wrote in between.
 * And never render from memory after a write -- doing that is how a cleared tie
 * choice looked cleared, was never saved, and came back on the next page.
 */
async function commit(key, { redraw = true } = {}) {
  if (dead) return;
  if (!contextAlive()) { die(); return; }
  saving = true;
  try {
    await chrome.storage.local.set({ [key]: { instances, valuations, prefs }[key] });
  } catch (e) {
    die();
    return;
  } finally {
    saving = false;
  }
  await load();
  if (redraw) render();
}

// ---------- render ----------
function freshness() {
  const owned = instances.map(i => products[i.productId]).filter(Boolean);
  const unverified = owned.filter(p => !p.verified);
  if (unverified.length) {
    return `<span class="chip warn">${unverified.length} card${unverified.length > 1 ? 's' : ''} unverified</span>`;
  }
  const oldest = owned.map(p => p.last_verified).filter(Boolean).sort()[0];
  return oldest ? `<span class="chip">rates verified ${esc(day(oldest))}</span>` : '';
}

function cardRow(inst, i) {
  const p = products[inst.productId];
  const uc = p.user_config || {};
  const cfg = inst.config || {};
  const pinned = isPinned(inst);
  let controls = '';

  if (uc.selection) {
    controls += `<label>${esc(uc.selection.label)}
      <select data-i="${i}" data-k="cat">
        <option value="">choose…</option>
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

  return `<div class="card-row">
    <span class="num">${i + 1}</span>
    <span class="body">
      <div class="title">${esc(p.name)}${pinned ? '<span class="tag pinned">pinned</span>' : ''}</div>
      <div class="meta">${esc(p.issuer)} &middot; ${money(p.annual_fee)} &middot; ${esc(CURRENCY[p.currency] || p.currency)}</div>
      ${p.caution ? `<div class="caution">${esc(p.caution)}</div>` : ''}
      ${controls ? `<div class="cfg">${controls}</div>` : ''}
    </span>
    <span class="acts">
      ${pinned ? `<button data-unpin="${i}">Unpin</button>` : ''}
      <button class="icon-btn" data-up="${i}" ${i === 0 ? 'disabled' : ''} title="Move up">&uarr;</button>
      <button class="icon-btn" data-down="${i}" ${i === instances.length - 1 ? 'disabled' : ''} title="Move down">&darr;</button>
      <button data-rm="${i}">Remove</button>
    </span>
  </div>`;
}

function render() {
  $('#freshness').innerHTML = freshness();

  $('#owned').innerHTML =
    (dropped ? `<div class="banner" style="margin-bottom:10px">Removed ${dropped} saved card${dropped > 1 ? 's' : ''} that no longer exist.</div>` : '') +
    (instances.length ? instances.map(cardRow).join('') : `<p class="empty">No cards yet. Add some below.</p>`) +
    (instances.some(isPinned)
      ? `<div class="bar"><span class="sub">Pinned cards settle ties silently.</span>
           <button data-unpinall="1">Unpin all</button></div>` : '');

  const owned = new Set(instances.map(x => x.productId));
  const rest = productIds.filter(id => !owned.has(id));
  $('#available').innerHTML = rest.length ? rest.map(id => `
    <div class="card-row">
      <span class="body">
        <div class="title">${esc(products[id].name)}</div>
        <div class="meta">${esc(products[id].issuer)} &middot; ${money(products[id].annual_fee)}</div>
      </span>
      <span class="acts"><button data-add="${esc(id)}">Add</button></span>
    </div>`).join('') : `<p class="empty">Every card in the catalogue is already in your list.</p>`;

  const chosen = Object.entries(prefs.categoryDefaults).filter(([, id]) => products[id]);
  $('#defaults').innerHTML = chosen.length
    ? chosen.map(([cat, id]) => `
        <div class="card-row">
          <span class="body">
            <div class="title">${esc(cat.replace(/_/g, ' '))}</div>
            <div class="meta">always use ${esc(products[id].name)}</div>
          </span>
          <span class="acts"><button data-cleardefault="${esc(cat)}">Clear</button></span>
        </div>`).join('') +
      (chosen.length > 1
        ? `<div class="bar"><span></span><button data-clearalldefaults="1">Clear all</button></div>` : '')
    : `<p class="empty">Nothing saved. You'll be asked at the moment of purchase.</p>`;

  const live = new Set(instances.map(i => products[i.productId].currency));
  $('#vals').className = 'vals';
  $('#vals').innerHTML = Object.keys(baseVals)
    .filter(k => !k.startsWith('_') && live.has(k))
    .map(k => `<div><span>${esc(CURRENCY[k] || k)}</span>
      <input type="number" step="0.05" min="0" data-val="${esc(k)}" value="${valuations[k] ?? baseVals[k]}"></div>`)
    .join('') || `<p class="empty">Add a card to set what its points are worth.</p>`;
}

// ---------- events ----------
function swap(a, b) {
  [instances[a], instances[b]] = [instances[b], instances[a]];
  instances[a].pinned = true;
  instances[b].pinned = true;
  commit('instances');
}

document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  const d = t.dataset;
  if (d.add)  { instances.push({ productId: d.add, config: {} }); commit('instances'); }
  if (d.rm)   { instances.splice(+d.rm, 1); commit('instances'); }
  if (d.up)   { swap(+d.up, +d.up - 1); }
  if (d.down) { swap(+d.down, +d.down + 1); }
  if (d.unpin) { const i = instances[+d.unpin]; delete i.pinned; delete i.priority; commit('instances'); }
  if (d.unpinall) { instances.forEach(i => { delete i.pinned; delete i.priority; }); commit('instances'); }
  if (d.cleardefault) { delete prefs.categoryDefaults[d.cleardefault]; commit('prefs'); }
  if (d.clearalldefaults) { prefs.categoryDefaults = {}; commit('prefs'); }
});

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
  if (d.val) {
    const v = parseFloat(t.value);
    if (Number.isFinite(v) && v >= 0) valuations[d.val] = v;
    else delete valuations[d.val];
    commit('valuations');
  }
});

await load();
render();
