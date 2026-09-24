/**
 * Regression: the style detector and the numeric detector read the same bracket in two
 * different ways.
 *
 * `countBracketCitations` (citationStyleDetector.ts) kept its own end-anchored label
 * regex after the numeric detector's bracket branch was fixed. So "the SIR model [1]" or
 * "a strong relationship [2]" counted as a citation for the detector but NOT for the
 * style signal that decides whether that detector runs at all. A paper whose bracket
 * citations all followed such words was classified author-year, and none of its
 * citations were read. Raised by the Opus seat of the 2026-09-24 cross-model consult.
 *
 * Across 147 extracted article texts the shared rule flips no classification; confidence
 * moves by at most 0.003 in 12 papers.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitationStyle } from '../src/citationStyleDetector.js';
import { detectNumericCitations } from '../src/numericCitationDetector.js';

describe('style detector counts brackets the way the numeric detector reads them (2026-09-24)', () => {
  const text =
    'We fit the SIR model [1] to the data. A strong relationship [2] was reported. ' +
    'The Bayesian model [3] was also used. Its empirical counterpart [4] agrees. ' +
    'A study protocol [5] was registered. The sampling model [6] followed.';

  it('the numeric detector reads all six brackets as citations', () => {
    expect(detectNumericCitations(text).flatMap((c) => c.citationNumbers)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('so the style detector classifies the text as numeric, not author-year', () => {
    expect(detectCitationStyle(text).paradigm).toBe('numeric');
  });

  it('a text whose brackets are all labels is still not numeric', () => {
    const labels =
      'As shown in Table [1], the effect holds. See Figure [2]. Substituting into Eq. [3] ' +
      'gives the bound. Supplementary-Table [4] lists items. Model [5] adds covariates.';
    expect(detectCitationStyle(labels).paradigm).not.toBe('numeric');
  });
});
