/**
 * Regression: narrative citations of the shape
 *   "Author1, Author2, ..., and AuthorN (YEAR)"
 * must be detected. Pre-cycle-15, citelink had:
 *   - twoAuthorNarrative — "Smith and Jones (2020)"
 *   - etAlNarrative — "Smith et al. (2020)"
 *   - multiAuthorParenthetical (cycle 10) — "(Smith, Jones, & Brown, 2020)"
 *   - mixedListEtAlNarrative (cycle 13) — "Smith, Jones, et al. (2020)"
 * but NO pattern for the APA-6 comma-list-with-"and" narrative form. Affects
 * chen_2021_jesp ("Arkes, Wortmann, Saville, and Harkness (1981)") and
 * collabra_90203 ("Hart, Lane, and Chinn (2018)").
 *
 * citationguard-iterate cycle 15.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

describe('multi-author narrative with "and"', () => {
  it('detects "Arkes, Wortmann, Saville, and Harkness (1981)" — 4 authors', () => {
    const text = 'For example, Arkes, Wortmann, Saville, and Harkness (1981) found that hindsight bias.';
    const cits = detectCitations(text);
    const a = cits.find(c => /arkes/i.test(c.authors[0]?.normalized || '') && c.year === '1981');
    expect(a).toBeDefined();
    expect(a!.type).toBe('et_al');
    expect(a!.citationStyle).toBe('narrative');
  });

  it('detects "Hart, Lane, and Chinn (2018)" — 3 authors', () => {
    const text = 'A relevant study, Hart, Lane, and Chinn (2018), tested the design.';
    const cits = detectCitations(text);
    const h = cits.find(c => /hart/i.test(c.authors[0]?.normalized || '') && c.year === '2018');
    expect(h).toBeDefined();
  });

  it('detects "Fritz, Morris, and Richler (2012)" — 3 authors with CamelCase', () => {
    const text = 'Effect sizes from Fritz, Morris, and Richler (2012) for paired t-tests.';
    const cits = detectCitations(text);
    const f = cits.find(c => /fritz/i.test(c.authors[0]?.normalized || '') && c.year === '2012');
    expect(f).toBeDefined();
  });

  it('does NOT swallow a preceding lowercase prefix into the author list', () => {
    // Guard against the cycle-7 prefix-leak class. A leading "Replication of"
    // or similar prose must not bleed into the author capture.
    const text = 'A replication of Smith, Jones, and Brown (2020) by other authors.';
    const cits = detectCitations(text);
    const s = cits.find(c => /smith/i.test(c.authors[0]?.normalized || '') && c.year === '2020');
    expect(s).toBeDefined();
    // The first author must be "Smith", not "Replication of Smith".
    expect(s!.authors[0].normalized?.toLowerCase()).toMatch(/^smith$/);
  });
});
