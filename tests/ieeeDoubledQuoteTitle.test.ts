/**
 * IEEE references whose title is quoted with doubled single quotes (`''Title,''`) keep their
 * authors.
 *
 * IEEE prints the title in curly double quotes. docpluck's text layer renders them as two
 * straight single quotes, `''`, not `"`. `parseIEEEReference` found the author/title boundary
 * only on `"`, so every such entry fell to the no-quoted-title branch. Entries with an "and"
 * between ordinary surnames survived there by accident; a single author ("J. Chodak, ''Spike..."),
 * or a CamelCase second surname ("W. O. Kermack and A. G. McKendrick, ''A contribution...")
 * parsed with NO author: 6 of the 36 references of the published ieee_access_2 paper
 * (Chodak, Kermack, Davidrajuh, Gillespie, Rohr, Segovia; gold 2026-09-25), which then could not
 * be matched to their in-text citations.
 *
 * The rule: `''`, `“”` and `‘‘’’` delimit the title exactly as `"` does.
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

const LIST = [
  '[1] W. Yang, S. Connolly, and P. Smith, \'\'Petri net simulation at scale,\'\' IEEE Access, vol. 9, pp. 1-10, 2021.',
  '[2] J. Chodak, \'\'Spike--A tool for reproducible simulation experiments,\'\' Ph.D. dissertation, Dept. Comput. Sci., BTU Cottbus-Senftenberg, Senftenberg, Germany, 2021.',
  '[3] W. O. Kermack and A. G. McKendrick, \'\'A contribution to the mathematical theory of epidemics,\'\' Proc. Roy. Soc. london. Ser. A, vol. 115, no. 772, pp. 700-721, 1927.',
  '[4] D. T. Gillespie, \'\'Exact stochastic simulation of coupled chemical reactions,\'\' J. Phys. Chem., vol. 81, no. 25, pp. 2340-2361, Dec. 1977.',
  '[5] C. Segovia, \'\'Petri nets in epidemiology,\'\' 2022, arXiv:2206.03269.',
  '[6] C. Rohr, “Discrete-time leap method for stochastic simulation,” Fundamenta Informaticae, vol. 160, nos. 1-2, pp. 181-198, Apr. 2018.',
];

function parse() {
  const text = `Body text cites [1]-[6].\n\nREFERENCES\n${LIST.join('\n')}\n`;
  return parseReferences(text, 'ieee');
}

describe("IEEE titles quoted with '' keep their authors", () => {
  it('parses all six entries (vacuity check)', () => {
    expect(parse()).toHaveLength(6);
  });

  it.each([
    [2, 'Chodak', 1, 'Spike--A tool for reproducible simulation experiments'],
    [3, 'Kermack', 2, 'A contribution to the mathematical theory of epidemics'],
    [4, 'Gillespie', 1, 'Exact stochastic simulation of coupled chemical reactions'],
    [5, 'Segovia', 1, 'Petri nets in epidemiology'],
    [6, 'Rohr', 1, 'Discrete-time leap method for stochastic simulation'],
  ])('entry [%i]: first author %s, %i author(s), title from inside the quotes', (n, first, count, title) => {
    const ref = parse().find((r) => r.listNumber === n);
    expect(ref).toBeDefined();
    expect(ref!.firstAuthorLastName).toBe(first);
    expect(ref!.authorCount).toBe(count);
    expect(ref!.title).toContain(title);
    expect(ref!.title).not.toMatch(/''|“|”/);
  });

  it('the comma IEEE prints inside the closing quote is not part of the title', () => {
    // `''Petri nets in epidemiology,''` - the comma is the list separator, set inside the
    // quotes by IEEE convention. A "?" or "!" there IS the title's own, and stays.
    for (const ref of parse()) expect(ref.title).not.toMatch(/[,;]$/);
    const q = parseReferences(
      'Body [1].\n\nREFERENCES\n[1] A. Smith, \'\'Is it real?\'\' IEEE Access, vol. 1, pp. 1-2, 2020.\n',
      'ieee',
    )[0];
    expect(q.title).toBe('Is it real?');
  });

  it('a CamelCase co-author is kept as the second author', () => {
    const ref = parse().find((r) => r.listNumber === 3);
    expect(ref!.secondAuthorLastName).toBe('McKendrick');
  });

  it('the multi-author entry that already parsed is unchanged in its authors', () => {
    const ref = parse().find((r) => r.listNumber === 1);
    expect(ref!.allAuthorLastNames).toEqual(['Yang', 'Connolly', 'Smith']);
  });
});

describe('IEEE title quotes pair by kind (cross-model review 2026-10-09)', () => {
  const titleOf = (entry: string) => parseReferences(`Body [1].\n\nREFERENCES\n[1] ${entry}\n`, 'ieee')[0].title;

  it("a '' title is not closed by a later straight quote in the venue", () => {
    expect(titleOf("J. Doe, ''Deep nets for vision,'' in Proc. \"ICML\", 2019, pp. 1-9.")).toBe('Deep nets for vision');
  });

  it("a ''-quoted title keeps an inner straight quote (an inch mark)", () => {
    expect(titleOf("A. Smith, ''The 5\" display for VR,'' IEEE Trans., vol. 2, pp. 3-4, 2020.")).toBe('The 5" display for VR');
  });
  // Not covered: curly quotes are folded to straight `"` before IEEE parsing (referenceParser.ts
  // smart-quote normalisation), so an inner `"` inside a curly-quoted title stays ambiguous.)
});
