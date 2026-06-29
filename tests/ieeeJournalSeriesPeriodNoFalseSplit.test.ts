/**
 * Regression: IEEE reference truncated at an internal journal-name period
 * ("Proceedings of the royal society of london. Series A, …"), dropping the year.
 *
 * citationguard-iterate cycle 6 — ieee_access_2 ref [22] (Kermack & McKendrick,
 * 1927). The reference's journal is "Proceedings of the royal society of london.
 * Series A, Containing papers of a mathematical and physical character, vol. 115,
 * no. 772, pp. 700-721, 1927." — the journal name carries an INTERNAL period
 * ("…london. Series A…"). Step 1c's inline concatenation-splitter found a
 * candidate boundary at "london. Series" (its `[a-z0-9]{2}[.)\]]+\s+(?=[A-Z])`
 * sentence-end pattern), and the chunk "Series A, Containing… 1927." satisfied
 * both `refStartPattern` (matched "Series" as a surname, " A," as initials) and
 * the "year within 300 chars" guard (1927). So it FALSE-split the single IEEE
 * reference at its journal name, truncating Kermack to "…of london." and dropping
 * the trailing "…1927." — `ref.year` came back empty.
 *
 * For numeric styles (Vancouver/IEEE/Nature/AMA) the reference delimiter is the
 * bracket/number marker (`[N]`), never an internal sentence period — a real new
 * numeric reference begins at "[23]", not mid-journal-name. The fix restricts
 * step 1c's split candidates, for numeric styles, to positions that begin a new
 * bracket/number marker, so a journal-name period inside one entry can no longer
 * orphan the tail (and its year).
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

const IEEE_REFS = `
References
[21] B. Aguda and A. Friedman, "Bifurcation dynamics," J. Theor. Biol., vol. 250, pp. 1-10, 2008.
[22] W. O. Kermack and A. G. McKendrick, "A contribution to the mathematical theory of epidemics," Proceedings of the royal society of london. Series A, Containing papers of a mathematical and physical character, vol. 115, no. 772, pp. 700-721, 1927.
[23] C. G. Cassandras and S. Lafortune, Introduction to discrete event systems. Springer, 2008.
`;

describe('IEEE: internal journal-name period ("london. Series A") must not truncate the reference', () => {
  it('keeps Kermack [22] whole and extracts the year 1927', () => {
    const refs = parseReferences(IEEE_REFS, 'ieee');
    const kermack = refs.find((r) => r.firstAuthorLastName === 'Kermack');
    expect(kermack).toBeDefined();
    expect(kermack!.year).toBe('1927');
    // The journal-name tail must remain part of THIS reference, not be orphaned.
    expect(kermack!.raw).toMatch(/Series A/);
  });

  it('does not spawn a phantom author-less "Series A" reference', () => {
    const refs = parseReferences(IEEE_REFS, 'ieee');
    const phantom = refs.find((r) => /^(Series|Containing)/.test((r.raw || '').trim()));
    expect(phantom).toBeUndefined();
  });

  it('still splits the three real numbered references', () => {
    const refs = parseReferences(IEEE_REFS, 'ieee');
    const surnames = refs.map((r) => r.firstAuthorLastName);
    expect(surnames).toContain('Aguda');
    expect(surnames).toContain('Kermack');
    expect(surnames).toContain('Cassandras');
  });
});
