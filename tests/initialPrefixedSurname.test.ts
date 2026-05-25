/**
 * Regression: surnames preceded by a disambiguating initial — "S. Lee &
 * Feeley, 2018", "M. D. Lee & Wagenmakers, 2013" — must be detected with
 * the captured first author = the surname (initial(s) consumed but
 * stripped from the key), not skipped entirely.
 *
 * citationguard-iterate cycle 16 — collabra_90203 uses "S. Lee" / "M. D. Lee"
 * as disambiguators because two co-authors share the "Lee" surname.
 * Pre-fix: the patterns required `[A-Z][a-z]+` immediately after `\(`, so
 * "S." didn't match (single capital + period). Fix: an optional non-capturing
 * `(?:[A-Z]\.\s*){0,3}` prefix is allowed before the surname; it's not part
 * of the captured author group.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

describe('initial-prefixed surnames', () => {
  it('detects "(S. Lee & Feeley, 2018)" — single-initial first author', () => {
    const text = 'The earlier meta-analysis (S. Lee & Feeley, 2018) reported r=.05.';
    const cits = detectCitations(text);
    const l = cits.find(c => /lee/i.test(c.authors[0]?.normalized || '') && c.year === '2018');
    expect(l).toBeDefined();
    // Key is on the surname, not the initial.
    expect(l!.authors[0].normalized?.toLowerCase()).toBe('lee');
  });

  it('detects "(M. D. Lee & Wagenmakers, 2013, p. 105)" — multi-initial first author', () => {
    const text = 'Bayesian basics (M. D. Lee & Wagenmakers, 2013, p. 105) covers priors.';
    const cits = detectCitations(text);
    const l = cits.find(c => /lee/i.test(c.authors[0]?.normalized || '') && c.year === '2013');
    expect(l).toBeDefined();
    expect(l!.authors[0].normalized?.toLowerCase()).toBe('lee');
  });

  it('detects "(S. Lee, 2020)" — single-author with initial', () => {
    const text = 'A standalone study (S. Lee, 2020) discussed the issue.';
    const cits = detectCitations(text);
    const l = cits.find(c => /lee/i.test(c.authors[0]?.normalized || '') && c.year === '2020');
    expect(l).toBeDefined();
  });

  it('does not incorrectly consume non-initial single capitals (e.g. "I" pronoun)', () => {
    // "I Smith (2020)" — "I" is a pronoun, not an initial. The pattern requires
    // INITIAL\. (period) so this stays safe.
    const text = 'Recently I Smith (2020) was misquoted.';
    const cits = detectCitations(text);
    // Whatever citelink decides about "Smith (2020)", it must NOT consume "I "
    // as an initial.
    const s = cits.find(c => /smith/i.test(c.authors[0]?.normalized || ''));
    if (s) {
      expect(s.authors[0].normalized?.toLowerCase()).toBe('smith');
    }
  });
});
