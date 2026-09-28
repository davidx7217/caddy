// The decisions the setup flow makes, with nothing it renders them into.
//
// Same contract as engine.js: no DOM, no chrome.*, no network. src/welcome.js is
// the other half -- markup, storage and the permission prompt -- and it cannot be
// tested in node, because it renders by assigning innerHTML and then querying the
// result, which needs an HTML parser this project has no dependency for.
//
// So the split is not decoration. Everything a reader of the flow could get
// WRONG lives here: which steps they are shown, which questions their picks
// actually raise, and the shape of the wallet that gets written. What is left in
// welcome.js is the part a browser has to answer for anyway.
//
// `picked` is any iterable of product ids, in the order they were chosen. Every
// id must exist in `products`; welcome.js guarantees that at both entry points,
// so this does not check it again and hide the day it stops being true.

/** Cards among the picks that ask the user something. */
export function tunableCards(picked, products) {
  return [...picked].filter(id => products[id].user_config);
}

/**
 * Point currencies the wallet actually earns, and so the only cents-per-point
 * fields worth showing.
 *
 * `cash` is excluded on purpose: it is 1.0 by definition, and a field with one
 * possible answer is not a question.
 *
 * There is deliberately no `_`-prefix filter here, though valuations.json does
 * carry a `_comment`. `live` holds the currencies of the cards actually picked,
 * so a key nothing earns is already gone -- and a guard that cannot change the
 * answer is worse than no guard, because a test for it cannot fail either. That
 * is how this one was found: it survived being deleted.
 */
export function liveCurrencies(picked, products, baseVals) {
  const live = new Set([...picked].map(id => products[id].currency));
  return Object.keys(baseVals).filter(k => k !== 'cash' && live.has(k));
}

/**
 * The flow, which is three steps or four.
 *
 * What you earn exists only when the picks earn it. A wallet of nothing but
 * cash-back cards raises no per-card question and no valuation question, so
 * showing it a form whose every field is already correct would be asking for
 * confirmation rather than input.
 */
export function steps(picked, products, baseVals) {
  const earned = tunableCards(picked, products).length
              || liveCurrencies(picked, products, baseVals).length;
  return [
    { id: 'intro', label: 'Welcome' },
    { id: 'cards', label: 'Your cards' },
    ...(earned ? [{ id: 'tune', label: 'What you earn' }] : []),
    { id: 'mode', label: 'How it runs' }
  ];
}

/**
 * Where an unfinished setup picks up again: the step the reader had reached,
 * as background.js and the flow record it in `setupPending`. It has to be a step
 * their picks still earn -- What you earn exists only for some wallets -- and
 * anything else, including no pending setup at all, starts at the beginning.
 */
export function resumeAt(pending, picked, products, baseVals) {
  return steps(picked, products, baseVals).some(s => s.id === pending) ? pending : 'intro';
}

/**
 * The wallet, in the shape Options reads and the ranker takes.
 *
 * Order is the order the cards were picked. It is a stable sort key and nothing
 * more -- position never settles a tie, which is the rule the engine tests pin
 * from the other side.
 */
export function toInstances(picked, configs = {}) {
  return [...picked].map(id => ({ productId: id, config: configs[id] || {} }));
}
