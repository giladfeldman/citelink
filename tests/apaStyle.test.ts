/**
 * APA 7 Style Validation Tests
 */

import { describe, it, expect } from '@jest/globals';
import {
  validateCitationFormat,
  validateReferenceAuthors,
  validateReferenceYear,
  validateTitleCapitalization,
  validateDOIFormat,
  validateURLFormat,
  validatePageFormat,
  getSeverityCounts,
  groupViolationsByType,
} from '../src/styleValidation/apaStyleValidator.js';
import { CitationInput as Citation, ReferenceInput as Reference } from '../src/styleValidation/inputTypes.js';

describe('APA 7 Style Validator', () => {
  describe('Citation Format Validation', () => {
    it('should detect missing comma in citation', () => {
      const citation: Partial<Citation> = {
        id: 'cite-1',
        citation_text: '(Smith 2020) showed that...',
      };

      const violations = validateCitationFormat(citation as Citation);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].code).toBe('CITATION_MISSING_COMMA');
    });

    it('should accept properly formatted citations', () => {
      const citation: Partial<Citation> = {
        id: 'cite-1',
        citation_text: '(Smith, 2020) showed that...',
      };

      const violations = validateCitationFormat(citation as Citation);
      expect(violations.length).toBe(0);
    });

    it('should detect missing et al. period', () => {
      const citation: Partial<Citation> = {
        id: 'cite-1',
        citation_text: '(et al, 2020) showed...',
      };

      const violations = validateCitationFormat(citation as Citation);
      const hasMissingPeriod = violations.some(v => v.code === 'CITATION_MISSING_PERIOD');
      expect(hasMissingPeriod).toBe(true);
    });

    it('should suggest et al. for multiple authors', () => {
      const citation: Partial<Citation> = {
        id: 'cite-1',
        citation_text: '(Smith, Johnson & Williams, 2020)',
      };

      const violations = validateCitationFormat(citation as Citation);
      const hasEtAlSuggestion = violations.some(v => v.code === 'CITATION_SHOULD_USE_ET_AL');
      expect(hasEtAlSuggestion).toBe(true);
    });
  });

  describe('Reference Author Validation', () => {
    it('should detect full first names in references', () => {
      const reference: Partial<Reference> = {
        id: 'ref-1',
        raw_text: 'Smith, John., & Johnson, Jane. (2020)...',
      };

      const violations = validateReferenceAuthors(reference as Reference);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].code).toBe('AUTHOR_FULL_FIRST_NAME');
    });

    it('should accept properly abbreviated authors', () => {
      const reference: Partial<Reference> = {
        id: 'ref-1',
        raw_text: 'Smith, J., & Johnson, J. (2020)...',
      };

      const violations = validateReferenceAuthors(reference as Reference);
      expect(violations.length).toBe(0);
    });
  });

  describe('Reference Year Validation', () => {
    it('should detect missing year parentheses', () => {
      const reference: Partial<Reference> = {
        id: 'ref-1',
        raw_text: 'Smith, J. 2020. Title of article...',
      };

      const violations = validateReferenceYear(reference as Reference);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].code).toBe('MISSING_YEAR_PARENS');
    });

    it('should detect missing period after year', () => {
      const reference: Partial<Reference> = {
        id: 'ref-1',
        raw_text: 'Smith, J. (2020) Title of article',
      };

      const violations = validateReferenceYear(reference as Reference);
      const hasMissingPeriod = violations.some(v => v.code === 'YEAR_MISSING_PERIOD');
      expect(hasMissingPeriod).toBe(true);
    });

    it('should accept properly formatted year', () => {
      const reference: Partial<Reference> = {
        id: 'ref-1',
        raw_text: 'Smith, J. (2020). Title of article...',
      };

      const violations = validateReferenceYear(reference as Reference);
      expect(violations.length).toBe(0);
    });
  });

  describe('Title Capitalization Validation', () => {
    it('should detect excessive capitalization in titles', () => {
      const violations = validateTitleCapitalization('The Effects Of Climate Change On Global Warming');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].code).toBe('TITLE_CAPITALIZATION');
    });

    it('should accept proper sentence case titles', () => {
      const violations = validateTitleCapitalization('The effects of climate change on global warming');
      expect(violations.length).toBe(0);
    });

    it('should allow proper nouns in titles', () => {
      const violations = validateTitleCapitalization('Climate change in Canada and the United States');
      // Should not have violations or only info level
      const hasErrors = violations.some(v => v.severity === 'error');
      expect(hasErrors).toBe(false);
    });

    it('should handle empty titles', () => {
      const violations = validateTitleCapitalization('');
      expect(violations.length).toBe(0);
    });
  });

  describe('DOI Format Validation', () => {
    it('should detect invalid DOI prefixes', () => {
      const violations = validateDOIFormat('10.1126/science.aac4716');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].code).toBe('DOI_INVALID_PREFIX');
    });

    it('should accept proper DOI format', () => {
      const violations = validateDOIFormat('https://doi.org/10.1126/science.aac4716');
      expect(violations.length).toBe(0);
    });

    it('should detect insecure HTTP DOI', () => {
      const violations = validateDOIFormat('http://doi.org/10.1126/science.aac4716');
      expect(violations.length).toBeGreaterThan(0);
      const hasInsecure = violations.some(v => v.code === 'DOI_INSECURE');
      expect(hasInsecure).toBe(true);
    });

    it('should handle null/undefined DOI', () => {
      expect(validateDOIFormat(null)).toEqual([]);
      expect(validateDOIFormat(undefined)).toEqual([]);
    });
  });

  describe('URL Format Validation', () => {
    it('should detect missing protocol in URL', () => {
      const violations = validateURLFormat('www.example.com');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].code).toBe('URL_MISSING_PROTOCOL');
    });

    it('should accept proper HTTPS URL', () => {
      const violations = validateURLFormat('https://www.example.com');
      expect(violations.length).toBe(0);
    });

    it('should detect insecure HTTP URL', () => {
      const violations = validateURLFormat('http://www.example.com');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].code).toBe('URL_INSECURE');
    });

    it('should detect trailing punctuation', () => {
      const violations = validateURLFormat('https://www.example.com,');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].code).toBe('URL_TRAILING_PUNCTUATION');
    });
  });

  describe('Page Format Validation', () => {
    it('should detect improper page format', () => {
      const reference: Partial<Reference> = {
        id: 'ref-1',
        raw_text: 'Smith, J. (2020). Title. Journal, 10(2), pages 123-145.',
      };

      const violations = validatePageFormat(reference as Reference);
      const hasPageFormat = violations.some(v => v.code === 'PAGE_FORMAT');
      expect(hasPageFormat).toBe(true);
    });

    it('should detect em dash instead of hyphen in pages', () => {
      const reference: Partial<Reference> = {
        id: 'ref-1',
        raw_text: 'Smith, J. (2020). Title. Journal, 10(2), 123–145.',
      };

      const violations = validatePageFormat(reference as Reference);
      const hasDashIssue = violations.some(v => v.code === 'PAGE_DASH');
      expect(hasDashIssue).toBe(true);
    });
  });

  describe('Severity Counting', () => {
    it('should count violations by severity', () => {
      const violations = [
        { severity: 'error' as const, code: 'E1', type: 'reference' as const, description: '', location: '' },
        { severity: 'error' as const, code: 'E2', type: 'reference' as const, description: '', location: '' },
        { severity: 'warning' as const, code: 'W1', type: 'reference' as const, description: '', location: '' },
        { severity: 'info' as const, code: 'I1', type: 'reference' as const, description: '', location: '' },
      ];

      const counts = getSeverityCounts(violations);
      expect(counts.errors).toBe(2);
      expect(counts.warnings).toBe(1);
      expect(counts.info).toBe(1);
    });
  });

  describe('Violation Grouping', () => {
    it('should group violations by type', () => {
      const violations = [
        { type: 'citation' as const, severity: 'error' as const, code: 'C1', description: '', location: '' },
        { type: 'reference' as const, severity: 'error' as const, code: 'R1', description: '', location: '' },
        { type: 'citation' as const, severity: 'warning' as const, code: 'C2', description: '', location: '' },
      ];

      const grouped = groupViolationsByType(violations);
      expect(grouped.citation).toHaveLength(2);
      expect(grouped.reference).toHaveLength(1);
    });

    it('should handle empty violations', () => {
      const grouped = groupViolationsByType([]);
      expect(Object.keys(grouped)).toHaveLength(0);
    });
  });
});
