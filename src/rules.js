// The checks. Each has an id that stays the same once released (pipelines and other tools read it from the JSON, SARIF and
// markdown output), a level, a kind, what it looks at, what to change, why it is a check at all and what it cannot see.
//
// kind 'file'         a problem with a file itself, or with a column or a row of it
// kind 'row'          a problem in one row, found from the row alone
// kind 'across rows'  a problem found by putting rows side by side
//
// No standard is behind any of them. `own` says that, and says why the tool asks for it. The tool does arithmetic and
// bookkeeping on the scores people enter; it does not judge a vendor.

import { BEST, LEVELS } from './data.js';

const ONLY = (what, why) => `${what} is ${BEST}; ${why}`;

export const RULES = [
  {
    id: 'file-unreadable',
    severity: 'error',
    kind: 'file',
    summary: 'a file is not a table the reader can follow (a quote never closed, text after a closing quote, a cell too long, semicolons for commas) or holds a header and no rows, so nothing in it was checked',
    fix: 'Save the file as CSV with commas or TSV with tabs, a header row and one row for each vendor and criterion (docs/inputs.md); fix the line named.',
    own: ONLY('Refusing a file that cannot be followed', 'a tool that guessed would rank vendors on cells it did not read'),
    cannot: 'It says where the reader stopped, not what a spreadsheet program would make of the file.'
  },
  {
    id: 'column-missing',
    severity: 'error',
    kind: 'file',
    summary: 'a column the tool cannot work without is not in the header: vendor, criterion and score of the scores file, its weight unless a criteria file brings the weights, and the criterion and the weight of the criteria file; reported once, at the header',
    fix: 'Add the column named to the spreadsheet; docs/inputs.md lists every column. The evidence and red_flag columns may be left out, and then every evidence and every red flag is read as empty.',
    own: ONLY('Asking for these columns', 'the names are the tool\'s own, because no standard fixes the columns of a scorecard'),
    cannot: 'It looks at the header only. A column of the right name that holds the wrong thing is not seen.'
  },
  {
    id: 'column-unknown',
    severity: 'warning',
    kind: 'file',
    summary: 'a column the tool does not read, often a misspelt name; nothing under it was checked',
    fix: 'Correct the name to a column of docs/inputs.md, or leave the column in if it is for your own use.',
    own: ONLY('Reporting a column that is not read', 'a misspelt name would otherwise hide a cell from every check'),
    cannot: 'It suggests the nearest name within two edits and cannot tell a misspelling from a column you meant to add.'
  },
  {
    id: 'column-duplicate',
    severity: 'error',
    kind: 'file',
    summary: 'two columns of a header have the same name once case and separators are ignored; only the first is read',
    fix: 'Keep one column of each name.',
    own: ONLY('Refusing a column written twice', 'two readers could see two values'),
    cannot: 'It compares names only; two columns with different names that hold the same thing are not seen.'
  },
  {
    id: 'row-malformed',
    severity: 'error',
    kind: 'file',
    summary: 'a row with more or fewer cells than the header, which usually means a comma that is not in quotes; the row was left out of every other check',
    fix: 'Put a cell that holds a comma, a tab or a line end in double quotes, and write a quote inside it as two quotes.',
    own: ONLY('Reporting a row of the wrong width', 'every cell after the extra one would be shifted and read as another column'),
    cannot: 'It counts cells. It cannot tell which cell is the extra one.'
  },
  {
    id: 'secret-in-file',
    severity: 'error',
    kind: 'file',
    summary: 'a file holds a private key, a seed or a mnemonic, under a column named for one or as a cell shaped like one; the tool never reads it and never shows it',
    fix: 'Remove the value from the file and from wherever the file was copied, treat it as exposed and move what it controls to a new key. A scorecard names vendors, criteria and scores, never the key of an account.',
    own: ONLY('Looking for keys and seeds', 'a report must never copy a secret into a log or a pull request comment'),
    cannot: 'The shapes are loose and few (docs/limits.md). A secret in another shape is not found, and a 64-digit hex value in the evidence column is read as a hash used as a reference.'
  },
  {
    id: 'cell-incomplete',
    severity: 'error',
    kind: 'row',
    summary: 'a row with no vendor, or no criterion, or a row of the criteria file with no criterion, or the text n/a, none, tbd or a dash in place of one; the row was left out',
    fix: 'Fill the cell, or delete the row if it is a leftover.',
    own: ONLY('Asking for a vendor and a criterion on every row', 'a score that belongs to nobody or to nothing cannot be counted'),
    cannot: 'It sees an empty cell. It cannot tell a vendor that is spelt two ways; "Vendor Alpha" and "Vendor Alpha Ltd" are two vendors.'
  },
  {
    id: 'duplicate-pair',
    severity: 'error',
    kind: 'across rows',
    summary: 'the same vendor and criterion on two rows, or the same criterion twice in the criteria file; names are compared without regard to case and runs of white space; the second row was left out',
    fix: 'Keep one row for each vendor and criterion, or one row for each criterion in the criteria file.',
    own: ONLY('Refusing a pair written twice', 'two scores for one cell would make the weighted score depend on which one is read'),
    cannot: 'It compares the names as written. Two spellings of one vendor are two vendors.'
  },
  {
    id: 'weight-not-positive',
    severity: 'error',
    kind: 'row',
    summary: 'a weight that is not a plain number above zero (zero, negative, with a thousands separator, with an exponent, text, empty where the scores file gives the weights, or with more than 40 digits)',
    fix: 'Write the weight as a plain number above zero, such as 2 or 1.5.',
    own: ONLY('Asking for a plain number above zero', 'a weight of zero or one that is text cannot be added up'),
    cannot: 'It does not know what a weight should be. Whether 3 is too much for a criterion is for the people who score.'
  },
  {
    id: 'weight-differs',
    severity: 'error',
    kind: 'across rows',
    summary: 'a criterion with a different weight on two rows, or on a row and in the criteria file; the first weight, or the one of the criteria file, is the one used',
    fix: 'Give the criterion one weight and write it on every row, or leave the weight out of the scores file and give it in the criteria file.',
    own: ONLY('Asking for one weight for a criterion', 'a criterion that counts for 2 on one vendor and 3 on another makes the scores of the vendors unequal'),
    cannot: 'It compares the numbers as written (2 and 2.0 are the same). It cannot say which of two weights was meant.'
  },
  {
    id: 'score-invalid',
    severity: 'error',
    kind: 'row',
    summary: 'a score that is not a plain number from 0 to 5: text, negative, above 5, a comma for the point, with an exponent or with more than 40 digits; the criterion counts as unscored for that vendor',
    fix: 'Write the score as a plain number from 0 to 5, with a point, such as 4 or 3.5, or leave the cell empty if the vendor was not scored.',
    own: ONLY('Reading only plain numbers from 0 to 5', 'a score that is read some other way would change the ranking without anyone seeing it'),
    cannot: 'It does not know what a score of 3 means. The scale is the one of the people who score.'
  },
  {
    id: 'yes-no-unreadable',
    severity: 'error',
    kind: 'row',
    summary: 'a red_flag cell or a required cell that is not yes, no or empty (in any case); it is read as no',
    fix: 'Write yes or no, or leave the cell empty.',
    own: ONLY('Reading only yes and no', 'a red flag written as "maybe" or "y" would otherwise pass as no flag'),
    cannot: 'It cannot tell what a cell such as "maybe" was meant to say; it reads it as no and says so.'
  },
  {
    id: 'criterion-not-in-criteria',
    severity: 'error',
    kind: 'across rows',
    summary: 'a criterion of the scores file that the criteria file does not list, so it has no weight from the criteria file; its rows were left out, and it is reported once',
    fix: 'Add the criterion to the criteria file, or correct its name in the scores file.',
    own: ONLY('Keeping the two files in step', 'a criterion without a weight from the file that owns the weights would count for nothing, or for a weight nobody agreed'),
    cannot: 'It compares names as written; a criterion spelt another way is a criterion that is not listed.'
  },
  {
    id: 'criterion-unscored',
    severity: 'warning',
    kind: 'row',
    summary: 'a row with an empty score for a criterion that is not marked required in a criteria file; the vendor is not scored on it, and its weight is left out of the weighted score of the vendor',
    fix: 'Score the criterion, or leave it unscored on purpose and check that the coverage of the vendor is still enough.',
    own: ONLY('Listing every criterion left unscored', 'a vendor scored on fewer criteria is not ranked on the same ground as the others'),
    cannot: 'It does not know why the cell is empty. A criterion that does not apply to a vendor is listed too.'
  },
  {
    id: 'required-unscored',
    severity: 'error',
    kind: 'across rows',
    summary: 'a criterion that the criteria file marks required is unscored for a vendor, by an empty score or by a missing row',
    fix: 'Score the criterion for the vendor, or take the mark required off it in the criteria file.',
    own: ONLY('Letting the criteria file say what must be scored', 'a ranking that skips a required criterion for one vendor compares unlike things'),
    cannot: 'It follows the mark required as written. It cannot say whether the criterion should be required.'
  },
  {
    id: 'vendor-misses-criterion',
    severity: 'warning',
    kind: 'across rows',
    summary: 'a vendor with no row at all for a criterion that other vendors have rows for',
    fix: 'Add the row, with a score or with an empty score on purpose, so that the sheet shows the gap.',
    own: ONLY('Comparing the criteria of the vendors', 'a missing row is easy to overlook, and it leaves the vendor with a lower coverage'),
    cannot: 'It compares the rows of the file. A vendor that was left out of a round of scoring on purpose is listed.'
  },
  {
    id: 'criterion-never-scored',
    severity: 'error',
    kind: 'across rows',
    summary: 'a criterion that no vendor has a score for: listed in the criteria file with no row, or with every row empty or unreadable; it counts for nothing in the weighted scores',
    fix: 'Score the criterion for the vendors, or take it out of the criteria file and the scores file.',
    own: ONLY('Listing a criterion nobody scored', 'it takes weight in the sheet and counts for nothing in the ranking, which looks like a decision and is not one'),
    cannot: 'It sees the cells. It cannot say whether the criterion was dropped on purpose.'
  },
  {
    id: 'evidence-missing',
    severity: 'warning',
    kind: 'row',
    summary: 'a score above the --evidence-above threshold (default 3) with nothing in the evidence cell',
    fix: 'Put the web address or the document reference that the score rests on in the evidence cell, or lower the score.',
    own: ONLY('Asking for evidence behind a high score', 'a high score with nothing behind it cannot be checked by a second reader'),
    cannot: 'It sees an empty cell. It does not open a link or a document, and it cannot say whether the evidence supports the score.'
  },
  {
    id: 'evidence-form',
    severity: 'info',
    kind: 'row',
    summary: 'evidence that is not a web address starting with http:// or https:// and not a document reference such as DOC-12 (pieces separated by semicolons are looked at one by one)',
    fix: 'Write the evidence as a web address or as a document reference, so that a second reader can find it.',
    own: ONLY('Looking at the form of the evidence', 'a sentence such as "as discussed" cannot be followed up'),
    cannot: 'It looks at the form only. It never fetches a link, and a web address that goes nowhere passes.'
  },
  {
    id: 'red-flag-raised',
    severity: 'warning',
    kind: 'row',
    summary: 'a red_flag answer of yes for a vendor and a criterion; every one is listed, and the ranking table counts them for each vendor',
    fix: 'Read the note and decide, as a person, what the red flag means for the shortlist. The tool does not drop a vendor and does not change a score for it.',
    own: ONLY('Listing every red flag', 'a red flag in a spreadsheet is easy to lose among the scores'),
    cannot: 'It does not weigh a red flag or judge it. It only makes sure that the answers of yes are in front of the reader.'
  },
  {
    id: 'coverage-low',
    severity: 'warning',
    kind: 'across rows',
    summary: 'a vendor whose scored weight is below the --min-coverage share (default 80 percent) of the total weight; its weighted score rests on too little of the scorecard',
    fix: 'Score the missing criteria for the vendor, or read its weighted score as a score on part of the scorecard.',
    own: ONLY('Reporting coverage next to the score', 'a high score on few criteria looks the same as a high score on all of them'),
    cannot: 'It counts weight. It does not know which of the criteria that are missing matters most.'
  },
  {
    id: 'tie-too-close',
    severity: 'info',
    kind: 'across rows',
    summary: 'two vendors next to each other in the ranking whose weighted scores differ by less than the --tie-margin (default 0.10), compared exactly; the order between them is too close to call',
    fix: 'Do not treat the order of the two as a result. Look at the criteria that differ, at the evidence and at the red flags, or score again.',
    own: ONLY('Saying when the ranking cannot separate two vendors', 'a rank of 1 and a rank of 2 read as a gap, even when the scores are a hair apart'),
    cannot: 'It looks at neighbours in the ranking. It does not say how much a score of 0.1 is worth, and it does not know how sure the people who scored were.'
  }
];

export const ruleById = (id) => RULES.find((r) => r.id === id);

export const atOrAbove = (level, floor) => LEVELS.indexOf(level) >= LEVELS.indexOf(floor);

// The result of a run: pass unless a finding is at or above the fail-on level.
export function decide(byLevel, failOn) {
  const failing = LEVELS.filter((l) => atOrAbove(l, failOn)).reduce((n, l) => n + (byLevel[l] ?? 0), 0);
  const total = LEVELS.reduce((n, l) => n + (byLevel[l] ?? 0), 0);
  const parts = ['error', 'warning', 'info'].filter((l) => byLevel[l]).map((l) => `${byLevel[l]} ${l}`);
  const detail = parts.length ? ` (${parts.join(', ')})` : '';
  if (failing > 0) return { pass: false, failOn, text: `FAIL - ${failing} ${failing === 1 ? 'finding' : 'findings'} at or above ${failOn}${detail}` };
  return { pass: true, failOn, text: `PASS - no finding at or above ${failOn}${total ? detail : ''}` };
}
