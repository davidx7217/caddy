// Setup flow tests:  node tools/test-setup.mjs
//
// src/setup.js against the REAL data/cards.json, so a card that gains or loses a
// user_config changes these results rather than a fixture's.
//
// This covers the decisions only. src/welcome.js renders them, and that half is
// still browser-verified: it assigns innerHTML and queries the result, which
// node cannot do without an HTML parser this project has no dependency for.
import { readFileSync } from 'node:fs';
import { tunableCards, liveCurrencies, steps, toInstances } from '../src/setup.js';

const load = n => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const products = load('cards'), baseVals = load('valuations');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' :
    `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`}`);
};

const ids = list => steps(list, products, baseVals).map(s => s.id);
const cur = list => liveCurrencies(list, products, baseVals);

// ---------- which questions a wallet raises ----------
eq('no picks: nothing is tunable', tunableCards([], products), []);
eq('no picks: no currency earns a cents-per-point field', cur([]), []);

// Read off the real catalogue rather than a fixture, so a card that gains or
// loses user_config shows up here. Written expecting one and corrected to two,
// which is the test doing its job on its first run.
eq('exactly two cards in the catalogue ask the user something',
   tunableCards(Object.keys(products).filter(k => !k.startsWith('_')), products),
   ['bofa-customized-cash', 'usbank-cash-plus']);

eq('a cash-back card raises no per-card question',
   tunableCards(['wellsfargo-active-cash'], products), []);
eq('...and no valuation question either, because cash is 1.0 by definition',
   cur(['wellsfargo-active-cash']), []);
eq('a Discover card earns `disco`, which is a point currency even at 1.0 cpp',
   cur(['discover-it-cash-back']), ['disco']);
eq('a Chase card earns `ur`', cur(['chase-freedom-unlimited']), ['ur']);
eq('two cards on one currency ask once', cur(['chase-freedom-unlimited', 'chase-freedom-flex']), ['ur']);
eq('two currencies ask twice, in valuations.json order',
   cur(['chase-freedom-unlimited', 'amex-gold']), ['ur', 'mr']);
eq('a card whose currency IS cash contributes nothing',
   cur(['chase-prime-visa', 'chase-freedom-unlimited']), ['ur']);

// ---------- the flow ----------
eq('an empty wallet gets three steps', ids([]), ['intro', 'cards', 'mode']);
eq('a cash-back-only wallet still gets three -- nothing to fine-tune',
   ids(['wellsfargo-active-cash', 'capitalone-quicksilver']), ['intro', 'cards', 'mode']);
eq('a points card earns the fine-tune step, for the cpp field alone',
   ids(['chase-freedom-unlimited']), ['intro', 'cards', 'tune', 'mode']);
eq('a configurable cash-back card earns it too, for the per-card question alone',
   ids(['bofa-customized-cash']), ['intro', 'cards', 'tune', 'mode']);
eq('...and that card really does earn it without any currency question',
   cur(['bofa-customized-cash']), []);
eq('U.S. Bank Cash+ earns it the same way',
   ids(['usbank-cash-plus']), ['intro', 'cards', 'tune', 'mode']);
eq('the step labels are what the stepper renders',
   steps([], products, baseVals).map(s => s.label),
   ['Welcome', 'Your cards', 'How it runs']);

// ---------- the wallet that gets written ----------
eq('picks become the shape Options reads',
   toInstances(['chase-freedom-unlimited', 'wellsfargo-active-cash']),
   [{ productId: 'chase-freedom-unlimited', config: {} },
    { productId: 'wellsfargo-active-cash', config: {} }]);
eq('a card with no config still carries an object, never undefined',
   toInstances(['bofa-customized-cash'])[0].config, {});
eq('configs are carried through by product id',
   toInstances(['usbank-cash-plus'],
     { 'usbank-cash-plus': { selections: ['five_department', 'five_utilities'] } })[0].config,
   { selections: ['five_department', 'five_utilities'] });
eq('a config belonging to a card that was NOT picked is left behind',
   toInstances(['wellsfargo-active-cash'], { 'amex-gold': { tier_multiplier: 1.5 } }),
   [{ productId: 'wellsfargo-active-cash', config: {} }]);
{
  // Pick order is the wallet order. It is a stable sort key and nothing else --
  // the engine suite pins the other half of that rule, that being first never
  // wins a tie.
  const picked = new Set(['amex-gold', 'chase-freedom-unlimited']);
  eq('a Set preserves the order the cards were chosen in',
     toInstances(picked).map(i => i.productId), ['amex-gold', 'chase-freedom-unlimited']);
}

// ---------- what a currency list can never contain ----------
// This replaced a test that asserted valuations.json's `_comment` key never
// reaches the UI. That test could not fail: `live` holds the currencies of the
// picked cards, so no key any card fails to earn survives, `_`-prefixed or not.
// Deleting the guard it was written for broke nothing, which is what said so.
eq('a wallet earns only what its own cards pay in, whatever else the file lists',
   cur(['wellsfargo-active-cash', 'capitalone-quicksilver']), []);
eq('...and the whole catalogue earns every currency in the file except cash',
   cur(Object.keys(products).filter(k => !k.startsWith('_'))),
   Object.keys(baseVals).filter(k => !k.startsWith('_') && k !== 'cash'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
