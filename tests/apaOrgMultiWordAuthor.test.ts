/**
 * APA organizational / multi-word in-text author detection
 * (tay_2020 canary / APA-ORG-AUTHOR, cycle 4 — the APA analog of Harvard H2-B)
 *
 * The APA citation detector captured an author via COMPOUND_SURNAME, which spans
 * a single surname optionally extended by a WHITELISTED particle. A run of 2+
 * plain capitalized tokens that is NOT particle-joined therefore fell through:
 *
 *   - standalone   "(R Core Team, 2019)"            -> mis-keyed to "team"
 *                  "(Open Science Collaboration, 2015)" -> mis-keyed to "collaboration"
 *   - ';'-bundle   "(...; Open Science Collaboration, 2015)" -> dropped entirely
 *
 * The standalone mis-key produced a spurious `extra_pred` ("team") AND left the
 * gold citation in `unmatched_gold`; the in-bundle org member was lost outright.
 * The fix adds an ORG_AUTHOR fragment (2-6 whitespace-joined capitalized tokens,
 * NO lowercase connective) consumed by a standalone parenthetical pattern and a
 * bundle-fragment fallback, keyed on the FULL organization name. A leading-token
 * prose guard (orgLeadAllowed) keeps "(See Smith, 2020)" and a lowercase-"and"
 * two-author form from being swallowed.
 *
 * Text snippets are verbatim from the docpluck-academic extractions of tay_2020
 * (DOI 10.1177/1948550619900570) and chan_feldman_2025 (10.1080/02699931.2024
 * .2434156). The bundle members sit across a CRLF line break in the source, so
 * the snippets keep the CRLF the extractor emitted.
 */

import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

const findByKey = (text: string, normalizedFirstAuthor: string, year: string) =>
  detectCitations(text).find(
    c => c.authors[0]?.normalized === normalizedFirstAuthor && c.year === year,
  );

describe('APA organizational / multi-word in-text author', () => {
  describe('standalone parenthetical', () => {
    it('keys "(R Core Team, 2019)" on the full org, not "team"', () => {
      const text = 'and MBESS (Kelley, 2007) in R (R Core Team, 2019).';
      const c = findByKey(text, 'r core team', '2019');
      expect(c).toBeDefined();
      expect(c!.type).toBe('group_full');
      expect(c!.authors[0].isOrganization).toBe(true);
      // The mis-keyed "team" detection must be gone.
      expect(detectCitations(text).some(c => c.authors[0]?.normalized === 'team')).toBe(false);
    });

    it('keys "(Open Science Collaboration, 2015)" on the full org, not "collaboration"', () => {
      const text = 'the project (Open Science Collaboration, 2015) found low rates';
      const c = findByKey(text, 'open science collaboration', '2015');
      expect(c).toBeDefined();
      expect(c!.type).toBe('group_full');
      expect(detectCitations(text).some(c => c.authors[0]?.normalized === 'collaboration')).toBe(false);
    });
  });

  describe("';'-bundle member (recovered, not dropped)", () => {
    it('detects the org member of a semicolon bundle (tay_2020, CRLF-split)', () => {
      // tay_2020 L89-90: the bundle breaks after "Klein et al.,"
      const text =
        '(Camerer et al., 2018; Klein et al.,\r\n2018; Open Science Collaboration, 2015).';
      const c = findByKey(text, 'open science collaboration', '2015');
      expect(c).toBeDefined();
      // The other bundle members are still detected.
      expect(findByKey(text, 'camerer', '2018')).toBeDefined();
      expect(findByKey(text, 'klein', '2018')).toBeDefined();
    });

    it('detects the org member when the org name itself is CRLF-split (chan_feldman)', () => {
      // chan_feldman L~14277: the org name breaks across "Open Science\r\nCollaboration"
      // inside a larger parenthetical bundle.
      const text =
        '(Field et al., 2019; Moshontz et al., 2018; Open Science\r\nCollaboration, 2015; Nosek et al., 2022)';
      const c = findByKey(text, 'open science collaboration', '2015');
      expect(c).toBeDefined();
    });
  });

  describe('organization with bracketed abbreviation (hyphenated name)', () => {
    // xiao_2021: groupWithAbbrev's name class excluded the hyphen, so the
    // hyphenated org name broke at "Open-science" and the group citation was
    // missed both standalone and inside a ';'-bundle.
    it('detects "(Collaborative Open-science REsearch [CORE], 2020)" standalone', () => {
      const text = 'the consortium (Collaborative Open-science REsearch [CORE], 2020) reported';
      const c = findByKey(text, 'collaborative open-science research', '2020');
      expect(c).toBeDefined();
      expect(c!.authors[0].abbreviation).toBe('CORE');
    });

    it('detects the bracketed-abbrev org as a semicolon-bundle member', () => {
      const text =
        'efforts (Munafò et al., 2017; Collaborative Open-science REsearch [CORE], 2020; Nosek et al., 2015).';
      expect(findByKey(text, 'collaborative open-science research', '2020')).toBeDefined();
      // normalizeText strips diacritics: "Munafò" -> "munafo".
      expect(findByKey(text, 'munafo', '2017')).toBeDefined();
      expect(findByKey(text, 'nosek', '2015')).toBeDefined();
    });

    it('still detects a plain bracketed-abbrev org (WHO) — no regression', () => {
      const text = 'per guidance (World Health Organization [WHO], 2020) we';
      const c = findByKey(text, 'world health organization', '2020');
      expect(c).toBeDefined();
      expect(c!.authors[0].abbreviation).toBe('WHO');
    });
  });

  describe('leading-token prose guard (no over-capture)', () => {
    it('does NOT glue a "See" lead-in onto the surname', () => {
      const text = 'as reported (See Smith, 2020) in the appendix';
      const cites = detectCitations(text);
      expect(cites.some(c => c.authors[0]?.normalized === 'see smith')).toBe(false);
      // The real single author is still detected.
      expect(findByKey(text, 'smith', '2020')).toBeDefined();
    });

    it('does NOT swallow a lowercase-"and" two-author form as one org', () => {
      const text = 'shown earlier (Smith and Jones, 2020) for the effect';
      expect(detectCitations(text).some(c => c.authors[0]?.normalized === 'smith and jones')).toBe(false);
    });

    it('does NOT treat a document-structure noun run as an org author', () => {
      const text = 'see the figure (Supplementary Materials, 2020) for details';
      expect(detectCitations(text).some(c => c.authors[0]?.normalized === 'supplementary materials')).toBe(false);
    });
  });
});
