import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';

/**
 * Regression: an "et al." NARRATIVE citation whose first author has a multi-word
 * PARTICLE surname — "de Visser et al. (2017)", "Ben Mimoun et al. (2012)", "Von
 * Der Pütten et al. (2010)", "van der Berg et al. (2019)" — dropped the particle
 * and keyed the citation on the last name-part ("visser", "mimoun", "putten",
 * "berg"), so it never matched its reference-list entry. Root cause: the
 * `etAlNarrative` (and `sameAuthorMultiYearNarrative`) patterns used the plain
 * `SURNAME_LASTNAME` for the first author, which does not admit a leading
 * SURNAME_PARTICLE; the compound form `COMPOUND_SURNAME` (used elsewhere) does.
 *
 * Fix: the et-al narrative patterns now use `COMPOUND_SURNAME` for the first
 * author. Text is clean (no docpluck corruption) — a genuine detection defect.
 * (the platform's hardening workflow cycle 9, 2026-07-02 — surfaced on annals_1, Glikson &
 * Woolley "Human Trust in AI", which cites many particle-surname authors.)
 */
describe('et al. narrative captures a leading particle surname whole', () => {
  const first = (text: string) => {
    const cites = detectCitations(text);
    return { n: cites.length, fa: cites[0]?.authors?.[0]?.normalized };
  };

  it('de Visser et al. (2017) → "de visser" (not "visser")', () => {
    expect(first('As de Visser et al. (2017) reviewed, automation trust decays.').fa).toBe('de visser');
  });

  it('Ben Mimoun et al. (2012) → "ben mimoun" (not "mimoun")', () => {
    expect(first('Ben Mimoun et al. (2012) studied embodied virtual agents.').fa).toBe('ben mimoun');
  });

  it('Von Der Pütten et al. (2010) → "von der putten" (not "putten")', () => {
    expect(first('Von Der Pütten et al. (2010) examined agent appearance.').fa).toBe('von der putten');
  });

  it('van der Berg et al. (2019) → "van der berg"', () => {
    expect(first('van der Berg et al. (2019) is a two-particle Dutch surname.').fa).toBe('van der berg');
  });

  it('a plain surname et al. still keys correctly (no regression)', () => {
    expect(first('Smith et al. (2020) is a control.').fa).toBe('smith');
  });

  it('particle surname in a multi-year et al. narrative also keys whole', () => {
    // sameAuthorMultiYearNarrative path — emits one citation per year.
    const cites = detectCitations('de Melo et al. (2016, 2017) modelled emotion.');
    expect(cites.length).toBeGreaterThanOrEqual(1);
    expect(cites.every((c) => c.authors?.[0]?.normalized === 'de melo')).toBe(true);
  });
});
