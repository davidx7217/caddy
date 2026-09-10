// Shared parts of the two redirect sweeps.
//
// There are two passes because there are two kinds of redirect, and neither
// pass can see the other's. check-redirects.mjs speaks HTTP and sees what a
// server answers; check-redirects-browser.mjs drives a real Chrome and sees what
// a page does to itself after it loads. exxon.com is the worked example: the
// HTTP pass reported it "403, host unchanged", which was simply wrong, because
// the move was client-side.
//
// What lives here is everything that must MATCH between them -- the row list,
// what counts as still covering a domain, the verdicts, and the report -- so the
// two passes cannot drift into disagreeing about the same site.
import { readFileSync } from 'node:fs';

export const merchants = JSON.parse(
  readFileSync(new URL('../data/merchants.json', import.meta.url), 'utf8'));

export const rows = Object.entries(merchants).filter(([k]) => !k.startsWith('_'));

export const normalise = h => String(h).toLowerCase().replace(/^www\./, '');

// resolveMerchant walks up parent domains, so a row still matches its own
// subdomains. Mirror that here or every www. host reads as a move.
export const covers = (row, host) => host === row || host.endsWith('.' + row);

/**
 * One row's verdict, given where it actually ended up.
 *
 * `host` null means the check could not reach an answer. That is UNCONFIRMED,
 * never clean: on the HTTP pass it usually means bot protection, and a
 * client-side move would have been invisible there regardless.
 */
export function classify(domain, row, host, status) {
  if (!host) return { domain, status, verdict: 'blocked' };
  if (covers(domain, host)) {
    const code = String(status);
    return { domain, host, status,
             verdict: code.startsWith('2') || code.startsWith('3') || status === 'browser'
               ? 'ok' : 'blocked' };
  }
  // Declared in the data, so it is a known stale-link row, not a surprise. A
  // check nobody can pass is a check everybody ignores.
  if (row.redirects_to && covers(row.redirects_to, host)) {
    return { domain, host, status, verdict: 'expected' };
  }
  return { domain, host, status, verdict: 'moved' };
}

export async function pool(items, limit, fn) {
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

/** @returns the process exit code: 1 if any row has moved unexpectedly. */
export function report(results, { unconfirmedNote }) {
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
    console.log(`\n${unconfirmedNote}`);
    for (const r of blocked) console.log(`  ????  ${r.domain}  [${r.status}]`);
  }

  console.log(`\n${by('ok').length} confirmed, ${expected.length} expected, ` +
              `${blocked.length} unconfirmed, ${moved.length} moved`);
  return moved.length ? 1 : 0;
}
