/**
 * Harvard in-text surname left-boundary under-capture (bjps_1 / H2 cycle 2)
 *
 * The shared surname sub-pattern only spanned a multi-token surname joined by a
 * LOWERCASE particle ("Smith van Berg"). Three real surname shapes therefore fell
 * through to the LAST token, mis-keying the citation to the wrong author:
 *
 *   - cap-cap double surname   "Barros and Santos Silva (2019)" -> single "Silva"
 *   - capitalized particle     "El Soufi and See (2019)"        -> two "Soufi"/"See"
 *                              "(Kurer and Van Staalduinen 2022)" -> (undetected)
 *   - hyphen-cap compound      "Rhodes-Purdy et al. (2021)"     -> et al. "Purdy"
 *
 * Each mis-key produced a spurious `extra_pred` (wrong first author) AND left the
 * gold citation in `unmatched_gold` — it matched neither the gold nor its
 * reference. The fix captures the FULL surname (so authors[0] is the real first
 * author) via three additions to a single shared surname fragment: a hyphen-cap
 * compound group, an optional capitalized leading particle, and a double-surname
 * trailing capitalized token.
 *
 * Text snippets are verbatim from the docpluck-academic extraction of bjps_1
 * (DOI 10.1017/S0007123424000024). El Soufi's "(2019)" sits on the next line in
 * the source, so the snippet keeps the CRLF the extractor emitted.
 */

import { describe, it, expect } from '@jest/globals';
import { detectHarvardCitations } from '../src/harvardCitationDetector.js';

const find = (text: string, firstAuthor: string, year: string) =>
  detectHarvardCitations(text).find(
    c => c.authors[0].raw === firstAuthor && c.year === year,
  );

describe('Harvard in-text surname left-boundary (full multi-token surname)', () => {
  describe('cap-cap double surname (second author)', () => {
    it('keys "Barros and Santos Silva (2019)" on Barros, not Silva', () => {
      const text = 'while Barros and Santos Silva (2019) show that malesp';
      const c = find(text, 'Barros', '2019');
      expect(c).toBeDefined();
      expect(c!.citationStyle).toBe('narrative');
      expect(c!.type).toBe('two_authors');
      expect(c!.authors[1].raw).toBe('Santos Silva');
    });

    it('does NOT also emit a spurious single "Silva" (exactly one 2019 citation)', () => {
      const text = 'while Barros and Santos Silva (2019) show that malesp';
      const all = detectHarvardCitations(text).filter(c => c.year === '2019');
      expect(all).toHaveLength(1);
      expect(all[0].authors[0].raw).toBe('Barros');
    });
  });

  describe('capitalized leading particle (first author)', () => {
    it('keys "El Soufi and See (2019)" on El Soufi, not Soufi', () => {
      // "(2019)" is on the next source line — keep the CRLF the extractor emitted.
      const text = 'search string from El Soufi and See\r\n(2019). We';
      const c = find(text, 'El Soufi', '2019');
      expect(c).toBeDefined();
      expect(c!.type).toBe('two_authors');
      expect(c!.authors[1].raw).toBe('See');
    });

    it('keys parenthetical "(Kurer and Van Staalduinen 2022)" on Kurer', () => {
      const text = 'status discordance13 (Kurer and Van Staalduinen 2022) appear to';
      const c = find(text, 'Kurer', '2022');
      expect(c).toBeDefined();
      expect(c!.citationStyle).toBe('parenthetical');
      expect(c!.type).toBe('two_authors');
      expect(c!.authors[1].raw).toBe('Van Staalduinen');
    });
  });

  describe('hyphen-cap compound surname (first author)', () => {
    it('keys "Rhodes-Purdy et al. (2021)" on Rhodes-Purdy, not Purdy', () => {
      const text = 'experiment, Rhodes-Purdy et al. (2021) show that econom';
      const c = find(text, 'Rhodes-Purdy', '2021');
      expect(c).toBeDefined();
      expect(c!.type).toBe('et_al');
    });
  });

  describe('regression guard — ordinary two-author narrative still keys on first author', () => {
    it('keeps "Smith and Jones (2020)" as two_authors [Smith, Jones]', () => {
      const text = 'As Smith and Jones (2020) argue, the';
      const c = find(text, 'Smith', '2020');
      expect(c).toBeDefined();
      expect(c!.type).toBe('two_authors');
      expect(c!.authors[1].raw).toBe('Jones');
      // and no spurious single "Jones"
      expect(detectHarvardCitations(text).filter(x => x.year === '2020')).toHaveLength(1);
    });
  });
});
