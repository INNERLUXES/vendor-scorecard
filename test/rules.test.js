import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMN_NAMES, RULES, atOrAbove, badEvidence, decide, evidenceForm, ruleById } from '../src/index.js';
import { ALPHA, BETA, GAMMA, cell, clean, criteriaFile, findingsOf, idsOf, lineOf, ofCheck, runOf, table } from './helpers.js';

// Each check has a near miss on each side: the value that is reported and the one next to it that is not.

test('a clean scorecard has no finding, with and without a criteria file', () => {
  assert.deepEqual(idsOf(clean()), []);
  assert.deepEqual(idsOf(clean(), criteriaFile()), []);
});

test('column-missing: vendor, criterion and score are needed, reported once at the header, and nothing else is checked', () => {
  for (const column of ['vendor', 'criterion', 'score']) {
    const columns = COLUMN_NAMES.filter((c) => c !== column);
    const r = runOf(table(clean(), columns));
    const f = r.findings.filter((x) => x.id === 'column-missing');
    assert.equal(f.length, 1, column);
    assert.equal(f[0].line, 1);
    assert.match(f[0].message, new RegExp(`^The header has no "${column}" column, which the tool needs\\.$`));
    assert.equal(r.model, null);
    assert.match(r.notes[0], /not checked beyond their headers/);
  }
});

test('column-missing: the weight is needed unless the criteria file brings the weights; evidence, red_flag and note may be left out', () => {
  const columns = COLUMN_NAMES.filter((c) => c !== 'weight');
  const alone = findingsOf(table(clean(), columns));
  assert.deepEqual(alone.map((f) => f.id), ['column-missing']);
  assert.match(alone[0].message, /no "weight" column, and no criteria file brings the weights/);
  assert.deepEqual(idsOf(table(clean(), columns), criteriaFile()), []);
  const light = COLUMN_NAMES.filter((c) => !['red_flag', 'note'].includes(c));
  assert.deepEqual(idsOf(table(clean(), light)), []);
  const noEvidence = COLUMN_NAMES.filter((c) => c !== 'evidence');
  const ids = idsOf(table(clean(), noEvidence));
  assert.deepEqual([...new Set(ids)], ['evidence-missing'], 'every score above the threshold has nothing behind it');
});

test('column-missing: the criteria file needs a criterion column, and without a weight column it cannot bring the weights', () => {
  const noCriterion = findingsOf(table(clean()), criteriaFile([['3']], ['weight']));
  assert.deepEqual(noCriterion.map((f) => [f.id, f.file]), [['column-missing', 1]]);
  const noWeight = runOf(table(clean()), criteriaFile([['Chain experience', 'no'], ['Published audits', 'no']], ['criterion', 'required']));
  assert.deepEqual(noWeight.findings.map((f) => [f.id, f.file, f.line]), [['column-missing', 1, 1]]);
  assert.match(noWeight.findings[0].message, /cannot give the weights; they are read from the scores file/);
  assert.notEqual(noWeight.model, null, 'the weights come from the scores file');
  const neither = findingsOf(table(clean(), COLUMN_NAMES.filter((c) => c !== 'weight')), criteriaFile([['Chain experience', 'no']], ['criterion', 'required']));
  assert.deepEqual(neither.map((f) => f.id), ['column-missing', 'column-missing']);
});

test('column-unknown and column-duplicate: a misspelt column is named with its nearest column, a name written twice is read once', () => {
  const unknown = ofCheck(table(clean(), [...COLUMN_NAMES, 'evidance']), 'column-unknown');
  assert.equal(unknown.length, 1);
  assert.match(unknown[0].message, /The column "evidance" of the scores file is not a column the tool reads.* Did you mean evidence\?$/);
  assert.equal(unknown[0].column, table(clean(), [...COLUMN_NAMES, 'evidance']).split('\n')[0].indexOf('evidance') + 1);
  const far = ofCheck(table(clean(), [...COLUMN_NAMES, 'status']), 'column-unknown');
  assert.doesNotMatch(far[0].message, /Did you mean/);
  const spaced = idsOf(table(clean().map((r) => ({ ...r, ['Red Flag']: r.red_flag })), [...COLUMN_NAMES.filter((c) => c !== 'red_flag'), 'Red Flag']));
  assert.deepEqual(spaced, [], 'Red Flag is the column red_flag');
  const twice = ofCheck(table(clean(), [...COLUMN_NAMES, 'Note']), 'column-duplicate');
  assert.equal(twice.length, 1);
  assert.match(twice[0].message, /^The column "Note" has the same name as column 7 of the scores file/);
  const unnamed = ofCheck(table(clean(), [...COLUMN_NAMES, '']), 'column-unknown');
  assert.match(unnamed[0].message, /^Column 8 of the scores file has no name/);
});

test('column-unknown in the criteria file is named as the criteria file', () => {
  const f = ofCheck(table(clean()), 'column-unknown', criteriaFile([['Chain experience', '3', 'no', '', 'x'], ['Published audits', '2', 'no', '', 'x']], ['criterion', 'weight', 'required', 'description', 'owner']));
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 1);
  assert.match(f[0].message, /of the criteria file is not a column the tool reads/);
});

test('row-malformed: a row of the wrong width is reported and left out, one cell short or one over', () => {
  const short = 'Vendor Alpha,Chain experience,3,4';
  const over = `${table([cell()]).split('\n')[1]},extra`;
  for (const [row, count] of [[short, 4], [over, 8]]) {
    const text = `${table(clean()).trimEnd()}\n${row}\n`;
    const f = ofCheck(text, 'row-malformed');
    assert.equal(f.length, 1);
    assert.match(f[0].message, new RegExp(`^Row 5 has ${count} cells but the header has 7; the row was left out of every other check\\.$`));
    assert.equal(f[0].line, 6);
    assert.deepEqual(idsOf(text), ['row-malformed']);
  }
  const crit = ofCheck(table(clean()), 'row-malformed', 'criterion,weight,required,description\nChain experience,3\nPublished audits,2,no,\n');
  assert.equal(crit[0].file, 1);
  assert.match(crit[0].message, /^Row 1 of the criteria file has 2 cells/);
});

test('cell-incomplete: a row with no vendor or no criterion, or a placeholder in place of one, is left out; a vendor named Nonesuch is a vendor', () => {
  for (const column of ['vendor', 'criterion']) {
    for (const blank of ['', '  ', 'n/a', 'TBD', 'none', 'unknown', '-', '?']) {
      const f = ofCheck([...clean(), cell({ vendor: GAMMA, criterion: 'Integration', [column]: blank })], 'cell-incomplete');
      assert.equal(f.length, 1, `${column} ${JSON.stringify(blank)}`);
      assert.match(f[0].message, new RegExp(`^Row 5 has no value in the cell under "${column}", which every row needs; the row was left out\\.$`));
    }
  }
  assert.deepEqual(idsOf([...clean(), cell({ vendor: 'Nonesuch Ltd', criterion: 'Integration', score: '3' })]).filter((id) => id === 'cell-incomplete'), []);
  const crit = ofCheck(table(clean()), 'cell-incomplete', 'criterion,weight\nChain experience,3\n,2\n');
  assert.equal(crit[0].file, 1);
  assert.match(crit[0].message, /^Row 2 of the criteria file has no value in the cell under "criterion"/);
});

test('duplicate-pair: the same vendor and criterion twice, in any case, is reported at the second row; another criterion is not', () => {
  const rows = [...clean(), cell({ vendor: 'VENDOR  ALPHA', criterion: 'chain experience', score: '1' })];
  const f = ofCheck(rows, 'duplicate-pair');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /^Row 5 scores the vendor "VENDOR {2}ALPHA" on the criterion "chain experience" again; row 1, on line 2, already does\./);
  assert.equal(f[0].line, 6);
  assert.equal(runOf(rows).ranking.find((v) => v.vendor === ALPHA).score, '3.80', 'the first row is the one counted');
  assert.deepEqual(ofCheck([...clean(), cell({ criterion: 'Integration', score: '1' })], 'duplicate-pair'), []);
  assert.deepEqual(idsOf([...clean(), cell({ score: '9', evidence: '' })]), ['duplicate-pair'], 'a repeated row is left out of the other checks');
  const crit = ofCheck(table(clean()), 'duplicate-pair', criteriaFile([['Chain experience', '3', 'no', ''], ['Published audits', '2', 'no', ''], ['CHAIN experience', '3', 'no', '']]));
  assert.equal(crit[0].file, 1);
  assert.match(crit[0].message, /^Row 3 of the criteria file lists the criterion "CHAIN experience" again; row 1, on line 2, already does\./);
});

test('weight-not-positive: zero, a sign, a separator, an exponent, text and too many digits are reported; a plain number is not', () => {
  for (const bad of ['0', '0.0', '-1', '+2', '1e3', '1,5', '1 000', 'two', '0x10', `1${'0'.repeat(40)}`, `0.${'1'.repeat(41)}`]) {
    const f = ofCheck([cell({ weight: bad })], 'weight-not-positive');
    assert.equal(f.length, 1, bad);
    assert.match(f[0].message, /is not a plain number above zero/);
  }
  for (const ok of ['1', '0.5', '2.50', ' 3 ', `${'9'.repeat(40)}`, `0.${'1'.repeat(40)}`]) assert.deepEqual(ofCheck([cell({ weight: ok })], 'weight-not-positive'), [], ok);
  const empty = ofCheck([cell({ weight: '' })], 'weight-not-positive');
  assert.match(empty[0].message, /^Row 1 has no weight for the criterion "Chain experience"/);
});

test('weight-not-positive: with a criteria file an empty weight in the scores file is fine, and a weight in the criteria file must be positive', () => {
  assert.deepEqual(idsOf(clean().map((r) => ({ ...r, weight: '' })), criteriaFile()), []);
  assert.deepEqual(idsOf(clean().map((r) => ({ ...r, weight: 'x' })), criteriaFile()).filter((id) => id === 'weight-not-positive').length, 4, 'a weight that is written must still be a number');
  const bad = ofCheck(table(clean()), 'weight-not-positive', criteriaFile([['Chain experience', '0', 'no', ''], ['Published audits', '2', 'no', '']]));
  assert.equal(bad.length, 1);
  assert.equal(bad[0].file, 1);
  const none = ofCheck(table(clean()), 'weight-not-positive', criteriaFile([['Chain experience', '', 'no', ''], ['Published audits', '2', 'no', '']]));
  assert.match(none[0].message, /^The criterion "Chain experience" in row 1 of the criteria file has no weight/);
});

test('weight-not-positive: a criterion with no valid weight at all is left out of the scores and the coverage, with a note', () => {
  const run = runOf([cell({ weight: '0' }), cell({ criterion: 'Published audits', weight: '2', score: '3', evidence: 'DOC-1' })]);
  assert.match(run.notes.join('\n'), /1 criterion has no valid weight and is left out of the weighted scores and the coverage/);
  assert.equal(run.ranking[0].score, '3.00');
  assert.equal(run.ranking[0].coverage, '100.0');
});

test('weight-differs: another weight for a criterion is reported at its row, and 3 and 3.0 are the same weight', () => {
  const f = ofCheck([...clean(), cell({ vendor: GAMMA, weight: '3.1', score: '3.5', evidence: 'DOC-2' })], 'weight-differs');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /^The weight of row 5 for the criterion "Chain experience" is 3\.1, but row 1, on line 2, gives it 3\. The first weight is the one used\.$/);
  assert.deepEqual(ofCheck([...clean(), cell({ vendor: GAMMA, weight: '3.0', score: '3.5', evidence: 'DOC-2' })], 'weight-differs'), []);
  assert.deepEqual(ofCheck([...clean(), cell({ vendor: GAMMA, weight: '03', score: '3.5', evidence: 'DOC-2' })], 'weight-differs'), [], 'an unreadable weight is a different finding');
  const against = ofCheck(table(clean()), 'weight-differs', criteriaFile([['Chain experience', '4', 'no', ''], ['Published audits', '2', 'no', '']]));
  assert.equal(against.length, 2);
  assert.match(against[0].message, /but the criteria file, on line 2, gives it 4\./);
  const same = runOf(table(clean()), criteriaFile([['Chain experience', '4', 'no', ''], ['Published audits', '2', 'no', '']]));
  assert.equal(same.ranking[0].score, '3.83', 'the weights of the criteria file are the ones used: (4 * 4 + 2 * 3.5) / 6');
});

test('score-invalid: text, a sign, a comma, an exponent, a number above 5 and too many digits are reported; 0, 5 and 4.50 are not', () => {
  for (const bad of ['high', '-1', '-0', '+3', '3,5', '1e0', '5.01', '6', '10', '5.000000000000000000001', '03', '.5', '4/5', `1${'0'.repeat(40)}`]) {
    const f = ofCheck([cell({ score: bad })], 'score-invalid');
    assert.equal(f.length, 1, bad);
    assert.match(f[0].message, /counts as unscored for this vendor/);
  }
  for (const ok of ['0', '0.0', '5', '5.0', '5.00000000000000000000', '4.50', ' 2 ', '0.1']) assert.deepEqual(ofCheck([cell({ score: ok, evidence: 'DOC-1' })], 'score-invalid'), [], ok);
  const run = runOf([cell({ score: 'high' }), cell({ criterion: 'Published audits', weight: '2', score: '2', evidence: 'DOC-1' })]);
  assert.equal(run.ranking[0].score, '2.00', 'an unreadable score is left out of the arithmetic');
  assert.equal(run.ranking[0].unscored, 1);
  assert.equal(run.findings.filter((f) => f.id === 'criterion-unscored').length, 0, 'it is not reported twice');
});

test('yes-no-unreadable: yes and no in any case are read, anything else in red_flag or required is reported and read as no', () => {
  for (const ok of ['yes', 'YES', 'Yes', 'no', 'No', '', 'n/a']) assert.deepEqual(ofCheck([cell({ red_flag: ok })], 'yes-no-unreadable'), [], ok);
  for (const bad of ['y', 'true', 'maybe', '1', 'yes please']) {
    const f = ofCheck([cell({ red_flag: bad })], 'yes-no-unreadable');
    assert.equal(f.length, 1, bad);
    assert.match(f[0].message, /is not yes or no; it is read as no\.$/);
    assert.deepEqual(ofCheck([cell({ red_flag: bad })], 'red-flag-raised'), []);
  }
  const crit = ofCheck(table(clean()), 'yes-no-unreadable', criteriaFile([['Chain experience', '3', 'maybe', ''], ['Published audits', '2', 'YES', '']]));
  assert.equal(crit.length, 1);
  assert.equal(crit[0].file, 1);
  assert.match(crit[0].message, /^The required cell of row 1 of the criteria file, "maybe", is not yes or no/);
});

test('criterion-not-in-criteria: a criterion the criteria file does not list is reported once, with its rows left out', () => {
  const rows = [...clean(), cell({ criterion: 'Roadmap fit', score: '3', evidence: 'DOC-1' }), cell({ vendor: BETA, criterion: 'Roadmap fit', score: '4', evidence: 'DOC-1' })];
  const f = ofCheck(rows, 'criterion-not-in-criteria', criteriaFile());
  assert.equal(f.length, 1);
  assert.match(f[0].message, /^The criterion "Roadmap fit" of row 5 is not in the criteria file/);
  assert.deepEqual(ofCheck(rows, 'criterion-not-in-criteria'), [], 'without a criteria file every criterion is listed by its rows');
  assert.equal(runOf(rows, criteriaFile()).ranking[0].coverage, '100.0');
  assert.deepEqual(ofCheck(clean().map((r) => ({ ...r, criterion: r.criterion.toUpperCase() })), 'criterion-not-in-criteria', criteriaFile()), [], 'case does not matter');
});

test('criterion-unscored and required-unscored: an empty score is a warning, and an error when the criteria file marks the criterion required', () => {
  const rows = [...clean().slice(0, 3), cell({ vendor: BETA, criterion: 'Published audits', weight: '2', score: '' })];
  const w = ofCheck(rows, 'criterion-unscored');
  assert.equal(w.length, 1);
  assert.match(w[0].message, /^Row 4 leaves the criterion "Published audits" unscored for the vendor "Vendor Beta"\.$/);
  assert.equal(w[0].line, 5);
  assert.deepEqual(ofCheck(rows, 'required-unscored'), []);
  const strict = criteriaFile([['Chain experience', '3', 'no', ''], ['Published audits', '2', 'yes', '']]);
  assert.deepEqual(ofCheck(rows, 'criterion-unscored', strict), []);
  const e = ofCheck(rows, 'required-unscored', strict);
  assert.equal(e.length, 1);
  assert.match(e[0].message, /, and the criteria file marks it required\.$/);
  assert.equal(atOrAbove(ruleById('required-unscored').severity, 'error'), true);
  assert.equal(ruleById('criterion-unscored').severity, 'warning');
  assert.deepEqual(ofCheck(clean(), 'required-unscored', criteriaFile([['Chain experience', '3', 'yes', ''], ['Published audits', '2', 'yes', '']])), [], 'scored, so nothing is reported');
  for (const blank of ['', 'n/a', 'TBD']) assert.equal(ofCheck([...clean().slice(0, 3), cell({ vendor: BETA, criterion: 'Published audits', weight: '2', score: blank })], 'criterion-unscored').length, 1, blank);
});

test('vendor-misses-criterion: a vendor with no row for a criterion others have, once for each criterion, at its first row', () => {
  const rows = clean().slice(0, 3);
  const f = ofCheck(rows, 'vendor-misses-criterion');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /^The vendor "Vendor Beta" has no row for the criterion "Published audits", which other vendors have\.$/);
  assert.equal(f[0].line, 4);
  assert.deepEqual(ofCheck(clean(), 'vendor-misses-criterion'), []);
  const strict = criteriaFile([['Chain experience', '3', 'no', ''], ['Published audits', '2', 'yes', '']]);
  assert.deepEqual(ofCheck(rows, 'vendor-misses-criterion', strict), []);
  const e = ofCheck(rows, 'required-unscored', strict);
  assert.equal(e.length, 1);
  assert.match(e[0].message, /has no row for the criterion "Published audits", which other vendors have and the criteria file marks required\.$/);
});

test('criterion-never-scored: a criterion nobody scored is an error, listed in the criteria file or found in the rows', () => {
  const listed = criteriaFile([['Chain experience', '3', 'no', ''], ['Published audits', '2', 'no', ''], ['Token design', '1', 'no', '']]);
  const f = ofCheck(clean(), 'criterion-never-scored', listed);
  assert.equal(f.length, 1);
  assert.equal(f[0].file, 1);
  assert.equal(f[0].line, 4);
  assert.match(f[0].message, /^The criterion "Token design" is in the criteria file, but was scored by no vendor: no row of the scores file scores it\./);
  assert.deepEqual(ofCheck(clean(), 'vendor-misses-criterion', listed), [], 'a criterion nobody has a row for is reported once, not for each vendor');
  assert.deepEqual(ofCheck(clean(), 'criterion-never-scored', criteriaFile()), []);
  const empty = ofCheck([...clean(), cell({ criterion: 'Integration', weight: '1', score: '', evidence: '' }), cell({ vendor: BETA, criterion: 'Integration', weight: '1', score: 'x', evidence: '' })], 'criterion-never-scored');
  assert.equal(empty.length, 1);
  assert.match(empty[0].message, /^The criterion "Integration" was scored by no vendor: every row that scores it is empty or unreadable\./);
  assert.match(f[0].message, /It counts for nothing in the weighted scores\.$/);
});

test('evidence-missing: a score above the threshold with an empty evidence cell, 3 is not above 3, and --evidence-above moves the line', () => {
  const at = (score, evidence = '', options) => ofCheck([cell({ score, evidence })], 'evidence-missing', null, options);
  assert.equal(at('3').length, 0);
  assert.equal(at('3.0').length, 0);
  assert.equal(at('3.01').length, 1);
  assert.equal(at('5').length, 1);
  assert.equal(at('5', 'DOC-1').length, 0);
  assert.equal(at('5', 'n/a').length, 1, 'a placeholder says nothing');
  assert.equal(at('4', '', { evidenceAbove: '4' }).length, 0);
  assert.equal(at('4.5', '', { evidenceAbove: '4' }).length, 1);
  assert.equal(at('0', '', { evidenceAbove: '0' }).length, 0);
  assert.equal(at('0.1', '', { evidenceAbove: '0' }).length, 1);
  assert.equal(at('5', '', { evidenceAbove: '5' }).length, 0);
  assert.equal(at('', '').length, 0, 'an unscored cell needs no evidence');
  assert.equal(at('9', '').length, 0, 'an unreadable score is a finding of its own');
  const f = at('4.5');
  assert.match(f[0].message, /^Row 1 scores "Chain experience" at 4\.5 for "Vendor Alpha" with nothing in the evidence cell; a score above 3 should point at where it comes from\.$/);
  assert.equal(f[0].column, 'Vendor Alpha,Chain experience,3,4.5,'.length + 1);
});

test('evidence-form: a web address or a document reference passes, and a sentence, a bare host, another scheme or a user name does not', () => {
  for (const ok of ['http://example.com', 'https://example.com/a/b?c=d#e', 'HTTPS://Example.COM/path', 'https://sub.example.com:8080/x', 'https://example.com', 'DOC-12', 'AUD#7.2', 'rfp-3/a_b', 'DOC-12; https://example.com/x', 'DOC-12;']) assert.equal(badEvidence(ok), null, ok);
  for (const bad of ['as discussed', 'example.com/audit', 'ftp://example.com/a', 'https://localhost/a', 'https://user:pw@example.com/a', 'https://example.com/ a', 'https://.example.com/a', 'https://example..com/a', 'DOC12', 'D-1', 'ABCDEFGHIJK-1', 'DOC-', 'see DOC-12']) {
    assert.notEqual(badEvidence(bad), null, bad);
    const f = ofCheck([cell({ evidence: bad })], 'evidence-form');
    assert.equal(f.length, 1, bad);
  }
  assert.equal(badEvidence('DOC-12; as discussed; DOC-13'), 'as discussed');
  assert.equal(evidenceForm('https://example.com/x'), true);
  assert.equal(evidenceForm('x'), false);
  assert.equal(ruleById('evidence-form').severity, 'info');
  assert.deepEqual(ofCheck([cell({ evidence: '' })], 'evidence-form'), []);
});

test('red-flag-raised: a yes is a warning for its row, listed for its vendor, with the note; no and empty are not', () => {
  const rows = [...clean(), cell({ vendor: BETA, criterion: 'Integration', weight: '1', score: '2', red_flag: 'yes', note: 'Key held by one person', evidence: 'DOC-2' }), cell({ vendor: BETA, criterion: 'Support', weight: '1', score: '2', red_flag: 'YES', evidence: 'DOC-3' })];
  const f = ofCheck(rows, 'red-flag-raised');
  assert.equal(f.length, 2);
  assert.match(f[0].message, /^The vendor "Vendor Beta" has a red flag for the criterion "Integration" in row 5\. Note: "Key held by one person"\.$/);
  assert.doesNotMatch(f[1].message, /Note:/);
  const beta = runOf(rows).ranking.find((v) => v.vendor === BETA);
  assert.equal(beta.redFlags, 2);
  assert.deepEqual(beta.redFlagCriteria, ['Integration', 'Support']);
  assert.equal(runOf(rows).ranking.find((v) => v.vendor === ALPHA).redFlags, 0);
  assert.deepEqual(ofCheck(clean(), 'red-flag-raised'), []);
  assert.equal(runOf([cell({ red_flag: 'yes' })]).ranking[0].score, '4.00', 'a red flag does not change a score');
});

test('coverage-low: a vendor scored on less than the minimum of the total weight, with 80 percent itself passing', () => {
  const crit = (name, weight) => cell({ criterion: name, weight, score: '3', evidence: 'DOC-1' });
  const full = [crit('One', '4'), crit('Two', '1')];
  const rowsWith = (scored) => [...full.map((c) => ({ ...c, vendor: BETA })), ...full.map((c) => ({ ...c, vendor: ALPHA, score: scored.includes(c.criterion) ? '3' : '' }))];
  assert.deepEqual(ofCheck(rowsWith(['One', 'Two']), 'coverage-low'), []);
  assert.deepEqual(ofCheck(rowsWith(['One']), 'coverage-low'), [], 'exactly 80 percent is not below 80');
  const low = ofCheck(rowsWith(['Two']), 'coverage-low');
  assert.equal(low.length, 1);
  assert.match(low[0].message, /^The coverage of the vendor "Vendor Alpha" is 20\.0 percent of the total weight, below the minimum of 80 percent\. Its weighted score rests on 1 of 2 criteria\.$/);
  assert.deepEqual(ofCheck(rowsWith(['Two']), 'coverage-low', null, { minCoverage: '20' }), []);
  assert.equal(ofCheck(rowsWith(['Two']), 'coverage-low', null, { minCoverage: '20.1' }).length, 1);
  assert.deepEqual(ofCheck(rowsWith([]), 'coverage-low', null, { minCoverage: '0' }), [], 'a minimum of 0 never reports');
  assert.equal(ofCheck(rowsWith(['One']), 'coverage-low', null, { minCoverage: '100' }).length, 1);
});

test('tie-too-close: neighbours in the ranking that differ by less than the margin, compared exactly, and the margin itself passes', () => {
  const two = (a, b) => [cell({ vendor: ALPHA, score: a }), cell({ vendor: BETA, score: b })];
  assert.equal(ofCheck(two('4', '3.9'), 'tie-too-close').length, 0, 'exactly 0.10 apart is not less than 0.10');
  assert.equal(ofCheck(two('4', '3.91'), 'tie-too-close').length, 1);
  const f = ofCheck(two('4', '3.95'), 'tie-too-close');
  assert.match(f[0].message, /^The vendors "Vendor Alpha" \(4\.00\) and "Vendor Beta" \(3\.95\) are next to each other in the ranking and differ by less than the tie margin of 0\.1; the order between them is too close to call\.$/);
  assert.equal(ofCheck(two('4', '4'), 'tie-too-close').length, 1, 'equal scores are a tie');
  assert.equal(ofCheck(two('4', '3.5'), 'tie-too-close').length, 0);
  assert.equal(ofCheck(two('4', '3.5'), 'tie-too-close', null, { tieMargin: '0.5' }).length, 0, 'exactly the margin');
  assert.equal(ofCheck(two('4', '3.51'), 'tie-too-close', null, { tieMargin: '0.5' }).length, 1);
  assert.equal(ofCheck(two('4', '4'), 'tie-too-close', null, { tieMargin: '0' }).length, 0, 'a margin of 0 turns the check off');
  assert.equal(ofCheck(two('4', '3.999999999999999999'), 'tie-too-close', null, { tieMargin: '0.000000000000000002' }).length, 1, 'a difference a double would lose');
  const three = [cell({ vendor: ALPHA, score: '4' }), cell({ vendor: BETA, score: '3.92' }), cell({ vendor: GAMMA, score: '3.84' })];
  assert.equal(ofCheck(three, 'tie-too-close').length, 2, 'each pair of neighbours; Alpha and Gamma are 0.16 apart');
  assert.equal(ofCheck([cell({ vendor: ALPHA, score: '4' }), cell({ vendor: BETA, score: '' })], 'tie-too-close').length, 0, 'a vendor with no score is not compared');
});

test('the checks of a row are found by their line, with a quoted line end before them', () => {
  const text = table([cell(), cell({ vendor: BETA, score: 'high' })]).replace('Vendor Alpha', '"Vendor\nAlpha"');
  const f = ofCheck(text, 'score-invalid');
  assert.equal(f[0].line, lineOf(text, 'high'));
  assert.equal(f[0].column, text.split('\n')[lineOf(text, 'high') - 1].indexOf('high') + 1);
});

test('every check has an id, a level, a kind, what it looks at, a fix, why it exists and what it cannot see; ids are unique; decide counts the levels', () => {
  assert.equal(RULES.length, 22);
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length);
  for (const r of RULES) {
    assert.match(r.id, /^[a-z]+(?:-[a-z]+)*$/);
    assert.ok(['info', 'warning', 'error'].includes(r.severity), r.id);
    assert.ok(['file', 'row', 'across rows'].includes(r.kind), r.id);
    for (const key of ['summary', 'fix', 'own', 'cannot']) assert.ok(r[key].length > 20, `${r.id} ${key}`);
    assert.ok(r.own.includes('is a best practice of this tool; no standard sets it'), r.id);
    assert.equal(ruleById(r.id), r);
  }
  assert.equal(ruleById('nope'), undefined);
  assert.equal(atOrAbove('warning', 'error'), false);
  assert.equal(atOrAbove('error', 'warning'), true);
  assert.deepEqual(decide({ error: 0, warning: 2, info: 1 }, 'error'), { pass: true, failOn: 'error', text: 'PASS - no finding at or above error (2 warning, 1 info)' });
  assert.deepEqual(decide({ error: 1, warning: 0, info: 0 }, 'error'), { pass: false, failOn: 'error', text: 'FAIL - 1 finding at or above error (1 error)' });
  assert.equal(decide({ error: 0, warning: 2, info: 0 }, 'warning').pass, false);
  assert.equal(decide({ error: 0, warning: 0, info: 3 }, 'warning').pass, true);
  assert.equal(decide({ error: 0, warning: 0, info: 3 }, 'info').text, 'FAIL - 3 findings at or above info (3 info)');
  assert.equal(decide({ error: 0, warning: 0, info: 0 }, 'info').text, 'PASS - no finding at or above info');
});
