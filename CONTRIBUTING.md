# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux, Windows
and macOS with Node 22 and 24, the tests with coverage, the repository checks, CodeQL, and a secure development check of the
repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, with `!`
for a breaking change.

This tool reads a scorecard of vendors, criteria and scores and runs nothing. It does arithmetic and bookkeeping on the scores
people enter, it does not judge vendors, and it is not advice. A change must keep it that way: a check reports what the file
holds, and the tool never contacts anything over the network, never writes, submits or signs anything, and never fetches,
opens, runs or evaluates what it reads.

## Never a secret, never a real selection

The tool never asks for a private key, a seed or an API key, and never looks up a vendor, a link or a document. Do not add an
option, a column or a test that gives it one: the checks are about the cells as written. A test of the search for secrets
builds its values from repeated characters (see test/secrets.test.js), so that no file of the repository holds anything that
could be a real key or seed. Never paste the scorecard of a real selection, the name of a real company, a key or a seed into
an issue, a pull request or an example; use made-up vendors (Vendor Alpha and its kin), made-up criteria and links on
example.com.

## Never a judgement, never a made-up rule

Every check is a best practice of this tool, and says so in `own` in src/rules.js. No standard sets any of them. Do not write
a message, a document or an example that reads as a statement that a vendor is good, safe or the one to choose, that a score
or a link is true, that a scorecard meets a rule, or that the tool gives advice. A red flag is listed and counted; it never
changes a score and never drops a vendor.

## Changing a check

1. Describe the change in docs/method.md first: what the check looks at and what it can and cannot see, and add what it
   cannot see to docs/limits.md. Say in `own` in src/rules.js, and in the message, that it is a best practice of the tool, and
   why the tool asks for it.
2. Keep the checks to what is written. A finding must point at something a reader can check in the file: a line and a column.
   Never add a check that needs the network, a registry, a key or the clock.
3. A check says what to change, in `fix` in src/rules.js, what it cannot see, in `cannot`, and is marked as a check of a
   file, of a row or across rows in `kind`.
4. A run must never pass because something could not be read: a file that is not a table is an error finding, and a column
   that is missing, unknown or written twice, and a row of the wrong width, is a finding that names it.
5. Add a test with the rows written inline (`table()`, `cell()`, `clean()`, `criteriaFile()`, `findingsOf()`, `idsOf()`,
   `ofCheck()`, `runOf()`, `run()` and `cli()` in test/helpers.js), small enough to work out by hand, with a near miss on each
   side: the value that is reported and the one next to it that is not.
6. A check id, once released, keeps its meaning: pipelines and other tools read it from the JSON, SARIF and markdown output.

## Changing the reader and the arithmetic

1. The reader of tables (src/csv.js) keeps its limits (`CSV_LIMITS`) and works through a loop; it has no recursion, and neither
   has the search for secrets (src/secrets.js). The decimal reader (src/decimal.js) keeps `DECIMAL_LIMITS`. src/csv.js,
   src/decimal.js, src/files.js, src/secrets.js, src/size.js and src/text.js are kept as they are in the sibling tools; a test
   compares their hashes. The only change to what the search reports is made in src/check.js, for the evidence column
   (decision 2).
2. A weight and a score are read from the characters of the file into a whole number and a scale with BigInt; a number past
   the limit is a finding, never a guess. Sums, comparisons and the thresholds are exact; a number is rounded only when it is
   shown. Never use a floating point number for a weight, a score, a coverage or a tie.
3. A cell marked as a secret is left out as if it were not there; no message may name it.
4. A column that is read is listed in docs/inputs.md and in src/fields.js; a part the file does not give is a finding or a note,
   so that it never goes by unnoticed.
5. No pattern is built from a file or an argument. A test fails when `new RegExp` appears in src outside src/text.js.
6. The checks across rows use maps and never compare every pair, and no function calls itself (decision 4). Hostile tests with
   a hundred thousand rows, vendors and criteria check it.
7. A time check in a test widens under coverage: read `process.env.NODE_V8_COVERAGE`, which the test runner sets only when
   coverage is on, and allow four times the time (`allowed()` in test/helpers.js). Run `npm run test:coverage` before you open
   the pull request.
8. A file written with LF, CRLF or CR line ends, as UTF-8 with or without a byte order mark or as UTF-16 with one, must give
   the same findings.

## The examples

The files under `examples/` are made-up input for the tool: a scorecard that passes at error, warning and info level, and one
that holds a mistake of every check but `file-unreadable`, each with a criteria file, with made-up vendors, links on
example.com, and no key, no seed, no date and no real company. A change to them goes with the real output that
`npm run example` writes to `examples/output`.

## Tests that depend on the system

A test that depends on the operating system (a symbolic link, a device) is guarded with `process.platform` and says why in its
`skip`. A test never asserts a line number written by hand: a line is worked out with `lineOf()` of test/helpers.js or from the
text itself. Every other test builds its paths with `resolve()` from names with forward slashes, and a test never writes a
backslash, a bar, a star, a question mark or a quote into a file name, because Windows refuses them.

A test never reads the clock, the time zone of the machine or the locale. A test never asserts the hash or the version of a
GitHub Action: Dependabot changes them, and the test checks only that each action is pinned to a full commit with a version
comment.

## Rules for the code

- No runtime dependencies and no development dependencies. Node 22 or newer and nothing else; the tests use `node:test`.
- The tool reads the files it is given and writes only to standard output and standard error. It opens no network connection,
  opens no link, signs nothing, runs no program and evaluates nothing it reads.
- Text from the input, file names, cells, vendors and criteria included, goes through `safeText` before it reaches the output
  or an error message.
- Source files stay ASCII; write any other character as a Unicode escape, or build it from its code point.
- No file carries a date in its prose, and no file holds a number that reads like a year. Version numbers (Node 22, 1.0.0),
  counts, seconds and the number of a standard (SARIF 2.1.0, NIST SP 800-218) are fine.
- Examples and tests use made-up vendors.
- Plain words in the documents: `npm run check` fails on a short list of words that say little.

## Before you open the pull request

```
npm test
npm run test:coverage
npm run check
npm run example
```
