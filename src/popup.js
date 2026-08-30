const $ = s => document.querySelector(s);
const money = v => `${v.toFixed(2)}%`;
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

$('#opts').addEventListener('click', () => chrome.runtime.openOptionsPage());

(async () => {
  // tabs.query works without the "tabs" permission; only url/title are gated,
  // and we never need them -- the content script already told the worker.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let res = tab ? (await chrome.storage.session.get(`tab:${tab.id}`))[`tab:${tab.id}`] : null;
  if (!res) res = await chrome.runtime.sendMessage({ type: 'RECOMMEND', hostname: '' });

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
