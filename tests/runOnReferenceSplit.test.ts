/**
 * Regression: MULTIPLE complete APA references concatenated onto one line (no
 * separating newline) must each be parsed as a distinct reference.
 *
 * citationguard-iterate 2026-06-07b — surfaced ONLY against the docpluck-academic
 * (pdftotext) extraction substrate (the production input), not the prior raw-pymupdf
 * fixture. On chan_feldman_2025_cogemo (DOI 10.1080/02699931.2024.2434156),
 * pdftotext joined the reference entries — including across a DOI with no trailing
 * period ("...75.6.1586 McCullough, M. E., & Rachal, K. C. (1997)...") — so a single
 * line held Maio (2008) + McCullough (2013) + McCullough (1998) + McCullough (1997).
 * splitIntoReferences' step-1c inline splitter skips blocks that are mostly
 * newline-separated, so only Maio was parsed and the three McCullough entries were
 * swallowed. The replication target "McCullough et al." is cited 64× in-text; with
 * no McCullough reference to resolve to, matching accuracy collapsed to 0.645.
 *
 * The strings below are VERBATIM from the extraction fixture
 * apps/worker/tests/extraction-results/chen-/chan_feldman_2025_cogemo.docpluck_academic.txt
 * (lines 1180–1181), line wrap preserved.
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences, splitConcatenatedApaReferences } from '../src/referenceParser.js';

// Verbatim run-on block (two physical lines, joined by extraction with no separators).
const RUN_ON = `References
Maio, G. R., Thomas, G., Fincham, F. D., & Carnelley, K. B. (2008). Unraveling the role of forgiveness in family relationships. Journal of Personality and Social Psychology, 94(2), 307-319. McCullough, M. E., Kurzban, R., & Tabak, B. A. (2013). Cognitive systems for revenge and forgiveness. The Behavioral and Brain Sciences, 36(1), 1-15. https://doi.org/10.1017/ S0140525X11002160 McCullough, M. E., Rachal, K. C., Sandage, S. J., Worthington, E. L.,
Brown, S. W., & Hight, T. L. (1998). Interpersonal forgiving in close relationships: II. Theoretical Elaboration and Measurement. Journal of Personality and Social Psychology, 75 (6), 1586-1603. https://doi.org/10.1037/0022-3514.75.6.1586 McCullough, M. E., Worthington, E. L., & Rachal, K. C. (1997). Interpersonal forgiving in close relationships. Journal of Personality and Social Psychology, 73(2), 321-336. https:// doi.org/10.1037/0022-3514.73.2.321`;

describe('run-on reference splitting (concatenated APA entries)', () => {
  it('parses Maio 2008 + McCullough 2013/1998/1997 as four distinct references', () => {
    const refs = parseReferences(RUN_ON, 'apa');
    const byAuthorYear = (last: string, year: string) =>
      refs.find(
        r => r.authors[0]?.lastName?.toLowerCase() === last.toLowerCase() && r.year === year
      );

    // The replication target — must be recovered (was swallowed before the fix).
    expect(byAuthorYear('McCullough', '1997')).toBeTruthy();
    expect(byAuthorYear('McCullough', '1998')).toBeTruthy();
    expect(byAuthorYear('McCullough', '2013')).toBeTruthy();
    // And the leading entry that previously absorbed them all.
    expect(byAuthorYear('Maio', '2008')).toBeTruthy();

    // At least 4 distinct references from this block (before the fix: 1).
    const mcCount = refs.filter(r => r.authors[0]?.lastName === 'McCullough').length;
    expect(mcCount).toBeGreaterThanOrEqual(3);
  });

  it('splitConcatenatedApaReferences splits a run-on block but leaves clean refs intact', () => {
    const block =
      'Maio, G. R., Thomas, G., Fincham, F. D., & Carnelley, K. B. (2008). Unraveling the role of forgiveness in family relationships. Journal of Personality and Social Psychology, 94(2), 307-319. McCullough, M. E., Kurzban, R., & Tabak, B. A. (2013). Cognitive systems for revenge and forgiveness. The Behavioral and Brain Sciences, 36(1), 1-15.';
    expect(splitConcatenatedApaReferences(block).length).toBe(2);

    // A single, already-clean reference must NOT be split.
    const clean =
      'Fritz, C. O., Morris, P. E., & Richler, J. J. (2012). Effect size estimates: Current use, calculations, and interpretation. Journal of Experimental Psychology: General, 141, 2-18.';
    expect(splitConcatenatedApaReferences(clean)).toEqual([clean]);

    // A reference whose annotation mentions another author+year mid-sentence must
    // NOT be split (the preceding-char + author-list guards protect this).
    const annotated =
      'Smith, J. A. (2020). A careful reply to the earlier work, building on Jones, K. (2019). Journal of Testing, 5, 1-10.';
    expect(splitConcatenatedApaReferences(annotated)).toEqual([annotated]);
  });
});
