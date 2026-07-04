import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser';

/**
 * Regression: a reference-list entry whose FIRST AUTHOR has a "Ben"/"Bin"/"Ibn"/
 * "Ter"/"Der" particle surname — "Ben Mimoun, M. S., Poncin, I., & Garnier, M.
 * 2012. …" — was dropped or mis-keyed, because FOUR hand-copied particle lists in
 * referenceParser.ts had drifted incomplete (they omitted "Ben"):
 *   1. the AOM/Harvard/APA concatenation splitters (REF_SPLIT_PARTICLE) — the entry
 *      was never split off the previous reference;
 *   2. `parseAuthorsFromSection`'s `particleAlt` — the author keyed on "Ben" alone;
 *   3. `parseBareYearReference`'s `capParticle` (the AOM path) — the has-comma test
 *      failed ("Ben"+space, not "Ben"+comma), so the no-comma parser read
 *      lastName="Ben" firstName="Mimoun".
 *
 * Effect: citelink parsed 0 (or mis-keyed) "Ben Mimoun" references, so the gold's
 * two Ben Mimoun entries never matched AND the 6+ in-text "Ben Mimoun et al."
 * citations went unmatched (cascade). Surfaced by the R-0177 Sonnet canary audit on
 * annals_1 (Glikson & Woolley, "Human Trust in AI"), scimeto-iterate 2026-07-04.
 *
 * Fix: one shared `REF_SPLIT_PARTICLE` constant + "Ben"/"Bin"/"Ibn"/"Ter" added to
 * `particleAlt` and `capParticle`, all kept in sync with COMPOUND_SURNAME. annals_1
 * refs.f1 0.980→0.983, matching 0.953→0.964, 0 regression on 12 other papers.
 */
describe('reference parser keeps a particle first-author surname whole', () => {
  const firstAuthors = (block: string, style?: any) =>
    parseReferences(block, style).map((r) => r.firstAuthorLastName);

  const BEN = `REFERENCES
Aron, A., & Aron, E. N. 1997. Self-expansion motivation and including other in the self. Handbook of personal relationships, 251-270.
Ben Mimoun, M. S., Poncin, I., & Garnier, M. 2012. Case study—Embodied virtual agents: An analysis on reasons for failure. Journal of Retailing and Consumer Services, 19(6): 605-612.
Ben Mimoun, M. S., Poncin, I., & Garnier, M. 2017. Animated conversational agents and e-consumer productivity. Information and Management, 54(5): 545-559.
Bickmore, T., & Cassell, J. 2001. Relational agents: A model and implementation of building user trust. Proceedings of the SIGCHI conference, 396-403.`;

  it('parses both "Ben Mimoun" entries with the full particle surname (AOM style)', () => {
    const fas = firstAuthors(BEN, 'aom');
    expect(fas).toContain('Ben Mimoun');
    expect(fas.filter((f) => f === 'Ben Mimoun').length).toBe(2);
    expect(fas.filter((f) => f === 'Ben').length).toBe(0); // never mis-keyed to "Ben"
  });

  it('parses "Ben Mimoun" identically across styles (aom / apa / auto-detected)', () => {
    for (const style of [undefined, 'aom', 'apa']) {
      const fas = firstAuthors(BEN, style);
      expect(fas.filter((f) => f === 'Ben Mimoun').length).toBe(2);
    }
  });

  it('does not drop the entry when entries are concatenated on the same line', () => {
    // Two references concatenated on ONE line under the heading (the docpluck
    // two-column artifact) — the AOM concatenation splitter must split off the
    // Ben Mimoun entry, not swallow it into the previous "Aron" reference.
    const concat = `REFERENCES
Aron, A., & Aron, E. N. 1997. Self-expansion motivation and including other in the self. Handbook of personal relationships, 251-270. Ben Mimoun, M. S., Poncin, I., & Garnier, M. 2012. Case study—Embodied virtual agents: An analysis on reasons for failure. Journal of Retailing and Consumer Services, 19(6): 605-612.
Bickmore, T., & Cassell, J. 2001. Relational agents: A model. Proceedings of the SIGCHI conference, 396-403.`;
    const fas = firstAuthors(concat, 'aom');
    expect(fas).toContain('Ben Mimoun');
    expect(fas).toContain('Aron');
  });

  it('handles other particle first authors (Al, Bin, Ibn) without mis-keying', () => {
    const block = `REFERENCES
Al Rashid, M., & Smith, J. 2020. A study of naming conventions in the region. Journal of Testing, 5(1): 1-10.
Bin Salman, K. 2019. Another study on identity and names. Journal of Names, 3(2): 20-30.
Smith, A. 2021. A control entry that should always parse cleanly. Test Journal, 2(1): 1-5.`;
    const fas = firstAuthors(block, 'aom');
    expect(fas).toContain('Al Rashid');
    expect(fas).toContain('Bin Salman');
    expect(fas).toContain('Smith');
  });

  it('keeps a DOUBLE particle surname whole ("Von Der Pütten", not "Von")', () => {
    // "Von Der Pütten" is two stacked particles; the AOM bare-year path's has-comma
    // detector must consume BOTH (the `capParticles` `*` repeat), else the no-comma
    // parser keys the author "Von". (annals_1: Von Der Pütten, A. M., Krämer, N. C., …)
    const block = `REFERENCES
Von Der Pütten, A. M., Krämer, N. C., Gratch, J., & Kang, S. H. 2010. It doesn't matter what you are. Computers in Human Behavior, 26(6): 1641-1650.
Smith, A. 2021. A control entry. Test Journal, 2(1): 1-5.`;
    const fas = firstAuthors(block, 'aom');
    expect(fas).toContain('Von Der Pütten');
    expect(fas.filter((f) => f === 'Von').length).toBe(0);
  });
});
