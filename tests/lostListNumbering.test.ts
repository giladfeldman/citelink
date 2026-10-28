/**
 * A two-column numbered reference list whose numbers text extraction printed as their own
 * column ("9. 10. 11. ... 39.") with the entries unnumbered. The entries' POSITION used to stand
 * in for their number, so a citation could be linked to the wrong work, and the style check
 * reported "Citation [45] found but only 35 references listed" for a complete list.
 */
import { describe, it, expect } from '@jest/globals';
import { reconcileListNumbering, parseReferences, type ParsedReference } from '../src/referenceParser.js';
import { matchCitationsToReferences, getMatchStatistics } from '../src/citationMatcher.js';
import { validateForStyle } from '../src/styleValidation/styleValidators.js';

const ref = (raw: string, listNumber?: number): ParsedReference => ({
  raw, authors: [], authorCount: 0, firstAuthorLastName: '', firstAuthorLastNameNormalized: '',
  allAuthorLastNames: [], allAuthorLastNamesNormalized: [], year: '2020', title: '',
  isGroupAuthor: false, listNumber, type: 'journal',
});
const numeric = (n: number) => ({
  text: `[${n}]`, type: 'numeric', citationNumbers: [n], position: { start: n * 10, end: n * 10 + 3 },
}) as any;
const NL = '\n';

describe('reconcileListNumbering', () => {
  it('drops an orphaned number column and fills a gap whose length is exact', () => {
    const refs = [ref('1. A', 1), ref('2. B', 2), ref('3. 4. 5.', 3), ref('C'), ref('D'), ref('E'), ref('6. F', 6)];
    const out = reconcileListNumbering(refs, '', 'vancouver');
    expect(out.map((r) => [r.raw, r.listNumber, !!r.listNumberRecovered, !!r.listNumberLost])).toEqual([
      ['1. A', 1, false, false], ['2. B', 2, false, false],
      ['C', 3, true, false], ['D', 4, true, false], ['E', 5, true, false],
      ['6. F', 6, false, false],
    ]);
  });

  it('marks numbers lost, never guesses, when the gap and the run differ', () => {
    // The real layout: entries 1-5 numbered, the orphaned column skips 6, 24 entries unnumbered,
    // then 40-45. 34 slots for 24 entries cannot be assigned.
    const section = ['9. 10. 11. 12.', '', '7. 8.', ''].join(NL);
    const refs = [1, 2, 3, 4, 5].map((n) => ref(`${n}. R${n}`, n))
      .concat(Array.from({ length: 24 }, (_, k) => ref(`U${k}`)))
      .concat([40, 41, 42, 43, 44, 45].map((n) => ref(`${n}. R${n}`, n)));
    const out = reconcileListNumbering(refs, section, 'vancouver');
    expect(out.filter((r) => r.listNumberLost)).toHaveLength(24);
    expect(out.filter((r) => r.listNumberRecovered)).toHaveLength(0);
  });

  it('uses an orphaned number line as the end of the list when nothing follows the run', () => {
    const out = reconcileListNumbering([ref('A'), ref('B'), ref('C')], ['References', '1. 2. 3.', ''].join(NL), 'vancouver');
    expect(out.map((r) => r.listNumber)).toEqual([1, 2, 3]);
  });

  it('leaves author-year lists, unstyled calls and fully numbered lists unchanged', () => {
    const apa = [ref('Smith, J. (2020).'), ref('3M Company (2010).', 3), ref('Jones, K. (2019).')];
    expect(reconcileListNumbering(apa, '12. 13.' + NL, 'apa')).toEqual(apa);
    expect(reconcileListNumbering(apa, '2. 3.' + NL)).toEqual(apa);
    const full = [ref('1. A', 1), ref('2. B', 2)];
    expect(reconcileListNumbering(full, '', 'vancouver')).toEqual(full);
  });

  it('marks numbers lost when any printed number sits beside an unnumbered entry (consult 2026-10-28)', () => {
    const refs = [ref('1. A', 1), ref('2. B', 2), ref('3. C', 3), ref('U1'), ref('U2'), ref('U3'), ref('U4')];
    expect(reconcileListNumbering(refs, '', 'vancouver').filter((r) => r.listNumberLost)).toHaveLength(4);
  });

  it('does not recover a trailing run with no known end', () => {
    const out = reconcileListNumbering([ref('1. A', 1), ref('2. B', 2), ref('3. C', 3), ref('D')], '', 'vancouver');
    expect(out[3].listNumberLost).toBe(true);
  });

  it('runs inside parseReferences for a numeric style', () => {
    const text = ['Intro.', '', 'References', '', '1. 2.', '',
      'Smith J. 2020 A title. J. Psychol. 1, 1-2.', '', 'Jones K. 2019 Another title. J. Psychol. 2, 3-4.', ''].join(NL);
    const refs = parseReferences(text, 'vancouver');
    expect(refs.some((r) => /^\s*(\d+\.\s*)+$/.test(r.raw))).toBe(false);
  });

  it('a stray numbers line in an author-year list changes nothing through parseReferences', () => {
    const text = ['Intro.', '', 'References', '',
      'Smith, J. (2020). A title. Journal of Tests, 1, 1-2.', '', '12. 13.', '',
      'Jones, K. (2019). Another title. Journal of Tests, 2, 3-4.', '',
      'Brown, L. (2018). Third title. Journal of Tests, 3, 5-6.', ''].join(NL);
    const refs = parseReferences(text, 'apa');
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.some((r) => r.listNumberLost || r.listNumberRecovered)).toBe(false);
  });
});

describe('numeric matching over a list with lost numbers', () => {
  const refs = reconcileListNumbering(
    [ref('1. A', 1), ref('2. B', 2), ref('3. C', 3), ref('U1'), ref('U2'), ref('9. Z', 9)], '', 'vancouver');

  it('links printed numbers and reports the rest as unverifiable, never by position', () => {
    const results = matchCitationsToReferences([numeric(2), numeric(4), numeric(9), numeric(5)], refs, 'vancouver');
    expect(results.map((r) => [r.status, r.reference?.raw ?? null])).toEqual([
      ['matched', '2. B'], ['unverifiable', null], ['matched', '9. Z'], ['unverifiable', null],
    ]);
    expect(getMatchStatistics(results).unverifiable).toBe(2);
  });

  it('still skips numbers beyond the list, so a range does not inflate the unverifiable count', () => {
    // 6 entries, highest known number 9: [10]-[60] are past the list.
    const range = { ...numeric(10), citationNumbers: Array.from({ length: 51 }, (_, k) => k + 10) };
    const results = matchCitationsToReferences([range], refs, 'vancouver');
    expect(results).toEqual([{ citation: range, reference: null, confidence: 0, status: 'no_match' }]);
  });

  it('keeps the position fallback for a list that printed no numbers at all', () => {
    const plain = [ref('A'), ref('B')];
    expect(matchCitationsToReferences([numeric(2)], plain, 'vancouver')[0].reference?.raw).toBe('B');
  });
});

describe('Vancouver reference count check', () => {
  it('says it could not check, instead of an error, when numbers were lost', () => {
    const refs = [{ list_number: 1 }, { list_number: 2 }, { listNumberLost: true }];
    const v = validateForStyle('vancouver', [{ citation_type: 'numeric', citation_number: 45 }], refs);
    expect(v.map((x) => [x.code, x.severity])).toEqual([['VANCOUVER_NUMBERING_UNREADABLE', 'info']]);
  });

  it('reads host rows: an entry with list_number null beside numbered ones is a lost number', () => {
    const rows = [{ list_number: 1, raw_text: '1. A' }, { list_number: null, raw_text: 'B' }];
    const v = validateForStyle('vancouver', [{ citation_type: 'numeric', citation_number: 45 }], rows);
    expect(v.map((x) => x.code)).toEqual(['VANCOUVER_NUMBERING_UNREADABLE']);
  });

  it('still reports a cited number beyond a complete list', () => {
    const v = validateForStyle('vancouver', [{ citation_type: 'numeric', citation_number: 5 }], [{}, {}]);
    expect(v.map((x) => x.code)).toEqual(['VANCOUVER_MISSING_REFS']);
  });
});
