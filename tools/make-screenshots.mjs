// Store screenshots:  node tools/make-screenshots.mjs
//
// Writes store/screenshots/*.png at exactly 1280x800, the size the Chrome Web
// Store accepts and does not scale.
//
// WHAT THESE ARE. The real src/options.html and src/welcome.html, with the real
// stylesheets and the real modules, rendered by a real Chrome. The ONLY
// substitution is the storage backend: chrome.storage.local is stubbed and
// seeded with exactly the wallet setup would have written. That cannot change
// how anything looks, because every pixel still comes from the shipped source.
//
// WHY NOT LOAD THE EXTENSION. That was tried first and is the better answer.
// Chrome has removed the --load-extension command-line switch, and
// --disable-features=DisableLoadExtensionCommandLineSwitch no longer brings it
// back: the extension never installs and its pages answer ERR_BLOCKED_BY_CLIENT.
// Measured 2026-09-10 on Chrome for macOS with no enterprise policy present.
//
// WHAT THIS CANNOT MAKE. The dock. The overlay only exists inside a page the
// content script has run on, which means a browser with the extension actually
// installed. That one has to be captured by hand and store/listing.md says how.
// It is also the most important of the three, so do not ship without it.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, newPage, goto, evaluate, sleep } from './cdp.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = new URL('../store/screenshots/', import.meta.url);
const W = 1280, H = 800;

// Two issuers, a card carrying a caution, a card with per-card settings, and a
// real fee spread -- a wallet with something to show rather than a tidy one.
const WALLET = [
  { productId: 'chase-freedom-unlimited', config: {} },
  { productId: 'amex-gold', config: {} },
  { productId: 'usbank-cash-plus',
    config: { selections: ['five_department', 'five_utilities', 'two_grocery'] } }
];

const STUB = seed => `
const store = ${JSON.stringify(seed)};
globalThis.chrome = {
  runtime: { getURL: p => '/' + p, getManifest: () => ({ version: '1.0.0' }), id: 'shot',
    // Options asks the worker for the real automatic-mode state on load. Without
    // this the call throws SYNCHRONOUSLY -- there is no promise for the .catch()
    // to catch -- so load() dies and the page renders nothing at all.
    sendMessage: async msg => msg && msg.type === 'AUTO_STATE'
      ? { wanted: true, permitted: true, registered: true } : null },
  storage: { local: {
    get: keys => Promise.resolve(Object.fromEntries(
      (Array.isArray(keys) ? keys : keys === null ? Object.keys(store) : [keys])
        .map(k => [k, store[k]]).filter(([, v]) => v !== undefined))),
    set: obj => { Object.assign(store, obj); return Promise.resolve(); },
    getBytesInUse: () => Promise.resolve(2048)
  }, onChanged: { addListener: () => {} } },
  permissions: { contains: () => Promise.resolve(false),
                 request: () => Promise.resolve(true), remove: () => Promise.resolve(true) }
};`;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };

/**
 * Serves the repo, rewriting the extension's pages to load a stub first.
 * `?seed=empty` starts with no wallet, for the setup shot.
 */
function serve(port) {
  return new Promise(resolve => {
    const srv = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const rel = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '').replace(/^\//, '');
      try {
        let body = await readFile(join(ROOT, rel));
        if (rel.endsWith('.html')) {
          const seed = url.searchParams.get('seed') === 'empty'
            ? { instances: [], theme: 'light' }
            : { instances: WALLET, valuations: {}, prefs: { categoryDefaults: {}, tieBand: 0.10 },
                blocked: [], activity: [], theme: 'light' };
          body = String(body).replace('<script type="module"',
            `<script>${STUB(seed)}</script>\n<script type="module"`);
        }
        res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    srv.listen(port, () => resolve(srv));
  });
}

const shots = [];
async function capture(cdp, sessionId, name, detail) {
  const { data } = await cdp.send('Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: false }, sessionId);
  await writeFile(new URL(`${name}.png`, OUT), Buffer.from(data, 'base64'));
  shots.push(name);
  console.log(`  wrote ${name}.png  --  ${detail}`);
}

/** 1280x800 has to be the PAGE viewport, not the window, or the shot comes up short. */
const frame = (cdp, sessionId) => cdp.send('Emulation.setDeviceMetricsOverride',
  { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sessionId);

// Clear only the two files this script writes. It used to rm the whole
// directory, which would have deleted 3-dock-on-a-store.png -- the one shot
// that CANNOT be regenerated by running this, because it needs the extension
// installed in a browser. A tool that destroys the artefact it cannot rebuild
// is worse than one that leaves a stale file behind.
await mkdir(OUT, { recursive: true });
for (const name of ['1-settings-cards.png', '2-setup-your-cards.png']) {
  await rm(new URL(name, OUT), { force: true }).catch(() => {});
}

const PORT = 8791;
const srv = await serve(PORT);
const base = `http://localhost:${PORT}/src`;
const { cdp, close } = await launch();

try {
  // ---------- 1. Settings, with a wallet ----------
  {
    const { sessionId } = await newPage(cdp);
    await frame(cdp, sessionId);
    await goto(cdp, sessionId, `${base}/options.html`);
    await sleep(1400);
    const owned = await evaluate(cdp, sessionId, 'document.querySelectorAll(".list .card-row").length');
    if (!owned) throw new Error('settings shot: the page rendered no cards');
    await capture(cdp, sessionId, '1-settings-cards',
      'Settings: three cards owned, and the filtered catalogue below');
  }

  // ---------- 2. Setup, step two ----------
  {
    const { sessionId } = await newPage(cdp);
    await frame(cdp, sessionId);
    await goto(cdp, sessionId, `${base}/welcome.html?seed=empty`);
    await sleep(1400);
    // The catalogue pages six at a time, so two of the three wallet cards are not
    // on the first page. Page forward to find each one, then come back to page 1
    // for the shot: that is the frame the listing describes, and the card that
    // shows as ADDED there is the top row.
    await evaluate(cdp, sessionId, `(async () => {
      const wait = () => new Promise(r => setTimeout(r, 220));
      const nav = dir => document.querySelector('[data-page="' + dir + '"]:not([disabled])');
      document.querySelector('#next').click(); await wait();
      for (const id of ${JSON.stringify(WALLET.map(w => w.productId))}) {
        while (!document.querySelector('[data-pick="' + id + '"]') && nav('next')) {
          nav('next').click(); await wait();
        }
        const b = document.querySelector('[data-pick="' + id + '"]');
        if (b) { b.click(); await wait(); }
        while (nav('prev')) { nav('prev').click(); await wait(); }
      }
      scrollTo(0, 0);
    })()`);
    await sleep(800);
    // Count the wallet, not the visible rows. Two of the three are on later pages
    // and the shot is framed on page one, so counting aria-pressed here would
    // report 1 and fail a run that did exactly the right thing. The footer note
    // is rendered straight off the picked set.
    const note = await evaluate(cdp, sessionId, 'document.querySelector("#note").textContent');
    if (!String(note).startsWith(`${WALLET.length} card`)) {
      throw new Error(`setup shot: expected ${WALLET.length} cards picked, footer said "${note}"`);
    }
    await capture(cdp, sessionId, '2-setup-your-cards',
      'Setup step two: page one of the picker, with three cards chosen');
  }
} finally {
  await close();
  srv.close();
}

console.log(`\n${shots.length} written to store/screenshots/ at ${W}x${H}.`);
console.log('\nStill needed, and not producible here: the dock and panel open on a real');
console.log('store. That needs the extension installed in a browser, which is the one');
console.log('thing this script cannot arrange. store/listing.md has the steps.');
