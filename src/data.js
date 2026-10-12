// What every report says about itself. The tool does arithmetic and bookkeeping on the scores people enter. It does not judge
// a vendor, it does not check that a score or a link is true, and it is not advice. No standard sets any check of this tool:
// each one is a best practice of the tool, and the reports and the documents say so.

export const LEVELS = ['info', 'warning', 'error'];

// The kinds of check: about a file itself, about one row, or across rows.
export const KINDS = ['file', 'row', 'across rows'];

export const NOT_A = 'arithmetic and bookkeeping on the scores people enter; it does not judge vendors and it is not advice';

export const NOTICE = 'This report is arithmetic and bookkeeping on the scores in the file. It does not judge any vendor, it does not check that a score or a link is true, and it is not advice.';

// Why a check is a best practice and not a rule.
export const BEST = 'a best practice of this tool; no standard sets it';

// The defaults of the options that set a threshold, as the text of the option.
export const DEFAULTS = { evidenceAbove: '3', minCoverage: '80', tieMargin: '0.1' };

// The highest score.
export const MAX_SCORE = '5';
