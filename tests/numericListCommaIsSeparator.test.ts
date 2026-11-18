/**
 * Regression (SaneCite report, 2026-11-17): a comma inside a citation marker
 * separates reference numbers, with or without a space after it.
 *
 * expandNumericRange used to collapse "d,ddd" as a thousands separator in EVERY
 * branch. Measured consequences on v0.7.88:
 *   "[110,111]"     -> dropped (read as 110111, rejected as too large)
 *   "[3-5,110]"     -> citations 3..102 (range 3-5110, capped at 100 numbers)
 *   "[7,110-112]"   -> dropped (range 7110-112 is empty)
 *   "[12,345,678]"  -> [12345, 678]
 *   "¹¹⁰,¹¹¹"       -> citation 110111
 * Only the parenthetical "(n)" branch keeps the formatted-count reading, because
 * round brackets in prose do hold counts like "(1,234)".
 */
import { describe, it, expect } from '@jest/globals';
import {
  detectNumericCitations,
  expandNumericRange,
  isThousandsFormattedNumber,
} from '../src/numericCitationDetector.js';

const numbersOf = (text: string, raw: string) =>
  detectNumericCitations(text).find(c => c.raw === raw)?.citationNumbers;

describe('expandNumericRange reads every comma as a list separator', () => {
  it.each([
    ['110,111', [110, 111]],
    ['110, 111', [110, 111]],
    ['1,234', [1, 234]],
    ['3-5,110', [3, 4, 5, 110]],
    ['7,110-112', [7, 110, 111, 112]],
    ['12,345,678', [12, 345, 678]],
  ])('%s', (input, expected) => {
    expect(expandNumericRange(input)).toEqual(expected);
  });
});

describe('isThousandsFormattedNumber', () => {
  it.each([
    ['1,234', true],
    ['12,345,678', true],
    ['110,111', true],
    ['110, 111', false],
    ['1,23', false],
    ['3-5,110', false],
    ['12', false],
  ])('%s -> %s', (input, expected) => {
    expect(isThousandsFormattedNumber(input)).toBe(expected);
  });
});

describe('bracket, narrative and superscript markers', () => {
  const pad = ' Also [1] and [2] and [3].';
  it.each([
    ['Prior work [110,111] showed.', '[110,111]', [110, 111]],
    ['Prior work [110, 111] showed.', '[110, 111]', [110, 111]],
    ['Prior work [3-5,110] showed.', '[3-5,110]', [3, 4, 5, 110]],
    ['Prior work [3–5,110] showed.', '[3–5,110]', [3, 4, 5, 110]],
    ['Prior work [7,110-112] showed.', '[7,110-112]', [7, 110, 111, 112]],
    ['Prior work [12,345,678] showed.', '[12,345,678]', [12, 345, 678]],
    ['As Smith [110,111] said.', '[110,111]', [110, 111]],
    ['as in integrity¹¹⁰,¹¹¹ here.', '¹¹⁰,¹¹¹', [110, 111]],
  ])('%s', (text, raw, expected) => {
    expect(numbersOf(text + pad, raw)).toEqual(expected);
  });

  it('a bracket holding a zero ("[1,000]") is still not a citation', () => {
    expect(numbersOf('values in [1,000] range.' + pad, '[1,000]')).toBeUndefined();
  });
});

describe('plain digits glued to a word (superscript lost in extraction)', () => {
  it('a glued list "integrity110,111" is not emitted as one huge number', () => {
    const cites = detectNumericCitations('the integrity110,111 of the data.');
    for (const c of cites) {
      for (const n of c.citationNumbers ?? []) expect(n).toBeLessThanOrEqual(300);
    }
  });
  it('"word1,000" is a count, not citations 1 and 0', () => {
    const cites = detectNumericCitations('a total of about1,000 people.');
    expect(cites.some(c => (c.citationNumbers ?? []).includes(0))).toBe(false);
    expect(cites.some(c => (c.citationNumbers ?? []).includes(1000))).toBe(false);
  });
});

describe('parenthetical "(n)" branch keeps formatted counts out', () => {
  it('"(1,234)" is not a citation', () => {
    const cites = detectNumericCitations('The cohort (1,234) was large. See (4) and (5, 6).');
    expect(cites.find(c => c.raw === '(1,234)')).toBeUndefined();
  });
  it('"(3-5,110)" is a citation list, not the range 3-5110', () => {
    const cites = detectNumericCitations('Shown before (3-5,110). See (4) and (5, 6).');
    expect(cites.find(c => c.raw === '(3-5,110)')?.citationNumbers).toEqual([3, 4, 5, 110]);
  });
});
