import { describe, it, expect } from '@jest/globals';
import { parseReferences, splitConcatenatedHarvardReferences } from '../src/referenceParser';

/**
 * Regression guard for Harvard run-on reference parsing.
 *
 * docpluck's academic normalization flows the WHOLE Harvard reference section into
 * one paragraph (it keeps per-entry newlines for APA, but joins Harvard's tighter
 * line spacing). On bjps_1 ("The Populist Backlash Against Globalization",
 * British Journal of Political Science, DOI 10.1017/S0007123424000024) citelink
 * parsed 9 of 109 references (refs.f1 0.051) before the fix and 109/109 (refs.f1
 * 0.972) after. The text below is the verbatim docpluck-academic extraction of a
 * contiguous slice of that reference section — all entries on one line, exactly as
 * the production worker feeds citelink. (citationguard-iterate 2026-06-12.)
 */
const BJPS_RUNON_SECTION =
  'References\n' +
  'Adler D and Ansell B (2020) Housing and populism. West European Politics 43, 344-65. ' +
  'Ahlquist J et al. (2020) The political consequences of external economic shocks: Evidence from Poland. American Journal of Political Science 64, 904-20. ' +
  'Algan Y et al. (2017) The European trust crisis and the rise of populism. Brookings Papers on Economic Activity 2017, 309-400. ' +
  'Amengay A and Stockemer D (2019) The radical right in Western Europe: a meta-analysis of structural factors. Political Studies Review 17, 30-40. ' +
  'Autor DH et al. (2020) Importing political polarization? The Electoral Consequences of Rising Trade Exposure. American Economic Review 110, 3139-83. ' +
  'Barr RR (2009) Populists, outsiders and anti-establishment politics. Party Politics 15, 29-48. ' +
  'Barros L and Santos Silva M (2019) #EleNao: Economic Crisis, the Political Gender Gap, and the Election of Bolsonaro. World Development 145, 105496. ' +
  'Betz H-G (1993) The new politics of resentment: Radical right-wing populist parties in Western Europe. Comparative Politics 25, 413-27. ' +
  'Caselli M et al. (2020) Globalization and electoral outcomes: Evidence from Italy. Economics and Politics 32, 68-103. ' +
  'Caselli M et al. (2021) Globalization, Robotization, and electoral outcomes: Evidence from spatial regressions for Italy. Journal of Regional Science 61, 86-111. ' +
  'Jin Z-C et al. (2015) Statistical methods for dealing with publication bias in meta-analysis. Statistics in Medicine 34, 343-60.';

describe('Harvard run-on reference parsing (bjps_1)', () => {
  const refs = parseReferences(BJPS_RUNON_SECTION, 'harvard');

  it('recovers all 11 references from the one-line run-on section', () => {
    // Before the fix this returned ~2-3 mega-references.
    expect(refs.length).toBeGreaterThanOrEqual(11);
  });

  const firstAuthor = (surname: string) =>
    refs.find(r => r.authors[0]?.lastName === surname);

  it('parses "Surname Initials et al." with the surname as first author (not the whole string)', () => {
    // Pre-fix: lastName was "Algan Y et al." and never matched.
    const algan = firstAuthor('Algan');
    expect(algan).toBeDefined();
    expect(algan!.year).toBe('2017');
    expect(refs.some(r => r.authors[0]?.lastName === 'Autor' && r.year === '2020')).toBe(true);
  });

  it('parses hyphenated initials (Betz H-G, Jin Z-C) without folding them into the surname', () => {
    const betz = firstAuthor('Betz');
    expect(betz).toBeDefined();
    expect(betz!.year).toBe('1993');
    const jin = firstAuthor('Jin');
    expect(jin).toBeDefined();
    expect(jin!.year).toBe('2015');
  });

  it('splits a two-author entry with a multi-word second surname (Barros L and Santos Silva M)', () => {
    const barros = firstAuthor('Barros');
    expect(barros).toBeDefined();
    expect(barros!.year).toBe('2019');
  });

  it('keeps a multi-author entry intact rather than splitting at the second author', () => {
    // "Amengay A and Stockemer D (2019)" must be ONE reference keyed on Amengay,
    // never split into a phantom "Stockemer D (2019)".
    const amengay = firstAuthor('Amengay');
    expect(amengay).toBeDefined();
    expect(refs.some(r => r.authors[0]?.lastName === 'Stockemer')).toBe(false);
  });

  it('separates two same-author entries with different years (Caselli 2020 / 2021)', () => {
    const caselli = refs.filter(r => r.authors[0]?.lastName === 'Caselli');
    expect(caselli.map(r => r.year).sort()).toEqual(['2020', '2021']);
  });

  it('splits a boundary where the title starts with a non-letter (#EleNao)', () => {
    // The reference after Barros begins "#EleNao…"; the opener must still fire.
    const barros = firstAuthor('Barros');
    expect(barros!.title.startsWith('#')).toBe(true);
  });
});

describe('splitConcatenatedHarvardReferences guards', () => {
  it('does not split a clean single Harvard reference', () => {
    const one = 'Adler D and Ansell B (2020) Housing and populism. West European Politics 43, 344-65.';
    expect(splitConcatenatedHarvardReferences(one)).toEqual([one]);
  });

  it('does not orphan the first author of a two-author entry', () => {
    const two =
      'Amengay A and Stockemer D (2019) The radical right in Western Europe. Political Studies Review 17, 30-40. ' +
      'Betz H-G (1993) The new politics of resentment. Comparative Politics 25, 413-27.';
    const parts = splitConcatenatedHarvardReferences(two);
    expect(parts.length).toBe(2);
    expect(parts[0].startsWith('Amengay A and Stockemer D')).toBe(true);
    expect(parts[1].startsWith('Betz H-G')).toBe(true);
  });
});
