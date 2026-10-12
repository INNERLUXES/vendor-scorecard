# Inputs

The tool takes the path of one file: a scorecard saved as CSV or TSV, with a header row and one row for each vendor and
criterion. A second file, given with `--criteria`, lists the criteria. There is no configuration file of the tool itself, no
environment variable and no standard input; the options are on the command line. The tool never asks for a private key, a
seed, an API key or the address of a server, and needs none. It does arithmetic and bookkeeping on the scores people enter: it
does not judge vendors, it does not check that a score or a link is true, and it is not advice.

The columns and every check are this tool's own choice. No standard sets any of them, and no standard fixes the names of the
columns of a spreadsheet. [docs/context.md](context.md) says what the method is good for and where it misleads.

```
vendor-scorecard <scores.csv> [--criteria <criteria.csv>] [--format text|markdown|json|sarif] [--json]
                 [--min-severity <level>] [--fail-on <level>] [--evidence-above <score>] [--min-coverage <percent>]
                 [--tie-margin <number>]
vendor-scorecard --list-checks [--format text|markdown|json] [--json]
vendor-scorecard --explain <id> [--format text|markdown|json] [--json]
```

| Option | Meaning |
| --- | --- |
| `--criteria <file>` | a CSV or TSV file of criteria; it becomes the source of the weights when it has a weight column, and it says which criteria are required |
| `--format <name>` | `text` (default), `markdown`, `json` or `sarif` |
| `--json` | the same as `--format json` |
| `--min-severity <level>` | the lowest level shown: `info` (default), `warning` or `error` |
| `--fail-on <level>` | the lowest level that fails the run: `info`, `warning` or `error` (default) |
| `--evidence-above <score>` | a score above this needs evidence; a plain number from 0 to 5, default 3 |
| `--min-coverage <percent>` | the share of the total weight a vendor should be scored on; a plain number from 0 to 100, default 80 |
| `--tie-margin <number>` | two vendors next to each other in the ranking that differ by less than this are too close to call; a plain number from 0 to 5, default 0.1; 0 turns the check off |
| `--list-checks` | list the checks with their level and kind, in text, markdown or JSON, and exit |
| `--explain <id>` | explain one check, in text, markdown or JSON, and exit |
| `--help`, `--version` | the usage, the version |

Every option that takes a value takes it once. A value may not start with `--`. `-` (standard input) and an address such as
`https://...` are refused. A folder is refused: name the file. Two scores files are a usage error, and the scores file and the
criteria file must be two different files. A threshold is a plain decimal: no sign, no exponent, no thousands separator and no
percent sign.

## The files

Each file is read as CSV, or as TSV when its first line has tabs and at least as many tabs as commas (outside quotes),
whatever its name. It is UTF-8, with or without a byte order mark, or UTF-16 with a byte order mark, with LF, CRLF or CR line
ends. A cell that holds a comma, a tab, a quote or a line end is written in double quotes, and a quote inside it as two
quotes. A line with nothing on it is skipped. A first line separated by semicolons is refused.

The first line is the header. A column is found by its name written in any case with any run of other characters in place of
the underscores, so `Red Flag`, `red-flag` and `red_flag` are one column. A column the tool does not read is reported and its
values are left out; a name written twice is reported and only the first is read. The order of the columns does not matter.

Every row after the header is one cell of the scorecard. "Row 3" in a message is the third row after the header, and the line
of its cell is the one after the path. A row with more or fewer cells than the header is reported and left out of the other
checks.

A cell that is empty, or holds only `n/a`, `na`, `none`, `null`, `nil`, `tbd`, `unknown`, a dash, two dashes or a question
mark (in any case), says nothing, and is read as empty. White space around a cell is dropped.

## The scores file

| Column | What it holds |
| --- | --- |
| `vendor` | the vendor the row scores; needed. Names are compared without regard to case and runs of white space |
| `criterion` | the criterion the row scores; needed. Compared in the same way |
| `weight` | what the criterion counts for: a plain number above zero, the same on every row of the criterion. Needed unless the criteria file has a weight column |
| `score` | the score from 0 to 5 as a plain decimal, such as `4` or `3.5`; needed as a column, and empty in a row means not scored |
| `evidence` | where the score comes from: a web address that starts with `http://` or `https://`, or a document reference such as `DOC-12` or `AUD#7.2`; several can be separated by semicolons. May be left out of the file |
| `red_flag` | `yes` when the answer for this vendor and criterion is a red flag, `no` or empty otherwise. May be left out of the file |
| `note` | free text for the reader; kept and shown with a red flag, never compared. May be left out of the file |

A score is a plain decimal from 0 to 5: no sign, no exponent, no thousands separator, a point and not a comma, and at most 40
digits before and after the point. A weight is a plain decimal above zero with the same limits. A web address in the
evidence column is only text: the tool never opens it. A web address with a user name or a password in it is not read as a
web address, because a link with a password in it should not sit in a spreadsheet.

A vendor name, a criterion and a note may hold any text; it is cleaned of control characters before it is shown.

## The criteria file

| Column | What it holds |
| --- | --- |
| `criterion` | the criterion, written as in the scores file; needed |
| `weight` | what the criterion counts for: a plain number above zero. When the column is there it is the source of the weights, and a weight written in the scores file that differs from it is a `weight-differs` finding. Without the column, the weights are read from the scores file and `column-missing` says so |
| `required` | `yes` when every vendor must be scored on the criterion, `no` or empty otherwise |
| `description` | free text for the reader; kept, never compared |

With a criteria file, a criterion of the scores file that the criteria file does not list is a `criterion-not-in-criteria`
finding and its rows are left out, and a criterion of the criteria file that nobody scored is a `criterion-never-scored`
finding. Without one, the criteria are the ones the rows name, and the weight of a criterion is the first valid weight written
for it.

## What the numbers mean

For each vendor, the weighted score is the sum of weight times score over the criteria the vendor was scored on, divided by
the sum of the weights of those criteria. Coverage is the weight of the criteria the vendor was scored on as a share of the
total weight of all the criteria that have a weight. A criterion is scored when its score is a plain number from 0 to 5; an
empty score, an unreadable score and a missing row all leave it unscored. The unscored count of a vendor is the number of
weighted criteria it was not scored on.

The score is shown with two decimals and the coverage with one, both rounded half up from the exact value. Vendors are ranked
by the exact score, best first; equal scores share a rank (1, 2, 2, 4), and a vendor with no score at all is listed last with
no rank.

## A short file

A scorecard that passes every check at every level, with its criteria file:

```csv
vendor,criterion,weight,score,evidence,red_flag,note
Vendor Alpha,Chain experience,3,4,https://example.com/alpha/chain,no,
Vendor Alpha,Published audits,2,3.5,DOC-12,,
Vendor Beta,Chain experience,3,3,https://example.com/beta/chain,no,
Vendor Beta,Published audits,2,2.5,https://example.com/beta/audits,,
```

```csv
criterion,weight,required,description
Chain experience,3,yes,Live chain work the vendor can show
Published audits,2,no,Audit reports a reader can open
```
