// The arithmetic of a scorecard, exact. A weighted score is sum(weight * score) / sum(weight of the scored criteria). It is
// kept as a fraction of two whole numbers (BigInt), compared by cross multiplication and rounded to the places a report shows
// only at the very end, half up. No floating point number is used anywhere, so scores of 0.1 and 0.2 add up to 0.3 and two
// vendors a hair apart are told apart.

import { addDecimal, mulDecimal, ZERO } from './decimal.js';

const pow10 = (n) => 10n ** BigInt(n);

// The share num / den of two decimals as a fraction { n, d }; den is above zero.
export function ratio(num, den) {
  return { n: num.int * pow10(den.scale), d: den.int * pow10(num.scale) };
}

// -1, 0 or 1 as the fraction a is below, equal to or above b.
export function compareRatio(a, b) {
  const left = a.n * b.d;
  const right = b.n * a.d;
  return left < right ? -1 : left > right ? 1 : 0;
}

// The fraction as text with this many places, rounded half up (a fraction here is never negative).
export function fixed(r, places) {
  const q = (r.n * pow10(places) * 2n + r.d) / (r.d * 2n);
  const s = q.toString().padStart(places + 1, '0');
  return places === 0 ? s : `${s.slice(0, -places)}.${s.slice(-places)}`;
}

// A share as a percent with one place, such as "85.7".
export const percentText = (r) => fixed({ n: r.n * 100n, d: r.d }, 1);

// Whether the share r, as a percent, is below the decimal m (a number of percent).
export const percentBelow = (r, m) => r.n * 100n * pow10(m.scale) < m.int * r.d;

// Whether the difference of two scores a and b (a not below b) is below the decimal m.
export function differsByLess(a, b, m) {
  const diff = a.n * b.d - b.n * a.d;
  return diff * pow10(m.scale) < m.int * a.d * b.d;
}

// The totals of a vendor: the weight of the scored criteria, the sum of weight * score, and how many were scored.
export const emptyTotals = () => ({ weight: ZERO, sum: ZERO, scored: 0 });

export function addScored(totals, weight, score) {
  totals.weight = addDecimal(totals.weight, weight);
  totals.sum = addDecimal(totals.sum, mulDecimal(weight, score));
  totals.scored += 1;
}

// The vendors with a score, best first: equal scores share a rank (1, 2, 2, 4) and are put in the order of the keys of the
// vendors. Each vendor is { key, ratio }.
export function rankOrder(scored) {
  const sorted = [...scored].sort((a, b) => compareRatio(b.ratio, a.ratio) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  let rank = 0;
  return sorted.map((v, i) => {
    if (i === 0 || compareRatio(sorted[i - 1].ratio, v.ratio) !== 0) rank = i + 1;
    return { ...v, rank };
  });
}
