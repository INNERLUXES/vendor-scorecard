# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "vendor-scorecard security", or use private vulnerability reporting on
this repository. Please do not open a public issue for a vulnerability.

Include a small made-up spreadsheet that shows the problem, the command you ran, what you expected and what happened. Use
made-up vendors, criteria and scores, never the scorecard of a real selection or the name of a real company, and never a real
private key, seed or mnemonic, even an old one or one from a test network.

## Scope

The tool does arithmetic and bookkeeping on the scores people enter. It does not judge vendors, it does not check that a score
or a link is true, and it is not advice. In scope:

- an input that makes the tool show a private key, a seed or a mnemonic, or any part of one, in a report or an error message,
  in any format, or the value of a cell of 64 hex digits in the evidence column
- a key or a seed in one of the shapes docs/limits.md names that the tool does not report, outside the evidence column that
  docs/limits.md names
- an input that makes the tool read a file other than the ones it was given, or follow a symbolic link
- an input that makes the tool open a network connection, fetch a URL, open a link written in a cell, write or sign anything,
  run any other program, or evaluate anything it reads
- an input that makes the tool write a file
- an input that makes the tool hang, take very long, exhaust the stack or use unbounded memory, such as a very large file, a
  hundred thousand rows, a hundred thousand vendors or criteria, a cell of a million characters, a row of a million commas,
  long runs of quotes, evidence of the longest length or numbers with thousands of digits
- binary or invalid input that the tool reads as if it were a spreadsheet
- a column written twice whose second column is read without a finding, a column the tool did not read that a check reports as
  fine, a misspelt column that is not reported, or a row of the wrong width that is read as if it were right
- a spreadsheet that docs/method.md says is reported (a score outside 0 to 5, a weight that is not above zero or that
  differs, a pair written twice, a criterion nobody scored, a required criterion left unscored, a high score with no evidence,
  a red flag, a low coverage) that the tool does not report
- a weight or a score that the tool reads in a way the text of the file does not say, a weighted score or a coverage that is
  not the exact value worked out from the cells, or a ranking that does not follow the exact scores, so that a check passes or
  fails because of it
- a run that passes at a `--fail-on` level although the input holds a finding at that level that docs/method.md says is
  reported
- text from a file or a file name that rewrites the terminal through control or direction characters, is shown unescaped in
  the output, or puts markup into the markdown report
- a name such as `__proto__` that changes how objects behave inside the tool

Out of scope: the forms docs/limits.md says the tool does not see, whether the scores are true or fair (a clean result says
nothing about the vendors), whether a link or a document is what the file says, secrets in shapes the search does not claim to
know, who may change or upload the files, and where your pipeline keeps the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
