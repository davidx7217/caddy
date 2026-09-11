// Overlay preview:  node tools/preview-overlay.mjs   then open http://localhost:8802/
//
// Serves a fake storefront that loads the REAL src/hostmatch.js and
// src/content.js, with a stubbed chrome.* that answers one canned
// recommendation. It is the only way to look at the dock and its panel without
// installing the extension and finding a live merchant that ranks the way you
// need it to.
//
// WHY THIS EXISTS. The overlay is the product's main surface and the one thing
// no test can inspect: it lives in a CLOSED shadow root, so `host.shadowRoot` is
// null by design and neither the lifecycle harness nor a browser console can
// query inside it. Looking at it is the only check there is, and three separate
// layout bugs were found by doing exactly that -- a wrapped rate, a truncated
// card name, and a numeral crowding the close button.
//
// Serves only. It opens no browser: point whatever browser you like at the port,
// including the in-app one.
//
//   node tools/preview-overlay.mjs                 # a tie, panel auto-opens
//   node tools/preview-overlay.mjs --clear         # a clear winner, no tie list
//   node tools/preview-overlay.mjs --long          # longest name, widest rate
//   node tools/preview-overlay.mjs --dark
//   node tools/preview-overlay.mjs --closed        # dock only, panel shut
//   node tools/preview-overlay.mjs --saved         # a saved choice, with `change`
//
// `checkout: true` is what makes the panel open by itself, which is the whole
// reason this can be screenshotted without driving a click.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const args = process.argv.slice(2);
const has = f => args.includes(f);
const PORT = 8802;

const card = (productId, name, value, reason = '3x base rate') =>
  ({ productId, name, value, reason, caveats: [], needsActivation: false });

// The worst realistic case for the winner block: the longest card name in the
// catalogue against a six-character rate.
const winner = has('--long')
  ? card('chase-sapphire-reserve', 'Chase Sapphire Reserve', 12, '4x flights booked direct')
  : card('robinhood-gold', 'Robinhood Gold Card', 3);

const tied = has('--clear') || has('--long') ? [] : [
  card('robinhood-gold', 'Robinhood Gold Card', 3),
  card('amex-blue-cash-everyday', 'Amex Blue Cash Everyday', 3)
];

const RESULT = {
  show: true,
  checkout: !has('--closed'),
  category: 'online_retail', categorySource: 'merchant',
  // --saved is the one case that still renders a why-line, because that line
  // carries the control which clears the saved choice.
  resolvedBy: has('--saved') ? 'category_default'
            : tied.length ? 'unresolved' : 'clear_winner',
  theme: has('--dark') ? 'dark' : 'light',
  overlayPos: { bottom: 16 }, notes: [],
  winner, tied,
  all: Array.from({ length: 6 }, (_, i) => card('c' + i, 'Card ' + i, 1)),
  merchant: { domain: 'amazon.com', category: 'online_retail', confidence: 'high' }
};

const PAGE = `<!doctype html><meta charset="utf-8"><title>Overlay preview</title>
<style>body{font:16px system-ui;margin:0;padding:40px;background:#fff;color:#111}
h1{font-size:28px;margin:0 0 8px}.grid{display:grid;grid-template-columns:repeat(3,1fr);
gap:16px;margin-top:24px}.tile{height:220px;border-radius:12px;background:#e8e4dd}</style>
<h1>Overlay preview</h1>
<p>A stand-in storefront. Everything in the corner is the real content script.</p>
<a href="/cart">Cart</a>
<div class="grid"><div class="tile"></div><div class="tile"></div><div class="tile"></div></div>
<script>
// The content script's half of the API, callback-style. It never reaches a
// worker here -- one canned answer is the point.
window.chrome = {
  runtime: { id: 'overlay-preview', lastError: null,
    sendMessage: (msg, cb) => { if (cb) setTimeout(() => cb(${JSON.stringify(RESULT)}), 20); } },
  storage: { local: { get: (k, cb) => cb({ blocked: [] }) }, onChanged: { addListener() {} } }
};
</script>
<script src="/hostmatch.js"></script>
<script src="/content.js"></script>`;

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(PAGE);
  }
  try {
    const body = await readFile(join(SRC, path.replace(/^\//, '')));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'text/plain' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => {
  console.log(`Overlay preview on http://localhost:${PORT}/`);
  console.log(`  winner ${winner.name} at ${winner.value.toFixed(2)}%` +
              `${tied.length ? `, tied with ${tied.length - 1} other` : ', clear winner'}` +
              `, ${RESULT.theme}, panel ${RESULT.checkout ? 'open' : 'shut'}`);
});
