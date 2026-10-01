// Lifecycle tests:  node tools/test-lifecycle.mjs
//
// Runs the REAL src/content.js inside a vm sandbox with stubbed DOM/chrome
// globals and a controllable clock. The engine tests cover what the extension
// decides; this covers when it mounts, unmounts, and gives up polling -- the
// part that cannot be reached without a browser otherwise.
//
// Stubs are deliberately thin. They exist to let the file run, not to model a
// browser, so treat a failure here as "the lifecycle changed" and re-read it.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
// Loaded ahead of content.js by the manifest, so the harness must load it first
// too -- content.js calls __cpIsBlockedHost before it reads any DOM.
const HOSTMATCH = readFileSync(new URL('../src/hostmatch.js', import.meta.url), 'utf8');

function harness(initialRespond, blocked = [], startHref = 'https://shop.example/',
                 clockStart = '2026-09-09T12:00:00', { prerendering = false } = {}) {
  const log = [];
  // Page-level events content.js listens for: pageshow, prerenderingchange.
  const listeners = [];
  const listen = where => (type, fn) => listeners.push({ where, type, fn });
  let timers = [], now = 0, intervals = [];
  // content.js reads the wall clock to tell when the local day turns. Driven by
  // the same fake time as the timers, starting at clockStart (local time).
  const base = new Date(clockStart).getTime();
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(base + now); }
    static now() { return base + now; }
  }
  let href = startHref;
  let respond = initialRespond || (() => ({ show: false }));
  const onChangedFns = [];
  let throwOnSend = false;

  const fakeEl = () => new Proxy({}, { get(t, k) {
    // The dock opens its panel by adding exactly one class, so watching for it
    // is how a test can tell a dock that MOUNTED from one that also OPENED.
    // Those are different products: a pill sitting in the corner, and a pill
    // that threw a panel over the page you were reading.
    if (k === 'classList') return {
      add(c){ if (c === 'open') log.push('OPEN'); },
      remove(){}, toggle(){}, contains(){return false} };
    // setProperty has to be a real function: content.js writes the overlay's
    // theme tokens through it, and a proxy that answers '' for every key
    // makes that call throw and the dock never mount.
    if (k === 'style') return new Proxy({}, {
      get: (t, key) => key === 'setProperty' || key === 'removeProperty' ? () => {} : '',
      set: () => true });
    if (k === 'dataset') return {};
    if (k === 'attachShadow') return () => shadow;
    if (k === 'querySelector') return () => fakeEl();
    if (k === 'querySelectorAll') return () => [];
    if (k === 'offsetHeight') return 200;
    if (k === 'textContent') return '';
    if (k === 'tagName') return 'DIV';
    if (typeof k === 'string') return () => {};
    return undefined;
  }});
  const shadow = { set innerHTML(v) {}, querySelector: () => fakeEl(), querySelectorAll: () => [] };

  const sandbox = {
    console,
    Date: FakeDate,
    window: {
      addEventListener: listen('window'), removeEventListener(){},
      get innerWidth(){return 1400}, get innerHeight(){return 900},
    },
    document: {
      prerendering,
      addEventListener: listen('document'),
      body: { textContent: '' },
      // The overlay puts its @font-face into the host page's head, because
      // Chrome ignores @font-face inside a shadow root.
      head: { appendChild() {} },
      getElementById: () => null,
      documentElement: { appendChild(){}, style:{ getPropertyValue:()=>'',getPropertyPriority:()=>'',setProperty(){},removeProperty(){} } },
      createElement: () => fakeEl(),
      querySelector: () => null,
      querySelectorAll: () => [],
      forms: [],
    },
    get location(){ const u=new URL(href); return { href, hostname:u.hostname, pathname:u.pathname, search:u.search }; },
    chrome: {
      // The content script reads the user's blocklist before touching the DOM.
      storage: {
        local: { get: (_k, cb) => cb({ blocked }) },
        // The user can block the site they are already on. content.js listens
        // for that; the harness has to be able to fire it.
        onChanged: { addListener: fn => onChangedFns.push(fn) }
      },
      runtime: {
      id: 'test-extension-id',   // absent once the extension is reloaded
      lastError: null,
      sendMessage(msg, cb) {
        log.push('evaluate');
        if (throwOnSend) throw new Error('Extension context invalidated.');
        const r = respond();
        if (cb) cb({ winner:{name:'X',value:3,reason:'r',caveats:[],needsActivation:false}, all:[], tied:[], notes:[], merchant:{domain:'shop.example',category:'other'}, category:'other', overlayPos:{bottom:16}, ...r });
      }
    } },
    setTimeout: (fn, ms) => { timers.push({ at: now + ms, fn }); return timers.length; },
    clearTimeout: () => {},
    setInterval: (fn, ms) => { const h={ every: ms, next: now + ms, fn, live:true }; intervals.push(h); return h; },
    clearInterval: (h) => { log.push('stopPolling'); if (h) h.live = false; },
  };
  sandbox.window.location = sandbox.location;

  // Observe mount/unmount by watching documentElement.appendChild / host.remove
  sandbox.document.documentElement.appendChild = () => log.push('MOUNT');
  const origCreate = sandbox.document.createElement;
  sandbox.document.createElement = () => {
    const el = origCreate();
    return new Proxy(el, { get(t,k){ if(k==='remove') return () => log.push('UNMOUNT'); return t[k]; } });
  };

  vm.createContext(sandbox);
  vm.runInContext(HOSTMATCH, sandbox);
  vm.runInContext(SRC, sandbox);

  const tick = (ms) => {
    const end = now + ms;
    while (now < end) {
      const nextT = timers.filter(t=>t.at>now).map(t=>t.at).sort((a,b)=>a-b)[0];
      const nextI = intervals.filter(i=>i.live).map(i=>i.next).sort((a,b)=>a-b)[0];
      const next = Math.min(nextT ?? Infinity, nextI ?? Infinity, end);
      if (!isFinite(next)) { now = end; break; }
      now = next;
      timers.filter(t=>t.at===now).forEach(t=>t.fn());
      timers = timers.filter(t=>t.at!==now);
      intervals.filter(i=>i.live && i.next===now).forEach(i=>{ i.fn(); i.next = now + i.every; });
    }
  };
  return { log, tick, nav: u => { href = u; }, setRespond: f => { respond = f; },
           pollingLive: () => intervals.some(i=>i.live),
           fire: (where, type, e = {}) => listeners
             .filter(l => l.where === where && l.type === type).forEach(l => l.fn(e)),
           // Simulates reloading the extension, which orphans this script.
           killContext: () => { delete sandbox.chrome.runtime.id; },
           makeSendThrow: () => { throwOnSend = true; },
           isBlocked: (h, list) => sandbox.__cpIsBlockedHost(h, list),
           setBlocked: list => onChangedFns.forEach(fn =>
             fn({ blocked: { newValue: list } }, 'local')),
 };
}

let pass=0, fail=0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got)===JSON.stringify(want);
  ok?pass++:fail++;
  console.log(`${ok?'PASS':'FAIL'}  ${name}${ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`}`);
};

// 1. A site that never sells anything: polling must stop.
{
  const h = harness();
  h.setRespond(() => ({ show: false }));
  for (let i=0;i<12;i++){ h.nav('https://mail.example/#inbox/'+i); h.tick(4000); }
  check('non-merchant site stops polling', h.log.includes('stopPolling'), true);
  check('...and never mounts', h.log.includes('MOUNT'), false);
  // 23: seven on the load ladder, then four on each of four route ladders
  // before the fifth give-up stops the poll. It was 8 when a miss meant one
  // re-check 2.5s later. The budget is spent in GIVE-UPS, not attempts --
  // counting attempts would have burned all five inside a single slow page
  // load and killed the route poll on an SPA that was only hydrating.
  //
  // The number rises whenever the rungs get denser, which is the price of the
  // dock arriving sooner. It is pinned rather than left as an inequality so
  // that price is visible in the diff when someone changes the ladder.
  check('...and stops evaluating well short of 12 routes',
        h.log.filter(x=>x==='evaluate').length, 23);
}

// 1a. The popup's copy comes from PAGE, so a page has to send it again when it
// becomes the tab's page: a prerendered one on activation, a page restored by
// Back or Forward on pageshow. Seen 2026-10-01: Smith's, prerendered by a Google
// search, left the popup answering for google.com.
{
  const h = harness(() => ({ show: true }), [], 'https://shop.example/', undefined, { prerendering: true });
  h.tick(5000);
  const before = h.log.filter(x => x === 'evaluate').length;
  h.fire('document', 'prerenderingchange');
  check('a prerendered page sends PAGE again once it is activated',
        h.log.filter(x => x === 'evaluate').length, before + 1);
  h.fire('window', 'pageshow', { persisted: true });
  check('...and a page restored from the back/forward cache does too',
        h.log.filter(x => x === 'evaluate').length, before + 2);
  h.fire('window', 'pageshow', { persisted: false });
  check('...but not an ordinary load, which already did',
        h.log.filter(x => x === 'evaluate').length, before + 2);
  check('...and none of it mounts a second dock', h.log.filter(x => x === 'MOUNT').length, 1);
}

// 1b. Midnight. A tab left open from 30 September into 1 October must show the
// new quarter without a reload: the dock ranks again once the local day turns,
// and only once.
{
  let calls = 0;
  const h = harness(() => { calls++; return { show: true }; }, [],
                    'https://shop.example/', '2026-09-30T23:59:50');
  h.tick(5000);
  const before = calls;
  check('mounted before midnight', h.log.filter(x=>x==='MOUNT').length, 1);
  h.tick(4000);   // still 30 September
  check('no re-rank while the day is unchanged', calls, before);
  h.tick(3000);   // now 00:00:02 on 1 October
  check('the day turning re-ranks the open page', calls, before + 1);
  check('...and repaints the dock with the new answer',
        [h.log.filter(x=>x==='UNMOUNT').length, h.log.filter(x=>x==='MOUNT').length], [1, 2]);
  h.tick(10000);
  check('...once, not every second after', calls, before + 1);
}

// 2. Commerce SPA: mount, then a non-merchant route unmounts only after settle.
{
  const h = harness(() => ({ show: true }));
  h.tick(100);
  check('merchant page mounts', h.log.filter(x=>x==='MOUNT').length, 1);

  h.setRespond(() => ({ show: false }));
  h.nav('https://shop.example/about');
  h.tick(1100);
  check('a single miss does NOT unmount (mid-render guard)', h.log.includes('UNMOUNT'), false);
  h.tick(3000);
  check('a settled miss DOES unmount', h.log.includes('UNMOUNT'), true);

  h.setRespond(() => ({ show: true }));
  h.nav('https://shop.example/product/2');
  h.tick(1500);
  check('returning to a product remounts', h.log.filter(x=>x==='MOUNT').length, 2);
  check('polling never stops once the site has shown the dock', h.pollingLive(), true);
}

// 2b. A page that sells nothing gets no dock, and no amount of waiting changes
// that. The toolbar icon does not override it either: that icon opens the POPUP,
// which is its own surface, and the dock is what automatic mode puts on a page.
{
  const h = harness(() => ({ show: false }));
  h.tick(6000);
  check('a page that sells nothing never mounts the dock', h.log.includes('MOUNT'), false);
}

// 2d. What the dock does on an ordinary shop, which is the whole default
// experience: it appears, and it stays shut. The panel is a thing the reader
// asks for. Nothing here is new behaviour -- it had simply never been asserted,
// and "the dock opens by itself on every shop" is the complaint that says so.
{
  const h = harness(() => ({ show: true, checkout: false }));
  h.tick(1200);
  check('a merchant page mounts the dock', h.log.filter(x=>x==='MOUNT').length, 1);
  check('...and leaves the panel SHUT', h.log.includes('OPEN'), false);
}
// 2e. Checkout is the one place it opens itself, because that is the moment the
// answer stops being a suggestion.
{
  const h = harness(() => ({ show: true, checkout: true }));
  h.tick(1200);
  check('a checkout page mounts', h.log.filter(x=>x==='MOUNT').length, 1);
  check('...and opens the panel without being asked', h.log.includes('OPEN'), true);
}
// 2g. Never fight the reader: one auto-open per route, so a panel they closed
// stays closed while they keep shopping.
{
  const h = harness(() => ({ show: true, checkout: true }));
  h.tick(1200);
  const first = h.log.filter(x=>x==='OPEN').length;
  h.tick(6000);
  check('checkout opens the panel exactly once, not on every re-check',
        [first, h.log.filter(x=>x==='OPEN').length], [1, 1]);
}

// 3. Slow client-rendered store: first miss then a hit on the re-check.
{
  let calls=0;
  const h = harness(() => ({ show: ++calls > 1 }));
  h.tick(100);
  check('nothing on the first pass', h.log.includes('MOUNT'), false);
  h.tick(3000);
  check('mounts after the re-check', h.log.includes('MOUNT'), true);
}

// 3b. How FAST that re-check is, which is the whole reason the ladder exists.
// hotels.com serves no commerce markup at all -- it arrives with the framework
// -- so on sites like it the dock's speed is entirely the second look's speed.
// A single fixed 2.5s wait made every one of them take 2.5s.
{
  let calls=0;
  const h = harness(() => ({ show: ++calls > 1 }));
  h.tick(450);
  check('a page that hydrates fast gets its dock in well under half a second',
        h.log.includes('MOUNT'), true);
}
{
  // And a page that is genuinely slow is still waited for, rather than the
  // ladder giving up early in the name of speed. Seven evaluations on the load
  // ladder -- the first look plus six rungs -- so a page that only qualifies on
  // the seventh is one that qualifies at the very last moment, 3.5s in.
  let calls=0;
  const h = harness(() => ({ show: ++calls > 6 }));
  h.tick(3400);
  check('nothing yet on a page that hydrates right at the limit',
        h.log.includes('MOUNT'), false);
  h.tick(300);
  check('...but the last rung still catches it', h.log.includes('MOUNT'), true);
}

// 4. Checkout auto-opens once, and again on the next route.
{
  const h = harness(() => ({ show: true, checkout: true }));
  h.tick(100);
  const first = h.log.filter(x=>x==='MOUNT').length;
  check('checkout page mounts', first, 1);
}

// 5. Orphaned by an extension reload: must go quiet, not throw once a second.
{
  const h = harness(() => ({ show: true }));
  h.tick(100);
  check('dock is up before the reload', h.log.filter(x=>x==='MOUNT').length, 1);

  h.killContext();
  const before = h.log.filter(x=>x==='evaluate').length;
  let threw = null;
  try { for (let i=0;i<6;i++){ h.nav('https://shop.example/p/'+i); h.tick(4000); } }
  catch (e) { threw = e.message; }

  check('an orphaned script never throws', threw, null);
  check('...stops sending messages entirely',
        h.log.filter(x=>x==='evaluate').length, before);
  check('...stops polling', h.pollingLive(), false);
  check('...and removes its dead dock', h.log.includes('UNMOUNT'), true);
}

// 5b. An orphan on a page that never changes route must still stop.
{
  const h = harness(() => ({ show: true }));
  h.tick(100);
  h.killContext();
  const before = h.log.filter(x => x === 'evaluate').length;
  h.tick(5000);                       // no navigation at all
  check('orphan stops polling without needing a route change', h.pollingLive(), false);
  check('...sends nothing further', h.log.filter(x => x === 'evaluate').length, before);
  check('...and removes its dead dock', h.log.includes('UNMOUNT'), true);
}

// 6. Context dies between the liveness check and the call itself.
{
  const h = harness(() => ({ show: true }));
  h.tick(100);
  h.makeSendThrow();
  let threw = null;
  try { h.nav('https://shop.example/x'); h.tick(4000); } catch (e) { threw = e.message; }
  check('a throwing sendMessage is caught, not propagated', threw, null);
  check('...and shuts the orphan down', h.pollingLive(), false);
}

// 7. A blocked host must be inert: no messages, no dock, no timers.
{
  const h = harness(() => ({ show: true }), ['shop.example']);
  h.tick(6000);
  h.nav('https://shop.example/checkout');
  h.tick(6000);
  check('blocked host sends nothing', h.log.filter(x => x === 'evaluate').length, 0);
  check('...and never mounts', h.log.includes('MOUNT'), false);
  check('...and starts no polling', h.pollingLive(), false);
}
{
  const h = harness(() => ({ show: true }), ['other.example']);
  h.tick(200);
  check('an unrelated blocklist entry does not stop a normal site',
        h.log.includes('MOUNT'), true);
}

// 8. Host matching. These assertions used to live in the engine suite against a
// second, identical copy of this rule -- so the tested version was never the
// version the browser loaded. Now they run against src/hostmatch.js, which is.
{
  const h = harness();
  const B = (host, list) => h.isBlocked(host, list);
  check('exact host is blocked', B('paylocity.com', ['paylocity.com']), true);
  check('subdomains are blocked too', B('access.paylocity.com', ['paylocity.com']), true);
  check('www is normalised', B('www.paylocity.com', ['paylocity.com']), true);
  check('an entry with www still matches', B('access.paylocity.com', ['www.paylocity.com']), true);
  check('a lookalike suffix is not blocked', B('notpaylocity.com', ['paylocity.com']), false);
  check('unrelated hosts pass', B('allbirds.com', ['paylocity.com']), false);
  check('empty list blocks nothing', B('allbirds.com', []), false);
}

// 9. Blocking the site you are already on must take effect immediately. Before
// this, content.js read the list once at injection and never again: the dock
// stayed up, the poll kept ticking and PAGE messages kept being sent on a domain
// the user had just switched off.
{
  const h = harness(() => ({ show: true }), []);
  h.tick(200);
  check('dock is up before the block', h.log.includes('MOUNT'), true);
  const before = h.log.filter(x => x === 'evaluate').length;

  h.setBlocked(['shop.example']);
  check('blocking the current site unmounts it now, without a reload',
        h.log.includes('UNMOUNT'), true);
  check('...and stops the poll', h.pollingLive(), false);

  h.nav('https://shop.example/checkout');
  h.tick(6000);
  check('...and sends nothing afterwards',
        h.log.filter(x => x === 'evaluate').length, before);
}

// Unblocking runs the same path, so removing an entry brings the dock back
// without a reload either.
{
  const h = harness(() => ({ show: true }), ['shop.example']);
  h.tick(6000);
  check('blocked at injection, so nothing mounts', h.log.includes('MOUNT'), false);
  h.setBlocked([]);
  h.tick(200);
  check('unblocking mounts it without a reload', h.log.includes('MOUNT'), true);
  check('...and the poll is running again', h.pollingLive(), true);
}

// A change to some OTHER key must not disturb a running dock.
{
  const h = harness(() => ({ show: true }), []);
  h.tick(200);
  h.setBlocked(['other.example']);
  h.tick(200);
  check('an unrelated blocklist change leaves the dock alone',
        h.log.includes('UNMOUNT'), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
