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
// behaviour cannot drift apart the way priority and pinned once did.
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

// phone_internet is a distinct card bucket from utilities: Ink Cash's 5% reads
// "internet, cable and phone services", which no issuer folds into utilities.
eq('t-mobile.com now ranks as phone_internet', run('t-mobile.com').category, 'phone_internet');
eq('verizon.com too', run('verizon.com').category, 'phone_internet');
eq('xfinity.com too', run('xfinity.com').category, 'phone_internet');

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
eq('phone_internet pays 5x, so t-mobile.com finally ranks something',
   inkAt('t-mobile.com').all[0].rate, 5);

// The misreading this card invites: its 5% is "office supply stores AND
// internet, cable and phone services". Gas and restaurants are the SEPARATE 2%
// tier, and utilities are in neither -- "internet, cable and phone" is not the
// same thing as electricity, and Chase does not say it is.
eq('gas is 2x, not 5x', inkAt('exxonmobilfuels.com').all[0].rate, 2);
eq('dining is 2x, not 5x', inkAt('doordash.com').all[0].rate, 2);
eq('utilities get the base rate, because phone_internet is not utilities',
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
