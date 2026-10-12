import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_LIMITS, FINDING_CAP, badEvidence, checkText, readOptions } from '../src/index.js';
import { allowed, cli, table, withFiles } from './helpers.js';

// Each test builds input meant to make the tool slow or to exhaust the stack or the memory, and checks that it ends with an
// answer in good time. The time allowed is four times as long under coverage (NODE_V8_COVERAGE is set only when coverage
// is on).

function timed(fn) {
  const start = process.hrtime.bigint();
  const value = fn();
  return { value, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

const HEADER = 'vendor,criterion,weight,score,evidence,red_flag,note';
const line = (vendor, criterion, weight, score, evidence = 'DOC-1', flag = '') => `${vendor},${criterion},${weight},${score},${evidence},${flag},`;
const sheet = (rows, criteria = null) => checkText(`${HEADER}\n${rows.join('\n')}\n`, criteria);

test('a hundred thousand rows, a thousand vendors on a hundred criteria: ranked in good time, with the sums exact', () => {
  const rows = [];
  for (let v = 0; v < 1000; v += 1) for (let c = 0; c < 100; c += 1) rows.push(line(`V${v}`, `C${c}`, '1', String(1 + ((v + c) % 5))));
  const { value, ms } = timed(() => sheet(rows));
  assert.equal(value.summary.rows, 100000);
  assert.equal(value.ranking.length, 1000);
  assert.ok(value.ranking.every((v) => v.coverage === '100.0' && v.unscored === 0));
  assert.deepEqual(value.findings.filter((f) => f.id !== 'tie-too-close'), []);
  assert.ok(ms < allowed(30000), `took ${ms} ms`);
});

test('a hundred thousand vendors on one criterion that all score the same: one rank, and the ties are listed up to the cap and counted', () => {
  const rows = Array.from({ length: 100000 }, (_, i) => line(`V${i}`, 'C', '1', '3'));
  const { value, ms } = timed(() => sheet(rows));
  assert.equal(value.ranking.length, 100000);
  assert.ok(value.ranking.every((v) => v.rank === 1));
  assert.equal(value.findings.filter((f) => f.id === 'tie-too-close').length, FINDING_CAP);
  assert.equal(value.omitted.get('tie-too-close'), 99999 - FINDING_CAP);
  assert.ok(ms < allowed(30000), `took ${ms} ms`);
});

test('a hundred thousand criteria for one vendor, and the same with a criteria file that lists them all', () => {
  const rows = Array.from({ length: 100000 }, (_, i) => line('V', `C${i}`, String(1 + (i % 9)), String(i % 6 === 5 ? 5 : i % 6)));
  const one = timed(() => sheet(rows));
  assert.equal(one.value.ranking.length, 1);
  assert.equal(one.value.ranking[0].scored, 100000);
  assert.ok(one.ms < allowed(30000), `took ${one.ms} ms`);
  const criteria = `criterion,weight,required\n${Array.from({ length: 100000 }, (_, i) => `C${i},${1 + (i % 9)},${i % 2 ? 'yes' : 'no'}`).join('\n')}\n`;
  const withFile = timed(() => sheet(rows, criteria));
  assert.deepEqual(withFile.value.findings, []);
  assert.equal(withFile.value.ranking[0].score, one.value.ranking[0].score);
  assert.ok(withFile.ms < allowed(30000), `took ${withFile.ms} ms`);
});

test('a sparse scorecard of a hundred thousand vendors and a hundred thousand criteria, one row each: the missing pairs are counted, not walked', () => {
  const n = 100000;
  const rows = Array.from({ length: n }, (_, i) => line(`V${i}`, `C${i}`, '1', '3'));
  const { value, ms } = timed(() => sheet(rows));
  assert.equal(value.findings.filter((f) => f.id === 'vendor-misses-criterion').length, FINDING_CAP);
  assert.equal(value.omitted.get('vendor-misses-criterion'), n * (n - 1) - FINDING_CAP);
  assert.equal(value.findings.filter((f) => f.id === 'coverage-low').length, FINDING_CAP);
  assert.ok(ms < allowed(30000), `took ${ms} ms`);
  const required = `criterion,weight,required\n${Array.from({ length: n }, (_, i) => `C${i},1,yes`).join('\n')}\n`;
  const strict = timed(() => sheet(rows, required));
  assert.equal(strict.value.omitted.get('required-unscored'), n * (n - 1) - FINDING_CAP);
  assert.ok(strict.ms < allowed(30000), `took ${strict.ms} ms`);
});

test('a hundred thousand rows with the same mistake: the first of each check are listed, the rest counted, in good time', () => {
  const rows = Array.from({ length: 100000 }, (_, i) => line(`V${i}`, 'C', '1', 'high', ''));
  const { value, ms } = timed(() => sheet(rows));
  assert.equal(value.findings.filter((f) => f.id === 'score-invalid').length, FINDING_CAP);
  assert.equal(value.omitted.get('score-invalid'), 100000 - FINDING_CAP);
  assert.ok(ms < allowed(30000), `took ${ms} ms`);
});

test('numbers of thousands of digits are refused as scores and weights, not parsed, and a number of forty digits is read exactly', () => {
  const huge = '9'.repeat(5000);
  const { value, ms } = timed(() => sheet([line('V', 'C', huge, '1'), line('V', 'D', '1', huge), line('V', 'E', '1', `0.${'1'.repeat(5000)}`), line('V', 'F', `0.${'1'.repeat(5000)}`, '1')]));
  assert.equal(value.findings.filter((f) => f.id === 'weight-not-positive').length, 2);
  assert.equal(value.findings.filter((f) => f.id === 'score-invalid').length, 2);
  assert.ok(ms < allowed(5000), `took ${ms} ms`);
  const ok = sheet([line('V', 'C', `${'9'.repeat(40)}`, '5'), line('V', 'D', `0.${'0'.repeat(39)}1`, '0')]);
  assert.deepEqual(ok.findings.filter((f) => f.id !== 'evidence-form'), []);
  assert.equal(ok.ranking[0].score, '5.00', 'the second weight is a hair beside the first and the score stays 5');
  assert.equal(ok.ranking[0].coverage, '100.0');
});

test('sums with the most digits the readers allow, over a hundred thousand rows, stay exact and quick', () => {
  const weight = `${'7'.repeat(40)}.${'3'.repeat(40)}`;
  const rows = Array.from({ length: 100000 }, (_, i) => line('V', `C${i}`, weight, `4.${'1'.repeat(40)}`));
  const { value, ms } = timed(() => sheet(rows));
  assert.equal(value.ranking[0].score, '4.11');
  assert.equal(value.ranking[0].coverage, '100.0');
  assert.ok(ms < allowed(30000), `took ${ms} ms`);
});

test('cells of the longest length, and cells past it', () => {
  const long = 'a'.repeat(CSV_LIMITS.maxCellLength);
  const fine = timed(() => sheet([line(long, 'C', '1', '3'), line('V2', long, '1', '3')]));
  assert.equal(fine.value.ranking.length, 2);
  assert.ok(fine.value.ranking[0].vendor.length <= 120, 'a vendor is cut to a readable length in the ranking');
  assert.ok(fine.value.findings.every((f) => f.message.length < 1000));
  assert.ok(fine.ms < allowed(5000), `took ${fine.ms} ms`);
  const over = timed(() => checkText(`${HEADER}\n${line('a'.repeat(CSV_LIMITS.maxCellLength + 1), 'C', '1', '3')}\n`));
  assert.deepEqual(over.value.findings.map((f) => f.id), ['file-unreadable']);
  assert.match(over.value.findings[0].message, /A cell is longer than 20000 characters/);
  const million = timed(() => checkText(`${HEADER}\nV,${'x'.repeat(1000000)},1,3\n`));
  assert.deepEqual(million.value.findings.map((f) => f.id), ['file-unreadable']);
  assert.ok(million.ms < allowed(5000), `took ${million.ms} ms`);
});

test('a row of a million commas, a header of a million columns and a million quotes end with an answer, not a hang', () => {
  const commas = timed(() => checkText(`${HEADER}\nV${','.repeat(1000000)}\n`));
  assert.deepEqual(commas.value.findings.map((f) => f.id), ['file-unreadable']);
  assert.match(commas.value.findings[0].message, /A row has more than 200 cells/);
  assert.ok(commas.ms < allowed(5000), `took ${commas.ms} ms`);
  const header = timed(() => checkText(`${'v,'.repeat(1000000)}\n1\n`));
  assert.deepEqual(header.value.findings.map((f) => f.id), ['file-unreadable']);
  assert.ok(header.ms < allowed(5000), `took ${header.ms} ms`);
  const quotes = timed(() => checkText(`${HEADER}\n"${'"'.repeat(1000000)}\n`));
  assert.deepEqual(quotes.value.findings.map((f) => f.id), ['file-unreadable']);
  assert.ok(quotes.ms < allowed(5000), `took ${quotes.ms} ms`);
  const pairs = timed(() => checkText(`${HEADER}\n"${'""'.repeat(5000)}",C,1,3,DOC-1,,\n`));
  assert.equal(pairs.value.ranking.length, 1, 'doubled quotes inside a quoted cell are quotes');
  assert.ok(pairs.ms < allowed(5000), `took ${pairs.ms} ms`);
  const lines = timed(() => checkText(`${HEADER}\n${'\n'.repeat(1000000)}`));
  assert.deepEqual(lines.value.findings.map((f) => f.id), ['file-unreadable']);
});

test('evidence of the longest length, with many pieces, and cells that look like the start of an address, are looked at in linear time', () => {
  const cases = ['h'.repeat(20000), `https://${'a'.repeat(19990)}`, `https://${'a.'.repeat(9990)}`, `DOC-${'1'.repeat(19990)}`, 'DOC-1;'.repeat(3000), `${'a;'.repeat(9990)}`, `https://example.com/${'/'.repeat(19970)}`, `https://${'-'.repeat(19990)}`];
  const { ms } = timed(() => {
    for (const text of cases) badEvidence(text);
  });
  assert.ok(ms < allowed(3000), `took ${ms} ms`);
  const rows = cases.map((c, i) => line('V', `C${i}`, '1', '3', `"${c}"`));
  const run = timed(() => sheet(rows));
  assert.ok(run.value.findings.filter((f) => f.id === 'evidence-form').length >= 4);
  assert.ok(run.ms < allowed(5000), `took ${run.ms} ms`);
});

test('more rows than the limit are left out with a note, and the first rows are still read', () => {
  const rows = Array.from({ length: 12 }, (_, i) => line(`V${i}`, 'C', '1', String(i % 6)));
  const r = checkText(`${HEADER}\n${rows.join('\n')}\n`, null, { limits: { ...CSV_LIMITS, maxRows: 5 }, options: readOptions() });
  assert.equal(r.summary.rows, 5);
  assert.ok(r.notes.some((n) => /more than 5 rows; the tool read the first 5/.test(n)));
});

test('a vendor name or a note of a thousand lines in quotes is one cell, and the lines of later rows are counted right', () => {
  const name = `"${'line\n'.repeat(1000)}end"`;
  const text = `${HEADER}\n${line(name, 'C', '1', '3')}\n${line('V2', 'C', '1', 'high')}\n`;
  const r = checkText(text);
  const f = r.findings.find((x) => x.id === 'score-invalid');
  assert.equal(f.line, text.split('\n').length - 1);
});

test('a file of a hundred thousand rows is read from disk through the command line in good time, with an exit code', async () => {
  const rows = Array.from({ length: 100000 }, (_, i) => line(`V${i % 500}`, `C${Math.floor(i / 500)}`, '1', String(i % 6)));
  await withFiles({ 'scores.csv': `${HEADER}\n${rows.join('\n')}\n` }, async (dir) => {
    const start = process.hrtime.bigint();
    const r = await cli(['scores.csv', '--format', 'json'], dir);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    assert.ok(r.code === 0 || r.code === 1);
    assert.equal(JSON.parse(r.out).scorecard.rows, 100000);
    assert.ok(ms < allowed(40000), `took ${ms} ms`);
  });
  assert.equal(table([]).split('\n').length, 2);
});
