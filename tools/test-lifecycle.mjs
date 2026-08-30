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

function harness(initialRespond) {
  const log = [];
  let timers = [], now = 0, intervals = [];
  let href = 'https://shop.example/';
  let respond = initialRespond || (() => ({ show: false }));
  let throwOnSend = false;

  const fakeEl = () => new Proxy({}, { get(t, k) {
    if (k === 'classList') return { add(){}, remove(){}, toggle(){}, contains(){return false} };
    if (k === 'style') return new Proxy({}, { get:()=> '' , set:()=>true });
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
    window: {
      addEventListener(){}, removeEventListener(){},
      get innerWidth(){return 1400}, get innerHeight(){return 900},
    },
    document: {
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
    chrome: { runtime: {
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
           // Simulates reloading the extension, which orphans this script.
           killContext: () => { delete sandbox.chrome.runtime.id; },
           makeSendThrow: () => { throwOnSend = true; } };
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
  check('...and stops evaluating (<=8 evaluations for 12 routes)',
        h.log.filter(x=>x==='evaluate').length <= 8, true);
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

// 3. Slow client-rendered store: first miss then a hit on settle.
{
  let calls=0;
  const h = harness(() => ({ show: ++calls > 1 }));
  h.tick(100);
  check('nothing on the first pass', h.log.includes('MOUNT'), false);
  h.tick(3000);
  check('mounts after the settle re-check', h.log.includes('MOUNT'), true);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
