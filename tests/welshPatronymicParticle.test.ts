import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';
import { parseReferences } from '../src/referenceParser';

/**
 * Regression: the Welsh patronymic particle "Ap" ("son of") was missing from the citation
 * detector's SURNAME_PARTICLE whitelist (the platform's hardening workflow 2026-08-04, annals_1 —
 * R-0177 Sonnet canary audit, logged as an open finding in the 2026-07-04 handoff).
 *
 * annals_1 cites, verbatim inside a ';'-bundle:
 *   "(Headleand, Jackson, Williams, Priday, Teahan, & Ap Cenydd, 2016; Ho & MacDorman, 2010)"
 *
 * Because "Ap" was not a known particle, COMPOUND_SURNAME could not span "Ap Cenydd", so the
 * multi-author capture anchored on the bare trailing token "Cenydd" and DROPPED the five
 * preceding authors — the detected citation carried a single author "Cenydd". It therefore
 * never matched its reference and surfaced as INTEXT-DETECTION-MISS in the gate.
 *
 * The asymmetry is the point: the REFERENCE parser was always correct here, because it reads
 * "…, & Ap Cenydd, L. 2016." positionally from the `Lastname, Initials` shape rather than via
 * the particle regex. Only the citation side was blind, so the two sides disagreed on the
 * author key and matching failed. The handoff had hypothesized a "6-author chained
 * parenthetical" limit; that was wrong — a 6-author citation with no particle parses fine
 * (asserted below as the control).
 *
 * Fix (citationDetector, SURNAME_PARTICLE): admit "[Aa]p" and "[Aa]b".
 */

const HEADLEAND_CITATION =
  'Prior work has explored this (Headleand, Jackson, Williams, Priday, Teahan, & Ap Cenydd, 2016).';

const HEADLEAND_REFERENCE =
  'Headleand, C. J., Jackson, J., Williams, B., Priday, L., Teahan, W. J., & Ap Cenydd, L. 2016. ' +
  'How the perceived identity of a NPC companion influences player behavior. ' +
  'Lecture Notes in Computer Science, 9590: 88-107.';

describe('Welsh patronymic particle "Ap" (annals_1, R-0177)', () => {
  it('keeps "Ap Cenydd" whole and retains ALL six authors', () => {
    const citations = detectCitations(HEADLEAND_CITATION);

    expect(citations).toHaveLength(1);
    const authors = citations[0].authors.map((a) => a.raw);

    // Without the fix this is ['Cenydd'] — five authors silently dropped.
    expect(authors).toEqual([
      'Headleand',
      'Jackson',
      'Williams',
      'Priday',
      'Teahan',
      'Ap Cenydd',
    ]);
    expect(citations[0].year).toBe('2016');
  });

  it('keys the citation on the FIRST author, not the trailing particle surname', () => {
    const [citation] = detectCitations(HEADLEAND_CITATION);
    expect(citation.authors[0].normalized).toBe('headleand');
  });

  it('detects the citation inside a ;-bundle, as annals_1 prints it', () => {
    const bundle =
      'Several studies agree (Headleand, Jackson, Williams, Priday, Teahan, & Ap Cenydd, 2016; ' +
      'Ho & MacDorman, 2010).';
    const citations = detectCitations(bundle);

    expect(citations).toHaveLength(2);
    expect(citations[0].authors[0].normalized).toBe('headleand');
    expect(citations[0].authors.map((a) => a.raw)).toContain('Ap Cenydd');
    expect(citations[1].authors[0].normalized).toBe('ho');
  });

  it('agrees with the reference parser on the author key (the matching contract)', () => {
    const [citation] = detectCitations(HEADLEAND_CITATION);
    const [reference] = parseReferences(
      'Body text.\n\nReferences\n\n' + HEADLEAND_REFERENCE,
      'apa',
    );

    // The reference side was never broken; this asserts the two sides now agree, which is
    // what makes the citation resolvable.
    const refLast = reference.authors.map((a) => a.lastName ?? '');
    expect(refLast).toContain('Ap Cenydd');
    expect(citation.authors.map((a) => a.raw)).toContain('Ap Cenydd');
  });

  it('also admits the lowercase "ap" and the "Ab" variant', () => {
    expect(
      detectCitations('As shown (Morgan, Lloyd, & ap Rhys, 2019).')[0].authors.map((a) => a.raw),
    ).toContain('ap Rhys');
    expect(
      detectCitations('As shown (Morgan, Lloyd, & Ab Owen, 2019).')[0].authors.map((a) => a.raw),
    ).toContain('Ab Owen');
  });

  it('CONTROL: a six-author citation with no particle was never broken', () => {
    // Guards against re-diagnosing this as an author-count limit, as the handoff did.
    const control = detectCitations(
      'Prior work has explored this (Headleand, Jackson, Williams, Priday, Teahan, & Cenydd, 2016).',
    );
    expect(control).toHaveLength(1);
    expect(control[0].authors).toHaveLength(6);
  });

  it('NON-REGRESSION: an ordinary sentence word before a surname is not eaten as a particle', () => {
    // "Ap"/"Ab" are short; make sure they did not open a hole for prose capture.
    const citations = detectCitations('This was later replicated by Smith (2020).');
    expect(citations).toHaveLength(1);
    expect(citations[0].authors.map((a) => a.raw)).toEqual(['Smith']);
  });
});
