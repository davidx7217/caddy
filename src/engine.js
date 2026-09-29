// Pure recommendation engine.
// No DOM, no chrome.* APIs, no network. Runs identically in the service
// worker and under node (tools/test-engine.mjs). Keep it that way -- this
// file is the only thing that decides which card wins, so it must stay
// testable without a browser.

const DEFAULT_TIE_BAND = 0.10;

// The one font, bundled as woff2 and never fetched from a CDN, because the whole
// product claim is that the extension makes no network calls.
//
// This used to be a registry: a FONTS map, a DEFAULT_FONT key, and every function
// here taking a `key` to look up. The picker that justified it was deleted in
// e630093 and the map was not, so 52 lines of lookup survived to serve exactly
// one value -- every call site passed the same constant.
//
// size-adjust is not cosmetic: Outfit's x-height measures 47.5 at 100px against a
// 53.4 reference, so the same px value would render visibly smaller without it.
const FILE = 'src/fonts/outfit-400-700.woff2';
const WEIGHT = '400 700';
const ADJUST = 'size-adjust:112.4%;';
const FALLBACK = ', -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

const face = (family, url) =>
  `@font-face{font-family:"${family}";font-style:normal;font-weight:${WEIGHT};` +
  `font-display:swap;${ADJUST}src:url("${url}") format("woff2");}`;

/** For the popup and Options, which are extension pages and can load the file. */
export function fontFaceCss(urlFor) {
  return face('Outfit', urlFor(FILE));
}

export function fontStack() {
  return '"Outfit"' + FALLBACK;
}

/**
 * Font for the injected overlay.
 *
 * Chrome ignores @font-face declared inside a shadow root -- measured, not
 * assumed. So the overlay's faces have to go into the HOST PAGE's head, which
 * means the family name must be namespaced or it could override a face the site
 * declares under the same name.
 *
 * `nonce` makes that namespace random instead of branded. A fixed name in the
 * page's stylesheets is something any site can scan document.styleSheets for,
 * which told a merchant it was talking to someone running a card optimiser.
 * `urlFor` returns a data: URI, so there is no extension URL to probe either.
 */
export function overlayFont(urlFor, nonce) {
  const family = 'f' + nonce;
  return { family, faces: face(family, urlFor(FILE)), stack: `"${family}"${FALLBACK}` };
}

/** The one file the worker has to inline. Exported so it has a single home. */
export const FONT_FILE = FILE;

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

// Markup that means "this page is something to watch or listen to". A video is
// the whole point of the page it sits on, and ads, comments, shopping shelves
// and creator descriptions scatter prices and buy controls all over it -- none
// of which is a purchase made here. Stricter than the editorial veto below,
// and unlike it this also overrules a known merchant: youtube.com is in
// merchants.json, so one stray "$" from an ad was enough to put the dock on a
// video the user was simply watching.
const MEDIA_TYPES = new Set([
  'VideoObject', 'MusicVideoObject', 'AudioObject', 'Movie', 'TVSeries',
  'TVEpisode', 'Episode', 'MusicRecording', 'PodcastEpisode', 'Clip'
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
  [['AutoRental', 'RentalCarReservation'], 'car_rental'],
  [['MovieTheater', 'EventVenue', 'PerformingArtsTheater', 'Event', 'Ticket'], 'entertainment'],
  [['ExerciseGym', 'HealthClub'], 'fitness'],
  [['HardwareStore', 'HomeGoodsStore', 'FurnitureStore'], 'home_improvement'],
  [['DepartmentStore'], 'department_store'],
  // Store types that are also card categories, checked 2026-09-27: every one is
  // a real schema.org type (200 there, where EVChargingStation 404s).
  [['ElectronicsStore'], 'electronics'],
  [['ClothingStore', 'ShoeStore'], 'clothing'],
  [['SportingGoodsStore'], 'sporting_goods'],
  [['Store', 'Product', 'Offer', 'AggregateOffer',
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
/**
 * Does anything on this page suggest the SITE sells things?
 *
 * Payment machinery alone is not evidence of shopping. Payroll, banking,
 * insurance, tax and HR portals all have payment-method choosers and billing
 * address forms -- the dock turned up on an employer's payroll site on exactly
 * that basis. Money being involved is not the same as a purchase being made.
 */
function hasCommerceContext(signals, knownMerchant) {
  return knownMerchant
    || (signals.ldTypes || []).some(t => COMMERCE_TYPES.has(t))
    || /^product/i.test(signals.ogType || '')
    || !!signals.platform
    || !!signals.cartLink
    || (signals.buttonLabels || []).some(isBuyLabel);
}

export function isMerchantPage(signals = {}, knownMerchant = false, contentSite = false) {
  // Nothing here sells anything, so nothing else can qualify it.
  if (!hasCommerceContext(signals, knownMerchant)) return false;

  const types = signals.ldTypes || [];
  const commerce = types.some(t => COMMERCE_TYPES.has(t))
    || /^product/i.test(signals.ogType || '')
    || !!signals.platform;

  // A page you came to consume rather than shop, for either of two reasons:
  // its own markup says it IS the media, or merchants.json flags the whole
  // domain as a content site. Retail product pages routinely embed a
  // VideoObject, so the commerce test has to win before this one.
  const consume = !commerce &&
    (contentSite || types.some(t => MEDIA_TYPES.has(t)) || /^video/i.test(signals.ogType || ''));

  // Here nothing written in a button or in the page text proves anything -- the
  // "Buy now" belongs to an ad or a shopping shelf, not to the video, and the
  // "$14.99" belongs to whatever is being advertised alongside it. Only real
  // payment machinery counts, which is what actually paying puts on screen.
  // Checked ahead of everything else because being youtube.com settles what the
  // SITE is, and the video playing on it is still not a purchase.
  if (consume) return !!(signals.paymentField || signals.paymentChoice || signals.billingForm);

  // Being asked to pay ON a site that sells things is a purchase.
  if (isCheckoutPage(signals)) return true;
  if (commerce) return true;

  const buyControl = (signals.buttonLabels || []).some(isBuyLabel);
  const weak = [buyControl, signals.cartLink, signals.price].filter(Boolean).length;

  // Being a known merchant settles WHAT this site is, not whether THIS page is
  // somewhere you buy. So the page still has to look transactional -- one weak
  // signal is enough, since we already trust the domain.
  if (knownMerchant) return weak >= 1;

  // On editorial pages, demand an actual cart or checkout link before
  // believing the softer signals.
  if (types.some(t => EDITORIAL_TYPES.has(t))) return !!signals.cartLink && weak >= 2;
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
//
// Three states, not a boolean. A rule that has EXPIRED is not the same as a rule
// that does not apply: the first means the card's data is out of date and the
// number on screen is wrong, the second means the rule was never relevant. Told
// apart, the first can be surfaced; conflated, it vanishes silently.
export function windowState(win, now) {
  if (!win) return 'open';
  const t = now.getTime();
  if (win.start && t < Date.parse(win.start + 'T00:00:00')) return 'future';
  if (win.end && t > Date.parse(win.end + 'T23:59:59')) return 'expired';
  return 'open';
}

const DAY = 86400000;

// Re-verify anything older than this. The README carries the same number as a
// standing obligation; this is what makes it visible instead of a note in a file
// nobody opens.
export const STALE_AFTER_DAYS = 90;

// How long before a rate ends to start saying so. A quarter is 13 weeks, so two
// weeks is the last usable window to act in without warning for a whole month.
export const EXPIRING_SOON_DAYS = 14;

function daysUntil(dateStr, now) {
  return Math.floor((Date.parse(dateStr + 'T23:59:59') - now.getTime()) / DAY);
}

function daysSince(dateStr, now) {
  return Math.floor((now.getTime() - Date.parse(dateStr + 'T00:00:00')) / DAY);
}

// Categories you can actually route through an issuer travel portal. Transit
// and rideshare are travel_* but are not bookable, so a "book through the
// portal instead" note there would be nonsense.
const PORTAL_BOOKABLE = new Set(['travel_air', 'travel_hotel', 'car_rental']);

// A portal rule filed under travel_portal pays on anything bookable there. One
// filed under a bookable category pays on that category only: Venture X earns 10x
// on hotels and 5x on flights through the same portal, and when the rule's own
// category was ignored its 10x surfaced as a note on delta.com.
function portalCovers(rule, category) {
  return PORTAL_BOOKABLE.has(category) &&
    (rule.category === 'travel_portal' || rule.category === category);
}

/** Drops instances whose product no longer exists in cards.json. */
export function pruneInstances(instances, products) {
  return instances.filter(i => products[i.productId]);
}

// Everything except the window. Split out so an expired rule can be recognised
// as "this WOULD be your 5x category, but the data behind it ran out".
function ruleMatchesContext(rule, ctx) {
  if (rule.category !== ctx.category) return false;
  if (rule.selection_group && !ctx.selected.includes(rule.selection_group)) return false;
  if (rule.merchant_denylist && ctx.domain && rule.merchant_denylist.includes(ctx.domain)) return false;
  if (rule.merchant_allowlist && (!ctx.domain || !rule.merchant_allowlist.includes(ctx.domain))) return false;
  return true;
}

function ruleApplies(rule, ctx) {
  return ruleMatchesContext(rule, ctx) && windowState(rule.window, ctx.now) === 'open';
}

/**
 * Why the number on screen might be wrong, as opposed to merely caveated.
 *
 * Three cases, in order of how badly they mislead:
 *
 * 1. A rule for this category expired. Measured on Freedom Flex: once the Q3
 *    window closes the rule stops applying, the card silently drops to its base
 *    rate, and every caveat disappears with it. The extension then quietly stops
 *    recommending a card it should still be recommending, and says nothing. This
 *    is the failure that made the whole check necessary.
 * 2. A rate that is about to expire, so the user can act before it does.
 * 3. The product record itself is older than the re-verification interval.
 *
 * Returns a string to show, or null. Deliberately one string: a stack of
 * warnings on a badge nobody asked for is how people learn to ignore badges.
 */
/**
 * Has this card's calendar been kept up to date past the rule that lapsed?
 *
 * A category whose quarter simply ended is not stale data. Discover publishes its
 * whole year in advance, so on 1 October its Q3 gas rule expires while a Q4 rule
 * already sits in the same card: the categories rotated, nothing went out of
 * date. Warning there would be crying wolf, and a warning that cries wolf is one
 * people stop reading.
 *
 * So the lapsed rule only means "stale" when it is the LAST word the card has.
 * Dates are YYYY-MM-DD, which compares correctly as a string.
 */
function hasLaterWindow(product, expired) {
  const end = expired.window && expired.window.end;
  if (!end) return false;
  return (product.rules || []).some(r =>
    r !== expired && r.window && r.window.end && r.window.end > end);
}

// A rotating quarter is dated at both ends and needs activating. Anything else
// with a window -- Aeroplan's 3x dining stepping down to 2x, a Lyft offer ending
// -- is an end the issuer announced and the data already holds, so its lapse is
// the card working as published, not a calendar that ran out.
function isRotating(rule) {
  return !!(rule.requires_activation && rule.window && rule.window.start);
}

function stalenessFor(product, best, expired, now) {
  // Only worth saying if the expiry actually cost something. If another rule
  // still pays more, the lapsed one changed nothing and the warning is noise.
  if (expired && isRotating(expired) && (!best || expired.rate > best.rate) &&
      !hasLaterWindow(product, expired)) {
    return `${expired.rate}x on ${expired.category.replace(/_/g, ' ')} expired ` +
           `${expired.window.end}. This card's rotating categories have not been updated, ` +
           `so it is being ranked on its base rate.`;
  }
  if (best && best.window && best.window.end) {
    const left = daysUntil(best.window.end, now);
    if (left >= 0 && left <= EXPIRING_SOON_DAYS) {
      return `This ${best.rate}x rate ends ${best.window.end}` +
             (left === 0 ? ' (today).' : ` (${left} day${left === 1 ? '' : 's'}).`);
    }
  }
  if (product.last_verified) {
    const age = daysSince(product.last_verified, now);
    if (age > STALE_AFTER_DAYS) {
      return `Rates last verified ${product.last_verified}, ${age} days ago. Re-check with the issuer.`;
    }
  }
  return null;
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
 * instances: [{ productId, config: {selections:[], tier_multiplier:1} }]
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

    // A store card works at its own store and nowhere else. Off it the card is
    // not a candidate at all: ranking it on its base rate would recommend a card
    // the till refuses.
    if (p.only_at && !p.only_at.includes(ctx.domain)) return;

    // Portal rates never apply on the merchant's own site. Hold the best one
    // aside and decide after scoring whether it is worth mentioning.
    let best = null;
    let portal = null;
    let expired = null;
    for (const rule of p.rules || []) {
      if (rule.portal_only) {
        if (portalCovers(rule, category) && (!portal || rule.rate > portal.rate)) portal = rule;
        continue;
      }
      if (!ruleMatchesContext(rule, ctx)) continue;
      const w = windowState(rule.window, ctx.now);
      if (w === 'open') {
        if (!best || rule.rate > best.rate) best = rule;
      } else if (w === 'expired' && (!expired || rule.rate > expired.rate)) {
        // Held rather than dropped: this is the rule whose lapse is the reason
        // the card is about to be ranked on its base rate.
        expired = rule;
      }
    }

    const tier = cfg.tier_multiplier || 1;
    const rate = (best ? best.rate : p.base_rate) * tier;
    const cpp = valuations[p.currency] ?? 1.0;

    const value = Math.round(rate * cpp * 1000) / 1000;
    const staleReason = stalenessFor(p, best, expired, now);

    if (portal) {
      // The relationship tier applies to portal bookings too -- BofA publishes
      // its Travel Center rate with the same tier bonus as everything else.
      const portalRate = Math.round(portal.rate * tier * 1000) / 1000;
      const portalValue = Math.round(portalRate * cpp * 1000) / 1000;
      // Only worth saying if the detour actually pays more than staying put.
      if (portalValue > value) {
        notes.push({
          productId: p.id,
          value: portalValue,
          text: `${p.name}: ${portalRate}x (${portalValue.toFixed(2)}%) if you book through ${portal.portal} instead`
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
      caveats: staleReason ? [...caveatsFor(best, p), staleReason] : caveatsFor(best, p),
      // Surfaced on its own as well as in caveats, for the same reason
      // needsActivation is: the overlay renders no caveat list, and this is the
      // one that says the number beside it may simply be out of date.
      staleReason,
      // Surfaced on its own in the overlay: without activation this rate is
      // simply not earned, which is different in kind from a cap or an exclusion.
      needsActivation: !!(best && best.requires_activation),
      // Position in the wallet, used only to keep the sort stable. It is NOT a
      // preference: the user cannot order their cards, so it must never break a
      // tie -- a tie the user has not settled has to be shown, not guessed at.
      order: idx
    });
  });

  entries.sort((a, b) => b.value - a.value || a.order - b.order);
  notes.sort((a, b) => b.value - a.value);

  if (entries.length === 0) {
    // A wallet of store cards for other stores is not an empty wallet, and a
    // surface that said "no cards added" to someone holding three would be lying.
    const held = instances.some(i => products[i.productId]);
    return { hostname, merchant, category: baseCategory, categorySource,
             all: [], winner: null, tied: [], resolvedBy: held ? 'none_usable' : 'no_cards', notes };
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
    } else {
      resolvedBy = 'unresolved';
    }
  }

  return { hostname, merchant, category: baseCategory, categorySource,
           all: entries, winner, tied, resolvedBy, tieBand, notes,
           // One flag so a surface can show a banner without walking the list.
           stale: entries.some(e => e.staleReason) };
}
