import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from '../src/index.js';
import { BAD, EXPECTED, EXPLAIN, GOOD, GOOD_ALONE, GOOD_EXPECTED, UNWANTED, run } from '../tools/example.mjs';
import { cli, withFiles } from './helpers.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');
const BAD_FILE = 'examples/bad/scores.csv';
const BAD_CRITERIA = 'examples/bad/criteria.csv';
const GOOD_FILE = 'examples/good/scores.csv';
const GOOD_CRITERIA = 'examples/good/criteria.csv';

test('examples: the bad scorecard fails with the report that is saved in examples/output', async () => {
  const r = await run(BAD);
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('bad.txt'));
  for (const e of EXPECTED) assert.ok(r.out.includes(e), e);
  for (const u of UNWANTED) assert.ok(!r.out.includes(u), u);
});

test('examples: the good scorecard passes at error, warning and info level with the report that is saved, with and without the criteria file', async () => {
  const r = await run(GOOD);
  assert.equal(r.code, 0);
  assert.equal(r.out, await saved('good.txt'));
  for (const e of GOOD_EXPECTED) assert.ok(r.out.includes(e), e);
  assert.equal((await run([...GOOD, '--fail-on', 'warning'])).code, 0);
  assert.equal((await run([...GOOD, '--fail-on', 'info'])).code, 0);
  assert.doesNotMatch(r.out, /ERROR {4}|WARNING {2}|INFO {5}/);
  assert.doesNotMatch(r.out, /\nnote: /);
  const alone = await run([...GOOD_ALONE, '--fail-on', 'info']);
  assert.equal(alone.code, 0, alone.out);
  assert.match(alone.out, /\nfindings: 0\n/);
});

test('examples: every output saved in examples/output is the real output, in all four formats for both scorecards', async () => {
  const outputs = {
    'bad.txt': BAD,
    'bad.md': [...BAD, '--format', 'markdown'],
    'bad.json': [...BAD, '--json'],
    'bad.sarif': [...BAD, '--format', 'sarif'],
    'good.txt': GOOD,
    'good.md': [...GOOD, '--format', 'markdown'],
    'good.json': [...GOOD, '--json'],
    'good.sarif': [...GOOD, '--format', 'sarif'],
    'checks.txt': ['--list-checks'],
    'checks.md': ['--list-checks', '--format', 'markdown'],
    'checks.json': ['--list-checks', '--format', 'json'],
    'explain-tie-too-close.txt': EXPLAIN,
    'explain-tie-too-close.md': [...EXPLAIN, '--format', 'markdown']
  };
  for (const [name, args] of Object.entries(outputs)) assert.equal((await run(args)).out, await saved(name), name);
});

test('examples: the ranking of the good scorecard is the one worked out by hand, with exact arithmetic', async () => {
  const good = JSON.parse(await saved('good.json'));
  assert.deepEqual(good.ranking.map((v) => [v.rank, v.vendor, v.score, v.coverage, v.redFlags, v.unscored]), [
    [1, 'Vendor Alpha', '4.23', '100.0', 0, 0],
    [2, 'Vendor Beta', '3.85', '100.0', 0, 0],
    [3, 'Vendor Gamma', '3.57', '100.0', 0, 0],
    [4, 'Vendor Delta', '2.78', '100.0', 0, 0]
  ]);
  assert.deepEqual(good.findings, []);
  assert.deepEqual(good.notes, []);
  assert.equal(good.scorecard.totalWeight, '15');
  // Vendor Alpha: (3 * 5 + 2.5 * 4 + 3 * 4.5 + 2 * 4 + 1.5 * 4 + 1 * 3 + 2 * 4) / 15 = 63.5 / 15.
  assert.equal(good.ranking[0].score, '4.23');
});

test('examples: every check but file-unreadable fires on the bad scorecard, each on the line built for it', async () => {
  const report = JSON.parse((await run([...BAD, '--json'])).out);
  const scores = (await readFile(resolve(root, BAD_FILE), 'utf8')).split('\n');
  const criteria = (await readFile(resolve(root, BAD_CRITERIA), 'utf8')).split('\n');
  // The place of the n-th line of a file that holds needle.
  const at = (lines, file, needle, n = 1) => {
    let seen = 0;
    for (let i = 0; i < lines.length; i += 1) if (lines[i].includes(needle) && (seen += 1) === n) return `${file}:${i + 1}`;
    throw new Error(`${needle} x${n}`);
  };
  const inScores = (needle, n) => at(scores, BAD_FILE, needle, n);
  const inCriteria = (needle, n) => at(criteria, BAD_CRITERIA, needle, n);
  const where = (id) => report.findings.filter((f) => f.id === id).map((f) => f.at);
  assert.deepEqual(RULES.map((r) => r.id).filter((id) => where(id).length === 0), ['file-unreadable']);
  assert.deepEqual(where('column-missing'), [`${BAD_CRITERIA}:1`]);
  assert.deepEqual(where('column-unknown'), [`${BAD_FILE}:1`]);
  assert.deepEqual(where('column-duplicate'), [`${BAD_FILE}:1`]);
  assert.deepEqual(where('row-malformed'), [inScores('Vendor Delta,Integration,2,3')]);
  assert.deepEqual(where('secret-in-file'), [inScores('lantern')]);
  assert.deepEqual(where('cell-incomplete'), [inScores(',Integration,2,3,')]);
  assert.deepEqual(where('duplicate-pair'), [inScores('integration-two')]);
  assert.deepEqual(where('weight-not-positive'), [inScores('Pricing clarity,0,')]);
  assert.deepEqual(where('weight-differs'), [inScores('Vendor Beta,References,2,')]);
  assert.deepEqual(where('score-invalid'), [inScores('Integration,2,7,')]);
  assert.deepEqual(where('yes-no-unreadable'), [inCriteria('References,maybe'), inScores('maybe')]);
  assert.deepEqual(where('criterion-not-in-criteria'), [inScores('Roadmap fit')]);
  assert.deepEqual(where('criterion-unscored'), [inScores('Vendor Beta,Integration,2,,')]);
  assert.deepEqual(where('required-unscored'), [inScores('Vendor Gamma,Chain experience'), inScores('Vendor Delta,Chain experience,3,,')]);
  assert.deepEqual(where('vendor-misses-criterion'), [inScores('Vendor Gamma,Chain experience'), ...['Integration', 'References', 'Support after launch'].map(() => inScores('Vendor Delta,Chain experience'))]);
  assert.deepEqual(where('criterion-never-scored'), [inCriteria('Token design')]);
  assert.deepEqual(where('evidence-missing'), [inScores('Vendor Beta,Published audits')]);
  assert.deepEqual(where('evidence-form'), [inScores('as discussed on the call')]);
  assert.deepEqual(where('red-flag-raised'), [inScores('Signing key held')]);
  assert.deepEqual(where('coverage-low'), [inScores('Vendor Gamma,Chain experience'), inScores('Vendor Delta,Chain experience')]);
  assert.deepEqual(where('tie-too-close'), [inScores('Vendor Alpha,Chain experience')]);
});

test('examples: a vendor with a red flag is counted in the ranking table and listed by name', async () => {
  const bad = JSON.parse(await saved('bad.json'));
  assert.deepEqual(bad.ranking.map((v) => [v.vendor, v.rank, v.redFlags]), [['Vendor Alpha', 1, 1], ['Vendor Beta', 2, 0], ['Vendor Gamma', 3, 0], ['Vendor Delta', 4, 0]]);
  assert.deepEqual(bad.ranking[0].redFlagCriteria, ['Security practice']);
  assert.match(await saved('bad.txt'), /\nRed flags by vendor \(1\)\n\n {2}Vendor Alpha: 1 red flag, for Security practice\n/);
});

test('examples: the ranking changes with the options and not with the order of the rows', async () => {
  const text = await readFile(resolve(root, GOOD_FILE), 'utf8');
  const lines = text.trimEnd().split('\n');
  const reversed = [lines[0], ...lines.slice(1).reverse()].join('\n') + '\n';
  await withFiles({ 'scores.csv': reversed }, async (dir) => {
    const r = JSON.parse((await cli(['scores.csv', '--json'], dir)).out);
    assert.deepEqual(r.ranking.map((v) => [v.rank, v.vendor, v.score]), [[1, 'Vendor Alpha', '4.23'], [2, 'Vendor Beta', '3.85'], [3, 'Vendor Gamma', '3.57'], [4, 'Vendor Delta', '2.78']]);
  });
  const wide = await run([...GOOD, '--tie-margin', '0.5']);
  assert.equal(wide.code, 0);
  assert.match(wide.out, /findings: 2 \(2 info\)/);
});

test('examples: the files are plain ASCII with LF line ends, with no key, no date and no number that reads like a year', async () => {
  for (const file of [BAD_FILE, BAD_CRITERIA, GOOD_FILE, GOOD_CRITERIA]) {
    const text = await readFile(resolve(root, file), 'utf8');
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), file);
    assert.ok(!text.includes('\r'), file);
    assert.doesNotMatch(text, /\b(?:19|20)\d{2}\b/, file);
    assert.doesNotMatch(text, /\b\d{4}-\d{2}-\d{2}\b/, file);
    assert.ok(text.endsWith('\n'), file);
  }
  assert.doesNotMatch(await readFile(resolve(root, GOOD_FILE), 'utf8'), /lantern/);
});

test('examples: only made-up vendors are named, and every link is on example.com', async () => {
  for (const file of [BAD_FILE, GOOD_FILE]) {
    const text = await readFile(resolve(root, file), 'utf8');
    const vendors = new Set(text.split('\n').slice(1).map((l) => l.split(',')[0]).filter(Boolean));
    for (const v of vendors) assert.match(v, /^Vendor (?:Alpha|Beta|Gamma|Delta)$/, v);
    for (const m of text.matchAll(/https?:\/\/[^,\s]+/g)) assert.match(m[0], /^https:\/\/example\.com\//, m[0]);
  }
});

test('examples: the good scorecard has four vendors, seven criteria and a score, a link or a reference and a flag on every row', async () => {
  const good = JSON.parse(await saved('good.json'));
  assert.equal(good.scorecard.vendors, 4);
  assert.equal(good.scorecard.criteria, 7);
  assert.equal(good.scorecard.rows, 28);
  const rows = (await readFile(resolve(root, GOOD_FILE), 'utf8')).trimEnd().split('\n').slice(1).map((l) => l.split(','));
  assert.ok(rows.every((c) => c[3] !== '' && c[4] !== ''));
  assert.ok(rows.some((c) => /^DOC-\d+$/.test(c[4])), 'a document reference is used too');
  assert.ok(rows.every((c) => c[5] !== 'yes'));
});
