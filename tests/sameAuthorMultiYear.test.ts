/**
 * Regression: same-author multi-year parentheticals must emit one citation
 * per year.
 *
 * citationguard-iterate cycle 18 (2026-05-26 canary audit) — the Sonnet audit
 * surfaced bare-year continuation misses across chen_2021_jesp and
 * collabra_90203:
 *   "(e.g., Bishop, 2019, 2020a, 2020b)"  → only Bishop 2019 detected
 *   "(Dickert et al., 2012, 2015)"        → only Dickert 2012 detected
 *   "(Thaler, 1985, 1999)"                → only Thaler 1985 detected
 *
 * Root cause: the `sameAuthorMultipleYears` / `sameAuthorSameYear` patterns
 * existed but were NEVER consumed by any detection loop, and they only
 * handled exactly two years, no "et al.", no signal prefix. They are replaced
 * by `sameAuthorMultiYear` (2+ years, optional "et al.", optional signal
 * prefix) with an actual consumer loop. Two supporting fixes shipped with it:
 *  (a) each sibling year gets a DISTINCT source position (located by offset
 *      within the match) so addCitation()'s position-dedup keeps all of them;
 *  (b) the end-of-detection de-overlap pass is identity-aware so equal/near
 *      span siblings with different (author, year) are not collapsed.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

const keys = (text: string) =>
  detectCitations(text).map(
    c => c.authors.map(a => a.normalized).join('+') + '|' + c.year + (c.yearSuffix || ''),
  );

describe('same-author multi-year parentheticals', () => {
  it('emits one citation per year for "(e.g., Bishop, 2019, 2020a, 2020b)"', () => {
    const k = keys('Prior work (e.g., Bishop, 2019, 2020a, 2020b) shows this.');
    expect(k).toContain('bishop|2019');
    expect(k).toContain('bishop|2020a');
    expect(k).toContain('bishop|2020b');
  });

  it('handles "et al." with multiple years: "(Dickert et al., 2012, 2015)"', () => {
    const k = keys('Earlier studies (Dickert et al., 2012, 2015) found effects.');
    expect(k).toContain('dickert+et al|2012');
    expect(k).toContain('dickert+et al|2015');
  });

  it('handles plain two-year: "(Thaler, 1985, 1999)"', () => {
    const k = keys('As in (Thaler, 1985, 1999).');
    expect(k).toContain('thaler|1985');
    expect(k).toContain('thaler|1999');
  });

  it('does NOT fire on a single-year citation', () => {
    const k = keys('A single citation (Smith, 2020) only.');
    expect(k).toEqual(['smith|2020']);
  });

  it('does NOT absorb a following separate citation', () => {
    // The multi-year group must stop at the close paren — the second
    // parenthetical is its own (separate) citation.
    const k = keys('Work (Jones, 2019, 2021) and later (Brown, 2022).');
    expect(k).toContain('jones|2019');
    expect(k).toContain('jones|2021');
    expect(k).toContain('brown|2022');
  });

  it('does not regress multi-author semicolon bundles', () => {
    const k = keys('Prior (Mazursky & Ofir, 1990; Müller & Stahlberg, 2007).');
    expect(k).toContain('mazursky+ofir|1990');
    expect(k).toContain('muller+stahlberg|2007');
  });

  it('does not treat a sentence connector as the shared author', () => {
    // "Recently, 2019, 2020" must not parse "Recently" as an author.
    const k = keys('Recently, 2019, 2020 were notable years.');
    expect(k.some(x => x.startsWith('recently'))).toBe(false);
  });
});
