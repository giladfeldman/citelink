/**
 * Harvard in-text possessive narrative + capitalized lead-in (bjps_1 / H2-D cycle 3)
 *
 * "According to Barr's (2009, 44) ..." was detected as NOTHING:
 *   - the surname infix matched ANY lowercase word, so "According to Barr's" was
 *     captured as one span starting at the capitalized lead-in "According", which
 *     COMMON_WORDS then guards out — dropping the real citation entirely; and
 *   - even in isolation "Barr's (2009)" keyed on "barr's" (possessive kept), which
 *     matches neither the gold key "barr" nor the reference.
 *
 * Fix: restrict the lowercase surname infix to actual nobiliary particles (so a
 * lead-in word like "to" can't be absorbed and the matcher re-anchors on the real
 * surname), and strip a trailing possessive `'s` / `'` from the in-text surname.
 *
 * Snippet is verbatim from the docpluck-academic extraction of bjps_1
 * (DOI 10.1017/S0007123424000024) — straight apostrophe U+0027.
 */

import { describe, it, expect } from '@jest/globals';
import { detectHarvardCitations } from '../src/harvardCitationDetector.js';

const find = (text: string, firstAuthor: string, year: string) =>
  detectHarvardCitations(text).find(
    c => c.authors[0].raw === firstAuthor && c.year === year,
  );

describe('Harvard possessive narrative + capitalized lead-in', () => {
  it('keys a possessive citation with a capitalized lead-in on Barr (lead-in dropped, possessive stripped)', () => {
    const text = "According to Barr's (2009, 44) wide-ranging account";
    const c = find(text, 'Barr', '2009');
    expect(c).toBeDefined();
    expect(c!.citationStyle).toBe('narrative');
  });

  it('strips the possessive from a bare possessive narrative (Smith)', () => {
    const text = "Smith's (2019) framework predicts";
    const c = find(text, 'Smith', '2019');
    expect(c).toBeDefined();
    // not keyed on the possessive form
    expect(find(text, "Smith's", '2019')).toBeUndefined();
  });

  describe('regression guards — the infix restriction must not lose real surnames', () => {
    it('keeps a lowercase-particle surname "Smith van Berg (2019)"', () => {
      const text = 'As Smith van Berg (2019) shows';
      const c = find(text, 'Smith van Berg', '2019');
      expect(c).toBeDefined();
    });

    it('keeps "According to Smith and Jones (2020)" keyed on Smith, not the lead-in', () => {
      const text = 'According to Smith and Jones (2020) the effect';
      const c = find(text, 'Smith', '2020');
      expect(c).toBeDefined();
      expect(c!.type).toBe('two_authors');
      expect(find(text, 'According', '2020')).toBeUndefined();
    });
  });
});
