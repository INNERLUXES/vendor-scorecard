# 1. Do arithmetic and bookkeeping, and never judge a vendor

## Status

Accepted

## Context

A shortlist of vendors is scored by people, in a spreadsheet, usually by several of them and over several days. The sheet
goes wrong in small ways that nobody sees: a criterion left empty for one vendor, a weight typed differently on two rows, a
high score with no link behind it, a red flag in a column nobody reads, two vendors a few hundredths apart read as a clear
order. A tool that read the sheet could also go further: drop a vendor with a red flag, lower a score that has no evidence,
open the links and judge what they say, look a vendor up, or say which vendor to choose.

That would make the result depend on the tool's idea of a good vendor, which the tool cannot have. A red flag means one thing
for one project and another for the next. A link may be fine and a score still wrong. A tool that said otherwise would be
read as advice, and would be wrong in ways that are hard to see.

## Decision

1. The tool does arithmetic and bookkeeping on the scores people enter, and nothing else. It sums weights and scores exactly,
   ranks by the sum, counts what is missing, and lists what does not hold together, with the line.
2. It never changes a score. A red flag, a missing piece of evidence and a low coverage are listed and counted; none of them
   changes a number or drops a vendor.
3. It never judges. The reports and the documents say plainly that the tool does not judge vendors, does not check that a score
   or a link is true, and is not advice.
4. Every check is a best practice of this tool, says so in its reason, and says what it cannot see. No standard is quoted.
5. A vendor with no score is listed last with no rank, and a tie within the margin is said to be too close to call. The tool
   would rather say that the sheet cannot separate two vendors than put one above the other.

## Consequences

- The ranking is only as good as the scores. The README, the notice of every report and docs/limits.md say so.
- A reader who wants a red flag to count against a vendor has to put that in the score or in the discussion; the tool lists
  the flag and stops there.
- The tool stays small enough to be read in an afternoon, and the same sheet gives the same table on every run.
