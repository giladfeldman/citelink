import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser';

/**
 * Regression: APA-path reference TITLE extraction when the year is found via a
 * FALLBACK (not the parenthesized `(YYYY)`) — citationguard-iterate cycle 7,
 * 2026-06-30 (amp_1 Diamond + annals_2 Grand, surfaced by the R-0177 Sonnet audit).
 *
 * `parseAPAReference` gates BOTH author extraction and title extraction on
 * `yearMatch.index`, where `yearMatch` is the PARENTHESIZED-year match. When a
 * reference's year is only resolvable via the bare-year fallback (a comma — not a
 * paren — precedes the year, e.g. `Diamond, A. M., Jr., 1986.`) or via the
 * "in press" fallback (`Grand, … in press.`), `yearMatch` was left null, so the
 * title-extraction block never ran and the title came out EMPTY.
 *
 * Fix: when the year is resolved through either fallback, synthesize a `yearMatch`
 * anchored at the END of the year / "in press" token, so `afterYear` (the title
 * section) resolves correctly.
 *
 * Inputs are VERBATIM from the docpluck-academic extraction of the two papers
 * (DOI 10.5465/amp.2023.0198 and 10.5465/annals.2016.0011).
 */

function refOf(refText: string) {
  return parseReferences(`References\n\n${refText}\n`, 'aom')[0] ?? ({} as any);
}

describe('APA-path fallback-year title extraction (cycle 7)', () => {
  it('extracts a title for a Jr.-suffix reference whose year follows a comma (amp_1 Diamond 1986)', () => {
    const r = refOf('Diamond, A. M., Jr., 1986. What is a citation worth? Journal of Human Resources, 21: 200-215.');
    expect(r.year).toBe('1986');
    // BEFORE the fix this was '' (empty). The title must now be present and begin
    // with the real title. (The `.`-first terminator preference — documented in
    // apaTitleQuestionMarkBoundary.test.ts — means a title ending in `?` followed
    // by a journal runs into the journal; that is the accepted trade-off, so we
    // assert a prefix, not exact equality.)
    expect(r.title).toContain('What is a citation worth?');
  });

  it('extracts a title for an "in press" reference (annals_2 Grand)', () => {
    const r = refOf(
      'Grand, J. A., Rogelberg, S. G., Allen, T. D., & Truxillo, D. M. in press. ' +
        'A systems-based approach to fostering robust science in industrial-organizational ' +
        'psychology. Industrial and Organizational Psychology.',
    );
    expect(r.year).toBe('in press');
    // BEFORE the fix this was '' (empty).
    expect(r.title).toBe('A systems-based approach to fostering robust science in industrial-organizational psychology.');
    expect(r.title).not.toContain('Industrial and Organizational Psychology');
  });

  it('still extracts the author for a fallback-year reference (regression guard)', () => {
    const r = refOf('Diamond, A. M., Jr., 1986. What is a citation worth? Journal of Human Resources, 21: 200-215.');
    const fa = (r.firstAuthorLastName || r.authors?.[0]?.lastName || '').toLowerCase();
    expect(fa).toContain('diamond');
  });
});
