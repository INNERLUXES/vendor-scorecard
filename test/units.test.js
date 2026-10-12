import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, buildReport, checkText, explainJson, explainMarkdown, explainText, listChecksJson, listChecksMarkdown, listChecksText, toJson, toMarkdown, toSarif, toText, BEST, CRITERIA_COLUMN_NAMES, CRITERIA_COLUMNS, CRITERIA_NEEDED, COLUMNS, COLUMN_NAMES, DEFAULTS, FINDING_CAP, KINDS, LEVELS, MAX_SCORE, NEEDED, PLACEHOLDERS, checkAcross, cellAt, createCollector, editDistance, flat, grouped, isPlaceholder, list, listText, nameKey, nearest, normalizeName, plural, readOptions, readScorecard, readTable, readThreshold, safeText, show } from '../src/index.js';
import { table, cell, clean } from './helpers.js';

test('grouped, plural and listText: numbers and lists as the reports show them, with the locale fixed', () => {
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(plural(1, 'vendor'), '1 vendor');
  assert.equal(plural(2, 'vendor'), '2 vendors');
  assert.equal(plural(2, 'criterion', 'criteria'), '2 criteria');
  assert.equal(plural(1000, 'row'), '1,000 rows');
  assert.equal(listText([]), '');
  assert.equal(listText(['a']), 'a');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(listText(['a', 'b', 'c']), 'a, b and c');
  assert.equal(listText(['a', 'b', 'c', 'd', 'e'], 3), 'a, b, c and 2 more');
  assert.equal(list(['x', 'y', 'z']), 'x, y and z');
  assert.equal(list(['x']), 'x');
});

test('safeText and flat: control, direction and line separator characters are replaced and the length is capped', () => {
  const esc = String.fromCharCode(27);
  assert.equal(safeText(`a${esc}[2Jb`, 50), 'a [2Jb');
  assert.equal(safeText('a'.repeat(400), 300).length, 300);
  assert.ok(safeText('a'.repeat(400), 300).endsWith('...'));
  assert.equal(safeText(`x${String.fromCharCode(0x202e)}y`), 'x y');
  assert.equal(safeText(`x${String.fromCharCode(0x2028)}y`), 'x y');
  assert.equal(flat('  a \n\t b  '), 'a b');
  assert.equal(show('a\nb'), 'a b');
});

test('the columns: seven of the scores file and four of the criteria file, found by name with case and separators ignored', () => {
  assert.deepEqual(COLUMN_NAMES, ['vendor', 'criterion', 'weight', 'score', 'evidence', 'red_flag', 'note']);
  assert.deepEqual(CRITERIA_COLUMN_NAMES, ['criterion', 'weight', 'required', 'description']);
  assert.equal(COLUMNS.length, 7);
  assert.equal(CRITERIA_COLUMNS.length, 4);
  assert.ok(COLUMNS.every((c) => c.summary.length > 10));
  assert.deepEqual(NEEDED, ['vendor', 'criterion', 'score']);
  assert.deepEqual(CRITERIA_NEEDED, ['criterion']);
  assert.equal(normalizeName(' Red-Flag '), 'red_flag');
  assert.equal(normalizeName('RED FLAG'), 'red_flag');
  assert.equal(normalizeName('__vendor__'), 'vendor');
  assert.equal(normalizeName('   '), '');
});

test('editDistance and nearest: a misspelt name is matched within two edits, and a far name is not', () => {
  assert.equal(editDistance('evidance', 'evidence'), 1);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(nearest('evidance', COLUMN_NAMES), 'evidence');
  assert.equal(nearest('scor', COLUMN_NAMES), 'score');
  assert.equal(nearest('status', COLUMN_NAMES), null);
});

test('the data of every report: three levels, three kinds, the defaults of the thresholds and the highest score', () => {
  assert.deepEqual(LEVELS, ['info', 'warning', 'error']);
  assert.deepEqual(KINDS, ['file', 'row', 'across rows']);
  assert.deepEqual(DEFAULTS, { evidenceAbove: '3', minCoverage: '80', tieMargin: '0.1' });
  assert.equal(MAX_SCORE, '5');
  assert.equal(BEST, 'a best practice of this tool; no standard sets it');
});

test('placeholders: n/a, none, tbd and a dash say nothing, in any case, and a real word does not', () => {
  for (const p of PLACEHOLDERS) {
    assert.ok(isPlaceholder(p), p);
    assert.ok(isPlaceholder(p.toUpperCase()), p);
  }
  assert.ok(!isPlaceholder('nonesuch'));
  assert.ok(!isPlaceholder('0'));
  assert.equal(nameKey('  Vendor   ALPHA '.trim()), 'vendor alpha');
});

test('createCollector: the first findings of a check are kept, the rest are counted, and skip counts what a check did not build', () => {
  const c = createCollector();
  for (let i = 0; i < FINDING_CAP + 3; i += 1) c.add('x', { line: i + 1, column: 1 }, 'm');
  assert.equal(c.findings.length, FINDING_CAP);
  assert.equal(c.omitted.get('x'), 3);
  assert.equal(c.full('x'), true);
  assert.equal(c.full('y'), false);
  c.skip('x', 10);
  assert.equal(c.omitted.get('x'), 13);
  assert.equal(c.findings[0].file, 0, 'a finding without a file is about the scores file');
  c.add('y', { file: 1, line: 3, column: 2 }, 'm', 's');
  assert.deepEqual(c.findings.at(-1), { id: 'y', file: 1, line: 3, column: 2, message: 'm', subject: 's' });
});

test('readThreshold and readOptions: a plain number within its range, with its text kept', () => {
  assert.equal(readThreshold('evidenceAbove', '5').text, '5');
  assert.equal(readThreshold('evidenceAbove', '5.1'), null);
  assert.equal(readThreshold('minCoverage', '100').text, '100');
  assert.equal(readThreshold('minCoverage', '100.5'), null);
  assert.equal(readThreshold('tieMargin', '0').text, '0');
  assert.equal(readThreshold('tieMargin', '-0.1'), null);
  assert.equal(readThreshold('tieMargin', '0.1').scale, 1);
  assert.equal(readOptions({ minCoverage: '50' }).minCoverage.text, '50');
});

test('readScorecard and checkAcross: called on tables directly they give the model, the summary and the ranking', () => {
  const scores = readTable(table([...clean(), cell({ vendor: 'Vendor Beta', criterion: 'Integration', weight: '1', score: '' })]));
  scores.secretColumns = new Set();
  const collector = createCollector();
  const { model, summary } = readScorecard(scores, null, collector.add, collector.notes, readOptions());
  assert.equal(model.vendors.size, 2);
  assert.equal(model.criteria.size, 3);
  assert.equal(summary.read, 5);
  assert.equal(summary.skipped, 0);
  const across = checkAcross(model, readOptions(), collector);
  assert.deepEqual(across.ranking.map((v) => [v.vendor, v.score]), [['Vendor Alpha', '3.80'], ['Vendor Beta', '2.80']]);
  assert.equal(across.criteria, 3);
  assert.ok(collector.findings.some((f) => f.id === 'vendor-misses-criterion' && f.subject === 'Vendor Alpha / Integration'));
  assert.ok(collector.findings.some((f) => f.id === 'criterion-unscored'));
  assert.deepEqual(cellAt(scores.rows[0], 1), { line: 2, column: 14 });
});

test('the report writers can be called on a report object: text, markdown, JSON, SARIF, the list of checks and an explanation', () => {
  const checked = checkText(table(clean()));
  const report = buildReport({ files: [{ file: 'scores.csv', format: 'CSV', bytes: 10, lines: 5 }], checked, version: '1.2.3' });
  assert.ok(toText(report).startsWith('vendor-scorecard: scores.csv\n'));
  assert.ok(toMarkdown(report).startsWith('# vendor-scorecard: scores.csv\n'));
  assert.equal(JSON.parse(toJson(report)).version, '1.2.3');
  assert.equal(JSON.parse(toSarif(report)).runs[0].tool.driver.version, '1.2.3');
  assert.ok(listChecksText().includes('tie-too-close'));
  assert.ok(listChecksMarkdown().includes('| tie-too-close | info | across rows |'));
  assert.equal(JSON.parse(listChecksJson()).length, 22);
  assert.ok(explainText(RULES[0]).startsWith('file-unreadable\n'));
  assert.ok(explainMarkdown(RULES[0]).startsWith('# file-unreadable\n'));
  assert.equal(JSON.parse(explainJson(RULES[0])).id, 'file-unreadable');
});
