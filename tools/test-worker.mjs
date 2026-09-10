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
  const w = await startWorker({ granted: false });
  eq('worker start with no grant registers nothing', w.registeredIds(), []);
}
{
  // A registration does not survive a reload or an update, so the worker
  // re-asserts on every start rather than only when the grant changes. Starting
  // granted with an empty registry IS that case.
  const w = await startWorker({ granted: true });
  eq('worker start with the grant re-asserts the registration',
     w.registeredIds(), ['card-picker-auto']);
  eq('...for both content files, in manifest order',
     w.log.registered[0], ['register', ['card-picker-auto']]);
}
{
  const w = await startWorker({ granted: false });
  w.grant();
  await new Promise(r => setTimeout(r, 0));
  eq('granting <all_urls> registers the scripts', w.registeredIds(), ['card-picker-auto']);
  w.revoke();
  await new Promise(r => setTimeout(r, 0));
  eq('revoking it unregisters them', w.registeredIds(), []);
}
{
  // syncAutoMode is called on every worker start AND by both permission events,
  // so it has to be safe to call when nothing has changed.
  const w = await startWorker({ granted: true });
  const before = w.log.registered.length;
  await w.mod.syncAutoMode();
  await w.mod.syncAutoMode();
  eq('syncAutoMode is a no-op when the registry already matches the grant',
     w.log.registered.length, before);
}

// ---------- first run ----------
{
  const w = await startWorker();
  w.install('install');
  eq('install opens the setup flow', w.log.created, ['chrome-extension://test/src/welcome.html']);
}
{
  const w = await startWorker();
  w.install('update');
  eq('an update never interrupts someone already set up', w.log.created, []);
}

// ---------- the toolbar icon: INJECT then OPEN ----------
{
  const w = await startWorker();
  const res = await w.send({ type: 'INJECT', tabId: 7 });
  eq('INJECT reports success', res, { ok: true });
  eq('...injects both content files, in order',
     w.log.injected[0].files, ['src/hostmatch.js', 'src/content.js']);
  eq('...into the tab it was asked about', w.log.injected[0].target, { tabId: 7 });
  eq('...and then tells the script to open, rather than waiting for checkout',
     w.log.sentToTab, [{ tabId: 7, msg: { type: 'OPEN' } }]);
}
{
  // Chrome refuses its own pages, the Web Store and the PDF viewer. The popup
  // stays open and renders the ranking itself, so it needs a false, not a throw.
  const w = await startWorker({ injectFails: true });
  const res = await w.send({ type: 'INJECT', tabId: 7 });
  eq('a refused injection answers false rather than throwing', res, { ok: false });
  eq('...and sends OPEN to nothing', w.log.sentToTab, []);
}
{
  // The bug this pins: content.js used to ignore OPEN, so tabs.sendMessage
  // rejected, and the worker read a working page as a refused injection.
  const w = await startWorker({ tabSendFails: true });
  const res = await w.send({ type: 'INJECT', tabId: 7 });
  eq('an unanswered OPEN does NOT turn a successful injection into a failure',
     res, { ok: true });
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
}
{
  const w = await startWorker({ local: { instances: WALLET } });
  await w.send({ type: 'PAGE', hostname: 'doordash.com', signals: { price: true } },
                { tab: { id: 42 } });
  const cached = w.sessionStore.read()['tab:42'];
  eq('PAGE caches its answer per tab, so the popup can read it with no permission',
     cached && cached.category, 'dining');
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
