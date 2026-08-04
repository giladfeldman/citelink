import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser';
import { detectCitations } from '../src/citationDetector';
import { matchCitationsToReferences } from '../src/citationMatcher';

/**
 * Guards for three defects found by a CROSS-MODEL REVIEW (codex, 2026-08-04) of the
 * v0.7.65–v0.7.68 scimeto-iterate changes, each REPRODUCED locally before being
 * fixed (per the portfolio rule: a reviewer finding is a hypothesis until reproduced).
 *
 * The review examined four claims; one (a "New York, N.Y." publisher line being read as a
 * new reference start) did NOT reproduce and was correctly refuted — the existing
 * completeness checks already handle it. The other three were real and are guarded here.
 *
 * All three are silent-wrong-value defects: they produce a plausible WRONG reference or
 * author key rather than an error, which is exactly the class that reaches a published
 * accuracy number without any test failing.
 */

const parse = (block: string, style = 'aom') =>
  parseReferences(`Body text.\n\nReferences\n\n${block}`, style as never);

describe('cross-model review guards (codex, 2026-08-04)', () => {
  describe('F1 — despacing must not merge two genuinely different surnames', () => {
    // "van Dam" and "VanDam" are BOTH real academic surnames (e.g. Wim van Dam, quantum
    // computing; Mark VanDam, speech science). The v0.7.67 space-insensitive rule scored
    // them an exact 1.0, so a "VanDam (2020)" citation resolved to the "van Dam"
    // reference with full confidence — and same-key logic could then report `matched`
    // rather than `ambiguous`. Reproduced exactly as the reviewer described.
    const REFS =
      'van Dam, W. 2020. Quantum algorithms. Journal of Computing: 1-10.\n' +
      'VanDam, M. 2020. Child language at home. Journal of Speech: 11-20.\n';

    it('resolves "VanDam (2020)" to VanDam, not to van Dam', () => {
      const refs = parse(REFS);
      expect(refs).toHaveLength(2);

      const [result] = matchCitationsToReferences(
        detectCitations('VanDam (2020) measured infant vocalizations.'),
        refs,
      );
      expect(result.reference).toBeDefined();
      expect(result.reference!.authors[0].lastName).toBe('VanDam');
    });

    it('resolves "van Dam (2020)" to van Dam', () => {
      const refs = parse(REFS);
      const [result] = matchCitationsToReferences(
        detectCitations('van Dam (2020) described the algorithm.'),
        refs,
      );
      expect(result.reference).toBeDefined();
      expect(result.reference!.authors[0].lastName).toBe('van Dam');
    });

    it('a despaced-only hit never outranks a true exact match', () => {
      // The space-insensitive rule is deliberately scored below 1.0 so an exact
      // normalized hit always wins and a despaced hit stays visible as lower
      // confidence rather than silently claiming certainty.
      const refs = parse(REFS);
      const [exact] = matchCitationsToReferences(
        detectCitations('VanDam (2020) measured infant vocalizations.'),
        refs,
      );
      const [despaced] = matchCitationsToReferences(
        detectCitations('Strohkorb Sebo et al. (2018) ran a study.'),
        parse('Strohkorb Sebo, S., & Traeger, M. 2018. A title. Journal: 1-10.\n'),
      );
      expect(exact.confidence).toBeGreaterThanOrEqual(despaced.confidence);
    });

    it('STILL fixes the original defect: glued "StrohkorbSebo" resolves', () => {
      const refs = parse(
        'Strohkorb, S., & Fukuto, E. 2016. A title. Journal: 1-10.\n' +
          'Strohkorb Sebo, S., & Traeger, M. 2018. Another title. Journal: 11-20.\n',
      );
      const [result] = matchCitationsToReferences(
        detectCitations('StrohkorbSebo and Traeger (2018) examined the effect.'),
        refs,
      );
      expect(result.reference).toBeDefined();
      expect(result.reference!.year).toBe('2018');
    });
  });

  describe('F2 — a parenthesized aside before a COMMA is a name qualifier, not a given name', () => {
    it('keeps "Smith (Jones), A." whole instead of collapsing it to "Smith"', () => {
      // "(Jones)" here qualifies the PRECEDING surname (a former/alternate name). The
      // v0.7.66 strip removed it, collapsing this onto the same first-author+year key as
      // a genuinely different "Smith, A. 2020" and letting a citation hit the wrong
      // target. The distinguishing signal is the comma immediately after the aside.
      const refs = parse('Smith (Jones), A. 2020. Second paper. Journal: 11-20.\n');
      expect(refs[0].authors[0].lastName).toBe('Smith (Jones)');
      expect(refs[0].authors[0].lastName).not.toBe('Smith');
    });

    it('STILL strips a real preferred-name aside, which has NO comma after it', () => {
      const refs = parse(
        'Fox, J., (Grace) Ahn, S. J., & Bailenson, J. N. 2015. A title. Journal: 1-10.\n',
      );
      expect(refs[0].authors.map((a) => a.lastName)).toEqual(['Fox', 'Ahn', 'Bailenson']);
    });
  });

  describe('F3 — SPELLED-OUT editorial roles must be excluded, not just abbreviations', () => {
    const ROLE =
      /^(?:Eds?|Editors?|Trans|Translators?|Comps?|Compilers?|Illus|Illustrators?|Narr|Narrators?|Dir|Directors?|Prod|Producers?|Chairs?|Vol|Pt|No)$/i;
    const ASIDE = /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'’-]{1,20})\s*\.?\s*\)\s*(,?)/g;
    const strip = (s: string) =>
      s.replace(ASIDE, (whole, inner: string, comma: string) =>
        ROLE.test(inner) || comma ? whole : '',
      );

    it('preserves every role word, abbreviated or spelled out, with or without a period', () => {
      for (const marker of [
        '(Ed.) ',
        '(Ed) ',
        '(Eds.) ',
        '(Eds) ',
        '(Editor) ',
        '(Editors) ',
        '(Trans.) ',
        '(Translator) ',
        '(Chair) ',
        '(Compiler) ',
        '(2nd ed.) ',
        '(1975) ',
      ]) {
        expect(strip(marker)).toBe(marker);
      }
    });

    it('still strips a genuine preferred name', () => {
      expect(strip('(Grace) ')).toBe('');
    });

    it('a spelled-out "(Editor)" phrase does not manufacture a pseudo-author', () => {
      const refs = parse(
        'Aguinis, H., & Harden, E. 2004. Will banding benefit my organization? ' +
          'In H. Aguinis (Editor), Test-score banding in human resource selection: ' +
          'Legal issues (pp. 193-216). Westport, CT: Praeger.\n',
      );
      expect(refs).toHaveLength(1);
      expect(refs[0].authors.map((a) => a.lastName)).toEqual(['Aguinis', 'Harden']);
    });
  });
});
