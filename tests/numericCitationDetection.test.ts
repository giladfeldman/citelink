/**
 * Numeric Citation Detection Tests
 * Tests bracket [N] and superscript citation patterns
 */

import { describe, it, expect } from '@jest/globals';
import {
  detectNumericCitations,
  expandNumericRange,
} from '../src/numericCitationDetector.js';

describe('expandNumericRange', () => {
  it('should expand a single number', () => {
    expect(expandNumericRange('1')).toEqual([1]);
  });

  it('should expand a comma-separated list', () => {
    expect(expandNumericRange('1,2,3')).toEqual([1, 2, 3]);
  });

  it('should expand a range', () => {
    expect(expandNumericRange('1-3')).toEqual([1, 2, 3]);
  });

  it('should expand a range with en-dash', () => {
    expect(expandNumericRange('1\u20133')).toEqual([1, 2, 3]);
  });

  it('should expand mixed ranges and single numbers', () => {
    expect(expandNumericRange('1,3-5,7')).toEqual([1, 3, 4, 5, 7]);
  });

  it('should handle spaces around commas', () => {
    expect(expandNumericRange('1, 3, 5')).toEqual([1, 3, 5]);
  });

  it('should handle spaces around dashes', () => {
    expect(expandNumericRange('1 - 3')).toEqual([1, 2, 3]);
  });

  it('should cap range expansion at 100 elements', () => {
    const result = expandNumericRange('1-200');
    expect(result.length).toBe(100);
  });
});

describe('detectNumericCitations', () => {
  describe('Bracket patterns', () => {
    it('should detect single bracket citation [1]', () => {
      const text = 'The study found significant results [1].';
      const citations = detectNumericCitations(text);
      expect(citations.length).toBe(1);
      expect(citations[0].raw).toBe('[1]');
      expect((citations[0] as any).citationNumbers).toEqual([1]);
      expect(citations[0].type).toBe('numeric');
    });

    it('should detect multiple separate citations', () => {
      const text = 'First result [1]. Second result [2]. Third result [3].';
      const citations = detectNumericCitations(text);
      expect(citations.length).toBe(3);
    });

    it('should detect comma-separated citation [1,2,3]', () => {
      const text = 'Multiple studies [1,2,3] confirmed this.';
      const citations = detectNumericCitations(text);
      expect(citations.length).toBe(1);
      expect((citations[0] as any).citationNumbers).toEqual([1, 2, 3]);
    });

    it('should detect range citation [1-3]', () => {
      const text = 'A range of studies [1-3] demonstrated the effect.';
      const citations = detectNumericCitations(text);
      expect(citations.length).toBe(1);
      expect((citations[0] as any).citationNumbers).toEqual([1, 2, 3]);
    });

    it('should detect mixed range and list [1,3-5,7]', () => {
      const text = 'Various evidence [1,3-5,7] supports this.';
      const citations = detectNumericCitations(text);
      expect(citations.length).toBe(1);
      expect((citations[0] as any).citationNumbers).toEqual([1, 3, 4, 5, 7]);
    });

    it('should set citationStyle to parenthetical for bracket citations', () => {
      const text = 'The study [1] showed results.';
      const citations = detectNumericCitations(text);
      expect(citations[0].citationStyle).toBe('parenthetical');
    });
  });

  describe('False positive exclusions', () => {
    it('should exclude Table references', () => {
      const text = 'As shown in Table [1], the results are clear.';
      const citations = detectNumericCitations(text);
      expect(citations.length).toBe(0);
    });

    it('should exclude Figure references', () => {
      const text = 'See Figure [2] for the diagram.';
      const citations = detectNumericCitations(text);
      expect(citations.length).toBe(0);
    });

    it('should exclude Equation references', () => {
      const text = 'Using Equation [3], we derive the formula.';
      const citations = detectNumericCitations(text);
      expect(citations.length).toBe(0);
    });

    it('should exclude Section references', () => {
      const text = 'As described in Section [4], the method is novel.';
      const citations = detectNumericCitations(text);
      expect(citations.length).toBe(0);
    });

    it('should exclude Step references', () => {
      const text = 'Follow Step [1] to begin.';
      const citations = detectNumericCitations(text);
      expect(citations.length).toBe(0);
    });

    it('should exclude Appendix references', () => {
      const text = 'Detailed in Appendix [1] of the paper.';
      const citations = detectNumericCitations(text);
      expect(citations.length).toBe(0);
    });

    it('should keep legitimate citations alongside excluded patterns', () => {
      const text = 'Table [1] shows data. The study [2] confirmed results [3].';
      const citations = detectNumericCitations(text);
      expect(citations.length).toBe(2);
      expect((citations[0] as any).citationNumbers).toEqual([2]);
      expect((citations[1] as any).citationNumbers).toEqual([3]);
    });
  });

  describe('Reference section exclusion', () => {
    it('should skip citations within the reference section', () => {
      const text = 'The study [1] confirmed results.\nReferences\n[1] Smith JA. Title.';
      const refStart = text.indexOf('References');
      const citations = detectNumericCitations(text, refStart);
      expect(citations.length).toBe(1);
      expect(citations[0].raw).toBe('[1]');
    });
  });

  describe('Narrative numeric citations', () => {
    it('should detect "Smith [1]" narrative pattern', () => {
      const text = 'Smith [1] demonstrated the effect, confirmed by Jones [2].';
      const citations = detectNumericCitations(text);
      // Bracket citations are detected first; narrative overlaps are deduplicated
      // At minimum, the two bracket citations [1] and [2] are detected
      expect(citations.length).toBeGreaterThanOrEqual(1);
      expect(citations.some(c => (c as any).citationNumbers?.includes(1))).toBe(true);
      expect(citations.some(c => (c as any).citationNumbers?.includes(2))).toBe(true);
    });

    it('should detect "Smith et al. [1,2]" narrative pattern', () => {
      const text = 'Smith et al. [1,2] demonstrated the combined effect.';
      const citations = detectNumericCitations(text);
      expect(citations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Superscript citations', () => {
    it('should detect single superscript digit', () => {
      const text = 'The study found significant results\u00B9.';
      const citations = detectNumericCitations(text);
      expect(citations.length).toBe(1);
      expect((citations[0] as any).citationNumbers).toEqual([1]);
    });

    it('should detect multiple superscript digits', () => {
      const text = 'Results were confirmed\u00B2\u00B3.';
      const citations = detectNumericCitations(text);
      expect(citations.length).toBeGreaterThanOrEqual(1);
    });

    it('should not detect superscript after whitespace', () => {
      const text = 'Some text  \u00B9 more text.';
      const citations = detectNumericCitations(text);
      // Superscript must follow a word character or period
      expect(citations.length).toBe(0);
    });

    it('should detect superscript after a period', () => {
      const text = 'End of sentence.\u00B9 Next sentence.';
      const citations = detectNumericCitations(text);
      expect(citations.length).toBe(1);
    });
  });

  describe('Position sorting', () => {
    it('should return citations sorted by position', () => {
      const text = 'First [3]. Second [1]. Third [2].';
      const citations = detectNumericCitations(text);
      for (let i = 1; i < citations.length; i++) {
        expect(citations[i].position.start).toBeGreaterThan(citations[i - 1].position.start);
      }
    });
  });

  describe('Context extraction', () => {
    it('should include surrounding context', () => {
      const text = 'The important finding [1] was remarkable in its scope.';
      const citations = detectNumericCitations(text);
      expect(citations[0].context).toContain('finding');
      expect(citations[0].context).toContain('remarkable');
    });
  });
});
