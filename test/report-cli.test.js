import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { COLUMN_NAMES, DEFAULTS, FINDING_CAP, RULES, USAGE, VERSION, buildReport, checkText, createCollector, parseArgs, readOptions, show } from '../src/index.js';
import { ALPHA, ARGS, BAD, BETA, GAMMA, GOOD, cell, cli, clean, criteriaFile, run, table, withFiles } from './helpers.js';

const json = async (files, args) => JSON.parse((await run(files, [...ARGS, '--json', ...args])).out);

test('exit codes: 0 for a pass, 1 for a finding at or above --fail-on, 2 for a usage or input error', async () => {
  assert.equal((await run(GOOD, ARGS)).code, 0);
  assert.equal((await run(BAD, ARGS)).code, 1);
  assert.equal((await run(GOOD, ['nope.csv'])).code, 2);
  assert.equal((await run(GOOD, [])).code, 2);
  const warn = { 'scores.csv': table([cell({ score: '4', evidence: '' })]) };
  assert.equal((await run(warn, ARGS)).code, 0, 'a warning does not fail the default run');
  assert.equal((await run(warn, [...ARGS, '--fail-on', 'warning'])).code, 1);
  assert.equal((await run(warn, [...ARGS, '--fail-on', 'info'])).code, 1);
  assert.equal((await run(GOOD, [...ARGS, '--fail-on', 'info'])).code, 0);
});

test('--min-severity hides findings below the level but they still count for the result and are counted in the totals', async () => {
  const files = { 'scores.csv': table([cell({ evidence: '' }), cell({ criterion: 'Published audits', weight: '2', evidence: 'as discussed' }), cell({ vendor: BETA, score: 'x' })]) };
  const all = await json(files, []);
  const errors = await json(files, ['--min-severity', 'error']);
  assert.ok(all.totals.findings > errors.totals.findings);
  assert.equal(errors.findings.every((f) => f.severity === 'error'), true);
  assert.equal(errors.totals.hidden, all.totals.findings - errors.totals.findings);
  const text = (await run(files, [...ARGS, '--min-severity', 'error', '--fail-on', 'warning'])).out;
  assert.match(text, /below error not shown/);
  assert.match(text, /RESULT: FAIL/);
});

test('--list-checks: text, markdown and JSON, with every check, and no SARIF form', async () => {
  const text = (await cli(['--list-checks'], process.cwd())).out;
  for (const r of RULES) assert.ok(text.includes(r.id), r.id);
  assert.match(text, /a best practice of this tool; no standard sets it/);
  const md = (await cli(['--list-checks', '--format', 'markdown'], process.cwd())).out;
  assert.match(md, /^# vendor-scorecard checks\n\n\| Check \| Level \| Kind \| What it looks at \|/);
  const j = JSON.parse((await cli(['--list-checks', '--json'], process.cwd())).out);
  assert.deepEqual(j.map((x) => x.id), RULES.map((r) => r.id));
  assert.ok(j.every((x) => x.cannot && x.fix && x.own));
  const sarif = await cli(['--list-checks', '--format', 'sarif'], process.cwd());
  assert.equal(sarif.code, 2);
  assert.match(sarif.err, /--list-checks has no SARIF form/);
});

test('--explain <id>: what it looks at, why, what to change, what it cannot see, in three formats; a misspelt id gets a suggestion', async () => {
  for (const r of RULES) {
    const text = await cli(['--explain', r.id], process.cwd());
    assert.equal(text.code, 0, r.id);
    assert.ok(text.out.startsWith(`${r.id}\n`), r.id);
    for (const part of ['what it looks at:', 'why it exists:', 'what to change:', 'what it cannot see:', `level: ${r.severity}`]) assert.ok(text.out.includes(part), `${r.id} ${part}`);
  }
  const md = (await cli(['--explain', 'tie-too-close', '--format', 'markdown'], process.cwd())).out;
  assert.match(md, /^# tie-too-close\n\n- Level: info\n- Kind: across rows\n\n\*\*What it looks at\.\*\*/);
  const j = JSON.parse((await cli(['--explain', 'tie-too-close', '--json'], process.cwd())).out);
  assert.equal(j.id, 'tie-too-close');
  assert.equal(j.severity, 'info');
  const typo = await cli(['--explain', 'tie-to-close'], process.cwd());
  assert.equal(typo.code, 2);
  assert.match(typo.err, /unknown check tie-to-close\. Did you mean tie-too-close\?/);
  const far = await cli(['--explain', 'completely-unrelated-words-here'], process.cwd());
  assert.doesNotMatch(far.err, /Did you mean/);
  assert.equal((await cli(['--explain', 'tie-too-close', '--format', 'sarif'], process.cwd())).code, 2);
});

test('--help, --version and the usage that follows a usage error', async () => {
  const help = await cli(['--help'], process.cwd());
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  for (const option of ['--criteria', '--format', '--json', '--min-severity', '--fail-on', '--evidence-above', '--min-coverage', '--tie-margin', '--list-checks', '--explain', '--help', '--version']) assert.ok(USAGE.includes(option), option);
  assert.equal((await cli(['--version'], process.cwd())).out, `${VERSION}\n`);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  const bad = await cli(['--nope'], process.cwd());
  assert.equal(bad.code, 2);
  assert.match(bad.err, /^vendor-scorecard: unknown argument --nope\n\nUsage: vendor-scorecard/);
});

test('parseArgs: options given twice, values that look like options, a missing value, standard input, two files and an address are refused', () => {
  const bad = (args, message) => assert.throws(() => parseArgs(args), message);
  bad(['a.csv', '--format', 'text', '--format', 'json'], /--format was given twice/);
  bad(['a.csv', '--criteria', 'b.csv', '--criteria', 'c.csv'], /--criteria was given twice/);
  bad(['a.csv', '--fail-on'], /--fail-on needs a value/);
  bad(['a.csv', '--fail-on', '--json'], /--fail-on needs a value/);
  bad(['-'], /standard input is not supported/);
  bad(['a.csv', '--criteria', '-'], /standard input is not supported/);
  bad(['a.csv', 'b.csv'], /give one scores file; a second file goes after --criteria/);
  bad([], /give the scores file/);
  bad(['https://example.com/a.csv'], /never fetches a URL/);
  bad(['a.csv', '--criteria', 'https://example.com/c.csv'], /never fetches a URL/);
  bad(['a.csv', '--format', 'pdf'], /unknown format pdf/);
  bad(['a.csv', '--json', '--format', 'text'], /ask for two formats/);
  bad(['a.csv', '--fail-no', 'error'], /unknown argument --fail-no/);
  bad(['a.csv', '--min-severity', 'high'], /unknown level high/);
  assert.equal(parseArgs(['a.csv', '--json']).format, 'json');
  assert.equal(parseArgs(['a.csv', '--json', '--format', 'json']).format, 'json');
  assert.deepEqual(parseArgs(['a.csv', '--criteria', 'c.csv']).paths, ['a.csv']);
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
  assert.equal(parseArgs(['-v']).version, true);
});

test('thresholds: plain numbers inside their range are read, anything else stops the run', () => {
  const bad = (args, message) => assert.throws(() => parseArgs(['a.csv', ...args]), message);
  bad(['--evidence-above', '5.1'], /--evidence-above: 5\.1 is not a plain number from 0 to 5/);
  bad(['--evidence-above', '-1'], /--evidence-above: -1 is not/);
  bad(['--evidence-above', '3,5'], /--evidence-above: 3,5 is not/);
  bad(['--min-coverage', '100.1'], /--min-coverage: 100\.1 is not a plain number of percent from 0 to 100/);
  bad(['--min-coverage', '80%'], /--min-coverage: 80% is not/);
  bad(['--tie-margin', '1e-1'], /--tie-margin: 1e-1 is not/);
  bad(['--tie-margin', '5.5'], /--tie-margin: 5\.5 is not/);
  for (const [args, key, value] of [[['--evidence-above', '5'], 'evidenceAbove', '5'], [['--evidence-above', '0'], 'evidenceAbove', '0'], [['--min-coverage', '100'], 'minCoverage', '100'], [['--min-coverage', '0'], 'minCoverage', '0'], [['--tie-margin', '0'], 'tieMargin', '0'], [['--tie-margin', '5'], 'tieMargin', '5']]) assert.equal(parseArgs(['a.csv', ...args])[key], value);
  assert.deepEqual(Object.keys(DEFAULTS), ['evidenceAbove', 'minCoverage', 'tieMargin']);
  const o = readOptions();
  assert.deepEqual([o.evidenceAbove.text, o.minCoverage.text, o.tieMargin.text], ['3', '80', '0.1']);
  assert.equal(readOptions({ tieMargin: '0.25' }).tieMargin.text, '0.25');
});

test('the options reach the checks on the command line, and the thresholds are in the report', async () => {
  const files = { 'scores.csv': table([cell({ score: '4', evidence: '' })]) };
  const strict = await json(files, ['--evidence-above', '4']);
  assert.equal(strict.findings.some((f) => f.id === 'evidence-missing'), false);
  assert.deepEqual([strict.options.evidenceAbove, strict.options.minCoverage, strict.options.tieMargin], ['4', '80', '0.1']);
  const text = (await run(files, ARGS)).out;
  assert.match(text, /\nthresholds: evidence needed above 3, minimum coverage 80 percent, tie margin 0\.1\n/);
});

test('the JSON report: the files, the scorecard, the ranking, every check, every finding with its place, the notes and the result', async () => {
  const r = await json({ 'scores.csv': table([...clean(), cell({ vendor: GAMMA, score: 'x' })]), 'criteria.csv': criteriaFile() }, ['--criteria', 'criteria.csv']);
  assert.equal(r.tool, 'vendor-scorecard');
  assert.equal(r.version, VERSION);
  assert.equal(r.input.file, 'scores.csv');
  assert.equal(r.input.format, 'CSV');
  assert.equal(r.criteriaInput.file, 'criteria.csv');
  assert.deepEqual(Object.keys(r.scorecard), ['rows', 'read', 'skipped', 'columns', 'columnsRead', 'vendors', 'criteria', 'totalWeight', 'unlisted']);
  assert.equal(r.scorecard.totalWeight, '5');
  assert.deepEqual(r.ranking.map((v) => v.vendor), [ALPHA, BETA, GAMMA]);
  assert.equal(r.rules.length, RULES.length);
  const f = r.findings.find((x) => x.id === 'score-invalid');
  assert.deepEqual(Object.keys(f), ['id', 'severity', 'message', 'file', 'line', 'column', 'at', 'subject', 'fix', 'kind', 'own']);
  assert.equal(f.at, `scores.csv:${f.line}`);
  assert.equal(r.result.pass, false);
  assert.match(r.notice, /does not judge any vendor/);
});

test('the report names the file of each finding, the criteria file included, and ranks as text with the table', async () => {
  const files = { 'scores.csv': table(clean()), 'lists/criteria.csv': criteriaFile([['Chain experience', '3', 'maybe', ''], ['Published audits', '2', 'no', '']]) };
  const r = await run(files, [...ARGS, '--criteria', 'lists/criteria.csv']);
  assert.match(r.out, /ERROR {4}yes-no-unreadable +lists\/criteria\.csv:2\n/);
  assert.match(r.out, /\ncriteria file: lists\/criteria\.csv \(CSV, 3 lines, \d+ bytes\)\n/);
  assert.match(r.out, /\n {2}rank +vendor +score +coverage +red flags +unscored\n {2}1 +Vendor Alpha +3\.80 +100\.0% +0 +0\n {2}2 +Vendor Beta +2\.80 +100\.0% +0 +0\n/);
});

test('the markdown report escapes what markdown gives a meaning to, in a vendor, a note and a file name', async () => {
  const hostile = '[x](http://example.com) <b>|*_`~#';
  const files = { 'scores [1].csv': table([cell({ vendor: hostile, red_flag: 'yes', note: hostile })]) };
  const out = (await run(files, ['scores [1].csv', '--format', 'markdown'])).out;
  assert.ok(out.startsWith('# vendor-scorecard: scores \\[1\\].csv\n'), out.split('\n')[0]);
  assert.ok(!out.includes('<b>'));
  assert.ok(out.includes('\\<b\\>'));
  assert.ok(out.includes('\\|'));
  assert.ok(!out.includes('[x](http'));
});

test('text from the input cannot rewrite the terminal: control characters, escapes and direction controls are replaced in every format', async () => {
  const evil = `Vendor\u001b[2J\u202e\u2028Alpha\u0007`;
  const files = { 'scores.csv': table([cell({ vendor: evil, score: 'bad\u001b[31m', note: evil, red_flag: 'yes' })]) };
  for (const format of ['text', 'markdown', 'json', 'sarif']) {
    const r = await run(files, [...ARGS, '--format', format]);
    assert.equal(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\u2028\u2029]/.test(r.out.replace(/\n/g, '')), false, format);
  }
  assert.equal(show(evil, 60).includes('\u001b'), false);
});

test('SARIF 2.1.0: the checks as rules, the files as artifacts, and one result for each finding with its line and column', async () => {
  const files = { 'scores.csv': table([cell({ score: 'x' }), cell({ vendor: BETA, score: '3' })]), 'criteria.csv': criteriaFile([['Chain experience', '3', 'maybe', '']]) };
  const s = JSON.parse((await run(files, [...ARGS, '--criteria', 'criteria.csv', '--format', 'sarif'])).out);
  assert.equal(s.version, '2.1.0');
  const [runOne] = s.runs;
  assert.equal(runOne.tool.driver.name, 'vendor-scorecard');
  assert.equal(runOne.tool.driver.rules.length, RULES.length);
  assert.deepEqual(runOne.artifacts.map((a) => a.location.uri), ['scores.csv', 'criteria.csv']);
  const levels = new Set(runOne.results.map((x) => x.level));
  assert.ok([...levels].every((l) => ['error', 'warning', 'note'].includes(l)));
  const invalid = runOne.results.find((x) => x.ruleId === 'score-invalid');
  assert.equal(invalid.locations[0].physicalLocation.region.startLine, 2);
  assert.equal(invalid.locations[0].physicalLocation.artifactLocation.index, 0);
  const required = runOne.results.find((x) => x.ruleId === 'yes-no-unreadable' && x.locations[0].physicalLocation.artifactLocation.uri === 'criteria.csv');
  assert.equal(required.locations[0].physicalLocation.artifactLocation.index, 1);
  assert.equal(RULES[invalid.ruleIndex].id, 'score-invalid');
});

test('names that are properties of objects are only names: __proto__, constructor and toString as vendors, criteria and columns', async () => {
  const names = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'];
  const rows = [];
  names.forEach((n, i) => {
    rows.push(cell({ vendor: n, criterion: names[(i + 1) % names.length], score: String(1 + i) }));
    rows.push(cell({ vendor: n, criterion: n, weight: '2', score: String(1 + i), evidence: 'DOC-1' }));
  });
  const r = checkText(table(rows, [...COLUMN_NAMES, '__proto__', 'constructor']));
  assert.equal(r.ranking.length, 5);
  assert.deepEqual(r.ranking.map((v) => v.vendor).sort(), [...names].sort());
  assert.equal(r.findings.filter((f) => f.id === 'column-unknown').length, 2);
  assert.equal(({}).polluted, undefined);
  const withCriteria = checkText(table(rows), criteriaFile(names.map((n) => [n, '1', 'no', ''])));
  assert.equal(withCriteria.findings.filter((f) => f.id === 'criterion-not-in-criteria').length, 0);
});

test('the same input gives the same report, run after run, and a run leaves the folder as it was', async () => {
  await withFiles({ ...GOOD, 'criteria.csv': criteriaFile() }, async (dir) => {
    const before = (await readdir(dir)).sort();
    const a = await cli([...ARGS, '--criteria', 'criteria.csv', '--format', 'json'], dir);
    const b = await cli([...ARGS, '--criteria', 'criteria.csv', '--format', 'json'], dir);
    assert.equal(a.out, b.out);
    assert.deepEqual((await readdir(dir)).sort(), before);
  });
});

test('LF, CRLF and CR line ends, a byte order mark and UTF-16 give the same findings and the same ranking', async () => {
  const text = table([...clean(), cell({ vendor: GAMMA, score: 'x' }), cell({ vendor: GAMMA, criterion: 'Published audits', weight: '2', score: '5', evidence: '' })]);
  const variants = {
    'lf.csv': text,
    'crlf.csv': text.replace(/\n/g, '\r\n'),
    'cr.csv': text.replace(/\n/g, '\r'),
    'bom.csv': Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]),
    'utf16.csv': Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
  };
  await withFiles(variants, async (dir) => {
    const seen = [];
    for (const name of Object.keys(variants)) {
      const r = JSON.parse((await cli([name, '--json'], dir)).out);
      seen.push(JSON.stringify([r.findings.map((f) => `${f.id}:${f.line}:${f.column}`), r.ranking]));
    }
    assert.equal(new Set(seen).size, 1);
  });
});

test('findings of one check past the cap are counted, and the report says how many are not listed', () => {
  const rows = Array.from({ length: FINDING_CAP + 5 }, (_, i) => cell({ vendor: `V${i}`, score: 'x' }));
  const r = checkText(table(rows));
  assert.equal(r.findings.filter((f) => f.id === 'score-invalid').length, FINDING_CAP);
  assert.equal(r.omitted.get('score-invalid'), 5);
  const report = buildReport({ files: [{ file: 'scores.csv', format: 'CSV', bytes: 1, lines: 1 }], checked: r, version: '0.0.0' });
  assert.equal(report.rules.find((x) => x.id === 'score-invalid').findings, FINDING_CAP + 5);
  assert.ok(report.notes.some((n) => n === '5 more findings of score-invalid are not listed; the first 1,000 are'));
  const collector = createCollector();
  collector.skip('x', 0);
  assert.equal(collector.full('x'), false);
});
