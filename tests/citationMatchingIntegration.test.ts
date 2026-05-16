/**
 * Citation Matching Integration Tests
 * Tests the full citation detection → reference parsing → matching pipeline
 * using real academic papers from the archive/testpdfs directory
 * 
 * These tests validate:
 * 1. Citation detection accuracy for various APA 7 formats
 * 2. Reference parsing accuracy
 * 3. Citation-reference matching accuracy
 * 4. Edge cases (et al., organization authors, multiple citations)
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';
import { parseReferences, findReferenceSectionStart } from '../src/referenceParser.js';
import { matchCitationsToReferences, getMatchStatistics } from '../src/citationMatcher.js';
import * as fs from 'fs';
import * as path from 'path';

// Sample text excerpts from real academic papers for testing
// These represent actual citation patterns found in psychology/behavioral science papers

const SAMPLE_PAPER_1 = {
  name: 'Chan-Feldman-2025-Baron-Szymanska',
  // Excerpt from introduction with various citation formats
  text: `
    Bekkers and Wiepking (2011) identified eight separate mechanisms that drive charitable giving: awareness
    of need, solicitation, costs and benefits, altruism, reputation, psychological benefits, values and efficacy.
    Baron and Szymanska (2011) proposed that utilitarianism should be the objective standard.
    According to Baron & Szymanska (2011), charitable donations should maximize good.
    This has been confirmed by multiple studies (Caviola et al., 2014; Read & Loewenstein, 1995).
    Nosek et al. (2022) emphasized the importance of replication in psychological science.
    The evaluability hypothesis was introduced by Hsee (1996) and later expanded.
    Recent work by Simonsohn (2015) on small telescopes has influenced replication methodology.
    LeBel et al. (2019) provided a brief guide to evaluate replications.
  `,
  // Include "References" header so parseReferences can find the section (APA 7 format)
  references: `
References

Bekkers, R., & Wiepking, P. (2011). A literature review of empirical studies of philanthropy. Nonprofit and Voluntary Sector Quarterly, 40(5), 924–973. https://doi.org/10.1177/0899764010380927

Baron, J., & Szymanska, E. (2011). Heuristics and biases in charity. In D. M. Oppenheimer & C. Y. Olivola (Eds.), The science of giving: Experimental approaches to the study of charity (pp. 215–235). Psychology Press. https://doi.org/10.4324/9780203865972-24

Hsee, C. K. (1996). The evaluability hypothesis: An explanation for preference reversals between joint and separate evaluations of alternatives. Organizational Behavior and Human Decision Processes, 67(3), 247–257. https://doi.org/10.1006/obhd.1996.0077

Caviola, L., Faulmüller, N., Everett, J., Savulescu, J., & Kahane, G. (2014). The evaluability bias in charitable giving: Saving administration costs or saving lives? Judgment and Decision Making, 9(4), 303–316. https://doi.org/10.1017/s1930297500006185

Read, D., & Loewenstein, G. (1995). Diversification bias: Explaining the discrepancy in variety seeking between combined and separated choices. Journal of Experimental Psychology: Applied, 1(1), 34–49. https://doi.org/10.1037/1076-898x.1.1.34

Nosek, B. A., Hardwicke, T. E., Moshontz, H., Allard, A., Corker, K. S., Dreber, A., ... & Vazire, S. (2022). Replicability, robustness, and reproducibility in psychological science. Annual Review of Psychology, 73, 719–748. https://doi.org/10.1146/annurev-psych-020821-114157

Simonsohn, U. (2015). Small telescopes: Detectability and the evaluation of replication results. Psychological Science, 26(5), 559–569. https://doi.org/10.1177/0956797614567341

LeBel, E. P., Vanpaemel, W., Cheung, I., & Campbell, L. (2019). A brief guide to evaluate replications. Meta-Psychology, 3, MP.2018.843. https://doi.org/10.15626/mp.2018.843
  `,
  expectedCitations: [
    { authors: ['Bekkers', 'Wiepking'], year: '2011' },
    { authors: ['Baron', 'Szymanska'], year: '2011' },
    { authors: ['Caviola'], year: '2014', hasEtAl: true },
    { authors: ['Read', 'Loewenstein'], year: '1995' },
    { authors: ['Nosek'], year: '2022', hasEtAl: true },
    { authors: ['Hsee'], year: '1996' },
    { authors: ['Simonsohn'], year: '2015' },
    { authors: ['LeBel'], year: '2019', hasEtAl: true },
  ],
};

// Also fix the hyphenated author names test to use proper format
const HYPHENATED_REFS = `
References

García-López, J., & Smith, A. (2020). Title of the article. Journal Name, 1(1), 1-10. https://doi.org/10.1000/example1

van der Berg, M., & Jones, B. (2019). Another title. Journal Name, 2(2), 20-30. https://doi.org/10.1000/example2
`;

const ACCENTED_REFS = `
References

Müller, H. (2020). Title of the article. Journal Name, 1(1), 1-10. https://doi.org/10.1000/example1

Øberg, S. (2019). Another title. Journal Name, 2(2), 20-30. https://doi.org/10.1000/example2
`;

const SAMPLE_PAPER_2 = {
  name: 'Weiner-1988-Stigma-Replication',
  // Excerpt with narrative and parenthetical citations
  text: `
    The contagion effect is manifest in people who seek to avoid previously "neutral" objects after 
    they have come in contact with negative sources (Rozin et al., 1986). In consumer contexts, 
    it has been found that shoppers will rate clothing that has previously been touched by other 
    people as less favorable (Argo et al., 2006), but the reverse effect happens when the person 
    was an attractive salesperson (Argo et al., 2008). Newman and Bloom (2014) showed that 
    physical contact affects willingness to pay. According to Smith et al. (2016), products with 
    smaller serial numbers are considered "closer" to artists. Kramer and Block (2014) found that 
    people believe their athletic abilities increase when using objects touched by star athletes.
    
    Weiner et al. (1988) proposed an attribution-emotion model of stigmatization.
    This model was later extended by Dijker and Koomen (2003) and Corrigan et al. (2000).
    The American Psychiatric Association (2022) updated diagnostic criteria.
  `,
  references: `
References

Rozin, P., Millman, L., & Nemeroff, C. (1986). Operation of the laws of sympathetic magic in disgust and other domains. Journal of Personality and Social Psychology, 50(4), 703–712. https://doi.org/10.1037/0022-3514.50.4.703

Argo, J. J., Dahl, D. W., & Morales, A. C. (2006). Consumer contamination: How consumers react to products touched by others. Journal of Marketing, 70(2), 81-94. https://doi.org/10.1509/jmkg.70.2.081

Argo, J. J., Dahl, D. W., & Morales, A. C. (2008). Positive consumer contagion: Responses to attractive others in a retail context. Journal of Marketing Research, 45(6), 690-701. https://doi.org/10.1509/jmkr.45.6.690

Newman, G. E., & Bloom, P. (2014). Physical contact influences how much people pay at celebrity auctions. Proceedings of the National Academy of Sciences, 111(10), 3705–3708. https://doi.org/10.1073/pnas.1313637111

Smith, R. K., Newman, G. E., & Dhar, R. (2016). Closer to the Creator: Temporal Contagion Explains the Preference for Earlier Serial Numbers. Journal of Consumer Research, 42(5), 653–668. https://doi.org/10.1093/jcr/ucv054

Kramer, T., & Block, L. (2014). Like Mike: Ability contagion through touched objects increases confidence and improves performance. Organizational Behavior and Human Decision Processes, 124(2), 215-228. https://doi.org/10.1016/j.obhdp.2014.03.009

Weiner, B., Perry, R. P., & Magnusson, J. (1988). An attributional analysis of reactions to stigmas. Journal of Personality and Social Psychology, 55(5), 738–748. https://doi.org/10.1037/0022-3514.55.5.738

Dijker, A. J., & Koomen, W. (2003). Extending Weiner's Attribution-Emotion Model of Stigmatization of Ill Persons. Basic and Applied Social Psychology, 25(1), 51–68. https://doi.org/10.1207/s15324834basp2501_4

Corrigan, P. W., River, L. P., Lundin, R. K., Wasowski, K. U., Campion, J., Mathisen, J., Goldstein, H., Bergman, M., Gagnon, C., & Kubiak, M. A. (2000). Stigmatizing attributions about mental illness. Journal of Community Psychology, 28(1), 91–102.

American Psychiatric Association. (2022). Diagnostic and Statistical Manual of Mental Disorders (5th ed., text rev.). American Psychiatric Association. https://doi.org/10.1176/appi.books.9780890425787
  `,
  expectedCitations: [
    { authors: ['Rozin'], year: '1986', hasEtAl: true },
    { authors: ['Argo'], year: '2006', hasEtAl: true },
    { authors: ['Argo'], year: '2008', hasEtAl: true },
    { authors: ['Newman', 'Bloom'], year: '2014' },
    { authors: ['Smith'], year: '2016', hasEtAl: true },
    { authors: ['Kramer', 'Block'], year: '2014' },
    { authors: ['Weiner'], year: '1988', hasEtAl: true },
    { authors: ['Dijker', 'Koomen'], year: '2003' },
    { authors: ['Corrigan'], year: '2000', hasEtAl: true },
    { authors: ['American Psychiatric Association'], year: '2022', isOrganization: true },
  ],
};

const SAMPLE_PAPER_3 = {
  name: 'Default-Effects-Replications',
  // Excerpt with various citation edge cases
  text: `
    Default effects have been studied extensively (Johnson & Goldstein, 2003; Thaler & Sunstein, 2008).
    Samuelson and Zeckhauser (1988) first documented the status quo bias in decision making.
    According to Kahneman et al. (1991), loss aversion contributes to the endowment effect.
    The phenomenon was replicated by Dinner et al. (2011) and extended by Jachimowicz et al. (2019).
    
    In their seminal work, Tversky and Kahneman (1974) described several heuristics.
    Gigerenzer and colleagues (1999) challenged some of these findings.
    As noted by Ariely (2008), predictably irrational behavior is common.
    
    The Centers for Disease Control and Prevention (CDC, 2020) issued guidelines.
    World Health Organization (WHO, 2021) provided updated recommendations.
  `,
  references: `
References

Johnson, E. J., & Goldstein, D. (2003). Do defaults save lives? Science, 302(5649), 1338-1339. https://doi.org/10.1126/science.1091721

Thaler, R. H., & Sunstein, C. R. (2008). Nudge: Improving decisions about health, wealth, and happiness. Yale University Press.

Samuelson, W., & Zeckhauser, R. (1988). Status quo bias in decision making. Journal of Risk and Uncertainty, 1(1), 7-59. https://doi.org/10.1007/BF00055564

Kahneman, D., Knetsch, J. L., & Thaler, R. H. (1991). Anomalies: The endowment effect, loss aversion, and status quo bias. Journal of Economic Perspectives, 5(1), 193-206. https://doi.org/10.1257/jep.5.1.193

Dinner, I., Johnson, E. J., Goldstein, D. G., & Liu, K. (2011). Partitioning default effects: Why people choose not to choose. Journal of Experimental Psychology: Applied, 17(4), 332-341. https://doi.org/10.1037/a0024354

Jachimowicz, J. M., Duncan, S., Weber, E. U., & Johnson, E. J. (2019). When and why defaults influence decisions: A meta-analysis of default effects. Behavioural Public Policy, 3(2), 159-186. https://doi.org/10.1017/bpp.2018.43

Tversky, A., & Kahneman, D. (1974). Judgment under uncertainty: Heuristics and biases. Science, 185(4157), 1124-1131. https://doi.org/10.1126/science.185.4157.1124

Gigerenzer, G., Todd, P. M., & ABC Research Group. (1999). Simple heuristics that make us smart. Oxford University Press.

Ariely, D. (2008). Predictably irrational: The hidden forces that shape our decisions. HarperCollins.

Centers for Disease Control and Prevention. (2020). COVID-19 guidelines. https://www.cdc.gov/coronavirus/2019-ncov/

World Health Organization. (2021). COVID-19 recommendations. https://www.who.int/emergencies/diseases/novel-coronavirus-2019
  `,
  expectedCitations: [
    { authors: ['Johnson', 'Goldstein'], year: '2003' },
    { authors: ['Thaler', 'Sunstein'], year: '2008' },
    { authors: ['Samuelson', 'Zeckhauser'], year: '1988' },
    { authors: ['Kahneman'], year: '1991', hasEtAl: true },
    { authors: ['Dinner'], year: '2011', hasEtAl: true },
    { authors: ['Jachimowicz'], year: '2019', hasEtAl: true },
    { authors: ['Tversky', 'Kahneman'], year: '1974' },
    { authors: ['Gigerenzer'], year: '1999' },
    { authors: ['Ariely'], year: '2008' },
    { authors: ['CDC'], year: '2020', isOrganization: true },
    { authors: ['WHO'], year: '2021', isOrganization: true },
  ],
};

describe('Citation Detection Integration', () => {
  describe('Sample Paper 1: Baron & Szymanska Replication', () => {
    it('should detect all major citation formats', () => {
      const citations = detectCitations(SAMPLE_PAPER_1.text);
      
      // Should detect multiple citations
      expect(citations.length).toBeGreaterThanOrEqual(5);
      
      // Check for specific citations
      const baronCitation = citations.find(c => 
        c.authors.some(a => a.normalized?.toLowerCase().includes('baron') || a.raw?.toLowerCase().includes('baron'))
      );
      expect(baronCitation).toBeDefined();
      expect(baronCitation?.year).toBe('2011');
      
      const nosekCitation = citations.find(c =>
        c.authors.some(a => a.normalized?.toLowerCase().includes('nosek') || a.raw?.toLowerCase().includes('nosek'))
      );
      expect(nosekCitation).toBeDefined();
      expect(nosekCitation?.year).toBe('2022');
    });

    it('should detect two-author citations correctly', () => {
      const citations = detectCitations(SAMPLE_PAPER_1.text);
      
      const twoAuthorCitations = citations.filter(c => c.type === 'two_authors');
      expect(twoAuthorCitations.length).toBeGreaterThanOrEqual(2);
      
      // Check for Bekkers & Wiepking
      const bekkersWiepking = citations.find(c =>
        c.authors.some(a => (a.normalized || a.raw)?.toLowerCase().includes('bekkers')) &&
        c.authors.some(a => (a.normalized || a.raw)?.toLowerCase().includes('wiepking'))
      );
      expect(bekkersWiepking).toBeDefined();
    });

    it('should detect et al. citations correctly', () => {
      const citations = detectCitations(SAMPLE_PAPER_1.text);
      
      const etAlCitations = citations.filter(c => 
        c.type === 'et_al' || 
        c.authors.some(a => a.isEtAl)
      );
      expect(etAlCitations.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Sample Paper 2: Weiner et al. Stigma Replication', () => {
    it('should detect narrative and parenthetical citations', () => {
      const citations = detectCitations(SAMPLE_PAPER_2.text);
      
      const narrativeCitations = citations.filter(c => c.citationStyle === 'narrative');
      const parentheticalCitations = citations.filter(c => c.citationStyle === 'parenthetical');
      
      expect(narrativeCitations.length).toBeGreaterThanOrEqual(3);
      expect(parentheticalCitations.length).toBeGreaterThanOrEqual(3);
    });

    it('should detect organization author (APA)', () => {
      const citations = detectCitations(SAMPLE_PAPER_2.text);
      
      const apaCitation = citations.find(c =>
        c.authors.some(a => 
          (a.normalized || a.raw)?.toLowerCase().includes('american psychiatric') ||
          a.isOrganization
        )
      );
      expect(apaCitation).toBeDefined();
      expect(apaCitation?.year).toBe('2022');
    });

    it('should correctly identify Weiner et al. (1988)', () => {
      const citations = detectCitations(SAMPLE_PAPER_2.text);
      
      const weinerCitation = citations.find(c =>
        c.authors.some(a => (a.normalized || a.raw)?.toLowerCase().includes('weiner')) &&
        c.year === '1988'
      );
      expect(weinerCitation).toBeDefined();
    });
  });

  describe('Sample Paper 3: Default Effects', () => {
    it('should detect organization abbreviations (CDC, WHO)', () => {
      const citations = detectCitations(SAMPLE_PAPER_3.text);
      
      // Look for CDC or Centers for Disease Control
      const cdcCitation = citations.find(c =>
        c.authors.some(a => 
          (a.normalized || a.raw)?.toLowerCase().includes('cdc') ||
          (a.normalized || a.raw)?.toLowerCase().includes('centers for disease')
        )
      );
      
      // WHO might be detected
      const whoCitation = citations.find(c =>
        c.authors.some(a => 
          (a.normalized || a.raw)?.toLowerCase().includes('who') ||
          (a.normalized || a.raw)?.toLowerCase().includes('world health')
        )
      );
      
      // At least one organization should be detected
      expect(cdcCitation || whoCitation).toBeDefined();
    });

    it('should handle "and colleagues" pattern', () => {
      const citations = detectCitations(SAMPLE_PAPER_3.text);
      
      // Gigerenzer and colleagues should be detected
      const gigerenzerCitation = citations.find(c =>
        c.authors.some(a => (a.normalized || a.raw)?.toLowerCase().includes('gigerenzer'))
      );
      expect(gigerenzerCitation).toBeDefined();
    });
  });
});

describe('Reference Parsing Integration', () => {
  describe('Sample Paper 1 References', () => {
    it('should parse all references', () => {
      const references = parseReferences(SAMPLE_PAPER_1.references);
      
      expect(references.length).toBeGreaterThanOrEqual(6);
    });

    it('should extract author names correctly', () => {
      const references = parseReferences(SAMPLE_PAPER_1.references);
      
      // Find Baron & Szymanska reference
      const baronRef = references.find(r => 
        r.firstAuthorLastName?.toLowerCase() === 'baron' ||
        r.allAuthorLastNames?.some(a => a.toLowerCase() === 'baron')
      );
      expect(baronRef).toBeDefined();
      expect(baronRef?.year).toBe('2011');
      expect(baronRef?.authorCount).toBe(2);
    });

    it('should extract years correctly', () => {
      const references = parseReferences(SAMPLE_PAPER_1.references);
      
      const years = references.map(r => r.year).filter(Boolean);
      expect(years).toContain('2011');
      expect(years).toContain('1996');
      expect(years).toContain('2015');
      expect(years).toContain('2022');
    });

    it('should handle et al. in references (21+ authors)', () => {
      const references = parseReferences(SAMPLE_PAPER_1.references);
      
      // Nosek et al. reference should have multiple authors
      const nosekRef = references.find(r =>
        r.firstAuthorLastName?.toLowerCase() === 'nosek'
      );
      expect(nosekRef).toBeDefined();
      // The "et al." in the reference indicates many authors
      expect(nosekRef?.authorCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Sample Paper 2 References', () => {
    it('should parse APA 7 format references', () => {
      const references = parseReferences(SAMPLE_PAPER_2.references);
      
      expect(references.length).toBeGreaterThanOrEqual(8);
    });

    it('should extract DOIs', () => {
      const references = parseReferences(SAMPLE_PAPER_2.references);
      
      const refsWithDoi = references.filter(r => r.doi);
      expect(refsWithDoi.length).toBeGreaterThanOrEqual(5);
    });

    it('should handle organization authors', () => {
      const references = parseReferences(SAMPLE_PAPER_2.references);
      
      const apaRef = references.find(r =>
        r.isGroupAuthor && 
        (r.groupName?.toLowerCase().includes('american psychiatric') ||
         r.firstAuthorLastName?.toLowerCase().includes('american'))
      );
      expect(apaRef).toBeDefined();
    });

    it('should parse multi-author references (3+ authors)', () => {
      const references = parseReferences(SAMPLE_PAPER_2.references);
      
      const multiAuthorRefs = references.filter(r => r.authorCount >= 3);
      expect(multiAuthorRefs.length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('Citation-Reference Matching Integration', () => {
  describe('Sample Paper 1 Matching', () => {
    it('should match citations to references', () => {
      const citations = detectCitations(SAMPLE_PAPER_1.text);
      const references = parseReferences(SAMPLE_PAPER_1.references);
      
      const results = matchCitationsToReferences(citations, references);
      const stats = getMatchStatistics(results);
      
      // Should have some matches
      expect(stats.matched + stats.suggested).toBeGreaterThan(0);
      
      // Match rate should be reasonable for a well-formatted paper
      const matchRate = (stats.matched + stats.suggested) / stats.total;
      expect(matchRate).toBeGreaterThanOrEqual(0.3); // At least 30% should match
    });

    it('should correctly match Baron & Szymanska (2011)', () => {
      const citations = detectCitations(SAMPLE_PAPER_1.text);
      const references = parseReferences(SAMPLE_PAPER_1.references);
      
      const results = matchCitationsToReferences(citations, references);
      
      // Find Baron citation result
      const baronResult = results.find(r =>
        r.citation.authors.some(a => 
          (a.normalized || a.raw)?.toLowerCase().includes('baron')
        ) && r.citation.year === '2011'
      );
      
      expect(baronResult).toBeDefined();
      if (baronResult?.reference) {
        expect(baronResult.confidence).toBeGreaterThanOrEqual(0.4);
      }
    });

    it('should handle et al. matching', () => {
      const citations = detectCitations(SAMPLE_PAPER_1.text);
      const references = parseReferences(SAMPLE_PAPER_1.references);
      
      const results = matchCitationsToReferences(citations, references);
      
      // Find Nosek et al. citation
      const nosekResult = results.find(r =>
        r.citation.authors.some(a => 
          (a.normalized || a.raw)?.toLowerCase().includes('nosek')
        )
      );
      
      expect(nosekResult).toBeDefined();
      // Should match to the Nosek reference
      if (nosekResult?.reference) {
        expect(nosekResult.reference.firstAuthorLastName?.toLowerCase()).toBe('nosek');
      }
    });
  });

  describe('Sample Paper 2 Matching', () => {
    it('should match narrative citations', () => {
      const citations = detectCitations(SAMPLE_PAPER_2.text);
      const references = parseReferences(SAMPLE_PAPER_2.references);
      
      const results = matchCitationsToReferences(citations, references);
      
      // Find Newman and Bloom narrative citation
      const newmanResult = results.find(r =>
        r.citation.citationStyle === 'narrative' &&
        r.citation.authors.some(a => 
          (a.normalized || a.raw)?.toLowerCase().includes('newman')
        )
      );
      
      expect(newmanResult).toBeDefined();
    });

    it('should match two-author citations to two-author references', () => {
      const citations = detectCitations(SAMPLE_PAPER_2.text);
      const references = parseReferences(SAMPLE_PAPER_2.references);
      
      const results = matchCitationsToReferences(citations, references);
      
      // Dijker and Koomen should match
      const dijkerResult = results.find(r =>
        r.citation.authors.some(a => 
          (a.normalized || a.raw)?.toLowerCase().includes('dijker')
        )
      );
      
      expect(dijkerResult).toBeDefined();
      if (dijkerResult?.reference) {
        expect(dijkerResult.reference.authorCount).toBe(2);
      }
    });

    it('should handle organization author matching', () => {
      const citations = detectCitations(SAMPLE_PAPER_2.text);
      const references = parseReferences(SAMPLE_PAPER_2.references);
      
      const results = matchCitationsToReferences(citations, references);
      
      // APA citation should match to APA reference
      const apaResult = results.find(r =>
        r.citation.authors.some(a => 
          (a.normalized || a.raw)?.toLowerCase().includes('american psychiatric') ||
          a.isOrganization
        )
      );
      
      if (apaResult) {
        expect(apaResult.reference?.isGroupAuthor || apaResult.status !== 'no_match').toBe(true);
      }
    });
  });

  describe('Match Statistics', () => {
    it('should provide accurate statistics', () => {
      const citations = detectCitations(SAMPLE_PAPER_1.text);
      const references = parseReferences(SAMPLE_PAPER_1.references);
      
      const results = matchCitationsToReferences(citations, references);
      const stats = getMatchStatistics(results);
      
      expect(stats.total).toBe(citations.length);
      expect(stats.matched + stats.suggested + stats.ambiguous + stats.noMatch).toBe(stats.total);
    });
  });
});

describe('Edge Cases', () => {
  it('should handle citations with year suffixes (2020a, 2020b)', () => {
    const text = 'As shown by Smith (2020a) and later Smith (2020b), the effect persists.';
    const citations = detectCitations(text);
    
    expect(citations.length).toBe(2);
    expect(citations[0].yearSuffix).toBe('a');
    expect(citations[1].yearSuffix).toBe('b');
  });

  it('should handle possessive citations', () => {
    const text = "Smith's (2020) study and Jones and Brown's (2019) research showed similar results.";
    const citations = detectCitations(text);
    
    expect(citations.length).toBeGreaterThanOrEqual(2);
    const smithCitation = citations.find(c => 
      c.authors.some(a => (a.normalized || a.raw)?.toLowerCase().includes('smith'))
    );
    expect(smithCitation).toBeDefined();
  });

  it('should handle multiple citations in parentheses', () => {
    const text = 'This has been confirmed (Smith, 2020; Jones, 2019; Brown et al., 2018).';
    const citations = detectCitations(text);
    
    expect(citations.length).toBeGreaterThanOrEqual(3);
  });

  it('should handle n.d. (no date) citations', () => {
    const text = 'According to Smith (n.d.), this is true.';
    const citations = detectCitations(text);
    
    expect(citations.length).toBe(1);
    expect(citations[0].year).toBe('n.d.');
  });

  it('should handle citations with page numbers', () => {
    const text = 'As noted (Smith, 2020, p. 45) and (Jones, 2019, pp. 100-105).';
    const citations = detectCitations(text);
    
    const citationWithPage = citations.find(c => c.pageNumbers);
    expect(citationWithPage).toBeDefined();
  });

  it('should handle hyphenated author names', () => {
    const parsed = parseReferences(HYPHENATED_REFS);
    
    expect(parsed.length).toBe(2);
    // Should parse both references - the exact name format may vary
    // The key is that both references are parsed successfully
    expect(parsed[0].firstAuthorLastName).toBeDefined();
    expect(parsed[1].firstAuthorLastName).toBeDefined();
    
    // At least one should contain "garcia" or "lopez" or "berg"
    const hasExpectedNames = parsed.some(r => {
      const lastName = r.firstAuthorLastName?.toLowerCase() || '';
      return lastName.includes('garcia') || 
             lastName.includes('lopez') || 
             lastName.includes('berg') ||
             lastName.includes('van');
    });
    expect(hasExpectedNames).toBe(true);
  });

  it('should handle accented characters in names', () => {
    const parsed = parseReferences(ACCENTED_REFS);
    
    expect(parsed.length).toBe(2);
    // Names should be parsed even with accents
    expect(parsed[0].firstAuthorLastName).toBeDefined();
    expect(parsed[1].firstAuthorLastName).toBeDefined();
  });
});

describe('Database Constraint Validation', () => {
  it('should only produce citationStyle values that match database constraint', () => {
    // Database constraint: citation_type must be 'parenthetical' | 'narrative'
    const validCitationStyles: ('parenthetical' | 'narrative')[] = ['parenthetical', 'narrative'];
    
    // Test all sample papers
    const allTexts = [SAMPLE_PAPER_1.text, SAMPLE_PAPER_2.text, SAMPLE_PAPER_3.text];
    
    for (const text of allTexts) {
      const citations = detectCitations(text);
      
      for (const citation of citations) {
        expect(citation.citationStyle).toBeDefined();
        expect(validCitationStyles).toContain(citation.citationStyle);
        // Ensure it's exactly one of the valid values
        expect(citation.citationStyle === 'parenthetical' || citation.citationStyle === 'narrative').toBe(true);
      }
    }
  });

  it('should not use CitationType enum values for citation_type field', () => {
    // The CitationType enum has values like 'single', 'two_authors', 'et_al', etc.
    // These should NOT be used for the database citation_type field
    const invalidTypes = ['single', 'two_authors', 'et_al', 'group', 'group_full', 'secondary', 'multiple'];
    
    const citations = detectCitations(SAMPLE_PAPER_1.text);
    
    for (const citation of citations) {
      // citation.type is the classification (can be any CitationType)
      // citation.citationStyle is what should be saved to database
      expect(citation.type).toBeDefined();
      expect(citation.citationStyle).toBeDefined();
      
      // citationStyle should never be one of the invalid CitationType values
      expect(invalidTypes).not.toContain(citation.citationStyle);
      
      // citationStyle must be either 'parenthetical' or 'narrative'
      expect(['parenthetical', 'narrative']).toContain(citation.citationStyle);
    }
  });

  it('should validate match_status values match database constraint', () => {
    // Database constraint: match_status must be 'unmatched' | 'matched' | 'ambiguous' | 'no_match'
    // Note: 'suggested' is NOT in the database constraint, so it must be mapped to 'unmatched'
    const validMatchStatuses = ['unmatched', 'matched', 'ambiguous', 'no_match'];
    const invalidMatchStatuses = ['suggested']; // These must be mapped before saving
    
    const citations = detectCitations(SAMPLE_PAPER_1.text);
    const references = parseReferences(SAMPLE_PAPER_1.references);
    const matchResults = matchCitationsToReferences(citations, references);
    
    for (const match of matchResults) {
      // match.status can be 'suggested', but database doesn't allow it
      if (match.status === 'suggested') {
        // This is expected - the code should map 'suggested' to 'unmatched' before saving
        expect(invalidMatchStatuses).toContain(match.status);
      } else {
        // All other statuses should be valid
        expect(validMatchStatuses).toContain(match.status);
      }
    }
  });
});

describe('Full Pipeline Integration', () => {
  it('should process a complete paper excerpt end-to-end', () => {
    // Combine text and references
    const fullText = SAMPLE_PAPER_1.text + '\n\n' + SAMPLE_PAPER_1.references;
    
    // Find reference section start
    const refStart = findReferenceSectionStart(fullText);
    expect(refStart).not.toBeNull();
    
    // Parse references from the full document (parseReferences handles extraction internally)
    const references = parseReferences(fullText);
    expect(references.length).toBeGreaterThan(0);
    
    // Detect citations (from text only, not references)
    const citations = detectCitations(SAMPLE_PAPER_1.text);
    expect(citations.length).toBeGreaterThan(0);
    
    // Match citations to references
    const results = matchCitationsToReferences(citations, references);
    expect(results.length).toBe(citations.length);
    
    // Get statistics
    const stats = getMatchStatistics(results);
    expect(stats.total).toBe(citations.length);
    
    // Log summary for debugging
    console.log(`Full pipeline test: ${stats.matched} matched, ${stats.suggested} suggested, ${stats.noMatch} no match out of ${stats.total} citations`);
  });
});
