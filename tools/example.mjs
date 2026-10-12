// Runs the README examples, checks that they report what the README shows, and writes the reports of the two made-up
// scorecards to examples/output. CI runs it and then fails if those files changed, so the example output in the repository is
// always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// Every path is relative to the root of the repository.
export const BAD = ['examples/bad/scores.csv', '--criteria', 'examples/bad/criteria.csv'];
export const GOOD = ['examples/good/scores.csv', '--criteria', 'examples/good/criteria.csv'];
export const GOOD_ALONE = ['examples/good/scores.csv'];
export const EXPLAIN = ['--explain', 'tie-too-close'];

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the bad scorecard: the counts, a finding of every check but one, and the result.
export const EXPECTED = [
  'rows: 27 (23 read, 4 rows left out)',
  'columns: 9 in the header, 7 read, 2 not read',
  'scorecard: 4 vendors, 7 weighted criteria, total weight 15',
  'findings: 27 (15 error, 10 warning, 2 info)',
  'The header of the criteria file has no "weight" column, so it cannot give the weights; they are read from the scores file.',
  'The column "status" of the scores file is not a column the tool reads, so the values under it are not checked.',
  'The column "Note" has the same name as column 7 of the scores file once case and separators are ignored; only the first is read.',
  'Row 27 has 4 cells but the header has 9; the row was left out of every other check.',
  'A cell of the column "note" is shaped like a mnemonic. The tool never reads a seed or a key, and the value is not shown.',
  'Row 22 has no value in the cell under "vendor", which every row needs; the row was left out.',
  'Row 8 scores the vendor "Vendor Alpha" on the criterion "Integration" again; row 4, on line 5, already does.',
  'The weight of row 21, "0", is not a plain number above zero',
  'The weight of row 13 for the criterion "References" is 2, but row 5, on line 6, gives it 1.5. The first weight is the one used.',
  'The score of row 19, 7, is above 5. The criterion counts as unscored for this vendor.',
  'The red_flag of row 11, "maybe", is not yes or no; it is read as no.',
  'The required cell of row 5 of the criteria file, "maybe", is not yes or no; the criterion is read as not required.',
  'The criterion "Roadmap fit" of row 16 is not in the criteria file, so it has no weight from it; the rows of this criterion were left out.',
  'Row 12 leaves the criterion "Integration" unscored for the vendor "Vendor Beta".',
  'Row 23 leaves the criterion "Chain experience" unscored for the vendor "Vendor Delta", and the criteria file marks it required.',
  'The vendor "Vendor Gamma" has no row for the criterion "Published audits", which other vendors have and the criteria file marks required.',
  'The vendor "Vendor Gamma" has no row for the criterion "Support after launch", which other vendors have.',
  'The criterion "Token design" is in the criteria file, but was scored by no vendor: no row of the scores file scores it.',
  'Row 10 scores "Published audits" at 5 for "Vendor Beta" with nothing in the evidence cell; a score above 3 should point at where it comes from.',
  'The evidence of row 6, "as discussed on the call", is not a web address that starts with http:// or https://, and not a document reference such as DOC-12.',
  'The vendor "Vendor Alpha" has a red flag for the criterion "Security practice" in row 3. Note: "Signing key held by one person only".',
  'The coverage of the vendor "Vendor Delta" is 43.3 percent of the total weight, below the minimum of 80 percent.',
  'The vendors "Vendor Alpha" (4.23) and "Vendor Beta" (4.19) are next to each other in the ranking and differ by less than the tie margin of 0.1',
  'This report is arithmetic and bookkeeping on the scores in the file. It does not judge any vendor, it does not check that a score or a link is true, and it is not advice.',
  'RESULT: FAIL - 15 findings at or above error (15 error, 10 warning, 2 info)'
];
// What must not be reported: the check the bad scorecard cannot hold, the seed, and a pass.
export const UNWANTED = ['ERROR    file-unreadable', 'lantern', 'RESULT: PASS'];

// What the README says of the good scorecard: no finding.
export const GOOD_EXPECTED = [
  'rows: 28',
  'scorecard: 4 vendors, 7 weighted criteria, total weight 15',
  'findings: 0',
  'RESULT: PASS - no finding at or above error'
];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bad = await run(BAD);
  process.stdout.write(bad.out);
  expect('bad scorecard', bad, 1, EXPECTED, UNWANTED);

  const good = await run(GOOD);
  expect('good scorecard', good, 0, GOOD_EXPECTED, ['ERROR    ', 'WARNING  ', 'INFO     ', 'RESULT: FAIL', 'note: ']);
  // The good scorecard also passes when warnings and notes fail the run, and when the weights come from the scores file.
  expect('good, fail on warning', await run([...GOOD, '--fail-on', 'warning']), 0, ['RESULT: PASS - no finding at or above warning'], []);
  expect('good, fail on info', await run([...GOOD, '--fail-on', 'info']), 0, ['RESULT: PASS - no finding at or above info'], []);
  expect('good, no criteria file', await run(GOOD_ALONE), 0, ['findings: 0', 'RESULT: PASS - no finding at or above error'], ['criteria file:']);
  // A stricter tie margin turns the order of the good scorecard into a note, and a stricter coverage cannot hurt it.
  expect('good, wide tie margin', await run([...GOOD, '--tie-margin', '0.5']), 0, ['findings: 2 (2 info)', 'too close to call'], []);
  // The bad scorecard with only the errors shown still counts the rest.
  expect('bad, errors only', await run([...BAD, '--min-severity', 'error']), 1, ['findings: 15 (15 error); 12 below error not shown'], ['WARNING  ', 'INFO     ']);
  // A file that is not there stops the run with no report, and so does a threshold that is not a number.
  expect('missing file', await run(['examples/none/scores.csv']), 2, ['examples/none/scores.csv: does not exist'], [], 'err');
  expect('threshold that is not a number', await run([...GOOD_ALONE, '--min-coverage', '120']), 2, ['--min-coverage: 120 is not a plain number of percent from 0 to 100'], [], 'err');

  // The README shows the head of the report of the bad scorecard, two of its findings, the end of the report, and the head
  // and the end of the report of the good one.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  const lines = bad.out.split('\n');
  const head = lines.slice(0, lines.findIndex((l) => l.startsWith('Findings ('))).join('\n');
  if (!readme.includes(head)) problems.push('README: the head of the sample output of the bad scorecard differs from a real run');
  for (const [id, at] of [['red-flag-raised', 'examples/bad/scores.csv:4'], ['tie-too-close', 'examples/bad/scores.csv:2']]) {
    const i = lines.findIndex((l) => l.includes(id) && l.includes(at));
    const sample = lines.slice(i, i + 3).join('\n');
    if (i < 0 || !readme.includes(sample)) problems.push(`README: the sample finding of ${id} differs from a real run`);
  }
  const tail = lines.slice(-6).join('\n');
  if (!readme.includes(tail)) problems.push('README: the tail of the sample output of the bad scorecard differs from a real run');
  const goodLines = good.out.split('\n');
  const goodHead = goodLines.slice(0, goodLines.findIndex((l) => l.startsWith('Checks ('))).join('\n');
  if (!readme.includes(goodHead)) problems.push('README: the head of the sample output of the good scorecard differs from a real run');
  const goodTail = goodLines.slice(-6).join('\n');
  if (!readme.includes(goodTail)) problems.push('README: the tail of the sample output of the good scorecard differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  const outputs = [
    ['bad.txt', BAD, 1],
    ['bad.md', [...BAD, '--format', 'markdown'], 1],
    ['bad.json', [...BAD, '--json'], 1],
    ['bad.sarif', [...BAD, '--format', 'sarif'], 1],
    ['good.txt', GOOD, 0],
    ['good.md', [...GOOD, '--format', 'markdown'], 0],
    ['good.json', [...GOOD, '--json'], 0],
    ['good.sarif', [...GOOD, '--format', 'sarif'], 0],
    ['checks.txt', ['--list-checks'], 0],
    ['checks.md', ['--list-checks', '--format', 'markdown'], 0],
    ['checks.json', ['--list-checks', '--format', 'json'], 0],
    ['explain-tie-too-close.txt', EXPLAIN, 0],
    ['explain-tie-too-close.md', [...EXPLAIN, '--format', 'markdown'], 0]
  ];
  for (const [name, args, code] of outputs) {
    const r = await run(args);
    if (r.code !== code) problems.push(`${name}: exit code ${r.code}, expected ${code}`);
    await writeFile(resolve(root, 'examples/output', name), r.out);
  }

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
