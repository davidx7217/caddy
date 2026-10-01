// Content script. Deliberately dumb and dependency-free: it renders whatever
// the service worker hands back and nothing else. MV3 content scripts are
// classic scripts, so no imports here.
//
// Collapsed to a dock by default. The icon toggles the panel, the panel's x
// collapses it again, and the dotted grip drags the dock up and down the
// right rail. The dock is always present on a recognised merchant.
//
// The panel is absolutely positioned against the dock rather than being a
// flex sibling of it. That matters: as a sibling it changed the wrapper's
// height, which moved the dock itself whenever the panel opened or flipped
// sides -- the dock would jump out from under the cursor mid-drag and end up
// hidden behind its own panel near the top of the screen.
(() => {
  if (window.__cardPickerMounted) return;
  window.__cardPickerMounted = true;

  const RAIL_RIGHT = 16, DOCK_H = 44, GAP = 10, EDGE = 8;

  const money = v => `${v.toFixed(2)}%`;

  // Why this card won. Without it, "saved choice" and "genuinely the only
  // winner" look identical, which made a real bug impossible to diagnose.
  // Only the saved-choice case is still rendered. The others narrated the
  // ranker's working -- "across 6 cards - clear winner" -- which the card name
  // and the rate beside it already say. This one stays because it is the label
  // on a control: a choice you made here has to be undoable here.
  const WHY = { category_default: 'your saved choice for this category' };
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const MARK = `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
      <path d="M2.5 10h19" stroke="currentColor" stroke-width="2"/>
    </svg>`;

  const GEAR = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
    </svg>`;

  const GRIP = `<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
      ${[3, 8, 13].map(y => `<circle cx="3" cy="${y}" r="1.3"/><circle cx="7" cy="${y}" r="1.3"/>`).join('')}
    </svg>`;

  const TOKENS = {
    // Dock and panel sit on the theme's own ground, like the popup: a light
    // theme means light overlay chrome. --fill is a block lifted off that
    // ground without a border.
    light: { surface: '#f6f4f0', ink: '#1a1917', muted: '#635e58', line: '#cfcbc2',
             warn: '#7c5310', warnLine: '#d4b483', fill: 'rgba(26,25,23,.05)',
             hover: 'rgba(26,25,23,.07)', grip: 'rgba(26,25,23,.10)' },
    dark:  { surface: '#1f1e1b', ink: '#efece5', muted: '#9c968c', line: '#35332e',
             warn: '#dcbb74', warnLine: '#6b5a33', fill: 'rgba(239,236,229,.06)',
             hover: 'rgba(239,236,229,.08)', grip: 'rgba(239,236,229,.10)' }
  };

  /** `stored` is 'light', 'dark', or undefined for "whatever the OS says". */
  function applyTheme(host, stored) {
    const dark = stored === 'dark' || (stored !== 'light' &&
      typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
    for (const [k, v] of Object.entries(TOKENS[dark ? 'dark' : 'light'])) {
      host.style.setProperty('--' + k, v);
    }
  }

  // Give up polling after this many misses in a row on a site that has never
  // shown the dock. Generous on purpose: a client-rendered store whose landing
  // page exposes nothing still gets several routes to prove itself.
  const MAX_MISSES = 5;
  // Gaps between re-checks after a miss. Two ladders, because the two cases are
  // not the same problem.
  //
  // ON LOAD the page may not have rendered itself yet. hotels.com serves 25KB
  // with no JSON-LD, no og:type, no cart link and no price -- everything
  // arrives with the framework -- so the dock's speed there IS the speed of the
  // re-check. One fixed 2.5s wait made every such site take 2.5s. A ladder
  // takes the first attempt that hits: hydrate in half a second and the dock is
  // there in half a second, and a slow page still gets its 3.5s.
  //
  // ON A ROUTE CHANGE the framework is already running, so signals appear
  // quickly or not at all. A long ladder there only delays UNMOUNTING a dock
  // that is now wrong, so it is short: 1.5s, where the old single wait took 2.5.
  // Cumulative from the first look: 300ms, 600, 1.0s, 1.5s, 2.2s, 3.5s.
  //
  // Measured on hotels.com 2026-09-11: DOMContentLoaded at 752ms, load at
  // 2142ms, and the ONLY signal it ever produces is price text -- no cart link,
  // no JSON-LD, og:type "website". The served HTML contains no "$" at all, so
  // that price arrives somewhere inside that 1.4s window. Whatever the dock
  // costs beyond hydration is the gap to the next rung, so the rungs are close
  // together exactly where pages tend to finish and spread out afterwards.
  const LOAD_RETRY_MS = [300, 300, 400, 500, 700, 1300];
  // Shorter, because the framework is already running: 300ms, 700, 1.5s.
  const ROUTE_RETRY_MS = [300, 400, 800];

  // Our @font-face <style> in the page's head, held by reference rather than
  // found by id. A fixed id like "__card-picker-fonts" was a second thing any
  // page could look for; nothing needs to find this element but us.
  let fontEl = null;
  let fontFamilyStack = null;

  let mounted = null;      // { open, isOpen, destroy } once the dock exists
  let everMounted = false; // once true, never stop watching this page
  let autoOpened = false;  // at most one auto-open per page or SPA route
  let misses = 0;
  let lastUrl = location.href;
  let poll = null;
  // Rates are dated by the local calendar day: a rotating quarter starts at local
  // midnight. A tab left open across that midnight must show the new quarter
  // without a reload, so the dock remembers the day it was ranked on.
  const today = () => new Date().toDateString();
  let rankedOn = null;

  // Sites the user has excluded are checked FIRST, before any DOM is read.
  // On a blocked host this script does nothing at all: no signals collected,
  // no message sent, no timers started.
  //
  // The matching lives in src/hostmatch.js, loaded ahead of this file in the same
  // isolated world. One copy, and it is the one that runs.
  let started = false;

  function applyBlocklist(blocked) {
    const off = __cpIsBlockedHost(location.hostname, blocked);
    if (off && started) {
      started = false;
      shutdown();
    } else if (!off && !started) {
      started = true;
      // A page that gave up polling before must get a fresh count, or unblocking
      // it would restart a script that immediately stops again.
      misses = 0;
      start();
    }
  }

  // The popup reads this tab's ranking from a cache that only PAGE writes, and
  // two kinds of page send PAGE before they are the tab's page. A prerendered one
  // (Google prerenders search results; seen 2026-10-01 on Smith's) ranks while
  // hidden, so the write misses the tab and the popup kept answering for
  // google.com. A page restored by Back or Forward does not rerun this script at
  // all. Say it again the moment either becomes the page you are looking at.
  // evaluate() never mounts a second dock, so on a page with one this only
  // refreshes the popup's copy.
  const reannounce = () => { if (started) evaluate(null); };
  if (document.prerendering) document.addEventListener('prerenderingchange', reannounce, { once: true });
  window.addEventListener('pageshow', e => { if (e.persisted) reannounce(); });

  chrome.storage.local.get('blocked', ({ blocked = [] }) => {
    if (chrome.runtime.lastError) return;
    applyBlocklist(blocked);
  });

  // Blocking a site you are ALREADY ON has to take effect now, not at the next
  // reload. Without this the dock stayed up, the poll kept ticking and PAGE
  // messages kept being sent on a domain the user had just switched off, which
  // made the only control they have over the extension look broken. Unblocking
  // is handled by the same path, so removing an entry brings the dock back
  // without a reload too.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.blocked) applyBlocklist(changes.blocked.newValue || []);
    // Repaint in place rather than remount: switching theme in Options must not
    // close a panel the user has open.
    if (changes.theme && mounted) mounted.setTheme(changes.theme.newValue);
  });

  /**
   * Look now, and keep looking on a curve until something is there.
   *
   * A miss is the WHOLE ladder coming up empty, not each attempt in it.
   * Counting attempts would spend the give-up budget inside a single page load
   * and kill the route poll on an SPA that was merely slow to hydrate.
   */
  function settle(step, onGiveUp, ladder) {
    evaluate(() => {
      if (step < ladder.length) {
        setTimeout(() => settle(step + 1, onGiveUp, ladder), ladder[step]);
        return;
      }
      misses++;
      // Sites that never sell anything -- mail, docs, dashboards -- change
      // their URL constantly. Stop re-evaluating them.
      if (!everMounted && misses >= MAX_MISSES) stopPolling();
      if (onGiveUp) onGiveUp();
    });
  }

  function start() {
    // Runs at document_end, so the dock appears as soon as the DOM is usable
    // rather than after every image and ad tag has loaded. Client-rendered
    // storefronts often have nothing to detect that early, so a miss is never
    // conclusive -- keep re-checking on the RETRY_MS curve.
    settle(0, null, LOAD_RETRY_MS);

    // Checkout is nearly always a client-side route change, which fires no page
    // load at all. A once-a-second href comparison is cheap and catches it.
    poll = setInterval(() => {
      // Stop within a second of the extension being reloaded, rather than
      // lingering until the page happens to change route. Without this an
      // orphan on a static page polls forever.
      if (!contextAlive()) return shutdown();
      if (mounted && rankedOn !== today()) rerank();
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      autoOpened = false;
      // Same rule on a new route: only unmount once a settled re-check agrees
      // the page really is not a merchant, so a mid-render miss cannot flicker
      // the dock away.
      settle(0, unmount, ROUTE_RETRY_MS);
    }, 1000);
  }

  // Reloading the extension orphans every content script already injected in
  // an open tab: the script keeps running but its chrome.runtime is dead, and
  // any sendMessage throws "Extension context invalidated". Because we poll,
  // an orphan would throw once per route change forever -- which on YouTube is
  // every click. Detect it and shut the orphan down instead.
  function contextAlive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }

  function shutdown() {
    stopPolling();
    unmount();
  }

  function send(msg, cb) {
    if (!contextAlive()) { shutdown(); return; }
    try {
      chrome.runtime.sendMessage(msg, res => {
        if (chrome.runtime.lastError) return;
        if (cb) cb(res);
      });
    } catch (e) {
      // The context can die between the check above and the call itself.
      shutdown();
    }
  }

  function evaluate(onMiss) {
    send(
      { type: 'PAGE', hostname: location.hostname, signals: collectSignals(),
        // The faces are inlined base64 now, so only ask for them once.
        wantFont: !fontEl },
      res => {
        if (!res || !res.winner) return;

        if (!res.show) { if (onMiss) onMiss(); return; }

        misses = 0;
        if (!mounted) { mounted = render(res); everMounted = true; rankedOn = today(); }
        // Open itself at the moment of payment, but never fight the user: if
        // they close it, it stays closed until the next route.
        if (res.checkout && !autoOpened) { autoOpened = true; mounted.open(); }
      });
  }

  // The day turned while the dock was up: rank again and repaint in place,
  // keeping the panel open if it was. PAGE also refreshes the popup's copy.
  function rerank() {
    rankedOn = today();
    send({ type: 'PAGE', hostname: location.hostname, signals: collectSignals(), wantFont: true },
      res => {
        if (!res || !res.winner || !mounted) return;
        const wasOpen = mounted.isOpen();
        mounted.destroy();
        mounted = render(res);
        if (wasOpen) mounted.open();
      });
  }

  function unmount() {
    if (!mounted) return;
    mounted.destroy();
    mounted = null;
    autoOpened = false;
  }

  function stopPolling() {
    if (poll) { clearInterval(poll); poll = null; }
  }

  // A button that COMMITS the purchase. "Proceed to checkout" is excluded on
  // purpose: Amazon's cart page has one, and a cart is not a checkout.
  // Read the labels, let the engine judge them. Keeping the decision out of
  // here is what makes it testable without a browser.
  function buttonLabels() {
    const nodes = document.querySelectorAll(
      'button, input[type="submit"], input[type="button"], [role="button"], a.btn, a[class*="checkout" i]');
    const out = [];
    for (let i = 0; i < nodes.length && i < 400 && out.length < 60; i++) {
      const el = nodes[i];
      // Read .value ONLY from submit/button inputs, where it is the label.
      // A page can put role="button" on a text input, and this must never be
      // able to pick up what someone typed into a field.
      const isButtonInput = el.tagName === 'INPUT' &&
        (el.type === 'submit' || el.type === 'button' || el.type === 'reset');
      const label = (isButtonInput ? el.value : el.textContent || '').trim();
      if (label && label.length < 45) out.push(label);
    }
    return out;
  }

  // Read-only DOM signals. Deliberately no page globals: a content script runs
  // in an isolated world and cannot see window.Shopify and friends anyway.
  function collectSignals() {
    const body = document.body;
    if (!body) return {};

    // Every other collector in here is bounded -- 400 nodes, 60 labels, 40000
    // chars -- and this one was not, on the most attacker-controlled input of
    // the lot. Unbounded recursion over hostile JSON-LD threw a RangeError that
    // the catch quietly swallowed, and a document with thousands of @type
    // entries built an array that then had to cross sendMessage.
    //
    // Deduped as it goes, which is what makes the cap safe: nothing downstream
    // counts types, it only asks whether one is present, so 60 DISTINCT types is
    // far past any real page and truncation can no longer hide a `Product`
    // behind sixty `ListItem`s.
    const LD_MAX_SCRIPTS = 20, LD_MAX_TYPES = 60, LD_MAX_DEPTH = 20, LD_MAX_CHARS = 200000;
    const seen = new Set();
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length && i < LD_MAX_SCRIPTS && seen.size < LD_MAX_TYPES; i++) {
      const raw = scripts[i].textContent || '';
      if (!raw || raw.length > LD_MAX_CHARS) continue;
      try {
        const walk = (o, depth) => {
          if (!o || typeof o !== 'object' || depth > LD_MAX_DEPTH || seen.size >= LD_MAX_TYPES) return;
          if (Array.isArray(o)) { for (const v of o) walk(v, depth + 1); return; }
          if (o['@type']) {
            for (const t of [].concat(o['@type'])) {
              if (typeof t === 'string' && seen.size < LD_MAX_TYPES) seen.add(t);
            }
          }
          for (const v of Object.values(o)) walk(v, depth + 1);
        };
        walk(JSON.parse(raw), 0);
      } catch (e) { /* malformed JSON-LD is common; ignore it */ }
    }
    const ldTypes = [...seen];

    const og = document.querySelector('meta[property="og:type"]');
    const text = (body.textContent || '').slice(0, 40000).toLowerCase();

    return {
      ldTypes,
      ogType: og ? og.getAttribute('content') : '',
      platform: !!document.querySelector(
        'script[src*="shopify"], link[href*="shopify"], script[src*="woocommerce"],' +
        'link[href*="woocommerce"], script[src*="bigcommerce"], script[src*="magento"],' +
        'meta[name="generator"][content*="Shopify"], meta[name="generator"][content*="WooCommerce"]'),
      cartLink: !!document.querySelector(
        'a[href*="/cart"], a[href*="/checkout"], a[href*="/basket"], a[href*="/bag"],' +
        'form[action*="/cart"], form[action*="/checkout"]'),
      price: /[$\u20ac\u00a3]\s?\d/.test(text),

      // Existence only. This never reads a field's value, and nothing here
      // ever leaves the machine -- the extension makes no network requests.
      paymentField: !!document.querySelector(
        'input[autocomplete="cc-number"], input[autocomplete="cc-csc"],' +
        'input[name*="cardnumber" i], input[id*="cardnumber" i],' +
        'input[name*="card_number" i], input[name*="ccnumber" i],' +
        'input[autocomplete="cc-exp"], input[autocomplete="cc-name"],' +
        'input[data-elements-stable-field-name="cardNumber"],' +
        // Match the MOUNTED card element by frame name, not js.stripe.com by
        // src: Stripe's controller frames load on any page that merely
        // includes stripe.js, which would fire on a merchant's homepage.
        'iframe[name*="StripeFrame"],' +
        // Shopify names its PCI frames card-fields-number-*. Matching the name
        // rather than the title keeps this working on non-English checkouts,
        // where title becomes "Numero de carte" and the like.
        'iframe[name*="card" i][name*="number" i],' +
        'iframe[src*="checkout.pci.shopifyinc.com"],' +
        'iframe[src*="braintree"], iframe[src*="adyen"], iframe[src*="checkout.com"],' +
        'iframe[src*="squareup.com"],' +
        // Last-resort, language-dependent fallback.
        'iframe[title*="card number" i]'),
      checkoutUrl: /\/(checkouts?|payments?|place-?order|order-review|review-order|billing|purchase|onepage|onestepcheckout|gp\/buy|buy\/spc)(\/|$|\?|#)/i
        .test(location.pathname + location.search),
      buttonLabels: buttonLabels(),
      // A payment-method chooser. Deliberately a control, never page text: the
      // text form of this ("Visa ending in 4242") is conclusive on its own, and
      // this project's README documents it with that exact example -- which
      // made the GitHub page rendering it look like a checkout.
      paymentChoice: !!document.querySelector(
        'input[type="radio"][name*="payment" i], input[name*="paymentmethod" i],' +
        'input[type="radio"][name*="submethod" i], select[name*="paymentmethod" i]'),
      // The HTML standard for a billing form. Language-independent, and
      // present where card entry happens on a later step.
      billingForm: document.querySelectorAll('input[autocomplete*="billing" i]').length >= 2,
      checkoutText: /place (your )?order|complete (your )?purchase|pay now|confirm and pay|order summary|payment method|billing address/
        .test(text)
    };
  }

  function render(res) {
    const host = document.createElement('div');
    // No id. Nothing looked this up -- it was only ever a fixed string for a
    // page to find us by.
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';

    // Every other surface follows the browser through ui.css's media query. The
    // overlay cannot: its tokens are set inline on the host, because the shadow
    // root is closed and a stylesheet inside it cannot reach out. So while no
    // theme is pinned, an OS flip has to be wired by hand or the dock stays on
    // the colour it mounted with.
    let storedTheme = res.theme;
    const scheme = typeof matchMedia === 'function'
      && matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => applyTheme(host, storedTheme);
    if (scheme) scheme.addEventListener('change', onScheme);

    applyTheme(host, storedTheme);

    const pos = res.overlayPos || {};
    host.style.right = RAIL_RIGHT + 'px';
    host.style.bottom = clampY(pos.bottom ?? 16) + 'px';

    const root = host.attachShadow({ mode: 'closed' });
    const unresolved = res.resolvedBy === 'unresolved' && res.tied.length > 1;
    const others = res.tied.filter(c => c.productId !== res.winner.productId);

    // The faces must live in the host page's document; Chrome ignores
    // @font-face inside a shadow root. Installed once and then reused: the
    // family name is randomised per service-worker lifetime, so re-installing
    // on a later response would leave a second face behind for no gain.
    const font = res.font || {};
    if (font.faces && !fontEl) {
      fontEl = document.createElement('style');
      fontEl.textContent = font.faces;
      document.head.appendChild(fontEl);
      fontFamilyStack = font.stack;
    }

    root.innerHTML = `
      <style>
        /* Tokens are set inline on the host by applyTheme(), not declared
           here: the overlay follows the theme chosen in Options, and a shadow
           root cannot read that. It also keeps a fixed attribute off the host
           for a page to detect us by. */
        :host { all: initial; }
        * { box-sizing: border-box; margin: 0; font-family: ${fontFamilyStack || font.stack || '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'}; }

        /* Only the dock is in flow, so host.bottom always means the dock's
           bottom edge no matter what the panel is doing. */
        .wrap { position: relative; width: max-content; }

        /* design/DESIGN.md forbids drop shadows and border radius everywhere
           else. This is the exemption, and the reason for it: both of these
           float over a page the extension does not control, so a hairline has
           nothing reliable to sit against. The radius still goes. */
        .dock { display: flex; align-items: center; height: ${DOCK_H}px; border-radius: 12px;
                background: var(--surface); color: var(--ink);
                box-shadow: 0 4px 14px rgba(0,0,0,.28); overflow: hidden; }
        .icon { width: 44px; height: ${DOCK_H}px; border: 0; background: none; color: inherit;
                cursor: pointer; display: grid; place-items: center; padding: 0; }
        .icon:hover { background: var(--hover); }
        .icon:focus-visible { outline: 2px solid currentColor; outline-offset: -3px; }
        .grip { width: 30px; height: ${DOCK_H}px; border: 0; background: var(--grip); color: inherit;
                display: grid; place-items: center; padding: 0; cursor: grab; touch-action: none;
                fill: currentColor; opacity: .7; }
        .grip:hover { opacity: 1; }

        .panel { position: absolute; right: 0; bottom: calc(100% + ${GAP}px);
                 width: 300px; max-height: calc(100vh - ${DOCK_H + GAP + EDGE * 2}px); overflow-y: auto;
                 background: var(--surface); color: var(--ink); border: 0; border-radius: 12px;
                 box-shadow: 0 8px 28px rgba(0,0,0,.16);
                 padding: 14px; font-size: 12.5px; line-height: 1.5;
                 visibility: hidden; opacity: 0; transform: translateY(6px) scale(.98);
                 transform-origin: bottom right;
                 transition: opacity .13s ease, transform .13s ease, visibility 0s linear .13s; }
        .wrap.below .panel { bottom: auto; top: calc(100% + ${GAP}px); transform-origin: top right;
                             transform: translateY(-6px) scale(.98); }
        .wrap.open .panel { visibility: visible; opacity: 1; transform: none;
                            transition: opacity .13s ease, transform .13s ease, visibility 0s; }
        .wrap.dragging .panel { visibility: hidden; opacity: 0; transition: none; }

        .top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
        .eyebrow { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
        .guess { opacity: .6; }
        .x { cursor: pointer; border: 0; background: none; color: var(--muted); font-size: 16px; line-height: 1; padding: 0 2px; }
        .x:hover { color: var(--ink); }
        .acts { display: flex; align-items: center; gap: 8px; }
        .gear { cursor: pointer; border: 0; background: none; color: var(--muted); padding: 0 2px;
                display: grid; place-items: center; }
        .gear:hover { color: var(--ink); }
        /* The answer is a card AND a number, and the number was the smaller
           of the two. It moves to the right at display size, where the panel
           had empty space, so the thing being compared is the thing you see
           first. The name is the only part that gives way if it must. */
        /* 14px, not the 8px this had when the rate was 12.5px body text. A
           22px numeral baselined against a 15px name has about 5px more
           ascender above it, so the old gap left it crowding the close button.
           The measurement that matters here is optical, not the box. */
        .win { display: flex; align-items: baseline; gap: 12px; margin-top: 14px; }
        .win-text { flex: 1; min-width: 0; }
        .name { font-size: 15px; font-weight: 600; letter-spacing: -.01em; line-height: 1.3; }
        .rate { font-size: 12.5px; color: var(--muted); margin-top: 2px; }
        /* The ramp's Numeral display role, the same one the point-value fields
           in Options use: 22px/500/-.02em. 26px read better in isolation and is
           not on the ramp, which is how a type scale stops being one. */
        .win-val { flex: none; font-size: 22px; font-weight: 500; letter-spacing: -.02em;
                   line-height: 1; font-variant-numeric: tabular-nums; }
        .note { color: var(--muted); font-size: 10.5px; line-height: 1.45; margin-top: 6px; }
        /* Louder than .note on purpose: a note is extra information, this
           says the number above it may be wrong. */
        .stale { color: var(--warn); border: 1px solid var(--warnLine); border-radius: 4px;
                 font-size: 11px; line-height: 1.45; margin-top: 8px; padding: 7px 9px; }
        .why { color: var(--muted); font-size: 10px; margin-top: 5px; }
        .undo { border: 0; background: none; padding: 0 0 0 2px; font: inherit; color: inherit;
                text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
        .undo:hover { color: var(--ink); }
        .alt { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 10px; }
        .alt h4 { font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
                  color: var(--muted); font-weight: 400; margin-bottom: 8px; }
        /* One line per card, always. The name is the only part allowed to
           give way, because the RATE is the number being compared and the
           button is the thing being clicked -- a layout that wraps "3.00%"
           onto its own line has dropped the comparison to save the label. */
        .row { display: flex; align-items: center; gap: 8px; padding: 5px 0; }
        .alt-name { flex: 1; min-width: 0; overflow: hidden;
                    text-overflow: ellipsis; white-space: nowrap; }
        .alt-val { flex: none; font-variant-numeric: tabular-nums; }
        .pin { flex: none; cursor: pointer; border: 0; border-radius: 4px;
               background: var(--fill); font-size: 10px; letter-spacing: .1em;
               text-transform: uppercase; padding: 6px 10px; color: var(--ink);
               white-space: nowrap; }
        .pin:hover { background: var(--line); }
      </style>
      <div class="wrap">
        <div class="panel" role="dialog" aria-label="Card recommendation">
          <div class="top">
            <span class="eyebrow">${esc(res.categoryLabel || (res.category || 'other').replace(/_/g, ' '))}${res.categorySource === 'inferred' ? ' <span class="guess">&middot; guess</span>' : ''}</span>
            <span class="acts">
              <button class="gear" title="Settings" aria-label="Open Caddy settings">${GEAR}</button>
              <button class="x" title="Close" aria-label="Close">&times;</button>
            </span>
          </div>
          <div class="win">
            <div class="win-text">
              <div class="name">${esc(res.winner.name)}</div>
              <div class="rate">${esc(res.winner.reason)}</div>
            </div>
            <div class="win-val">${money(res.winner.value)}</div>
          </div>
          ${res.resolvedBy === 'category_default'
            ? `<div class="why">${esc(WHY.category_default)} <button class="undo">change</button></div>`
            : ''}
          ${res.winner.needsActivation ? '<div class="note">Must be activated with the issuer to earn this rate.</div>' : ''}
          ${res.winner.staleReason ? `<div class="stale">${esc(res.winner.staleReason)}</div>` : ''}
          ${res.notes.slice(0, 1).map(n => `<div class="note">${esc(n.text)}</div>`).join('')}
          ${(unresolved && others.length) ? `
            <div class="alt">
              <!-- The heading carries "always", so the buttons do not have to.
                   Saying it twice cost about 45px of every row, which came out
                   of the card names -- and the names are what you are choosing
                   between. -->
              <h4>Pick one to always use here</h4>
              ${[res.winner, ...others].map(c => `
                <div class="row">
                  <span class="alt-name">${esc(c.name)}</span>
                  <span class="alt-val">${money(c.value)}</span>
                  <button class="pin" data-id="${esc(c.productId)}">Use</button>
                </div>`).join('')}
            </div>` : ''}
        </div>
        <div class="dock">
          <button class="icon" title="${esc(res.winner.name)} &mdash; ${money(res.winner.value)} back"
                  aria-label="Show card recommendation" aria-expanded="false">${MARK}</button>
          <div class="grip" role="button" aria-label="Drag up or down to move" title="Drag up or down to move">${GRIP}</div>
        </div>
      </div>`;

    const wrap = root.querySelector('.wrap');
    const panel = root.querySelector('.panel');
    const icon = root.querySelector('.icon');
    const grip = root.querySelector('.grip');


    icon.addEventListener('click', () => {
      const open = wrap.classList.toggle('open');
      icon.setAttribute('aria-expanded', String(open));
      reflow();
    });

    // A content script cannot open the options page itself; the worker can.
    root.querySelector('.gear').addEventListener('click', () => send({ type: 'OPEN_OPTIONS' }));

    // x collapses the panel only -- the dock is persistent.
    root.querySelector('.x').addEventListener('click', () => {
      wrap.classList.remove('open');
      icon.setAttribute('aria-expanded', 'false');
    });

    const undo = root.querySelector('.undo');
    if (undo) {
      undo.addEventListener('click', () => {
        // Clear the saved choice and re-ask, right here. Requiring a trip to
        // the options page to undo a one-click decision is how users end up
        // stuck in a state they cannot see.
        send({ type: 'CLEAR_DEFAULT', category: res.category }, () => {
          unmount();
          autoOpened = false;
          evaluate(null);
        });
      });
    }

    root.querySelectorAll('.pin').forEach(btn => {
      btn.addEventListener('click', () => {
        send({ type: 'SET_DEFAULT', category: res.category, productId: btn.dataset.id });
        host.remove();
      });
    });

    // --- dragging --------------------------------------------------------
    grip.addEventListener('pointerdown', e => {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      wrap.classList.add('dragging');

      // Pointer capture does not carry the cursor with it, so once the pointer
      // leaves the grip the page's own cursor takes over. Pin the hand on the
      // document for the duration of the drag and put it back afterwards.
      const htmlStyle = document.documentElement.style;
      const prevCursor = htmlStyle.getPropertyValue('cursor');
      const prevPriority = htmlStyle.getPropertyPriority('cursor');
      htmlStyle.setProperty('cursor', 'grab', 'important');

      const startY = e.clientY;
      const b0 = parseFloat(host.style.bottom);

      // Vertical only: the dock stays on the right rail.
      const move = ev => {
        host.style.bottom = clampY(b0 - (ev.clientY - startY)) + 'px';
        reflow();
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        wrap.classList.remove('dragging');
        if (prevCursor) htmlStyle.setProperty('cursor', prevCursor, prevPriority);
        else htmlStyle.removeProperty('cursor');
        send({ type: 'SET_POS', pos: { bottom: parseFloat(host.style.bottom) } });
      };

      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up, { once: true });
      grip.addEventListener('pointercancel', up, { once: true });
    });

    // Open downward when the panel will not fit above the dock. The panel is
    // only visibility:hidden when closed, so offsetHeight is always its real
    // height and this never has to guess.
    function reflow() {
      const dockTop = window.innerHeight - parseFloat(host.style.bottom) - DOCK_H;
      wrap.classList.toggle('below', dockTop < panel.offsetHeight + GAP + EDGE);
    }

    const onResize = () => {
      host.style.bottom = clampY(parseFloat(host.style.bottom)) + 'px';
      reflow();
    };
    window.addEventListener('resize', onResize);

    document.documentElement.appendChild(host);
    reflow();

    return {
      open() {
        wrap.classList.add('open');
        icon.setAttribute('aria-expanded', 'true');
        reflow();
      },
      isOpen() { return wrap.classList.contains('open'); },
      setTheme(stored) { storedTheme = stored; applyTheme(host, stored); },
      destroy() {
        // Drop the listener too -- mount/unmount cycles on a SPA would
        // otherwise leak one per route.
        window.removeEventListener('resize', onResize);
        if (scheme) scheme.removeEventListener('change', onScheme);
        if (fontEl) { fontEl.remove(); fontEl = null; fontFamilyStack = null; }
        host.remove();
      }
    };
  }

  function clampY(bottom) { return Math.max(EDGE, Math.min(bottom, window.innerHeight - DOCK_H - EDGE)); }
})();
