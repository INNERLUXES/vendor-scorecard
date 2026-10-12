// Command line: vendor-scorecard <scores.csv> [options]

import { readFileSync } from 'node:fs';
import { InputError, LIMITS, checkFile, readOptions, readThreshold } from './check.js';
import { DEFAULTS, LEVELS } from './data.js';
import { explainJson, explainMarkdown, explainText, listChecksJson, listChecksMarkdown, listChecksText, toJson, toMarkdown, toSarif, toText } from './report.js';
import { RULES, ruleById } from './rules.js';
import { editDistance } from './fields.js';
import { safeText } from './text.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson, sarif: toSarif };
const LISTS = { text: listChecksText, markdown: listChecksMarkdown, json: listChecksJson };
const EXPLAINS = { text: explainText, markdown: explainMarkdown, json: explainJson };

export const USAGE = `Usage: vendor-scorecard <scores.csv> [options]

Scores a shortlist of vendors the same way every time. It reads a spreadsheet (CSV, or TSV; a header row and one row for
each vendor and criterion) with the vendor, the criterion, a weight, a score from 0 to 5, a link or a reference to the
evidence and a red flag, ranks the vendors by weighted score with exact arithmetic, and lists, with the line, criteria left
unscored, scores with no evidence behind them, red-flag answers and ties too close to call. A second file given with
--criteria lists the criteria, their weights and which are required. It does arithmetic and bookkeeping on the scores
people enter; it does not judge any vendor and it is not advice. It contacts nothing over the network, reads no clock and
writes nothing to disk.

Options:
  --criteria <file>          a CSV or TSV file with the columns criterion, weight, required and description; it becomes the
                             source of the weights, and a criterion marked required must be scored for every vendor
  --format <name>            text, markdown, json or sarif (default: text)
  --json                     the same as --format json
  --min-severity <level>     the lowest level of a finding that is shown: ${LEVELS.join(', ')} (default: info)
  --fail-on <level>          the lowest level of a finding that fails the run: ${LEVELS.join(', ')} (default: error)
  --evidence-above <score>   a score above this needs evidence, a number from 0 to 5 (default: ${DEFAULTS.evidenceAbove})
  --min-coverage <percent>   the share of the total weight a vendor should be scored on, from 0 to 100 (default: ${DEFAULTS.minCoverage})
  --tie-margin <number>      two vendors next to each other in the ranking that differ by less than this are too close to
                             call, a number from 0 to 5 (default: ${DEFAULTS.tieMargin}); 0 turns the check off
  --list-checks              list the checks with their level and kind, and exit
  --explain <id>             explain one check: what it looks at, what to change, what it cannot see, and exit
  --help                     show this text
  --version                  show the version

Checks: ${RULES.map((r) => r.id).join(', ')}.

Exit codes: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

// The check whose id is nearest to the text, for a message about a misspelt id.
function nearestId(text) {
  let best = null;
  let bestDistance = Infinity;
  for (const r of RULES) {
    const d = editDistance(text.toLowerCase(), r.id);
    if (d < bestDistance) {
      best = r.id;
      bestDistance = d;
    }
  }
  return bestDistance <= 6 ? best : null;
}

const THRESHOLDS = [
  ['--evidence-above', 'evidenceAbove', 'a plain number from 0 to 5'],
  ['--min-coverage', 'minCoverage', 'a plain number of percent from 0 to 100'],
  ['--tie-margin', 'tieMargin', 'a plain number from 0 to 5']
];

export function parseArgs(argv) {
  const o = { paths: [], criteria: null, format: null, json: false, minSeverity: null, failOn: null, evidenceAbove: null, minCoverage: null, tieMargin: null, listChecks: false, explain: null, help: false, version: false };
  const once = (name, current, value) => {
    if (current !== null) throw new Error(`${name} was given twice`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      if (v === '-') throw new Error('reading from standard input is not supported; give a file');
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--json') o.json = true;
    else if (a === '--list-checks') o.listChecks = true;
    else if (a === '--criteria') o.criteria = once(a, o.criteria, next());
    else if (a === '--format') o.format = once(a, o.format, next());
    else if (a === '--min-severity') o.minSeverity = once(a, o.minSeverity, next());
    else if (a === '--fail-on') o.failOn = once(a, o.failOn, next());
    else if (a === '--evidence-above') o.evidenceAbove = once(a, o.evidenceAbove, next());
    else if (a === '--min-coverage') o.minCoverage = once(a, o.minCoverage, next());
    else if (a === '--tie-margin') o.tieMargin = once(a, o.tieMargin, next());
    else if (a === '--explain') o.explain = once(a, o.explain, next());
    else if (a === '-') throw new Error('reading from standard input is not supported; give a file');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else {
      if (o.paths.length === 1) throw new Error('give one scores file; a second file goes after --criteria');
      o.paths.push(a);
    }
  }
  if (o.json) {
    if (o.format !== null && o.format !== 'json') throw new Error(`--json and --format ${o.format} ask for two formats; give one`);
    o.format = 'json';
  }
  if (o.format === null) o.format = 'text';
  if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, markdown, json or sarif)`);
  for (const [flag, v] of [['--min-severity', o.minSeverity], ['--fail-on', o.failOn]]) if (v !== null && !LEVELS.includes(v)) throw new Error(`${flag}: unknown level ${v} (${LEVELS.join(', ')})`);
  for (const [flag, key, what] of THRESHOLDS) if (o[key] !== null && readThreshold(key, o[key]) === null) throw new Error(`${flag}: ${safeText(o[key], 40)} is not ${what}`);
  if (o.explain !== null && ruleById(o.explain) === undefined) {
    const near = nearestId(o.explain);
    throw new Error(`--explain: unknown check ${safeText(o.explain, 60)}${near ? `. Did you mean ${near}?` : ''} (--list-checks lists them)`);
  }
  if ((o.listChecks || o.explain !== null) && o.format === 'sarif') throw new Error(`${o.listChecks ? '--list-checks' : '--explain'} has no SARIF form; use text, markdown or json`);
  if (!o.help && !o.version && !o.listChecks && o.explain === null) {
    if (o.paths.length !== 1) throw new Error('give the scores file, such as vendor-scorecard scores.csv');
    for (const p of [o.paths[0], o.criteria]) if (p !== null && isUrl(p)) throw new Error('give a local path; the tool never fetches a URL');
  }
  return o;
}

const clean = (text) => safeText(text, 1500);

// Exit code: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = undefined, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`vendor-scorecard: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  if (o.listChecks) {
    io.out(LISTS[o.format]());
    return 0;
  }
  if (o.explain !== null) {
    io.out(EXPLAINS[o.format](ruleById(o.explain)));
    return 0;
  }
  const merged = { ...LIMITS, ...(limits ?? {}) };
  try {
    const report = await checkFile({
      path: o.paths[0],
      criteriaPath: o.criteria,
      minSeverity: o.minSeverity ?? 'info',
      failOn: o.failOn ?? 'error',
      options: readOptions({ evidenceAbove: o.evidenceAbove, minCoverage: o.minCoverage, tieMargin: o.tieMargin }),
      version: VERSION,
      limits: merged,
      base
    });
    io.out(FORMATS[o.format](report));
    return report.result.pass ? 0 : 1;
  } catch (error) {
    if (error instanceof InputError) io.err(`vendor-scorecard: no result, the input has ${error.problems.length === 1 ? 'a problem' : 'problems'}:\n${error.problems.map((p) => `  ${clean(p)}`).join('\n')}\n`);
    else io.err(`vendor-scorecard: ${clean(error.message)}\n`);
    return 2;
  }
}
