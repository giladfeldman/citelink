import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';

/**
 * Regression: an explicit MULTI-AUTHOR NARRATIVE citation with a trailing YEAR LIST
 * — "de Melo, Marsella, & Gratch (2016, 2017)", "Smith, Jones, & Lee (2018, 2019,
 * 2020)" — emitted the right NUMBER of citations (one per year) but keyed BOTH/ALL
 * on the LAST author ("gratch", "lee") instead of the first ("de melo", "smith"),
 * so none matched its reference-list entry.
 *
 * Root cause: `sameAuthorMultiYearNarrative` captured a SINGLE leading surname in
 * group 1, so "de Melo, Marsella, & Gratch (…)" did not match at "de Melo" (the
 * ", Marsella, & …" tail was neither " et al." nor " and <Surname>") and instead
 * matched at the LAST author "Gratch". The `multiAuthorAndNarrative` pattern DOES
 * handle the "A, B, & C" list but captures only a SINGLE year, so it never fires on
 * the multi-year form.
 *
 * Fix (the platform's hardening workflow 2026-07-04): group 1 now admits a comma-separated
 * author list; the handler splits it and prepends it to the connector's last author,
 * keying on the FIRST author. A `stripLeadingNonNameWord` guard (same as
 * etAlNarrative) prevents a preceding sentence word being swallowed
 * ("As de Visser, …" → "de visser", not "as de visser"). This is the NARRATIVE
 * analog of the parenthetical `(A, B, & C, Y1, Y2)` fix (a distinct code path, hence
 * a distinct cycle per Hard Rule 8). Text is clean — a genuine detection defect.
 */
describe('multi-author narrative with a trailing year list keys the FIRST author', () => {
  const detect = (text: string) => {
    const cites = detectCitations(text);
    return {
      n: cites.length,
      keys: cites.map((c) => `${c.authors?.[0]?.normalized}|${c.year}`).sort(),
      firstAuthors: new Set(cites.map((c) => c.authors?.[0]?.normalized)),
      allAuthors: cites[0]?.authors?.map((a) => a.normalized),
    };
  };

  it('de Melo, Marsella, and Gratch (2016, 2017) → 2 citations keyed "de melo"', () => {
    const r = detect('Prior work de Melo, Marsella, and Gratch (2016, 2017) found effects.');
    expect(r.n).toBe(2);
    expect(r.keys).toEqual(['de melo|2016', 'de melo|2017']);
    expect(r.allAuthors).toEqual(['de melo', 'marsella', 'gratch']);
  });

  it('de Melo, Marsella, & Gratch (2016, 2017) (ampersand) → 2 citations keyed "de melo"', () => {
    const r = detect('de Melo, Marsella, & Gratch (2016, 2017) reported');
    expect(r.n).toBe(2);
    expect(r.firstAuthors).toEqual(new Set(['de melo']));
  });

  it('Smith, Jones, & Lee (2018, 2019, 2020) → 3 citations keyed "smith"', () => {
    const r = detect('Smith, Jones, & Lee (2018, 2019, 2020) reported three studies.');
    expect(r.n).toBe(3);
    expect(r.keys).toEqual(['smith|2018', 'smith|2019', 'smith|2020']);
  });

  // ── Sentence-connector / lead-in guard (cycle-9 particle lesson): a preposition
  //    or connector immediately before a particle first author must NOT be swallowed. ──
  it('"As de Visser, Marsella, & Gratch (2016, 2017)" → keyed "de visser" (lead-in "As" stripped)', () => {
    const r = detect('As de Visser, Marsella, & Gratch (2016, 2017) showed, trust decays.');
    expect(r.n).toBe(2);
    expect(r.firstAuthors).toEqual(new Set(['de visser']));
  });

  // ── Regression guards: the SINGLE / TWO-author / et-al narrative multi-year forms
  //    that already worked must be unchanged. ──
  it('single-author "Bishop (2019, 2020)" → 2 citations keyed "bishop"', () => {
    const r = detect('Bishop (2019, 2020) argued the point.');
    expect(r.n).toBe(2);
    expect(r.keys).toEqual(['bishop|2019', 'bishop|2020']);
  });

  it('two-author "Werth and Strack (2001, 2003)" → 2 citations keyed "werth"', () => {
    const r = detect('Werth and Strack (2001, 2003) found the effect.');
    expect(r.n).toBe(2);
    expect(r.firstAuthors).toEqual(new Set(['werth']));
  });

  it('et al. "McCullough et al. (1997, 1998)" → 2 citations keyed "mccullough"', () => {
    const r = detect('McCullough et al. (1997, 1998) reviewed the literature.');
    expect(r.n).toBe(2);
    expect(r.keys).toEqual(['mccullough|1997', 'mccullough|1998']);
  });

  it('"In their study, Feldman and Chan (2020, 2021)" → keyed "feldman" (not the connector)', () => {
    const r = detect('In their study, Feldman and Chan (2020, 2021) reported.');
    expect(r.n).toBe(2);
    expect(r.firstAuthors).toEqual(new Set(['feldman']));
  });
});
