/**
 * Regression: Vancouver / IEEE "X and Y" author connector + year-range
 * validation in parseVancouverReference.
 *
 * citationguard-iterate cycle 3 — on ieee_access_2 (style detected as
 * vancouver), strict refF1 was stuck at 0.676 with five gold refs
 * unrecoverable. Two distinct defect classes, both in parseVancouverReference:
 *
 * 1. Two-author refs connected by "and" with no comma (e.g.
 *    "Pommereau F and Gaucherel C, ...") split only on commas, so the entire
 *    "X Initials and Y Initials" became a single author's lastName.
 *
 * 2. Year extraction picked any 4-digit number after a period, with no
 *    range validation. IEEE-style article IDs ("no. 2233"), page numbers
 *    ("p. 8400"), and arXiv suffix digits ("arXiv:1209.3632") were chosen
 *    as the year instead of the real publication year.
 *
 * Each test wraps the real ref in a section anchored by a filler [1] ref to
 * pass the references-section-detection heuristics; assertions target the
 * specific ref by first-author surname.
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

const REF_PREFIX = `Body of the paper goes here. Some more text to give the section detector enough document to anchor against. Even more body text [1].

References
[1]. Filler A, Other B, "Filler reference to anchor the references section," J. Filler, vol. 1, no. 1, p. 1, Jan. 2020.
`;

const findBy = (refs: any[], surname: string) =>
  refs.find(r => (r.firstAuthorLastName || '').toLowerCase().startsWith(surname.toLowerCase()));

describe('Vancouver: two-author "X Initials and Y Initials" connector', () => {
  it('splits "Pommereau F and Gaucherel C" into two distinct authors', () => {
    const text = REF_PREFIX + `[2]. Pommereau F and Gaucherel C, "A multivalued, spatialized, and timed modelling language for social-ecological systems," in Proc. Int. Workshop Petri Nets Softw. Eng. (PNSE), Geneva, Switzerland, Jun. 2024, pp. 13–32.`;
    const refs = parseReferences(text, 'vancouver');
    const ref = findBy(refs, 'Pommereau');
    expect(ref).toBeDefined();
    expect(ref.authors.map((a: any) => a.lastName)).toEqual(['Pommereau', 'Gaucherel']);
    expect(ref.year).toBe('2024');
  });

  it('splits "Kermack WO and McKendrick AG" — CamelCase second surname', () => {
    const text = REF_PREFIX + `[2]. Kermack WO and McKendrick AG, "A contribution to the mathematical theory of epidemics," Proc. Roy. Soc. london. Ser. A, vol. 115, no. 772, pp. 700–721, 1927.`;
    const refs = parseReferences(text, 'vancouver');
    const ref = findBy(refs, 'Kermack');
    expect(ref).toBeDefined();
    expect(ref.authors.map((a: any) => a.lastName)).toEqual(['Kermack', 'McKendrick']);
    expect(ref.year).toBe('1927');
  });

  it('still handles the Oxford-comma form "..., X, and Y"', () => {
    const text = REF_PREFIX + `[2]. Connolly S, Gilbert D, and Heiner M, "From epidemic to pandemic modelling," Frontiers Syst. Biol, vol. 2, Jul. 2022, Art. no. 861562.`;
    const refs = parseReferences(text, 'vancouver');
    const ref = findBy(refs, 'Connolly');
    expect(ref).toBeDefined();
    expect(ref.authors.map((a: any) => a.lastName)).toEqual(['Connolly', 'Gilbert', 'Heiner']);
    expect(ref.year).toBe('2022');
  });
});

describe('Vancouver: year extraction must reject implausible year-shaped numbers', () => {
  it('picks 2022 (the real year) over 2233 (an article number) for Libkind 2022', () => {
    const text = REF_PREFIX + `[2]. Libkind S, Baas A, Halter M, Patterson E, and Fairbanks JP, "An algebraic framework for structured epidemic modelling," Phil. Trans. Roy. Soc. A: Math., Phys. Eng. Sci, vol. 380, no. 2233, Oct. 2022, Art. no. 20210309.`;
    const refs = parseReferences(text, 'vancouver');
    const ref = findBy(refs, 'Libkind');
    expect(ref).toBeDefined();
    expect(ref.year).toBe('2022');
  });

  it('picks 2021 over the page number 8400 for Peng 2021', () => {
    const text = REF_PREFIX + `[2]. Peng L, Xie P, Tang Z, and Liu F, "Modeling and analyzing transmission of infectious diseases using generalized stochastic Petri nets," Appl. Sci, vol. 11, no. 18, p. 8400, Sep. 2021.`;
    const refs = parseReferences(text, 'vancouver');
    const ref = findBy(refs, 'Peng');
    expect(ref).toBeDefined();
    expect(ref.year).toBe('2021');
  });

  it('picks 2012 over the arXiv suffix 3632 for Baez 2012', () => {
    const text = REF_PREFIX + `[2]. Baez JC and Biamonte J, "Quantum techniques for stochastic mechanics," 2012, arXiv:1209.3632.`;
    const refs = parseReferences(text, 'vancouver');
    const ref = findBy(refs, 'Baez');
    expect(ref).toBeDefined();
    expect(ref.year).toBe('2012');
    expect(ref.authors.map((a: any) => a.lastName)).toEqual(['Baez', 'Biamonte']);
  });
});
