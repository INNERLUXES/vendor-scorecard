# 3. Read the files on disk, and contact nothing

## Status

Accepted

## Context

The evidence column holds links, and a tool could open every one of them to see that it answers, look at what it says, fetch
the pages of the vendors, look a vendor up in a registry or ask a service about it. That would need the network and often a
key, would make the result depend on the state of other people's servers at the moment of the run, would send the names of
the vendors a firm is looking at to a third party, and would let a file in a pull request make the pipeline reach any address
it names. A link that answers is also not a score that is right.

What a team needs first, before it trusts the order of a shortlist, is a list of what is wrong in the sheet and where: a
criterion left empty, a weight typed twice, a high score with nothing behind it. The spreadsheet is a file, and can be checked
the same way on every run.

## Decision

1. The tool reads the files it is given, and nothing else. It contacts nothing over the network, fetches nothing, opens no
   link, needs no key, runs no program and sends no data anywhere. It cannot write, submit or endorse anything.
2. A web address in the evidence column is text. Its form is looked at (a scheme, a host with a dot, no password in it) and it
   is never opened.
3. The tool reads no clock and no locale. Nothing in a scorecard needs the date, so no option gives it one, and the same
   input gives the same report on every day.
4. The checks work from the files alone. The ranking and the checks across rows see the rows of the files, and docs/limits.md
   says what is not seen.
5. The columns and the checks are in the code, kept short and named in docs/inputs.md. They change in a release, never while
   the tool runs.
6. Every check is a best practice of this tool. No standard is behind any of them, and the reports and the documents say so
   in plain words.
7. The tool lists what to look at and what to change; it changes nothing and sends nothing.

## Consequences

- The result depends only on the files and the options, and a run needs no network access and no secret.
- A link that goes nowhere passes, and a person has to open the evidence.
- A vendor, a criterion or a document reference is checked for being there and for agreeing with the other rows, never looked
  up.
