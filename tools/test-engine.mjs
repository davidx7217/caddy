// Zero-dependency test runner:  node tools/test-engine.mjs
import { readFileSync } from 'node:fs';
import { rank, resolveMerchant, pruneInstances, isMerchantPage, isCheckoutPage, isCommitLabel, isBuyLabel, inferCategory, isPinned } from '../src/engine.js';

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
  eq('BCE gets base rate at Target', card(r, 'amex-blue-cash-everyday').rate, 1);
  eq('Robinhood 3% flat wins at Target', r.winner.productId, 'robinhood-gold');
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
  const insts = [
    { productId: 'amex-blue-cash-everyday', config: {}, priority: 9 },
    { productId: 'robinhood-gold', config: {}, priority: 1 }
  ];
  const r = run('amazon.com', insts);
  eq('explicit priority breaks the tie', r.winner.productId, 'robinhood-gold');
  eq('resolvedBy reports priority', r.resolvedBy, 'priority');
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

// --- user-configured card (not in the wallet, kept for engine coverage) --
{
  const r = run('shell.us', [{ productId: 'bofa-customized-cash', config: {} }]);
  eq('BofA gets base rate with no category selected', r.winner.rate, 1);
}
{
  const r = run('shell.us', [{ productId: 'bofa-customized-cash',
    config: { selections: ['gas_ev'], tier_multiplier: 1.75 } }]);
  eq('selected group + Platinum Honors = 3 x 1.75', r.winner.rate, 5.25);
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
  const stale = [{ productId: 'chase-sapphire-preferred', config: {} },
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
const M = (sig, known = false) => isMerchantPage(sig, known);

// Being in merchants.json settles the category, not whether this page sells.
eq('a known merchant with no transactional signal does NOT show', M({}, true), false);
eq('a known merchant with one weak signal does', M({ cartLink: true }, true), true);
// Live youtube.com/watch, 2026-08-30: every commerce signal false. It showed
// only because the domain was in the table, which is the bug this fixes.
eq('LIVE youtube watch page does not show',
   M({ ldTypes: ['VideoObject', 'InteractionCounter'], ogType: 'video.other',
       platform: false, cartLink: false, buttonLabels: [], price: false }, true), false);
// Live homedepot.com homepage, 2026-08-30: one weak signal, a real merchant.
eq('LIVE home depot homepage still shows',
   M({ ldTypes: ['WebSite', 'Organization'], ogType: 'homepage',
       cartLink: true, buttonLabels: [], price: false }, true), true);
// Live netflix.com, 2026-08-30: plan pricing on a signup page.
eq('LIVE netflix signup page still shows',
   M({ ldTypes: [], cartLink: false, buttonLabels: [], price: true }, true), true);
// A bare payment page has no product markup at all, but must still mount the
// dock or the checkout auto-open would have nothing to open.
eq('a bare payment page counts as a merchant page',
   M({ billingForm: true }, false), true);
eq('...and so does one with a card field', M({ paymentField: true }, false), true);
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

{
  // The popup reports the band it actually used, so a changed tieBand cannot
  // silently explain away a missing tie.
  const r = run('doordash.com');
  eq('rank reports the tie band it used', r.tieBand, 0.10);
  // Exactly equal values are tied at ANY band, zero included: (top-v)/top is
  // 0, and 0 <= 0. So no tieBand setting can explain away a missing tie
  // between cards that earn identically -- only a saved default, a pinned
  // card, or a card not being owned can.
  const tight = run('doordash.com', WALLET, { prefs: { tieBand: 0 } });
  eq('a zero band still groups an EXACT tie', tight.tied.length, 4);
  eq('...and still reports it as unresolved', tight.resolvedBy, 'unresolved');
  eq('...and reports the band responsible', tight.tieBand, 0);
}

// --- pinned state, one definition ----------------------------------------
// These drifted: the ranker honoured `priority`, the options page only showed
// `pinned`, so a card silently decided every tie while Options showed nothing.
eq('explicit pinned flag counts', isPinned({ pinned: true }), true);
eq('a priority number counts too', isPinned({ priority: 3 }), true);
eq('priority 0 counts (not falsy-tested)', isPinned({ priority: 0 }), true);
eq('a plain instance does not', isPinned({ productId: 'x', config: {} }), false);
eq('pinned:false does not', isPinned({ pinned: false }), false);
{
  // Reproduces exactly what David saw: 6 cards, a 4-way dining tie, silently
  // settled by one pinned card, with no tie prompt shown.
  // Semantics: a pin marks the LIST ORDER as deliberate. The earliest tied
  // card then wins -- which is not necessarily the pinned one.
  const cfuFirst = [
    { productId: 'chase-freedom-unlimited', config: {}, pinned: true },
    ...WALLET.filter(i => i.productId !== 'chase-freedom-unlimited')
  ];
  const r = run('doordash.com', cfuFirst);
  eq('a pin settles a 4-way tie', r.resolvedBy, 'priority');
  eq('...in favour of the earliest tied card', r.winner.productId, 'chase-freedom-unlimited');
  eq('...and the tie group is still reported so the UI can explain itself',
     r.tied.length, 4);

  // The subtle part, asserted so it cannot regress into a surprise: pinning a
  // card that sits BELOW an unpinned one hands the win to the unpinned card.
  const pinnedLow = WALLET.map(i =>
    i.productId === 'chase-freedom-unlimited' ? { ...i, pinned: true } : i);
  const r3 = run('doordash.com', pinnedLow);
  eq('pinning a lower card lets a higher unpinned card win',
     r3.winner.productId, 'chase-sapphire-reserve');
  eq('...still reported as priority resolution', r3.resolvedBy, 'priority');

  const unpinned = cfuFirst.map(({ pinned, priority, ...rest }) => rest);
  const r2 = run('doordash.com', unpinned);
  eq('unpinning restores the prompt', r2.resolvedBy, 'unresolved');
}

// --- empty state ---------------------------------------------------------
eq('no cards owned', run('target.com', []).resolvedBy, 'no_cards');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
