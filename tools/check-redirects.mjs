// Merchant redirect sweep, HTTP pass:  node tools/check-redirects.mjs
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
// BLOCKED is unconfirmed, not clean.
//
//   node tools/check-redirects-browser.mjs
//
// is the other half, and it now runs this pass first and browses whatever came
// back unconfirmed. Prefer it. This script alone is the fast, partial answer.
//
// Exit code is 1 when a row has moved unexpectedly, so this can gate a release.
// Rows that redirect ON PURPOSE declare it with "redirects_to" in merchants.json
// and are reported separately, so a deliberate stale-link row does not leave the
// script permanently red -- a check nobody can pass is a check everybody ignores.
import { rows, normalise, classify, pool, report } from './redirect-sweep.mjs';

// Measured, not decorative: max.com returns its old host to a default client and
// only reveals hbomax.com to a browser user-agent. Send one or the sweep lies.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const CONCURRENCY = 10;
const TIMEOUT_MS = 20000;

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

/** Exported so the browser pass can run this first and browse only the gaps. */
export async function httpSweep(list = rows) {
  return pool(list, CONCURRENCY, async ([domain, row]) => {
    const { host, status } = await finalHost(domain);
    return classify(domain, row, host, status);
  });
}

// Only sweep when run directly, so importing this does not fire 83 requests.
if (import.meta.url === `file://${process.argv[1]}`) {
  const results = await httpSweep();
  process.exit(report(results, {
    unconfirmedNote:
      'BLOCKED -- UNCONFIRMED, not clean. Bot protection stopped the check,\n' +
      'and a client-side redirect would be invisible here anyway. Run\n' +
      'tools/check-redirects-browser.mjs, which opens these in a real Chrome:'
  }));
}
