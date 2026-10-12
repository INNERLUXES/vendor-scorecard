# Limits

vendor-scorecard does arithmetic and bookkeeping on the scores people enter. It does not judge vendors, it does not check
that a score or a link is true, and it is not advice. This document says what that means: what the tool cannot see, where it
can be wrong, and the limits of the work it does.

## What a clean result means

A run with no finding at or above the fail-on level means that none of the problems the checks look for were found in the
cells of the files. It does not mean that the scores are fair, that the evidence supports them, that the criteria are the
right ones, or that the vendor at the top of the ranking is the one to choose. A scorecard can be consistent and still
describe the wrong thing. Nothing in the tool compares a score with the vendor, a link with what it points to, or a weight
with what matters to the project.

## What the tool cannot see

- **Whether the scores are true.** The tool reads cells. It cannot tell a score given after a careful review from one typed
  in a hurry, and it does not look anything up.
- **Whether the evidence supports the score.** The tool looks at the form of the evidence, a web address or a document
  reference, and never opens either. A link that goes nowhere passes, and so does a link to a page that says the opposite.
- **Whether the weights and the criteria are right.** A weight is a number above zero. Whether chain experience should count
  for 3 or for 5 is for the people who score.
- **What a red flag means.** It is listed and counted. It is not weighed, it changes no score and it does not drop a vendor.
- **Whether two names are one vendor.** Names are compared without regard to case and runs of white space, nothing more.
  `Vendor Alpha` and `Vendor Alpha Ltd` are two vendors, and each is ranked on its own rows. The same holds for criteria.
- **Scores given by different people on different scales.** The tool treats a 4 as a 4. A scorecard filled in by two people
  who read the scale differently is consistent to the tool and not to the reader.
- **How sure the people who scored were.** A tie margin of 0.10 is a setting, not a measure of doubt. Two vendors 0.2 apart
  can still be too close to call, and two vendors 0.05 apart can be clearly different on the criteria that matter.
- **Neighbours only.** `tie-too-close` compares vendors next to each other in the ranking. Three vendors 0.08 apart in a row
  give two findings, and the first and the third, 0.16 apart, are not reported as a pair.
- **Rows that are left out.** A row with the wrong number of cells, with no vendor or no criterion, a repeated pair and a
  criterion that the criteria file does not list are reported and left out of the arithmetic. The ranking is the ranking of
  the rows that were read.
- **A criterion with no valid weight.** It is left out of the weighted scores and the coverage, with a note. The ranking does
  not say that it was meant to count.
- **What a column means to you.** `note` is kept and shown with a red flag, never compared.

## Secrets

The search for keys and seeds is a heuristic with loose shapes (`src/secrets.js`): a mnemonic is 12, 15, 18, 21 or 24 words
of 3 to 8 lowercase letters; an extended private key starts with a letter and `prv` and holds 100 or more base58
characters; a private key in hex is 64 hex digits, with or without `0x`; a key in WIF is 51 or 52 base58 characters that
start with `5`, `K`, `L`, `c` or `9`. A column named for a seed or a key is reported by its name. A cell shorter than 47
characters is too short to be any of the shapes and is not looked at. A secret in another shape is not found.

A cell of 64 hex digits in the `evidence` column is read as a reference, because a hash is a fair way to point at a document.
The tool does not show such a cell as a secret, and does not echo it as one; the evidence check reports it as a reference of
no known form. A private key pasted into the evidence column cannot be told from a hash and is not reported; the other shapes
in that column are still reported.

## Work the tool does

Each file is read whole, up to 16 MB, 250,000 rows, 200 columns, 3,000,000 cells and 20,000 characters in a cell; more rows
than the limit are left out with a note. A weight, a score and a threshold have at most 40 digits before and after the point;
one with more is a finding, never rounded. At most 1,000 findings of one check are listed, and the rest are counted and noted.
A vendor name or a criterion longer than 120 characters is cut in the ranking table.

The checks use maps and sorts. No pair of a vendor and a criterion is walked: the number of criteria a vendor misses is
worked out by counting, and only the first findings of a check are built, so a hundred thousand vendors on a hundred thousand
criteria, one row each, are read in good time. The sums are exact whole numbers; a vendor scored on a hundred thousand
criteria with weights of forty digits is added up in good time. No function of the tool calls itself, so the depth of the
stack does not depend on the input. Hostile tests (a hundred thousand rows, a hundred thousand vendors and criteria, cells of
the longest length, a row of a million commas, a million quotes, numbers of thousands of digits, evidence of the longest
length) check the time, with limits that widen under coverage only.
