# vendor-scorecard

Vendor scorecard. A shortlist of vendors can be scored the same way every time: give it a spreadsheet of vendors, criteria,
weights, scores and evidence links, as CSV or TSV with a header row and one row for each vendor and criterion, and it ranks
the vendors by weighted score and lists, with the line of the cell, criteria left unscored, scores with no evidence behind
them, red-flag answers, vendors scored on too little of the scorecard and ties too close to call. A second file can list the
criteria with their weights and say which of them must be scored for every vendor. Every finding has its id, level, message
and line, and the run exits with a code a pipeline can act on.

**The tool does arithmetic and bookkeeping on scores that people enter. It does not judge vendors, it does not check that a
score or a link is true, and it is not advice.** A clean run means only that none of the problems of its checks were found in
the cells of the file. A red flag does not drop a vendor and does not change a score, and the order of the ranking is only as
good as the scores behind it. Every check is a best practice of this tool: no standard sets any of them, and the reports say
so. It reads the files you give it and nothing else: it contacts nothing over the network (a link in the evidence column is
only text and is never opened), runs nothing, needs no key, reads no clock and writes nothing.

The mistakes in a scorecard tend to be the same: a criterion left empty for one vendor and not for the others, a weight that
is 2 on one row and 3 on another, a high score with nothing behind it, a red flag that sits in a column nobody reads, two
vendors a few hundredths apart ranked as if one were clearly ahead. They change the order of a shortlist without anyone seeing
it. This tool reads the sheet on every edit and points at the cell.

- **One check per problem.** Twenty-two checks, each marked as a check of a file, of a row or across rows, each with what it
  looks at, what to change, why it is a check at all and what it cannot see. Each message says what was found and where.
- **Exact arithmetic.** The weighted score is `sum(weight * score) / sum(weight of the scored criteria)`, worked out with
  whole numbers (BigInt) and never through a floating point number, and rounded half up to two decimals only when it is
  shown. Scores that are a hair apart are told apart, and 0.1 and 0.2 add up to 0.3.
- **Coverage next to the score.** Each vendor shows the share of the total weight it was scored on, so a high score on few
  criteria does not look like a high score on all of them.
- **Evidence behind a high score.** A score above a threshold (3 by default) with an empty evidence cell is a warning, and
  evidence that is neither a web address nor a document reference such as `DOC-12` is a note. The tool never opens a link.
- **Red flags in front of the reader.** Every answer of `yes` in the `red_flag` column is listed, and the ranking table counts
  them for each vendor.
- **Ties said out loud.** Two vendors next to each other in the ranking whose weighted scores differ by less than a margin
  (0.10 by default) are listed as too close to call, compared exactly.
- **Required criteria.** A criteria file can mark a criterion required; an empty or missing score for it is then an error.
- **A reader of its own.** The CSV and TSV reader keeps the line and column of every cell, follows quotes and line ends inside
  a cell, and refuses what it cannot follow instead of guessing. A row with the wrong number of cells is a finding and is
  left out of the other checks; it is never taken for a row that is fine.
- **Never a secret.** The tool needs no private key, no seed and no API key. A column named for a private key or a seed, and a
  cell shaped like a mnemonic, an extended private key, a private key in hex or a key in WIF, is an error, and the value is
  never shown in any report.
- **No pairwise work, no recursion.** Vendors and criteria are kept in maps, a vendor that misses thousands of criteria is
  counted and not walked, and a scorecard of a hundred thousand rows is read in good time.
- Reports as text, markdown, JSON and SARIF, with an exit code for a pipeline: `0` no finding at or above the `--fail-on`
  level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies, no clock and no network.

```
npm test
```

```
tests 159
pass 157
fail 0
skipped 2
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a symbolic
link or a device (a link to a scores file, and `/dev/null` named as a file); they are guarded with `process.platform`, run on
Linux and macOS, and none of them asserts a line. `npm run test:coverage` runs the same tests with coverage; their time limits
are four times wider when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/vendor-scorecard.git
cd vendor-scorecard
node bin/vendor-scorecard.js examples/bad/scores.csv --criteria examples/bad/criteria.csv
```

Or without a clone, in your own project:

```
npx --yes github:INNERLUXES/vendor-scorecard scores.csv --criteria criteria.csv
```

To see why a check exists, what it cannot see and what to change:

```
node bin/vendor-scorecard.js --explain tie-too-close
node bin/vendor-scorecard.js --list-checks
```

`examples/` holds two made-up scorecards. Every vendor in them is made up (Vendor Alpha, Vendor Beta, Vendor Gamma and Vendor
Delta), every link is on example.com, and no real company, person, price or date appears anywhere. The good one, in
`examples/good`, passes at error, warning and info level: four vendors scored on seven criteria (chain experience, published
audits, security practice, integration, references, pricing clarity and support after launch), with a link or a document
reference behind every score. The bad one, in `examples/bad`, holds a mistake of every check but `file-unreadable`, which
fires only on a file the reader cannot follow: a criteria file with no weight column, a column the tool does not read and one
written twice, a row of four cells, a seed phrase in a note cell, a row with no vendor, a vendor and criterion written
twice, a weight of zero and a criterion with two weights, a score of 7, a red flag and a required answer of "maybe", a
criterion that the criteria file does not list and one that nobody scored, an empty score and two required ones, vendors
with no row for a criterion the others have, a high score with no evidence and evidence that is a sentence, a red flag, two
vendors scored on too little of the scorecard and two vendors 0.04 apart.

## Usage

```
vendor-scorecard <scores.csv> [--criteria <criteria.csv>] [options]
vendor-scorecard --list-checks
vendor-scorecard --explain <id>
```

```
--criteria <file>          a CSV or TSV file with the columns criterion, weight, required and description; it becomes the
                           source of the weights, and a criterion marked required must be scored for every vendor
--format <name>            text, markdown, json or sarif (default: text)
--json                     the same as --format json
--min-severity <level>     the lowest level of a finding that is shown: info, warning, error (default: info)
--fail-on <level>          the lowest level of a finding that fails the run: info, warning, error (default: error)
--evidence-above <score>   a score above this needs evidence, a number from 0 to 5 (default: 3)
--min-coverage <percent>   the share of the total weight a vendor should be scored on, from 0 to 100 (default: 80)
--tie-margin <number>      two vendors next to each other in the ranking that differ by less than this are too close to
                           call, a number from 0 to 5 (default: 0.1); 0 turns the check off
--list-checks              list the checks with their level and kind, and exit
--explain <id>             explain one check: what it looks at, what to change, what it cannot see, and exit
--help                     show the usage
--version                  show the version
```

[docs/inputs.md](docs/inputs.md) lists every column the tool reads, the form of the evidence and a short file that passes
every check. The path in the report is relative to the folder you run the command in, with forward slashes on every system,
followed by the line. "Row 5" in a message is the fifth row after the header; the line of its cell is the one after the path.

The report of the bad example starts with what was read, the findings in one line, the ranking, and the checks with the
number of findings of each; then the findings, errors first, each with what to change:

```
vendor-scorecard: examples/bad/scores.csv
file: examples/bad/scores.csv (CSV, 28 lines, 2,830 bytes)
criteria file: examples/bad/criteria.csv (CSV, 9 lines, 549 bytes)
rows: 27 (23 read, 4 rows left out)
columns: 9 in the header, 7 read, 2 not read
scorecard: 4 vendors, 7 weighted criteria, total weight 15
thresholds: evidence needed above 3, minimum coverage 80 percent, tie margin 0.1
findings: 27 (15 error, 10 warning, 2 info)

Ranking (4)

  rank  vendor        score  coverage  red flags  unscored
  1     Vendor Alpha  4.23   100.0%    1          0
  2     Vendor Beta   4.19   86.7%     0          1
  3     Vendor Gamma  3.59   56.7%     0          3
  4     Vendor Delta  2.54   43.3%     0          4

The weighted score is the sum of weight times score over the scored criteria, divided by the weight of the scored criteria, rounded to two decimals. Coverage is the scored weight as a share of the total weight. A rank is shared by equal scores.

Checks (22)

  check                      level    kind         findings
  file-unreadable            error    file         0
  column-missing             error    file         1
  column-unknown             warning  file         1
  column-duplicate           error    file         1
  row-malformed              error    file         1
  secret-in-file             error    file         1
  cell-incomplete            error    row          1
  duplicate-pair             error    across rows  1
  weight-not-positive        error    row          1
  weight-differs             error    across rows  1
  score-invalid              error    row          1
  yes-no-unreadable          error    row          2
  criterion-not-in-criteria  error    across rows  1
  criterion-unscored         warning  row          1
  required-unscored          error    across rows  2
  vendor-misses-criterion    warning  across rows  4
  criterion-never-scored     error    across rows  1
  evidence-missing           warning  row          1
  evidence-form              info     row          1
  red-flag-raised            warning  row          1
  coverage-low               warning  across rows  2
  tie-too-close              info     across rows  1

```

Two of the findings of the bad example, as the report shows them:

```
  WARNING  red-flag-raised            examples/bad/scores.csv:4
           The vendor "Vendor Alpha" has a red flag for the criterion "Security practice" in row 3. Note: "Signing key held by one person only".
           fix: Read the note and decide, as a person, what the red flag means for the shortlist. The tool does not drop a vendor and does not change a score for it.
```

```
  INFO     tie-too-close              examples/bad/scores.csv:2
           The vendors "Vendor Alpha" (4.23) and "Vendor Beta" (4.19) are next to each other in the ranking and differ by less than the tie margin of 0.1; the order between them is too close to call.
           fix: Do not treat the order of the two as a result. Look at the criteria that differ, at the evidence and at the red flags, or score again.
```

The end of the report holds the red flags by vendor, the notes, if any, the notice and the result:

```
note: 1 criterion has no valid weight and is left out of the weighted scores and the coverage

This report is arithmetic and bookkeeping on the scores in the file. It does not judge any vendor, it does not check that a score or a link is true, and it is not advice.

RESULT: FAIL - 15 findings at or above error (15 error, 10 warning, 2 info)

```

The good example passes:

```
vendor-scorecard: examples/good/scores.csv
file: examples/good/scores.csv (CSV, 29 lines, 3,159 bytes)
criteria file: examples/good/criteria.csv (CSV, 8 lines, 548 bytes)
rows: 28
columns: 7 in the header, 7 read, 0 not read
scorecard: 4 vendors, 7 weighted criteria, total weight 15
thresholds: evidence needed above 3, minimum coverage 80 percent, tie margin 0.1
findings: 0

Ranking (4)

  rank  vendor        score  coverage  red flags  unscored
  1     Vendor Alpha  4.23   100.0%    0          0
  2     Vendor Beta   3.85   100.0%    0          0
  3     Vendor Gamma  3.57   100.0%    0          0
  4     Vendor Delta  2.78   100.0%    0          0

The weighted score is the sum of weight times score over the scored criteria, divided by the weight of the scored criteria, rounded to two decimals. Coverage is the scored weight as a share of the total weight. A rank is shared by equal scores.

```

```
  none

This report is arithmetic and bookkeeping on the scores in the file. It does not judge any vendor, it does not check that a score or a link is true, and it is not advice.

RESULT: PASS - no finding at or above error

```

The output of both examples in all four formats, the list of checks, and the explanation of a check are saved in
`examples/output`.

## How the files are read

1. The paths are resolved against the folder you run the command in. A link, a folder, a device or a file over 16 MB is
   refused, and so is a file that is not UTF-8 (or UTF-16 with a byte order mark) or holds a null byte, with exit code `2`
   and no report. The scores file and the criteria file must be two different files.
2. Each file is read as CSV, or as TSV when its first line has tabs, whatever its name. The reader keeps the line and column
   of every cell, follows double quotes (a quote inside a cell is written as two) and a line end inside a quoted cell, and
   refuses a quote that is never closed, text after a closing quote, a cell over 20,000 characters and a file of more than
   3,000,000 cells. A first line separated by semicolons is refused with a message, not guessed at.
3. Every column name and every cell is looked at for a private key or a seed. One that is found is an error at its line, and
   its value is left out of everything that follows and never shown.
4. The headers are read: a column is found by its name written in any case with any separators, so "Red Flag" and `red_flag`
   are one column. A column the tool does not read is a `column-unknown` finding, a name written twice is `column-duplicate`,
   and a column the tool cannot work without is reported once as `column-missing`.
5. Each row is checked on its own: its vendor and criterion, its weight, its score, its evidence and its red flag. A cell
   that holds only `n/a`, `none`, `null`, `tbd`, `unknown`, a dash or a question mark is read as empty. Then the rows are
   checked together: pairs written twice, weights that differ, criteria and vendors that miss each other, coverage, the
   ranking and the ties.

[docs/method.md](docs/method.md) says what each check reads, and [docs/inputs.md](docs/inputs.md) lists the columns.

## What it checks

| Check | Level | Kind | What it reports |
| --- | --- | --- | --- |
| `file-unreadable` | error | file | a file is not a table the reader can follow (a quote never closed, text after a closing quote, a cell too long, semicolons for commas) or holds a header and no rows, so nothing in it was checked |
| `column-missing` | error | file | a column the tool cannot work without is not in the header: vendor, criterion and score of the scores file, its weight unless a criteria file brings the weights, and the criterion and the weight of the criteria file; reported once, at the header |
| `column-unknown` | warning | file | a column the tool does not read, often a misspelt name; nothing under it was checked |
| `column-duplicate` | error | file | two columns of a header have the same name once case and separators are ignored; only the first is read |
| `row-malformed` | error | file | a row with more or fewer cells than the header, which usually means a comma that is not in quotes; the row was left out of every other check |
| `secret-in-file` | error | file | a file holds a private key, a seed or a mnemonic, under a column named for one or as a cell shaped like one; the tool never reads it and never shows it |
| `cell-incomplete` | error | row | a row with no vendor, or no criterion, or a row of the criteria file with no criterion, or the text n/a, none, tbd or a dash in place of one; the row was left out |
| `duplicate-pair` | error | across rows | the same vendor and criterion on two rows, or the same criterion twice in the criteria file; names are compared without regard to case and runs of white space; the second row was left out |
| `weight-not-positive` | error | row | a weight that is not a plain number above zero (zero, negative, with a thousands separator, with an exponent, text, empty where the scores file gives the weights, or with more than 40 digits) |
| `weight-differs` | error | across rows | a criterion with a different weight on two rows, or on a row and in the criteria file; the first weight, or the one of the criteria file, is the one used |
| `score-invalid` | error | row | a score that is not a plain number from 0 to 5: text, negative, above 5, a comma for the point, with an exponent or with more than 40 digits; the criterion counts as unscored for that vendor |
| `yes-no-unreadable` | error | row | a red_flag cell or a required cell that is not yes, no or empty (in any case); it is read as no |
| `criterion-not-in-criteria` | error | across rows | a criterion of the scores file that the criteria file does not list, so it has no weight from the criteria file; its rows were left out, and it is reported once |
| `criterion-unscored` | warning | row | a row with an empty score for a criterion that is not marked required in a criteria file; the vendor is not scored on it, and its weight is left out of the weighted score of the vendor |
| `required-unscored` | error | across rows | a criterion that the criteria file marks required is unscored for a vendor, by an empty score or by a missing row |
| `vendor-misses-criterion` | warning | across rows | a vendor with no row at all for a criterion that other vendors have rows for |
| `criterion-never-scored` | error | across rows | a criterion that no vendor has a score for: listed in the criteria file with no row, or with every row empty or unreadable; it counts for nothing in the weighted scores |
| `evidence-missing` | warning | row | a score above the --evidence-above threshold (default 3) with nothing in the evidence cell |
| `evidence-form` | info | row | evidence that is not a web address starting with http:// or https:// and not a document reference such as DOC-12 (pieces separated by semicolons are looked at one by one) |
| `red-flag-raised` | warning | row | a red_flag answer of yes for a vendor and a criterion; every one is listed, and the ranking table counts them for each vendor |
| `coverage-low` | warning | across rows | a vendor whose scored weight is below the --min-coverage share (default 80 percent) of the total weight; its weighted score rests on too little of the scorecard |
| `tie-too-close` | info | across rows | two vendors next to each other in the ranking whose weighted scores differ by less than the --tie-margin (default 0.10), compared exactly; the order between them is too close to call |

A check of a file is about a file, its header or the width of its rows, a check of a row is found from one row, and a check
across rows puts rows side by side. Each check is a best practice of this tool and says so in its reason (`--explain <id>`).
Errors are cells the arithmetic cannot use or a scorecard that cannot be compared, warnings are things a reader should see
before trusting the order, and notes are things to know. [docs/method.md](docs/method.md) describes every check with what it
cannot see.

## What is not checked

- Whether the scores are true or fair. The tool does not know what a score of 4 means to the people who gave it, and it does
  not open a link or a document.
- Whether a vendor is good, safe, honest or right for the project. A rank is a sum of weighted scores and nothing more.
- Whether the criteria and the weights are the right ones. They are the choice of the people who score.
- Whether two names are one vendor. Names are compared without regard to case and runs of white space; `Vendor Alpha` and
  `Vendor Alpha Ltd` are two vendors.
- Whether a red flag matters. It is listed and counted, not weighed.

## Formats

`--format text` (the default) is for a terminal. `--format markdown` is for a job summary or a pull request and escapes what
markdown gives a meaning to. `--json` (or `--format json`) gives one object with the files, the scorecard read, the ranking,
every check with its number of findings, every finding with its id, level, kind, file, line, column, message, fix and subject,
the notes and the result. `--format sarif` gives SARIF 2.1.0 for code scanning, with one result for each finding and its line
and column. `--list-checks` lists the checks in text, markdown or JSON, and `--explain <id>` explains one check in the same
three forms.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | no finding at or above the `--fail-on` level (default `error`) |
| `1` | a finding at or above the `--fail-on` level |
| `2` | a usage error, or an input the tool cannot read at all (no result) |

A finding below `--min-severity` is not shown but still counts for the result.

## Limits

Each file is read whole, up to 16 MB, 250,000 rows, 200 columns, 3,000,000 cells and 20,000 characters in a cell; more rows
than the limit are left out with a note. A weight, a score and a threshold have at most 40 digits before and after the point.
At most 1,000 findings of one check are listed, and the rest are counted and noted. The checks use maps and sorts, and nothing
walks every pair of a vendor and a criterion, so a hundred thousand vendors, a hundred thousand criteria or a hundred
thousand rows stay linear and shallow. [docs/limits.md](docs/limits.md) says what the tool cannot see.

## Architecture

| File | What it does |
| --- | --- |
| `src/files.js` | the bounded reading of a file: a regular file, no link, UTF-8 or UTF-16 |
| `src/csv.js` | the CSV and TSV reader with the line and column of every cell |
| `src/secrets.js` | the search for private keys and seeds in column names and cells |
| `src/decimal.js` | exact decimal numbers with BigInt |
| `src/fields.js` | the columns of the two files |
| `src/read.js` | the headers, the rows and the checks of a row; the evidence forms |
| `src/score.js` | the weighted score as an exact fraction, rounding, comparison and the ranking order |
| `src/across.js` | the checks across rows and the ranking: coverage, missing rows, ties |
| `src/rules.js`, `src/data.js`, `src/collect.js` | the checks with their levels, fixes and reasons, the notice, and the findings |
| `src/check.js`, `src/report.js`, `src/cli.js` | a run, the formats and the command line |

## Where the ideas come from

Scoring options against weighted criteria is an old and common way to compare them, often called a decision matrix. No
standard sets the checks of this tool, and the tool quotes none. [docs/context.md](docs/context.md) says what the method is
good for and where it misleads.

## Background

This tool is one of the small open source checks that INNERLUXES publishes next to its work on blockchain development. If you
are comparing blockchain development companies for an enterprise project, the page
[Top Blockchain Development Companies for Enterprise Projects](https://innerluxes.dev/blockchain/top-blockchain-development-companies)
covers that choice and points to this tool.

## License

MIT. See [LICENSE](LICENSE).
