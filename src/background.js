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
      value: result.winner.value
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
      if (sender.tab && sender.tab.id != null) {
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

  // Manual mode: the toolbar click grants activeTab for this tab, which is
  // enough to inject the same content script for this visit only. No host
  // permission, no prompt, and nothing persists past the page.
  if (msg.type === 'INJECT') {
    (async () => {
      try {
        await chrome.scripting.executeScript({ target: { tabId: msg.tabId }, files: CONTENT_FILES });
        sendResponse({ ok: true });
      } catch (e) {
        // Chrome refuses injection on its own pages and on the Web Store.
        sendResponse({ ok: false, error: String(e.message || e) });
      }
    })();
    return true;
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

async function isAuto() {
  return chrome.permissions.contains({ origins: ['<all_urls>'] });
}

/** Register or unregister to match the permission. Safe to call repeatedly. */
export async function syncAutoMode() {
  const want = await isAuto();
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] })
    .catch(() => []);
  const have = existing.length > 0;
  if (want === have) return want;
  if (want) {
    await chrome.scripting.registerContentScripts([{
      id: SCRIPT_ID,
      matches: ['<all_urls>'],
      js: CONTENT_FILES,
      runAt: 'document_idle'
    }]);
  } else {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  }
  return want;
}

// A registration does not survive the extension being reloaded or updated, so
// re-assert it on every worker start rather than only when the grant changes.
syncAutoMode().catch(() => {});
chrome.permissions.onAdded.addListener(() => syncAutoMode().catch(() => {}));
chrome.permissions.onRemoved.addListener(() => syncAutoMode().catch(() => {}));

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});
