import { rank, isMerchantPage, isCheckoutPage, normalizeHost,
         FONT_FILE, overlayFont } from './engine.js';

// One-time cleanup of the removed snooze feature's leftover key. Safe to
// delete this line once it has run on every machine that had the old build.
chrome.storage.local.remove('snoozes');

let dataPromise = null;
let fontPromise = null;

// Rotated whenever the service worker restarts, which in MV3 is constantly. It
// only has to stop the injected @font-face carrying a stable, guessable name.
const FONT_NONCE = Math.random().toString(36).slice(2, 10);

/**
 * The overlay's font as a data: URI.
 *
 * Inlined rather than served from web_accessible_resources. A web-accessible
 * file is a fixed chrome-extension:// URL that ANY page can fetch to prove the
 * extension is installed -- a stronger signal than anything in the DOM, since it
 * needs no access to the page at all. There is now no web-accessible resource to
 * probe. Read once and cached: the worker can fetch its own bundled files
 * without declaring them accessible to anyone.
 */
function fontUrl() {
  if (!fontPromise) {
    fontPromise = fetch(chrome.runtime.getURL(FONT_FILE))
      .then(r => r.arrayBuffer())
      .then(buf => {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return 'data:font/woff2;base64,' + btoa(bin);
      });
  }
  return fontPromise;
}

function loadData() {
  if (!dataPromise) {
    dataPromise = Promise.all(
      ['cards', 'merchants', 'valuations', 'categories'].map(n =>
        fetch(chrome.runtime.getURL(`data/${n}.json`)).then(r => r.json())
      )
    ).then(([products, merchants, valuations, categories]) =>
      ({ products, merchants, valuations, categories })
    );
  }
  return dataPromise;
}

async function getState() {
  const s = await chrome.storage.local.get(['instances', 'prefs', 'valuations', 'overlayPos', 'theme']);
  return {
    instances: s.instances || [],
    prefs: s.prefs || { categoryDefaults: {}, tieBand: 0.10 },
    valuationOverrides: s.valuations || {},
    // Sent down with the recommendation so the badge paints in the right
    // place on the first frame instead of jumping after a second read.
    overlayPos: s.overlayPos || { bottom: 16 },
    // 'light' | 'dark' | undefined. Undefined means follow the OS, which is
    // the only thing the overlay can decide for itself.
    theme: s.theme
  };
}

export async function recommend(hostname, signals, wantFont = false) {
  const data = await loadData();
  const st = await getState();
  const result = rank({
    hostname,
    signals: signals || {},
    merchants: data.merchants,
    products: data.products,
    instances: st.instances,
    valuations: { ...data.valuations, ...st.valuationOverrides },
    prefs: st.prefs
  });
  result.overlayPos = st.overlayPos;
  result.theme = st.theme;
  // Local calendar day this was ranked on. Rates change at local midnight, so
  // a copy from an earlier day is not reused.
  result.rankedOn = new Date().toDateString();
  // The overlay cannot import, so hand it the font already resolved. Only when
  // it asks: the faces are inlined as base64 now, so shipping them on every
  // route change of an SPA would mean ~43KB per navigation for nothing.
  if (wantFont) {
    const url = await fontUrl();
    result.font = overlayFont(() => url, FONT_NONCE);
  }
  // The overlay only appears on pages you can buy something on. The result is
  // still cached and still reachable from the toolbar popup either way.
  result.show = signals === undefined ||
    isMerchantPage(signals, !!result.merchant, !!(result.merchant && result.merchant.content_site));
  result.checkout = signals !== undefined && isCheckoutPage(signals);
  return result;
}

// ---------- activity ----------
//
// The last thirty recommendations, so Options can show what the ranker decided
// and the user can check it. Domain, category, card and rate only -- no URL, no
// path, no amount, no card number -- and it never leaves this machine.
//
// OFF unless prefs.activityLog is explicitly true. This is the only place the
// extension keeps a record of where you have been, so it is the one feature that
// has to be asked for rather than arrived at. The flag is read on every write,
// not cached: turning it off in Options must stop the next page, not the next
// service worker.
const ACTIVITY_MAX = 30;
let activityWrite = Promise.resolve();

/** Read-modify-write, and two tabs can land together, so the writes are chained. */
function logActivity(result) {
  activityWrite = activityWrite.then(async () => {
    const { activity = [], prefs = {} } = await chrome.storage.local.get(['activity', 'prefs']);
    if (!prefs.activityLog) return;
    const entry = {
      at: Date.now(),
      host: result.merchant ? result.merchant.domain : normalizeHost(result.hostname),
      category: result.category,
      card: result.winner.name,
      value: result.winner.value,
      est: result.winner.est
    };
    // An SPA fires PAGE on every route change, so collapse a repeat of the same
    // answer on the same site into the row that is already there.
    const head = activity[0];
    const next = head && head.host === entry.host && head.card === entry.card
      ? [entry, ...activity.slice(1)]
      : [entry, ...activity];
    await chrome.storage.local.set({ activity: next.slice(0, ACTIVITY_MAX) });
  }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PAGE') {
    (async () => {
      const result = await recommend(msg.hostname, msg.signals || {}, !!msg.wantFont);
      // A prerendered page is not the tab's page yet: writing its answer would
      // put the next site's ranking in the popup of the one still showing. It
      // sends PAGE again once it is activated (content.js).
      if (sender.tab && sender.tab.id != null && sender.documentLifecycle !== 'prerender') {
        // storage.session survives the service worker being torn down, so the
        // popup can still read the result without any tabs/host permission.
        await chrome.storage.session.set({ [`tab:${sender.tab.id}`]: result });
      }
      // Only what the user was actually shown, and never awaited: the overlay
      // must not wait on a history write to paint.
      if (result.show && result.winner) logActivity(result);
      sendResponse(result);
    })();
    return true;
  }

  if (msg.type === 'RECOMMEND') {
    recommend(msg.hostname).then(sendResponse);
    return true;
  }

  // The popup asks for this so it can answer from real page signals rather than
  // a table lookup. It cannot call chrome.scripting itself without duplicating
  // CONTENT_FILES, and one copy of that list is the point.
  //
  // The click that opened the popup granted activeTab for this tab, which is
  // enough to inject for this visit only: no host permission, no prompt,
  // nothing that persists past the page.
  //
  // It does NOT tell the dock to open. The toolbar icon's surface is the popup;
  // the dock is what automatic mode puts on the page, and conflating the two is
  // what left the popup closing itself on every site it could inject into.
  if (msg.type === 'INJECT') {
    (async () => {
      try {
        await chrome.scripting.executeScript({ target: { tabId: msg.tabId }, files: CONTENT_FILES });
        sendResponse({ ok: true });
      } catch (e) {
        // Chrome refuses its own pages, the Web Store and the PDF viewer. The
        // popup answers from the merchant table instead.
        sendResponse({ ok: false });
      }
    })();
    return true;
  }

  // What Options renders instead of guessing from the permission alone. The
  // two can disagree, and when they do it is the registration that decides
  // whether anything happens on a page.
  if (msg.type === 'AUTO_STATE') {
    syncAutoMode().then(sendResponse);
    return true;
  }

  // The dock's gear. Opens Settings, or brings an open Settings tab forward.
  if (msg.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'SET_POS') {
    chrome.storage.local.set({ overlayPos: msg.pos }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'CLEAR_DEFAULT') {
    (async () => {
      const { prefs = {} } = await chrome.storage.local.get('prefs');
      if (prefs.categoryDefaults) delete prefs.categoryDefaults[msg.category];
      await chrome.storage.local.set({ prefs });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'SET_DEFAULT') {
    (async () => {
      const { prefs = { categoryDefaults: {} } } = await chrome.storage.local.get('prefs');
      prefs.categoryDefaults = prefs.categoryDefaults || {};
      prefs.categoryDefaults[msg.category] = msg.productId;
      await chrome.storage.local.set({ prefs });
      sendResponse({ ok: true });
    })();
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => chrome.storage.session.remove(`tab:${tabId}`));

// ---------- automatic mode ----------
//
// The extension used to declare a static content script on <all_urls>, so the
// install prompt read "read and change all your data on all websites" before the
// user had agreed to anything. That permission is now OPTIONAL and off by
// default: Options asks for it, and only once it is granted does the same pair of
// files get registered, at runtime, for the same matches.
//
// Deliberately NOT narrowed to the merchant table instead. Host permissions
// declared in the manifest are re-prompted when they change, and Chrome DISABLES
// the extension until the user re-approves -- so a table that is meant to grow
// would knock the extension offline on every data release. Keeping the grant
// coarse and optional means merchants.json can grow without touching permissions
// at all.
const SCRIPT_ID = 'card-picker-auto';
const CONTENT_FILES = ['src/hostmatch.js', 'src/content.js'];

/**
 * Automatic mode is a PREFERENCE now, not a permission.
 *
 * <all_urls> moved into the manifest so the dock works the moment the extension
 * is installed. It used to be optional and off, which meant a new user saw
 * nothing at all until they found a switch -- and the switch reported the
 * permission rather than the registration, so it could not even tell them.
 *
 * Chrome's own site-access control can still withhold the permission, so both
 * are checked: the user's preference, and whether the browser is honouring it.
 * When they disagree, Options says NOT RUNNING rather than claiming success.
 */
async function autoWanted() {
  const { prefs = {} } = await chrome.storage.local.get('prefs');
  return prefs.autoMode !== false;              // absent means ON
}
const autoPermitted = () => chrome.permissions.contains({ origins: ['<all_urls>'] });

const SCRIPT = {
  id: SCRIPT_ID,
  matches: ['<all_urls>'],
  js: CONTENT_FILES,
  // document_end, not document_idle. `idle` waits for the LOAD event -- every
  // image, script and ad tag on the page -- and on a retail homepage that is
  // seconds after the DOM is usable. Measured 2026-09-11 on bestbuy.com:
  // DOMContentLoaded ended at 3.77s and load at 7.15s, so `idle` was costing
  // 3.4 seconds of a dock that had everything it needed to render.
  //
  // `end` runs once the DOM is complete, which is all collectSignals needs.
  // The cost is that a client-rendered store may have less markup this early,
  // and that is already covered: a first miss is never conclusive, and the
  // SETTLE re-check 2.5s later catches anything that hydrated late.
  runAt: 'document_end'
};

/** What is ACTUALLY registered, which is the only thing that makes a dock appear. */
async function isRegistered() {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] })
    .catch(() => []);
  return existing.length > 0;
}

/**
 * Register or unregister to match the permission. Safe to call repeatedly.
 *
 * Returns the real state rather than the intended one, because those came apart
 * and nobody could see it: Options read the PERMISSION and called that
 * automatic mode, so the moment the grant existed it said ALWAYS ON whether or
 * not a single content script was registered. Every call site swallowed the
 * failure. The result was a setting that said it was on, a dock that never
 * appeared, and no way to tell which of the two was lying.
 */
export async function syncAutoMode() {
  // Three separate facts, because any two of them can disagree and the reader
  // needs to know WHICH one is wrong: what they asked for, whether the browser
  // is honouring it, and whether anything is actually registered.
  const wanted = await autoWanted();
  const permitted = await autoPermitted();
  const want = wanted && permitted;
  let registered = await isRegistered();
  const state = () => ({ wanted, permitted, registered });
  if (want === registered) return state();

  try {
    if (want) await chrome.scripting.registerContentScripts([SCRIPT]);
    else await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  } catch (e) {
    // The known way this fails: a registration that outlived the worker but
    // that getRegisteredContentScripts did not report, so registering hits a
    // duplicate id. Clear it and try once more rather than leaving the user
    // with a switch that is on and does nothing.
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
      if (want) await chrome.scripting.registerContentScripts([SCRIPT]);
    } catch (e2) {
      registered = await isRegistered();
      return { ...state(), error: String(e2.message || e2) };
    }
  }
  registered = await isRegistered();
  return state();
}

// A registration does not survive the extension being reloaded or updated, so
// re-assert it on every worker start rather than only when the grant changes.
syncAutoMode().catch(() => {});
chrome.permissions.onAdded.addListener(() => syncAutoMode().catch(() => {}));
chrome.permissions.onRemoved.addListener(() => syncAutoMode().catch(() => {}));
// The switch is a stored pref now, so a write to it has to re-assert too.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.prefs) syncAutoMode().catch(() => {});
});

// First run goes to the setup flow, not to Options. Options is a settings page
// -- it opens on a catalogue of fourteen cards with no explanation of what the
// extension does, why nothing appears on any site yet, or that automatic mode
// exists. Only on `install`: an update must never interrupt someone who is
// already set up.
//
// `setupPending` is what makes setup survive a closed tab. While it is set, the
// toolbar icon and Settings both send the reader back to setup, and its value
// is the step they had reached; FINISH removes it, and nothing sets it again.
// Armed here and only here, so an install that predates it has no key and reads
// as set up -- there is nothing to migrate.
chrome.runtime.onInstalled.addListener(async details => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({ setupPending: 'intro' });
    chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome.html') });
  }
});
