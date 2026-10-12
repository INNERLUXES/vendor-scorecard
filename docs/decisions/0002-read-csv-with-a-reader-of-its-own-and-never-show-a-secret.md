# 2. Read CSV with a reader of its own, and never show a secret

## Status

Accepted

## Context

A scorecard saved as CSV or TSV looks simple and is not. A split on commas breaks on a vendor name with a comma in it, or on
a note that quotes a sentence. A split on lines breaks on a cell with a line end in it. A library that guesses (the
delimiter, the quoting, a number from a cell) turns a score of `4.0` into the number 4 and a weight written with a comma
into something else. None of them keeps the line and the column of a cell, so a finding could not point at the cell to
change.

A scorecard is also written by hand, next to the notes of a project, and a careless file can hold a secret: the private key
of an account pasted into a notes cell, a seed phrase in a vendor's reference column. A tool that reads such a file and
echoes its values in a report would copy the secret into a pipeline log, a pull request comment or a SARIF upload, where many
more people can read it.

A reference to a document may also be a hash of 64 hex digits, which has the shape the search for secrets of the sibling tools
reads as a private key in hex.

A file that is not complete (a column that is missing, a misspelt column, a row with a cell too many) would also be read as
if it were, and a check could take a value it never saw for one that is fine.

## Decision

1. Both files are read by `src/csv.js`, a reader of its own for RFC 4180 quoting with a comma or a tab as the delimiter, one
   character at a time with no recursion and no pattern built from the text. It keeps the line and the column of every cell
   and keeps every cell as the text it was written. It refuses what it cannot follow instead of guessing: a quote never
   closed, text after a closing quote, a quote inside a cell that does not start with one, a cell, a row or a file over the
   limits, and a first line separated by semicolons.
2. Weights and scores are read from the characters of the file with the decimal reader of the sibling tools
   (`src/decimal.js`, kept unchanged) into a whole number and a scale. A number past the limit is a finding, never rounded.
3. The tool never asks for a private key, a seed or an API key. Before anything else is read, `src/secrets.js` walks every
   column name and every long cell of both files. Its shapes and its list of names of keys are those of the sibling tools,
   kept unchanged. A column named for a key or a seed, and a cell shaped like a mnemonic, an extended private key, a private
   key in hex or a key in WIF, is a `secret-in-file` error at its line. The cell is marked, the checks leave it out as if it
   were not there, and no report and no error message shows it, in any format.
4. A cell of 64 hex digits, with or without 0x, in the `evidence` column is read as the reference it is meant to be:
   `src/check.js` passes that column to the search. In any other column the same value is still a `secret-in-file` error, and
   a mnemonic or a key in WIF in the evidence column is still one too.
5. Every column the tool needs and the header does not give, every column the tool does not read and every row of the wrong
   width is returned with its line and shown as a finding. A check never takes a value it did not read for one that is fine.

## Consequences

- The tool needs no install and no network, and the same file gives the same report on Linux, Windows and macOS.
- A finding points at the line and the column of the cell it is about.
- A secret in a file fails the run and is never copied into the output. The shapes are loose, so a cell that only looks like a
  secret, such as a note of twelve short lowercase words, is reported too; that is the safe side.
- A private key pasted into the evidence column cannot be told apart from a hash and is not reported; it is not shown either,
  and docs/limits.md says so.
