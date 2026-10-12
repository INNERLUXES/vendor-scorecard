// The reports: text for a terminal, markdown for a job summary or a pull request, JSON for other tools and SARIF for code
// scanning. Every text that comes from the input (a file name, a cell, a vendor) was cleaned by safeText before it reached the
// report object. The markdown format also escapes what markdown gives a meaning to, and the SARIF format is built as an
// object and written by JSON.stringify.

import { BEST, NOT_A } from './data.js';
import { RULES } from './rules.js';
import { grouped, listText, plural } from './size.js';

const URI = 'https://github.com/INNERLUXES/vendor-scorecard';

function findingsLine(r) {
  const b = r.totals.byLevel;
  const parts = ['error', 'warning', 'info'].filter((l) => b[l]).map((l) => `${grouped(b[l])} ${l}`);
  return `${grouped(r.totals.findings)}${parts.length ? ` (${parts.join(', ')})` : ''}${r.totals.hidden ? `; ${grouped(r.totals.hidden)} below ${r.options.minSeverity} not shown` : ''}`;
}

const fileLine = (f) => `${f.file} (${f.format}, ${plural(f.lines, 'line')}, ${plural(f.bytes, 'byte')})`;

// What the files say, a line for each part.
function scorecardLines(r) {
  const s = r.scorecard;
  const lines = [];
  if (r.criteriaInput) lines.push(['criteria file', fileLine(r.criteriaInput)]);
  if (!s) {
    lines.push(['scorecard', 'not read']);
    return lines;
  }
  lines.push(['rows', `${grouped(s.rows)}${s.skipped ? ` (${grouped(s.read)} read, ${plural(s.skipped, 'row')} left out)` : ''}`]);
  lines.push(['columns', `${grouped(s.columns)} in the header, ${grouped(s.columnsRead)} read, ${grouped(s.columns - s.columnsRead)} not read`]);
  lines.push(['scorecard', `${plural(s.vendors, 'vendor')}, ${plural(s.criteria, 'weighted criterion', 'weighted criteria')}, total weight ${s.totalWeight}`]);
  lines.push(['thresholds', `evidence needed above ${r.options.evidenceAbove}, minimum coverage ${r.options.minCoverage} percent, tie margin ${r.options.tieMargin}`]);
  return lines;
}

function table(head, rows, indent = '  ') {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => `${indent}${cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ')}`.trimEnd();
  return [line(head), ...rows.map(line)];
}

const RANK_HEAD = ['rank', 'vendor', 'score', 'coverage', 'red flags', 'unscored'];
const rankRows = (r) => r.ranking.map((v) => [v.rank === null ? '-' : String(v.rank), v.vendor, v.score ?? '-', v.coverage === null ? '-' : `${v.coverage}%`, String(v.redFlags), String(v.unscored)]);

const flagged = (r) => r.ranking.filter((v) => v.redFlags > 0);

const PAD = ' '.repeat(11);

export function toText(r) {
  const out = [];
  out.push(`vendor-scorecard: ${r.input.file}`);
  out.push(`file: ${fileLine(r.input)}`);
  for (const [k, v] of scorecardLines(r)) out.push(`${k}: ${v}`);
  out.push(`findings: ${findingsLine(r)}`);
  if (r.scorecard) {
    out.push('', `Ranking (${grouped(r.ranking.length)})`, '');
    out.push(...table(RANK_HEAD, rankRows(r)));
    out.push('', 'The weighted score is the sum of weight times score over the scored criteria, divided by the weight of the scored criteria, rounded to two decimals. Coverage is the scored weight as a share of the total weight. A rank is shared by equal scores.');
  }
  out.push('', `Checks (${grouped(r.rules.length)})`, '');
  out.push(...table(['check', 'level', 'kind', 'findings'], r.rules.map((x) => [x.id, x.level, x.kind, grouped(x.findings)])), '');
  out.push(`Findings (${grouped(r.findings.length)})`, '');
  if (!r.findings.length) out.push('  none', '');
  const width = Math.max(...RULES.map((x) => x.id.length));
  for (const f of r.findings) {
    out.push(`  ${f.severity.toUpperCase().padEnd(8)} ${f.id.padEnd(width)}  ${f.at}`);
    out.push(`${PAD}${f.message}`);
    out.push(`${PAD}fix: ${f.fix}`);
    out.push('');
  }
  const red = flagged(r);
  if (red.length) {
    out.push(`Red flags by vendor (${grouped(red.length)})`, '');
    for (const v of red) out.push(`  ${v.vendor}: ${plural(v.redFlags, 'red flag')}, for ${listText(v.redFlagCriteria, 6)}`);
    out.push('');
  }
  for (const n of r.notes) out.push(`note: ${n}`);
  if (r.notes.length) out.push('');
  out.push(r.notice, '');
  out.push(`RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}

// Text for a markdown table cell or line: the characters markdown gives a meaning to are escaped.
const md = (t) => String(t).replace(/[\\`*_{}[\]<>()#+!|~]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');

export function toMarkdown(r) {
  const out = [];
  out.push(`# vendor-scorecard: ${md(r.input.file)}`, '');
  out.push(`- File: ${md(fileLine(r.input))}`);
  for (const [k, v] of scorecardLines(r)) out.push(`- ${k[0].toUpperCase()}${k.slice(1)}: ${md(v)}`);
  out.push(`- Findings: ${md(findingsLine(r))}`);
  out.push(`- Result: **${md(r.result.text)}**`, '');
  if (r.scorecard) {
    out.push('## Ranking', '');
    out.push('| Rank | Vendor | Score | Coverage | Red flags | Unscored |', '| --- | --- | --- | --- | --- | --- |');
    for (const row of rankRows(r)) out.push(`| ${row.map(md).join(' | ')} |`);
    out.push('');
  }
  out.push('## Findings', '');
  if (!r.findings.length) out.push('None.', '');
  else {
    out.push('| Level | Check | Where | Message |', '| --- | --- | --- | --- |');
    for (const f of r.findings) out.push(`| ${f.severity} | ${f.id} | ${md(f.at)} | ${md(f.message)} Fix: ${md(f.fix)} |`);
    out.push('');
  }
  const red = flagged(r);
  if (red.length) {
    out.push('## Red flags by vendor', '');
    for (const v of red) out.push(`- ${md(v.vendor)}: ${plural(v.redFlags, 'red flag')}, for ${md(listText(v.redFlagCriteria, 6))}`);
    out.push('');
  }
  for (const n of r.notes) out.push(`Note: ${md(n)}`, '');
  out.push(`${md(r.notice)}`, '');
  return `${out.join('\n')}`;
}

export function toJson(r) {
  return `${JSON.stringify(r, null, 2)}\n`;
}

const SARIF_LEVEL = { error: 'error', warning: 'warning', info: 'note' };

// SARIF 2.1.0: the checks as rules of the driver, the files as the artifacts, and one result for each finding with its line
// and column. The ranking has no place in SARIF and is left out.
export function toSarif(r) {
  const files = [r.input.file, ...(r.criteriaInput ? [r.criteriaInput.file] : [])];
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'vendor-scorecard',
            version: r.version,
            informationUri: URI,
            rules: RULES.map((x) => ({
              id: x.id,
              name: x.id,
              shortDescription: { text: x.summary },
              help: { text: `${x.fix} (${x.kind})` },
              defaultConfiguration: { level: SARIF_LEVEL[x.severity] },
              properties: { kind: x.kind }
            }))
          }
        },
        artifacts: files.map((uri) => ({ location: { uri } })),
        results: r.findings.map((f) => ({
          ruleId: f.id,
          ruleIndex: RULES.findIndex((x) => x.id === f.id),
          level: SARIF_LEVEL[f.severity],
          message: { text: `${f.message} Fix: ${f.fix}` },
          locations: [{ physicalLocation: { artifactLocation: { uri: f.file, index: Math.max(0, files.indexOf(f.file)) }, region: { startLine: f.line, startColumn: f.column } } }],
          properties: { kind: f.kind, subject: f.subject }
        })),
        properties: { notice: r.notice, result: r.result.text }
      }
    ]
  };
  return `${JSON.stringify(sarif, null, 2)}\n`;
}

// The list of checks, for --list-checks.
export function listChecksText() {
  const width = Math.max(...RULES.map((x) => x.id.length));
  const out = ['vendor-scorecard checks', ''];
  for (const x of RULES) out.push(`  ${x.id.padEnd(width)}  ${x.severity.padEnd(7)}  ${x.kind.padEnd(11)}  ${x.summary}`);
  out.push('', `Every check is ${BEST}. A check of a file is about a file, its header or the width of its rows, a check of a row is found from one row, and a check across rows puts rows side by side. The tool is ${NOT_A}.`, '');
  return out.join('\n');
}

export function listChecksMarkdown() {
  const out = ['# vendor-scorecard checks', '', '| Check | Level | Kind | What it looks at |', '| --- | --- | --- | --- |'];
  for (const x of RULES) out.push(`| ${x.id} | ${x.severity} | ${x.kind} | ${md(x.summary)} |`);
  out.push('');
  return out.join('\n');
}

export function listChecksJson() {
  return `${JSON.stringify(RULES.map((x) => ({ id: x.id, severity: x.severity, kind: x.kind, summary: x.summary, fix: x.fix, own: x.own, cannot: x.cannot })), null, 2)}\n`;
}

export function explainText(rule) {
  const out = [`${rule.id}`, ''];
  out.push(`level: ${rule.severity}`, `kind: ${rule.kind}`, '');
  out.push(`what it looks at: ${rule.summary}`, '', `why it exists: ${rule.own}`, '', `what to change: ${rule.fix}`, '', `what it cannot see: ${rule.cannot}`, '');
  out.push(`This check is ${BEST}. The tool is ${NOT_A}.`, '');
  return out.join('\n');
}

export function explainMarkdown(rule) {
  const out = [`# ${md(rule.id)}`, ''];
  out.push(`- Level: ${rule.severity}`, `- Kind: ${rule.kind}`, '');
  out.push(`**What it looks at.** ${md(rule.summary)}`, '', `**Why it exists.** ${md(rule.own)}`, '', `**What to change.** ${md(rule.fix)}`, '', `**What it cannot see.** ${md(rule.cannot)}`, '');
  out.push(`This check is ${md(BEST)}.`, '');
  return out.join('\n');
}

export function explainJson(rule) {
  return `${JSON.stringify({ id: rule.id, severity: rule.severity, kind: rule.kind, summary: rule.summary, fix: rule.fix, own: rule.own, cannot: rule.cannot, note: `This check is ${BEST}.` }, null, 2)}\n`;
}
