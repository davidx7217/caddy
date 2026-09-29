// Zero-dependency test runner:  node tools/test-engine.mjs
import { readFileSync } from 'node:fs';
import { rank, resolveMerchant, pruneInstances, isMerchantPage, isCheckoutPage, isCommitLabel, isBuyLabel, inferCategory } from '../src/engine.js';
import { ISSUER, CURRENCY } from '../src/issuers.js';

const load = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const products = load('cards'), merchants = load('merchants'), valuations = load('valuations');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`}`);
};

const WALLET = JSON.parse(
  readFileSync(new URL('./fixtures/wallet.json', import.meta.url), 'utf8')).instances;
const own = (...ids) => ids.map(id => ({ productId: id, config: {} }));
const IN_Q3 = new Date('2026-08-29T12:00:00Z');
const IN_Q1 = new Date('2026-02-15T12:00:00Z');

const run = (hostname, instances = WALLET, extra = {}) => rank({
  hostname, merchants, products, instances, valuations, now: IN_Q3, ...extra
});
const card = (res, id) => res.all.find(c => c.productId === id);
const ids = res => res.tied.map(c => c.productId).sort();

// --- merchant resolution ------------------------------------------------
eq('www. prefix stripped', resolveMerchant('www.target.com', merchants).domain, 'target.com');
eq('subdomain walks up to parent', resolveMerchant('shop.target.com', merchants).domain, 'target.com');
eq('unknown domain resolves to null', resolveMerchant('some-random-site.example', merchants), null);

// --- the classic traps --------------------------------------------------
{
  const r = run('target.com');
  eq('Target is NOT groceries', r.category, 'department_store');
  // Amex's own terms, read 2026-09-27: online retail is physical goods bought on
  // a U.S. retailer's website or app. Target's website is exactly that, so BCE
  // earns its 3% here as ONLINE RETAIL -- never as groceries, which is the trap.
  eq('BCE earns 3% at Target as online retail, not as groceries',
     card(r, 'amex-blue-cash-everyday').rate, 3);
  eq('...which ties the Robinhood 3% flat', ids(r), ['amex-blue-cash-everyday', 'robinhood-gold']);
  eq('...so it asks instead of picking', r.resolvedBy, 'unresolved');
}
{
  const r = run('instacart.com');
  eq('Amex override sends Instacart to other', card(r, 'amex-blue-cash-everyday').category, 'other');
  eq('BCE gets 1x on Instacart', card(r, 'amex-blue-cash-everyday').rate, 1);
  eq('Chase override applies too, so Aeroplan loses its 3x grocery',
     card(r, 'chase-aeroplan').rate, 1);
}
{
  const r = run('costco.com');
  eq('wholesale club is nobody\'s bonus, Robinhood takes it', r.winner.productId, 'robinhood-gold');
}

// --- Robinhood 3% flat vs the category cards ----------------------------
{
  const r = run('amazon.com');
  eq('BCE online retail 3% = 3.00', card(r, 'amex-blue-cash-everyday').value, 3);
  eq('Robinhood flat 3% = 3.00', card(r, 'robinhood-gold').value, 3);
  eq('Amazon is a dead heat', ids(r), ['amex-blue-cash-everyday', 'robinhood-gold']);
  eq('and it asks rather than guessing', r.resolvedBy, 'unresolved');
}
{
  const r = run('wholefoodsmarket.com');
  eq('Aeroplan 3x at 1.5cpp beats both 3% cash cards', r.winner.productId, 'chase-aeroplan');
  eq('Aeroplan groceries = 4.5%', r.winner.value, 4.5);
}
{
  const r = run('doordash.com');
  eq('four Chase cards all earn 3x dining into UR', ids(r),
     ['chase-aeroplan', 'chase-freedom-flex', 'chase-freedom-unlimited', 'chase-sapphire-reserve']);
  eq('a four-way tie is surfaced, not silently resolved', r.resolvedBy, 'unresolved');
}

// --- merchant_allowlist (Aeroplan only bonuses Air Canada) --------------
{
  const r = run('aircanada.com');
  eq('Aeroplan 3x applies on Air Canada', card(r, 'chase-aeroplan').rate, 3);
  eq('but CSR 4x still beats it', r.winner.productId, 'chase-sapphire-reserve');
}
{
  const r = run('delta.com');
  eq('Aeroplan gets no air bonus off-allowlist', card(r, 'chase-aeroplan').rate, 1);
  eq('CSR wins airfare at 4x', r.winner.productId, 'chase-sapphire-reserve');
  eq('CSR portal rate surfaced as a note, not ranked',
     r.notes.some(n => n.text.includes('8x') && n.text.includes('Chase Travel')), true);
}

// --- denylist fires on a category that would otherwise match ------------
{
  const fake = { 'fakegrocer.com': { category: 'groceries', confidence: 'high' } };
  const denied = { 'x-card': { id: 'x-card', issuer: 'test', currency: 'cash', name: 'X',
    base_rate: 1.0, rules: [{ category: 'groceries', rate: 5.0, merchant_denylist: ['fakegrocer.com'] }] } };
  const r = rank({ hostname: 'fakegrocer.com', merchants: fake, products: denied,
                   instances: own('x-card'), valuations, now: IN_Q3 });
  eq('denylist blocks an otherwise-matching rule', r.winner.rate, 1);
}

// --- tie breaking -------------------------------------------------------
{
  const r = run('amazon.com', WALLET, { prefs: { categoryDefaults: { online_retail: 'robinhood-gold' } } });
  eq('category default breaks the tie', r.winner.productId, 'robinhood-gold');
  eq('resolvedBy reports the default', r.resolvedBy, 'category_default');
}
{
  // Wallet order is a stable sort key and NOTHING else. There is no way for a
  // user to rank their cards, so position must never settle a tie -- if it did,
  // whichever card happened to be added first would silently decide, and the
  // user would never be asked.
  const a = run('amazon.com', [{ productId: 'amex-blue-cash-everyday', config: {} },
                               { productId: 'robinhood-gold', config: {} }]);
  const b = run('amazon.com', [{ productId: 'robinhood-gold', config: {} },
                               { productId: 'amex-blue-cash-everyday', config: {} }]);
  eq('reversing the wallet does not change who is tied',
     [a.tied.length, b.tied.length], [2, 2]);
  eq('...and neither order silently resolves it',
     [a.resolvedBy, b.resolvedBy], ['unresolved', 'unresolved']);
}

// --- rotating categories -------------------------------------------------
{
  const r = run('shell.us');
  eq('Freedom Flex rotating rule applies inside its window',
     card(r, 'chase-freedom-flex').rate, 5);
  eq('activation caveat surfaced',
     card(r, 'chase-freedom-flex').caveats.includes('Must be activated with the issuer'), true);
  eq('quarter is named in the caveat so a stale category is obvious',
     card(r, 'chase-freedom-flex').caveats.some(c => c.includes('Q3 2026')), true);
  eq('7.5% rotating beats the 3% flat', r.winner.productId, 'chase-freedom-flex');
}
{
  const r = run('shell.us', WALLET, { now: IN_Q1 });
  eq('rotating rule ignored outside its window', card(r, 'chase-freedom-flex').rate, 1);
  eq('and BCE 3% gas ties the Robinhood 3% flat', ids(r),
     ['amex-blue-cash-everyday', 'robinhood-gold']);
  eq('so it asks instead of picking', r.resolvedBy, 'unresolved');
}

// --- Freedom Flex stacking guard, 2026-09-28 ------------------------------
// rank() keeps the single best rule and never adds two together, so a rotating
// category that lands on one the card already bonuses must carry the combined
// total itself. Chase's Q4 2026 release spells it out for dining: 1% base + 4%
// quarterly bonus + 2% dining bonus = 7%, and past the $1,500 cap the 4% stops
// while the dining 3% carries on. Any other standing category is assumed to
// stack the same way; if a Chase release ever says otherwise, change this test
// rather than the data. Written by hand, so the scheduled rates agent cannot
// pass npm test with 5 + 3 = 8x, a plain 5x, or a cap that falls back to 1x.
{
  const ff = products['chase-freedom-flex'];
  const standing = ff.rules.filter(r => !r.window && !r.portal_only);
  const wrong = ff.rules.filter(r => r.window && r.requires_activation).flatMap(q => {
    const s = standing.find(r => r.category === q.category);
    const rate = s ? 5 + s.rate - ff.base_rate : 5;
    const floor = s ? s.rate : ff.base_rate;
    return q.rate === rate && q.cap?.then_rate === floor ? [] :
      [`${q.category} from ${q.window.start}: ${q.rate}x then ${q.cap?.then_rate}x, want ${rate}x then ${floor}x`];
  });
  eq('Freedom Flex rotating rules carry the stacked total and fall back to the standing rate', wrong, []);
}

// --- user-configured card (not in the wallet, kept for engine coverage) --
{
  const r = run('shell.us', [{ productId: 'bofa-customized-cash', config: {} }]);
  eq('BofA gets base rate with no category selected', r.winner.rate, 1);
}
{
  const r = run('shell.us', [{ productId: 'bofa-customized-cash',
    config: { selections: ['gas_ev'], tier_multiplier: 1.75 } }]);
  eq('selected group + BofA Rewards Premier = 3 x 1.75', r.winner.rate, 5.25);
}
{
  // One BofA choice ("Gas & EV Charging Stations") spans two of our categories.
  const cfg = { selections: ['gas_ev'] };
  const gas = run('shell.us', [{ productId: 'bofa-customized-cash', config: cfg }]);
  const ev = rank({ hostname: 'x.example', merchants: { 'x.example': { category: 'ev_charging' } },
                    products, instances: [{ productId: 'bofa-customized-cash', config: cfg }],
                    valuations, now: IN_Q3 });
  eq('one selection group covers both of its categories', [gas.winner.rate, ev.winner.rate], [3, 3]);
}

// --- regressions from the 2026-08-29 audit -------------------------------
{
  const r = run('uber.com');
  eq('AUDIT-A no portal note on rideshare (not bookable through a portal)', r.notes.length, 0);
}
{
  const r = run('delta.com');
  eq('AUDIT-A portal notes only where the detour actually pays more',
     r.notes.every(n => n.value > (card(r, n.productId) || {}).value), true);
  eq('AUDIT-A best portal option is listed first', r.notes[0].productId, 'chase-sapphire-reserve');
}
{
  const r = run('costco.com');
  eq('AUDIT-B every card is on its base rate here', r.all.filter(c => c.matchedCategory).length, 0);
  // The wallet is fully verified now, so prove the mechanism with a synthetic
  // unverified product rather than deleting the regression.
  const unv = { u: { id: 'u', issuer: 'x', currency: 'cash', name: 'U', base_rate: 1, verified: false, rules: [] } };
  const r2 = rank({ hostname: 'costco.com', merchants, products: unv,
                    instances: [{ productId: 'u', config: {} }], valuations, now: IN_Q3 });
  eq('AUDIT-B unverified warning still fires on a pure base-rate page',
     r2.all.some(c => c.caveats.includes('Unverified data')), true);
}
{
  // Deliberately not a real id. This used to say 'chase-sapphire-preferred',
  // which stopped being a missing product the day that card was added to the
  // catalogue -- a fixture that names a plausible card is a fixture waiting to
  // come true.
  const stale = [{ productId: 'no-such-card-in-any-catalogue', config: {} },
                 { productId: 'robinhood-gold', config: {} }];
  eq('AUDIT-C pruneInstances drops products that no longer exist',
     pruneInstances(stale, products).map(i => i.productId), ['robinhood-gold']);
}
{
  const jan1 = new Date('2026-01-01T00:30:00');
  const q1 = { start: '2026-01-01', end: '2026-03-31' };
  const inst = [{ productId: 'tz', config: {} }];
  const prod = { tz: { id: 'tz', issuer: 't', currency: 'cash', name: 'TZ', base_rate: 1, verified: true,
                       rules: [{ category: 'other', rate: 5, window: q1 }] } };
  const r = rank({ hostname: 'unknown.example', merchants: {}, products: prod,
                   instances: inst, valuations, now: jan1 });
  eq('AUDIT-E window opens at local midnight, not UTC midnight', r.winner.rate, 5);
}

// --- CSR verified against chase.com 2026-08-29 ---------------------------
{
  const csr = products['chase-sapphire-reserve'];
  eq('CSR is now a verified record', [csr.verified, csr.last_verified], [true, '2026-08-29']);
  const r = run('lyft.com');
  eq('CSR 5x Lyft applies inside the open-ended window', card(r, 'chase-sapphire-reserve').rate, 5);
  eq('and it wins rideshare at 7.5%', r.winner.productId, 'chase-sapphire-reserve');
  eq('Lyft promo end date surfaced as a caveat',
     card(r, 'chase-sapphire-reserve').caveats.some(c => c.includes('2027-09-30')), true);
}
{
  const r = run('lyft.com', WALLET, { now: new Date('2027-10-01T12:00:00') });
  eq('CSR Lyft rate lapses after the offer ends', card(r, 'chase-sapphire-reserve').rate, 1);
}
{
  const r = run('uber.com');
  eq('Lyft allowlist does not leak to Uber', card(r, 'chase-sapphire-reserve').rate, 1);
}
{
  const r = run('delta.com');
  eq('travel credit condition surfaced on airfare',
     card(r, 'chase-sapphire-reserve').caveats.some(c => c.includes('$300/yr')), true);
}

{
  const r = run('expedia.com');
  eq('CSR 4x does NOT apply on an OTA (rate is booked-direct only)',
     card(r, 'chase-sapphire-reserve').rate, 1);
  eq('so the flat 3% takes Expedia', r.winner.productId, 'robinhood-gold');
  eq('but the portal detour is still surfaced',
     r.notes.some(n => n.text.includes('Chase Travel')), true);
}
{
  const r = run('marriott.com');
  eq('booking direct still earns the full 4x', card(r, 'chase-sapphire-reserve').rate, 4);
}

// --- all 7 records verified 2026-08-29 -----------------------------------
{
  const unverified = Object.keys(products).filter(k => !k.startsWith('_') && !products[k].verified);
  eq('no unverified card records remain', unverified, []);
  eq('every record cites a source', Object.keys(products)
     .filter(k => !k.startsWith('_') && !products[k].source_url), []);
}
{
  const r = run('shell.us');
  eq('Flex Q3 gas is now a verified rotating category, no placeholder warning',
     card(r, 'chase-freedom-flex').caveats.some(c => c.startsWith('Rotating category --')), false);
  eq('Flex still wins gas at 7.5%', r.winner.productId, 'chase-freedom-flex');
}
{
  const r = run('uber.com');
  eq('Flex Q3 public transit now beats the 3% flat on rideshare',
     [r.winner.productId, r.winner.value], ['chase-freedom-flex', 7.5]);
}
{
  const r = run('ticketmaster.com');
  eq('Flex 5% live entertainment applies at Ticketmaster', card(r, 'chase-freedom-flex').rate, 5);
}
{
  const r = run('fandango.com');
  eq('but NOT at a cinema box office (Q3 category is live only)',
     card(r, 'chase-freedom-flex').rate, 1);
}
{
  const r = run('expedia.com');
  eq('Robinhood 5% travel portal is not modelled (unconfirmed by issuer)',
     r.notes.some(n => n.text.includes('Robinhood')), false);
}

// --- activation flag -----------------------------------------------------
{
  const r = run('shell.us');
  eq('rotating category winner is flagged as needing activation',
     r.winner.needsActivation, true);
}
{
  const r = run('wholefoodsmarket.com');
  eq('an ordinary bonus category is not', r.winner.needsActivation, false);
}
{
  const r = run('costco.com');
  eq('a card on its base rate is not', r.winner.needsActivation, false);
}

// --- merchant-page detection ---------------------------------------------
const M = (sig, known = false, content = false) => isMerchantPage(sig, known, content);

// Being in merchants.json settles the category, not whether this page sells.
eq('a known merchant with no transactional signal does NOT show', M({}, true), false);
eq('a known merchant with one weak signal does', M({ cartLink: true }, true), true);
// Live youtube.com/watch, 2026-09-04: VideoObject markup and og:type video.other.
// The weak signals here come and go with whatever ad, comment or shopping shelf
// happens to render, so the page's OWN markup has to settle it.
eq('LIVE youtube watch page does not show',
   M({ ldTypes: ['VideoObject', 'InteractionCounter'], ogType: 'video.other',
       platform: false, cartLink: false, buttonLabels: [], price: false }, true), false);
eq('...nor when an ad on it puts a price in the page text',
   M({ ldTypes: ['VideoObject', 'InteractionCounter'], ogType: 'video.other',
       cartLink: false, buttonLabels: [], price: true }, true), false);
eq('...nor when a shopping shelf renders a buy control',
   M({ ldTypes: ['VideoObject'], ogType: 'video.other',
       cartLink: true, buttonLabels: ['Buy now'], price: true }, true), false);
// Renting a film on YouTube is still caught, because the payment-method chooser
// makes it a checkout before the media veto is ever reached.
eq('but paying for one does',
   M({ ldTypes: ['Movie'], ogType: 'video.movie', paymentChoice: true }, true), true);
// A retail product page routinely embeds a product video. Commerce markup on
// the page must beat the media markup, or every such listing would vanish.
eq('a product page with a product video still shows',
   M({ ldTypes: ['Product', 'VideoObject'], ogType: 'product', price: true }), true);
// youtube.com is flagged content_site in merchants.json, so its markup-free
// surfaces need real payment machinery. Measured live 2026-09-04: the feed and
// the Premium page are IDENTICAL in signals -- no JSON-LD, no og:type, no
// controls, only a price that may or may not have rendered -- so no weak signal
// can separate them, and the feed is the one the user is actually looking at.
const YT_BARE = { ldTypes: [], ogType: '', cartLink: false, buttonLabels: [] };
eq('LIVE youtube feed does not show', M({ ...YT_BARE, price: false }, true, true), false);
eq('...nor when an ad on the feed renders a price',
   M({ ...YT_BARE, price: true }, true, true), false);
eq('...nor the Premium marketing page, which is the same page in signals',
   M({ ...YT_BARE, price: true }, true, true), false);
eq('but the moment a card field appears, it does',
   M({ ...YT_BARE, price: true, paymentField: true }, true, true), true);
eq('...and a payment-method chooser counts too',
   M({ ...YT_BARE, paymentChoice: true }, true, true), true);
// The flag is per-domain data, not a rule about streaming. It is carried by the
// three domains measured to need it, and by no others -- see the streaming block
// below for netflix.com and hulu.com, and for the ones left deliberately unflagged.

// --- money-shaped sites that sell nothing, measured live 2026-09-09 --------
// The question these answer: does payment branding alone put the dock on a site
// where no purchase is ever made? It does not, and rule 1 is why. None of the
// three carries ANY commerce context -- no cart link, no storefront platform, no
// commerce markup, no buy control -- so hasCommerceContext vetoes before a price
// or a "Checkout" button can be read. No never_show flag is needed for these.
const PAYSITE = { cartLink: false, platform: false, buttonLabels: [], price: true,
                 ogType: 'website', checkoutText: true };
eq('LIVE paypal.com/us/home does not show',
   M({ ...PAYSITE, ldTypes: ['Corporation', 'WebSite', 'WebPage', 'ImageObject', 'Article'] }), false);
// venmo.com renders a literal "Checkout" button. BUY_LABEL does not match a bare
// "Checkout", and a button is not an a[href*="/checkout"], so neither the
// buy-control signal nor the cart-link signal fires.
eq('LIVE venmo.com does not show, despite a "Checkout" button',
   M({ ...PAYSITE, ldTypes: ['Corporation', 'WebSite', 'WebPage', 'ImageObject', 'Article'],
       buttonLabels: ['Debit', 'Credit', 'Checkout'] }), false);
eq('LIVE coinbase.com does not show',
   M({ ...PAYSITE, ldTypes: ['Organization', 'ContactPoint'] }), false);

// --- utility bill pay, measured live 2026-09-09 ---------------------------
// coned.com's public site is signal-free: no JSON-LD, no og:type, no cart, no
// price. That is the result that matters. LISTING a utility in merchants.json
// does not spray the dock over its marketing pages, because the known-merchant
// branch still demands one weak signal and the marketing site has none. The bill
// page supplies one (an amount due). Listing a utility is data-only, no engine
// change -- which is what makes the utilities category reachable at all.
const CONED = { ldTypes: [], ogType: '', cartLink: false, platform: false,
                buttonLabels: [], price: false };
eq('LIVE coned.com public site does not show when unlisted', M(CONED), false);
eq('LIVE coned.com public site does not show when listed either', M(CONED, true), false);
eq('...but a bill page would, on the amount due alone', M({ ...CONED, price: true }, true), true);

// t-mobile.com is the opposite case, and it is live TODAY. A real /cart link
// plus a price is two weak signals, so the dock already mounts on the home page.
// It is absent from merchants.json and carries no commerce markup, so
// inferCategory returns null and every T-Mobile charge ranks as "everything
// else". Showing is correct; the category is wrong.
const TMO = { ldTypes: ['Corporation', 'ContactPoint'], ogType: 'website',
              cartLink: true, platform: false, buttonLabels: [], price: true };
eq('LIVE t-mobile.com home shows on cart link + price', M(TMO, true), true);
// This is what made it wrong before the table entry: showing was never the
// problem, the CATEGORY was. Nothing in the markup infers telecom, so without a
// merchants.json row it ranked as "everything else".
eq('...and nothing in its markup infers a category', inferCategory(TMO), null);

// --- streaming marketing pages, measured live 2026-09-09 ------------------
// netflix.com and hulu.com/welcome are IDENTICAL in shape to youtube.com/premium
// -- no JSON-LD, no usable og:type, no controls, one price. Both are now flagged
// content_site, so that shape no longer mounts the dock: on a site whose markup
// says nothing at all, only real payment machinery can tell a browse grid from a
// payment step.
//
// Resolved through merchants.json rather than hardcoded, so the flag and the
// behaviour cannot drift apart -- the same class of bug as a rule the tests
// exercise and the browser never runs.
const SITE = host => {
  const m = resolveMerchant(host, merchants);
  return sig => isMerchantPage(sig, !!m, !!(m && m.content_site));
};
const STREAM_MARKETING = { ldTypes: [], ogType: '', cartLink: false,
                           platform: false, buttonLabels: [], price: true };
eq('LIVE netflix.com home no longer shows on a price alone',
   SITE('netflix.com')(STREAM_MARKETING), false);
eq('LIVE hulu.com/welcome no longer shows on a price alone',
   SITE('hulu.com')(STREAM_MARKETING), false);
// What still qualifies on a content site: a card field, a payment-method chooser,
// or a billing form. Nothing else -- a browse grid carries stray text and a watch
// page carries shopping shelves, so neither copy nor controls can be trusted here.
//
// Measured on a live netflix.com account payment page, 2026-09-09, signed in:
// card field TRUE, payment chooser FALSE, billing form FALSE. So the flag does
// not blind the one page that matters -- but note that the card field is the
// ONLY thing holding it up. There is no second signal in reserve: if Netflix
// moves card entry into a frame whose name and title miss the selectors, that
// page goes dark and nothing else on it would qualify.
eq('LIVE netflix payment page still shows: card field, measured 2026-09-09',
   SITE('netflix.com')({ ...STREAM_MARKETING, paymentField: true,
                         paymentChoice: false, billingForm: false }), true);
eq('...and a payment-method chooser does',
   SITE('netflix.com')({ ...STREAM_MARKETING, paymentChoice: true }), true);
eq('...and a billing form does',
   SITE('hulu.com')({ ...STREAM_MARKETING, billingForm: true }), true);
// The cost of the flag, stated rather than discovered later: a payment step
// carrying NONE of those three -- only a checkout-shaped URL, checkout copy and a
// commit button -- stays dark. Same trade already accepted for youtube.com/premium.
eq('the cost: a commit button alone is not enough on a content site',
   SITE('netflix.com')({ ...STREAM_MARKETING, checkoutUrl: true, checkoutText: true,
                         buttonLabels: ['Start Membership'] }), false);
// The remaining three, measured live 2026-09-09. They did NOT all behave alike,
// which is the point of measuring rather than reasoning by category.
// audible.com, measured 2026-09-10. One domain serves the store, the marketing
// page and the player you listen in, which is the netflix.com problem -- but
// unlike Netflix its PRODUCT pages carry real commerce markup, so flagging it
// costs nothing. commerce beats content_site inside isMerchantPage, and these
// two cases are what say so out loud.
//
// Homepage: Organization + FAQPage, og:type "book", a price, no cart link and
// no buy control. Price only, nothing structural.
const AUDIBLE_HOME = { ldTypes: ['Organization', 'FAQPage'], ogType: 'book',
                       cartLink: false, platform: false, buttonLabels: [], price: true };
// Product page: Product + Offer (and Audiobook + Offer), same og:type and price.
const AUDIBLE_PDP = { ...AUDIBLE_HOME,
                      ldTypes: ['Product', 'Offer', 'Audiobook', 'BreadcrumbList'] };
eq('LIVE audible.com home stays dark: price only, measured 2026-09-10',
   SITE('audible.com')(AUDIBLE_HOME), false);
eq('...but a /pd/ page shows, because Product markup beats the content_site flag',
   SITE('audible.com')(AUDIBLE_PDP), true);
eq('...and payment machinery still qualifies the flagged surfaces',
   SITE('audible.com')({ ...AUDIBLE_HOME, paymentField: true }), true);
// The row exists at all because Prime Visa names audible.com in a
// merchant_allowlist. Without it the domain resolved to nothing, fell to
// `other`, and the card earned its 1% base on a 5% purchase.
{
  const r = run('audible.com', own('chase-prime-visa'));
  eq('audible.com resolves as a merchant, not a default',
     [r.category, r.categorySource], ['online_retail', 'merchant']);
  eq('...so Prime Visa\'s allowlisted 5% actually fires', r.winner.rate, 5);
}

eq('LIVE disneyplus.com is the netflix shape, so it is flagged too',
   SITE('disneyplus.com')(STREAM_MARKETING), false);

// spotify.com is measured and deliberately NOT flagged. Netflix serves the browse
// grid and the pricing copy from one markup-free page, so no weak signal can
// separate them. Spotify splits them across two hosts: open.spotify.com carries no
// price at all, and spotify.com/us/premium/ is where you actually subscribe.
// Flagging would suppress the second and gain nothing on the first.
eq('LIVE open.spotify.com player is already dark, with no flag needed',
   SITE('open.spotify.com')({ ...STREAM_MARKETING, price: false }), false);
eq('...and spotify.com/us/premium/ still shows, which is the point',
   SITE('spotify.com')({ ...STREAM_MARKETING, ldTypes: ['Organization', 'PostalAddress'],
                         ogType: 'website' }), true);
// The latent risk, recorded rather than guarded: the player is dark only because
// its price is false. An upsell price in the web player would mount the dock on a
// page you are listening to.
eq('...but a price in the player WOULD show it, which is the thing to watch',
   SITE('open.spotify.com')(STREAM_MARKETING), true);

// max.com redirects to hbomax.com in a browser, so the old row matched almost
// nothing -- HBO Max resolved to no merchant at all and, having no commerce
// context either, showed nowhere. A merchant row can die by redirect; a curl
// sweep of all 78 found this one, and would not have found it at all if the
// redirect had been client-side only, which for max.com it very nearly was.
eq('hbomax.com resolves now', run('www.hbomax.com').categorySource, 'merchant');
eq('...as streaming', run('www.hbomax.com').category, 'streaming');
eq('...and is flagged, being the netflix shape',
   SITE('www.hbomax.com')(STREAM_MARKETING), false);
eq('...with max.com kept for stale links, flagged the same way',
   SITE('max.com')(STREAM_MARKETING), false);

// The browser sweep of the 25 rows curl could not confirm, 2026-09-09. Twenty-one
// resolved to themselves. exxon.com did not: it CLIENT-SIDE redirects to
// exxonmobilfuels.com, which is the case a curl sweep is blind to by construction
// -- plain HEAD reported "403, host unchanged" and was simply wrong. Two of the 79
// rows were dead, and only one of the two was visible over HTTP.
//
// exxonmobilfuels.com is the consumer site, not a brand hub: rewards, the station
// finder and both brand pages sit under it, and the Rewards+ account lives on
// rewards.exxonmobilfuels.com, which resolveMerchant's suffix walk already covers.
const EXXON = { ldTypes: ['Organization'], ogType: 'Website', cartLink: false,
                platform: false, buttonLabels: [] };
eq('exxonmobilfuels.com resolves', run('www.exxonmobilfuels.com').categorySource, 'merchant');
eq('...as gas, so the three gas card rules can reach it',
   run('www.exxonmobilfuels.com').category, 'gas');
eq('...and the Rewards+ subdomain resolves through the suffix walk',
   run('rewards.exxonmobilfuels.com').category, 'gas');
eq('its signal-free home stays dark', SITE('www.exxonmobilfuels.com')(EXXON), false);
eq('...but /en/rewards renders a price, so the dock mounts there',
   SITE('www.exxonmobilfuels.com')({ ...EXXON, price: true }), true);

// --- dead categories, closed 2026-09-09 -----------------------------------
// A category is dead when a card bonuses it and no page can ever resolve to it.
// ev_charging was the real one: two card rules (Freedom Flex 5x, BofA CCR 3x)
// and zero merchants, so every charging charge ranked as "everything else".
//
// There is no inference path to fall back on either. EVChargingStation is NOT a
// schema.org type -- checked 2026-09-09, 404 on both schema.org and
// pending.schema.org -- so the table is the ONLY mechanism that can resolve this
// category, which is why the fix is a merchants.json row and not an LD_CATEGORY
// entry. Do not add one; it would be a mapping for a type that does not exist.
eq('ev_charging resolves from the table', run('evgo.com').category, 'ev_charging');
eq('...from the table, not a guess', run('evgo.com').categorySource, 'merchant');
eq('...and Freedom Flex 5x finally applies to it',
   card(run('evgo.com'), 'chase-freedom-flex').rate, 5);
eq('...where before the row it fell to everything else',
   run('nowhere-ev.example', WALLET, { signals: {} }).category, 'other');

// Listing a merchant is only safe if its marketing pages stay quiet. Measured
// 2026-09-09: evgo.com and electrifyamerica.com are entirely signal-free, so the
// rows cost nothing. chargepoint.com renders a price, so its row DOES mount the
// dock on a B2B marketing site -- accepted and recorded rather than discovered.
const QUIET = { ldTypes: [], ogType: '', cartLink: false, platform: false,
                buttonLabels: [], price: false };
eq('LIVE evgo.com marketing home stays dark', SITE('evgo.com')(QUIET), false);
eq('LIVE electrifyamerica.com marketing home stays dark',
   SITE('electrifyamerica.com')(QUIET), false);
eq('the cost: LIVE chargepoint.com home renders a price, so its row shows there',
   SITE('chargepoint.com')({ ...QUIET, price: true }), true);

// Phone and internet are distinct card buckets from utilities: Ink Cash's 5% reads
// "internet, cable and phone services", which no issuer folds into utilities.
// They were one category, phone_internet, until 2026-09-27, when Wells Fargo
// Autograph's "phone plans" -- landline and cell, NOT internet or cable -- made
// the difference rank something. U.S. Bank Cash+ splits them the same way.
eq('t-mobile.com ranks as phone', run('t-mobile.com').category, 'phone');
eq('verizon.com too', run('verizon.com').category, 'phone');
eq('xfinity.com ranks as internet_cable', run('xfinity.com').category, 'internet_cable');

// utilities resolves, but see the README: a hand table cannot cover ~3,000 US
// utilities, and no card in cards.json bonuses the category yet. coned.com is
// the worked example proving the mechanism, not the start of a list.
eq('coned.com resolves to utilities', run('coned.com').category, 'utilities');
// Live homedepot.com homepage, 2026-08-30: one weak signal, a real merchant.
eq('LIVE home depot homepage still shows',
   M({ ldTypes: ['WebSite', 'Organization'], ogType: 'homepage',
       cartLink: true, buttonLabels: [], price: false }, true), true);
// A bare payment page has no product markup at all, but must still mount the
// dock or the checkout auto-open would have nothing to open.
eq('a bare page does not', M({}), false);
eq('news article quoting one price does not', M({ price: true }), false);
eq('a buy control alone does not', M({ buttonLabels: ['Add to cart'] }), false);
eq('two weak signals together do', M({ price: true, cartLink: true }), true);
eq('price + a buy control does', M({ price: true, buttonLabels: ['Add to cart'] }), true);
eq('JSON-LD Product alone is enough', M({ ldTypes: ['WebPage', 'Product'] }), true);
eq('JSON-LD Hotel alone is enough (this is the IHG case)', M({ ldTypes: ['Hotel'] }), true);
eq('JSON-LD Article is not', M({ ldTypes: ['Article', 'BreadcrumbList'] }), false);
// ihg.com's own landing page markup, read off the live site 2026-08-29.
eq('JSON-LD OfferCatalog is enough (real IHG homepage signal)',
   M({ ldTypes: ['WebSite', 'Organization', 'OfferCatalog', 'FAQPage'], ogType: 'website',
       buttonLabels: ['Add to cart'], cartLink: false, price: false }), true);
eq('og:type product is enough', M({ ogType: 'product' }), true);
eq('og:type product.item is enough', M({ ogType: 'product.item' }), true);
eq('og:type article is not', M({ ogType: 'article' }), false);
eq('a storefront platform fingerprint is enough', M({ platform: true }), true);
// Real signals read off live pages on 2026-08-29.
eq('LIVE wikipedia "Credit card" article is NOT a merchant page',
   M({ ldTypes: ['Article', 'Organization', 'ImageObject'], ogType: 'website',
       buttonLabels: ['Add to cart'], cartLink: false, price: true }), false);
eq('LIVE allbirds.com shows via its Shopify fingerprint',
   M({ ldTypes: ['CollectionPage', 'ItemList', 'FAQPage'], ogType: 'website',
       platform: true, buttonLabels: ['Add to cart'], cartLink: false, price: true }), true);
eq('an editorial page WITH a real cart link still counts',
   M({ ldTypes: ['NewsArticle'], buttonLabels: ['Add to cart'], cartLink: true, price: true }), true);
eq('a hotel page with book-now and a price but no cart link counts',
   M({ ldTypes: [], buttonLabels: ['Add to cart'], price: true }), true);
eq('empty signals object is safe', M(), false);

// --- category inference for merchants not in the table --------------------
const IC = s => inferCategory(s);
eq('Hotel markup beats generic Product markup on the same page',
   IC({ ldTypes: ['Product', 'Offer', 'Hotel'] }), 'travel_hotel');
eq('Restaurant markup', IC({ ldTypes: ['Restaurant'] }), 'dining');
eq('GroceryStore markup', IC({ ldTypes: ['GroceryStore'] }), 'groceries');
eq('Pharmacy markup', IC({ ldTypes: ['Pharmacy'] }), 'drugstore');
eq('Airline markup', IC({ ldTypes: ['Airline'] }), 'travel_air');
eq('DepartmentStore beats Product', IC({ ldTypes: ['Product', 'DepartmentStore'] }), 'department_store');
eq('HomeGoodsStore markup', IC({ ldTypes: ['HomeGoodsStore'] }), 'home_improvement');
eq('bare Product markup is online retail', IC({ ldTypes: ['Product'] }), 'online_retail');
eq('og:type product is online retail', IC({ ogType: 'product' }), 'online_retail');
eq('a storefront platform alone is online retail', IC({ platform: true }), 'online_retail');
eq('editorial markup infers nothing', IC({ ldTypes: ['Article'] }), null);
eq('OfferCatalog proves commerce but not a category', IC({ ldTypes: ['OfferCatalog'] }), null);
eq('no signals infers nothing', IC(), null);

// The live allbirds.com case: detected as a merchant, but absent from
// merchants.json, so before inference it fell to "everything else" and
// silently dropped Blue Cash Everyday's 3% US online retail.
{
  const ALLBIRDS = { ldTypes: ['CollectionPage', 'ItemList', 'FAQPage'], ogType: 'website',
                     platform: true, cartLink: true, buttonLabels: ['Add to cart'], price: true };
  const r = run('allbirds.com', WALLET, { signals: ALLBIRDS });
  eq('LIVE allbirds is inferred as online retail', r.category, 'online_retail');
  eq('...and flagged as a guess, not a verified merchant', r.categorySource, 'inferred');
  eq('...which brings BCE back into contention', ids(r),
     ['amex-blue-cash-everyday', 'robinhood-gold']);
  eq('...so the user is asked instead of silently losing 3%', r.resolvedBy, 'unresolved');
}
{
  // The hand-verified table must still win over whatever a page claims.
  const r = run('target.com', WALLET, { signals: { ldTypes: ['GroceryStore'] } });
  eq('merchants.json outranks page markup', r.category, 'department_store');
  eq('...and is reported as verified', r.categorySource, 'merchant');
}
{
  const r = run('nowhere.example', WALLET, { signals: {} });
  eq('nothing known and nothing inferable falls back', r.category, 'other');
  eq('...reported honestly as a default', r.categorySource, 'default');
}

// --- commit-button labels -------------------------------------------------
// Every false entry below is a real button seen on a live page. "PayPal" and
// "Pay in 4" both slipped through earlier versions of this regex.
[['Place your order', true], ['Place Order', true], ['Pay now', true], ['Pay', true],
 ['Pay $52.10', true], ['Complete your purchase', true], ['Submit my order', true],
 ['Confirm and pay', true], ['Confirm order', true], ['Buy now', true],
 ['PayPal', false], ['Payment method', false], ['Pay in 4', false],
 ['Pay in 4 interest-free payments', false], ['Payments', false], ['Pay later', false],
 ['Apple Pay', false], ['Google Pay', false], ['Proceed to checkout', false],
 ['Continue to payment', false], ['Add to cart', false], ['View cart', false],
 ['', false]
].forEach(([label, want]) =>
  eq(`commit label ${JSON.stringify(label)}`, isCommitLabel(label), want));

// --- buy controls, not page text ------------------------------------------
// This project's own README quotes "add to cart" and "Pay $52.10" as examples.
// A page-text scan flagged the GitHub page rendering it as a storefront, so the
// signal is now the presence of an actual control.
[['Add to cart', true], ['Add to Bag', true], ['Add to basket', true],
 ['Buy now', true], ['Buy it now', true], ['Book now', true],
 ['Check availability', true], ['Reserve now', true],
 ['Add to cart to see price', true],
 ['Code', false], ['Star', false], ['Fork', false], ['Edit file', false],
 ['Read about add to cart', false], ['Cart', false], ['Buy', false],
 ['', false]
].forEach(([l, want]) => eq(`buy label ${JSON.stringify(l)}`, isBuyLabel(l), want));

// Live github.com/davidx7217/card-picker, 2026-08-30: the rendered README puts
// commerce words and a price on the page, but nothing you can click to buy.
eq('LIVE github repo page showing this README is not a storefront',
   M({ ldTypes: [], ogType: 'object', platform: false, cartLink: false, price: true,
       buttonLabels: ['Code', 'Star', 'Fork', 'Edit file', 'Add file'] }), false);
eq('a real product page with the same words on a button is',
   M({ ldTypes: [], cartLink: false, price: true,
       buttonLabels: ['Add to cart', 'Wishlist'] }), true);

// --- checkout detection ---------------------------------------------------
const CO = s => isCheckoutPage(s);

eq('a card-number field alone is conclusive', CO({ paymentField: true }), true);
eq('a commit button alone is conclusive (saved-card checkouts have no field)',
   CO({ buttonLabels: ['Edit', 'Place your order'] }), true);
eq('a payment-method chooser is conclusive', CO({ paymentChoice: true }), true);
// The actual culprit behind the dock appearing on this project's own GitHub
// page: paymentChoice used to have a text form matching "Visa ending in 4242",
// which the README documents verbatim -- and paymentChoice is conclusive alone.
eq('LIVE github repo page is not a checkout either',
   CO({ paymentField: false, paymentChoice: false, billingForm: false,
        checkoutUrl: false, checkoutText: true, buttonLabels: ['Code', 'Star', 'Fork'] }), false);
eq('prose about a saved card proves nothing',
   CO({ paymentChoice: false, checkoutUrl: false, checkoutText: true }), false);
eq('a billing autocomplete form is conclusive', CO({ billingForm: true }), true);
// Live payments.wikimedia.org card step, 2026-08-29. No card field on this
// step at all and no recognisable commit label ("Donate"), so the earlier
// version passed only by accident. It now has two real reasons.
eq('LIVE wikimedia payments step is checkout',
   CO({ paymentField: false, buttonLabels: ['Donate', 'Close', 'Back'],
        paymentChoice: true, billingForm: true,
        checkoutUrl: false, checkoutText: false }), true);
// Live Amazon cart, 2026-08-29: its only actionable button is the one that
// takes you TO checkout, so the cart must not read as checkout.
eq('LIVE amazon cart is not checkout',
   CO({ paymentField: false, paymentChoice: false, billingForm: false,
        checkoutUrl: false, checkoutText: false,
        buttonLabels: ['Go', 'All', 'Proceed to checkout', 'Back to top'] }), false);
// Live Wikimedia donate landing, 2026-08-29: wallet buttons only, no card form.
eq('LIVE wikimedia donate landing is not checkout',
   CO({ paymentField: false, paymentChoice: false, billingForm: false,
        checkoutUrl: false, checkoutText: true,
        buttonLabels: ['PayPal', 'Venmo', 'Apple Pay', 'Google Pay', 'Donate monthly'] }), false);
eq('so is a hosted processor iframe (same signal)',
   CO({ paymentField: true, checkoutUrl: false, checkoutText: false }), true);
eq('a /checkout URL alone is not', CO({ checkoutUrl: true }), false);
eq('checkout copy alone is not', CO({ checkoutText: true }), false);
eq('URL plus copy together is', CO({ checkoutUrl: true, checkoutText: true }), true);
eq('a product page is not checkout',
   CO({ buttonLabels: ['Add to cart'], cartLink: true, price: true }), false);
eq('empty signals are safe', CO(), false);
// Live check on docs.stripe.com 2026-08-29: the mounted card element appears as
// iframe[name*="StripeFrame"], while eight iframe[src*="js.stripe.com"] frames
// on the same page are controller/metrics frames with no card field. Matching
// on src would auto-open the panel on any page that merely loads stripe.js.
eq('a page that only loads stripe.js is not checkout',
   CO({ paymentField: false, checkoutUrl: false, checkoutText: false }), false);
// Signals captured from a live Shopify checkout (allbirds.com) on 2026-08-29.
// Note checkoutUrl was false there: the path is /checkouts/cn/... and the card
// frames carried the detection on their own.
const ALLBIRDS_CHECKOUT = { ldTypes: [], ogType: '', platform: true, cartLink: true,
  buttonLabels: [], price: false, paymentField: true, checkoutUrl: false, checkoutText: true };
eq('LIVE Shopify checkout is detected as checkout', CO(ALLBIRDS_CHECKOUT), true);
eq('LIVE Shopify checkout also passes the merchant gate, so the dock exists to open',
   isMerchantPage(ALLBIRDS_CHECKOUT, false), true);
eq('a /payment marketing page with no checkout copy is not',
   CO({ checkoutUrl: true, checkoutText: false, price: true }), false);

// A checkout page must also pass the merchant gate, or the dock never mounts
// and there is nothing to auto-open.
eq('a real checkout is also a merchant page',
   isMerchantPage({ cartLink: true, price: true, checkoutText: true }), true);

// Payment machinery WITHOUT any sign the site sells things is not shopping.
// The dock turned up on an employer's payroll portal on exactly this basis:
// direct-deposit forms have payment-method choosers and billing addresses.
eq('a billing form on a site that sells nothing is not a merchant page',
   isMerchantPage({ billingForm: true }, false), false);
eq('nor is a card field on its own',
   isMerchantPage({ paymentField: true }, false), false);
eq('payroll-shaped page: money everywhere, nothing for sale',
   isMerchantPage({ ldTypes: [], platform: false, cartLink: false, price: true,
                    paymentChoice: true, billingForm: true, checkoutText: true,
                    buttonLabels: ['Save', 'Cancel', 'Add direct deposit'] }, false), false);
// The same machinery ON a site that does sell is still a checkout.
eq('...but the identical signals on a storefront are',
   isMerchantPage({ platform: true, billingForm: true, paymentChoice: true }, false), true);
eq('...as they are on a known merchant',
   isMerchantPage({ billingForm: true, paymentChoice: true }, true), true);

// The blocklist assertions moved to tools/test-lifecycle.mjs, where they run
// against src/hostmatch.js -- the copy the browser actually loads.

{
  // The popup reports the band it actually used, so a changed tieBand cannot
  // silently explain away a missing tie.
  const r = run('doordash.com');
  eq('rank reports the tie band it used', r.tieBand, 0.10);
  // Exactly equal values are tied at ANY band, zero included: (top-v)/top is
  // 0, and 0 <= 0. So no tieBand setting can explain away a missing tie
  // between cards that earn identically -- only a saved default, or a card not
  // being owned, can.
  const tight = run('doordash.com', WALLET, { prefs: { tieBand: 0 } });
  eq('a zero band still groups an EXACT tie', tight.tied.length, 4);
  eq('...and still reports it as unresolved', tight.resolvedBy, 'unresolved');
  eq('...and reports the band responsible', tight.tieBand, 0);
}

// --- wallet order is not a preference ------------------------------------
// Top-to-bottom ordering, and the pinning that went with it, were removed: a
// second way to settle a tie that the user could trigger by accident, on a list
// they were never told was meaningful. A tie the user has not deliberately
// settled is now always SHOWN, which is what the prompt was for.
{
  const cfuFirst = [
    { productId: 'chase-freedom-unlimited', config: {} },
    ...WALLET.filter(i => i.productId !== 'chase-freedom-unlimited')
  ];
  const r = run('doordash.com', cfuFirst);
  eq('being first in the wallet does not win a 4-way tie', r.resolvedBy, 'unresolved');
  eq('...and the whole tie group is still reported', r.tied.length, 4);
  eq('...with only a saved default able to settle it',
     run('doordash.com', cfuFirst,
         { prefs: { categoryDefaults: { dining: 'chase-aeroplan' } } }).resolvedBy,
     'category_default');
}

// --- empty state ---------------------------------------------------------
eq('no cards owned', run('target.com', []).resolvedBy, 'no_cards');

// --- staleness: when the number on screen may simply be out of date --------
// The bug this closes, measured on the real data: once Freedom Flex's Q3 window
// shut, the rule stopped applying, the card dropped from 5x to its 1x base, and
// EVERY caveat disappeared with it. The extension quietly stopped recommending a
// card it should still have been recommending, and said nothing about why. It
// fails closed, which is safe, but it fails silently, which is not.
const at = d => new Date(d + 'T12:00:00');
const flex = () => [{ productId: 'chase-freedom-flex', config: {} }];
const gasOn = d => run('exxon.com', flex(), { now: at(d) });

eq('in window and far from the end, no warning',
   gasOn('2026-09-09').all[0].staleReason, null);
eq('...and the 5x still applies', gasOn('2026-09-09').all[0].rate, 5);
eq('inside the last two weeks, it says when the rate ends',
   gasOn('2026-09-20').all[0].staleReason, 'This 5x rate ends 2026-09-30 (10 days).');
eq('on the last day it says today',
   gasOn('2026-09-30').all[0].staleReason, 'This 5x rate ends 2026-09-30 (today).');
eq('once expired, it says so and says what it fell back to',
   gasOn('2026-10-01').all[0].staleReason,
   "5x on gas expired 2026-09-30. This card's rotating categories have not been " +
   'updated, so it is being ranked on its base rate.');
eq('...and the rate really has dropped', gasOn('2026-10-01').all[0].rate, 1);
eq('the reason is mirrored into caveats, which is what the popup renders',
   gasOn('2026-10-01').all[0].caveats.some(c => c.startsWith('5x on gas expired')), true);
eq('rank reports one flag so a banner needs no walk of the list',
   [gasOn('2026-09-09').stale, gasOn('2026-10-01').stale], [false, true]);

// An expiry that costs nothing is not worth saying. Dining is not a rotating
// category on this card, so the lapsed gas rule changed no outcome there.
eq('an expiry that changed no outcome stays quiet',
   run('doordash.com', flex(), { now: at('2026-10-01') }).all[0].staleReason, null);

// Age of the product record itself, independent of any rule window.
{
  const old = { 'stale-card': { id: 'stale-card', name: 'Stale Card', issuer: 'x',
                  currency: 'cash', base_rate: 1, verified: true,
                  last_verified: '2026-01-01', rules: [] } };
  const fresh = { 'fresh-card': { ...old['stale-card'], id: 'fresh-card',
                  name: 'Fresh Card', last_verified: '2026-08-29' } };
  const one = (products, id, d) => rank({ hostname: 'exxon.com', merchants: {}, products,
    instances: [{ productId: id, config: {} }], valuations, now: at(d) }).all[0];
  eq('a record older than the re-verification interval warns',
     one(old, 'stale-card', '2026-09-09').staleReason,
     'Rates last verified 2026-01-01, 251 days ago. Re-check with the issuer.');
  eq('one inside it does not',
     one(fresh, 'fresh-card', '2026-09-09').staleReason, null);
  eq('...until it ages out', one(fresh, 'fresh-card', '2026-12-01').staleReason,
     'Rates last verified 2026-08-29, 94 days ago. Re-check with the issuer.');
}

// --- Chase Ink Business Cash, verified on chase.com 2026-09-09 -------------
// Added to make office_supply and phone_internet reachable at all: both were
// categories no card bonused, so they resolved and then ranked nothing.
const ink = () => [{ productId: 'chase-ink-business-cash', config: {} }];
const inkAt = h => run(h, ink(), { now: new Date('2026-09-09T12:00:00') });

eq('office_supply pays 5x, the headline category that did not exist before',
   inkAt('staples.com').all[0].rate, 5);
eq('...and officedepot.com reaches it too', inkAt('officedepot.com').category, 'office_supply');
eq('phone pays 5x, so t-mobile.com finally ranks something',
   inkAt('t-mobile.com').all[0].rate, 5);
eq('...and so does internet and cable, which the same 5% names',
   inkAt('xfinity.com').all[0].rate, 5);

// The misreading this card invites: its 5% is "office supply stores AND
// internet, cable and phone services". Gas and restaurants are the SEPARATE 2%
// tier, and utilities are in neither -- "internet, cable and phone" is not the
// same thing as electricity, and Chase does not say it is.
eq('gas is 2x, not 5x', inkAt('exxonmobilfuels.com').all[0].rate, 2);
eq('dining is 2x, not 5x', inkAt('doordash.com').all[0].rate, 2);
eq('utilities get the base rate, because phone and internet are not utilities',
   inkAt('coned.com').all[0].rate, 1);

// Lyft is 5% TOTAL and merchant-scoped, modelled the way the Sapphire Reserve's
// identical benefit already is.
eq('lyft.com gets the 5x', inkAt('lyft.com').all[0].rate, 5);
eq('...and uber.com does not, being outside the allowlist',
   inkAt('uber.com').all[0].rate, 1);
eq('...and it lapses with its window',
   run('lyft.com', ink(), { now: new Date('2027-10-01T12:00:00') }).all[0].rate, 1);

// Both caps are per ACCOUNT ANNIVERSARY year and each is shared across two
// categories, which is the kind of thing a user only discovers by overspending.
eq('the 5% cap is surfaced, and says it is shared',
   inkAt('staples.com').all[0].caveats,
   ['Capped at $25,000 per year, then 1x',
    'The $25,000 cap is combined with internet, cable and phone, and runs per account anniversary year.']);

// --- four cards verified on issuer sites 2026-09-09 ------------------------
const only = (id, h, when = '2026-09-09') =>
  run(h, [{ productId: id, config: {} }], { now: new Date(when + 'T12:00:00') });

// Amex Gold. Both 4X caps are per CALENDAR year and are SEPARATE from each
// other -- unlike Ink Cash, where one cap is shared across two categories. Get
// that wrong and a heavy grocery year looks like it kills the dining rate too.
eq('Gold pays 4x on restaurants', only('amex-gold', 'doordash.com').all[0].rate, 4);
eq('...and 4x at supermarkets', only('amex-gold', 'wholefoodsmarket.com').all[0].rate, 4);
eq('...with caps that say they are separate, not shared',
   [only('amex-gold', 'doordash.com').all[0].caveats[0],
    only('amex-gold', 'wholefoodsmarket.com').all[0].caveats[0]],
   ['Capped at $50,000 per year, then 1x', 'Capped at $25,000 per year, then 1x']);
eq('...3x on flights, which does NOT need the portal',
   only('amex-gold', 'delta.com').all[0].rate, 3);

// The 5X hotel rate is portal_only, so it must never be ranked on the hotel's
// own site -- it surfaces as a note instead. This is the rule that would quietly
// overstate every hotel booking if portal_only were dropped.
eq('...but its 5x hotels rate does NOT rank on hilton.com',
   only('amex-gold', 'hilton.com').all[0].rate, 1);
eq('...it surfaces as a route note instead',
   only('amex-gold', 'hilton.com').notes[0].text,
   'Amex Gold Card: 5x (8.00%) if you book through Amex Travel instead');

// Blue Cash Preferred closes the streaming category, which had seven merchants
// and nothing bonusing them.
eq('BCP pays 6x on streaming', only('amex-blue-cash-preferred', 'netflix.com').all[0].rate, 6);
eq('...6x at supermarkets, on the tightest cap in the catalogue',
   only('amex-blue-cash-preferred', 'kroger.com').all[0].caveats[0],
   'Capped at $6,000 per year, then 1x');
eq('...and 3x on transit', only('amex-blue-cash-preferred', 'uber.com').all[0].rate, 3);

// Citi Double Cash earns its 2% everywhere, with no category to match. A flat
// base rate beating category cards on unbonused sites is the whole point of it.
eq('Double Cash pays its 2x on a site with no bonus category',
   only('citi-double-cash', 'amazon.com').all[0].rate, 2);
eq('...and its portal rate is a note, not a ranking',
   only('citi-double-cash', 'amazon.com').all[0].caveats, []);

// Savor is currency 'cash', NOT 'c1'. It is a cash back card; the 1.4 cpp c1
// valuation belongs to the Venture miles family and would overstate it by 40%.
eq('Savor is valued as cash, not miles',
   only('capitalone-savor', 'doordash.com').all[0].value, 3);
eq('...3x on entertainment', only('capitalone-savor', 'ticketmaster.com').all[0].rate, 3);
eq('...and 3x on streaming, so two cards now reach that category',
   only('capitalone-savor', 'netflix.com').all[0].rate, 3);

// --- Discover it and Venture, verified on issuer sites 2026-09-09 ----------
// Discover publishes its whole year in advance, so BOTH live quarters are
// modelled and this card does not go stale on 2026-10-01 the way Freedom Flex
// does. Q3 is Gas, Transportation, Drug Stores; Q4 is Restaurants,
// Entertainment and Utilities -- which is what finally closes `utilities`.
const disco = (h, when) => only('discover-it-cash-back', h, when);

eq('Q3 pays 5x at the pump', disco('exxonmobilfuels.com', '2026-09-09').all[0].rate, 5);
eq('...on transport', disco('uber.com', '2026-09-09').all[0].rate, 5);
eq('...and at the drugstore', disco('cvs.com', '2026-09-09').all[0].rate, 5);
eq('Q4 is already live in the data, so it just works on 15 October',
   [disco('doordash.com', '2026-10-15').all[0].rate,
    disco('ticketmaster.com', '2026-10-15').all[0].rate,
    disco('coned.com', '2026-10-15').all[0].rate], [5, 5, 5]);
eq('...which is what finally makes utilities rank something',
   disco('coned.com', '2026-10-15').category, 'utilities');
eq('...and every quarter needs activating', disco('coned.com', '2026-10-15').all[0].needsActivation, true);

// ROTATION IS NOT STALENESS. This is the bug Discover exposed: on 15 October the
// Q3 gas rule has expired, but a Q4 rule is sitting right there in the same card,
// so the calendar is current and gas has simply had its turn. Warning here would
// be crying wolf, and a warning that cries wolf stops being read.
eq('a category whose quarter ended does NOT claim the data is stale',
   disco('exxonmobilfuels.com', '2026-10-15').all[0].staleReason, null);
eq('...but once the LAST modelled quarter lapses, it does say so',
   disco('doordash.com', '2027-01-05').all[0].staleReason,
   "5x on dining expired 2026-12-31. This card's rotating categories have not been " +
   'updated, so it is being ranked on its base rate.');
// Freedom Flex models one quarter only, so its lapse is genuinely stale data and
// must still warn. The fix had to tell these two cases apart, not silence both.
eq('Freedom Flex, with no later quarter modelled, still warns',
   only('chase-freedom-flex', 'exxonmobilfuels.com', '2026-10-01').all[0].staleReason,
   "5x on gas expired 2026-09-30. This card's rotating categories have not been " +
   'updated, so it is being ranked on its base rate.');

// Venture is the card the 'c1' valuation was written for: transferable miles, so
// 2x at 1.4 cpp is 2.80% rather than a flat 2%.
eq('Venture earns 2x on everything', only('capitalone-venture', 'amazon.com').all[0].rate, 2);
eq('...valued as transferable miles', only('capitalone-venture', 'amazon.com').all[0].value, 2.8);
eq('...and its 5x hotels rate stays a portal note, never a ranking',
   [only('capitalone-venture', 'hilton.com').all[0].rate,
    only('capitalone-venture', 'hilton.com').notes[0].text],
   [2, 'Capital One Venture Rewards: 5x (7.00%) if you book through Capital One Travel instead']);

// --- the category audit, both directions -----------------------------------
// Rules without merchants are dead; merchants without rules are inert. This was a
// README instruction to run by hand. It is an assertion now, so adding a card or
// a category cannot leave either kind behind without a red line saying which.
{
  const categories = load('categories');
  const cats = Object.keys(categories).filter(k => !k.startsWith('_'));
  const cards = Object.keys(products).filter(k => !k.startsWith('_')).map(k => products[k]);
  const rows = Object.keys(merchants).filter(k => !k.startsWith('_')).map(k => merchants[k]);
  const ruled = new Set(cards.flatMap(p => (p.rules || []).map(r => r.category)));
  const listed = new Set(rows.flatMap(m => [m.category, ...Object.values(m.issuer_overrides || {})]));

  eq('every rule names a category that exists', [...ruled].filter(c => !categories[c]), []);
  eq('every merchant row names a category that exists', [...listed].filter(c => !categories[c]), []);
  eq('every category but `other` has a card rule behind it',
     cats.filter(c => c !== 'other' && !ruled.has(c)), []);
  // travel_portal is where issuer-portal rules are filed; no website IS the portal.
  eq('every category but `other` and `travel_portal` has merchants behind it',
     cats.filter(c => c !== 'other' && c !== 'travel_portal' && !listed.has(c)), []);
  eq('every selection_group a rule names is an option the card offers',
     cards.flatMap(p => (p.rules || []).filter(r => r.selection_group && !(p.user_config?.selections || [])
       .some(g => g.options[r.selection_group])).map(r => `${p.id}:${r.selection_group}`)), []);
  eq('every option a card offers has a rule behind it',
     cards.flatMap(p => (p.user_config?.selections || []).flatMap(g => Object.keys(g.options))
       .filter(o => !(p.rules || []).some(r => r.selection_group === o)).map(o => `${p.id}:${o}`)), []);
  eq('every currency a card earns has a valuation',
     cards.filter(p => valuations[p.currency] === undefined).map(p => p.id), []);
  eq('every card has a label for its issuer and currency',
     cards.filter(p => !ISSUER[p.issuer] || !CURRENCY[p.currency]).map(p => p.id), []);
  eq('every card is ranked, 1 to the catalogue size, with no gaps and no repeats',
     cards.map(p => p.common).sort((a, b) => a - b), Array.from({ length: cards.length }, (_, i) => i + 1));
  eq('...and there are 140 of them', cards.length, 140);
  // A store card that names a domain nothing resolves to could never rank at all.
  eq('every store a store card works at is in merchants.json',
     cards.flatMap(p => (p.only_at || []).filter(d => !merchants[d]).map(d => `${p.id}:${d}`)), []);
}

// --- portal rules pay on their own category, 2026-09-27 --------------------
// A portal rule filed under travel_portal covers anything bookable; one filed
// under a single category covers that category only. Before this, every portal
// rule counted on every bookable page, so a hotels-only rate surfaced on
// airline sites.
eq('Venture X: 10x hotels through Capital One Travel is a note on hilton.com',
   only('capitalone-venture-x', 'hilton.com', '2026-09-27').notes.map(n => n.text)[0],
   'Capital One Venture X: 10x (14.00%) if you book through Capital One Travel instead');
eq('...but on delta.com the note is the 5x flights rate, not the 10x',
   only('capitalone-venture-x', 'delta.com', '2026-09-27').notes.map(n => n.text)[0],
   'Capital One Venture X: 5x (7.00%) if you book through Capital One Travel instead');
eq('...and rental cars are bookable now, at 10x',
   only('capitalone-venture-x', 'hertz.com', '2026-09-27').notes.map(n => n.text)[0],
   'Capital One Venture X: 10x (14.00%) if you book through Capital One Travel instead');
eq('Double Cash names hotels and car rentals, not flights, so delta.com gets no note',
   only('citi-double-cash', 'delta.com').notes, []);
eq('...while hilton.com still does',
   only('citi-double-cash', 'hilton.com').notes.map(n => n.text)[0],
   'Citi Double Cash: 5x (7.00%) if you book through Citi Travel instead');
eq('Amex Gold pays 5x on Amex Travel hotels, not flights, so delta.com gets no note',
   only('amex-gold', 'delta.com').notes, []);
eq('...and 2x on its prepaid car rentals, which beats its 1x base',
   only('amex-gold', 'hertz.com').notes.map(n => n.text)[0],
   'Amex Gold Card: 2x (3.20%) if you book through Amex Travel instead');
eq('a Chase Travel rate is filed under travel_portal and still covers car rentals',
   run('hertz.com').notes.map(n => n.text)[0],
   'Chase Sapphire Reserve: 8x (12.00%) if you book through Chase Travel instead');

// --- the twenty added 2026-09-27, each verified on its issuer's page that day --
const on = (id, h, config = {}) =>
  run(h, [{ productId: id, config }], { now: new Date('2026-09-27T12:00:00') }).all[0];
const noteOn = (id, h, config = {}) =>
  run(h, [{ productId: id, config }], { now: new Date('2026-09-27T12:00:00') }).notes;

// Apple Card. 1% by card number, which is how a website is paid unless it offers
// Apple Pay; the 3% at Apple itself needs no Apple Pay, so it is the one bonus.
eq('Apple Card pays 3% at apple.com', on('goldman-apple-card', 'apple.com').rate, 3);
eq('...and 1% at every other electronics store', on('goldman-apple-card', 'bestbuy.com').rate, 1);
eq('...including its Apple Pay partners, which it cannot see being used',
   [on('goldman-apple-card', 'uber.com').rate, on('goldman-apple-card', 'nike.com').rate], [1, 1]);

// Costco Anywhere Visa.
eq('Costco: 4% on gas', on('citi-costco-anywhere', 'shell.us').rate, 4);
eq('...capped at $7,000 a year across gas and EV charging',
   on('citi-costco-anywhere', 'evgo.com').caveats[0], 'Capped at $7,000 per year, then 1x');
eq('...3% on dining, flights, hotels and car rentals',
   ['doordash.com', 'delta.com', 'hotels.com', 'hertz.com'].map(h => on('citi-costco-anywhere', h).rate),
   [3, 3, 3, 3]);
eq('...2% at costco.com', on('citi-costco-anywhere', 'costco.com').rate, 2);
eq('...but not at another warehouse club', on('citi-costco-anywhere', 'samsclub.com').rate, 1);
eq('...and not on transit, which citi.com holds at 1%', on('citi-costco-anywhere', 'uber.com').rate, 1);

// Venture X and VentureOne.
eq('Venture X: 2x everywhere, valued as c1 miles',
   [on('capitalone-venture-x', 'amazon.com').rate, on('capitalone-venture-x', 'amazon.com').value], [2, 2.8]);
eq('VentureOne: 1.25x everywhere', on('capitalone-ventureone', 'amazon.com').rate, 1.25);
eq('...with 5x hotels and rental cars as portal notes only',
   [on('capitalone-ventureone', 'hertz.com').rate, noteOn('capitalone-ventureone', 'hertz.com').map(n => n.text)[0]],
   [1.25, 'Capital One VentureOne: 5x (7.00%) if you book through Capital One Travel instead']);

// Amex Platinum. Its fee and base rate were unreadable on 2026-09-10; both are
// on the product page now.
eq('Platinum: 5x on flights booked with the airline', on('amex-platinum', 'delta.com').rate, 5);
eq('...up to $500,000 a year', on('amex-platinum', 'delta.com').caveats[0],
   'Capped at $500,000 per year, then 1x');
eq('...1x on a hotel\'s own site, where its 5x prepaid-hotel rate does not apply',
   on('amex-platinum', 'hilton.com').rate, 1);
eq('...which is surfaced as an Amex Travel note instead',
   noteOn('amex-platinum', 'hilton.com').map(n => n.text)[0],
   'Amex Platinum Card: 5x (8.00%) if you book through Amex Travel instead');
eq('...and 1x on an OTA flight, which is a third-party booking',
   on('amex-platinum', 'expedia.com').rate, 1);

// The airline cards pay their bonus at their own airline only.
eq('Delta Gold: 2x at delta.com', on('amex-delta-gold', 'delta.com').rate, 2);
eq('...1x at united.com', on('amex-delta-gold', 'united.com').rate, 1);
eq('...2x on dining and at supermarkets',
   [on('amex-delta-gold', 'doordash.com').rate, on('amex-delta-gold', 'kroger.com').rate], [2, 2]);
eq('United Explorer: 3x at united.com, the card\'s share of the advertised 9x',
   on('chase-united-explorer', 'united.com').rate, 3);
eq('...2x on a hotel booked direct', on('chase-united-explorer', 'marriott.com').rate, 2);
eq('...but not through an OTA', on('chase-united-explorer', 'hotels.com').rate, 1);
eq('Southwest Plus: 2x at southwest.com', on('chase-southwest-plus', 'southwest.com').rate, 2);
eq('...2x on gas and groceries, sharing one $5,000 cap',
   [on('chase-southwest-plus', 'shell.us').rate, on('chase-southwest-plus', 'kroger.com').caveats[0]],
   [2, 'Capped at $5,000 per year, then 1x']);
eq('AAdvantage Platinum Select: 2x at aa.com, valued at 1.7 cpp',
   [on('citi-aadvantage-platinum', 'aa.com').rate, on('citi-aadvantage-platinum', 'aa.com').value], [2, 3.4]);
eq('...2x on dining and gas',
   [on('citi-aadvantage-platinum', 'doordash.com').rate, on('citi-aadvantage-platinum', 'shell.us').rate], [2, 2]);

// The hotel cards. Hilton points are worth well under a cent, which is exactly
// why a 3x base must not read as 3% back.
eq('Marriott Boundless: 6x at marriott.com', on('chase-marriott-boundless', 'marriott.com').rate, 6);
eq('...its 2x base at another chain', on('chase-marriott-boundless', 'hilton.com').rate, 2);
eq('...3x on groceries, gas and dining until $6,000, then 2x not 1x',
   on('chase-marriott-boundless', 'kroger.com').caveats[0], 'Capped at $6,000 per year, then 2x');
eq('Hilton Honors: 7x at hilton.com, worth 2.8%',
   [on('amex-hilton-honors', 'hilton.com').rate, on('amex-hilton-honors', 'hilton.com').value], [7, 2.8]);
eq('...and its 3x base is worth 1.2%, not 3%', on('amex-hilton-honors', 'amazon.com').value, 1.2);
eq('...5x on U.S. dining, supermarkets and gas',
   ['doordash.com', 'kroger.com', 'shell.us'].map(h => on('amex-hilton-honors', h).rate), [5, 5, 5]);

// Wells Fargo Autograph: the card that made phone and internet two categories.
eq('Autograph: 3x across dining, travel, gas, transit and streaming',
   ['doordash.com', 'delta.com', 'hotels.com', 'hertz.com', 'uber.com', 'shell.us', 'evgo.com', 'netflix.com']
     .map(h => on('wellsfargo-autograph', h).rate), [3, 3, 3, 3, 3, 3, 3, 3]);
eq('...3x on a phone plan', on('wellsfargo-autograph', 't-mobile.com').rate, 3);
eq('...and 1x on internet and cable, which "phone plans" does not cover',
   on('wellsfargo-autograph', 'xfinity.com').rate, 1);

// Citi Strata Premier.
eq('Strata Premier: 3x on air, hotels, dining, supermarkets, gas and EV charging',
   ['delta.com', 'hotels.com', 'doordash.com', 'kroger.com', 'shell.us', 'evgo.com']
     .map(h => on('citi-strata-premier', h).rate), [3, 3, 3, 3, 3, 3]);
eq('...10x on Citi Travel hotels, as a note', noteOn('citi-strata-premier', 'hilton.com').map(n => n.text)[0],
   'Citi Strata Premier: 10x (14.00%) if you book through Citi Travel instead');
eq('...and no Citi Travel note on flights, which that rate does not name',
   noteOn('citi-strata-premier', 'delta.com'), []);
eq('...and no supermarket rate at Instacart, which Citi reads as delivery',
   on('citi-strata-premier', 'instacart.com').rate, 1);

// Discover it Chrome.
eq('Discover it Chrome: 2% on gas and dining',
   [on('discover-it-chrome', 'shell.us').rate, on('discover-it-chrome', 'doordash.com').rate], [2, 2]);
eq('...capped at $1,000 a quarter', on('discover-it-chrome', 'doordash.com').caveats[0],
   'Capped at $1,000 per quarter, then 1x');

// The flat cards.
eq('Freedom Rise: 1.5x into Ultimate Rewards, 2.25%', on('chase-freedom-rise', 'amazon.com').value, 2.25);
eq('BofA Unlimited Cash: 1.5% with no tier', on('bofa-unlimited-cash', 'amazon.com').rate, 1.5);
eq('...2.625% at the Premier tier, the 2.62% BofA quotes',
   on('bofa-unlimited-cash', 'amazon.com', { tier_multiplier: 1.75 }).rate, 2.625);
eq('...and 1.65% at the new 10% Member tier',
   on('bofa-unlimited-cash', 'amazon.com', { tier_multiplier: 1.1 }).rate, 1.65);
eq('BofA Travel Rewards: 1.5x at a cent a point', on('bofa-travel-rewards', 'amazon.com').value, 1.5);
eq('...with its Travel Center rate as a note, tier included',
   noteOn('bofa-travel-rewards', 'hilton.com', { tier_multiplier: 1.75 }).map(n => n.text)[0],
   'BofA Travel Rewards: 5.25x (5.25%) if you book through Bank of America Travel Center instead');

// The business cards.
eq('Ink Business Unlimited: 1.5x, and 5x total on Lyft',
   [on('chase-ink-business-unlimited', 'amazon.com').rate, on('chase-ink-business-unlimited', 'lyft.com').rate],
   [1.5, 5]);
eq('Ink Business Preferred: 3x on shipping and social and search ads',
   [on('chase-ink-business-preferred', 'ups.com').rate, on('chase-ink-business-preferred', 'ads.google.com').rate],
   [3, 3]);
eq('...3x on phone AND internet, which its category names together',
   [on('chase-ink-business-preferred', 't-mobile.com').rate, on('chase-ink-business-preferred', 'xfinity.com').rate],
   [3, 3]);
eq('...3x on every kind of travel, OTAs included',
   ['delta.com', 'expedia.com', 'hertz.com', 'uber.com'].map(h => on('chase-ink-business-preferred', h).rate),
   [3, 3, 3, 3]);
eq('...5x on Lyft', on('chase-ink-business-preferred', 'lyft.com').rate, 5);
eq('...and one $150,000 cap over all of it',
   on('chase-ink-business-preferred', 'ups.com').caveats[0], 'Capped at $150,000 per year, then 1x');
eq('Blue Business Plus: 2x on everything, as Amex points',
   on('amex-blue-business-plus', 'amazon.com').value, 3.2);

// --- categories reorganised 2026-09-27 -------------------------------------
// U.S. Bank Cash+ offers twelve 5% choices. Four had no category until now.
const plus = picks => ({ selections: picks });
eq('Cash+ gyms: 5% at planetfitness.com', on('usbank-cash-plus', 'planetfitness.com', plus(['five_gym'])).rate, 5);
eq('Cash+ electronics: 5% at bestbuy.com', on('usbank-cash-plus', 'bestbuy.com', plus(['five_electronics'])).rate, 5);
eq('Cash+ clothing: 5% at gap.com', on('usbank-cash-plus', 'gap.com', plus(['five_clothing'])).rate, 5);
eq('Cash+ sporting goods: 5% at rei.com', on('usbank-cash-plus', 'rei.com', plus(['five_sporting'])).rate, 5);
// Before the split, each of these two picks also paid 5% on the other's bills.
eq('Cash+ "TV, internet and streaming" pays on cable, not on a cell phone plan',
   [on('usbank-cash-plus', 'xfinity.com', plus(['five_tv'])).rate,
    on('usbank-cash-plus', 't-mobile.com', plus(['five_tv'])).rate], [5, 1]);
eq('Cash+ "cell phone providers" pays on a cell phone plan, not on cable',
   [on('usbank-cash-plus', 't-mobile.com', plus(['five_phone'])).rate,
    on('usbank-cash-plus', 'xfinity.com', plus(['five_phone'])).rate], [5, 1]);

// BofA's Online Shopping choice is a channel: anything bought on a website or
// app. It names department stores, cable, streaming and tickets among its
// examples, and it had only ever been ranked on online_retail.
const online = { selections: ['online'] };
eq('BofA online choice: 3% at walmart.com, netflix.com, xfinity.com and ticketmaster.com',
   ['walmart.com', 'netflix.com', 'xfinity.com', 'ticketmaster.com']
     .map(h => on('bofa-customized-cash', h, online).rate), [3, 3, 3, 3]);
eq('...but not on travel, which BofA does not name as online shopping',
   on('bofa-customized-cash', 'delta.com', online).rate, 1);
eq('BofA travel choice: car rentals count, as the category page names them',
   on('bofa-customized-cash', 'hertz.com', { selections: ['travel'] }).rate, 3);

// Amex online retail is also a channel, for physical goods only.
eq('BCE: 3% at homedepot.com, cvs.com, bestbuy.com and staples.com as online retail',
   ['homedepot.com', 'cvs.com', 'bestbuy.com', 'staples.com']
     .map(h => on('amex-blue-cash-everyday', h).rate), [3, 3, 3, 3]);
eq('...but not on services like streaming, which Amex excludes',
   on('amex-blue-cash-everyday', 'netflix.com').rate, 1);

eq('Sapphire Preferred: car rentals earn its 2x travel rate, per Chase\'s definition',
   on('chase-sapphire-preferred', 'hertz.com').rate, 2);
eq('car rental sites resolve to their own category', run('hertz.com').category, 'car_rental');

// Inference for the new store categories, most specific first.
eq('ElectronicsStore markup infers electronics', IC({ ldTypes: ['Product', 'ElectronicsStore'] }), 'electronics');
eq('ClothingStore markup infers clothing', IC({ ldTypes: ['ClothingStore'] }), 'clothing');
eq('ShoeStore markup infers clothing', IC({ ldTypes: ['ShoeStore'] }), 'clothing');
eq('SportingGoodsStore markup infers sporting goods', IC({ ldTypes: ['SportingGoodsStore'] }), 'sporting_goods');
eq('AutoRental markup infers car rentals', IC({ ldTypes: ['AutoRental'] }), 'car_rental');
eq('ExerciseGym markup infers fitness', IC({ ldTypes: ['ExerciseGym'] }), 'fitness');

// --- store cards, 2026-09-28 ------------------------------------------------
// A store card works at its own store and nowhere else, so off it the card is
// not a candidate at all. Ranking it on its base rate elsewhere would recommend
// a card the till refuses.
const store = (h, ...cards) =>
  run(h, cards.map(id => ({ productId: id, config: {} })), { now: new Date('2026-09-28T12:00:00') });

eq('Target Circle Credit Card: 5% at target.com', store('target.com', 'td-target-circle').all[0].rate, 5);
eq('...found through www. as well', store('www.target.com', 'td-target-circle').all[0].rate, 5);
eq('...and beating a 3% flat card there',
   store('target.com', 'robinhood-gold', 'td-target-circle').winner.productId, 'td-target-circle');
eq('...but not in the ranking at all on walmart.com',
   store('walmart.com', 'robinhood-gold', 'td-target-circle').all.map(c => c.productId), ['robinhood-gold']);
{
  const r = store('walmart.com', 'td-target-circle', 'capitalone-kohls');
  eq('a wallet of store cards for other stores has no candidate here', [r.all.length, r.winner], [0, null]);
  eq('...and says so, rather than claiming no cards were added', r.resolvedBy, 'none_usable');
  eq('...where a genuinely empty wallet still says no_cards', store('walmart.com').resolvedBy, 'no_cards');
}
eq('Kohl\'s Card: 2.5% at kohls.com, what it adds to the 5% members earn anyway',
   store('kohls.com', 'capitalone-kohls').all[0].rate, 2.5);
eq('My Best Buy Credit Card: 5% at bestbuy.com', store('bestbuy.com', 'citi-best-buy').all[0].rate, 5);
eq('MyLowe\'s Rewards Credit Card: 5% at lowes.com', store('lowes.com', 'synchrony-lowes').all[0].rate, 5);
eq('Amazon Store Card: 5% at amazon.com, tying Prime Visa, so it asks',
   [store('amazon.com', 'synchrony-amazon-store', 'chase-prime-visa').tied.length,
    store('amazon.com', 'synchrony-amazon-store', 'chase-prime-visa').resolvedBy], [2, 'unresolved']);
eq('TJX Rewards: 5% across the family, T.J.Maxx\'s tjx.com host included',
   ['tjmaxx.tjx.com', 'marshalls.com', 'homegoods.com', 'sierra.com', 'us.homesense.com']
     .map(h => store(h, 'synchrony-tjx').all.length && store(h, 'synchrony-tjx').all[0].rate), [5, 5, 5, 5, 5]);
eq('...but not on the rest of tjx.com, which is the corporate site',
   store('www.tjx.com', 'synchrony-tjx').all.length, 0);
eq('Macy\'s: Silver adds 1%, Gold 2%, Platinum 4% to the 1% members earn anyway',
   [1, 2, 4].map(t => run('macys.com', [{ productId: 'citi-macys', config: { tier_multiplier: t } }],
     { now: new Date('2026-09-28T12:00:00') }).all[0].rate), [1, 2, 4]);

// --- the remaining airline and hotel tiers, 2026-09-28 ----------------------
const tier = (id, h) => store(h, id).all[0];
eq('Delta Platinum: 3x at delta.com and on a hotel booked direct',
   [tier('amex-delta-platinum', 'delta.com').rate, tier('amex-delta-platinum', 'marriott.com').rate], [3, 3]);
eq('...but not through an OTA', tier('amex-delta-platinum', 'hotels.com').rate, 1);
eq('Delta Blue: 2x at delta.com and on dining',
   [tier('amex-delta-blue', 'delta.com').rate, tier('amex-delta-blue', 'doordash.com').rate], [2, 2]);
eq('Delta Reserve: 3x at delta.com, 1x on dining',
   [tier('amex-delta-reserve', 'delta.com').rate, tier('amex-delta-reserve', 'doordash.com').rate], [3, 1]);
eq('Southwest Priority: 4x at southwest.com, 2x on gas',
   [tier('chase-southwest-priority', 'southwest.com').rate, tier('chase-southwest-priority', 'shell.us').rate], [4, 2]);
eq('Southwest Premier: 3x at southwest.com, 2x at supermarkets up to $8,000',
   [tier('chase-southwest-premier', 'southwest.com').rate, tier('chase-southwest-premier', 'kroger.com').caveats[0]],
   [3, 'Capped at $8,000 per year, then 1x']);
eq('United Gateway: 2x at united.com, on gas and on rideshare',
   ['united.com', 'shell.us', 'uber.com'].map(h => tier('chase-united-gateway', h).rate), [2, 2, 2]);
eq('United Quest: 4x at united.com, 2x on other airlines, dining and streaming',
   ['united.com', 'delta.com', 'doordash.com', 'netflix.com'].map(h => tier('chase-united-quest', h).rate), [4, 2, 2, 2]);
eq('...with Renowned Hotels as a portal note',
   store('hilton.com', 'chase-united-quest').notes.map(n => n.text)[0],
   'United Quest: 5x (6.00%) if you book through Renowned Hotels and Resorts instead');
eq('United Club: 5x at united.com', tier('chase-united-club', 'united.com').rate, 5);
eq('Hilton Surpass: 12x at hilton.com, worth 4.8%',
   [tier('amex-hilton-surpass', 'hilton.com').rate, tier('amex-hilton-surpass', 'hilton.com').value], [12, 4.8]);
eq('...and 4x on U.S. online retail, which Amex counts at a store\'s own site',
   [tier('amex-hilton-surpass', 'amazon.com').rate, tier('amex-hilton-surpass', 'target.com').rate], [4, 4]);
eq('Hilton Aspire: 14x at hilton.com, 7x on flights and car rentals',
   ['hilton.com', 'delta.com', 'hertz.com'].map(h => tier('amex-hilton-aspire', h).rate), [14, 7, 7]);
eq('Marriott Bold: 3x at marriott.com, 2x on food delivery and rideshare',
   ['marriott.com', 'doordash.com', 'uber.com'].map(h => tier('chase-marriott-bold', h).rate), [3, 2, 2]);
eq('...but 1x at a restaurant, which is not delivery', tier('chase-marriott-bold', 'chipotle.com').rate, 1);
eq('...and 2x on phone and on internet, which it names together',
   [tier('chase-marriott-bold', 't-mobile.com').rate, tier('chase-marriott-bold', 'xfinity.com').rate], [2, 2]);
eq('Marriott Bevy: 6x at marriott.com, 4x at supermarkets until $15,000, then 2x',
   [tier('amex-marriott-bevy', 'marriott.com').rate, tier('amex-marriott-bevy', 'kroger.com').caveats[0]],
   [6, 'Capped at $15,000 per year, then 2x']);
eq('Marriott Brilliant: 6x at marriott.com, 3x on flights and dining',
   ['marriott.com', 'delta.com', 'doordash.com'].map(h => tier('amex-marriott-brilliant', h).rate), [6, 3, 3]);
eq('World of Hyatt: 4x at hyatt.com, worth 7.2%',
   [tier('chase-world-of-hyatt', 'hyatt.com').rate, tier('chase-world-of-hyatt', 'hyatt.com').value], [4, 7.2]);
eq('...and 2x at a gym, the second card to bonus fitness',
   tier('chase-world-of-hyatt', 'planetfitness.com').rate, 2);
eq('IHG Premier: 10x at ihg.com, 5x on other travel, 3x on everything else',
   ['ihg.com', 'marriott.com', 'amazon.com'].map(h => tier('chase-ihg-premier', h).rate), [10, 5, 3]);
eq('IHG Traveler: 5x at ihg.com, 3x on utilities, 2x on everything else',
   ['ihg.com', 'coned.com', 'amazon.com'].map(h => tier('chase-ihg-traveler', h).rate), [5, 3, 2]);

// --- issuers Caddy did not cover, 2026-09-28 ---------------------------------
// Synchrony's general-purpose cards, Barclays, USAA, Navy Federal and Bilt, each
// read off its issuer's page that day.
const picked = (id, h, selections) =>
  run(h, [{ productId: id, config: { selections } }], { now: new Date('2026-09-28T12:00:00') }).all[0];

eq('PayPal Cashback: 1.5% everywhere, its PayPal-checkout 3% left unranked',
   ['amazon.com', 'target.com', 'doordash.com'].map(h => tier('synchrony-paypal-cashback', h).rate), [1.5, 1.5, 1.5]);
eq('Venmo: 3% on dining, entertainment, streaming and health clubs',
   ['doordash.com', 'ticketmaster.com', 'netflix.com', 'planetfitness.com'].map(h => tier('synchrony-venmo', h).rate),
   [3, 3, 3, 3]);
eq('...and 1% on everything else', tier('synchrony-venmo', 'kroger.com').rate, 1);
eq('Sam\'s Club Mastercard: 5% on gas and EV charging, to $6,000 a year',
   [tier('synchrony-sams-club', 'shell.us').rate, tier('synchrony-sams-club', 'evgo.com').caveats[0]],
   [5, 'Capped at $6,000 per year, then 1x']);
eq('...3% at samsclub.com and on dining, 1% at Costco',
   ['samsclub.com', 'doordash.com', 'costco.com'].map(h => tier('synchrony-sams-club', h).rate), [3, 3, 1]);
eq('OnePay CashRewards: 5% at walmart.com, 1.5% at Target',
   [tier('synchrony-onepay', 'walmart.com').rate, tier('synchrony-onepay', 'target.com').rate], [5, 1.5]);

eq('JetBlue Card: 3x at jetblue.com, worth 4.2%',
   [tier('barclays-jetblue', 'jetblue.com').rate, tier('barclays-jetblue', 'jetblue.com').value], [3, 4.2]);
eq('...1x on another airline', tier('barclays-jetblue', 'delta.com').rate, 1);
eq('...2x at a restaurant and at a supermarket',
   [tier('barclays-jetblue', 'chipotle.com').rate, tier('barclays-jetblue', 'kroger.com').rate], [2, 2]);
eq('...but 1x through a delivery app or Instacart, which are third parties',
   [tier('barclays-jetblue', 'doordash.com').rate, tier('barclays-jetblue', 'instacart.com').rate], [1, 1]);
eq('...with TrueBlue Travel as a portal note on hotels',
   store('hotels.com', 'barclays-jetblue').notes.map(n => n.text)[0],
   'JetBlue Card: 3x (4.20%) if you book through TrueBlue Travel instead');
eq('JetBlue Plus and Premier: 6x at jetblue.com, 2x at a supermarket',
   [tier('barclays-jetblue-plus', 'jetblue.com').rate, tier('barclays-jetblue-premier', 'jetblue.com').rate,
    tier('barclays-jetblue-plus', 'kroger.com').rate, tier('barclays-jetblue-premier', 'kroger.com').rate],
   [6, 6, 2, 2]);

eq('USAA Preferred Cash: 1.5% everywhere', tier('usaa-preferred-cash', 'amazon.com').rate, 1.5);
eq('USAA Cashback Rewards Plus: 5% on gas and 3% at supermarkets, each to $3,000 a year',
   [tier('usaa-cashback-rewards-plus', 'shell.us').rate, tier('usaa-cashback-rewards-plus', 'shell.us').caveats[0],
    tier('usaa-cashback-rewards-plus', 'kroger.com').rate, tier('usaa-cashback-rewards-plus', 'kroger.com').caveats[0]],
   [5, 'Capped at $3,000 per year, then 1x', 3, 'Capped at $3,000 per year, then 1x']);
eq('...and 1% on EV charging, which it does not name', tier('usaa-cashback-rewards-plus', 'evgo.com').rate, 1);
eq('USAA Eagle Adapt: 3% across all fourteen of its categories at once',
   ['kroger.com', 'doordash.com', 'homedepot.com', 'shell.us', 'evgo.com', 'delta.com', 'hotels.com', 'hertz.com',
    'uber.com', 'cvs.com', 'planetfitness.com', 'ticketmaster.com', 'netflix.com', 'xfinity.com']
     .map(h => tier('usaa-eagle-adapt', h).rate), Array(14).fill(3));
eq('...under one $3,000 quarterly cap', tier('usaa-eagle-adapt', 'kroger.com').caveats[0],
   'Capped at $3,000 per quarter, then 1x');
eq('...and 1% elsewhere, wholesale clubs included',
   [tier('usaa-eagle-adapt', 'amazon.com').rate, tier('usaa-eagle-adapt', 'costco.com').rate], [1, 1]);
eq('USAA Eagle Navigator: 3x on travel and transit, 2x elsewhere, at a cent a point',
   ['delta.com', 'hotels.com', 'hertz.com', 'uber.com', 'amazon.com'].map(h => tier('usaa-eagle-navigator', h).value),
   [3, 3, 3, 3, 2]);

eq('Navy Federal Flagship Premier: 4x on travel with no portal, 3x on dining, 1x elsewhere',
   ['delta.com', 'hotels.com', 'hertz.com', 'uber.com', 'doordash.com', 'amazon.com']
     .map(h => tier('navyfederal-flagship-premier', h).rate), [4, 4, 4, 4, 3, 1]);
eq('Navy Federal cashRewards 1.5%, cashRewards Plus 2%',
   [tier('navyfederal-cashrewards', 'amazon.com').rate, tier('navyfederal-cashrewards-plus', 'amazon.com').rate],
   [1.5, 2]);
eq('Navy Federal More Rewards: 3x on dining, supermarkets, gas and transit',
   ['doordash.com', 'kroger.com', 'shell.us', 'uber.com', 'amazon.com']
     .map(h => tier('navyfederal-more-rewards', h).rate), [3, 3, 3, 3, 1]);
eq('Navy Federal GO REWARDS: 3x at restaurants, 2x on gas',
   ['chipotle.com', 'shell.us', 'amazon.com'].map(h => tier('navyfederal-go-rewards', h).rate), [3, 2, 1]);

eq('Bilt Blue: 1x everywhere, worth 1.25%',
   [tier('column-bilt-blue', 'amazon.com').rate, tier('column-bilt-blue', 'amazon.com').value], [1, 1.25]);
eq('...3x on Lyft once the accounts are linked, and says so',
   [tier('column-bilt-blue', 'lyft.com').rate, tier('column-bilt-blue', 'lyft.com').needsActivation], [3, true]);
eq('...but not on Uber', tier('column-bilt-blue', 'uber.com').rate, 1);
eq('...with Bilt Travel as a portal note, 3x on hotels and 2x on flights',
   [store('hilton.com', 'column-bilt-blue').notes.map(n => n.text)[0],
    store('delta.com', 'column-bilt-blue').notes.map(n => n.text)[0]],
   ['Bilt Blue Card: 3x (3.75%) if you book through Bilt Travel instead',
    'Bilt Blue Card: 2x (2.50%) if you book through Bilt Travel instead']);
eq('Bilt Obsidian: 3x on whichever of dining or grocery you pick, and only that one',
   [picked('column-bilt-obsidian', 'doordash.com', ['dining']).rate,
    picked('column-bilt-obsidian', 'kroger.com', ['dining']).rate,
    picked('column-bilt-obsidian', 'kroger.com', ['grocery']).rate,
    picked('column-bilt-obsidian', 'doordash.com', ['grocery']).rate], [3, 1, 3, 1]);
eq('...grocery capped at $25,000 a year', picked('column-bilt-obsidian', 'kroger.com', ['grocery']).caveats[0],
   'Capped at $25,000 per year, then 1x');
eq('...and 2x on other travel, booked anywhere',
   ['delta.com', 'hotels.com', 'hertz.com'].map(h => tier('column-bilt-obsidian', h).rate), [2, 2, 2]);
eq('Bilt Palladium: 2x everywhere, 4x on linked Lyft',
   [tier('column-bilt-palladium', 'amazon.com').rate, tier('column-bilt-palladium', 'lyft.com').rate], [2, 4]);

// --- business cards, 2026-09-28 ------------------------------------------------
// Amex, Capital One, Chase and Barclays, each read off its issuer's page that day.
const noteAt = (id, h) => store(h, id).notes.map(n => n.text)[0];

eq('Amex Business Platinum: 2x at hardware suppliers, electronics stores and shippers',
   ['lowes.com', 'homedepot.com', 'bestbuy.com', 'ups.com'].map(h => tier('amex-business-platinum', h).rate),
   [2, 2, 2, 2]);
eq('...under one $2 million yearly cap', tier('amex-business-platinum', 'lowes.com').caveats[0],
   'Capped at $2,000,000 per year, then 1x');
eq('...but 1x at a home furnishings store, which Amex excludes',
   tier('amex-business-platinum', 'homegoods.com').rate, 1);
eq('...and, unlike the consumer Platinum, 1x on a flight bought from the airline',
   [tier('amex-business-platinum', 'delta.com').rate, tier('amex-platinum', 'delta.com').rate], [1, 5]);
eq('...with its 5x as an Amex Travel note', noteAt('amex-business-platinum', 'delta.com'),
   'Amex Business Platinum Card: 5x (8.00%) if you book through Amex Travel instead');
eq('Amex Business Gold: its top-two 4x is not ranked, so 1x at a restaurant',
   tier('amex-business-gold', 'doordash.com').rate, 1);
eq('...and 3x through Amex Travel is a note', noteAt('amex-business-gold', 'delta.com'),
   'Amex Business Gold Card: 3x (4.80%) if you book through Amex Travel instead');
eq('Amex Blue Business Cash: 2% everywhere', tier('amex-blue-business-cash', 'amazon.com').rate, 2);
eq('Amex Graphite Business Cash: 2% everywhere, 5% through Amex Travel',
   [tier('amex-graphite-business-cash', 'amazon.com').rate, noteAt('amex-graphite-business-cash', 'delta.com')],
   [2, 'Amex Graphite Business Cash Unlimited: 5x (5.00%) if you book through Amex Travel instead']);

eq('Capital One Venture X Business: 2x everywhere, worth 2.8%',
   [tier('capitalone-venture-x-business', 'amazon.com').rate, tier('capitalone-venture-x-business', 'amazon.com').value],
   [2, 2.8]);
eq('...10x on hotels and 5x on flights through Capital One Business Travel',
   [noteAt('capitalone-venture-x-business', 'hilton.com'), noteAt('capitalone-venture-x-business', 'delta.com')],
   ['Capital One Venture X Business: 10x (14.00%) if you book through Capital One Business Travel instead',
    'Capital One Venture X Business: 5x (7.00%) if you book through Capital One Business Travel instead']);
eq('Spark Cash Plus 2%, Venture Business 2x, Spark Cash 2%, VentureOne Business 1.5x, Spark Cash Select 1.5%',
   ['capitalone-spark-cash-plus', 'capitalone-venture-business', 'capitalone-spark-cash',
    'capitalone-ventureone-business', 'capitalone-spark-cash-select'].map(id => tier(id, 'amazon.com').rate),
   [2, 2, 2, 1.5, 1.5]);
eq('...each with 5x on rental cars through Capital One Business Travel, and no flight rate there',
   [noteAt('capitalone-spark-cash-plus', 'hertz.com'), store('delta.com', 'capitalone-spark-cash').notes],
   ['Capital One Spark Cash Plus: 5x (5.00%) if you book through Capital One Business Travel instead', []]);

eq('Chase Ink Business Premier: 2% everywhere, valued as cash, and 5% on Lyft',
   [tier('chase-ink-business-premier', 'amazon.com').value, tier('chase-ink-business-premier', 'lyft.com').rate],
   [2, 5]);
eq('...with 5% through Chase Travel as a note', noteAt('chase-ink-business-premier', 'hilton.com'),
   'Chase Ink Business Premier: 5x (5.00%) if you book through Chase Travel instead');
eq('Chase Sapphire Reserve for Business: 4x on flights booked direct, worth 6%',
   [tier('chase-sapphire-reserve-business', 'delta.com').rate, tier('chase-sapphire-reserve-business', 'delta.com').value],
   [4, 6]);
eq('...1x through an OTA, where 8x through Chase Travel is the note',
   [tier('chase-sapphire-reserve-business', 'hotels.com').rate, noteAt('chase-sapphire-reserve-business', 'hotels.com')],
   [1, 'Chase Sapphire Reserve for Business: 8x (12.00%) if you book through Chase Travel instead']);
eq('...3x on search and social ads, capped at $1 million a year',
   [tier('chase-sapphire-reserve-business', 'ads.google.com').rate,
    tier('chase-sapphire-reserve-business', 'ads.google.com').caveats[0]],
   [3, 'Capped at $1,000,000 per year, then 1x']);
eq('...5x on Lyft, 1x elsewhere',
   [tier('chase-sapphire-reserve-business', 'lyft.com').rate, tier('chase-sapphire-reserve-business', 'amazon.com').rate],
   [5, 1]);

eq('JetBlue Business: 6x at jetblue.com, 2x at office supply stores and restaurants',
   ['jetblue.com', 'staples.com', 'chipotle.com'].map(h => tier('barclays-jetblue-business', h).rate), [6, 2, 2]);
eq('...but 1x through a delivery app, and no grocery bonus',
   [tier('barclays-jetblue-business', 'doordash.com').rate, tier('barclays-jetblue-business', 'kroger.com').rate], [1, 1]);

// --- smaller store cards, 2026-09-28 -------------------------------------------
// Gap Inc.'s Encore cards, Nordstrom, Ulta and JCPenney, each read off the
// retailer's or issuer's page that day.
eq('Encore Credit Card: 4% at every Gap Inc. brand, each on its own gap.com host',
   ['www.gap.com', 'oldnavy.gap.com', 'bananarepublic.gap.com', 'athleta.gap.com']
     .map(h => tier('barclays-gap-encore-card', h)?.rate), [4, 4, 4, 4]);
eq('...and not a candidate at another clothing store', store('hm.com', 'barclays-gap-encore-card').all.length, 0);
eq('Encore Mastercard: 4% at Gap brands, 3% at other apparel stores, 1% elsewhere',
   ['oldnavy.gap.com', 'hm.com', 'amazon.com'].map(h => tier('barclays-gap-encore-mastercard', h)?.rate), [4, 3, 1]);
eq('JCPenney Credit Card: 2.5% at jcpenney.com, what it adds to the 5% members earn anyway',
   [tier('synchrony-jcpenney-card', 'jcpenney.com')?.rate, store('macys.com', 'synchrony-jcpenney-card').all.length],
   [2.5, 0]);
eq('...so a 3% card beats it there, as it does at the till: 3% + 5% against 7.5%',
   store('jcpenney.com', 'synchrony-jcpenney-card', 'robinhood-gold').winner.productId, 'robinhood-gold');
eq('JCPenney Mastercard: 2.5% at jcpenney.com, 1% elsewhere',
   [tier('synchrony-jcpenney-mastercard', 'jcpenney.com')?.rate, tier('synchrony-jcpenney-mastercard', 'amazon.com')?.rate],
   [2.5, 1]);
eq('Nordstrom Credit Card: adds 1% at nordstrom.com at Influencer, 2% at Ambassador or Icon',
   [tier('td-nordstrom-card', 'nordstrom.com')?.rate, picked('td-nordstrom-card', 'nordstrom.com', ['ambassador'])?.rate],
   [1, 2]);
eq('...5% off at Nordstrom Rack, and no candidate at Kohl\'s',
   [tier('td-nordstrom-card', 'nordstromrack.com')?.rate, store('kohls.com', 'td-nordstrom-card').all.length], [5, 0]);
eq('Nordstrom Visa: the same at Nordstrom and the Rack',
   [tier('td-nordstrom-visa', 'nordstrom.com')?.rate, picked('td-nordstrom-visa', 'nordstrom.com', ['ambassador'])?.rate,
    tier('td-nordstrom-visa', 'nordstromrack.com')?.rate], [1, 2, 5]);
eq('...2% on gas, EV charging, groceries, dining, streaming and cable, 1% elsewhere',
   ['shell.us', 'evgo.com', 'kroger.com', 'doordash.com', 'netflix.com', 'xfinity.com', 'amazon.com']
     .map(h => tier('td-nordstrom-visa', h)?.rate), [2, 2, 2, 2, 2, 2, 1]);
eq('Ulta Beauty Rewards Credit Card: adds a point at ulta.com, worth 3% at the 3-cent floor',
   [tier('comenity-ulta-card', 'ulta.com')?.rate, tier('comenity-ulta-card', 'ulta.com')?.value], [1, 3]);
eq('Ulta Beauty Rewards Mastercard: the same at ulta.com, and a point per $3 elsewhere',
   [tier('comenity-ulta-mastercard', 'ulta.com')?.rate, tier('comenity-ulta-mastercard', 'amazon.com')?.value], [1, 0.999]);

// --- the missing tiers of covered programs, 2026-09-28 --------------------------
const tiered = (id, h, t) =>
  run(h, [{ productId: id, config: { tier_multiplier: t } }], { now: new Date('2026-09-28T12:00:00') }).all[0];

eq('BofA Premium Rewards: 2 on travel and dining, OTAs and transit included, 1.5 elsewhere',
   ['delta.com', 'hotels.com', 'hertz.com', 'uber.com', 'doordash.com', 'amazon.com']
     .map(h => tier('bofa-premium-rewards', h)?.rate), [2, 2, 2, 2, 2, 1.5]);
eq('...times the BofA Rewards tier, 3.5% at Premier', tiered('bofa-premium-rewards', 'doordash.com', 1.75)?.rate, 3.5);
eq('BofA Premium Rewards Elite earns the same', tier('bofa-premium-rewards-elite', 'doordash.com')?.rate, 2);
eq('Wells Fargo Autograph Journey: 5x at a hotel booked direct, 3x through an OTA',
   [tier('wellsfargo-autograph-journey', 'marriott.com')?.rate, tier('wellsfargo-autograph-journey', 'hotels.com')?.rate],
   [5, 3]);
eq('...4x on airlines, 3x on dining and car rental, 1x on transit',
   ['delta.com', 'doordash.com', 'hertz.com', 'uber.com'].map(h => tier('wellsfargo-autograph-journey', h)?.rate),
   [4, 3, 3, 1]);
eq('Citi AAdvantage Executive: 4x at aa.com, worth 6.8%, 1x on another airline',
   [tier('citi-aadvantage-executive', 'aa.com')?.value, tier('citi-aadvantage-executive', 'delta.com')?.rate], [6.8, 1]);
eq('...with AAdvantage Hotels and Cars as portal notes',
   [noteAt('citi-aadvantage-executive', 'hilton.com'), noteAt('citi-aadvantage-executive', 'hertz.com')],
   ['Citi AAdvantage Executive: 12x (20.40%) if you book through AAdvantage Hotels instead',
    'Citi AAdvantage Executive: 12x (20.40%) if you book through AAdvantage Cars instead']);
eq('Citi AAdvantage Globe: 3x at aa.com, 2x on dining and on taxis, rideshare and transit, 1x elsewhere',
   ['aa.com', 'doordash.com', 'uber.com', 'amazon.com'].map(h => tier('citi-aadvantage-globe', h)?.rate), [3, 2, 2, 1]);
eq('...with 6x through AAdvantage Hotels as a note', noteAt('citi-aadvantage-globe', 'hilton.com'),
   'Citi AAdvantage Globe: 6x (10.20%) if you book through AAdvantage Hotels instead');
eq('U.S. Bank Altitude Go: 4x on dining to $2,000 a quarter, 2x on groceries, gas, EV and streaming',
   [tier('usbank-altitude-go', 'doordash.com')?.rate, tier('usbank-altitude-go', 'doordash.com')?.caveats[0],
    ...['kroger.com', 'shell.us', 'evgo.com', 'netflix.com', 'amazon.com'].map(h => tier('usbank-altitude-go', h)?.rate)],
   [4, 'Capped at $2,000 per quarter, then 1x', 2, 2, 2, 2, 1]);
eq('U.S. Bank Altitude Connect: 4x on travel booked direct and transit, 1x through an OTA',
   ['delta.com', 'marriott.com', 'hertz.com', 'uber.com', 'hotels.com'].map(h => tier('usbank-altitude-connect', h)?.rate),
   [4, 4, 4, 4, 1]);
eq('...where 5x through the Travel Center is the note',
   noteAt('usbank-altitude-connect', 'hotels.com'),
   'U.S. Bank Altitude Connect: 5x (5.00%) if you book through U.S. Bank Travel Center instead');
eq('...4x on gas to $1,000 a quarter, 2x on dining, groceries and streaming',
   [tier('usbank-altitude-connect', 'shell.us')?.caveats[0],
    ...['doordash.com', 'kroger.com', 'netflix.com'].map(h => tier('usbank-altitude-connect', h)?.rate)],
   ['Capped at $1,000 per quarter, then 1x', 2, 2, 2]);

// --- Barclays' other co-brands, 2026-09-28 ---------------------------------------
// Wyndham, AARP, Upromise, Frontier, Emirates and Miles & More, each read off the
// Reward Rules in the card's terms on barclaycardus.com that day.
eq('Wyndham Earner: 5x at wyndhamhotels.com, 3x on dining, groceries, gas and EV charging',
   ['wyndhamhotels.com', 'chipotle.com', 'kroger.com', 'shell.us', 'evgo.com']
     .map(h => tier('barclays-wyndham-earner', h)?.rate), [5, 3, 3, 3, 3]);
eq('...1x on airfare, at another chain, and through a delivery app or Instacart',
   ['delta.com', 'marriott.com', 'doordash.com', 'instacart.com']
     .map(h => tier('barclays-wyndham-earner', h)?.rate), [1, 1, 1, 1]);
eq('Wyndham Earner Plus: 6x at wyndhamhotels.com, worth 4.2%',
   [tier('barclays-wyndham-earner-plus', 'wyndhamhotels.com')?.rate,
    tier('barclays-wyndham-earner-plus', 'wyndhamhotels.com')?.value], [6, 4.2]);
eq('...4x on dining, groceries and travel: airfare, car rental, rideshare, gas and EV charging',
   ['chipotle.com', 'kroger.com', 'delta.com', 'hertz.com', 'uber.com', 'shell.us', 'evgo.com']
     .map(h => tier('barclays-wyndham-earner-plus', h)?.rate), Array(7).fill(4));
eq('...but 1x at another chain, which its travel category leaves out',
   tier('barclays-wyndham-earner-plus', 'marriott.com')?.rate, 1);
eq('Wyndham Earner Premier: 8x at wyndhamhotels.com, 4x as the Plus earns it, 1x at another chain',
   ['wyndhamhotels.com', 'chipotle.com', 'hertz.com', 'marriott.com']
     .map(h => tier('barclays-wyndham-earner-premier', h)?.rate), [8, 4, 4, 1]);
eq('AARP Travel Rewards: 3% on airfare, a hotel booked direct and car rental, 2% on dining',
   ['delta.com', 'marriott.com', 'hertz.com', 'chipotle.com']
     .map(h => tier('barclays-aarp-travel-rewards', h)?.rate), [3, 3, 3, 2]);
eq('...but 1% through an OTA or a delivery app, which are third parties',
   ['hotels.com', 'airbnb.com', 'doordash.com'].map(h => tier('barclays-aarp-travel-rewards', h)?.rate), [1, 1, 1]);
eq('AARP Essential Rewards: 3% on gas and at drugstores, 1% on EV charging and elsewhere',
   ['shell.us', 'cvs.com', 'evgo.com', 'amazon.com'].map(h => tier('barclays-aarp-essential-rewards', h)?.rate),
   [3, 3, 1, 1]);
eq('Upromise: 1.529% everywhere, the rate with a linked 529 plan',
   ['amazon.com', 'chipotle.com'].map(h => tier('barclays-upromise', h)?.value), [1.529, 1.529]);
eq('Frontier: 5x at flyfrontier.com, worth 4.9% at 0.98 cents a mile',
   [tier('barclays-frontier', 'flyfrontier.com')?.rate, tier('barclays-frontier', 'flyfrontier.com')?.value],
   [5, 4.9]);
eq('...3x at a restaurant, 1x through a delivery app and on another airline',
   ['chipotle.com', 'doordash.com', 'delta.com'].map(h => tier('barclays-frontier', h)?.rate), [3, 1, 1]);
eq('Emirates Rewards and Premium: 3x at emirates.com, 2x on other airfare, hotels booked direct and car rental',
   ['barclays-emirates-rewards', 'barclays-emirates-premium'].flatMap(id =>
     ['emirates.com', 'delta.com', 'marriott.com', 'hertz.com'].map(h => tier(id, h)?.rate)),
   [3, 2, 2, 2, 3, 2, 2, 2]);
eq('...1x through an OTA', tier('barclays-emirates-rewards', 'hotels.com')?.rate, 1);
eq('Miles & More: 2x at the five partner airlines that fly to the US, worth 2.4%',
   ['lufthansa.com', 'swiss.com', 'austrian.com', 'brusselsairlines.com', 'lot.com']
     .map(h => tier('barclays-miles-more', h)?.value), Array(5).fill(2.4));
eq('...1x on another airline', tier('barclays-miles-more', 'united.com')?.rate, 1);

// GM, Carnival, Barnes & Noble, Breeze, RCI and Capital Vacations, the rest of
// Barclays' list, read the same way that day.
eq('GM Rewards: 7x at GM\'s own web stores, 3x everywhere else',
   ['accessories.chevrolet.com', 'accessories.cadillac.com', 'parts.gmparts.com', 'www.gmcompanystore.com',
    'amazon.com', 'doordash.com'].map(h => tier('barclays-gm-rewards', h)?.rate), [7, 7, 7, 7, 3, 3]);
eq('...where chevrolet.com itself is not a merchant: vehicles are bought at dealers',
   resolveMerchant('www.chevrolet.com', merchants), null);
eq('Carnival Rewards: 2x at a restaurant and a supermarket, 1x through a delivery app',
   ['chipotle.com', 'kroger.com', 'doordash.com'].map(h => tier('barclays-carnival', h)?.rate), [2, 2, 1]);
eq('...worth 1.84% at 0.92 cents a point', tier('barclays-carnival', 'chipotle.com')?.value, 1.84);
eq('Barnes & Noble: 5% back at barnesandnoble.com, found through www. as well',
   ['barnesandnoble.com', 'www.barnesandnoble.com'].map(h => tier('barclays-barnes-noble', h)?.value), [5, 5]);
eq('...2x at a restaurant, 1x through a delivery app and at another online store',
   ['chipotle.com', 'doordash.com', 'amazon.com'].map(h => tier('barclays-barnes-noble', h)?.rate), [2, 1, 1]);
eq('Breeze Easy: 2x at a restaurant and a supermarket, 1x on airfare, its fare bundles left to the caution',
   ['chipotle.com', 'kroger.com', 'delta.com'].map(h => tier('barclays-breeze', h)?.rate), [2, 2, 1]);
eq('RCI and Capital Vacations: 2% on travel, OTAs included, rideshare, gas and EV charging',
   ['barclays-rci', 'barclays-capital-vacations'].flatMap(id =>
     ['delta.com', 'marriott.com', 'hotels.com', 'hertz.com', 'uber.com', 'shell.us', 'evgo.com']
       .map(h => tier(id, h)?.rate)), Array(14).fill(2));
eq('...and 1% elsewhere', ['barclays-rci', 'barclays-capital-vacations'].map(id => tier(id, 'chipotle.com')?.rate),
   [1, 1]);

// --- co-branded business cards, 2026-09-28 ------------------------------------
// Amex's Delta, Marriott, Hilton and Business Green cards, Chase's United,
// Southwest, IHG and Hyatt business cards, and Barclays' Wyndham and GM, each
// read off its issuer's page that day.
const BIZ = ['amex-delta-gold-business', 'amex-delta-platinum-business', 'amex-delta-reserve-business',
  'amex-marriott-business', 'amex-hilton-business', 'amex-business-green', 'chase-united-business',
  'chase-united-club-business', 'chase-southwest-performance-business', 'chase-southwest-premier-business',
  'chase-ihg-business-premier', 'chase-hyatt-business', 'barclays-wyndham-earner-business', 'barclays-gm-business'];
eq('all fourteen are marked as business cards', BIZ.filter(id => !products[id]?.business), []);
eq('Delta Gold Business: 2x at Delta, restaurants, U.S. shippers and ad providers, 1x elsewhere',
   ['delta.com', 'doordash.com', 'ups.com', 'ads.google.com', 'amazon.com']
     .map(h => tier('amex-delta-gold-business', h)?.rate), [2, 2, 2, 2, 1]);
eq('...shipping capped at $50,000 a year', tier('amex-delta-gold-business', 'ups.com')?.caveats[0],
   'Capped at $50,000 per year, then 1x');
eq('Delta Platinum Business: 3x at Delta and on a hotel booked direct, 1x through an OTA',
   ['delta.com', 'marriott.com', 'hotels.com'].map(h => tier('amex-delta-platinum-business', h)?.rate), [3, 3, 1]);
eq('...1.5x on transit and shipping, and no restaurant bonus',
   ['uber.com', 'ups.com', 'doordash.com'].map(h => tier('amex-delta-platinum-business', h)?.rate), [1.5, 1.5, 1]);
eq('Delta Reserve Business: 3x at Delta, 1.5x on shipping, transit and office supply, 1x on hotels',
   ['delta.com', 'ups.com', 'uber.com', 'staples.com', 'marriott.com']
     .map(h => tier('amex-delta-reserve-business', h)?.rate), [3, 1.5, 1.5, 1.5, 1]);
eq('Marriott Bonvoy Business: 6x at Marriott, 4x on dining, gas, wireless and shipping, 2x elsewhere',
   ['marriott.com', 'doordash.com', 'shell.us', 't-mobile.com', 'ups.com', 'amazon.com']
     .map(h => tier('amex-marriott-business', h)?.rate), [6, 4, 4, 4, 4, 2]);
eq('Hilton Honors Business: 12x at Hilton, 5x everywhere else, worth 2%',
   [tier('amex-hilton-business', 'hilton.com')?.rate, tier('amex-hilton-business', 'amazon.com')?.rate,
    tier('amex-hilton-business', 'amazon.com')?.value], [12, 5, 2]);
eq('Business Green: 1x on the airline\'s own site, 2x through Amex Travel as a note',
   [tier('amex-business-green', 'delta.com')?.rate, noteAt('amex-business-green', 'hilton.com')],
   [1, 'Amex Business Green Rewards Card: 2x (3.20%) if you book through Amex Travel instead']);
eq('United Business: 2x at United, restaurants, gas, office supply and transit, 1x on another airline',
   ['united.com', 'doordash.com', 'shell.us', 'staples.com', 'uber.com', 'delta.com']
     .map(h => tier('chase-united-business', h)?.rate), [2, 2, 2, 2, 2, 1]);
eq('United Club Business: 2x at United, 1.5x everywhere else, Renowned Hotels as a note',
   [tier('chase-united-club-business', 'united.com')?.rate, tier('chase-united-club-business', 'amazon.com')?.rate,
    noteAt('chase-united-club-business', 'hilton.com')],
   [2, 1.5, 'United Club Business Card: 5x (6.00%) if you book through Renowned Hotels and Resorts instead']);
eq('Southwest Performance Business: 4x at Southwest, 2x on hotels booked direct, gas, dining and transit',
   ['southwest.com', 'marriott.com', 'shell.us', 'doordash.com', 'uber.com']
     .map(h => tier('chase-southwest-performance-business', h)?.rate), [4, 2, 2, 2, 2]);
eq('...1x through an OTA, and its lapsed 2025 categories earn nothing extra',
   ['hotels.com', 'ads.google.com', 'xfinity.com'].map(h => tier('chase-southwest-performance-business', h)?.rate),
   [1, 1, 1]);
eq('Southwest Premier Business: 3x at Southwest, 2x on gas and dining to $8,000 a year',
   [tier('chase-southwest-premier-business', 'southwest.com')?.rate,
    tier('chase-southwest-premier-business', 'shell.us')?.rate,
    tier('chase-southwest-premier-business', 'doordash.com')?.caveats[0]],
   [3, 2, 'Capped at $8,000 per year, then 1x']);
eq('IHG Premier Business: 10x at IHG, 5x on travel, OTAs included, dining, ads, office supply and gas, 3x elsewhere',
   ['ihg.com', 'marriott.com', 'hotels.com', 'hertz.com', 'uber.com', 'doordash.com', 'ads.google.com',
    'staples.com', 'shell.us', 'amazon.com'].map(h => tier('chase-ihg-business-premier', h)?.rate),
   [10, 5, 5, 5, 5, 5, 5, 5, 5, 3]);
eq('World of Hyatt Business: 4x at Hyatt, 2x at gyms, its top-three 2x left to the caution',
   ['hyatt.com', 'planetfitness.com', 'doordash.com', 'amazon.com'].map(h => tier('chase-hyatt-business', h)?.rate),
   [4, 2, 1, 1]);
eq('Wyndham Earner Business: 8x at Wyndham, 5x on gas, EV charging, ads, shipping and office supply',
   ['wyndhamhotels.com', 'shell.us', 'evgo.com', 'ads.google.com', 'ups.com', 'staples.com', 'doordash.com']
     .map(h => tier('barclays-wyndham-earner-business', h)?.rate), [8, 5, 5, 5, 5, 5, 1]);
eq('GM Business: 7x at GM\'s own web stores, 3x everywhere else',
   ['accessories.gmc.com', 'amazon.com'].map(h => tier('barclays-gm-business', h)?.rate), [7, 3]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
