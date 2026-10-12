# Context

vendor-scorecard does arithmetic and bookkeeping on the scores people enter. It does not judge vendors, it does not check
that a score or a link is true, and it is not advice. There is no standard behind any of its checks. Each one is a best
practice of the tool: a thing that is useful to look at in a spreadsheet of vendors, criteria and scores before the order of a
shortlist is trusted. This document says what the method is good for and where it misleads, and only that. It quotes no
standard and no law, and it does not say that a scorecard that passes meets any procurement rule.

## What a weighted score is

Scoring each option on a list of criteria, giving each criterion a weight and adding up the weighted scores is a common way
to compare options. It is often called a decision matrix. It has one real strength: it makes the people who choose write down
what they care about, how much, and how each option fares, so that a second reader can look at the same sheet. The tool does
not add anything to the method. It makes the sheet harder to get wrong without anyone noticing.

## Where the method misleads

| Problem | What the tool does about it |
| --- | --- |
| A criterion left empty for one vendor and not for the others | `criterion-unscored`, `vendor-misses-criterion` and, for a required criterion, `required-unscored`, so the gap is on the page |
| A high score on few criteria looks like a high score on all of them | the coverage column and `coverage-low` |
| A weight that changed between rows | `weight-differs`, with the first weight, or the weight of the criteria file, used |
| A high score with nothing behind it | `evidence-missing` above a threshold, `evidence-form` for evidence a reader cannot follow |
| A red flag that sits in a column nobody reads | `red-flag-raised`, listed for each vendor and counted in the ranking |
| Two vendors a hair apart read as a clear order | `tie-too-close`, compared exactly |
| A sum that depends on how a computer rounds | exact arithmetic with whole numbers, rounded only when shown |
| A row that is shifted, repeated or cut | `row-malformed`, `duplicate-pair`, `cell-incomplete` |

What the tool cannot fix is in [limits](limits.md): scores that are wrong, criteria that are the wrong ones, weights that
hide a preference, scores given on different scales by different people, and the sum itself. A single number hides the
difference between a vendor that is fair at everything and one that is excellent at four things and weak at one that
matters. The ranking is a way to order a sheet, and the sheet is a way to start a discussion.

## A red flag is not a score

The tool keeps the red flag apart from the score on purpose. A red flag does not lower a score and does not drop a vendor,
because what a red flag means depends on the project and on the people who read it. The tool puts every answer of `yes` where
it can be seen, with the note that goes with it, and leaves the decision to them.

## Not advice

A clean run is not a recommendation of a vendor, and the tool's output is not one. It is a list of what does not hold
together in a spreadsheet, with the line to look at, and a table of sums. The decision about which vendor to choose, and why,
stays with the people who keep the scorecard.
