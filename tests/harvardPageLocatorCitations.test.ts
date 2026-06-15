/**
 * Harvard page-locator citation detection (bjps_1 / H2 cycle 1)
 *
 * Harvard in-text citations frequently carry a bare page locator after the year,
 * WITHOUT a `p.`/`pp.` prefix:
 *   (Hacker et al. 2014, S5)   (Western et al. 2012, 342)
 *   (Stanley and Doucouliagos 2012, 43-5)
 *   Mughan and Lacy (2002, 513)   Berman (2021, 75-6)
 *
 * Before the fix, every Harvard parenthetical + narrative pattern anchored the
 * year as `(\d{4})\)` (closing paren immediately after the year) and the only
 * page-aware pattern (`singleWithPage`) required a `pp?\.` prefix AND was
 * single-author only — so all of the above were missed entirely.
 *
 * Text snippets are verbatim from the docpluck-academic extraction of
 * bjps_1 (DOI 10.1017/S0007123424000024).
 */

import { describe, it, expect } from '@jest/globals';
import { detectHarvardCitations } from '../src/harvardCitationDetector.js';

const find = (text: string, firstAuthor: string, year: string) =>
  detectHarvardCitations(text).find(
    c => c.authors[0].raw === firstAuthor && c.year === year,
  );

describe('Harvard page-locator citations (bare page, no p./pp. prefix)', () => {
  describe('parenthetical et al. + page', () => {
    it('detects (Hacker et al. 2014, S5) — alphanumeric page', () => {
      const text = "sub-groups of Americans' (Hacker et al. 2014, S5), the welfare state";
      const c = find(text, 'Hacker', '2014');
      expect(c).toBeDefined();
      expect(c!.type).toBe('et_al');
    });

    it('detects (Western et al. 2012, 342) — numeric page', () => {
      const text = "events of social life' (Western et al. 2012, 342) and beyond";
      const c = find(text, 'Western', '2012');
      expect(c).toBeDefined();
      expect(c!.type).toBe('et_al');
    });

    it('detects (Gough et al. 2012, 3) — single-digit page', () => {
      const text = "generating new primary research' (Gough et al. 2012, 3).";
      expect(find(text, 'Gough', '2012')).toBeDefined();
    });
  });

  describe('parenthetical two-author + page range', () => {
    it('detects (Stanley and Doucouliagos 2012, 43-5)', () => {
      const text = 'citations (Stanley and Doucouliagos 2012, 43-5), indicating';
      const c = find(text, 'Stanley', '2012');
      expect(c).toBeDefined();
      expect(c!.type).toBe('two_authors');
    });
  });

  describe('narrative + page', () => {
    it('detects Mughan and Lacy (2002, 513)', () => {
      const text = 'As Mughan and Lacy (2002, 513) argue, the populist';
      const c = find(text, 'Mughan', '2002');
      expect(c).toBeDefined();
      expect(c!.citationStyle).toBe('narrative');
      expect(c!.type).toBe('two_authors');
    });

    it('detects Berman (2021, 75-6) — narrative single + page range', () => {
      const text = 'consistent with these findings. Berman (2021, 75-6) shows that';
      const c = find(text, 'Berman', '2021');
      expect(c).toBeDefined();
      expect(c!.citationStyle).toBe('narrative');
    });
  });

  describe('FP guard — must NOT invent citations from a year + trailing number that is not a citation', () => {
    it('does not detect a bare clause like "in 2012, 342 respondents"', () => {
      const text = 'In 2012, 342 respondents completed the survey.';
      // "In" is lowercase-after-cap noise; no capitalized author precedes a (YYYY) here
      const c = detectHarvardCitations(text).find(x => x.year === '2012');
      expect(c).toBeUndefined();
    });
  });
});
