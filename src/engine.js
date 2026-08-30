// Pure recommendation engine.
// No DOM, no chrome.* APIs, no network. Runs identically in the service
// worker and under node (tools/test-engine.mjs). Keep it that way -- this
// file is the only thing that decides which card wins, so it must stay
// testable without a browser.

const DEFAULT_TIE_BAND = 0.10;

/**
 * Fonts the extension can use, bundled as woff2 -- never fetched from a CDN,
 * because the whole product claim is that it makes no network calls.
 * `faces` is [family, weight, file]; a single entry means a variable font.
 */
const FALLBACK = ', -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

// Deliberately five different CATEGORIES, not five neutral sans-serifs.
export const FONTS = {
  jakarta:   { label: 'Plus Jakarta Sans', stack: '"Plus Jakarta Sans"' + FALLBACK,
               faces: [['Plus Jakarta Sans', '400 700', 'jakarta-400-700.woff2']] },
  grotesk:   { label: 'Space Grotesk',     stack: '"Space Grotesk"' + FALLBACK,
               faces: [['Space Grotesk', '400 700', 'grotesk-400-700.woff2']] },
  atkinson:  { label: 'Atkinson Hyperlegible', stack: '"Atkinson Hyperlegible"' + FALLBACK,
               faces: [['Atkinson Hyperlegible', '400', 'atkinson-400.woff2'],
                       ['Atkinson Hyperlegible', '700', 'atkinson-700.woff2']] },
  bricolage: { label: 'Bricolage Grotesque', stack: '"Bricolage Grotesque"' + FALLBACK,
               faces: [['Bricolage Grotesque', '400 700', 'bricolage-400-700.woff2']] },
  jetbrains: { label: 'JetBrains Mono',    stack: '"JetBrains Mono", ui-monospace, monospace',
               faces: [['JetBrains Mono', '400 700', 'jetbrains-400-700.woff2']] }
};

export const DEFAULT_FONT = 'jakarta';

/** @font-face rules for one font. urlFor keeps chrome.* out of the engine. */
export function fontFaceCss(key, urlFor) {
  const f = FONTS[key] || FONTS[DEFAULT_FONT];
  return f.faces.map(([family, weight, file]) =>
    `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};` +
    `font-display:swap;src:url("${urlFor('src/fonts/' + file)}") format("woff2");}`
  ).join('');
}

/**
 * @font-face rules for EVERY font.
 *
 * The options page needs all of them: its picker renders each button in its own
 * typeface, and a face that is never declared silently falls back -- which made
 * all five buttons look identical and the whole setting look broken. Declaring a
 * face costs nothing until something uses it.
 */
export function allFontFaceCss(urlFor) {
  return Object.keys(FONTS).map(k => fontFaceCss(k, urlFor)).join('');
}

/**
 * Font for the injected overlay.
 *
 * Chrome ignores @font-face declared inside a shadow root -- measured, not
 * assumed: the same rule applies at document scope and does nothing in a shadow
 * tree. So the overlay's faces have to go into the HOST PAGE's head, which
 * means the family name must be namespaced or it could override a face the site
 * itself declares under the same name.
 */
export function overlayFont(key, urlFor) {
  const f = FONTS[key] || FONTS[DEFAULT_FONT];
  const family = 'CardPicker-' + (FONTS[key] ? key : DEFAULT_FONT);
  const faces = f.faces.map(([, weight, file]) =>
    `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};` +
    `font-display:swap;src:url("${urlFor('src/fonts/' + file)}") format("woff2");}`
  ).join('');
  return { family, faces, stack: `"${family}"${FALLBACK}` };
}

export function fontStack(key) {
  return (FONTS[key] || FONTS[DEFAULT_FONT]).stack;
}

// Schema.org types that mean "you can buy something on this page".
const COMMERCE_TYPES = new Set([
  'Product', 'Offer', 'AggregateOffer', 'IndividualProduct', 'ProductGroup',
  'Hotel', 'LodgingBusiness', 'Resort', 'BedAndBreakfast', 'Motel',
  'Restaurant', 'FoodEstablishment', 'Store', 'GroceryStore', 'ClothingStore',
  'DepartmentStore', 'ElectronicsStore', 'HomeGoodsStore', 'LocalBusiness',
  'TravelAgency', 'Flight', 'TouristAttraction', 'Event', 'Ticket',
  'OfferCatalog', 'Reservation', 'LodgingReservation', 'FoodService', 'MenuItem'
]);

// Types that mean "this is something to read, not something to buy". Weak
// commerce signals are unreliable here: an encyclopedia article about credit
// cards contains both dollar figures and the words "buy now".
const EDITORIAL_TYPES = new Set([
  'Article', 'NewsArticle', 'BlogPosting', 'ScholarlyArticle', 'TechArticle',
  'Report', 'QAPage', 'DiscussionForumPosting', 'ProfilePage', 'AboutPage'
]);

// A button label that COMMITS a purchase.
//
// Bare "pay" is the dangerous one: it prefixes "PayPal", "Payment options" and
// "Pay in 4", none of which commit anything. So it only counts when it carries
// an amount ("Pay $52.10") or is the entire label. "Proceed to checkout" and
// "continue to payment" are excluded on purpose -- they mean you are not there
// yet, and Amazon's cart page has the former.
const COMMIT_LABEL = new RegExp(
  '^(place (your )?order|complete (your )?(purchase|order)|submit (my |your )?order|' +
  'confirm (and pay|order|payment)|buy now|pay now)\\b' +
  '|^pay\\s*[$\u00a3\u20ac]\\s?[\\d,.]+' +
  '|^pay$');

// A control that puts something IN a basket, as opposed to a page that merely
// contains the words. Matched against button labels rather than page text: this
// project's own README quotes "add to cart" and "buy now" as examples, and a
// text scan happily flagged the GitHub page showing it as a storefront.
const BUY_LABEL = /^(add to (cart|bag|basket|order|trolley)|buy( it)? now|book now|reserve now|check availability|add to my order)\b/;

export function isBuyLabel(label) {
  const l = String(label || '').trim().toLowerCase();
  return l.length > 0 && l.length < 45 && BUY_LABEL.test(l);
}

export function isCommitLabel(label) {
  const l = String(label || '').trim().toLowerCase();
  return l.length > 0 && l.length < 45 && COMMIT_LABEL.test(l);
}

/**
 * Is this the moment of payment?
 *
 * A card-number field (or a known processor's iframe) is unambiguous on its
 * own. Failing that, a checkout-shaped URL has to be corroborated by
 * checkout-shaped copy -- plenty of sites have a /payment marketing page.
 */
export function isCheckoutPage(signals = {}) {
  // A mounted card field. Absent on any checkout where the card is already on
  // file, which is most large retailers, so it cannot be the only signal.
  if (signals.paymentField) return true;

  // A commit button ("Place your order", "Pay now"). Platform-independent and
  // present even when the card is saved. Deliberately excludes "proceed to
  // checkout" and "continue to payment", which mean you are NOT there yet.
  if ((signals.buttonLabels || []).some(isCommitLabel)) return true;

  // A payment-method chooser. Every conclusive signal here must come from a
  // control, never from page text -- text that TALKS about paying is not a
  // payment page, and this project's own docs are the proof.
  if (signals.paymentChoice) return true;

  // autocomplete="billing *" is the HTML standard for a billing form. It is
  // language-independent and present on checkouts that keep card entry on a
  // later step or on the processor's own domain.
  if (signals.billingForm) return true;

  return !!(signals.checkoutUrl && signals.checkoutText);
}

// Schema.org type -> our category, most specific first. A hotel booking page
// often carries Product markup too, so ordering is what keeps Hotel from being
// read as generic online retail.
const LD_CATEGORY = [
  [['Hotel', 'LodgingBusiness', 'Resort', 'BedAndBreakfast', 'Motel', 'LodgingReservation'], 'travel_hotel'],
  [['Restaurant', 'FoodEstablishment', 'FoodService', 'MenuItem', 'Bakery', 'CafeOrCoffeeShop', 'BarOrPub'], 'dining'],
  [['GroceryStore', 'Supermarket'], 'groceries'],
  [['Pharmacy', 'DrugStore'], 'drugstore'],
  [['GasStation'], 'gas'],
  [['Airline', 'Flight', 'TravelAgency'], 'travel_air'],
  [['MovieTheater', 'EventVenue', 'PerformingArtsTheater', 'Event', 'Ticket'], 'entertainment'],
  [['HardwareStore', 'HomeGoodsStore', 'FurnitureStore'], 'home_improvement'],
  [['DepartmentStore'], 'department_store'],
  [['ClothingStore', 'ElectronicsStore', 'Store', 'Product', 'Offer', 'AggregateOffer',
    'IndividualProduct', 'ProductGroup'], 'online_retail'],
];

/**
 * Guess a category for a merchant that is not in merchants.json.
 *
 * Without this the extension appears on every store but categorises only the
 * ones in the table, so every unlisted merchant falls to "everything else" and
 * silently drops any card whose bonus category applied. Returns null when
 * nothing is confident enough, which the caller reads as "everything else".
 */
export function inferCategory(signals = {}) {
  const types = new Set(signals.ldTypes || []);
  for (const [names, category] of LD_CATEGORY) {
    if (names.some(t => types.has(t))) return category;
  }
  if (/^product/i.test(signals.ogType || '')) return 'online_retail';
  // A storefront platform is not proof of what it sells, but it is proof that
  // it sells, and online retail is the safe reading.
  if (signals.platform) return 'online_retail';
  return null;
}

/**
 * Decide whether a page is somewhere you can actually spend money.
 *
 * Kept pure and signal-based so it is testable without a browser: the content
 * script reads the DOM, this decides. A known merchant short-circuits; past
 * that, one strong structural signal is enough, and weak signals need to
 * corroborate each other (a news article quoting a price should not count).
 */
export function isMerchantPage(signals = {}, knownMerchant = false) {
  // If you are being asked to pay, it is a place of purchase, full stop. This
  // also guarantees the dock exists on a bare payment page so that the
  // checkout auto-open has something to open.
  if (isCheckoutPage(signals)) return true;

  if ((signals.ldTypes || []).some(t => COMMERCE_TYPES.has(t))) return true;
  if (/^product/i.test(signals.ogType || '')) return true;
  if (signals.platform) return true;

  const buyControl = (signals.buttonLabels || []).some(isBuyLabel);
  const weak = [buyControl, signals.cartLink, signals.price].filter(Boolean).length;
  const editorial = (signals.ldTypes || []).some(t => EDITORIAL_TYPES.has(t));

  // Being a known merchant settles WHAT this site is, not whether THIS page is
  // somewhere you buy. youtube.com is a merchant; a video you are watching on
  // it is not a purchase. So the page still has to look transactional -- one
  // weak signal is enough, since we already trust the domain.
  if (knownMerchant) return weak >= 1;

  // On editorial pages, demand an actual cart or checkout link before
  // believing the softer signals.
  if (editorial) return !!signals.cartLink && weak >= 2;
  return weak >= 2;
}

/** hostname -> merchant record, walking up to parent domains. */
export function normalizeHost(hostname) {
  return String(hostname || '').toLowerCase().replace(/^www\./, '');
}

export function resolveMerchant(hostname, merchants) {
  const host = normalizeHost(hostname);
  if (!host) return null;
  if (merchants[host]) return { domain: host, ...merchants[host] };

  const parts = host.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (merchants[parent]) return { domain: parent, ...merchants[parent] };
  }
  return null;
}

// Quarters are calendar dates the cardholder experiences locally, so parse
// both ends as local time. Bare 'YYYY-MM-DD' parses as UTC, which would make
// the two ends inconsistent with each other.
function inWindow(win, now) {
  if (!win) return true;
  const t = now.getTime();
  if (win.start && t < Date.parse(win.start + 'T00:00:00')) return false;
  if (win.end && t > Date.parse(win.end + 'T23:59:59')) return false;
  return true;
}

// Categories you can actually route through an issuer travel portal. Transit
// and rideshare are travel_* but are not bookable, so a "book through the
// portal instead" note there would be nonsense.
const PORTAL_BOOKABLE = new Set(['travel_air', 'travel_hotel']);

/**
 * Is this card deliberately ordered by the user?
 *
 * Exported because the options page must show exactly what the ranker acts
 * on. These drifted once: the ranker honoured `priority`, the UI only showed
 * `pinned`, so a card could silently decide every tie while Options claimed
 * nothing was pinned.
 */
export function isPinned(inst) {
  return inst.pinned === true || inst.priority != null;
}

/** Drops instances whose product no longer exists in cards.json. */
export function pruneInstances(instances, products) {
  return instances.filter(i => products[i.productId]);
}

function ruleApplies(rule, ctx) {
  if (rule.category !== ctx.category) return false;
  if (rule.selection_group && !ctx.selected.includes(rule.selection_group)) return false;
  if (!inWindow(rule.window, ctx.now)) return false;
  if (rule.merchant_denylist && ctx.domain && rule.merchant_denylist.includes(ctx.domain)) return false;
  if (rule.merchant_allowlist && (!ctx.domain || !rule.merchant_allowlist.includes(ctx.domain))) return false;
  return true;
}

function capText(cap) {
  const per = { quarter: 'quarter', year: 'year', cycle: 'billing cycle' }[cap.period] || cap.period;
  return `Capped at $${cap.amount.toLocaleString()} per ${per}, then ${cap.then_rate}x`;
}

function caveatsFor(rule, product) {
  const out = [];
  if (rule) {
    if (rule.requires_activation) out.push('Must be activated with the issuer');
    if (rule.cap) out.push(capText(rule.cap));
    if (rule.auto_top) out.push('Only applies to your single top spend category this cycle');
    if (rule.placeholder) out.push('Rotating category -- VERIFY this is current for the quarter');
    if (rule.caveat) out.push(rule.caveat);
  }
  // Outside the rule check on purpose: a card sitting on its base rate is
  // still unverified, and that is what drives the warning banner.
  if (product && product.verified === false) out.push('Unverified data');
  return out;
}

/**
 * rank({hostname, merchants, products, instances, valuations, prefs, now})
 *
 * instances: [{ productId, config: {selections:[], tier_multiplier:1}, priority, pinned }]
 * prefs:     { categoryDefaults: {category: productId}, tieBand: 0.10 }
 *
 * Returns { hostname, merchant, category, all, winner, tied, resolvedBy, notes }
 * `value` on each entry is cents earned per dollar spent, i.e. effective % back.
 */
export function rank(input) {
  const {
    hostname, merchants = {}, products = {}, instances = [],
    valuations = {}, prefs = {}, now = new Date(), signals = {}
  } = input;

  // The hand-verified table wins. Everything else is inferred from the page's
  // own markup, and only then does it fall back to "everything else".
  const merchant = resolveMerchant(hostname, merchants);
  const inferred = merchant ? null : inferCategory(signals);
  const baseCategory = merchant ? merchant.category : (inferred || 'other');
  const categorySource = merchant ? 'merchant' : (inferred ? 'inferred' : 'default');
  const tieBand = prefs.tieBand ?? DEFAULT_TIE_BAND;
  const categoryDefaults = prefs.categoryDefaults || {};

  const entries = [];
  const notes = [];

  instances.forEach((inst, idx) => {
    const p = products[inst.productId];
    if (!p) return;

    // Per-issuer disagreement about what this merchant is (Amex vs Chase vs ...).
    const overrides = (merchant && merchant.issuer_overrides) || {};
    const category = overrides[p.issuer] || baseCategory;

    const cfg = inst.config || {};
    const ctx = {
      category,
      domain: merchant ? merchant.domain : normalizeHost(hostname),
      selected: cfg.selections || [],
      now
    };

    // Portal rates never apply on the merchant's own site. Hold the best one
    // aside and decide after scoring whether it is worth mentioning.
    let best = null;
    let portal = null;
    for (const rule of p.rules || []) {
      if (rule.portal_only) {
        if (PORTAL_BOOKABLE.has(category) && (!portal || rule.rate > portal.rate)) portal = rule;
        continue;
      }
      if (!ruleApplies(rule, ctx)) continue;
      if (!best || rule.rate > best.rate) best = rule;
    }

    const tier = cfg.tier_multiplier || 1;
    const rate = (best ? best.rate : p.base_rate) * tier;
    const cpp = valuations[p.currency] ?? 1.0;

    const value = Math.round(rate * cpp * 1000) / 1000;

    if (portal) {
      const portalValue = Math.round(portal.rate * cpp * 1000) / 1000;
      // Only worth saying if the detour actually pays more than staying put.
      if (portalValue > value) {
        notes.push({
          productId: p.id,
          value: portalValue,
          text: `${p.name}: ${portal.rate}x (${portalValue.toFixed(2)}%) if you book through ${portal.portal} instead`
        });
      }
    }

    entries.push({
      productId: p.id,
      name: p.name,
      issuer: p.issuer,
      currency: p.currency,
      category,
      rate: Math.round(rate * 1000) / 1000,
      cpp,
      value,
      matchedCategory: best ? best.category : null,
      reason: best
        ? `${rate}x on ${best.category.replace(/_/g, ' ')}`
        : `${rate}x base rate`,
      caveats: caveatsFor(best, p),
      // Surfaced on its own in the overlay: without activation this rate is
      // simply not earned, which is different in kind from a cap or an exclusion.
      needsActivation: !!(best && best.requires_activation),
      // Position in the list is only a stable sort key. It counts as a real
      // tiebreak signal ONLY if the user deliberately ordered this card --
      // otherwise a tie would silently resolve itself and never be shown.
      priority: inst.priority ?? idx,
      pinned: isPinned(inst)
    });
  });

  entries.sort((a, b) => b.value - a.value || a.priority - b.priority);
  notes.sort((a, b) => b.value - a.value);

  if (entries.length === 0) {
    return { hostname, merchant, category: baseCategory, categorySource,
             all: [], winner: null, tied: [], resolvedBy: 'no_cards', notes };
  }

  const top = entries[0].value;
  const tied = top > 0
    ? entries.filter(e => (top - e.value) / top <= tieBand)
    : entries.slice(0, 1);

  let winner = tied[0];
  let resolvedBy = 'clear_winner';

  if (tied.length > 1) {
    const preferred = categoryDefaults[baseCategory];
    const hit = preferred && tied.find(e => e.productId === preferred);
    if (hit) {
      winner = hit;
      resolvedBy = 'category_default';
    } else if (tied.some(e => e.pinned)) {
      winner = tied.slice().sort((a, b) => a.priority - b.priority)[0];
      resolvedBy = 'priority';
    } else {
      resolvedBy = 'unresolved';
    }
  }

  return { hostname, merchant, category: baseCategory, categorySource,
           all: entries, winner, tied, resolvedBy, tieBand, notes };
}
