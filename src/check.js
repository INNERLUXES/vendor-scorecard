// A run: read the scores file (and the criteria file, if one is given) as tables, look for keys and seeds in them, read the
// scorecard, run the checks and build the report object that the formats write.

import { checkAcross } from './across.js';
import { CSV_LIMITS, CsvError, cellAt, readTable } from './csv.js';
import { DEFAULTS, LEVELS, MAX_SCORE, NOTICE } from './data.js';
import { compareDecimal, formatDecimal, parseDecimal } from './decimal.js';
import { FILE_LIMITS, InputError, displayPath, locateInput, readInputText } from './files.js';
import { createCollector } from './collect.js';
import { normalizeName } from './fields.js';
import { readScorecard } from './read.js';
import { RULES, decide, ruleById } from './rules.js';
import { findSecrets } from './secrets.js';
import { safeText } from './text.js';

export const LIMITS = { ...FILE_LIMITS, ...CSV_LIMITS };

export { InputError };

const clean = (t, max = 900) => safeText(t, max);

const ORDER = { error: 0, warning: 1, info: 2 };

// The columns that hold references. A cell of 64 hex digits in one of them is a hash used as a reference, and is read as one
// and not as a private key in hex (docs/limits.md).
export const HEX_COLUMNS = ['evidence'];

// The most each threshold may be, as a number written the way the option is.
const THRESHOLD_MAX = { evidenceAbove: MAX_SCORE, minCoverage: '100', tieMargin: MAX_SCORE };

// A threshold given as text: a plain decimal from 0 up to the most it may be, as a decimal with its text; null when it is
// not one.
export function readThreshold(name, text) {
  const d = parseDecimal(text);
  if (d === null || compareDecimal(d, parseDecimal(THRESHOLD_MAX[name])) > 0) return null;
  return { ...d, text: `${text}` };
}

// The thresholds of a run, each given as text or left to its default.
export function readOptions({ evidenceAbove = null, minCoverage = null, tieMargin = null } = {}) {
  const pick = (name, given) => readThreshold(name, given ?? DEFAULTS[name]);
  return { evidenceAbove: pick('evidenceAbove', evidenceAbove), minCoverage: pick('minCoverage', minCoverage), tieMargin: pick('tieMargin', tieMargin) };
}

const unreadable = (file, error) => ({ id: 'file-unreadable', file, line: error.line, column: error.column, message: `${file === 1 ? 'The criteria file' : 'The file'} is not a table the reader can follow: ${error.message}. Nothing was checked.`, subject: null });

// Reads one table; returns { table } or { finding }.
function table(text, file, limits) {
  let t;
  try {
    t = readTable(text, { limits });
  } catch (error) {
    if (!(error instanceof CsvError)) throw error;
    return { finding: unreadable(file, error) };
  }
  if (t.rows.length === 0) return { finding: { id: 'file-unreadable', file, line: 1, column: 1, message: `${file === 1 ? 'The criteria file' : 'The file'} holds a header and no rows, so there is nothing to check. Nothing was checked.`, subject: null } };
  return { table: t };
}

// The findings of the text of a scores file and, if given, of a criteria file, with no file system. Returns { tables, model,
// summary, ranking, findings, notes, omitted }; model is null when the files cannot be read as a scorecard.
export function checkText(scoresText, criteriaText = null, { limits = CSV_LIMITS, options = readOptions() } = {}) {
  const none = (findings, notes) => ({ tables: [null, null], model: null, summary: null, ranking: [], findings, notes, omitted: new Map() });
  const a = table(scoresText, 0, limits);
  if (a.finding) return none([a.finding], ['the files were not checked, because the scores file is not a table the reader can follow']);
  let b = { table: null };
  if (criteriaText !== null) {
    b = table(criteriaText, 1, limits);
    if (b.finding) return none([b.finding], ['the files were not checked, because the criteria file is not a table the reader can follow']);
  }
  const evidenceIndexes = new Set(a.table.header.cells.map((c, i) => (HEX_COLUMNS.includes(normalizeName(c)) ? i : -1)).filter((i) => i >= 0));
  const secrets = findSecrets(a.table, cellAt, evidenceIndexes).map((f) => ({ ...f, file: 0, subject: null }));
  if (b.table) secrets.push(...findSecrets(b.table, cellAt).map((f) => ({ ...f, file: 1, subject: null })));
  const collector = createCollector();
  const { model, summary } = readScorecard(a.table, b.table, collector.add, collector.notes, options);
  let ranking = [];
  let counts = null;
  if (model !== null) {
    const across = checkAcross(model, options, collector);
    ranking = across.ranking;
    counts = { vendors: model.vendors.size, criteria: across.criteria, totalWeight: across.totalWeight, unlisted: model.unlisted };
  }
  const notes = model === null ? collector.notes : [...a.table.notes, ...(b.table ? b.table.notes : []), ...collector.notes];
  return { tables: [a.table, b.table], model, summary: summary === null ? null : { ...summary, ...counts }, ranking, findings: [...secrets, ...collector.findings], notes, omitted: collector.omitted };
}

const lineCount = (text) => {
  const parts = text === '' ? [] : text.split(/\r\n|\r|\n/);
  return parts.length > 0 && parts.at(-1) === '' ? parts.length - 1 : parts.length;
};

// The report object for the findings. files is [{ file, format, bytes, lines }] for the scores file and, if given, the
// criteria file.
export function buildReport({ files, checked, version, minSeverity = 'info', failOn = 'error', options = readOptions() }) {
  const all = checked.findings.map((f) => {
    const rule = ruleById(f.id);
    const file = files[f.file]?.file ?? files[0].file;
    return {
      id: f.id,
      severity: rule.severity,
      message: clean(f.message),
      file,
      line: f.line,
      column: f.column,
      at: `${file}:${f.line}`,
      subject: f.subject == null ? null : clean(f.subject, 120),
      fix: rule.fix,
      kind: rule.kind,
      own: rule.own
    };
  });
  all.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line || a.column - b.column || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const omitted = checked.omitted;
  const shown = all.filter((f) => LEVELS.indexOf(f.severity) >= LEVELS.indexOf(minSeverity));
  const extra = (rule) => omitted.get(rule.id) ?? 0;
  const byLevel = { error: 0, warning: 0, info: 0 };
  const allByLevel = { error: 0, warning: 0, info: 0 };
  for (const f of all) allByLevel[f.severity] += 1;
  for (const f of shown) byLevel[f.severity] += 1;
  for (const rule of RULES) {
    allByLevel[rule.severity] += extra(rule);
    if (LEVELS.indexOf(rule.severity) >= LEVELS.indexOf(minSeverity)) byLevel[rule.severity] += extra(rule);
  }
  const total = (o) => o.error + o.warning + o.info;
  const notes = [...checked.notes];
  for (const [id, n] of omitted) notes.push(`${n.toLocaleString('en-US')} more findings of ${id} are not listed; the first 1,000 are`);
  const s = checked.summary;
  return {
    tool: 'vendor-scorecard',
    version,
    input: { file: files[0].file, format: files[0].format, bytes: files[0].bytes, lines: files[0].lines },
    criteriaInput: files[1] ? { file: files[1].file, format: files[1].format, bytes: files[1].bytes, lines: files[1].lines } : null,
    scorecard: s ? { rows: s.rows, read: s.read, skipped: s.skipped, columns: s.columns, columnsRead: s.columnsRead, vendors: s.vendors, criteria: s.criteria, totalWeight: s.totalWeight ? formatDecimal(s.totalWeight) : '0', unlisted: s.unlisted } : null,
    ranking: checked.ranking,
    totals: { findings: total(byLevel), byLevel, hidden: total(allByLevel) - total(byLevel) },
    rules: RULES.map((r) => ({ id: r.id, level: r.severity, kind: r.kind, findings: shown.filter((f) => f.id === r.id).length + (LEVELS.indexOf(r.severity) >= LEVELS.indexOf(minSeverity) ? extra(r) : 0) })),
    options: { minSeverity, failOn, evidenceAbove: options.evidenceAbove.text, minCoverage: options.minCoverage.text, tieMargin: options.tieMargin.text },
    findings: shown,
    notes: notes.map((n) => clean(n)),
    notice: NOTICE,
    result: decide(allByLevel, failOn)
  };
}

async function load({ path, limits, base }) {
  const absolute = await locateInput(path, base);
  const { text, bytes } = await readInputText(absolute, base, limits);
  return { absolute, text, file: { file: displayPath(absolute, base), bytes, lines: lineCount(text) } };
}

const formatOf = (t) => (t && t.delimiter === '\t' ? 'TSV' : 'CSV');

// Reads the scores file (and the criteria file) and builds the report.
export async function checkFile({ path, criteriaPath = null, minSeverity = 'info', failOn = 'error', options = readOptions(), version, limits = LIMITS, base = process.cwd() }) {
  const scores = await load({ path, limits, base });
  const criteria = criteriaPath === null ? null : await load({ path: criteriaPath, limits, base });
  if (criteria !== null && criteria.absolute === scores.absolute) throw new InputError([`${scores.file.file}: is given as both the scores file and the criteria file; give two files`]);
  const checked = checkText(scores.text, criteria === null ? null : criteria.text, { limits, options });
  const files = [{ ...scores.file, format: formatOf(checked.tables[0]) }];
  if (criteria !== null) files.push({ ...criteria.file, format: formatOf(checked.tables[1]) });
  return buildReport({ files, checked, version, minSeverity, failOn, options });
}
