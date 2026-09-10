import { fontFaceCss, fontStack } from './engine.js';

const $ = s => document.querySelector(s);

// One font AND one theme across every surface, so the extension looks like one
// thing. Options owns the theme choice; unset means follow the OS, which is
// what the stylesheet does on its own.
const { theme } = await chrome.storage.local.get('theme');
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
applyFont();

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
const money = v => `${v.toFixed(2)}%`;
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

$('#opts').addEventListener('click', () => chrome.runtime.openOptionsPage());

(async () => {
  // tabs.query works without the "tabs" permission; only url/title are gated,
  // and opening this popup IS an action invocation, so activeTab covers them.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // ---------- hand off to the in-page overlay, and get out of the way ----------
  //
  // This popup is a FALLBACK, not the main surface. A browser popup is a native
  // window Chrome draws: its square corners, border and shadow are outside any
  // stylesheet this extension owns, and there is no API to change them. The
  // overlay is ours end to end, so wherever it can run, it wins.
  //
  // Chrome refuses injection on its own pages, the Web Store, the PDF viewer,
  // view-source:, other extensions' pages, and file:// without the file-access
  // grant. On those -- and only those -- this popup stays open and renders the
  // ranking itself, which is why it still exists at all.
  //
  // Doing this from the popup rather than from chrome.action.onClicked is what
  // avoids the "tabs" permission: knowing in advance which tabs are injectable
  // means reading every tab's URL, and that prompt says "read your browsing
  // history" at install. This costs a brief flash of an empty popup instead.
  if (tab && tab.id != null) {
    const { instances = [] } = await chrome.storage.local.get('instances');
    // Nothing to recommend without a wallet, so send them where they build one.
    if (!instances.length) { chrome.runtime.openOptionsPage(); window.close(); return; }

    const done = await chrome.runtime.sendMessage({ type: 'INJECT', tabId: tab.id });
    if (done && done.ok) { window.close(); return; }
  }

  // Only http(s) has a hostname worth showing. On chrome:// and on the
  // extension's own pages, new URL().hostname is the extension ID, which is how
  // this popup once ended up titled with a block of random letters.
  let host = '';
  try {
    const u = tab && tab.url ? new URL(tab.url) : null;
    if (u && (u.protocol === 'http:' || u.protocol === 'https:')) host = u.hostname;
  } catch (e) { /* opaque URLs */ }

  const cached = async () =>
    tab ? (await chrome.storage.session.get(`tab:${tab.id}`))[`tab:${tab.id}`] : null;

  // Reaching here means injection was refused, so no content script will ever
  // run on this page and nothing is cached for it. The merchant table alone
  // still answers, which on a chrome:// page is the everything-else ranking.
  let res = await cached();
  if (!res) res = await chrome.runtime.sendMessage({ type: 'RECOMMEND', hostname: host });

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
    no_cards:         'no cards added'
  };
  $('#why').textContent = `${res.all.length} card${res.all.length === 1 ? '' : 's'} \u00b7 ` +
    (WHY[res.resolvedBy] || res.resolvedBy) +
    (res.tied.length > 1 ? ` (${res.tied.length} within ${Math.round((res.tieBand ?? 0.10) * 100)}%)` : '');

  // Three, never more. The whole popup has to fit without scrolling, and the
  // fourth-best card has never changed anyone's mind at the till. The full
  // ranking is a click away in Options.
  const TOP = 3;
  // Only mark a winner the ranker actually settled. Painting the top row when
  // the result was a tie would claim a decision that has not been made.
  const clear = res.resolvedBy === 'clear_winner';

  $('#list').innerHTML =
    (unverified ? `<div class="banner">Seed data is unverified. Check rates against your issuer before trusting these numbers.</div>` : '') +
    // Separate from the unverified banner: that one means the data was never
    // checked, this one means it was checked and has since run out.
    (res.stale ? `<div class="banner">Some rates below are expired or overdue for re-verification.</div>` : '') +
    `<h2>Ranked</h2>` +
    res.all.slice(0, TOP).map((c, i) => `
      <div class="row ${i === 0 && clear ? 'win' : ''}">
        <span class="rank">${i + 1}</span>
        <span class="grow">
          <div class="name">${esc(c.name)}</div>
          <div class="sub">${esc(c.reason)}</div>
          ${c.caveats.filter(x => x !== 'Unverified data')
             .map(x => `<div class="cav">! ${esc(x)}</div>`).join('')}
        </span>
        <span class="val">${money(c.value)}</span>
      </div>`).join('');
})();
