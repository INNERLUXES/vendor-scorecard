// Reads the tables into a scorecard. The header is read first (which column is which), then the criteria file, then each row
// of the scores file on its own: its vendor and criterion, its weight, its score, its evidence and its red flag, with the
// findings of the row. The result is the model that the checks across rows (src/across.js) work on. Nothing here reads a
// clock or the network, and no pattern is built from the input.

import { cellAt } from './csv.js';
import { compareDecimal, formatDecimal, isZero, parseDecimal } from './decimal.js';
import { COLUMN_NAMES, CRITERIA_COLUMN_NAMES, CRITERIA_NEEDED, NEEDED, nearest, normalizeName } from './fields.js';
import { isPlaceholder, nameKey, show } from './collect.js';
import { MAX_SCORE } from './data.js';

const MAX = parseDecimal(MAX_SCORE);

// A web address that starts with http:// or https://, with a host and no user name or password in it.
const URL_FORM = /^https?:\/\/([^\s/?#:@]+)(?::[0-9]{1,5})?(?:[/?#]\S*)?$/i;
const HOST_FORM = /^[A-Za-z0-9.-]+$/;
// A document reference: two to ten letters, a hyphen or a hash sign, and a short code, such as DOC-12 or AUD#7.2.
const DOC_FORM = /^[A-Za-z]{2,10}[-#][A-Za-z0-9][A-Za-z0-9._/-]{0,60}$/;

// Whether one piece of evidence is a web address of the form above (its host has a dot) or a document reference.
export function evidenceForm(piece) {
  const m = URL_FORM.exec(piece);
  if (m) {
    const host = m[1];
    return HOST_FORM.test(host) && host.includes('.') && !host.startsWith('.') && !host.endsWith('.') && !host.includes('..');
  }
  return DOC_FORM.test(piece);
}

// The first piece of a cell of evidence (pieces are separated by semicolons) that has neither form, or null.
export function badEvidence(text) {
  for (const raw of text.split(';')) {
    const piece = raw.trim();
    if (piece !== '' && !evidenceForm(piece)) return piece;
  }
  return null;
}

// Reads the header of a table: which column is which. Reports a column the tool does not read and a name written twice.
// Returns { index, missing } with the columns of needed that are not there.
function readHeader(table, { names, needed, file, add, label }) {
  const index = new Map();
  table.header.cells.forEach((cell, i) => {
    if (table.secretColumns.has(i)) return;
    const key = normalizeName(cell);
    const at = { file, ...cellAt(table.header, i) };
    if (key !== '' && names.includes(key)) {
      if (index.has(key)) add('column-duplicate', at, `The column "${show(cell, 80)}" has the same name as column ${index.get(key) + 1} of ${label} once case and separators are ignored; only the first is read.`, show(cell, 80));
      else index.set(key, i);
    } else if (key === '') {
      add('column-unknown', at, `Column ${i + 1} of ${label} has no name, so the values under it are not read.`, `column ${i + 1}`);
    } else {
      const near = nearest(key, names);
      add('column-unknown', at, `The column "${show(cell, 80)}" of ${label} is not a column the tool reads, so the values under it are not checked.${near ? ` Did you mean ${near}?` : ''}`, show(cell, 80));
    }
  });
  return { index, missing: needed.filter((n) => !index.has(n)) };
}

// The text of a cell of a row: trimmed, '' where the column is not in the file, null where the cell holds a secret, which no
// check reads.
const cellsOf = (table, index) => (raw, column) => {
  const i = index.get(column);
  if (i === undefined) return '';
  if (table.secretColumns.has(i) || raw.secrets?.has(i)) return null;
  return raw.cells[i].trim();
};

// The text of a cell that says something, else null (empty, a placeholder, a secret or no such column).
const valueOf = (get) => (raw, column) => {
  const v = get(raw, column);
  return v === null || v === '' || isPlaceholder(v) ? null : v;
};

const placeOf = (index, raw, column, file) => ({ file, ...cellAt(raw, index.get(column) ?? 0) });

// Reads the criteria table into the registry of criteria. Returns { criteria, weighted } or null when the file lacks the
// column it cannot be read without.
function readCriteria(table, add) {
  const { index, missing } = readHeader(table, { names: CRITERIA_COLUMN_NAMES, needed: CRITERIA_NEEDED, file: 1, add, label: 'the criteria file' });
  const home = { file: 1, line: table.header.line, column: 1 };
  for (const name of missing) add('column-missing', home, `The header of the criteria file has no "${name}" column, which the tool needs to read it.`, name);
  const weighted = index.has('weight');
  if (!weighted && missing.length === 0) add('column-missing', home, 'The header of the criteria file has no "weight" column, so it cannot give the weights; they are read from the scores file.', 'weight');
  if (missing.length > 0) return null;
  const get = cellsOf(table, index);
  const val = valueOf(get);
  const criteria = new Map();
  const width = table.header.cells.length;
  table.rows.forEach((raw, r) => {
    const n = r + 1;
    if (raw.cells.length !== width) {
      add('row-malformed', { file: 1, line: raw.line, column: 1 }, `Row ${n} of the criteria file has ${raw.cells.length} cells but the header has ${width}; the row was left out of every other check.`);
      return;
    }
    const name = val(raw, 'criterion');
    if (name === null) {
      if (get(raw, 'criterion') !== null) add('cell-incomplete', placeOf(index, raw, 'criterion', 1), `Row ${n} of the criteria file has no value in the cell under "criterion"; the row was left out.`);
      return;
    }
    const key = nameKey(name);
    const first = criteria.get(key);
    if (first) {
      add('duplicate-pair', placeOf(index, raw, 'criterion', 1), `Row ${n} of the criteria file lists the criterion "${show(name)}" again; row ${first.n}, on line ${first.line}, already does. The row was left out of the other checks.`, show(name));
      return;
    }
    let weight = null;
    if (weighted) {
      const text = val(raw, 'weight');
      const at = placeOf(index, raw, 'weight', 1);
      if (text === null) {
        if (get(raw, 'weight') !== null) add('weight-not-positive', at, `The criterion "${show(name)}" in row ${n} of the criteria file has no weight; it must be a plain number above zero.`, show(name));
      } else {
        const d = parseDecimal(text);
        if (d === null || isZero(d)) add('weight-not-positive', at, `The weight of row ${n} of the criteria file, "${show(text)}", is not a plain number above zero (no sign, no exponent, no thousands separator, at most 40 digits).`, show(name));
        else weight = d;
      }
    }
    let required = false;
    const flag = val(raw, 'required');
    if (flag !== null) {
      const lower = flag.toLowerCase();
      if (lower === 'yes') required = true;
      else if (lower !== 'no') add('yes-no-unreadable', placeOf(index, raw, 'required', 1), `The required cell of row ${n} of the criteria file, "${show(flag)}", is not yes or no; the criterion is read as not required.`, show(name));
    }
    criteria.set(key, { key, name, weight, fixed: weighted, required, n, line: raw.line, where: { file: 1, line: raw.line, column: 1 }, rowCount: 0, scorers: 0, weightFrom: null });
  });
  return { criteria, weighted };
}

// Reads the two tables into the model, with the findings of the headers and of every row. criteriaTable is null when there is
// no criteria file. Returns { model, summary }; model is null when the files cannot be read as a scorecard.
export function readScorecard(scores, criteriaTable, add, notes, { evidenceAbove }) {
  let registry = null;
  let criteriaWeights = false;
  if (criteriaTable !== null) {
    registry = readCriteria(criteriaTable, add);
    if (registry === null) notes.push('the criteria file was not read, because it has no criterion column');
    else criteriaWeights = registry.weighted;
  }
  const { index, missing } = readHeader(scores, { names: COLUMN_NAMES, needed: NEEDED, file: 0, add, label: 'the scores file' });
  const home = { file: 0, line: scores.header.line, column: 1 };
  for (const name of missing) add('column-missing', home, `The header has no "${name}" column, which the tool needs.`, name);
  const weightColumn = index.has('weight');
  const weightMissing = !weightColumn && !criteriaWeights;
  if (weightMissing) add('column-missing', home, 'The header has no "weight" column, and no criteria file brings the weights.', 'weight');
  if (missing.length > 0 || weightMissing || (criteriaTable !== null && registry === null)) {
    notes.push('the files were not checked beyond their headers, because a column the tool needs is missing');
    return { model: null, summary: null };
  }

  const criteria = registry ? registry.criteria : new Map();
  const criteriaMode = registry !== null;
  const vendors = new Map();
  const unlisted = new Set();
  const get = cellsOf(scores, index);
  const val = valueOf(get);
  const width = scores.header.cells.length;
  let read = 0;
  scores.rows.forEach((raw, r) => {
    const n = r + 1;
    if (raw.cells.length !== width) {
      add('row-malformed', { file: 0, line: raw.line, column: 1 }, `Row ${n} has ${raw.cells.length} cells but the header has ${width}; the row was left out of every other check.`);
      return;
    }
    const vendor = val(raw, 'vendor');
    const criterion = val(raw, 'criterion');
    if (vendor === null || criterion === null) {
      for (const [column, v] of [['vendor', vendor], ['criterion', criterion]]) {
        if (v === null && get(raw, column) !== null) add('cell-incomplete', placeOf(index, raw, column, 0), `Row ${n} has no value in the cell under "${column}", which every row needs; the row was left out.`);
      }
      return;
    }
    const vkey = nameKey(vendor);
    const ckey = nameKey(criterion);
    let crit = criteria.get(ckey);
    if (crit === undefined && criteriaMode) {
      if (!unlisted.has(ckey)) {
        unlisted.add(ckey);
        add('criterion-not-in-criteria', placeOf(index, raw, 'criterion', 0), `The criterion "${show(criterion)}" of row ${n} is not in the criteria file, so it has no weight from it; the rows of this criterion were left out.`, show(criterion));
      }
      return;
    }
    let entry = vendors.get(vkey);
    const again = entry?.rows.get(ckey);
    if (again) {
      add('duplicate-pair', placeOf(index, raw, 'vendor', 0), `Row ${n} scores the vendor "${show(vendor)}" on the criterion "${show(criterion)}" again; row ${again.n}, on line ${again.line}, already does. The row was left out of the other checks.`, `${show(vendor, 40)} / ${show(criterion, 40)}`);
      return;
    }
    if (crit === undefined) {
      crit = { key: ckey, name: criterion, weight: null, fixed: false, required: false, n, line: raw.line, where: { file: 0, line: raw.line, column: 1 }, rowCount: 0, scorers: 0, weightFrom: null };
      criteria.set(ckey, crit);
    }
    if (entry === undefined) {
      entry = { key: vkey, name: vendor, line: raw.line, rows: new Map(), redFlags: 0, redFlagCriteria: [] };
      vendors.set(vkey, entry);
    }
    read += 1;
    crit.rowCount += 1;
    const subject = `${show(vendor, 40)} / ${show(criterion, 40)}`;
    const rec = { n, line: raw.line, score: null, state: 'empty' };
    entry.rows.set(ckey, rec);

    // The weight: from the criteria file when it brings the weights, else the first valid weight of the criterion.
    if (weightColumn) {
      const text = val(raw, 'weight');
      const at = placeOf(index, raw, 'weight', 0);
      if (text === null) {
        if (!criteriaWeights && get(raw, 'weight') !== null) add('weight-not-positive', at, `Row ${n} has no weight for the criterion "${show(criterion)}"; it must be a plain number above zero.`, subject);
      } else {
        const d = parseDecimal(text);
        if (d === null || isZero(d)) add('weight-not-positive', at, `The weight of row ${n}, "${show(text)}", is not a plain number above zero (no sign, no exponent, no thousands separator, at most 40 digits).`, subject);
        else if (crit.weight === null) {
          if (!crit.fixed) {
            crit.weight = d;
            crit.weightFrom = { n, line: raw.line };
          }
        } else if (compareDecimal(d, crit.weight) !== 0) {
          const from = crit.fixed ? `the criteria file, on line ${crit.line}, gives it ${formatDecimal(crit.weight)}` : `row ${crit.weightFrom.n}, on line ${crit.weightFrom.line}, gives it ${formatDecimal(crit.weight)}`;
          add('weight-differs', at, `The weight of row ${n} for the criterion "${show(criterion)}" is ${formatDecimal(d)}, but ${from}. The first weight is the one used.`, subject);
        }
      }
    }

    // The score.
    const scoreText = val(raw, 'score');
    const scoreAt = placeOf(index, raw, 'score', 0);
    if (scoreText !== null) {
      const d = parseDecimal(scoreText);
      if (d === null) {
        rec.state = 'invalid';
        add('score-invalid', scoreAt, `The score of row ${n}, "${show(scoreText)}", is not a plain number from 0 to ${MAX_SCORE} (no sign, no exponent, a point and not a comma, at most 40 digits). The criterion counts as unscored for this vendor.`, subject);
      } else if (compareDecimal(d, MAX) > 0) {
        rec.state = 'invalid';
        add('score-invalid', scoreAt, `The score of row ${n}, ${show(scoreText)}, is above ${MAX_SCORE}. The criterion counts as unscored for this vendor.`, subject);
      } else {
        rec.state = 'ok';
        rec.score = d;
        crit.scorers += 1;
      }
    } else if (get(raw, 'score') !== null) {
      add(crit.required ? 'required-unscored' : 'criterion-unscored', scoreAt, `Row ${n} leaves the criterion "${show(criterion)}" unscored for the vendor "${show(vendor)}"${crit.required ? ', and the criteria file marks it required' : ''}.`, subject);
    }

    // The evidence.
    const evidence = get(raw, 'evidence');
    const evidenceAt = placeOf(index, raw, 'evidence', 0);
    const text = evidence === null || isPlaceholder(evidence) ? '' : evidence;
    if (rec.state === 'ok' && evidence !== null && text === '' && compareDecimal(rec.score, evidenceAbove) > 0) {
      add('evidence-missing', evidenceAt, `Row ${n} scores "${show(criterion)}" at ${formatDecimal(rec.score)} for "${show(vendor)}" with nothing in the evidence cell; a score above ${formatDecimal(evidenceAbove)} should point at where it comes from.`, subject);
    }
    if (text !== '') {
      const bad = badEvidence(text);
      if (bad !== null) add('evidence-form', evidenceAt, `The evidence of row ${n}, "${show(bad, 80)}", is not a web address that starts with http:// or https://, and not a document reference such as DOC-12.`, subject);
    }

    // The red flag.
    const flag = val(raw, 'red_flag');
    if (flag !== null) {
      const lower = flag.toLowerCase();
      const at = placeOf(index, raw, 'red_flag', 0);
      if (lower === 'yes') {
        entry.redFlags += 1;
        if (entry.redFlagCriteria.length < 50) entry.redFlagCriteria.push(show(criterion, 60));
        const note = val(raw, 'note');
        add('red-flag-raised', at, `The vendor "${show(vendor)}" has a red flag for the criterion "${show(criterion)}" in row ${n}.${note === null ? '' : ` Note: "${show(note, 100)}".`}`, subject);
      } else if (lower !== 'no') {
        add('yes-no-unreadable', at, `The red_flag of row ${n}, "${show(flag)}", is not yes or no; it is read as no.`, subject);
      }
    }
  });
  return {
    model: { vendors, criteria, criteriaMode, unlisted: unlisted.size },
    summary: { rows: scores.rows.length, read, skipped: scores.rows.length - read, columns: scores.header.cells.length, columnsRead: index.size }
  };
}
