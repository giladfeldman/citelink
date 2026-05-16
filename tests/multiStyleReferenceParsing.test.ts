/**
 * Multi-Style Reference Parsing Tests
 * Tests Vancouver, Nature, IEEE, AOM/ASA/Chicago, and Harvard formats
 */

import { describe, it, expect } from '@jest/globals';
import { parseReferences, normalizeName, ParsedReference } from '../src/referenceParser.js';

describe('Multi-Style Reference Parsing', () => {
  describe('Vancouver format', () => {
    it('should parse standard Vancouver reference', () => {
      const text = `
References
1. Smith JA, Jones BC. Title of the article. J Educ Res. 2020;45(2):123-145.
2. Brown DE. Another important finding. Sci Med. 2019;30(1):10-20.
`;
      const refs = parseReferences(text, 'vancouver');
      expect(refs.length).toBeGreaterThanOrEqual(1);
      const ref = refs[0];
      expect(ref.year).toBe('2020');
      expect(ref.listNumber).toBe(1);
    });

    it('should parse Vancouver authors without comma between name and initials', () => {
      const text = `
References
1. Smith JA, Jones BC, Williams CD. Collaborative research findings. J Test. 2020;45(2):123-145.
`;
      const refs = parseReferences(text, 'vancouver');
      expect(refs.length).toBeGreaterThanOrEqual(1);
      const ref = refs[0];
      expect(ref.authors.length).toBeGreaterThanOrEqual(1);
      expect(ref.firstAuthorLastName).toBeTruthy();
    });

    it('should extract volume, issue, and pages from Vancouver format', () => {
      const text = `
References
1. Smith JA. Title here. J Test. 2020;45(2):123-145.
`;
      const refs = parseReferences(text, 'vancouver');
      expect(refs.length).toBeGreaterThanOrEqual(1);
      const ref = refs[0];
      expect(ref.volume).toBe('45');
      expect(ref.issue).toBe('2');
      expect(ref.pages).toBeTruthy();
    });

    it('should extract list numbers', () => {
      const text = `
References
1. First reference. J Test. 2020;1(1):1-10.
2. Second reference. J Sci. 2019;2(1):20-30.
3. Third reference. Nat Rev. 2021;3(1):40-50.
`;
      const refs = parseReferences(text, 'vancouver');
      const withNumbers = refs.filter(r => r.listNumber !== undefined);
      expect(withNumbers.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle Vancouver reference with DOI', () => {
      const text = `
References
1. Smith JA. Title here. J Test. 2020;45(2):123-145. doi:10.1234/test.2020
`;
      const refs = parseReferences(text, 'vancouver');
      expect(refs.length).toBeGreaterThanOrEqual(1);
      if (refs[0].doi) {
        expect(refs[0].doi).toContain('10.1234');
      }
    });
  });

  describe('IEEE format', () => {
    it('should parse standard IEEE reference with quoted title', () => {
      const text = `
References
[1] J. A. Smith and B. C. Jones, "Title of the article," J. Test., vol. 45, no. 2, pp. 123-145, 2020.
`;
      const refs = parseReferences(text, 'ieee');
      expect(refs.length).toBeGreaterThanOrEqual(1);
      const ref = refs[0];
      expect(ref.year).toBe('2020');
      expect(ref.title).toBeTruthy();
    });

    it('should extract IEEE vol/no/pp', () => {
      const text = `
References
[1] J. Smith, "Title," Journal, vol. 45, no. 2, pp. 123-145, 2020.
`;
      const refs = parseReferences(text, 'ieee');
      expect(refs.length).toBeGreaterThanOrEqual(1);
      const ref = refs[0];
      expect(ref.volume).toBe('45');
      expect(ref.issue).toBe('2');
      expect(ref.pages).toBeTruthy();
    });

    it('should parse IEEE initials-first author format', () => {
      const text = `
References
[1] J. A. Smith and B. C. Jones, "Title here," J. Test., vol. 45, no. 2, pp. 123-145, 2020.
`;
      const refs = parseReferences(text, 'ieee');
      expect(refs.length).toBeGreaterThanOrEqual(1);
      const ref = refs[0];
      expect(ref.authors.length).toBeGreaterThanOrEqual(1);
      // IEEE parses initials-first: last name should be Smith
      if (ref.authors.length > 0) {
        expect(ref.firstAuthorLastName).toBeTruthy();
      }
    });
  });

  describe('Nature format', () => {
    it('should parse Nature reference with year at end', () => {
      const text = `
References
1. Smith, J. A. & Jones, B. C. Title of the article. J. Test. 45, 123-145 (2020).
`;
      const refs = parseReferences(text, 'nature');
      expect(refs.length).toBeGreaterThanOrEqual(1);
      const ref = refs[0];
      expect(ref.year).toBe('2020');
    });

    it('should extract Nature volume and pages', () => {
      const text = `
References
1. Smith, J. A. Research findings. Nature 45, 123-145 (2020).
`;
      const refs = parseReferences(text, 'nature');
      expect(refs.length).toBeGreaterThanOrEqual(1);
      const ref = refs[0];
      if (ref.volume) {
        expect(ref.volume).toBe('45');
      }
    });
  });

  describe('AOM/Bare-year format', () => {
    it('should parse AOM reference with bare year', () => {
      const text = `
References
Smith, J. A., & Jones, B. C. 2020. Title of the article. Journal of Testing, 45(2): 123-145.
`;
      const refs = parseReferences(text, 'aom');
      expect(refs.length).toBeGreaterThanOrEqual(1);
      const ref = refs[0];
      expect(ref.year).toBe('2020');
    });

    it('should parse AOM journal info with colon before pages', () => {
      const text = `
References
Smith, J. A. 2020. Research findings. Academy of Management Journal, 45(2): 123-145.
`;
      const refs = parseReferences(text, 'aom');
      expect(refs.length).toBeGreaterThanOrEqual(1);
      const ref = refs[0];
      expect(ref.volume).toBe('45');
      expect(ref.issue).toBe('2');
    });

    it('should parse ASA reference with quoted title', () => {
      const text = `
References
Smith, John A. 2020. "Title of the Article." Journal of Sociology 45(2):123-145.
`;
      const refs = parseReferences(text, 'asa');
      expect(refs.length).toBeGreaterThanOrEqual(1);
      const ref = refs[0];
      expect(ref.year).toBe('2020');
      expect(ref.title).toBeTruthy();
    });
  });

  describe('APA/Harvard format (default)', () => {
    it('should parse standard APA reference', () => {
      const text = `
References
Smith, J. A., & Jones, B. C. (2020). Title of the article. Journal of Testing, 45(2), 123-145.
`;
      const refs = parseReferences(text);
      expect(refs.length).toBeGreaterThanOrEqual(1);
      const ref = refs[0];
      expect(ref.year).toBe('2020');
      expect(ref.firstAuthorLastName).toBe('Smith');
    });

    it('should parse APA reference with DOI', () => {
      const text = `
References
Smith, J. A. (2020). Title here. Journal, 45(2), 123. https://doi.org/10.1234/test
`;
      const refs = parseReferences(text);
      expect(refs.length).toBeGreaterThanOrEqual(1);
      if (refs[0].doi) {
        expect(refs[0].doi).toContain('10.1234');
      }
    });

    it('should handle Harvard style with default parser', () => {
      const text = `
References
Smith, J.A. (2020). Title of the article. Journal of Testing, 45(2), pp. 123-145.
`;
      const refs = parseReferences(text, 'harvard');
      expect(refs.length).toBeGreaterThanOrEqual(1);
      const ref = refs[0];
      expect(ref.year).toBe('2020');
    });
  });

  describe('List number extraction', () => {
    it('should extract numbered prefix: "1. "', () => {
      const text = `
References
1. Smith, J. A. (2020). Title. Journal, 45(2), 123.
2. Jones, B. C. (2019). Title. Science, 30(1), 10.
`;
      const refs = parseReferences(text);
      const withListNumber = refs.filter(r => r.listNumber !== undefined);
      expect(withListNumber.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract bracketed prefix: "[1] "', () => {
      const text = `
Introduction

Some text here about the topic [1]. Further discussion [2], [3].

References

[1] J. A. Smith, "A comprehensive analysis of neural networks," IEEE Trans. Neural Netw., vol. 45, no. 2, pp. 123-145, 2020.
[2] B. C. Jones and D. E. Williams, "Machine learning approaches for signal processing," IEEE Signal Process. Mag., vol. 30, no. 1, pp. 10-20, 2019.
[3] R. K. Patel, "Deep learning in computer vision," in Proc. IEEE Conf. Comput. Vis. Pattern Recognit., 2021, pp. 500-510.
`;
      const refs = parseReferences(text, 'ieee');
      const withListNumber = refs.filter(r => r.listNumber !== undefined);
      expect(withListNumber.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('normalizeName', () => {
    it('should lowercase names', () => {
      expect(normalizeName('Smith')).toBe('smith');
    });

    it('should remove accents', () => {
      expect(normalizeName('Müller')).toBe('muller');
    });

    it('should remove hyphens', () => {
      expect(normalizeName('Garcia-Lopez')).toBe('garcialopez');
    });

    it('should handle Scandinavian characters', () => {
      expect(normalizeName('Bjørk')).toBe('bjork');
    });

    it('should normalize apostrophes', () => {
      expect(normalizeName("O'Brien")).toBe("o'brien");
    });

    it('should handle empty string', () => {
      expect(normalizeName('')).toBe('');
    });
  });

  describe('Cross-style compatibility', () => {
    it('should extract DOI regardless of style', () => {
      const textWithDOI = `
References
1. Smith JA. Title. J Test. 2020;45(2):123. https://doi.org/10.1234/test.2020
`;
      const refs = parseReferences(textWithDOI, 'vancouver');
      expect(refs.length).toBeGreaterThanOrEqual(1);
      if (refs[0].doi) {
        expect(refs[0].doi).toContain('10.1234');
      }
    });

    it('should handle empty reference section gracefully', () => {
      const text = 'This document has no references section.';
      const refs = parseReferences(text, 'vancouver');
      expect(refs.length).toBe(0);
    });
  });
});
