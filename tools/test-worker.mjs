// Service worker tests:  node tools/test-worker.mjs
//
// Runs the REAL src/background.js against a fake chrome.* (tools/fake-chrome.mjs)
// and the REAL data files. This is the permission and message plumbing: the half
// of the extension that the engine suite cannot reach, because it is all chrome.*,
// and that the lifecycle suite cannot reach, because that sandbox runs content.js
// alone with the worker replaced by a stub.
//
// Everything here was previously verified by loading the extension and watching
// it, which is why the INJECT path had already shipped one bug that looked like a
// refused injection and was really an unanswered message.
import { readFileSync } from 'node:fs';
import { startWorker } from './fake-chrome.mjs';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' :
    `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`}`);
};

// ---------- automatic mode ----------
{
  // THE DEFAULT, and the reason this all changed. A fresh install has no prefs
  // at all, and the dock has to appear anyway. It used to require finding a
  // switch, which meant a new user saw nothing on any site and had no way to
  // tell whether that was the extension or the page.
  const w = await startWorker();
  eq('a fresh install registers automatically, with no prefs and no prompt',
     w.registeredIds(), ['card-picker-auto']);
  eq('...for both content files, under one id',
     w.log.registered[0], ['register', ['card-picker-auto']]);
  // Pinned because it is a measured decision that would regress silently.
  // document_idle waits for the LOAD event; on bestbuy.com that was 3.4s after
  // the DOM was usable, which is the whole of "why is the pill slow".
  eq('...at document_end, so the dock does not wait for every image on the page',
     w.registeredScripts()[0].runAt, 'document_end');
  eq('...injecting the blocklist rule before the script that reads the DOM',
     w.registeredScripts()[0].js, ['src/hostmatch.js', 'src/content.js']);
  eq('...and reports itself wanted, permitted and running',
     await w.mod.syncAutoMode(), { wanted: true, permitted: true, registered: true });
}
{
  const w = await startWorker({ local: { prefs: { autoMode: false } } });
  eq('turning it off unregisters everything', w.registeredIds(), []);
  eq('...and says the reader asked for that, not that anything failed',
     await w.mod.syncAutoMode(), { wanted: false, permitted: true, registered: false });
}
{
  // Chrome's own site-access control can withhold the host permission even
  // though the manifest declares it. That is NOT the reader turning it off, and
  // the two must not read the same: one is a choice, the other is a fault.
  const w = await startWorker({ granted: false });
  eq('a withheld host permission registers nothing', w.registeredIds(), []);
  eq('...and is reported as wanted but not permitted',
     await w.mod.syncAutoMode(), { wanted: true, permitted: false, registered: false });
}
{
  const w = await startWorker({ local: { prefs: { autoMode: false } } });
  await w.localStore.write({ prefs: { autoMode: true } });
  await w.mod.syncAutoMode();
  eq('switching it back on re-registers', w.registeredIds(), ['card-picker-auto']);
}
{
  // syncAutoMode runs on every worker start and on every prefs write, so it has
  // to be safe to call when nothing has changed.
  const w = await startWorker();
  const before = w.log.registered.length;
  await w.mod.syncAutoMode();
  await w.mod.syncAutoMode();
  eq('syncAutoMode is a no-op when the registry already matches',
     w.log.registered.length, before);
}

{
  // The failure that made this whole thing invisible. A registration outlived
  // the worker, the getter did not report it, and registering hit a duplicate
  // id -- which every call site swallowed. Options kept saying ALWAYS ON,
  // because it was reading the PERMISSION, and no dock ever appeared.
  //
  // Asserted on the state left by the worker's OWN start-up sync, not by a
  // later call. Written the other way first, it passed under a mutation that
  // deleted the retry entirely: the start-up sync ate the failure, and the
  // test's own second call then registered cleanly and looked like recovery.
  const w = await startWorker({ registerFails: 1 });
  eq('a duplicate-id failure at start-up is recovered from, not swallowed',
     w.registeredIds(), ['card-picker-auto']);
  eq('...by clearing the stale registration and registering again',
     w.log.registered.map(r => r[0]), ['register-failed', 'unregister', 'register']);
}
{
  // When it genuinely cannot register, say so rather than reporting success.
  const w = await startWorker({ registerFails: 99 });
  const st = await w.mod.syncAutoMode();
  eq('an unrecoverable failure reports wanted-and-permitted but not running',
     [st.wanted, st.permitted, st.registered], [true, true, false]);
  eq('...and carries the reason with it', typeof st.error, 'string');
}
{
  // What Options asks. Asking is also the repair, because it re-asserts.
  const w = await startWorker();
  eq('AUTO_STATE reports all three facts Options renders',
     await w.send({ type: 'AUTO_STATE' }),
     { wanted: true, permitted: true, registered: true });
}

// ---------- first run ----------
{
  const w = await startWorker();
  w.install('install');
  await new Promise(r => setTimeout(r, 0));
  eq('install opens the setup flow', w.log.created, ['chrome-extension://test/src/welcome.html']);
  // What sends the toolbar icon and Settings back to setup until FINISH.
  eq('...and marks setup unfinished, at its first step', w.localStore.read().setupPending, 'intro');
}
{
  const w = await startWorker();
  w.install('update');
  await new Promise(r => setTimeout(r, 0));
  eq('an update never interrupts someone already set up', w.log.created, []);
  // An install from before the key existed has none, which reads as set up. If
  // an update armed it, every existing user would be marched back through setup.
  eq('...and never marks setup unfinished', 'setupPending' in w.localStore.read(), false);
}

// ---------- the toolbar icon: INJECT then OPEN ----------
{
  const w = await startWorker();
  const res = await w.send({ type: 'INJECT', tabId: 7 });
  eq('INJECT reports success', res, { ok: true });
  eq('...injects both content files, in order',
     w.log.injected[0].files, ['src/hostmatch.js', 'src/content.js']);
  eq('...into the tab it was asked about', w.log.injected[0].target, { tabId: 7 });
  // The popup injects to get a real answer, NOT to summon the dock. The toolbar
  // icon's surface is the popup; the dock belongs to automatic mode. Conflating
  // them is what left the popup closing itself on every injectable site, taking
  // the only route to Settings with it.
  eq('...and tells the page nothing, because the dock is not the icon\'s job',
     w.log.sentToTab, []);
}
{
  // Chrome refuses its own pages, the Web Store and the PDF viewer. The popup
  // stays open and renders the ranking itself, so it needs a false, not a throw.
  const w = await startWorker({ injectFails: true });
  const res = await w.send({ type: 'INJECT', tabId: 7 });
  eq('a refused injection answers false rather than throwing', res, { ok: false });
}

// ---------- recommendations and the per-tab cache ----------
const WALLET = [{ productId: 'chase-freedom-unlimited', config: {} },
                { productId: 'wellsfargo-active-cash', config: {} }];
{
  const w = await startWorker({ local: { instances: WALLET } });
  const res = await w.send({ type: 'RECOMMEND', hostname: 'doordash.com' });
  eq('RECOMMEND ranks against the real cards.json', res.category, 'dining');
  eq('...and picks the 3x dining card over the 2% flat',
     res.winner.productId, 'chase-freedom-unlimited');
  // The popup titles itself with res.hostname. Without it the header reads
  // "No merchant detected" over a body that has correctly named the merchant.
  eq('...and carries the hostname the popup titles itself with',
     res.hostname, 'doordash.com');
}
{
  const w = await startWorker({ local: { instances: WALLET } });
  await w.send({ type: 'PAGE', hostname: 'doordash.com', signals: { price: true } },
                { tab: { id: 42 } });
  const cached = w.sessionStore.read()['tab:42'];
  eq('PAGE caches its answer per tab, so the popup can read it with no permission',
     cached && cached.category, 'dining');
  // Stamped with the local day it was ranked on: the popup ranks again rather
  // than show a copy from before a midnight when a new quarter started.
  eq('...stamped with the day it was ranked on', cached && cached.rankedOn, new Date().toDateString());
  w.closeTab(42);
  await new Promise(r => setTimeout(r, 0));
  eq('closing the tab drops the cache', 'tab:42' in w.sessionStore.read(), false);
}

// ---------- tie-break defaults ----------
{
  const w = await startWorker({ local: { instances: WALLET } });
  await w.send({ type: 'SET_DEFAULT', category: 'dining', productId: 'wellsfargo-active-cash' });
  eq('SET_DEFAULT saves the choice the overlay made',
     w.localStore.read().prefs.categoryDefaults, { dining: 'wellsfargo-active-cash' });
  await w.send({ type: 'CLEAR_DEFAULT', category: 'dining' });
  eq('CLEAR_DEFAULT takes it back off, so the state is escapable',
     w.localStore.read().prefs.categoryDefaults, {});
}
{
  const w = await startWorker({ local: { instances: WALLET } });
  await w.send({ type: 'SET_POS', pos: { bottom: 240 } });
  eq('SET_POS stores the dock position globally',
     w.localStore.read().overlayPos, { bottom: 240 });
}
{
  const w = await startWorker({ local: { instances: WALLET } });
  await w.send({ type: 'OPEN_OPTIONS' });
  eq('the dock\'s gear opens Settings', w.log.options, 1);
}

// ---------- permissions are frozen ----------
{
  // David's rule, 2026-09-28: once a reader installs Caddy they never approve it
  // again. Chrome installs updates silently, EXCEPT one that adds a permission
  // with a warning: that update is disabled until the reader re-approves, and a
  // reader who does not click loses the extension. This set already covers every
  // site (<all_urls>), so nothing Caddy does needs more. Any change here -- even
  // a warning-free permission, or an optional one requested at runtime, which is
  // its own prompt -- is a decision for David, not a way to get a test green.
  const m = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  eq('permissions are exactly the ones readers approved at install',
     [m.permissions, m.host_permissions, m.optional_permissions, m.optional_host_permissions,
      m.content_scripts],
     [['storage', 'activeTab', 'scripting'], ['<all_urls>'], undefined, undefined, undefined]);
}

// ---------- reaching Settings ----------
{
  // A source-level guard, and deliberately so. For one release the toolbar click
  // handed off to the overlay and closed the popup -- and the popup held the only
  // Settings button in the product, so with automatic mode on a reader could not
  // reach their own settings at all. Nothing caught it, because every surface
  // still worked in isolation. What went untested was the claim that a route
  // EXISTS. A grep is a poor test of behaviour and the right test of reachability.
  const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  eq('the popup opens Settings', src('popup.js').includes('openOptionsPage'), true);
  eq('...and the popup is what the toolbar icon shows',
     JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
       .action.default_popup, 'src/popup.html');
  eq('...and it never closes itself, which is what took Settings away',
     src('popup.js').includes('window.close()'), false);
  // The other route that has to exist: back into an unfinished setup, from both
  // places a reader goes looking for the extension, and out of it only by FINISH.
  eq('while setup is unfinished, the toolbar icon goes back to it',
     /if \(setupPending\) \{[^]*welcome\.html/.test(src('popup.js')), true);
  eq('...and so does Settings', /setupPending[^]*location\.replace\([^)]*welcome\.html/.test(src('options.js')), true);
  eq('...and only FINISH clears it', src('welcome.js').includes("remove('setupPending')"), true);
}

// ---------- the activity log ----------
const page = (w, hostname) =>
  w.send({ type: 'PAGE', hostname, signals: { price: true, cartLink: true } },
         { tab: { id: 1 } });
{
  const w = await startWorker({ local: { instances: WALLET } });
  await page(w, 'doordash.com');
  await new Promise(r => setTimeout(r, 0));
  eq('nothing is recorded until the log is switched on',
     w.localStore.read().activity, undefined);
}
{
  const w = await startWorker({
    local: { instances: WALLET, prefs: { categoryDefaults: {}, activityLog: true } } });
  await page(w, 'doordash.com');
  await page(w, 'doordash.com');
  await new Promise(r => setTimeout(r, 0));
  const rows = w.localStore.read().activity;
  eq('switched on, it records the recommendation', rows.length, 1);
  eq('...and an SPA repeating the same answer collapses into the row already there',
     rows[0].host, 'doordash.com');
  eq('...storing the domain and the card, never an amount or a card number',
     Object.keys(rows[0]).sort(), ['at', 'card', 'category', 'host', 'value']);
}
{
  const w = await startWorker({
    local: { instances: WALLET, prefs: { categoryDefaults: {}, activityLog: true } } });
  // Alternating hosts, so nothing collapses: 40 writes against a cap of 30.
  for (let i = 0; i < 40; i++) await page(w, i % 2 ? 'doordash.com' : 'grubhub.com');
  await new Promise(r => setTimeout(r, 0));
  eq('the log is capped at thirty, newest first',
     w.localStore.read().activity.length, 30);
}

// ---------- legacy cleanup ----------
{
  const w = await startWorker({ local: { snoozes: ['example.com'], instances: WALLET } });
  await new Promise(r => setTimeout(r, 0));
  eq('the removed snooze feature\'s key is cleared on start',
     'snoozes' in w.localStore.read(), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
