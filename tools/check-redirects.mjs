// Merchant redirect sweep:  node tools/check-redirects.mjs
//
// A merchant row dies when its domain starts redirecting somewhere else:
// resolveMerchant stops matching, the brand resolves to no merchant at all, and
// every card rule for its category quietly loses that site. Two of 79 rows had
// died this way before anyone looked -- max.com -> hbomax.com and
// exxon.com -> exxonmobilfuels.com. Nothing in the test suite could catch it,
// because the tests assert against the table, not against the live web.
//
// READ THIS BEFORE TRUSTING A CLEAN RUN. This sweep speaks HTTP, so it sees
// server-side redirects only. A CLIENT-SIDE redirect is invisible to it by
// construction -- exxon.com was reported here as "403, host unchanged", which was
// simply wrong, and it took a browser to find. Any row this script lists as
// BLOCKED is unconfirmed, not clean. Open those in a real browser and compare
// location.hostname yourself.
//
// Exit code is 1 when a row has moved unexpectedly, so this can gate a release.
// Rows that redirect ON PURPOSE declare it with "redirects_to" in merchants.json
// and are reported separately, so a deliberate stale-link row does not leave the
// script permanently red -- a check nobody can pass is a check everybody ignores.
import { readFileSync } from 'node:fs';

// Measured, not decorative: max.com returns its old host to a default client and
// only reveals hbomax.com to a browser user-agent. Send one or the sweep lies.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const CONCURRENCY = 10;
const TIMEOUT_MS = 20000;

const merchants = JSON.parse(
  readFileSync(new URL('../data/merchants.json', import.meta.url), 'utf8'));
const rows = Object.entries(merchants).filter(([k]) => !k.startsWith('_'));

const normalise = h => h.toLowerCase().replace(/^www\./, '');
// resolveMerchant walks up parent domains, so a row still matches its own
// subdomains. Mirror that here or every www. host reads as a move.
const covers = (row, host) => host === row || host.endsWith('.' + row);

async function finalHost(domain) {
  const url = `https://${domain}`;
  const opts = { redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html' } };
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, { ...opts, method, signal: AbortSignal.timeout(TIMEOUT_MS) });
      res.body?.cancel().catch(() => {});
      // Some hosts reject HEAD outright (405/501) but answer GET fine, so a
      // failure on the first method is not yet an answer.
      if (method === 'HEAD' && res.status >= 400) continue;
      return { host: normalise(new URL(res.url).hostname), status: res.status };
    } catch (e) {
      if (method === 'GET') return { host: null, status: e.name === 'TimeoutError' ? 'timeout' : 'error' };
    }
  }
  return { host: null, status: 'error' };
}

async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }));
  return out;
}

const results = await pool(rows, CONCURRENCY, async ([domain, row]) => {
  const { host, status } = await finalHost(domain);
  if (!host) return { domain, status, verdict: 'blocked' };
  if (covers(domain, host)) {
    return { domain, host, status,
             verdict: String(status).startsWith('2') || String(status).startsWith('3')
               ? 'ok' : 'blocked' };
  }
  // Declared in the data, so it is a known stale-link row, not a surprise.
  if (row.redirects_to && covers(row.redirects_to, host)) {
    return { domain, host, status, verdict: 'expected' };
  }
  return { domain, host, status, verdict: 'moved' };
});

const by = v => results.filter(r => r.verdict === v);
const moved = by('moved'), blocked = by('blocked'), expected = by('expected');

if (moved.length) {
  console.log('\nMOVED -- these rows no longer match their own site:');
  for (const r of moved) console.log(`  FAIL  ${r.domain}  ->  ${r.host}  [${r.status}]`);
  console.log('\n  Fix each by adding the live domain to merchants.json and giving the old\n' +
              '  row "redirects_to": "<new domain>" if you keep it for stale links.');
}
if (expected.length) {
  console.log('\nEXPECTED redirects, declared in merchants.json:');
  for (const r of expected) console.log(`  ok    ${r.domain}  ->  ${r.host}`);
}
if (blocked.length) {
  console.log('\nBLOCKED -- UNCONFIRMED, not clean. Bot protection stopped the check,');
  console.log('and a client-side redirect would be invisible here anyway. Open each in');
  console.log('a browser and compare location.hostname:');
  for (const r of blocked) console.log(`  ????  ${r.domain}  [${r.status}]`);
}

console.log(`\n${by('ok').length} confirmed, ${expected.length} expected, ` +
            `${blocked.length} unconfirmed, ${moved.length} moved`);
process.exit(moved.length ? 1 : 0);
