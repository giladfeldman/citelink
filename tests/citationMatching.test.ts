/**
 * APA 7 Citation-Reference Matching Tests
 * Comprehensive test suite covering all citation formats and edge cases
 */

import { describe, it, expect } from '@jest/globals';
import { 
  detectCitations, 
  normalizeText,
  CitationType,
  DetectedCitation 
} from '../src/citationDetector.js';
import { 
  parseReferences, 
  normalizeName,
  ParsedReference 
} from '../src/referenceParser.js';
import { 
  matchCitationsToReferences, 
  matchCitationToReferences,
  getMatchStatistics 
} from '../src/citationMatcher.js';

// Helper to create a minimal reference for testing
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
    ...overrides
  };
}

// Helper to create a minimal citation for testing
function createTestCitation(overrides: Partial<DetectedCitation>): DetectedCitation {
  return {
    raw: '',
    normalized: '',
    type: 'single',
    citationStyle: 'parenthetical',
    authors: [],
    year: '',
    position: { start: 0, end: 0 },
    context: '',
    ...overrides
  };
}

describe('Citation Detection', () => {
  describe('Single Author Citations', () => {
    it('should detect basic parenthetical citation: (Smith, 2020)', () => {
      const text = 'This was shown in previous research (Smith, 2020).';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe('single');
      expect(citations[0].citationStyle).toBe('parenthetical');
      expect(citations[0].authors[0].raw).toBe('Smith');
      expect(citations[0].year).toBe('2020');
    });

    it('should detect citation with year suffix: (Smith, 2020a)', () => {
      const text = 'As noted by (Smith, 2020a) and (Smith, 2020b).';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(2);
      expect(citations[0].year).toBe('2020');
      expect(citations[0].yearSuffix).toBe('a');
      expect(citations[1].yearSuffix).toBe('b');
    });

    it('should detect narrative citation: Smith (2020)', () => {
      const text = 'Smith (2020) demonstrated that this effect exists.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe('single');
      expect(citations[0].citationStyle).toBe('narrative');
    });

    it('should detect possessive citation: Smith\'s (2020)', () => {
      const text = 'Smith\'s (2020) study showed significant results.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].citationStyle).toBe('narrative');
    });

    it('should detect citation with page numbers: (Smith, 2020, p. 15)', () => {
      const text = 'This quote (Smith, 2020, p. 15) illustrates the point.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].pageNumbers).toBe('p. 15');
    });

    it('should detect citation with page range: (Smith, 2020, pp. 15-20)', () => {
      const text = 'See the discussion (Smith, 2020, pp. 15-20) for details.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].pageNumbers).toBe('pp. 15-20');
    });

    it('should detect citation with n.d.: (Smith, n.d.)', () => {
      const text = 'According to (Smith, n.d.), this is true.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].year).toBe('n.d.');
    });
  });

  describe('Two Author Citations', () => {
    it('should detect parenthetical with ampersand: (Smith & Jones, 2020)', () => {
      const text = 'This was confirmed (Smith & Jones, 2020).';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe('two_authors');
      expect(citations[0].authors.length).toBe(2);
      expect(citations[0].authors[0].raw).toBe('Smith');
      expect(citations[0].authors[1].raw).toBe('Jones');
    });

    it('should detect narrative with "and": Smith and Jones (2020)', () => {
      const text = 'Smith and Jones (2020) found evidence.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe('two_authors');
      expect(citations[0].citationStyle).toBe('narrative');
    });

    it('should detect possessive two authors: Smith and Jones\'s (2020)', () => {
      const text = 'Smith and Jones\'s (2020) methodology was innovative.';
      const citations = detectCitations(text);
      
      // May detect both as possessive two-author and as individual citations
      // The important thing is that at least one is detected correctly
      expect(citations.length).toBeGreaterThanOrEqual(1);
      const twoAuthorCitation = citations.find(c => c.type === 'two_authors');
      expect(twoAuthorCitation).toBeDefined();
    });
  });

  describe('Et Al. Citations', () => {
    it('should detect parenthetical et al.: (Smith et al., 2020)', () => {
      const text = 'The research (Smith et al., 2020) showed this.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe('et_al');
      expect(citations[0].authors[0].raw).toBe('Smith');
      expect(citations[0].authors[1].isEtAl).toBe(true);
    });

    it('should detect narrative et al.: Smith et al. (2020)', () => {
      const text = 'Smith et al. (2020) demonstrated the effect.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe('et_al');
      expect(citations[0].citationStyle).toBe('narrative');
    });

    it('should handle missing period after "al": (Smith et al, 2020)', () => {
      const text = 'The study (Smith et al, 2020) confirmed this.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe('et_al');
    });

    it('should handle extra period after "et": (Smith et. al., 2020)', () => {
      const text = 'According to (Smith et. al., 2020), the effect is real.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe('et_al');
    });

    it('should detect "and colleagues": Smith and colleagues (2020)', () => {
      const text = 'Smith and colleagues (2020) investigated this.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe('et_al');
    });

    it('should detect possessive et al.: Smith et al.\'s (2020)', () => {
      const text = 'Smith et al.\'s (2020) findings were replicated.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe('et_al');
    });
  });

  describe('Group/Organization Authors', () => {
    it('should detect abbreviation: (WHO, 2020)', () => {
      const text = 'According to (WHO, 2020), the guidelines are clear.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe('group');
      expect(citations[0].authors[0].isOrganization).toBe(true);
      expect(citations[0].authors[0].abbreviation).toBe('WHO');
    });

    it('should detect full name with abbreviation: (World Health Organization [WHO], 2020)', () => {
      const text = 'The (World Health Organization [WHO], 2020) report states...';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe('group_full');
      expect(citations[0].authors[0].abbreviation).toBe('WHO');
    });

    it('should detect full organization name: (American Psychological Association, 2020)', () => {
      const text = 'The (American Psychological Association, 2020) manual specifies...';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe('group_full');
    });
  });

  describe('Secondary Sources', () => {
    it('should detect secondary source: (Freud, 1923, as cited in Smith, 2020)', () => {
      const text = 'The concept (Freud, 1923, as cited in Smith, 2020) was revolutionary.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].type).toBe('secondary');
      expect(citations[0].originalAuthor).toBe('Freud');
      expect(citations[0].originalYear).toBe('1923');
    });
  });

  describe('Multiple Citations', () => {
    it('should detect multiple citations in parentheses: (Smith, 2020; Jones, 2019)', () => {
      const text = 'Multiple studies (Smith, 2020; Jones, 2019) confirm this.';
      const citations = detectCitations(text);
      
      // Should split into individual citations
      expect(citations.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Edge Cases and Error Tolerance', () => {
    it('should handle multiple spaces: (Smith  et  al.,  2020)', () => {
      const text = 'The study (Smith  et  al.,  2020) showed this.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
    });

    it('should handle spaces inside parentheses: ( Smith, 2020 )', () => {
      const text = 'According to ( Smith, 2020 ), this is true.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
    });

    it('should handle accented names: (García, 2020)', () => {
      const text = 'The research (García, 2020) demonstrated this.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].authors[0].raw).toBe('García');
    });

    it('should handle hyphenated names: (Siegel-Jacobs, 2020)', () => {
      const text = 'According to (Siegel-Jacobs, 2020), the effect exists.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
      expect(citations[0].authors[0].raw).toBe('Siegel-Jacobs');
    });

    it('should handle names with particles: (van der Berg, 2020)', () => {
      const text = 'The study (van der Berg, 2020) found evidence.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
    });

    it('should handle apostrophe names: (O\'Brien, 2020)', () => {
      const text = 'According to (O\'Brien, 2020), this is correct.';
      const citations = detectCitations(text);
      
      expect(citations.length).toBe(1);
    });
  });
});

describe('Reference Parsing', () => {
  describe('Author Extraction', () => {
    it('should extract single author', () => {
      const text = `
References

Smith, J. A. (2020). Title of article. Journal Name, 10(2), 123-145.
`;
      const refs = parseReferences(text);
      
      expect(refs.length).toBe(1);
      expect(refs[0].authorCount).toBe(1);
      expect(refs[0].firstAuthorLastName).toBe('Smith');
    });

    it('should extract two authors', () => {
      const text = `
References

Smith, J. A., & Jones, K. B. (2020). Title of article. Journal Name, 10(2), 123-145.
`;
      const refs = parseReferences(text);
      
      expect(refs.length).toBe(1);
      expect(refs[0].authorCount).toBe(2);
      expect(refs[0].firstAuthorLastName).toBe('Smith');
      expect(refs[0].secondAuthorLastName).toBe('Jones');
    });

    it('should extract multiple authors (3-20)', () => {
      const text = `
References

Arkes, H. R., Joyner, C. A., Pezzo, M. V., Nash, J. G., Siegel-Jacobs, K., & Stone, E. (1994). The psychology of windfall gains. Organizational Behavior and Human Decision Processes, 59(3), 331-347.
`;
      const refs = parseReferences(text);
      
      expect(refs.length).toBe(1);
      expect(refs[0].authorCount).toBeGreaterThanOrEqual(3);
      expect(refs[0].firstAuthorLastName).toBe('Arkes');
    });

    it('should detect organization author', () => {
      const text = `
References

World Health Organization. (2020). Report on global health. WHO Press.
`;
      const refs = parseReferences(text);
      
      expect(refs.length).toBe(1);
      expect(refs[0].isGroupAuthor).toBe(true);
      expect(refs[0].groupName).toBe('World Health Organization');
    });
  });

  describe('Year Extraction', () => {
    it('should extract year with suffix', () => {
      const text = `
References

Smith, J. A. (2020a). First article. Journal, 1(1), 1-10.
Smith, J. A. (2020b). Second article. Journal, 1(2), 11-20.
`;
      const refs = parseReferences(text);
      
      expect(refs.length).toBe(2);
      expect(refs[0].year).toBe('2020');
      expect(refs[0].yearSuffix).toBe('a');
      expect(refs[1].yearSuffix).toBe('b');
    });

    it('should handle n.d. (no date)', () => {
      const text = `
References

Smith, J. A. (n.d.). Article without date. Journal Name.
`;
      const refs = parseReferences(text);
      
      expect(refs.length).toBe(1);
      expect(refs[0].year).toBe('n.d.');
    });
  });
});

describe('Citation-Reference Matching', () => {
  describe('Single Author Matching', () => {
    it('should match (Simonsohn, 2015) to Simonsohn, U. (2015)', () => {
      const citation = createTestCitation({
        raw: '(Simonsohn, 2015)',
        type: 'single',
        authors: [{ raw: 'Simonsohn', normalized: 'simonsohn', isEtAl: false, isOrganization: false }],
        year: '2015'
      });
      
      const reference = createTestReference({
        raw: 'Simonsohn, U. (2015). Small Telescopes...',
        authorCount: 1,
        firstAuthorLastName: 'Simonsohn',
        firstAuthorLastNameNormalized: 'simonsohn',
        allAuthorLastNames: ['Simonsohn'],
        allAuthorLastNamesNormalized: ['simonsohn'],
        year: '2015'
      });
      
      const results = matchCitationToReferences(citation, [reference]);
      
      expect(results[0].status).toBe('matched');
      expect(results[0].confidence).toBeGreaterThan(0.8);
    });

    it('should match with typo tolerance: (Simonsohn, 2015) to Simonson, U. (2015)', () => {
      const citation = createTestCitation({
        raw: '(Simonsohn, 2015)',
        type: 'single',
        authors: [{ raw: 'Simonsohn', normalized: 'simonsohn', isEtAl: false, isOrganization: false }],
        year: '2015'
      });
      
      const reference = createTestReference({
        raw: 'Simonson, U. (2015). Paper...',
        authorCount: 1,
        firstAuthorLastName: 'Simonson',
        firstAuthorLastNameNormalized: 'simonson',
        allAuthorLastNames: ['Simonson'],
        allAuthorLastNamesNormalized: ['simonson'],
        year: '2015'
      });
      
      const results = matchCitationToReferences(citation, [reference]);
      
      // Should suggest match despite typo
      expect(results[0].confidence).toBeGreaterThan(0.5);
    });

    it('should match accented name: (García, 2020) to Garcia, M. (2020)', () => {
      const citation = createTestCitation({
        raw: '(García, 2020)',
        type: 'single',
        authors: [{ raw: 'García', normalized: 'garcia', isEtAl: false, isOrganization: false }],
        year: '2020'
      });
      
      const reference = createTestReference({
        raw: 'García, M. (2020). Paper...',
        authorCount: 1,
        firstAuthorLastName: 'García',
        firstAuthorLastNameNormalized: 'garcia',
        allAuthorLastNames: ['García'],
        allAuthorLastNamesNormalized: ['garcia'],
        year: '2020'
      });
      
      const results = matchCitationToReferences(citation, [reference]);
      
      expect(results[0].status).toBe('matched');
    });
  });

  describe('Two Author Matching', () => {
    it('should match (Smith & Jones, 2020) to Smith, J., & Jones, K. (2020)', () => {
      const citation = createTestCitation({
        raw: '(Smith & Jones, 2020)',
        type: 'two_authors',
        authors: [
          { raw: 'Smith', normalized: 'smith', isEtAl: false, isOrganization: false },
          { raw: 'Jones', normalized: 'jones', isEtAl: false, isOrganization: false }
        ],
        year: '2020'
      });
      
      const reference = createTestReference({
        raw: 'Smith, J., & Jones, K. (2020). Paper...',
        authorCount: 2,
        firstAuthorLastName: 'Smith',
        firstAuthorLastNameNormalized: 'smith',
        secondAuthorLastName: 'Jones',
        secondAuthorLastNameNormalized: 'jones',
        allAuthorLastNames: ['Smith', 'Jones'],
        allAuthorLastNamesNormalized: ['smith', 'jones'],
        year: '2020'
      });
      
      const results = matchCitationToReferences(citation, [reference]);
      
      expect(results[0].status).toBe('matched');
    });

    it('should match two-author citation to 3+ author reference with reduced confidence', () => {
      // Common APA error: citing "Smith & Jones" when ref has 3+ authors
      // System should still match (both cited names appear in ref) but with lower confidence
      const citation = createTestCitation({
        raw: '(Smith & Jones, 2020)',
        type: 'two_authors',
        authors: [
          { raw: 'Smith', normalized: 'smith', isEtAl: false, isOrganization: false },
          { raw: 'Jones', normalized: 'jones', isEtAl: false, isOrganization: false }
        ],
        year: '2020'
      });

      const reference = createTestReference({
        raw: 'Smith, J., Jones, K., & Brown, L. (2020). Paper...',
        authorCount: 3,
        firstAuthorLastName: 'Smith',
        firstAuthorLastNameNormalized: 'smith',
        secondAuthorLastName: 'Jones',
        secondAuthorLastNameNormalized: 'jones',
        allAuthorLastNames: ['Smith', 'Jones', 'Brown'],
        allAuthorLastNamesNormalized: ['smith', 'jones', 'brown'],
        year: '2020'
      });

      const results = matchCitationToReferences(citation, [reference]);

      // Should match with moderate confidence (both names found but author count mismatch)
      expect(results[0].confidence).toBeGreaterThan(0.5);
      expect(results[0].confidence).toBeLessThan(0.95);
    });
  });

  describe('Et Al. Matching', () => {
    it('should match (Arkes et al., 1994) to 6-author reference', () => {
      const citation = createTestCitation({
        raw: '(Arkes et al., 1994)',
        type: 'et_al',
        authors: [
          { raw: 'Arkes', normalized: 'arkes', isEtAl: false, isOrganization: false },
          { raw: 'et al.', normalized: 'et al.', isEtAl: true, isOrganization: false }
        ],
        year: '1994'
      });
      
      const reference = createTestReference({
        raw: 'Arkes, H. R., Joyner, C. A., Pezzo, M. V., Nash, J. G., Siegel-Jacobs, K., & Stone, E. (1994). Paper...',
        authorCount: 6,
        firstAuthorLastName: 'Arkes',
        firstAuthorLastNameNormalized: 'arkes',
        allAuthorLastNames: ['Arkes', 'Joyner', 'Pezzo', 'Nash', 'Siegel-Jacobs', 'Stone'],
        allAuthorLastNamesNormalized: ['arkes', 'joyner', 'pezzo', 'nash', 'siegeljacobs', 'stone'],
        year: '1994'
      });
      
      const results = matchCitationToReferences(citation, [reference]);
      
      expect(results[0].status).toBe('matched');
      expect(results[0].confidence).toBeGreaterThan(0.8);
    });

    it('should NOT match et al. citation to 2-author reference', () => {
      const citation = createTestCitation({
        raw: '(Smith et al., 2020)',
        type: 'et_al',
        authors: [
          { raw: 'Smith', normalized: 'smith', isEtAl: false, isOrganization: false },
          { raw: 'et al.', normalized: 'et al.', isEtAl: true, isOrganization: false }
        ],
        year: '2020'
      });
      
      const reference = createTestReference({
        raw: 'Smith, J., & Jones, K. (2020). Paper...',
        authorCount: 2,
        firstAuthorLastName: 'Smith',
        firstAuthorLastNameNormalized: 'smith',
        allAuthorLastNames: ['Smith', 'Jones'],
        allAuthorLastNamesNormalized: ['smith', 'jones'],
        year: '2020'
      });
      
      const results = matchCitationToReferences(citation, [reference]);
      
      // Should have low confidence due to author count mismatch
      expect(results[0].confidence).toBeLessThan(0.5);
    });
  });

  describe('Organization Author Matching', () => {
    it('should match (WHO, 2020) to World Health Organization. (2020)', () => {
      const citation = createTestCitation({
        raw: '(WHO, 2020)',
        type: 'group',
        authors: [{ raw: 'WHO', normalized: 'who', isEtAl: false, isOrganization: true, abbreviation: 'WHO' }],
        year: '2020'
      });
      
      const reference = createTestReference({
        raw: 'World Health Organization. (2020). Report...',
        authorCount: 1,
        firstAuthorLastName: 'World Health Organization',
        firstAuthorLastNameNormalized: 'world health organization',
        allAuthorLastNames: ['World Health Organization'],
        allAuthorLastNamesNormalized: ['world health organization'],
        year: '2020',
        isGroupAuthor: true,
        groupName: 'World Health Organization',
        groupAbbreviation: 'WHO'
      });
      
      const results = matchCitationToReferences(citation, [reference]);
      
      expect(results[0].status).toBe('matched');
    });

    it('should match full organization name to reference', () => {
      const citation = createTestCitation({
        raw: '(American Psychological Association, 2020)',
        type: 'group_full',
        authors: [{ 
          raw: 'American Psychological Association', 
          normalized: 'american psychological association', 
          isEtAl: false, 
          isOrganization: true 
        }],
        year: '2020'
      });
      
      const reference = createTestReference({
        raw: 'American Psychological Association. (2020). Manual...',
        authorCount: 1,
        firstAuthorLastName: 'American Psychological Association',
        firstAuthorLastNameNormalized: 'american psychological association',
        allAuthorLastNames: ['American Psychological Association'],
        allAuthorLastNamesNormalized: ['american psychological association'],
        year: '2020',
        isGroupAuthor: true,
        groupName: 'American Psychological Association',
        groupAbbreviation: 'APA'
      });
      
      const results = matchCitationToReferences(citation, [reference]);
      
      expect(results[0].status).toBe('matched');
    });
  });

  describe('Year Matching', () => {
    it('should match exact year and suffix: (Smith, 2020a)', () => {
      const citation = createTestCitation({
        raw: '(Smith, 2020a)',
        type: 'single',
        authors: [{ raw: 'Smith', normalized: 'smith', isEtAl: false, isOrganization: false }],
        year: '2020',
        yearSuffix: 'a'
      });
      
      const reference = createTestReference({
        raw: 'Smith, J. (2020a). First paper...',
        authorCount: 1,
        firstAuthorLastName: 'Smith',
        firstAuthorLastNameNormalized: 'smith',
        allAuthorLastNames: ['Smith'],
        allAuthorLastNamesNormalized: ['smith'],
        year: '2020',
        yearSuffix: 'a'
      });
      
      const results = matchCitationToReferences(citation, [reference]);
      
      expect(results[0].status).toBe('matched');
      expect(results[0].confidence).toBeGreaterThan(0.9);
    });

    it('should have lower confidence for year off by 1', () => {
      const citation = createTestCitation({
        raw: '(Smith, 2020)',
        type: 'single',
        authors: [{ raw: 'Smith', normalized: 'smith', isEtAl: false, isOrganization: false }],
        year: '2020'
      });
      
      const reference = createTestReference({
        raw: 'Smith, J. (2019). Paper...',
        authorCount: 1,
        firstAuthorLastName: 'Smith',
        firstAuthorLastNameNormalized: 'smith',
        allAuthorLastNames: ['Smith'],
        allAuthorLastNamesNormalized: ['smith'],
        year: '2019'
      });
      
      const results = matchCitationToReferences(citation, [reference]);
      
      // Should still match but with reduced confidence due to year mismatch
      // Year off by 1 gets 0.6 score, combined: 0.7 * 1.0 (author) + 0.3 * 0.6 (year) = 0.88
      expect(results[0].confidence).toBeLessThan(0.95); // Less than perfect match
      expect(results[0].confidence).toBeGreaterThan(0.4);
    });

    it('should match n.d. citations', () => {
      const citation = createTestCitation({
        raw: '(Smith, n.d.)',
        type: 'single',
        authors: [{ raw: 'Smith', normalized: 'smith', isEtAl: false, isOrganization: false }],
        year: 'n.d.'
      });
      
      const reference = createTestReference({
        raw: 'Smith, J. (n.d.). Paper...',
        authorCount: 1,
        firstAuthorLastName: 'Smith',
        firstAuthorLastNameNormalized: 'smith',
        allAuthorLastNames: ['Smith'],
        allAuthorLastNamesNormalized: ['smith'],
        year: 'n.d.'
      });
      
      const results = matchCitationToReferences(citation, [reference]);
      
      expect(results[0].confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Ambiguity Detection', () => {
    it('should detect ambiguous matches (same author, different years)', () => {
      const citation = createTestCitation({
        raw: '(Smith, 2020)',
        type: 'single',
        authors: [{ raw: 'Smith', normalized: 'smith', isEtAl: false, isOrganization: false }],
        year: '2020'
      });
      
      const references = [
        createTestReference({
          raw: 'Smith, J. (2020a). First paper...',
          authorCount: 1,
          firstAuthorLastName: 'Smith',
          firstAuthorLastNameNormalized: 'smith',
          allAuthorLastNames: ['Smith'],
          allAuthorLastNamesNormalized: ['smith'],
          year: '2020',
          yearSuffix: 'a'
        }),
        createTestReference({
          raw: 'Smith, J. (2020b). Second paper...',
          authorCount: 1,
          firstAuthorLastName: 'Smith',
          firstAuthorLastNameNormalized: 'smith',
          allAuthorLastNames: ['Smith'],
          allAuthorLastNamesNormalized: ['smith'],
          year: '2020',
          yearSuffix: 'b'
        })
      ];
      
      const results = matchCitationToReferences(citation, references);
      
      // Should detect ambiguity
      expect(results[0].status).toBe('ambiguous');
      expect(results[0].alternativeMatches).toBeDefined();
      expect(results[0].alternativeMatches!.length).toBeGreaterThan(0);
    });

    // Cycle 18 — 2026-05-26 cycle-1 chen canary regression.
    // When the reference list has TWO entries with identical (author, year,
    // yearSuffix) — e.g. two "Fischhoff (1975)" with no suffix to break the
    // tie — the matcher cannot disambiguate from the citation alone. Prior
    // behavior was status='ambiguous', which Citationguard's compare-citelink
    // scorer treated as no-match, dropping all 21/21 Fischhoff (1975)
    // citations in chen_2021_jesp from the agreement count. The fix: when
    // ALL alternative matches share the bestMatch's (author, year, suffix)
    // key, treat as 'matched' to the highest-confidence one. The two-suffix
    // case above (2020a vs 2020b) is preserved as genuinely ambiguous.
    it('should NOT mark same-key duplicates as ambiguous (gate the chen Fischhoff 1975 regression)', () => {
      const citation = createTestCitation({
        raw: '(Fischhoff, 1975)',
        type: 'single',
        authors: [{ raw: 'Fischhoff', normalized: 'fischhoff', isEtAl: false, isOrganization: false }],
        year: '1975',
      });
      const references = [
        createTestReference({
          raw: 'Fischhoff, B. (1975). Hindsight ≠ foresight.',
          authorCount: 1,
          firstAuthorLastName: 'Fischhoff',
          firstAuthorLastNameNormalized: 'fischhoff',
          allAuthorLastNames: ['Fischhoff'],
          allAuthorLastNamesNormalized: ['fischhoff'],
          year: '1975',
        }),
        createTestReference({
          raw: 'Fischhoff, B. (1975). I knew it would happen.',
          authorCount: 1,
          firstAuthorLastName: 'Fischhoff',
          firstAuthorLastNameNormalized: 'fischhoff',
          allAuthorLastNames: ['Fischhoff'],
          allAuthorLastNamesNormalized: ['fischhoff'],
          year: '1975',
        }),
      ];
      const results = matchCitationToReferences(citation, references);
      expect(results[0].status).toBe('matched');
      // alternativeMatches still populated so downstream tools see the duplicate.
      expect(results[0].alternativeMatches).toBeDefined();
      expect(results[0].alternativeMatches!.length).toBeGreaterThan(0);
    });
  });

  describe('Match Statistics', () => {
    it('should calculate correct match statistics', () => {
      const results = [
        { citation: {} as DetectedCitation, reference: null, confidence: 0.9, status: 'matched' as const },
        { citation: {} as DetectedCitation, reference: null, confidence: 0.6, status: 'suggested' as const },
        { citation: {} as DetectedCitation, reference: null, confidence: 0.8, status: 'ambiguous' as const },
        { citation: {} as DetectedCitation, reference: null, confidence: 0.2, status: 'no_match' as const },
      ];
      
      const stats = getMatchStatistics(results);
      
      expect(stats.total).toBe(4);
      expect(stats.matched).toBe(1);
      expect(stats.suggested).toBe(1);
      expect(stats.ambiguous).toBe(1);
      expect(stats.noMatch).toBe(1);
      expect(stats.matchRate).toBe(0.75);
    });
  });
});

describe('Name Normalization', () => {
  it('should normalize accented characters', () => {
    expect(normalizeName('García')).toBe('garcia');
    expect(normalizeName('Müller')).toBe('muller');
    expect(normalizeName('Øberg')).toBe('oberg');
  });

  it('should normalize apostrophes', () => {
    expect(normalizeName("O'Brien")).toBe("o'brien");
    expect(normalizeName("D'Angelo")).toBe("d'angelo");
  });

  it('should normalize hyphens', () => {
    expect(normalizeName('Siegel-Jacobs')).toBe('siegeljacobs');
  });

  it('should normalize spaces', () => {
    expect(normalizeName('van der Berg')).toBe('van der berg');
  });

  it('should handle mixed case', () => {
    expect(normalizeName('SMITH')).toBe('smith');
    expect(normalizeName('Smith')).toBe('smith');
    expect(normalizeName('sMiTh')).toBe('smith');
  });
});

describe('Text Normalization', () => {
  it('should normalize for comparison', () => {
    expect(normalizeText('García')).toBe('garcia');
    expect(normalizeText('  Multiple   Spaces  ')).toBe('multiple spaces');
    expect(normalizeText('Punctuation.')).toBe('punctuation');
  });
});

describe('Harvard no-comma fallback in APA detector (B34)', () => {
  // Even when style detection lands on APA, papers like bjps_3/7 mix in
  // Harvard-style "(Author Year)" no-comma citations. The APA detector now
  // includes a fallback set of patterns so those citations still get picked
  // up rather than being silently dropped (which previously dragged recall
  // to 80–95%).
  it('detects (Smith 2020) — single author no-comma — in APA-mode detection', () => {
    const text = 'The argument has been advanced (Smith 2020) repeatedly.';
    const citations = detectCitations(text);
    const c = citations.find(c => c.year === '2020');
    expect(c).toBeDefined();
    expect(c!.authors[0].raw).toBe('Smith');
  });

  it('detects (Smith and Jones 2020) — two authors no-comma — in APA-mode detection', () => {
    const text = 'Earlier work (Smith and Jones 2020) supports this.';
    const citations = detectCitations(text);
    const c = citations.find(c => c.year === '2020' && c.type === 'two_authors');
    expect(c).toBeDefined();
    expect(c!.authors.length).toBeGreaterThanOrEqual(2);
  });

  it('detects (Smith et al. 2020) — et al. no-comma — in APA-mode detection', () => {
    const text = 'Recent meta-analyses (Smith et al. 2020) confirm.';
    const citations = detectCitations(text);
    const c = citations.find(c => c.year === '2020' && c.type === 'et_al');
    expect(c).toBeDefined();
  });

  it('still detects standard APA "(Smith, 2020)" without regression', () => {
    const text = 'The argument (Smith, 2020) is well known.';
    const citations = detectCitations(text);
    const c = citations.find(c => c.year === '2020');
    expect(c).toBeDefined();
    expect(c!.authors[0].raw).toBe('Smith');
  });
});
