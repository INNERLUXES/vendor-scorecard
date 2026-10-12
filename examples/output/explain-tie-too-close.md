# tie-too-close

- Level: info
- Kind: across rows

**What it looks at.** two vendors next to each other in the ranking whose weighted scores differ by less than the --tie-margin \(default 0.10\), compared exactly; the order between them is too close to call

**Why it exists.** Saying when the ranking cannot separate two vendors is a best practice of this tool; no standard sets it; a rank of 1 and a rank of 2 read as a gap, even when the scores are a hair apart

**What to change.** Do not treat the order of the two as a result. Look at the criteria that differ, at the evidence and at the red flags, or score again.

**What it cannot see.** It looks at neighbours in the ranking. It does not say how much a score of 0.1 is worth, and it does not know how sure the people who scored were.

This check is a best practice of this tool; no standard sets it.
