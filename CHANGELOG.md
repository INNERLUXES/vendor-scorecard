# Changes

## 1.0.0

First release.

- Reads a scorecard of vendors, criteria, weights, scores, evidence and red flags (CSV or TSV, a header row and one row for
  each vendor and criterion) and ranks the vendors by weighted score, listing with its line and column what does not hold
  together. The tool does arithmetic and bookkeeping on the scores people enter; it does not judge vendors, it does not check
  that a score or a link is true, and it is not advice. It reads the files, contacts nothing over the network, opens no link,
  fetches nothing, runs nothing, needs no key, follows no symbolic link, reads no clock and writes nothing to disk.
- Seven columns that the tool names itself (no standard fixes them), documented in docs/inputs.md: `vendor`, `criterion`,
  `weight`, `score`, `evidence`, `red_flag` and `note`. A second file given with `--criteria` has `criterion`, `weight`,
  `required` and `description`, becomes the source of the weights and marks the criteria that must be scored for every
  vendor. A column is found by its name with case and separators ignored.
- Exact decimal arithmetic with BigInt for every weight, score and threshold: the weighted score is
  `sum(weight * score) / sum(weight of the scored criteria)` kept as a fraction, compared by cross multiplication and rounded
  half up to two decimals only when shown; coverage is the scored weight over the total weight, shown with one decimal. No
  floating point number is used anywhere.
- The ranking table: rank (equal scores share a rank), vendor, weighted score, coverage, red flags and unscored criteria, and
  a list of the red flags by vendor.
- A strict reader of CSV and TSV of its own, with no dependency and no recursion, with the line and column of every cell,
  quotes and line ends inside cells, a comma or a tab chosen from the first line, and limits of rows, columns, cells and cell
  length; the bounded reading of a file and the decimal reader of the sibling tools.
- A search for keys and seeds in every column name and every long cell of both files, with the shapes of the sibling tools: each
  one found is an error whose value is left out of every check and never shown. A cell of 64 hex digits in the `evidence` column
  is read as a reference.
- Twenty-two checks in three levels, each marked as a check of a file, of a row or across rows, each a best practice of the tool
  and saying so: six about files (`file-unreadable`, `column-missing`, `column-unknown`, `column-duplicate`, `row-malformed`,
  `secret-in-file`); eight of a row (`cell-incomplete`, `weight-not-positive`, `score-invalid`, `yes-no-unreadable`,
  `criterion-unscored`, `evidence-missing`, `evidence-form`, `red-flag-raised`); and eight across rows (`duplicate-pair`,
  `weight-differs`, `criterion-not-in-criteria`, `required-unscored`, `vendor-misses-criterion`, `criterion-never-scored`,
  `coverage-low`, `tie-too-close`).
- Options `--evidence-above` (default 3), `--min-coverage` (default 80 percent) and `--tie-margin` (default 0.10), each a plain
  number checked against its range.
- Reports as text, markdown, JSON and SARIF 2.1.0; every finding has its id, severity, kind, message, file, line, column and
  subject; `--min-severity`, `--fail-on`, `--list-checks` and `--explain <id>` with what a check looks at, why it exists,
  what to change and what it cannot see. Exit code `0` when no finding is at or above the fail-on level, `1` when one is,
  `2` for a usage or input error, with no result.
- Made-up examples: a scorecard of four fictional vendors that passes at every level and one with a mistake of every check but
  `file-unreadable`, each with a criteria file, with their real output in all formats, the list of checks and the
  explanation of a check.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate of
  the repository.
