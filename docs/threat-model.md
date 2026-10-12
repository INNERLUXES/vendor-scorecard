# Threat model

The tool does arithmetic and bookkeeping on the scores people enter. It does not judge vendors, it does not check that a score
or a link is true, and it is not advice. This document is about the tool itself: what it touches, what a hostile or careless
spreadsheet can try, and what stops it.

## What the tool touches

- It reads the one or two files named on the command line. Nothing else is opened, and no path, address or link written in a
  cell is looked up, opened or followed; a web address in the evidence column is only text.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, fetches no URL, follows no symbolic link, runs nothing it reads, evaluates nothing and
  reads no clock and no locale.

## What the input may hold

A scorecard comes from a person who edits it by hand, from a colleague, from an export, or, in a pipeline that checks every
pull request, from whoever sent it. Through it, a person can try to, or a careless change can:

- put a private key, a seed or a mnemonic in a cell or in a column name, so that the tool copies it into a pipeline log, a
  pull request comment or a code scanning upload;
- hide a private key in the evidence column, where a hash used as a reference belongs;
- make the tool read outside the files: a link named on the command line, a folder, an address given as the path;
- exhaust the memory, the stack or the time: a file of many megabytes, a hundred thousand rows, a hundred thousand vendors on
  one criterion that all score the same, a hundred thousand vendors on a hundred thousand criteria with one row each, a cell
  of a million characters, a row of a million commas, quotes in long runs, numbers with thousands of digits, evidence of the
  longest length;
- move the result: a column written twice so that two readers see two values, a misspelt column that hides a cell, a row with
  a cell too many that shifts every value after it, a score that a floating point number would read wrongly, a weight that
  differs from row to row, a pair written twice so that the later score wins;
- slip in something that is not text: a spreadsheet saved as a binary file, bytes that are not valid UTF-8 or UTF-16;
- rewrite the terminal or break the output: control characters, escape sequences, direction controls and line separators in a
  cell, a vendor, a criterion or a file name;
- hide markup in the markdown report: a link, a table separator or a tag in a cell;
- change how objects behave: a column, a vendor or a criterion named `__proto__`, `constructor` or `toString`.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A secret in a file is copied into the output | Every column name and every long cell of both files is looked at for a key or a seed; each one found is a `secret-in-file` error, the cell is marked, the checks leave it out as if it were not there, and no message names it. Tests put each shape in several columns and check every format for the value |
| A hash used as a reference is reported as a key | A cell of 64 hex digits in the `evidence` column is read as a reference; in any other column it is still a secret, and any other shape in that column is still one |
| A link makes the tool read a file it was not given | The path is checked with `lstat` and a link is refused by name; the file is opened with `O_NOFOLLOW` where the system has it, and its type and size are taken from the open handle. A test puts a link in the folder |
| The tool reaches a server, fetches, connects or runs something | No module of the network or of child processes is imported, nothing is evaluated, a cell is only text, and a path that looks like an address is refused. A test checks the imports of src |
| The memory, the stack or the time is exhausted | Each file has a size limit checked on the open handle before it is read; the reader keeps limits of rows, columns, cells and cell length and works through a loop with no recursion; vendors and criteria are kept in maps, no pair of a vendor and a criterion is walked, ties are looked for between neighbours, and at most 1,000 findings of one check are listed. Tests with a hundred thousand rows and the shapes above check the time, with limits that widen under coverage only |
| A column written twice hides a value | A name written twice is a `column-duplicate` finding, and only the first column is read |
| A misspelt or missing column passes for one that is fine | A column the tool does not read is a `column-unknown` finding with the column it is probably meant to be; a column the tool needs and the header lacks is `column-missing`; each with its line |
| A row of the wrong width shifts the cells | A row with more or fewer cells than the header is a `row-malformed` finding and is left out of every other check |
| A pair written twice, or a weight that differs, changes the ranking quietly | The second row is `duplicate-pair` and left out, so the first is the one counted; a weight that differs is `weight-differs`, and the first weight, or the one of the criteria file, is the one used |
| Scores are read wrongly | Weights and scores are read from the characters of the file with BigInt; a number past 40 digits is a finding, never rounded; sums and comparisons are exact |
| A binary file or bytes in another encoding are read as text | A null byte in UTF-8, an odd number of bytes in UTF-16 and bytes that are not valid make the file an input error with exit code `2` and no report |
| Text from a file rewrites the terminal | Every text from the input goes through `safeText`, which replaces control, line separator and direction characters and caps the length. A test puts escapes and direction controls in a cell and a file name, in every format |
| Markup in a cell changes the markdown report | The markdown report escapes the characters markdown gives a meaning to. A test writes a link, a bar and a tag into a cell |
| `__proto__` changes how objects behave | Names of the files are compared with the names the tool reads and kept in `Map` and `Set` objects, and no object is built with a key from a file. A test uses `__proto__`, `constructor` and `toString` as vendors, criteria and columns |
| The time of the run changes the result | No clock is read, so the same files and options give the same report on every day |
| A device or a pipe hangs the tool | A path that is not a regular file is refused before it is read |
| The tool leaves files behind | Nothing is written to disk; there is no cache, no temporary file and no log. A test checks that a run leaves the folder as it was |

## Out of scope

Whether the scores are true, whether a vendor is what the file says, the forms and secrets docs/limits.md says the tool does
not see, who may change or upload the files, and where your pipeline keeps the output.
