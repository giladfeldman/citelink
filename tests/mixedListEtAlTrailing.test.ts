/**
 * Regression: citations of the shape "Author1, Author2, ..., et al., YEAR"
 * must be detected — APA 7's "first author + 2nd author + et al." disambiguator
 * for same-year-same-first-author refs.
 *
 * citationguard-iterate cycle 12 — collabra_90203 has 8+ Bartoš-prefix
 * citations using this disambiguator:
 *   "Bartoš, Maier, Wagenmakers, et al., 2022"
 *   "Bartoš, Maier, Quintana, et al., 2022"
 *   "Bartoš, Maier, Shanks, et al., 2022"
 *   "Maier, Bartoš, et al., 2022"
 *
 * citelink's previous patterns:
 *  - etAlNarrative / etAlParenthetical: only "Author et al. (YEAR)" — no
 *    mid-list authors.
 *  - multiAuthorParenthetical (cycle 10): "Author1, ..., & AuthorN, YEAR" —
 *    no et al. tail.
 *
 * Neither matches the disambiguator. Pattern `mixedListEtAlParenthetical`
 * fills the gap inside parens; the multi-citation split-handler gets the
 * same addition for bundle items.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

describe('mixed-list citations with trailing et al.', () => {
  it('detects "(Bartoš, Maier, Wagenmakers, et al., 2022)"', () => {
    const text = 'The reanalysis (Bartoš, Maier, Wagenmakers, et al., 2022) extended the model.';
    const cits = detectCitations(text);
    const b = cits.find(c => /bartos/i.test(c.authors[0]?.normalized || '') && c.year === '2022');
    expect(b).toBeDefined();
    expect(b!.type).toBe('et_al');
  });

  it('detects "(Maier, Bartoš, et al., 2022)" — 2 named + et al.', () => {
    const text = 'A companion paper (Maier, Bartoš, et al., 2022) covered the variant.';
    const cits = detectCitations(text);
    const m = cits.find(c => /maier/i.test(c.authors[0]?.normalized || '') && c.year === '2022');
    expect(m).toBeDefined();
  });

  it('detects "Bartoš, Maier, Wagenmakers, et al. (2022)" — narrative form', () => {
    const text = 'In their reanalysis, Bartoš, Maier, Wagenmakers, et al. (2022) extended the model.';
    const cits = detectCitations(text);
    const b = cits.find(c => /bartos/i.test(c.authors[0]?.normalized || '') && c.year === '2022');
    expect(b).toBeDefined();
    expect(b!.citationStyle).toBe('narrative');
    expect(b!.type).toBe('et_al');
  });

  it('detects mixed-list inside a multi-citation bundle', () => {
    const text =
      'Two reanalyses (Bartoš, Maier, Wagenmakers, et al., 2022; ' +
      'Bartoš, Maier, Quintana, et al., 2022) extended the model.';
    const cits = detectCitations(text);
    const all = cits.filter(c => /bartos/i.test(c.authors[0]?.normalized || ''));
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});
