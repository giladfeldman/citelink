/**
 * Regression: an APA reference TITLE that begins with a part-number / volume
 * prefix ending in a period ("VII.", "Pt. 1.", "No. 3.", "Vol. 2.") was
 * truncated to just that prefix. The title is "the first sentence after the
 * year", anchored on the first period-then-space — but a leading "VII." ends in
 * exactly that, so the whole title collapsed to "VII.".
 *
 * citationguard-iterate (2026-06-08) — surfaced on chan_feldman_2025_cogemo
 * (Pearson & Filon 1898, a multi-part old reference). The reference line is
 * verbatim from the chan docpluck-academic fixture.
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

const DOC = `Some body text citing prior work.

References
Aron, A., & Aron, E. N. (1986). Love and the expansion of self. Hemisphere.
Pearson, K., & Filon, L. N. G. (1898). VII. Mathematical contributions to the theory of evolution.-- IV. On the probable errors of frequency constants and on the influence of random selection on variation and correlation. Series A, Containing Papers of a Mathematical or Physical Character, 62(191), 229-311.
Smith, J. A. (2020). A perfectly ordinary title. Journal of Things, 12(3), 1-10.
`;

describe('APA title with a leading part-number prefix', () => {
  const refs = parseReferences(DOC);
  const pearson = refs.find((r) => (r.authors?.[0]?.lastName ?? r.authors?.[0] ?? '')
    .toString()
    .includes('Pearson'));

  it('does not truncate the title to the "VII." prefix', () => {
    expect(pearson).toBeDefined();
    expect(pearson!.title).not.toBe('VII.');
    // The real title continues past the roman-numeral part number.
    expect((pearson!.title ?? '').toLowerCase()).toContain('mathematical contributions');
  });

  it('still parses an ordinary title unchanged (no regression)', () => {
    const smith = refs.find((r) => (r.authors?.[0]?.lastName ?? r.authors?.[0] ?? '')
      .toString()
      .includes('Smith'));
    expect(smith?.title).toBe('A perfectly ordinary title.');
  });
});
