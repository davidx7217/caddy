// Issuer marks and currency names -- presentation, not ranking.
//
// This does not live in engine.js, which is pure and has no business holding a
// palette, and it does not live in options.js any more either: the setup flow
// draws the same rows, and a second copy of a colour table is exactly how the
// popup and Options drifted apart.

// Two letters on a wash of the issuer's colour. Deliberately NOT logos --
// bundling issuer artwork into a distributed extension means shipping someone
// else's trademark, and a bare colour block asked the reader to remember which
// blue was which.
//
// The colour is a low-opacity tint, never a fill. At full strength these are
// cold saturated brand primaries and they fight a warm paper palette; at 16%
// they read as a soft wash that still tells Chase from Robinhood. The letters
// are --ink, so nothing here needs a per-theme contrast check.
const CHIP = {
  chase: '#1c4d8f', robinhood: '#0f9d58', bofa: '#a3232b', amex: '#2e6fb8',
  citi: '#0a4a86', capitalone: '#c0392b', discover: '#e8620c',
  wellsfargo: '#b3232c', usbank: '#1b4a7a'
};
const MONOGRAM = {
  chase: 'CH', robinhood: 'RH', bofa: 'BA', amex: 'AX',
  citi: 'CT', capitalone: 'C1', discover: 'DS',
  wellsfargo: 'WF', usbank: 'US'
};

/** Full issuer names, for anywhere the two-letter mark is not enough on its own. */
export const ISSUER = {
  chase: 'Chase', robinhood: 'Robinhood', bofa: 'Bank of America',
  amex: 'American Express', citi: 'Citi', capitalone: 'Capital One',
  discover: 'Discover', wellsfargo: 'Wells Fargo', usbank: 'U.S. Bank'
};

export const CURRENCY = {
  cash: 'Cash back', ur: 'Chase points', mr: 'Amex points',
  aeroplan: 'Aeroplan points', c1: 'Capital One miles', citi: 'Citi points',
  disco: 'Discover cash back'
};

export const money = c => c ? `$${c}/yr` : 'no annual fee';

export const mark = issuer =>
  `<span class="chip" style="--mark:${CHIP[issuer] || '#635e58'}">` +
  `<i>${MONOGRAM[issuer] || '?'}</i></span>`;
