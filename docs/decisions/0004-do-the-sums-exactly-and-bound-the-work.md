# 4. Do the sums exactly, and bound the work

## Status

Accepted

## Context

A weighted score is a sum of products divided by a sum. With floating point numbers it can be a hair wrong, 0.1 and 0.2 do not
add up to 0.3, a score of 2.675 rounds to 2.67 and not 2.68, and two vendors a hair apart can swap places or tie by accident
of the machine. A minimum coverage of exactly 80 percent can be missed by a rounding error. The order of a shortlist should
not depend on any of this.

A scorecard can also be hostile or only large. A hundred thousand vendors on one criterion that all score the same would give
a hundred thousand ties. A hundred thousand vendors on a hundred thousand criteria with one row each would give ten billion
pairs of a vendor and a criterion to look at for rows that are not there. Numbers of thousands of digits, cells of a million
characters and rows of a million commas are cheap to write and costly to read. A function that calls itself on a long chain
runs out of stack.

## Decision

1. Weights and scores are read into a whole number and a scale and added and multiplied with BigInt. The weighted score of a
   vendor is a fraction of two whole numbers. Scores are compared by cross multiplication, the coverage is compared with the
   minimum, and the tie margin with the difference of two scores, all without rounding. A number is rounded half up, only when
   it is shown, to two decimals (a score) or one (a percent).
2. A weight, a score and a threshold with more than 40 digits before or after the point are a finding and are not read.
3. The reader of tables has limits on rows, columns, cells and the length of a cell, and works through a loop. No function of
   the tool calls itself, and a test fails when one does.
4. Vendors and criteria are kept in maps. The number of criteria a vendor misses is worked out by counting, and only the first
   findings of a check are built; the findings past the cap of 1,000 for a check are counted and a note says how many.
5. Ties are looked for between neighbours in the ranking, which is linear, and not between every pair of vendors.
6. Hostile tests check the time of each kind of input, with limits that widen only when the runner collects coverage.

## Consequences

- The same scorecard gives the same table on every machine, and a score that is a hair above another is above it.
- A report of a hostile scorecard lists the first findings and says how many were left out; it does not list a million.
- The ties of three vendors in a row are the two neighbouring pairs; the pair at the ends is not reported (docs/limits.md).
