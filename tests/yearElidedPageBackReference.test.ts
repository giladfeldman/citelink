import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';

/**
 * Regression: a same-paragraph page-only back-reference that ELIDES the year because
 * the author was just cited with a year — '"…quote…" (Slovic & Fischhoff, p. 549).'
 * — must be detected and resolved to that author's year (citationguard-iterate cycle 8,
 * 2026-07-02 — chen_2021_jesp, TC-G, R-0177 Sonnet deep audit).
 *
 * citelink's detectors require a 4-digit year, so a year-less "(Author, p. N)" was
 * missed. Fix: a stateful post-pass (`YEAR_ELIDED_PAGE_REF`) that resolves the year
 * from the nearest already-detected same-first-author citation. FP is bounded hard:
 * (1) a page locator ("p. N"/"pp. N") and NO year are both required — a bare
 * "(Name)" never matches; (2) the year is taken ONLY from a citation citelink
 * already detected for that exact author, so it can never invent a citation for an
 * author not otherwise cited with a year.
 *
 * The chen input is VERBATIM from the extraction (DOI 10.1016/j.jesp.2021.104154).
 */

function detect(text: string) {
  return detectCitations(text);
}

describe('year-elided page-only back-reference (cycle 8, TC-G)', () => {
  it('resolves "(Slovic & Fischhoff, p. 549)" to 1977 from the prior citation (chen, verbatim)', () => {
    const text =
      'Slovic and Fischhoff (1977) examined this. They asked participants to indicate ' +
      '"how surprising each of the two possible outcomes would seem were they obtained" ' +
      '(Slovic & Fischhoff, p. 549). They found direct support for the hypothesis.';
    const sf = detect(text).filter((c) =>
      (c.authors || []).some((a) => (a.raw ?? a.normalized ?? '').toLowerCase().includes('slovic')),
    );
    // Both the narrative 1977 and the resolved p.549 back-reference are present, all 1977.
    expect(sf.length).toBeGreaterThanOrEqual(2);
    expect(sf.every((c) => c.year === '1977')).toBe(true);
  });

  it('resolves a single-author page-only back-reference to the prior year', () => {
    const sf = detect('Jones (2010) argued X. See also (Jones, p. 88) for detail.').filter((c) =>
      (c.authors || []).some((a) => (a.raw ?? a.normalized ?? '').toLowerCase().includes('jones')),
    );
    expect(sf.map((c) => c.year)).toContain('2010');
    expect(sf.length).toBeGreaterThanOrEqual(2);
  });

  it('does NOT invent a citation when the author was never cited with a year (FP guard)', () => {
    // No prior "Smith (YEAR)" anywhere → the page-only "(Smith, p. 12)" must be ignored.
    const smith = detect('We used a validated scale (Smith, p. 12).').filter((c) =>
      (c.authors || []).some((a) => (a.raw ?? a.normalized ?? '').toLowerCase().includes('smith')),
    );
    expect(smith.length).toBe(0);
  });

  it('leaves a page-reference that HAS a year to the normal parenthetical path', () => {
    // "(Doe & Roe, 2015, p. 4)" carries a year — the year-elided pass must not touch it,
    // and it must still be detected (as 2015) by the normal path.
    const dr = detect('A quote appears (Doe & Roe, 2015, p. 4).').filter((c) =>
      (c.authors || []).some((a) => (a.raw ?? a.normalized ?? '').toLowerCase().includes('doe')),
    );
    expect(dr.map((c) => c.year)).toContain('2015');
  });
});
