import { rank, isMerchantPage, isCheckoutPage,
         DEFAULT_FONT, overlayFont } from './engine.js';

// One-time cleanup of the removed snooze feature's leftover key. Safe to
// delete this line once it has run on every machine that had the old build.
chrome.storage.local.remove('snoozes');

let dataPromise = null;

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
  const s = await chrome.storage.local.get(['instances', 'prefs', 'valuations', 'overlayPos']);
  return {
    instances: s.instances || [],
    prefs: s.prefs || { categoryDefaults: {}, tieBand: 0.10 },
    valuationOverrides: s.valuations || {},
    // Sent down with the recommendation so the badge paints in the right
    // place on the first frame instead of jumping after a second read.
    overlayPos: s.overlayPos || { bottom: 16 }
  };
}

export async function recommend(hostname, signals) {
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
  // The overlay cannot import, so hand it the font already resolved.
  result.font = overlayFont(DEFAULT_FONT, chrome.runtime.getURL);
  // The overlay only appears on pages you can buy something on. The result is
  // still cached and still reachable from the toolbar popup either way.
  result.show = signals === undefined ||
    isMerchantPage(signals, !!result.merchant, !!(result.merchant && result.merchant.content_site));
  result.checkout = signals !== undefined && isCheckoutPage(signals);
  return result;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PAGE') {
    (async () => {
      const result = await recommend(msg.hostname, msg.signals || {});
      if (sender.tab && sender.tab.id != null) {
        // storage.session survives the service worker being torn down, so the
        // popup can still read the result without any tabs/host permission.
        await chrome.storage.session.set({ [`tab:${sender.tab.id}`]: result });
      }
      sendResponse(result);
    })();
    return true;
  }

  if (msg.type === 'RECOMMEND') {
    recommend(msg.hostname).then(sendResponse);
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

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});
