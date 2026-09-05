import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser';
import { matchCitationsToReferences } from '../src/citationMatcher';
import { detectCitations } from '../src/citationDetector';

/**
 * Regression: a PARTICLE-LESS two-word surname ("Strohkorb Sebo", "Ross Russell") broke
 * reference-entry splitting, author parsing, and matching (the platform's hardening workflow
 * 2026-08-04, annals_1 — R-0177 Sonnet canary audit; open finding #3 in the 2026-07-04
 * handoff, reported there as "Strohkorb Sebo (2018) matched to the wrong same-surname
 * reference 'Sebo'").
 *
 * annals_1 contains TWO genuinely different authors whose surnames share a prefix:
 *
 *   Strohkorb, S., Fukuto, E., … 2016.        <- one author
 *   Strohkorb Sebo, S., Traeger, M., … 2018.  <- a DIFFERENT author
 *
 * THREE stacked defects, each of which had to be fixed for the citation to resolve:
 *
 *  1. ENTRY SPLITTING (`newRefLinePattern`) — the new-reference-line detector matches
 *     `particlePrefix + Surname + ", I."`. "Strohkorb" is not a known particle, so the
 *     pattern could not match at position 0 and the line was NOT recognized as a new
 *     reference. It was joined onto the previous entry: the 2016 reference absorbed a
 *     trailing bare word "Strohkorb", and the 2018 reference began at "Sebo, S., …".
 *     That is the "wrong same-surname reference 'Sebo'" the audit saw — the reference
 *     really was keyed on "Sebo", because the entry boundary was in the wrong place.
 *
 *  2. AUTHOR-PARSER ROUTING (`hasNoCommaFullNames`) — with two ordinary capitalized
 *     words and no particle, the bare-year parser routed to the no-comma ASA parser,
 *     which takes words[0] as the surname. That yielded lastName "Strohkorb",
 *     firstName "Sebo", and then emitted every following INITIAL as its own author
 *     ("Strohkorb", "S.", "Traeger", "M.", …).
 *
 *  3. MATCHING (`fuzzyNameMatch`) — docpluck extracts the in-text citation with the
 *     space lost ("StrohkorbSebo"), which never compared equal to "Strohkorb Sebo".
 *     Critically, the pre-existing containment rule scores "strohkorb" inside
 *     "strohkorb sebo" at 0.95, so the glued citation could resolve to the WRONG 2016
 *     reference. The space-insensitive exact check must run BEFORE containment.
 *
 * Corpus effect on annals_1: references F1 0.9944 -> 1.0000, matching 0.9791 -> 0.9819.
 */

const REF_BLOCK =
  'Strohkorb, S., Fukuto, E., Warren, N., Taylor, C., Berry, B., & Scassellati, B. 2016. ' +
  'Improving human-human collaboration between children with a social robot. ' +
  '25th IEEE International Symposium on Robot and Human Interactive Communication: 551-556.\n' +
  'Strohkorb Sebo, S., Traeger, M., Jung, M., & Scassellati, B. 2018. ' +
  "The Ripple effects of vulnerability: The effects of a robot's vulnerable behavior on " +
  'trust in humanrobot teams. ACM/IEEE International Conference on Human-Robot Interaction: 178-186.\n';

const parse = (block: string) => parseReferences(`Body text.\n\nReferences\n\n${block}`, 'aom');

describe('particle-less compound surname (annals_1 Strohkorb Sebo, R-0177)', () => {
  describe('entry splitting + author parsing', () => {
    it('splits the two references at the right boundary', () => {
      const refs = parse(REF_BLOCK);
      expect(refs).toHaveLength(2);
      // The 2016 entry must NOT have absorbed a trailing "Strohkorb" from the next line.
      expect(refs[0].raw).not.toMatch(/Strohkorb\s*$/);
    });

    it('keeps "Strohkorb Sebo" whole and does not emit initials as authors', () => {
      const refs = parse(REF_BLOCK);
      const r2018 = refs.find((r) => r.year === '2018');
      expect(r2018).toBeDefined();
      expect(r2018!.authors.map((a) => a.lastName)).toEqual([
        'Strohkorb Sebo',
        'Traeger',
        'Jung',
        'Scassellati',
      ]);
    });

    it('keeps the two same-prefix authors distinct', () => {
      const refs = parse(REF_BLOCK);
      const k = (y: string) =>
        refs.find((r) => r.year === y)!.authors[0].lastNameNormalized;
      expect(k('2016')).toBe('strohkorb');
      expect(k('2018')).toBe('strohkorb sebo');
      expect(k('2016')).not.toBe(k('2018'));
    });

    it('generalizes to any particle-less compound surname', () => {
      const refs = parse('Ross Russell, S., Traeger, M., & Jung, M. 2018. A title. Journal: 1-10.\n');
      expect(refs[0].authors.map((a) => a.lastName)).toEqual(['Ross Russell', 'Traeger', 'Jung']);
    });
  });

  describe('matching the space-lost in-text form', () => {
    it('resolves the glued "StrohkorbSebo" citation to the 2018 reference, NOT the 2016 one', () => {
      const refs = parse(REF_BLOCK);
      const citations = detectCitations(
        'StrohkorbSebo, Traeger, Jung, and Scassellati (2018) examined the effect.',
      );
      expect(citations).toHaveLength(1);

      const [result] = matchCitationsToReferences(citations, refs);
      expect(result.reference).toBeDefined();
      expect(result.reference!.year).toBe('2018');
      expect(result.reference!.authors[0].lastName).toBe('Strohkorb Sebo');
    });

    it('still resolves the plain "Strohkorb et al. (2016)" citation to the 2016 reference', () => {
      const refs = parse(REF_BLOCK);
      const citations = detectCitations('Strohkorb et al. (2016) examined the effect.');
      const [result] = matchCitationsToReferences(citations, refs);
      expect(result.reference).toBeDefined();
      expect(result.reference!.year).toBe('2016');
    });
  });

  describe('NON-REGRESSION', () => {
    it('a particle compound surname still parses (Van Iddekinge, Ben Mimoun)', () => {
      for (const [line, expected] of [
        ['Van Iddekinge, C. H., & Smith, J. 2011. A title. Journal: 1-10.\n', 'Van Iddekinge'],
        ['Ben Mimoun, M. S., & Poncin, I. 2012. A title. Journal: 1-10.\n', 'Ben Mimoun'],
      ] as const) {
        expect(parse(line)[0].authors[0].lastName).toBe(expected);
      }
    });

    it('a single-word surname is unaffected', () => {
      const refs = parse('Sebo, S., Traeger, M., & Jung, M. 2018. A title. Journal: 1-10.\n');
      expect(refs[0].authors.map((a) => a.lastName)).toEqual(['Sebo', 'Traeger', 'Jung']);
    });

    it('the space-insensitive rule does not merge two genuinely different surnames', () => {
      const refs = parse(REF_BLOCK);
      const citations = detectCitations('Sebo et al. (2018) examined the effect.');
      const [result] = matchCitationsToReferences(citations, refs);
      // "sebo" != "strohkorbsebo" despaced, so this may match loosely or not at all —
      // but it must never be scored an EXACT (1.0) hit on the compound surname.
      if (result.reference) {
        expect(result.confidence ?? 1).toBeLessThan(1);
      }
    });
  });
});
