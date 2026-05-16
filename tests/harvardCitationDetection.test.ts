/**
 * Harvard Citation Detection Tests
 * Tests (Author Year) without comma patterns
 */

import { describe, it, expect } from '@jest/globals';
import { detectHarvardCitations } from '../src/harvardCitationDetector.js';

describe('Harvard Citation Detection', () => {
  describe('Single author parenthetical', () => {
    it('should detect (Smith 2020)', () => {
      const text = 'The study found significant results (Smith 2020).';
      const citations = detectHarvardCitations(text);
      expect(citations.length).toBeGreaterThanOrEqual(1);
      const c = citations.find(c => c.citationStyle === 'parenthetical' && c.year === '2020');
      expect(c).toBeDefined();
      expect(c!.authors[0].raw).toBe('Smith');
      expect(c!.type).toBe('single');
    });

    it('should detect (Smith 2020a) with year suffix', () => {
      const text = 'The results (Smith 2020a) were confirmed.';
      const citations = detectHarvardCitations(text);
      const c = citations.find(c => c.year === '2020');
      expect(c).toBeDefined();
      expect(c!.yearSuffix).toBe('a');
    });

    it('should detect (Smith n.d.) for no date', () => {
      const text = 'According to (Smith n.d.), the results hold.';
      const citations = detectHarvardCitations(text);
      const c = citations.find(c => c.year === 'n.d.');
      expect(c).toBeDefined();
    });
  });

  describe('Two author parenthetical', () => {
    it('should detect (Smith & Jones 2020)', () => {
      const text = 'The study (Smith & Jones 2020) showed results.';
      const citations = detectHarvardCitations(text);
      const c = citations.find(c => c.type === 'two_authors');
      expect(c).toBeDefined();
      expect(c!.authors.length).toBe(2);
      expect(c!.authors[0].raw).toBe('Smith');
      expect(c!.authors[1].raw).toBe('Jones');
      expect(c!.year).toBe('2020');
    });
  });

  describe('Et al. parenthetical', () => {
    it('should detect (Smith et al. 2020)', () => {
      const text = 'Multiple studies (Smith et al. 2020) confirmed the effect.';
      const citations = detectHarvardCitations(text);
      const c = citations.find(c => c.type === 'et_al');
      expect(c).toBeDefined();
      expect(c!.authors[0].raw).toBe('Smith');
      expect(c!.authors[1].isEtAl).toBe(true);
      expect(c!.year).toBe('2020');
    });
  });

  describe('Page number citations', () => {
    it('should detect (Smith 2020, p. 15)', () => {
      const text = 'The quote (Smith 2020, p. 15) was insightful.';
      const citations = detectHarvardCitations(text);
      const c = citations.find(c => c.pageNumbers !== undefined);
      expect(c).toBeDefined();
      expect(c!.year).toBe('2020');
      expect(c!.pageNumbers).toContain('p.');
    });

    it('should detect (Smith 2020, pp. 15-20)', () => {
      const text = 'The section (Smith 2020, pp. 15-20) discussed this.';
      const citations = detectHarvardCitations(text);
      const c = citations.find(c => c.pageNumbers !== undefined);
      expect(c).toBeDefined();
      expect(c!.pageNumbers).toContain('pp.');
    });
  });

  describe('Multiple citations (semicolon-separated)', () => {
    it('should detect (Smith 2020; Jones 2019)', () => {
      const text = 'Several studies (Smith 2020; Jones 2019) showed this effect.';
      const citations = detectHarvardCitations(text);
      // Should find at least 2 citations (from the semicolon parsing)
      const smith = citations.find(c => c.year === '2020');
      const jones = citations.find(c => c.year === '2019');
      expect(smith).toBeDefined();
      expect(jones).toBeDefined();
    });
  });

  describe('Narrative citations', () => {
    it('should detect Smith (2020) narrative', () => {
      const text = 'Smith (2020) demonstrated the effect.';
      const citations = detectHarvardCitations(text);
      const c = citations.find(c => c.citationStyle === 'narrative');
      expect(c).toBeDefined();
      expect(c!.authors[0].raw).toBe('Smith');
      expect(c!.year).toBe('2020');
    });

    it('should detect Smith and Jones (2020) two-author narrative', () => {
      const text = 'Smith and Jones (2020) confirmed the results.';
      const citations = detectHarvardCitations(text);
      const c = citations.find(c => c.type === 'two_authors' && c.citationStyle === 'narrative');
      expect(c).toBeDefined();
      expect(c!.authors.length).toBe(2);
    });

    it('should detect Smith et al. (2020) narrative', () => {
      const text = 'Smith et al. (2020) conducted the meta-analysis.';
      const citations = detectHarvardCitations(text);
      const c = citations.find(c => c.type === 'et_al' && c.citationStyle === 'narrative');
      expect(c).toBeDefined();
    });

    it('should not detect common words as narrative citations', () => {
      const text = 'The results (2020) were unexpected. Table (2019) shows data.';
      const citations = detectHarvardCitations(text);
      // "The" and "Table" are common words and should be filtered out
      const theMatch = citations.find(c => c.authors[0]?.raw.toLowerCase() === 'the');
      const tableMatch = citations.find(c => c.authors[0]?.raw.toLowerCase() === 'table');
      expect(theMatch).toBeUndefined();
      expect(tableMatch).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    it('should return empty for text with no citations', () => {
      const text = 'This is a document with no citations.';
      const citations = detectHarvardCitations(text);
      expect(citations.length).toBe(0);
    });

    it('should handle names with accents', () => {
      const text = 'The study (Müller 2020) showed results.';
      const citations = detectHarvardCitations(text);
      const c = citations.find(c => c.year === '2020');
      expect(c).toBeDefined();
      expect(c!.authors[0].raw).toBe('Müller');
    });

    it('should handle hyphenated names', () => {
      const text = 'According to (Garcia-Lopez 2020), the method works.';
      const citations = detectHarvardCitations(text);
      const c = citations.find(c => c.year === '2020');
      expect(c).toBeDefined();
      expect(c!.authors[0].raw).toBe('Garcia-Lopez');
    });

    it('should sort citations by position', () => {
      const text = 'First (Smith 2020). Second (Jones 2019). Third (Brown 2021).';
      const citations = detectHarvardCitations(text);
      for (let i = 1; i < citations.length; i++) {
        expect(citations[i].position.start).toBeGreaterThan(citations[i - 1].position.start);
      }
    });
  });
});
