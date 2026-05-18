/**
 * Regression: APA reference title extraction.
 *
 * citationguard-iterate cycle 1 — citelink dropped the title for ~87% of
 * chen_2021_jesp's references (references F1 0.109, key_only 0.98). Root
 * cause: an APA journal reference without an issue number
 * ("Journal Name, 54, 569-579") does not match REFERENCE_PATTERNS.journalInfo
 * (which requires "(issue)"), so title extraction fell back to
 * afterYear.indexOf('.') — which returns 0, because afterYear starts with the
 * orphan ". " left by "(year)." (REFERENCE_PATTERNS.year does not capture the
 * period). titleEnd === 0 fails the `titleEnd > 0` guard and the title is
 * left empty. The with-issue branch had the mirror bug: it ran the title up
 * to the volume/issue block, swallowing the journal name.
 *
 * The reference strings below are verbatim from the chen_2021_jesp extraction
 * fixture (apps/worker/tests/extraction-results/chen_2021_jesp.pdf_pymupdf.txt),
 * line wraps preserved.
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

const REFS = `References
Baron, J., & Hershey, J. C. (1988). Outcome bias in decision evaluation. Journal of
Personality and Social Psychology, 54, 569–579.
Benjamini, Y., & Hochberg, Y. (1995). Controlling the false discovery rate: A practical
and powerful approach to multiple testing. Journal of the Royal Statistical Society
Series B, 57, 289–300.
Bernstein, D. M., Erdfelder, E., Meltzoff, A. N., Peria, W., & Loftus, G. R. (2011).
Hindsight bias from 3 to 95 years of age. Journal of Experimental Psychology: Learning,
Memory, and Cognition, 37, 378–391.
Bishop, D. (2020a). How scientists can stop fooling themselves over statistics. Nature,
584(7819), 9.
`;

describe('APA reference title extraction', () => {
  const refs = parseReferences(REFS, 'apa');
  const find = (last: string) =>
    refs.find((r) => r.firstAuthorLastName.toLowerCase().includes(last));

  it('extracts the title from a no-issue journal reference (vol, pages)', () => {
    const baron = find('baron');
    expect(baron).toBeDefined();
    expect(baron!.title.toLowerCase()).toContain('outcome bias in decision evaluation');
    expect(baron!.title.toLowerCase()).not.toContain('journal of personality');
  });

  it('extracts a colon-bearing title that wraps across lines', () => {
    const benjamini = find('benjamini');
    expect(benjamini).toBeDefined();
    expect(benjamini!.title.toLowerCase()).toContain('controlling the false discovery rate');
    expect(benjamini!.title.toLowerCase()).not.toContain('royal statistical society');
  });

  it('extracts the title when the year ends one line and the title starts the next', () => {
    const bernstein = find('bernstein');
    expect(bernstein).toBeDefined();
    expect(bernstein!.title.toLowerCase()).toContain('hindsight bias from 3 to 95 years of age');
    expect(bernstein!.title.toLowerCase()).not.toContain('journal of experimental');
  });

  it('does not let the title run into the journal name on a with-issue reference', () => {
    const bishop = find('bishop');
    expect(bishop).toBeDefined();
    expect(bishop!.title.toLowerCase()).toContain('how scientists can stop fooling themselves over statistics');
    expect(bishop!.title.toLowerCase()).not.toContain('nature');
  });
});
