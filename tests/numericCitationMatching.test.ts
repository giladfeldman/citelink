/**
 * Numeric Citation Matching Tests
 * Tests position-based matching for Vancouver/IEEE/Nature/AMA styles
 */

import { describe, it, expect } from '@jest/globals';
import {
  matchCitationsToReferences,
  MatchResult,
} from '../src/citationMatcher.js';
import { DetectedCitation, ParsedCitationAuthor } from '../src/citationDetector.js';
import { ParsedReference } from '../src/referenceParser.js';

// Helper to create a numeric citation
function createNumericCitation(numbers: number[], raw?: string): DetectedCitation {
  return {
    raw: raw || `[${numbers.join(',')}]`,
    normalized: `[${numbers.join(',')}]`,
    type: 'numeric' as any,
    citationStyle: 'parenthetical',
    authors: [] as ParsedCitationAuthor[],
    year: '',
    citationNumbers: numbers,
    position: { start: 0, end: 5 },
    context: '',
  } as any;
}

// Helper to create a reference with list number
function createTestReference(overrides: Partial<ParsedReference>): ParsedReference {
  return {
    raw: '',
    authors: [],
    authorCount: 0,
    firstAuthorLastName: '',
    firstAuthorLastNameNormalized: '',
    allAuthorLastNames: [],
    allAuthorLastNamesNormalized: [],
    year: '',
    title: '',
    isGroupAuthor: false,
    type: 'journal',
    ...overrides,
  };
}

describe('Numeric Citation Matching', () => {
  describe('Position-based matching', () => {
    it('should match [1] to the first reference', () => {
      const citations = [createNumericCitation([1])];
      const references = [
        createTestReference({ raw: 'Smith JA. Title. J Test. 2020;45(2):123.', year: '2020', listNumber: 1 }),
        createTestReference({ raw: 'Jones BC. Title. J Sci. 2019;30(1):10.', year: '2019', listNumber: 2 }),
      ];

      const results = matchCitationsToReferences(citations, references, 'vancouver');
      expect(results.length).toBe(1);
      expect(results[0].status).toBe('matched');
      expect(results[0].confidence).toBe(1.0);
      expect(results[0].reference?.year).toBe('2020');
    });

    it('should match [2] to the second reference', () => {
      const citations = [createNumericCitation([2])];
      const references = [
        createTestReference({ raw: 'Smith JA. Title.', year: '2020', listNumber: 1 }),
        createTestReference({ raw: 'Jones BC. Title.', year: '2019', listNumber: 2 }),
      ];

      const results = matchCitationsToReferences(citations, references, 'vancouver');
      expect(results.length).toBe(1);
      expect(results[0].status).toBe('matched');
      expect(results[0].reference?.year).toBe('2019');
    });

    it('should return no_match for citation number beyond reference count', () => {
      const citations = [createNumericCitation([10])];
      const references = [
        createTestReference({ raw: 'Smith JA. Title.', year: '2020', listNumber: 1 }),
        createTestReference({ raw: 'Jones BC. Title.', year: '2019', listNumber: 2 }),
      ];

      const results = matchCitationsToReferences(citations, references, 'vancouver');
      expect(results.length).toBe(1);
      expect(results[0].status).toBe('no_match');
      expect(results[0].reference).toBeNull();
    });

    it('should match multiple numbers in [1,3] to separate results', () => {
      const citations = [createNumericCitation([1, 3])];
      const references = [
        createTestReference({ raw: 'Ref 1.', year: '2020', listNumber: 1 }),
        createTestReference({ raw: 'Ref 2.', year: '2019', listNumber: 2 }),
        createTestReference({ raw: 'Ref 3.', year: '2021', listNumber: 3 }),
      ];

      const results = matchCitationsToReferences(citations, references, 'vancouver');
      expect(results.length).toBe(2);
      expect(results[0].status).toBe('matched');
      expect(results[1].status).toBe('matched');
      expect(results[0].reference?.year).toBe('2020');
      expect(results[1].reference?.year).toBe('2021');
    });
  });

  describe('Index-based fallback (no listNumber)', () => {
    it('should use index+1 when references lack listNumber', () => {
      const citations = [createNumericCitation([2])];
      const references = [
        createTestReference({ raw: 'Ref A.', year: '2020' }),
        createTestReference({ raw: 'Ref B.', year: '2019' }),
        createTestReference({ raw: 'Ref C.', year: '2021' }),
      ];

      const results = matchCitationsToReferences(citations, references, 'vancouver');
      expect(results.length).toBe(1);
      expect(results[0].status).toBe('matched');
      expect(results[0].reference?.year).toBe('2019');
    });
  });

  describe('Multiple citations', () => {
    it('should match all citations in a batch', () => {
      const citations = [
        createNumericCitation([1]),
        createNumericCitation([2]),
        createNumericCitation([3]),
      ];
      const references = [
        createTestReference({ raw: 'Ref 1.', year: '2020', listNumber: 1 }),
        createTestReference({ raw: 'Ref 2.', year: '2019', listNumber: 2 }),
        createTestReference({ raw: 'Ref 3.', year: '2021', listNumber: 3 }),
      ];

      const results = matchCitationsToReferences(citations, references, 'vancouver');
      expect(results.length).toBe(3);
      expect(results.every(r => r.status === 'matched')).toBe(true);
    });

    it('should handle mixed match/no_match', () => {
      const citations = [
        createNumericCitation([1]),
        createNumericCitation([5]),
      ];
      const references = [
        createTestReference({ raw: 'Ref 1.', year: '2020', listNumber: 1 }),
        createTestReference({ raw: 'Ref 2.', year: '2019', listNumber: 2 }),
      ];

      const results = matchCitationsToReferences(citations, references, 'vancouver');
      const matched = results.filter(r => r.status === 'matched');
      const noMatch = results.filter(r => r.status === 'no_match');
      expect(matched.length).toBe(1);
      expect(noMatch.length).toBe(1);
    });
  });

  describe('Empty inputs', () => {
    it('should return no_match for all citations when no references', () => {
      const citations = [createNumericCitation([1])];
      const results = matchCitationsToReferences(citations, [], 'vancouver');
      expect(results.length).toBe(1);
      expect(results[0].status).toBe('no_match');
    });

    it('should return empty results for empty citations', () => {
      const references = [
        createTestReference({ raw: 'Ref 1.', year: '2020', listNumber: 1 }),
      ];
      const results = matchCitationsToReferences([], references, 'vancouver');
      expect(results.length).toBe(0);
    });
  });

  describe('Numeric style dispatch', () => {
    it('should use numeric matching for vancouver style', () => {
      const citations = [createNumericCitation([1])];
      const references = [
        createTestReference({ raw: 'Ref 1.', year: '2020', listNumber: 1 }),
      ];
      const results = matchCitationsToReferences(citations, references, 'vancouver');
      expect(results[0].matchMethod).toBe('numeric_position');
    });

    it('should use numeric matching for ieee style', () => {
      const citations = [createNumericCitation([1])];
      const references = [
        createTestReference({ raw: 'Ref 1.', year: '2020', listNumber: 1 }),
      ];
      const results = matchCitationsToReferences(citations, references, 'ieee');
      expect(results[0].matchMethod).toBe('numeric_position');
    });

    it('should use numeric matching for nature style', () => {
      const citations = [createNumericCitation([1])];
      const references = [
        createTestReference({ raw: 'Ref 1.', year: '2020', listNumber: 1 }),
      ];
      const results = matchCitationsToReferences(citations, references, 'nature');
      expect(results[0].matchMethod).toBe('numeric_position');
    });

    it('should use numeric matching for ama style', () => {
      const citations = [createNumericCitation([1])];
      const references = [
        createTestReference({ raw: 'Ref 1.', year: '2020', listNumber: 1 }),
      ];
      const results = matchCitationsToReferences(citations, references, 'ama');
      expect(results[0].matchMethod).toBe('numeric_position');
    });
  });
});
