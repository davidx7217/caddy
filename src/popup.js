import { DEFAULT_FONT, fontFaceCss, fontStack } from './engine.js';

const $ = s => document.querySelector(s);

// One font across every surface, so the extension looks like one thing.
applyFont(DEFAULT_FONT);

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
const money = v => `${v.toFixed(2)}%`;
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

$('#opts').addEventListener('click', () => chrome.runtime.openOptionsPage());

(async () => {
  // tabs.query works without the "tabs" permission; only url/title are gated,
  // and we never need them -- the content script already told the worker.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Opening this popup IS an action invocation, which grants activeTab for this
  // tab -- so tab.url is readable here with no host permission at all. Before
  // that grant existed this was always blank, and every site with no content
  // script read as "no merchant detected".
  let host = '';
  try { host = tab && tab.url ? new URL(tab.url).hostname : ''; } catch (e) { /* chrome:// and friends */ }

  const cached = async () =>
    tab ? (await chrome.storage.session.get(`tab:${tab.id}`))[`tab:${tab.id}`] : null;

  let res = await cached();

  // Nothing cached means no content script ran here: automatic mode is off, or
  // this page loaded before it was granted. activeTab lets us inject for this
  // visit only, which both mounts the dock and produces a real signal-based
  // answer instead of a table lookup.
  if (!res && tab) {
    const done = await chrome.runtime.sendMessage({ type: 'INJECT', tabId: tab.id });
    if (done && done.ok) {
      for (let i = 0; i < 8 && !res; i++) {
        await new Promise(r => setTimeout(r, 100));
        res = await cached();
      }
    }
    // Injection is refused on chrome:// pages and the Web Store, and a page can
    // simply be slow. The merchant table alone still answers for a known domain.
    if (!res) res = await chrome.runtime.sendMessage({ type: 'RECOMMEND', hostname: host });
  }

  if (!res || !res.all.length) {
    $('#sub').textContent = 'No cards added yet.';
    return;
  }

  const SOURCE = {
    merchant: c => `verified merchant · confidence: ${c}`,
    inferred: () => 'category guessed from this page\u2019s own markup',
    default:  () => 'no category detected · everything-else ranking'
  };
  $('#title').textContent = (res.hostname || '').replace(/^www\./, '') || 'No merchant detected';
  const describe = SOURCE[res.categorySource] || SOURCE.default;
  $('#sub').textContent = `${(res.category || 'other').replace(/_/g, ' ')} \u00b7 ` +
    describe(res.merchant && res.merchant.confidence);

  const unverified = res.all.some(c => c.caveats.includes('Unverified data'));

  const WHY = {
    clear_winner:     'clear winner',
    unresolved:       'tied \u2014 the overlay asks you to pick',
    category_default: 'your saved choice for this category',
    priority:         'resolved by your pinned card order',
    no_cards:         'no cards added'
  };
  $('#why').textContent = `${res.all.length} card${res.all.length === 1 ? '' : 's'} \u00b7 ` +
    (WHY[res.resolvedBy] || res.resolvedBy) +
    (res.tied.length > 1 ? ` (${res.tied.length} within ${Math.round((res.tieBand ?? 0.10) * 100)}%)` : '');

  $('#list').innerHTML =
    (unverified ? `<div class="banner" style="margin:10px 0">Seed data is unverified. Check rates against your issuer before trusting these numbers.</div>` : '') +
    // Separate from the unverified banner: that one means the data was never
    // checked, this one means it was checked and has since run out.
    (res.stale ? `<div class="banner" style="margin:10px 0">Some rates below are expired or overdue for re-verification. See the notes on each card.</div>` : '') +
    `<h2>Ranked</h2>` +
    res.all.map((c, i) => `
      <div class="row ${i === 0 ? 'win' : ''}">
        <span class="rank">${i + 1}</span>
        <span class="grow">
          <div class="name">${esc(c.name)}</div>
          <div class="sub">${esc(c.reason)}</div>
          ${c.caveats.filter(x => x !== 'Unverified data')
             .map(x => `<div class="cav">! ${esc(x)}</div>`).join('')}
        </span>
        <span class="val">${money(c.value)}</span>
      </div>`).join('');

  if (res.notes.length) {
    $('#notes').innerHTML = `<h2>Other routes</h2>` +
      res.notes.map(n => `<div class="sub">${esc(n.text)}</div>`).join('');
  }
})();
