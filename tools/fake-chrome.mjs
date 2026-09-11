// A fake `chrome.*` for the SERVICE WORKER, promise-style.
//
// Deliberately NOT shared with tools/test-lifecycle.mjs. That harness stubs the
// content-script world: `storage.local.get(keys, cb)` and `runtime.sendMessage(
// msg, cb)`, six methods, callback-style, inside a vm sandbox. The worker lives
// in the other half of the API -- promises, storage.session, scripting,
// permissions -- and one module pretending to be both would be a worse model of
// each. Two fakes of two different things is not two copies of one thing.
//
// Thin on purpose. This exists to let background.js run and to let a test say
// what it did, not to model Chrome. A failure here means the worker's contract
// changed; go and read it rather than patching the fake until it passes.
import { readFileSync } from 'node:fs';

const area = (initial = {}) => {
  let store = { ...initial };
  return {
    api: {
      get(keys) {
        if (keys == null) return Promise.resolve({ ...store });
        const list = Array.isArray(keys) ? keys : [keys];
        return Promise.resolve(Object.fromEntries(
          list.filter(k => k in store).map(k => [k, store[k]])));
      },
      set(obj) { Object.assign(store, obj); return Promise.resolve(); },
      remove(key) {
        for (const k of (Array.isArray(key) ? key : [key])) delete store[k];
        return Promise.resolve();
      },
      getBytesInUse: () => Promise.resolve(JSON.stringify(store).length)
    },
    read: () => ({ ...store }),
    write: obj => Object.assign(store, obj)
  };
};

/**
 * @param granted  whether <all_urls> is held at start
 * @param local    seed for chrome.storage.local
 * @param injectFails  make chrome.scripting.executeScript throw, as Chrome does
 *                     on its own pages, the Web Store and the PDF viewer
 * @param tabSendFails make chrome.tabs.sendMessage reject, which is what an
 *                     unanswered OPEN looks like from the worker's side
 */
export function makeChrome({ granted = false, local = {}, injectFails = false,
                             tabSendFails = false, registerFails = 0 } = {}) {
  const localArea = area(local);
  const sessionArea = area();
  const onMessage = [], onInstalled = [], onRemoved = [];
  const permAdded = [], permRemoved = [];
  const log = { created: [], injected: [], sentToTab: [], registered: [], options: 0 };
  let scripts = [];   // what registerContentScripts holds

  const chrome = {
    runtime: {
      getURL: p => `chrome-extension://test/${p}`,
      getManifest: () => ({ version: '0.0.0-test' }),
      lastError: null,
      id: 'test-worker-id',
      onMessage: { addListener: fn => onMessage.push(fn) },
      onInstalled: { addListener: fn => onInstalled.push(fn) },
      openOptionsPage: () => { log.options++; }
    },
    storage: {
      local: localArea.api,
      session: sessionArea.api,
      onChanged: { addListener: () => {} }
    },
    tabs: {
      create(opts) { log.created.push(opts.url); return Promise.resolve({ id: 99 }); },
      query: () => Promise.resolve([{ id: 1 }]),
      sendMessage(tabId, msg) {
        log.sentToTab.push({ tabId, msg });
        return tabSendFails
          ? Promise.reject(new Error('Could not establish connection.'))
          : Promise.resolve({ ok: true });
      },
      onRemoved: { addListener: fn => onRemoved.push(fn) }
    },
    permissions: {
      contains: () => Promise.resolve(granted),
      request: () => Promise.resolve(true),
      remove: () => Promise.resolve(true),
      onAdded: { addListener: fn => permAdded.push(fn) },
      onRemoved: { addListener: fn => permRemoved.push(fn) }
    },
    scripting: {
      getRegisteredContentScripts: ({ ids } = {}) =>
        Promise.resolve(scripts.filter(s => !ids || ids.includes(s.id))),
      registerContentScripts(list) {
        // registerFails counts DOWN, so 1 models the real case: a stale
        // registration the getter did not report, which fails once on a
        // duplicate id and succeeds after it is cleared.
        if (registerFails > 0) {
          registerFails--;
          log.registered.push(['register-failed', list.map(s => s.id)]);
          return Promise.reject(new Error('Duplicate script ID \'card-picker-auto\''));
        }
        scripts = scripts.concat(list);
        log.registered.push(['register', list.map(s => s.id)]);
        return Promise.resolve();
      },
      unregisterContentScripts({ ids }) {
        scripts = scripts.filter(s => !ids.includes(s.id));
        log.registered.push(['unregister', ids]);
        return Promise.resolve();
      },
      executeScript(opts) {
        log.injected.push(opts);
        return injectFails
          ? Promise.reject(new Error('Cannot access contents of the page.'))
          : Promise.resolve([{ result: null }]);
      }
    }
  };

  // The worker fetches its own bundled files. Back that with the REAL ones, so
  // these tests rank against the shipped cards.json rather than a fixture that
  // can quietly fall behind it.
  const fetchFile = url => {
    const rel = String(url).replace('chrome-extension://test/', '');
    const buf = readFileSync(new URL(`../${rel}`, import.meta.url));
    return Promise.resolve({
      json: () => Promise.resolve(JSON.parse(buf.toString('utf8'))),
      arrayBuffer: () => Promise.resolve(buf.buffer.slice(
        buf.byteOffset, buf.byteOffset + buf.byteLength))
    });
  };

  return {
    chrome,
    fetch: fetchFile,
    log,
    localStore: localArea,
    sessionStore: sessionArea,
    /** What the content script or popup does. Resolves to the worker's reply. */
    send(msg, sender = {}) {
      return new Promise((resolve, reject) => {
        let answered = false;
        const keepAlive = onMessage.map(fn =>
          fn(msg, sender, r => { answered = true; resolve(r); }));
        // A listener that returns true is promising to answer later. If none
        // did and none answered, nothing ever will -- which in Chrome is a
        // rejected sendMessage, not a hang.
        if (!answered && !keepAlive.some(Boolean)) {
          reject(new Error('The message port closed before a response was received.'));
        }
      });
    },
    install: (reason = 'install') => onInstalled.forEach(fn => fn({ reason })),
    closeTab: id => onRemoved.forEach(fn => fn(id)),
    /** Flip the grant the way Options does, and fire what Chrome fires. */
    grant() { granted = true; permAdded.forEach(fn => fn({ origins: ['<all_urls>'] })); },
    revoke() { granted = false; permRemoved.forEach(fn => fn({ origins: ['<all_urls>'] })); },
    registeredIds: () => scripts.map(s => s.id)
  };
}

/**
 * Boot a fresh copy of the worker against a fresh fake.
 *
 * background.js does real work at import time -- it clears a legacy key and
 * calls syncAutoMode() -- and node caches modules by specifier, so every start
 * needs a new one. The query string is what makes it new.
 */
let boot = 0;
export async function startWorker(opts = {}) {
  const env = makeChrome(opts);
  globalThis.chrome = env.chrome;
  globalThis.fetch = env.fetch;
  const mod = await import(`../src/background.js?boot=${++boot}`);
  // Let the import-time syncAutoMode() settle before a test reads registration.
  await new Promise(r => setTimeout(r, 0));
  return { ...env, mod };
}
