/**
 * Citation Style Auto-Detection Tests
 */

import { describe, it, expect } from '@jest/globals';
import { detectCitationStyle, StyleDetectionResult } from '../src/citationStyleDetector.js';

describe('Citation Style Detector', () => {
  describe('APA detection (author-year with comma)', () => {
    it('should detect APA style from (Author, Year) citations', () => {
      const text = `
        The study found significant results (Smith, 2020). Further analysis
        confirmed this (Jones, 2019). As noted by (Brown, 2021), the effect
        was robust. Additional evidence (Wilson, 2018) supports this claim.

        References
        Smith, J. A. (2020). Title of the article. Journal of Testing, 45(2), 123-145.
        Jones, B. C. (2019). Another article. Science, 30(1), 10-20.
        Brown, D. E. (2021). A third article. Nature, 12(3), 55-67.
        Wilson, F. G. (2018). Fourth article. Psychology, 8(4), 88-99.
      `;
      const result = detectCitationStyle(text);
      expect(result.style).toBe('apa');
      expect(result.paradigm).toBe('author-year');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect APA with et al. citations', () => {
      const text = `
        Previous work (Smith et al., 2020) demonstrated this effect.
        Others (Jones et al., 2019) confirmed the finding.
        More recent work (Brown et al., 2021) extended it further.
        The meta-analysis (Wilson et al., 2018) was comprehensive.

        References
        Smith, J. A., & Jones, B. C. (2020). Title. Journal, 45(2), 123.
      `;
      const result = detectCitationStyle(text);
      expect(result.style).toBe('apa');
      expect(result.paradigm).toBe('author-year');
    });
  });

  describe('Harvard detection (author-year without comma)', () => {
    it('should detect Harvard style from (Author Year) citations', () => {
      const text = `
        The study found significant results (Smith 2020). Further analysis
        confirmed this (Jones 2019). As noted by (Brown 2021), the effect
        was robust. Additional evidence (Wilson 2018) supports this claim.
        More data (Taylor 2017) and (Clark 2016) support this.

        References
        Smith, J.A. (2020). Title of the article. Journal of Testing, 45(2), pp. 123-145.
        Jones, B.C. (2019). Another article. Science, 30(1), pp. 10-20.
      `;
      const result = detectCitationStyle(text);
      expect(result.style).toBe('harvard');
      expect(result.paradigm).toBe('author-year');
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('Vancouver detection (numeric bracket)', () => {
    it('should detect Vancouver from bracket citations [N]', () => {
      const text = `
        The study found significant results [1]. Further analysis
        confirmed this [2]. Combined evidence [3,4] supports the model.
        A range of studies [5-8] demonstrated the effect. More data [9]
        and [10] were collected.

        References
        1. Smith JA, Jones BC. Title of the article. J Test. 2020;45(2):123-145.
        2. Brown DE. Another article. Sci Med. 2019;30(1):10-20.
        3. Wilson FG. Third article. Nat Rev. 2021;12(3):55-67.
      `;
      const result = detectCitationStyle(text);
      expect(result.style).toBe('vancouver');
      expect(result.paradigm).toBe('numeric');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should not detect numeric with fewer than 3 bracket citations', () => {
      const text = `
        As shown in Table [1] and Figure [2], the method works.
        The analysis (Smith, 2020) confirmed these results.
        Further work (Jones, 2019) extended the findings.
        More evidence (Brown, 2021) supports this.

        References
        Smith, J. A. (2020). Title. Journal, 45(2), 123.
      `;
      const result = detectCitationStyle(text);
      // With only 2 bracket patterns and author-year dominant, should be APA
      expect(result.paradigm).toBe('author-year');
    });

    it('should exclude false positives (Table, Figure prefixes)', () => {
      const text = `
        As shown in Table [1] and Figure [2], the approach works well.
        See Equation [3] for details.
        The study found significant results (Smith, 2020). Further analysis
        confirmed this (Jones, 2019). As noted (Brown, 2021), the effect
        was robust. Additional (Wilson, 2018) evidence agrees.

        References
        Smith, J. A. (2020). Title. Journal, 45(2), 123.
      `;
      const result = detectCitationStyle(text);
      // Table/Figure/Equation brackets should be excluded, leaving APA dominant
      expect(result.paradigm).toBe('author-year');
    });
  });

  describe('IEEE detection', () => {
    it('should detect IEEE from bracket citations with IEEE author format', () => {
      const text = `
        The method was proposed in [1]. Further work [2] extended it.
        Combined approaches [3,4] improved performance. Recent work [5]
        confirmed the results.

        References
        [1] J. A. Smith and B. C. Jones, "Title of the article," J. Test., vol. 45, no. 2, pp. 123-145, 2020.
        [2] D. E. Brown, "Another article," Sci. Med., vol. 30, no. 1, pp. 10-20, 2019.
        [3] F. G. Wilson, "Third article," Nat. Rev., vol. 12, pp. 55-67, 2021.
      `;
      const result = detectCitationStyle(text);
      expect(result.style).toBe('ieee');
      expect(result.paradigm).toBe('numeric');
    });
  });

  describe('Nature detection (superscript)', () => {
    it('should detect Nature from superscript citations', () => {
      const text = `
        The study found significant results¹. Further analysis
        confirmed this². Combined evidence³ supports the model.
        A range of studies⁴ demonstrated the effect.

        References
        1. Smith, J. A. & Jones, B. C. Title of the article. J. Test. 45, 123-145 (2020).
        2. Brown, D. E. Another article. Sci. Med. 30, 10-20 (2019).
        3. Wilson, F. G. Third article. Nat. Rev. 12, 55-67 (2021).
      `;
      const result = detectCitationStyle(text);
      expect(result.paradigm).toBe('numeric');
      // Should detect Nature due to superscript + year at end
      expect(['nature', 'ama']).toContain(result.style);
    });
  });

  describe('AOM detection (bare year)', () => {
    it('should detect AOM from bare year references', () => {
      const text = `
        The study found significant results (Smith, 2020). Further analysis
        confirmed this (Jones, 2019). As noted (Brown, 2021), the effect
        was robust. Evidence (Wilson, 2018) supports this.

        References
        Smith, J. A. 2020. Title of the article. Journal of Testing, 45(2): 123-145.
        Jones, B. C. 2019. Another article. Academy of Management Journal, 30(1): 10-20.
        Brown, D. E. 2021. A third article. Organization Science, 12(3): 55-67.
      `;
      const result = detectCitationStyle(text);
      expect(result.style).toBe('aom');
      expect(result.paradigm).toBe('author-year');
    });
  });

  describe('Edge cases', () => {
    it('should default to APA for empty/minimal text', () => {
      const result = detectCitationStyle('');
      expect(result.style).toBe('apa');
      expect(result.paradigm).toBe('author-year');
    });

    it('should default to APA for text with no citations', () => {
      const text = 'This is a document with no citations or references.';
      const result = detectCitationStyle(text);
      expect(result.style).toBe('apa');
    });

    it('should handle mixed signals with reasonable default', () => {
      const text = `
        Some bracketed [1] and some author-year (Smith, 2020).
        Another bracket [2] and (Jones, 2019).
      `;
      const result = detectCitationStyle(text);
      // With mixed signals and few citations, should pick one paradigm
      expect(['author-year', 'numeric']).toContain(result.paradigm);
    });
  });
});
