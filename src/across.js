// The checks across rows and the ranking. The weighted score of each vendor is worked out exactly, the vendors are ranked, and
// the checks that need the whole scorecard run: a criterion nobody scored, a vendor that misses a criterion the others have,
// a vendor whose coverage is low and two vendors next to each other in the ranking whose scores are too close to call. The
// work is linear in the rows plus the findings that are listed: a vendor that misses many criteria is counted, and only the
// first findings of a check are built.

import { show } from './collect.js';
import { addDecimal, ZERO } from './decimal.js';
import { addScored, differsByLess, emptyTotals, fixed, percentBelow, percentText, rankOrder, ratio } from './score.js';

// The vendors of the model with their totals, in the order the file gives them. universe is the criteria that have a weight.
function totalsOf(model, universe) {
  const out = [];
  for (const v of model.vendors.values()) {
    const totals = emptyTotals();
    let covered = 0;
    for (const [ckey, rec] of v.rows) {
      const crit = model.criteria.get(ckey);
      if (crit.weight === null) continue;
      covered += 1;
      if (rec.state === 'ok') addScored(totals, crit.weight, rec.score);
    }
    out.push({ vendor: v, totals, covered, unscored: universe.length - totals.scored });
  }
  return out;
}

// Runs the checks across rows. options has minCoverage and tieMargin as decimals. Returns the ranking and the totals for the
// report.
export function checkAcross(model, { minCoverage, tieMargin }, collector) {
  const { add, full, skip } = collector;
  const crits = [...model.criteria.values()];
  const universe = crits.filter((c) => c.weight !== null);
  let totalWeight = ZERO;
  for (const c of universe) totalWeight = addDecimal(totalWeight, c.weight);
  const unweighted = crits.length - universe.length;
  if (unweighted > 0) collector.notes.push(`${unweighted} ${unweighted === 1 ? 'criterion has' : 'criteria have'} no valid weight and ${unweighted === 1 ? 'is' : 'are'} left out of the weighted scores and the coverage`);

  // A criterion nobody scored.
  for (const c of crits) {
    if (c.scorers > 0) continue;
    const why = c.rowCount === 0 ? 'no row of the scores file scores it' : 'every row that scores it is empty or unreadable';
    add('criterion-never-scored', c.where, `The criterion "${show(c.name)}" ${model.criteriaMode ? 'is in the criteria file, but ' : ''}was scored by no vendor: ${why}. It counts for nothing in the weighted scores.`, show(c.name));
  }

  const rows = totalsOf(model, universe);

  // A vendor that misses a criterion others have, one list for the required criteria and one for the others.
  const required = universe.filter((c) => c.rowCount > 0 && c.required);
  const optional = universe.filter((c) => c.rowCount > 0 && !c.required);
  const emit = (id, list, vendor, count, text) => {
    let left = count;
    for (const c of list) {
      if (left === 0) return;
      if (full(id)) {
        skip(id, left);
        return;
      }
      if (!vendor.rows.has(c.key)) {
        add(id, { file: 0, line: vendor.line, column: 1 }, text(c), `${show(vendor.name, 40)} / ${show(c.name, 40)}`);
        left -= 1;
      }
    }
  };
  for (const { vendor } of rows) {
    let haveRequired = 0;
    let haveOptional = 0;
    for (const ckey of vendor.rows.keys()) {
      const c = model.criteria.get(ckey);
      if (c.weight === null) continue;
      if (c.required) haveRequired += 1;
      else haveOptional += 1;
    }
    emit('required-unscored', required, vendor, required.length - haveRequired, (c) => `The vendor "${show(vendor.name)}" has no row for the criterion "${show(c.name)}", which other vendors have and the criteria file marks required.`);
    emit('vendor-misses-criterion', optional, vendor, optional.length - haveOptional, (c) => `The vendor "${show(vendor.name)}" has no row for the criterion "${show(c.name)}", which other vendors have.`);
  }

  // Coverage, the weighted score and the ranking.
  const haveWeights = universe.length > 0;
  const view = rows.map((r) => {
    const scored = r.totals.scored > 0;
    const score = scored ? ratio(r.totals.sum, r.totals.weight) : null;
    const coverage = haveWeights ? ratio(r.totals.weight, totalWeight) : null;
    return { ...r, score, coverage };
  });
  if (!haveWeights) collector.notes.push('no criterion has a valid weight, so there is no weighted score and no coverage');
  for (const r of view) {
    if (r.coverage !== null && percentBelow(r.coverage, minCoverage)) {
      add('coverage-low', { file: 0, line: r.vendor.line, column: 1 }, `The coverage of the vendor "${show(r.vendor.name)}" is ${percentText(r.coverage)} percent of the total weight, below the minimum of ${minCoverage.text} percent. Its weighted score rests on ${r.totals.scored} of ${universe.length} criteria.`, show(r.vendor.name));
    }
  }
  const ranked = rankOrder(view.filter((r) => r.score !== null).map((r) => ({ key: r.vendor.key, ratio: r.score, view: r })));
  for (let i = 1; i < ranked.length; i += 1) {
    const a = ranked[i - 1];
    const b = ranked[i];
    if (differsByLess(a.ratio, b.ratio, tieMargin)) {
      add('tie-too-close', { file: 0, line: a.view.vendor.line, column: 1 }, `The vendors "${show(a.view.vendor.name)}" (${fixed(a.ratio, 2)}) and "${show(b.view.vendor.name)}" (${fixed(b.ratio, 2)}) are next to each other in the ranking and differ by less than the tie margin of ${tieMargin.text}; the order between them is too close to call.`, `${show(a.view.vendor.name, 40)} / ${show(b.view.vendor.name, 40)}`);
    }
  }
  const ranking = [
    ...ranked.map((r) => r.view && { ...r.view, rank: r.rank }),
    ...view.filter((r) => r.score === null).sort((a, b) => (a.vendor.key < b.vendor.key ? -1 : a.vendor.key > b.vendor.key ? 1 : 0)).map((r) => ({ ...r, rank: null }))
  ].map((r) => ({
    rank: r.rank,
    vendor: show(r.vendor.name, 120),
    score: r.score === null ? null : fixed(r.score, 2),
    coverage: r.coverage === null ? null : percentText(r.coverage),
    redFlags: r.vendor.redFlags,
    redFlagCriteria: r.vendor.redFlagCriteria,
    unscored: r.unscored,
    scored: r.totals.scored,
    line: r.vendor.line
  }));
  return { ranking, criteria: universe.length, totalWeight };
}
