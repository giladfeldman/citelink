/**
 * Regression (v0.7.89 release review, 2026-11-18): the cross-model review and the
 * full-corpus diff found further members of the classes this release fixes.
 * Each case below was reproduced on the candidate build before the fix.
 *
 *   A. a comma inside a number read the wrong way: "(1,234, 2,345)" and
 *      "(1,200–1,500)" split into citations; a spaced standalone range "3 – 5"
 *      lost its dash. ("kcal1,200" read as 1 and 200 is left open, see below.)
 *   A/E. a bracket whose members cannot be reference numbers: "[1990–2000]" was
 *      eleven citations, "[2008, 2010]" two.
 *   B. the same citation read differently by detector: Harvard rejected
 *      "(Block, 2008)" with a comma, which APA keeps.
 *   C. a superscript span ending in punctuation: "findings¹²," covered the comma.
 *   D. surnames rejected as numbered-item labels: "(Block 2005; …)" (a corpus
 *      citation), "(Page 2010)", "(Min 2012)"; and seasons and prepositions
 *      accepted as authors: "(Spring 2008)", "(Until 2010)".
 *   E. the interval guard dropping real citations: a plural noun
 *      ("bootstrapped CIs [7, 8]"), and a capital glued to a bracket with no
 *      operator after it ("vitamin D[12, 45]"); and missing dash intervals
 *      ("95% CI [13–37]").
 */
import { describe, it, expect } from '@jest/globals';
import { detectNumericCitations } from '../src/numericCitationDetector.js';
import { detectCitations } from '../src/citationDetector.js';
import { detectHarvardCitations } from '../src/harvardCitationDetector.js';

const raws = (text: string) => detectNumericCitations(text).map(c => c.raw);
const years = (cs: Array<{ year?: string }>) => cs.map(c => c.year).sort();

describe('A: a formatted count is never split into citations', () => {
  it.each([
    ['Samples (1,234, 2,345) were drawn.', '(1,234, 2,345)'],
    ['Samples (1,200–1,500) were drawn.', '(1,200–1,500)'],
  ])('round bracket: %s', (text, raw) => {
    expect(raws(text)).not.toContain(raw);
  });
  // Glued digits are NOT asked: a comma-shaped glued run is a superscript list far more
  // often than a count. A count guard there cost 55 real citations in two PMC papers
  // (10.1038/s41467-020-18794-x, 10.1038/s41392-021-00658-5), so these must stay.
  it.each([
    ['used for preventive screening276,277. High density', [276, 277]],
    ['innate and acquired immunity.99,100 Basophils are', [99, 100]],
    ['stress on the migrating cells76,159,160. T-cells', [76, 159, 160]],
  ])('glued digits: a superscript list stays a list: %s', (text, nums) => {
    expect(detectNumericCitations(text).map(c => c.citationNumbers)).toContainEqual(nums);
  });
  it('standalone line: a spaced range keeps its dash', () => {
    const text = 'First claim.\n3 – 5\nSecond claim.\n6\nThird claim.\n7\nFourth claim.\n8\nEnd.';
    const c = detectNumericCitations(text).find(x => x.citationNumbers?.[0] === 3);
    expect(c?.citationNumbers).toEqual([3, 4, 5]);
  });
});

describe('A/E: bracket members that cannot be reference numbers', () => {
  it.each([
    ['In the period [1990–2000] we saw it. Others [1]. More [2]. And [3].', '[1990–2000]'],
    ['Between [2008, 2010] it rose. Others [1]. More [2]. And [3].', '[2008, 2010]'],
  ])('%s', (text, raw) => {
    expect(raws(text)).not.toContain(raw);
  });
  it('a real list beside an implausible member keeps its real members', () => {
    const c = detectNumericCitations('as reviewed [4,7,9] and [12, 610] here').find(x => x.raw === '[12, 610]');
    expect(c?.citationNumbers).toEqual([12]);
  });
});

describe('B: Harvard reads a comma-form author like APA does', () => {
  it.each([
    'As shown (Lee, 2001; Block, 2008) here.',
    'As shown (Page, 2010) here.',
    'As shown (Min, 2012) here.',
  ])('%s', text => {
    expect(years(detectHarvardCitations(text))).toEqual(years(detectCitations(text)));
    expect(detectHarvardCitations(text).length).toBeGreaterThan(0);
  });
});

describe('C: a superscript span covers its digits, not trailing punctuation', () => {
  it('"findings¹²," spans "¹²"', () => {
    const text = 'These findings¹², were key.';
    const c = detectNumericCitations(text).find(x => x.citationNumbers?.[0] === 12);
    expect(c && text.slice(c.position.start, c.position.end)).toBe('¹²');
    expect(c?.raw).toBe('¹²');
  });
});

describe('D: no-comma author before a year', () => {
  it.each([
    ['and can interact (Block 2005; Hammond et al. 1987) here', '2005'],
    ['as argued (Page 2010) here', '2010'],
    ['as argued (Min 2012) here', '2012'],
    ['as argued (Case 2015) here', '2015'],
  ])('a surname that is also a label word stays an author: %s', (text, year) => {
    expect(detectCitations(text).some(c => c.year === year)).toBe(true);
    expect(detectHarvardCitations(text).some(c => c.year === year)).toBe(true);
  });
  it.each([
    'data collected (Spring 2008) were',
    'data collected (Fall 2015) were',
    'data collected (Autumn 2015) were',
    'stable (Until 2010) and',
    'stable (Through 2010) and',
    'stable (During 2010) and',
    'stable (Around 2010) and',
  ])('a season or preposition is not an author: %s', text => {
    expect(detectCitations(text)).toEqual([]);
    expect(detectHarvardCitations(text)).toEqual([]);
  });
  it('the labels that are never surnames still reject: "(Image 1750)", "(Version 2007)"', () => {
    expect(detectCitations('the picture (Image 1750) and the LIWC (Version 2007) dictionary')).toEqual([]);
  });
});

describe('E: the interval guard keeps real citations', () => {
  it.each([
    ['Others [1]. More [2]. And [3]. We report bootstrapped CIs [7, 8] here.', '[7, 8]', [7, 8]],
    ['Others [1]. More [2]. And [3]. Wilson confidence intervals [12, 13] were used.', '[12, 13]', [12, 13]],
    ['Others [1]. More [2]. And [3]. We computed prediction intervals [31, 32] here.', '[31, 32]', [31, 32]],
    ['Others [1]. More [2]. And [3]. Low vitamin D[12, 45] is common.', '[12, 45]', [12, 45]],
    ['Others [1]. More [2]. And [3]. Infection with hepatitis B[23,24] rose.', '[23,24]', [23, 24]],
  ])('%s', (text, raw, nums) => {
    expect(detectNumericCitations(text).find(c => c.raw === raw)?.citationNumbers).toEqual(nums);
  });
  it.each([
    ['their interaction was not (F[1, 101] < 1, p = .85)', '[1, 101]'],
    ['a prior x ~ U[1,100] on the rate', '[1,100]'],
  ])('a glued capital WITH an operator is still an interval: %s', (text, raw) => {
    expect(raws(text).some(r => r.includes(raw))).toBe(false);
  });
  it.each([
    ['an estimate of 25%, 95% CI [13–37] was', '[13–37]'],
    ['on the interval [1-27] in each test', '[1-27]'],
    ['median 23 (IQR = [16–30]) years', '[16–30]'],
  ])('a dash interval after a named interval or operator: %s', (text, raw) => {
    expect(raws(text)).not.toContain(raw);
  });
  it.each([
    ['as shown before [13–17] in cohorts', '[13–17]', [13, 14, 15, 16, 17]],
    // Corpus citation (10.1098/rsos.170720): "range" never makes a dash pair an interval.
    ['a higher density of food plants within their range [68-70]. Comparable', '[68-70]', [68, 69, 70]],
    ['studies across the range [3-5] of designs', '[3-5]', [3, 4, 5]],
  ])('a dash citation range after prose stays a citation: %s', (text, raw, nums) => {
    expect(detectNumericCitations(text).find(c => c.raw === raw)?.citationNumbers).toEqual(nums);
  });
});
