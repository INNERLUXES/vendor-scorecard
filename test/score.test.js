import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addScored, compareRatio, differsByLess, emptyTotals, fixed, parseDecimal, percentBelow, percentText, rankOrder, ratio } from '../src/index.js';
import { ALPHA, BETA, GAMMA, cell, runOf } from './helpers.js';

const d = (raw) => parseDecimal(raw);
const r = (n, m) => ratio(d(n), d(m));

test('ratio and fixed: a share of two decimals as an exact fraction, rounded half up at the very end', () => {
  assert.equal(fixed(r('19', '5'), 2), '3.80');
  assert.equal(fixed(r('1', '3'), 2), '0.33');
  assert.equal(fixed(r('2', '3'), 2), '0.67');
  assert.equal(fixed(r('2.675', '1'), 2), '2.68', 'a floating point number gives 2.67 for 2.675');
  assert.equal((2.675).toFixed(2), '2.67', 'the reason the arithmetic is made with BigInt');
  assert.equal(fixed(r('0.005', '1'), 2), '0.01');
  assert.equal(fixed(r('0.0049999999999999999999999', '1'), 2), '0.00');
  assert.equal(fixed(r('5', '1'), 2), '5.00');
  assert.equal(fixed(r('0', '1'), 2), '0.00');
  assert.equal(fixed(r('7', '2'), 0), '4');
});

test('percentText and percentBelow: coverage as a percent with one place, and a minimum compared with no rounding', () => {
  assert.equal(percentText(r('13', '15')), '86.7');
  assert.equal(percentText(r('15', '15')), '100.0');
  assert.equal(percentText(r('1', '8')), '12.5');
  assert.equal(percentBelow(r('4', '5'), d('80')), false, 'exactly 80 percent is not below 80');
  assert.equal(percentBelow(r('3.99', '5'), d('80')), true);
  assert.equal(percentBelow(r('79.999999999999999999', '100'), d('80')), true, 'a hair below, which a double would lose');
  assert.equal(percentBelow(r('1', '3'), d('33.3')), false);
  assert.equal(percentBelow(r('1', '3'), d('33.4')), true);
  assert.equal(percentBelow(r('0', '5'), d('0')), false);
});

test('compareRatio: compares fractions of different sizes exactly', () => {
  assert.equal(compareRatio(r('1', '3'), r('2', '6')), 0);
  assert.equal(compareRatio(r('0.1', '0.3'), r('1', '3')), 0);
  assert.equal(compareRatio(r('1', '3'), r('333333333333333333', '1000000000000000000')), 1);
  assert.equal(compareRatio(r('1', '4'), r('1', '3')), -1);
});

test('differsByLess: the difference of two scores below a margin, exact, and the margin itself is not below', () => {
  assert.equal(differsByLess(r('38', '10'), r('37', '10'), d('0.1')), false, '0.1 apart is not less than 0.1');
  assert.equal(differsByLess(r('38', '10'), r('371', '100'), d('0.1')), true, '0.09 apart');
  assert.equal(differsByLess(r('38', '10'), r('38', '10'), d('0.1')), true, 'equal scores');
  assert.equal(differsByLess(r('38', '10'), r('38', '10'), d('0')), false, 'a margin of 0 turns the check off');
  assert.equal(differsByLess(r('1', '3'), r('333333333333333333', '1000000000000000000'), d('0.000000000000000001')), true);
});

test('addScored and emptyTotals: weights and weight times score add up exactly', () => {
  const t = emptyTotals();
  addScored(t, d('0.1'), d('3'));
  addScored(t, d('0.2'), d('3'));
  assert.equal(t.scored, 2);
  assert.deepEqual(t.weight, { int: 3n, scale: 1 });
  assert.equal(fixed(ratio(t.sum, t.weight), 2), '3.00');
  assert.equal(0.1 + 0.2 === 0.3, false, 'the reason the sums are made with BigInt');
});

test('rankOrder: best first, equal scores share a rank and the next rank skips, ties by key', () => {
  const ranked = rankOrder([{ key: 'b', ratio: r('3', '1') }, { key: 'a', ratio: r('3', '1') }, { key: 'c', ratio: r('4', '1') }, { key: 'd', ratio: r('1', '1') }]);
  assert.deepEqual(ranked.map((x) => [x.key, x.rank]), [['c', 1], ['a', 2], ['b', 2], ['d', 4]]);
  assert.deepEqual(rankOrder([]), []);
});

test('the weighted score of a vendor is sum(weight * score) / sum(weight of the scored criteria), and coverage is the scored weight over the total', () => {
  const run = runOf([
    cell({ weight: '3', score: '4' }),
    cell({ criterion: 'Published audits', weight: '2', score: '3.5', evidence: 'DOC-1' }),
    cell({ criterion: 'Integration', weight: '1', score: '' }),
    cell({ vendor: BETA, weight: '3', score: '2' })
  ]);
  const alpha = run.ranking.find((v) => v.vendor === ALPHA);
  assert.equal(alpha.score, '3.80', '(3 * 4 + 2 * 3.5) / 5');
  assert.equal(alpha.coverage, '83.3', '5 of 6');
  assert.equal(alpha.unscored, 1);
  assert.equal(alpha.scored, 2);
  const beta = run.ranking.find((v) => v.vendor === BETA);
  assert.equal(beta.score, '2.00');
  assert.equal(beta.coverage, '50.0');
  assert.equal(beta.unscored, 2, 'the criteria it has no row for count as unscored');
});

test('the score of one vendor is the same as a mean of scores worked out by hand, in weights that a double cannot hold', () => {
  const run = runOf([
    cell({ criterion: 'One', weight: '0.1', score: '3' }),
    cell({ criterion: 'Two', weight: '0.2', score: '3' }),
    cell({ criterion: 'Three', weight: '0.7', score: '3' })
  ]);
  assert.equal(run.ranking[0].score, '3.00');
  const odd = runOf([cell({ criterion: 'One', weight: '1', score: '1' }), cell({ criterion: 'Two', weight: '2', score: '2' })]);
  assert.equal(odd.ranking[0].score, '1.67', '5 / 3 rounded half up');
});

test('the ranking: best first, equal scores share a rank, and a vendor with no score is listed last with no rank', () => {
  const run = runOf([
    cell({ vendor: ALPHA, score: '4' }),
    cell({ vendor: BETA, score: '4' }),
    cell({ vendor: GAMMA, score: '2' }),
    cell({ vendor: 'Vendor Delta', score: '' })
  ]);
  assert.deepEqual(run.ranking.map((v) => [v.vendor, v.rank, v.score]), [[ALPHA, 1, '4.00'], [BETA, 1, '4.00'], [GAMMA, 3, '2.00'], ['Vendor Delta', null, null]]);
  assert.equal(run.ranking[3].coverage, '0.0');
});

test('vendors and criteria are the same when they differ only in case and in runs of white space, and the first spelling is shown', () => {
  const run = runOf([cell({ vendor: 'Vendor  Alpha', score: '4' }), cell({ vendor: 'vendor alpha', criterion: 'Published audits', score: '2', evidence: 'DOC-1' })]);
  assert.equal(run.ranking.length, 1);
  assert.equal(run.ranking[0].vendor, 'Vendor  Alpha');
});
