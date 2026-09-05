import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';

/**
 * Regression: a PARTICLE surname with "et al." was dropped when it appeared as a member of
 * a ';'-bundle (the platform's hardening workflow 2026-08-04, annals_1 — R-0177 Sonnet canary audit;
 * open finding #4 in the 2026-07-04 handoff, logged there as "de Visser 2016/2017 — 1 of 2
 * occurrences missed (occurrence-count)").
 *
 * annals_1 cites "de Visser et al., 2016" twice, in two different shapes:
 *
 *   line 611: "(de Visser et al., 2016; Pak, Fink, Price, Bass, & Sturre, 2012; …)"  <- bundle
 *   line 725: "trust and acceptance (e.g., de Visser et al., 2016)."                 <- standalone
 *
 * Only the standalone one was detected. The bundle-member "et al." matcher was built on
 * `SURNAME_LASTNAME` (a SINGLE surname word) while every sibling matcher in the same loop
 * used `COMPOUND_SURNAME` (particle-aware). "de Visser" therefore matched no bundle matcher
 * at all and the member was silently dropped.
 *
 * The standalone/bundle asymmetry is why this presented as an "occurrence count" discrepancy
 * rather than an obvious parse failure: the citation demonstrably worked elsewhere in the
 * same document, so the author looked supported.
 */

const authorsOf = (text: string) =>
  detectCitations(text).map((c) => ({
    key: c.authors.map((a) => a.raw).join('+'),
    year: c.year,
  }));

describe('particle surname + et al. as a ;-bundle member (annals_1 de Visser, R-0177)', () => {
  it('detects "de Visser et al., 2016" inside a bundle (verbatim annals_1 line 611)', () => {
    const found = authorsOf(
      'Research has shown this (de Visser et al., 2016; Pak, Fink, Price, Bass, & Sturre, ' +
        '2012; Qiu & Benbasat, 2009; Waytz et al., 2014).',
    );
    // Was 3 — the de Visser member was dropped entirely.
    expect(found).toHaveLength(4);
    expect(found[0]).toEqual({ key: 'de Visser+et al.', year: '2016' });
  });

  it('detects it across the line break docpluck introduces', () => {
    const found = authorsOf(
      'Research has shown this (de Visser et al., 2016; Pak, Fink, Price, Bass, & Sturre,\n2012).',
    );
    expect(found).toHaveLength(2);
    expect(found[0].key).toBe('de Visser+et al.');
  });

  it('detects it in any bundle position', () => {
    const found = authorsOf('Shown (Qiu & Benbasat, 2009; de Visser et al., 2016).');
    expect(found).toHaveLength(2);
    expect(found.map((f) => f.key)).toContain('de Visser+et al.');
  });

  it('generalizes to other particle surnames as bundle members', () => {
    for (const surname of ['van der Berg', 'Von Restorff', 'Ben Mimoun', 'Ap Cenydd']) {
      const found = authorsOf(`Shown (${surname} et al., 2016; Qiu & Benbasat, 2009).`);
      expect(found).toHaveLength(2);
      expect(found.map((f) => f.key)).toContain(`${surname}+et al.`);
    }
  });

  it('keeps BOTH occurrences when the bundle and standalone forms co-occur', () => {
    // The actual annals_1 situation: same citation, two shapes, one document.
    const found = authorsOf(
      'Shown (de Visser et al., 2016; Qiu & Benbasat, 2009). Later work on trust and ' +
        'acceptance (e.g., de Visser et al., 2016).',
    );
    const visser = found.filter((f) => f.key === 'de Visser+et al.');
    expect(visser).toHaveLength(2);
  });

  describe('NON-REGRESSION', () => {
    it('a plain single-word surname bundle member still works', () => {
      const found = authorsOf('Shown (Smith et al., 2016; Qiu & Benbasat, 2009).');
      expect(found).toHaveLength(2);
      expect(found[0].key).toBe('Smith+et al.');
    });

    it('the standalone (non-bundle) form is unchanged', () => {
      const found = authorsOf('trust and acceptance (e.g., de Visser et al., 2016).');
      expect(found).toHaveLength(1);
      expect(found[0]).toEqual({ key: 'de Visser+et al.', year: '2016' });
    });

    it('a sentence connector is not captured as a bundle author', () => {
      const found = authorsOf('Shown (Qiu & Benbasat, 2009; Waytz et al., 2014).');
      expect(found.map((f) => f.key)).toEqual(['Qiu+Benbasat', 'Waytz+et al.']);
    });
  });
});
