// The columns the tool reads. The names and the order of the columns are this tool's own choice: no standard fixes them.
// A column is found by its name with case and separators ignored.

export const normalizeName = (text) => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// The columns of the scores file: one row for each vendor and criterion.
export const COLUMNS = [
  { name: 'vendor', summary: 'the vendor the row scores; a name in the words of the shortlist' },
  { name: 'criterion', summary: 'the criterion the row scores, such as chain experience or pricing clarity' },
  { name: 'weight', summary: 'what the criterion counts for: a plain number above zero, the same on every row of the criterion; not needed when a criteria file gives the weights' },
  { name: 'score', summary: 'the score from 0 to 5 as a plain decimal; empty means not scored' },
  { name: 'evidence', summary: 'where the score comes from: a web address that starts with http:// or https://, or a document reference such as DOC-12; several separated by semicolons' },
  { name: 'red_flag', summary: 'yes when the answer for this vendor and criterion is a red flag, no or empty otherwise' },
  { name: 'note', summary: 'free text for the reader; kept, never compared' }
];

export const COLUMN_NAMES = COLUMNS.map((c) => c.name);

// The columns of the criteria file given with --criteria: one row for each criterion.
export const CRITERIA_COLUMNS = [
  { name: 'criterion', summary: 'the criterion, written as in the scores file' },
  { name: 'weight', summary: 'what the criterion counts for: a plain number above zero; the source of the weights when it is there' },
  { name: 'required', summary: 'yes when every vendor must be scored on the criterion, no or empty otherwise' },
  { name: 'description', summary: 'free text for the reader; kept, never compared' }
];

export const CRITERIA_COLUMN_NAMES = CRITERIA_COLUMNS.map((c) => c.name);

// The columns that each file cannot be read without. The weight of the scores file is needed unless the criteria file
// brings the weights; that is decided where the files are read.
export const NEEDED = ['vendor', 'criterion', 'score'];
export const CRITERIA_NEEDED = ['criterion'];

// The number of edits (insert, delete, replace) between two short texts, capped.
export function editDistance(a, b) {
  const x = a.slice(0, 60);
  const y = b.slice(0, 60);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= y.length; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

// The name nearest to a text, within two edits, or null.
export function nearest(text, names) {
  let best = null;
  let bestDistance = 3;
  for (const n of names) {
    const d = editDistance(text, n);
    if (d < bestDistance) {
      best = n;
      bestDistance = d;
    }
  }
  return best;
}
