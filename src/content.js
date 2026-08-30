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
  const WHY = {
    clear_winner:     'clear winner',
    unresolved:       'tied, pick one below',
    category_default: 'your saved choice for this category',
    priority:         'your pinned card order',
    no_cards:         'no cards added'
  };
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const MARK = `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
      <path d="M2.5 10h19" stroke="currentColor" stroke-width="2"/>
    </svg>`;

  const GRIP = `<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
      ${[3, 8, 13].map(y => `<circle cx="3" cy="${y}" r="1.3"/><circle cx="7" cy="${y}" r="1.3"/>`).join('')}
    </svg>`;

  // Give up polling after this many misses in a row on a site that has never
  // shown the dock. Generous on purpose: a client-rendered store whose landing
  // page exposes nothing still gets several routes to prove itself.
  const MAX_MISSES = 5;
  const SETTLE_MS = 2500;

  let mounted = null;      // { open, destroy } once the dock exists
  let everMounted = false; // once true, never stop watching this page
  let autoOpened = false;  // at most one auto-open per page or SPA route
  let misses = 0;
  let lastUrl = location.href;
  let poll = null;

  // Client-rendered storefronts often have nothing to detect at document_idle,
  // so a single miss is never conclusive -- always re-check once it settles.
  evaluate(() => setTimeout(() => evaluate(null), SETTLE_MS));

  // Checkout is nearly always a client-side route change, which fires no page
  // load at all. A once-a-second href comparison is cheap and catches it.
  poll = setInterval(() => {
    // Stop within a second of the extension being reloaded, rather than
    // lingering until the page happens to change route. Without this an
    // orphan on a static page polls forever.
    if (!contextAlive()) return shutdown();
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    autoOpened = false;
    // Same rule on a new route: only unmount once a settled re-check agrees
    // the page really is not a merchant, so a mid-render miss cannot flicker
    // the dock away.
    evaluate(() => setTimeout(() => evaluate(unmount), SETTLE_MS));
  }, 1000);

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
      { type: 'PAGE', hostname: location.hostname, signals: collectSignals() },
      res => {
        if (!res || !res.winner) return;

        if (!res.show) {
          misses++;
          // Sites that never sell anything -- mail, docs, dashboards -- change
          // their URL constantly. Stop re-evaluating them.
          if (!everMounted && misses >= MAX_MISSES) stopPolling();
          if (onMiss) onMiss();
          return;
        }

        misses = 0;
        if (!mounted) { mounted = render(res); everMounted = true; }
        // Open itself at the moment of payment, but never fight the user: if
        // they close it, it stays closed until the next route.
        if (res.checkout && !autoOpened) { autoOpened = true; mounted.open(); }
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

    const ldTypes = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach(node => {
      try {
        const walk = o => {
          if (!o || typeof o !== 'object') return;
          if (Array.isArray(o)) return o.forEach(walk);
          if (o['@type']) ldTypes.push(...[].concat(o['@type']));
          Object.values(o).forEach(walk);
        };
        walk(JSON.parse(node.textContent));
      } catch (e) { /* malformed JSON-LD is common; ignore it */ }
    });

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
    host.id = '__card-picker-host';
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';

    const pos = res.overlayPos || {};
    host.style.right = RAIL_RIGHT + 'px';
    host.style.bottom = clampY(pos.bottom ?? 16) + 'px';

    const root = host.attachShadow({ mode: 'closed' });
    const unresolved = res.resolvedBy === 'unresolved' && res.tied.length > 1;
    const others = res.tied.filter(c => c.productId !== res.winner.productId);

    const font = res.font || {};
    root.innerHTML = `
      <style>
        ${font.faces || ''}
        :host { all: initial; }
        * { box-sizing: border-box; margin: 0; font-family: ${font.stack || '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'}; }

        /* Only the dock is in flow, so host.bottom always means the dock's
           bottom edge no matter what the panel is doing. */
        .wrap { position: relative; width: max-content; }

        .dock { display: flex; align-items: center; height: ${DOCK_H}px; border-radius: 999px;
                background: #0a7d3f; color: #fff; box-shadow: 0 4px 14px rgba(0,0,0,.28);
                overflow: hidden; }
        .icon { width: 44px; height: ${DOCK_H}px; border: 0; background: none; color: inherit;
                cursor: pointer; display: grid; place-items: center; padding: 0; }
        .icon:hover { background: rgba(255,255,255,.12); }
        .icon:focus-visible { outline: 2px solid #fff; outline-offset: -3px; }
        .grip { width: 30px; height: ${DOCK_H}px; border: 0; background: rgba(0,0,0,.14); color: inherit;
                display: grid; place-items: center; padding: 0; cursor: grab; touch-action: none;
                fill: currentColor; opacity: .75; }
        .grip:hover { opacity: 1; background: rgba(0,0,0,.22); }

        .panel { position: absolute; right: 0; bottom: calc(100% + ${GAP}px);
                 width: 300px; max-height: calc(100vh - ${DOCK_H + GAP + EDGE * 2}px); overflow-y: auto;
                 background: #fff; color: #14161a; border: 1px solid #e3e6ea;
                 border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.16);
                 padding: 14px 14px 12px; font-size: 13px; line-height: 1.45;
                 visibility: hidden; opacity: 0; transform: translateY(6px) scale(.98);
                 transform-origin: bottom right;
                 transition: opacity .13s ease, transform .13s ease, visibility 0s linear .13s; }
        .wrap.below .panel { bottom: auto; top: calc(100% + ${GAP}px); transform-origin: top right;
                             transform: translateY(-6px) scale(.98); }
        .wrap.open .panel { visibility: visible; opacity: 1; transform: none;
                            transition: opacity .13s ease, transform .13s ease, visibility 0s; }
        .wrap.dragging .panel { visibility: hidden; opacity: 0; transition: none; }

        .top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
        .eyebrow { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; font-weight: 600; }
        .guess { opacity: .65; font-weight: 500; }
        .x { cursor: pointer; border: 0; background: none; color: #9aa1ab; font-size: 16px; line-height: 1; padding: 0 2px; }
        .x:hover { color: #14161a; }
        .name { font-size: 15px; font-weight: 650; margin-top: 6px; }
        .rate { font-size: 13px; color: #0a7d3f; font-weight: 600; }
        .note { color: #6b7280; font-size: 11px; margin-top: 5px; }
        .why { color: #6b7280; font-size: 10px; margin-top: 4px; letter-spacing: .02em; }
        .undo { border: 0; background: none; padding: 0 0 0 2px; font: inherit; color: inherit;
                text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
        .undo:hover { color: #14161a; }
        .alt { margin-top: 10px; border-top: 1px solid #eef0f3; padding-top: 9px; }
        .alt h4 { font-size: 10px; letter-spacing: .07em; text-transform: uppercase; color: #6b7280; font-weight: 600; margin-bottom: 6px; }
        .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 3px 0; }
        .pin { cursor: pointer; border: 1px solid #d6dae0; background: #fff; border-radius: 6px;
               font-size: 10px; padding: 3px 7px; color: #374151; white-space: nowrap; }
        .pin:hover { background: #f4f6f8; }

        @media (prefers-color-scheme: dark) {
          .panel { background: #16181c; color: #e8eaed; border-color: #2a2e35; }
          .alt { border-top-color: #2a2e35; }
          .pin { background: #1f2228; border-color: #353a42; color: #cbd0d6; }
          .rate { color: #4ade80; }
          .x:hover { color: #e8eaed; }
          .undo:hover { color: #e8eaed; }
          .dock { background: #22c55e; color: #0b1410; }
        }
      </style>
      <div class="wrap">
        <div class="panel" role="dialog" aria-label="Card recommendation">
          <div class="top">
            <span class="eyebrow">${esc((res.category || 'other').replace(/_/g, ' '))}${res.categorySource === 'inferred' ? ' <span class="guess">&middot; guess</span>' : ''}</span>
            <button class="x" title="Close" aria-label="Close">&times;</button>
          </div>
          <div class="name">${esc(res.winner.name)}</div>
          <div class="rate">${esc(res.winner.reason)} &middot; ${money(res.winner.value)} back</div>
          <div class="why">across ${res.all.length} card${res.all.length === 1 ? '' : 's'} &middot; ${esc(WHY[res.resolvedBy] || res.resolvedBy || '?')}${res.resolvedBy === 'category_default' ? ' <button class="undo">change</button>' : ''}</div>
          ${res.winner.needsActivation ? '<div class="note">Must be activated with the issuer to earn this rate.</div>' : ''}
          ${res.notes.slice(0, 1).map(n => `<div class="note">${esc(n.text)}</div>`).join('')}
          ${(unresolved && others.length) ? `
            <div class="alt">
              <h4>Tied &mdash; pick one to use here from now on</h4>
              ${[res.winner, ...others].map(c => `
                <div class="row">
                  <span>${esc(c.name)} &middot; ${money(c.value)}</span>
                  <button class="pin" data-id="${esc(c.productId)}">Always use</button>
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
      destroy() {
        // Drop the listener too -- mount/unmount cycles on a SPA would
        // otherwise leak one per route.
        window.removeEventListener('resize', onResize);
        host.remove();
      }
    };
  }

  function clampY(bottom) { return Math.max(EDGE, Math.min(bottom, window.innerHeight - DOCK_H - EDGE)); }
})();
