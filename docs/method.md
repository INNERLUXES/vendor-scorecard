# Method

This document says what each check reads, in what order the work is done, and what each check cannot see. The tool does
arithmetic and bookkeeping on the scores people enter. It does not judge vendors, it does not check that a score or a link is
true, and it is not advice. Every check is a best practice of this tool; no standard sets any of them.

## The order of the work

1. **The files are read as tables** (`src/csv.js`). A file that cannot be followed ends the run with a `file-unreadable`
   finding.
2. **Every column name and every cell is looked at for a key or a seed** (`src/secrets.js`). A cell found is marked, and every
   later step reads it as if it were not there.
3. **The headers are read.** A column is found by its name; unknown and repeated columns are reported; a column the tool
   cannot work without is reported once.
4. **The criteria file is read**, if there is one: one criterion for each row, its weight and whether it is required.
5. **Each row of the scores file is read on its own** (`src/read.js`): the vendor and criterion, the weight, the score, the
   evidence and the red flag. The checks of a row run here, in the order of the columns.
6. **The checks across rows run** (`src/across.js`): a criterion nobody scored, the vendors that miss a criterion, coverage,
   the ranking and the ties.
7. **The report is built** (`src/check.js`, `src/report.js`): findings sorted by level, then file, then line.

## The arithmetic

A weight and a score are read from the characters of the cell into a whole number and a scale (`src/decimal.js`). The
weighted score of a vendor is kept as a fraction of two whole numbers, `sum(weight * score)` over `sum(weight)` of the scored
criteria, and is compared with other scores by cross multiplication. It is rounded half up to two decimals only when it is
shown; coverage is rounded in the same way to one decimal. No floating point number is used, so a difference of one part in
a quintillion between two vendors is seen, and a minimum coverage of 80 percent is met by exactly 80 percent.

Vendors are ranked by the exact score. Equal scores share a rank and the next rank is skipped. The order of equal scores in
the table is the order of the vendors' names, so the same input gives the same table.

## The checks of a file

**`file-unreadable`.** A file that is not a table the reader can follow, or that holds a header and no rows. The reader
refuses a quote that is never closed, text after a closing quote, a quote inside a cell that does not start with one, a cell
over 20,000 characters, a row over 200 cells, a file over 3,000,000 cells and a first line separated by semicolons. It cannot
tell what a spreadsheet program would make of the file.

**`column-missing`.** The scores file needs `vendor`, `criterion` and `score`, and `weight` unless the criteria file brings the
weights; the criteria file needs `criterion` and should have `weight`. Without the first set the run is not checked beyond its
headers. A criteria file without a weight column is reported, and the weights are then read from the scores file. The
`evidence` and `red_flag` columns may be left out; every evidence and every red flag is then read as empty, so the scores above
the threshold are reported as having no evidence.

**`column-unknown`.** A column the tool does not read, with the nearest column name within two edits. A secret column is not
reported again here.

**`column-duplicate`.** A column name that appears twice once case and separators are ignored. The first is read.

**`row-malformed`.** A row whose number of cells is not the number of cells of the header. The row is left out of every other
check, so that a shifted cell is never read as another column.

**`secret-in-file`.** Described in [limits](limits.md): a column named for a key or a seed, or a cell shaped like a mnemonic,
an extended private key, a private key in hex or a key in WIF. A cell of 64 hex digits in the evidence column is a hash used
as a reference.

## The checks of a row

**`cell-incomplete`.** A vendor or a criterion that is empty or a placeholder. The row is left out. A row of the criteria file
with no criterion is reported in the same way.

**`weight-not-positive`.** A weight that is not a plain decimal above zero. With a criteria file that has a weight column, an
empty weight in the scores file is fine; one that is written must still be a number. A criterion with no valid weight at all
is left out of the weighted scores and the coverage, and a note says so.

**`score-invalid`.** A score that is not a plain decimal from 0 to 5. The criterion counts as unscored for the vendor and is
not reported again as unscored.

**`yes-no-unreadable`.** A `red_flag` cell, or a `required` cell, that is not `yes`, `no` or empty. It is read as no.

**`criterion-unscored`.** An empty score for a criterion that is not required. The weight of the criterion is left out of the
vendor's weighted score and its coverage.

**`evidence-missing`.** A valid score strictly above the threshold (`--evidence-above`, default 3) with an empty evidence
cell. A score equal to the threshold needs no evidence. The cell where the evidence would be is the place of the finding.

**`evidence-form`.** Evidence that has neither accepted form, checked piece by piece when the pieces are separated by
semicolons. A web address is `http://` or `https://`, a host with at least one dot and no user name or password, an optional
port and an optional path. A document reference is two to ten letters, a hyphen or a hash sign, and a short code of letters,
digits and `._/-`. Only the form is looked at.

**`red-flag-raised`.** A `red_flag` of `yes`. One finding for each row, with the note of the row, and a count for each vendor
in the ranking table and the list of red flags by vendor in the report.

## The checks across rows

**`duplicate-pair`.** The same vendor and criterion on two rows, or the same criterion twice in the criteria file. The second
is reported and left out of every other check, so the first is the one counted.

**`weight-differs`.** A weight that differs from the first valid weight of its criterion, or from the criteria file. 3 and 3.0
are the same weight. The first weight, or the one of the criteria file, is the one used in the arithmetic.

**`criterion-not-in-criteria`.** With a criteria file, a criterion of the scores file that it does not list. It is reported
once, at its first row, and its rows are left out.

**`required-unscored`.** A criterion the criteria file marks required that is unscored for a vendor, by an empty score or by a
missing row. It stands in the place of `criterion-unscored` and `vendor-misses-criterion` for a required criterion.

**`vendor-misses-criterion`.** A vendor with no row at all for a criterion that another vendor has a row for. A criterion no
vendor has a row for is reported once by `criterion-never-scored`, not once for each vendor. The work is linear: a vendor that
misses many criteria is counted, and only the first findings of the check are built.

**`criterion-never-scored`.** A criterion with no valid score from any vendor: listed in the criteria file with no row, or
named by rows that are all empty or unreadable. It counts for nothing in the weighted scores.

**`coverage-low`.** A vendor whose scored weight is below `--min-coverage` percent of the total weight of the criteria that
have a weight, compared exactly. The finding is at the first row of the vendor.

**`tie-too-close`.** Two vendors next to each other in the ranking whose exact scores differ by less than `--tie-margin`. Only
neighbours are compared, so the work is linear: with three vendors 0.08 apart in a row, the first and the third are 0.16 apart
and are not reported as a pair. A vendor with no score is not compared. A margin of 0 turns the check off.

## What the tool does not do

It does not change a score because of a red flag, because of missing evidence or because of low coverage. It does not drop a
vendor. It does not open a link. It does not say whether a weight, a criterion or a score is right. It lists, and the people
who keep the scorecard decide.
