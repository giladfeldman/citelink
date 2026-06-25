import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';

/**
 * Regression: a "(also) see <prose> in <Citation>" lead-in on the 2nd member of a
 * ";"-bundle defeated detection (citationguard-iterate 2026-06-25, chen — R-0177
 * Sonnet canary audit).
 *
 * chen: "(Fischhoff, 2007, p. 11; also see interview in Klein, Hegarty, & Fischhoff,
 * 2017)". The bundle splitter splits on ";" into ["Fischhoff, 2007, p. 11",
 * "also see interview in Klein, Hegarty, & Fischhoff, 2017"]. The 2nd fragment's
 * prose lead-in "also see interview in" was not stripped (the existing
 * "see(also)?" branch stops before "interview in"), so the $-anchored fragment
 * matchers never reached "Klein" and the 3-author citation was an
 * INTEXT-DETECTION-MISS — and then a downstream matching miss.
 *
 * Fix: add a "(also )?see <short prose> in" alternative to BOTH the module-level
 * SIGNAL_PREFIX and the bundle-fragment strip in the multipleCitations loop (the two
 * are independent copies and must stay in sync). Bounded to 30 non-comma/semicolon/
 * paren chars after "see" to keep the false-positive surface small.
 */

describe('bundle "(also) see <prose> in" lead-in (chen R-0177)', () => {
  it('detects both citations in the verbatim chen page-locator+prose bundle', () => {
    const text =
      '"in terms that fit now-antiquated mores and theories" (Fischhoff, 2007, p. 11; ' +
      'also see interview in Klein, Hegarty, & Fischhoff, 2017). In correspondence.';
    const cites = detectCitations(text);
    const years = cites.map(c => c.year).sort();
    expect(cites.length).toBe(2);
    expect(years).toEqual(['2007', '2017']);
    // the previously-missed 3-author citation must be present
    const klein = cites.find(c => c.year === '2017');
    expect(klein).toBeDefined();
    expect(JSON.stringify(klein)).toMatch(/klein/i);
  });

  it('detects a standalone "(also see <noun> in Author, year)"', () => {
    const cites = detectCitations('(also see interview in Klein, Hegarty, & Fischhoff, 2017).');
    expect(cites.length).toBe(1);
    expect(cites[0].year).toBe('2017');
  });

  it('does not over-strip a plain bundle without prose lead-ins', () => {
    const cites = detectCitations('(Fischhoff, 2007, p. 11; Klein, Hegarty, & Fischhoff, 2017).');
    expect(cites.length).toBe(2);
  });
});
