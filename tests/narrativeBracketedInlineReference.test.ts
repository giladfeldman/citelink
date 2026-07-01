import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';

/**
 * Regression: a narrative et-al citation whose FULL reference is spelled out inline
 * in square brackets — "McCullough et al. [McCullough, M. E., … (1997). … 321-336.]"
 * — must be detected, keyed to the first year inside the bracket (citationguard-iterate
 * cycle 8, 2026-07-02 — chan_feldman_2025_cogemo, TC-J, R-0177 Sonnet deep audit).
 *
 * An unusual form (chan's abstract spells out the two McCullough references inline).
 * `etAlNarrative` requires "(" immediately after "et al.", so the "[" bracket form was
 * missed entirely. Fix: `etAlBracketedInlineRef` — a pattern anchored on an et-al lead-in
 * followed by "[<Surname>, <Initial>. … (year)". The bracket opener is tightly required
 * to be an author-list token (surname, comma, initial+dot) so it can never fire on an
 * editorial bracket ("[Note: …]"), a numeric citation ("[12]"), or a bracketed quote.
 *
 * The first two inputs are VERBATIM from the chan extraction (DOI 10.1080/02699931.2024.2434156).
 */

function detect(text: string) {
  return detectCitations(text).filter((c) =>
    (c.authors || []).some((a) => (a.raw ?? a.normalized ?? '').toLowerCase().includes('mccullough')),
  );
}

describe('narrative et-al bracketed inline reference (cycle 8, TC-J)', () => {
  it('detects the 1997 bracketed inline reference (chan abstract, verbatim)', () => {
    const text =
      'McCullough et al. [McCullough, M. E., Worthington, E. L., & Rachal, K. C. (1997). Interpersonal Forgiving in Close Relationships. Journal of Personality and Social Psychology, 73(2), 321-336.] demonstrated that empathy matters.';
    const mc = detect(text);
    expect(mc.map((c) => c.year)).toContain('1997');
  });

  it('detects the 1998 bracketed inline reference (chan abstract, verbatim)', () => {
    const text =
      'adopted from McCullough et al. [McCullough, M. E., Rachal, K. C., Sandage, S. J., Worthington, E. L., Brown, S. W., & Hight, T. L. (1998). Interpersonal forgiving in close relationships: II. Journal of Personality and Social Psychology, 75(6), 1586-1603] extended this.';
    const mc = detect(text);
    expect(mc.map((c) => c.year)).toContain('1998');
  });

  it('handles an internal-capital surname in the bracket opener (McCullough)', () => {
    // The opener uses the full surname fragment so an internal-capital surname
    // ("McCullough" — capital C mid-word) in the bracket is recognized, not just "Mc".
    // The detected citation's author is the et-al LEAD-IN ("Smith"), keyed to the
    // bracket's year (2001).
    const cites = detectCitations('Smith et al. [McCullough, M. E. (2001). A title. Journal, 1, 2-3.] noted.');
    const smith = cites.filter((c) =>
      (c.authors || []).some((a) => (a.raw ?? a.normalized ?? '').toLowerCase().includes('smith')),
    );
    expect(smith.length).toBeGreaterThan(0);
    expect(smith.map((c) => c.year)).toContain('2001');
  });

  it('does NOT fire on an editorial bracket "[Note: …]"', () => {
    const cites = detectCitations(
      '[Note: McCullough measured all 8 emotions, though only some analysed. We kept all 8.]',
    );
    // No McCullough citation should be emitted from an editorial note (no author-list opener).
    const mc = cites.filter((c) =>
      (c.authors || []).some((a) => (a.raw ?? '').includes('McCullough')),
    );
    expect(mc.length).toBe(0);
  });

  it('does NOT fire on a numeric/table bracket', () => {
    expect(detectCitations('See results [Table 2] and Smith et al. [12] for details.').length).toBe(0);
  });
});
