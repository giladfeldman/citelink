import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';

/**
 * Regression: a TWO-author NARRATIVE citation joined by "&" — "Wang & Benbasat
 * (2007)", "Möhlmann & Zalmanson (2017)" — was mis-keyed to the SECOND author
 * ("Benbasat", "Zalmanson") instead of the first, because `twoAuthorNarrative`
 * hard-coded the literal connector "and" and only the "and" form matched. The
 * "&" narrative fell through to `singleNarrative`, which caught the trailing
 * "<LastAuthor> (year)". The parenthetical patterns already accepted "&"; the
 * narrative one did not. (the platform's hardening workflow cycle 9, 2026-07-02 — surfaced
 * on annals_1, Glikson & Woolley "Human Trust in AI", which uses "&" narratively
 * throughout: Wang & Benbasat, Komiak & Benbasat, Möhlmann & Zalmanson, ….)
 *
 * Fix: the connector in `twoAuthorNarrative` (and the sibling narrative patterns
 * `multiAuthorAndNarrative`, `twoAuthorParentheticalHarvardNoComma`,
 * `possessiveTwoAuthor`, `sameAuthorMultiYearNarrative`) now accepts BOTH
 * "and" and "&". Text is clean (no docpluck glyph corruption) — a genuine
 * detection defect, not a text-extraction artifact.
 */
describe('two-author narrative with "&" keys the FIRST author', () => {
  const first = (text: string) => {
    const cites = detectCitations(text);
    return { n: cites.length, fa: cites[0]?.authors?.[0]?.normalized };
  };

  it('Wang & Benbasat (2007) → first-author "wang" (not "benbasat")', () => {
    const r = first('As Wang & Benbasat (2007) found, users trust recommendation agents.');
    expect(r.n).toBe(1);
    expect(r.fa).toBe('wang');
  });

  it('Möhlmann & Zalmanson (2017) → first-author "mohlmann"', () => {
    const r = first('Möhlmann & Zalmanson (2017) analyzed algorithmic management in gig work.');
    expect(r.n).toBe(1);
    expect(r.fa).toBe('mohlmann');
  });

  it('Komiak & Benbasat (2006) → first-author "komiak"', () => {
    const r = first('Komiak & Benbasat (2006) studied the effect of personalization on trust.');
    expect(r.n).toBe(1);
    expect(r.fa).toBe('komiak');
  });

  it('the "and" form still keys the first author (no regression)', () => {
    expect(first('Mumm and Mutlu (2011) showed proxemic effects.').fa).toBe('mumm');
    expect(first('Wang and Benbasat (2007) also holds.').fa).toBe('wang');
  });

  it('possessive two-author with "&": Wang & Benbasat’s (2007) → "wang"', () => {
    const r = first("Wang & Benbasat’s (2007) model of trust is influential.");
    expect(r.n).toBe(1);
    expect(r.fa).toBe('wang');
  });

  it('does not spuriously fire on a single-author narrative', () => {
    const r = first('Benbasat (2007) alone is a single-author citation.');
    expect(r.n).toBe(1);
    expect(r.fa).toBe('benbasat');
  });
});
