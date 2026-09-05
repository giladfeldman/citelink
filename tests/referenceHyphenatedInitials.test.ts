import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser';

/**
 * Regression: a reference author with a HYPHENATED initial ("Cam, M.-A.", "Lee,
 * J.-P.") was DROPPED from the author list, under-counting the reference's authors.
 * "Camilleri, A. R., Cam, M.-A., & Hoffmann, R. 2007." parsed only 2 authors
 * (Camilleri, Hoffmann — "Cam, M.-A." lost). That under-count then failed matching:
 * the in-text "Camilleri, Cam, & Hoffmann (2007)" is an et-al citation, and
 * `matchEtAl` requires the reference to have ≥3 authors — with authorCount=2 it
 * scored 0.2 (below the 0.3 threshold) and the citation was left unmatched.
 *
 * Root cause: two initials patterns in `parseAuthorsFromSection` — the `authorPattern`
 * initials group `(?:[A-Z]\.?\s*)+` and the comma-split fallback's initials test
 * `/^[A-Z]\.?(\s*[A-Z]\.?)*$/` — did not admit a hyphen BETWEEN initials, so "M.-A."
 * was not recognized as initials and "Cam" was mis-split.
 *
 * Fix (the platform's hardening workflow 2026-07-04, R-0177 Sonnet audit on annals_1): both
 * patterns now allow `[-\s]` between initials.
 */
describe('reference parser keeps an author with a hyphenated initial', () => {
  const authors = (block: string, style?: any) =>
    parseReferences(block, style)[0]?.authors?.map((a) => a.lastName) ?? [];

  it('parses all 3 authors of "Camilleri, A. R., Cam, M.-A., & Hoffmann, R." (not 2)', () => {
    const block = `REFERENCES
Camilleri, A. R., Cam, M.-A., & Hoffmann, R. 2007. Nudges and signposts: The effect of smart defaults on retirement saving. Journal of Behavioral Decision Making, 20: 1-15.`;
    const a = authors(block, 'aom');
    expect(a).toEqual(['Camilleri', 'Cam', 'Hoffmann']);
  });

  it('handles a hyphenated initial in the FIRST author too ("Lee, J.-P., & Kim, S.")', () => {
    const block = `REFERENCES
Lee, J.-P., & Kim, S. 2019. A study of hyphenated given names. Journal of Testing, 5(1): 1-10.`;
    const a = authors(block, 'aom');
    expect(a).toContain('Lee');
    expect(a).toContain('Kim');
  });

  it('still parses a normal (non-hyphenated) initials list unchanged', () => {
    const block = `REFERENCES
Smith, A. B., Jones, C. D., & Brown, E. F. 2020. A control entry with normal initials. Test Journal, 2(1): 1-5.`;
    const a = authors(block, 'aom');
    expect(a).toEqual(['Smith', 'Jones', 'Brown']);
  });
});
