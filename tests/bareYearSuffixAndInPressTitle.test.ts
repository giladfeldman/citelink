import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser';

/**
 * Regression GUARD for two AOM bare-year title cases that the
 * scimeto-iterate 2026-06-30 audit filed as OPEN (TC-A, TC-C) but which
 * were found already-FIXED at citelink HEAD (v0.7.60) when reproduced in cycle 9
 * (2026-07-02). Per the iterate-loop rule "an incidentally-fixed defect gets a
 * regression test FIRST, then is struck from TRIAGE" — an unprotected incidental
 * fix is a latent regression. These lock the behaviour so a future refactor of
 * the bare-year title path cannot silently reintroduce the empty title.
 *
 * TC-A — Diamond, A. M., Jr., 1986 (amp_1). The `Jr.,` generational suffix puts a
 *   `, ` (not `. `) before the bare year `1986.`, and the title ends in a `?`
 *   ("What is a citation worth?"). The old bare-year title extractor returned an
 *   EMPTY title for this author-shape + question-title. amp_1 gold title_start:
 *   "What is a citation worth?".
 *
 * TC-C — Grand, J. A., … in press. (annals_2). "in press" is not a parseable
 *   4-digit year, so neither the bare-year nor the APA year-anchor used to fire,
 *   leaving the title section unlocated (EMPTY title). annals_2 gold title_start:
 *   "A systems-based approach to fostering robust science in …".
 *
 * The gate is: the title must be NON-EMPTY and must START WITH the gold's
 * title_start prefix (the compare runner scores title fidelity by prefix, so a
 * faithful longer parse still matches; an empty or wrong-prefix title fails).
 * Reference strings are verbatim from the amp_1 / annals_2 extraction fixtures.
 */
describe('bare-year title: Jr.-suffix + question-title (TC-A) and in-press (TC-C)', () => {
  it('TC-A: Diamond, A. M., Jr., 1986 — question-mark title is not empty', () => {
    const REFS = `References
Diamond, A. M., Jr., 1986. What is a citation worth? Journal of Human Resources, 21: 200-215.
Aguinis, H., & Glavas, A. 2020. On corporate social responsibility. Journal of Management, 46: 1057-1086.`;
    const refs = parseReferences(REFS, 'aom');
    const diamond = refs.find(
      (r) => (r.firstAuthorLastName || r.authors?.[0]?.lastName || '').startsWith('Diamond'),
    );
    expect(diamond).toBeDefined();
    expect(diamond!.title && diamond!.title.trim().length).toBeGreaterThan(0);
    // gold title_start is "What is a citation worth?" — citelink must capture it
    // (a faithful prefix; a longer parse that starts with it still passes the gate).
    expect(diamond!.title.startsWith('What is a citation worth?')).toBe(true);
  });

  it('TC-C: Grand, J. A., … in press. — in-press title is not empty', () => {
    const REFS = `References
Grand, J. A., Rogelberg, S. G., Allen, T. D., Landis, R. S., Reynolds, D. H., in press. A systems-based approach to fostering robust science in industrial-organizational psychology. Industrial and Organizational Psychology.
Aguinis, H., & Glavas, A. 2020. On corporate social responsibility. Journal of Management, 46: 1057-1086.`;
    const refs = parseReferences(REFS, 'aom');
    const grand = refs.find(
      (r) => (r.firstAuthorLastName || r.authors?.[0]?.lastName || '').startsWith('Grand'),
    );
    expect(grand).toBeDefined();
    expect(grand!.title && grand!.title.trim().length).toBeGreaterThan(0);
    expect(
      grand!.title.startsWith('A systems-based approach to fostering robust science in'),
    ).toBe(true);
  });
});
