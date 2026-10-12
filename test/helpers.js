// Shared test helpers: scorecards built inline as CSV text, checked in memory or written into a temporary folder that is
// removed after the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux, macOS and
// Windows. The line a test expects is found with lineOf(), which counts lines the way the reader does, so a test never holds
// a line number worked out by hand for one system only. No test reads the clock, the time zone or the locale. Every vendor and
// criterion is made up, and every link is on example.com.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { COLUMN_NAMES, checkText, main, readOptions } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'vendor-scorecard-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// The line (from 1) of the n-th place where needle starts in text.
export function lineOf(text, needle, n = 1) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return text.slice(0, at).split('\n').length;
}

export const ALPHA = 'Vendor Alpha';
export const BETA = 'Vendor Beta';
export const GAMMA = 'Vendor Gamma';

const quote = (v) => (/[",\n\r\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// One line of text from an object of column -> value, for these columns.
export const lineOfRow = (row, columns = COLUMN_NAMES, delimiter = ',') => columns.map((c) => quote(row[c] ?? '')).join(delimiter);

// A table as text: the header and the rows, with LF line ends. columns is the list of columns (default: all of them).
export const table = (rows, columns = COLUMN_NAMES, delimiter = ',') => `${[columns.join(delimiter), ...rows.map((r) => (typeof r === 'string' ? r : lineOfRow(r, columns, delimiter)))].join('\n')}\n`;

// A row that passes every check; over replaces cells, and a cell set to undefined is left empty.
export const cell = (over = {}) => {
  const out = { vendor: ALPHA, criterion: 'Chain experience', weight: '3', score: '4', evidence: 'https://example.com/alpha/chain-experience', red_flag: 'no', note: '', ...over };
  for (const [k, v] of Object.entries(over)) if (v === undefined) delete out[k];
  return out;
};

// A scorecard of two vendors and two criteria that passes every check at every level. Chain experience counts 3 and Published
// audits 2, so Vendor Alpha has (3 * 4 + 2 * 3.5) / 5 = 3.8 and Vendor Beta (3 * 3 + 2 * 2.5) / 5 = 2.8.
export const clean = () => [
  cell(),
  cell({ criterion: 'Published audits', weight: '2', score: '3.5', evidence: 'DOC-12' }),
  cell({ vendor: BETA, score: '3', evidence: 'https://example.com/beta/chain-experience' }),
  cell({ vendor: BETA, criterion: 'Published audits', weight: '2', score: '2.5', evidence: 'https://example.com/beta/published-audits' })
];

// The criteria file that goes with clean().
export const criteriaFile = (rows = [['Chain experience', '3', 'no', ''], ['Published audits', '2', 'no', '']], columns = ['criterion', 'weight', 'required', 'description']) => `${[columns.join(','), ...rows.map((r) => r.map(quote).join(','))].join('\n')}\n`;

// The findings of a run in memory, for a text or for rows.
export const findingsOf = (p, criteria = null, options = {}) => checkText(typeof p === 'string' ? p : table(p), criteria, { options: readOptions(options) }).findings;

// The ids of the findings of a run.
export const idsOf = (p, criteria, options) => findingsOf(p, criteria, options).map((f) => f.id);

// The findings of one check.
export const ofCheck = (p, id, criteria, options) => findingsOf(p, criteria, options).filter((f) => f.id === id);

// The whole run in memory.
export const runOf = (p, criteria = null, options = {}) => checkText(typeof p === 'string' ? p : table(p), criteria, { options: readOptions(options) });

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, base) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// Writes the files and runs the command line in the folder.
export async function run(files, args) {
  return withFiles(files, (dir) => cli(args, dir));
}

// A clean file and one with a score that does not read, for the command line tests.
export const GOOD = { 'scores.csv': table(clean()) };
export const BAD = { 'scores.csv': table([cell({ score: 'high' })]) };
export const ARGS = ['scores.csv'];

// The time a hostile test may take: four times as long when the runner collects coverage, which sets NODE_V8_COVERAGE.
export const allowed = (ms) => (process.env.NODE_V8_COVERAGE ? ms * 4 : ms);
