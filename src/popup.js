import { fontFaceCss, fontStack } from './engine.js';

const $ = s => document.querySelector(s);

const { theme, setupPending } = await chrome.storage.local.get(['theme', 'setupPending']);

// Setup is unfinished (see background.js), so the icon goes back to it rather
// than to a ranking with no cards in it. An open setup tab is brought forward
// instead of stacking another one on every click; getContexts needs Chrome 116,
// and older builds the manifest still admits just get a new tab. Either way the
// focus moves to that tab, and Chrome shuts the popup when it loses focus -- it
// never closes itself, for the reason test-worker.mjs gives.
if (setupPending) {
  const url = chrome.runtime.getURL('src/welcome.html');
  const [open] = chrome.runtime.getContexts
    ? await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [url] })
    : [];
  if (open) {
    await chrome.tabs.update(open.tabId, { active: true });
    await chrome.windows.update(open.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
  // Never settles, on purpose: nothing below may run, or it would inject the
  // content script into whatever page sits behind the popup.
  await new Promise(() => {});
}

// One font AND one theme across every surface, so the extension looks like one
// thing. Options owns the theme choice; unset means follow the OS, which is
// what the stylesheet does on its own.
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
  // and we never need them -- the content script already told the worker.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Opening this popup IS an action invocation, which grants activeTab for this
  // tab -- so tab.url is readable here with no host permission at all. Before
  // that grant existed this was always blank, and every site with no content
  // script read as "no merchant detected".
  // Only http(s) has a hostname worth showing. On chrome:// and on the
  // extension's own pages, new URL().hostname is the extension ID, which is how
  // the popup ended up titled with a block of random letters.
  let host = '';
  try {
    const u = tab && tab.url ? new URL(tab.url) : null;
    if (u && (u.protocol === 'http:' || u.protocol === 'https:')) host = u.hostname;
  } catch (e) { /* opaque URLs */ }

  // The cache is per tab, and only a page's own content script replaces it. When
  // that write never lands for the page now showing -- seen 2026-10-01 on Smith's,
  // reached from a Google search, where the popup still answered for google.com
  // while the dock had it right -- the entry belongs to the page before. An
  // answer for another host is no answer.
  const bare = h => (h || '').replace(/^www\./, '');
  const cached = async () => {
    const r = tab ? (await chrome.storage.session.get(`tab:${tab.id}`))[`tab:${tab.id}`] : null;
    return r && (!host || bare(r.hostname) === bare(host)) ? r : null;
  };

  let res = await cached();
  // Ranked on an earlier day -- the tab sat open past midnight, when a new
  // rotating quarter may have started. Rank again rather than show yesterday.
  if (res && res.rankedOn !== new Date().toDateString()) {
    res = await chrome.runtime.sendMessage({ type: 'RECOMMEND', hostname: host });
  }

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
    $('#sub').textContent = res && res.resolvedBy === 'none_usable'
      ? 'None of your cards work here. Your store cards only work at their own store.'
      : 'No cards added yet.';
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

  // One short line per card: activation and the cap, the two that change what
  // you do at the till. The rule's own wording and the expiry notice stay in
  // the card's details and the banner above (David, 2026-10-01: too much text).
  const short = c => c.caveats.flatMap(x => {
    if (x === 'Must be activated with the issuer') return ['Activate first'];
    const cap = x.match(/^Capped at (\$[\d,]+) per (.+), then/);
    return cap ? [`${cap[1]}/${cap[2]} cap`] : [];
  }).join(' \u00b7 ');

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
          ${short(c) ? `<div class="cav">${esc(short(c))}</div>` : ''}
        </span>
        <span class="val">${money(c.value)}</span>
      </div>`).join('');
})();
