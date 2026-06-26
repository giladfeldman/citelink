/**
 * APA organizational-author reference split + full-name extraction
 * (xiao_2021_crsp / CRSP — citationguard-iterate R-0177 audit 2026-06-26)
 *
 * Two organizational-author reference entries in xiao_2021_crsp are concatenated
 * mid-line onto the PREVIOUS reference (docpluck academic flows them after the
 * prior entry's publisher / DOI with only a space, no newline), and citelink
 * mishandled BOTH the boundary and the author extraction:
 *
 *   1. "…L. Erlbaum Associates. Collaborative Open-science REsearch (CORE). (2020).
 *       Replications and extensions…"
 *      The org name ends in a parenthetical acronym "(CORE)." rather than an
 *      org-suffix word, and its head word "Collaborative" + "REsearch" is in
 *      neither the opener's org-suffix list nor the organizationAuthor leading-word
 *      list. The whole CORE entry was SWALLOWED into the Cohen (1988) reference and
 *      dropped — citelink emitted 73 refs vs 74 gold (TEXT-LOSS).
 *
 *   2. "…https://doi.org/10.1037/bul0000294 Open Science Collaboration. (2015).
 *       Estimating the reproducibility…"
 *      The org name "Open Science Collaboration" ends in the suffix word
 *      "Collaboration" (already in the opener list), but its LEADING word "Open"
 *      is not in the organizationAuthor leading-word whitelist, so the extractor
 *      keyed the author on the tail "Science Collaboration" — dropping "Open"
 *      (CITATION-PARSING) and cascading to a wrong-target in-text match.
 *
 * Both snippets are verbatim from the docpluck v2.4.98 academic extraction of
 * xiao_2021_crsp (DOI 10.1080/23743603.2021.1878340).
 */

import { describe, it, expect } from '@jest/globals';
import {
  splitConcatenatedApaReferences,
  parseReferences,
} from '../src/referenceParser.js';

describe('APA org-author reference split + full-name extraction (xiao_2021)', () => {
  describe('splitter: org entry concatenated onto the previous reference', () => {
    it('splits "Open Science Collaboration. (2015)" off the previous DOI-terminated ref', () => {
      const block =
        'Olsson-Collentine, A. (2020). Heterogeneity in direct replications in psychology ' +
        'and its association with effect size. Psychological Bulletin, 146(10), 922-940. ' +
        'https://doi.org/10.1037/bul0000294 Open Science Collaboration. (2015). Estimating ' +
        'the reproducibility of psychological science. Science, 349(6251), aac4716. ' +
        'https://doi.org/10.1126/science.aac4716';
      const parts = splitConcatenatedApaReferences(block);
      expect(parts.length).toBe(2);
      // The split MUST keep the full org name "Open Science Collaboration" — not drop "Open".
      expect(parts[1]).toMatch(/^Open Science Collaboration\. \(2015\)/);
    });

    it('splits "Collaborative Open-science REsearch (CORE). (2020)" off the previous book ref', () => {
      const block =
        'Cohen, J. (1988). Statistical power analysis for the behavioral sciences (2nd ed.). ' +
        'L. Erlbaum Associates. Collaborative Open-science REsearch (CORE). (2020). Replications ' +
        'and extensions of classic findings in social psychology and judgment and decision ' +
        'making. https://doi.org/10.17605/OSF.IO/5z4a8';
      const parts = splitConcatenatedApaReferences(block);
      expect(parts.length).toBe(2);
      expect(parts[1]).toMatch(/^Collaborative Open-science REsearch \(CORE\)\. \(2020\)/);
    });
  });

  describe('extraction: org author keyed on its FULL leading-word name', () => {
    // parseReferences() needs a recognizable reference SECTION, so each org entry is
    // embedded in a small APA reference list with a sibling personal-author entry.
    const section = (orgEntry: string) =>
      'References\n\n' +
      'Anderson, C. J., Bahník, Š., & Barnett-Cowan, M. (2019). Response to Comment ' +
      'on "Estimating the reproducibility of psychological science." Science, 351(6277), ' +
      '1037. https://doi.org/10.1126/science.aad9163\n\n' +
      orgEntry +
      '\n\nScheel, A. M., Schijen, M., & Lakens, D. (2021). An excess of positive results. ' +
      'Advances in Methods and Practices in Psychological Science, 4(2).';

    it('keys "Open Science Collaboration. (2015)." on the full org name (keeps "Open")', () => {
      const refs = parseReferences(
        section(
          'Open Science Collaboration. (2015). Estimating the reproducibility of ' +
            'psychological science. Science, 349(6251), aac4716. ' +
            'https://doi.org/10.1126/science.aac4716',
        ),
      );
      const osc = refs.find(r => /Collaboration/.test(r.authors[0]?.lastName ?? ''));
      expect(osc).toBeDefined();
      expect(osc!.authors[0].isOrganization).toBe(true);
      expect(osc!.authors[0].lastName).toMatch(/^Open Science Collaboration/);
      expect(osc!.year).toBe('2015');
    });

    it('keys "Collaborative Open-science REsearch (CORE). (2020)." on the full org name', () => {
      const refs = parseReferences(
        section(
          'Collaborative Open-science REsearch (CORE). (2020). Replications and ' +
            'extensions of classic findings in social psychology and judgment and ' +
            'decision making. https://doi.org/10.17605/OSF.IO/5z4a8',
        ),
      );
      const core = refs.find(r => /REsearch|Research/.test(r.authors[0]?.lastName ?? ''));
      expect(core).toBeDefined();
      expect(core!.authors[0].isOrganization).toBe(true);
      expect(core!.authors[0].lastName).toMatch(/^Collaborative Open-science REsearch/);
      expect(core!.year).toBe('2020');
    });
  });

  describe('regression guard — a personal-author APA ref is unaffected', () => {
    it('still splits a plain "Surname, A. (year)." concatenation and keeps the surname', () => {
      const block =
        'Cohen, J. (1988). Statistical power analysis for the behavioral sciences (2nd ed.). ' +
        'L. Erlbaum Associates. Smaldino, P. E. (2016). The natural selection of bad science. ' +
        'Royal Society Open Science, 3(9), 160384.';
      const parts = splitConcatenatedApaReferences(block);
      expect(parts.length).toBe(2);
      expect(parts[1]).toMatch(/^Smaldino, P\. E\. \(2016\)/);
    });
  });
});
