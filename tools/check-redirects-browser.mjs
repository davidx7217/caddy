// Merchant redirect sweep, browser pass:  node tools/check-redirects-browser.mjs
//
// The other half of tools/check-redirects.mjs, and the half that found
// exxon.com. An HTTP sweep sees what a SERVER answers. This sees what a PAGE
// does to itself once it has loaded -- a meta refresh, a location assignment, a
// framework router deciding you are on the wrong brand. exxon.com came back from
// the HTTP pass as "403, host unchanged", which was wrong in both halves: it was
// not unchanged, and the 403 was bot protection rather than an answer.
//
// By default it runs the HTTP pass FIRST and browses only the rows that came
// back unconfirmed, because that is the documented workflow and doing it by hand
// is how it got skipped. Pass domains to check just those, or --all to browse
// every row regardless of what HTTP said.
//
//   node tools/check-redirects-browser.mjs                 # the gaps HTTP left
//   node tools/check-redirects-browser.mjs exxon.com max.com
//   node tools/check-redirects-browser.mjs --all
//   node tools/check-redirects-browser.mjs --headless      # faster, and WRONG
//
// Zero dependencies, like everything else here: it launches Chrome with the
// DevTools Protocol open and drives it over node's built-in WebSocket. No
// Puppeteer, no Playwright.
//
// It launches its OWN Chrome against a throwaway profile directory. It never
// touches your real one, so it carries none of your cookies or sessions into
// these sites, and closes what it opened.
//
// One bug worth not reintroducing: the first version read location.hostname
// after every navigation, including the failed ones. A failed navigation still
// leaves a document behind, and Chrome's error page reports its hostname as
// `chromewebdata` -- so the first full run declared delta.com MOVED to
// chromewebdata, which would have sent someone to edit a row that was fine.
// Navigation failure is read from Page.navigate's errorText now, and a row that
// cannot be reached is UNCONFIRMED. A sweep may say "I could not tell". It may
// not invent a move.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { merchants, rows, normalise, classify, pool, report } from './redirect-sweep.mjs';
import { httpSweep } from './check-redirects.mjs';

const args = process.argv.slice(2);
const HEADLESS = args.includes('--headless');
const ALL = args.includes('--all');
const ONLY = args.filter(a => !a.startsWith('--'));

// Headed by default, and --headless is a trap kept only for speed on rows you
// already trust.
//
// MEASURED 2026-09-10, both modes, same machine, same minute:
//
//   headless   exxon.com  ->  ok, stayed on exxon.com        WRONG
//   headed     exxon.com  ->  exxonmobilfuels.com            correct
//
// The client-side redirect this whole pass exists to catch does not fire in
// headless. Note the shape of that failure: it did not report a block, it
// reported a CLEAN ROW. A sweep that silently answers "fine" is worse than the
// HTTP pass it was written to cover for, because at least that one says
// UNCONFIRMED when it cannot see.
const CONCURRENCY = HEADLESS ? 6 : 3;
const LOAD_TIMEOUT_MS = 25000;
// A client-side redirect fires AFTER load. Reading location too early is exactly
// the mistake the HTTP pass makes structurally, so wait before believing it.
const SETTLE_MS = 3500;

const CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

const chromePath = CANDIDATES.find(p => existsSync(p));
if (!chromePath) {
  console.error('No Chrome found. Set CHROME to the binary:\n' +
    "  CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \\\n" +
    '    node tools/check-redirects-browser.mjs');
  process.exit(2);
}

// ---------- CDP over one socket ----------
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const listeners = new Set();
  let id = 0;
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    } else if (m.method) {
      for (const fn of listeners) fn(m);
    }
  });
  return {
    ready,
    send(method, params = {}, sessionId) {
      const msgId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    close() { try { ws.close(); } catch {} }
  };
}

/** Where a domain ends up in a real renderer, after it has stopped moving. */
async function finalHost(cdp, domain) {
  let targetId, sessionId;
  try {
    ({ targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }));
    ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
    await cdp.send('Page.enable', {}, sessionId);

    const loaded = new Promise(resolve => {
      const off = cdp.on(m => {
        if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') { off(); resolve(true); }
      });
      setTimeout(() => { off(); resolve(false); }, LOAD_TIMEOUT_MS);
    });
    // errorText is how a navigation says it FAILED. Trust it over the address
    // bar: a failed navigation still leaves a document behind, and reading its
    // hostname is how the first version of this script reported delta.com as
    // having "moved to chromewebdata". A row that could not be reached is
    // UNCONFIRMED. Reporting it as moved is the one wrong answer a sweep must
    // never give, because it sends someone to edit a row that was fine.
    const nav = await cdp.send('Page.navigate', { url: `https://${domain}` }, sessionId);
    if (nav && nav.errorText) return { host: null, status: nav.errorText };
    await loaded;
    await new Promise(r => setTimeout(r, SETTLE_MS));

    const { result } = await cdp.send('Runtime.evaluate',
      { expression: 'location.hostname', returnByValue: true }, sessionId);
    const host = result && result.value;
    // Chrome's error page reports its own hostname as `chromewebdata`, and
    // about:blank reports ''. Neither is a site.
    if (!host || host === 'chromewebdata') return { host: null, status: 'no-load' };
    return { host: normalise(host), status: 'browser' };
  } catch (e) {
    return { host: null, status: 'error' };
  } finally {
    if (targetId) await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

// ---------- pick the rows to browse ----------
let list;
if (ONLY.length) {
  const unknown = ONLY.filter(d => !merchants[d]);
  if (unknown.length) {
    console.error(`Not rows in merchants.json: ${unknown.join(', ')}`);
    process.exit(2);
  }
  list = ONLY.map(d => [d, merchants[d]]);
} else if (ALL) {
  list = rows;
} else {
  console.log(`HTTP pass over ${rows.length} rows first, to find what needs a browser...`);
  const http = await httpSweep();
  const gaps = http.filter(r => r.verdict === 'blocked').map(r => r.domain);
  console.log(`  ${rows.length - gaps.length} answered over HTTP, ${gaps.length} need one.`);
  if (!gaps.length) {
    console.log('\nNothing left unconfirmed. Note that this only means the HTTP pass got an\n' +
                'answer everywhere -- run with --all to check for client-side moves too.');
    process.exit(0);
  }
  list = gaps.map(d => [d, merchants[d]]);
}

// ---------- run ----------
const profile = await mkdtemp(join(tmpdir(), 'caddy-sweep-'));
const chrome = spawn(chromePath, [
  HEADLESS ? '--headless=new' : '--no-startup-window',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-sync',
  '--disable-features=Translate,MediaRouter'
], { stdio: ['ignore', 'ignore', 'pipe'] });

const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  const t = setTimeout(() => reject(new Error('Chrome did not report a DevTools endpoint')), 20000);
  chrome.stderr.on('data', d => {
    buf += d;
    const m = buf.match(/ws:\/\/[^\s]+/);
    if (m) { clearTimeout(t); resolve(m[0]); }
  });
  chrome.on('exit', c => { clearTimeout(t); reject(new Error(`Chrome exited (${c})`)); });
});

const cdp = connect(wsUrl);
await cdp.ready;

console.log(`\nBrowsing ${list.length} row${list.length === 1 ? '' : 's'} in ` +
            `${HEADLESS ? 'headless' : 'a real'} Chrome, ${CONCURRENCY} at a time...`);

const results = await pool(list, CONCURRENCY, async ([domain, row]) => {
  const { host, status } = await finalHost(cdp, domain);
  const r = classify(domain, row, host, status);
  console.log(`  ${r.verdict === 'moved' ? 'FAIL' : r.verdict === 'blocked' ? '????' : 'ok  '}  ` +
              `${domain}${host && host !== domain ? `  ->  ${host}` : ''}`);
  return r;
});

cdp.close();
chrome.kill();
await rm(profile, { recursive: true, force: true }).catch(() => {});

process.exit(report(results, {
  unconfirmedNote:
    'UNCONFIRMED even in a browser. The page never committed a navigation --\n' +
    'DNS failure, refused connection, or a block that survives a real renderer.\n' +
    'These need a human with a browser they are already signed into:'
}));
