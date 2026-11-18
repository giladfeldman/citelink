/**
 * Regression (v0.7.89 release check, 2026-11-18): a bracket holding two integers
 * that is a numeric INTERVAL is not a citation.
 *
 * v0.7.89 made every comma inside a bracket a list separator ("[110,111]" is two
 * citations). Measured on the candidate build: "[1,100]", "x ∈ [2,500]",
 * "in the range [10,200]", "U[1,100]" and "[10,200] ms" all became citation lists.
 * v0.7.88 skipped the no-space forms only by accident (it read "1,100" as 1100, too
 * large), and already emitted the spaced forms, including "95% CI [13, 37]".
 *
 * An interval is recognised by its surroundings, never by its numbers alone. Every
 * cue below, and every citation kept beside it, was checked against the 9,138-text
 * corpus: nouns are where the two collide ("conceptual domains [6, 7]", "the Memory
 * scale [5, 53]", "coalition support [30, 31]", "20 m intervals [36, 46]",
 * "social interaction range [29, 42]" are citations), so the noun cue is narrow.
 * Only two-member lists of plain numbers qualify: "[1-3,100]" or "[1,5,100]" are
 * never intervals.
 */
import { describe, it, expect } from '@jest/globals';
import { detectNumericCitations } from '../src/numericCitationDetector.js';
import { analyze } from '../src/analyze.js';

const raws = (text: string) => detectNumericCitations(text).map(c => c.raw);

describe('an integer interval in brackets is not a citation', () => {
  const intervals: Array<[string, string]> = [
    // A math operator directly before.
    ['x ∈ [2,500] for each trial', '[2,500]'],
    ['x ∈ [2, 500] for each trial', '[2, 500]'],
    ['with k=[5,150] clusters', '[5,150]'],
    ['n ≤ [3,40] here', '[3,40]'],
    ['(SDIU = 19, RangeIU = [31, 121]) was larger', '[31, 121]'],
    ['median 23 years (IQR = [16, 30]) of experience', '[16, 30]'],
    // A distribution after "~", or a glued capital with an operator after it (a test
    // statistic). A bare glued capital is not enough: "vitamin D[12, 45]" is a citation.
    ['a prior ~ U[1,100] on the rate', '[1,100]'],
    ['their interaction was not (F[1, 101] < 1, p = .85)', '[1, 101]'],
    // A named interval directly before.
    ['values drawn uniformly from [1,100] were used', '[1,100]'],
    ['values drawn uniformly from [1, 100] were used', '[1, 100]'],
    ['on the interval [1,100].', '[1,100]'],
    ['truncated to the interval [30, 150]. The drawn', '[30, 150]'],
    ['in the range [10,200] across trials', '[10,200]'],
    ['(M age = 35.0, SD = 12.5, range [18, 73];', '[18, 73]'],
    ['normalised into the range of [1, 10] points', '[1, 10]'],
    ['an actual replication rate of 25%, 95% CI [13, 37] was', '[13, 37]'],
    ['the 95% confidence interval [12, 45] excluded zero', '[12, 45]'],
    ['the HPD [2, 9] for nu', '[2, 9]'],
    // Narrative shape: a capitalised interval noun at a sentence start.
    ['It held. Range [1,100] was used throughout', '[1,100]'],
    ['It held. Interval [2, 500] was used throughout', '[2, 500]'],
    // A unit directly after.
    ['latencies of [10,200] ms were kept', '[10,200]'],
    ['latencies of [10, 200]ms were kept', '[10, 200]'],
    ['estimates were 16%, 95% CI [5, 32]%, and', '[5, 32]'],
    ['accuracy fell to [40,60]% in block two', '[40,60]'],
    ['ages [18,65] years were eligible', '[18,65]'],
  ];
  it.each(intervals)('%s', (text, raw) => {
    expect(raws(text).some(r => r.includes(raw))).toBe(false);
  });
});

describe('the same numbers after ordinary prose stay citations', () => {
  const citations: Array<[string, string, number[]]> = [
    ['as reported earlier [1,100] in two cohorts', '[1,100]', [1, 100]],
    ['shown before [12,110].', '[12,110]', [12, 110]],
    ['shown before [12, 110].', '[12, 110]', [12, 110]],
    ['a broad range of species [12,110] differ', '[12,110]', [12, 110]],
    ['in several studies [3,140] the effect held', '[3,140]', [3, 140]],
    ['as described in [7,105] and elsewhere', '[7,105]', [7, 105]],
    ['the effect was small [2,150] overall', '[2,150]', [2, 150]],
    ['in the range [1-3,100] of prior studies', '[1-3,100]', [1, 2, 3, 100]],
    ['in the range [1,5,100] of prior studies', '[1,5,100]', [1, 5, 100]],
    ['participants [10,200] were tested', '[10,200]', [10, 200]],
    ['as Smith [12,110] showed', '[12,110]', [12, 110]],
    // Corpus citations after nouns that also name intervals (all real citations).
    ['especially across different conceptual domains [6, 7], people', '[6, 7]', [6, 7]],
    ['an individual social interaction range [29, 42].', '[29, 42]', [29, 42]],
    ['normal distributions within acceptable ranges [71, 88] (less', '[71, 88]', [71, 88]],
    ['the Italian Wechsler Memory scale [5, 53]. These were', '[5, 53]', [5, 53]],
    ['clumped at a local scale [14, 28] and when', '[14, 28]', [14, 28]],
    ['given in exchange for coalition support [30, 31], tolerance', '[30, 31]', [30, 31]],
    ['placed on alternate sides in 20 m intervals [36, 46]. Using', '[36, 46]', [36, 46]],
    ['preference. Over [51, 52] points out that, in previous', '[51, 52]', [51, 52]],
  ];
  it.each(citations)('%s', (text, raw, nums) => {
    const c = detectNumericCitations(text).find(x => x.raw === raw);
    expect(c?.citationNumbers).toEqual(nums);
  });
});

describe('the round-bracket branch reads the same intervals the same way', () => {
  // The "(n)" branch runs only when a text has fewer than 3 bracket citations.
  const intervals: Array<[string, string]> = [
    ['values drawn uniformly from (1, 100) were used', '(1, 100)'],
    ['with x ∈ (2, 50) for each trial', '(2, 50)'],
    ['participants were adults, range (18, 73), and', '(18, 73)'],
    ['latencies of (10, 200) ms were kept', '(10, 200)'],
  ];
  it.each(intervals)('%s', (text, raw) => {
    expect(raws(text).includes(raw)).toBe(false);
  });
  it('a round-bracket citation after prose stays a citation', () => {
    const c = detectNumericCitations('as shown before (3, 14) in two cohorts').find(x => x.raw === '(3, 14)');
    expect(c?.citationNumbers).toEqual([3, 14]);
  });
});

describe('corpus regressions of the guard itself', () => {
  it('"PI" is not an interval label: "low PI [31, 32]" is a citation', () => {
    const c = detectNumericCitations('inter-birth intervals (IBI) and low PI [31, 32]. Expediting')
      .find(x => x.raw === '[31, 32]');
    expect(c?.citationNumbers).toEqual([31, 32]);
  });
  it('skipped interval brackets still keep the glued-digit branch off', () => {
    // 10.1177/0956797615583979 shape: CI brackets, and "etap2" / "Mak1" glued digits.
    const text =
      'Jake Pattaratanakun1,2 and Vincent Mak1 report this. ' +
      'F(1, 104) = 0.06, p > .250, etap2 < .001 (M = 372, 95% CI = [365, 379]). ' +
      'F(1, 104) = 3.24, p = .075, etap2 = .030 (M = 381, 95% CI = [376, 386]). ' +
      'F(1, 61) = 6.39, p = .014, etap2 < .095 (M = 375, 95% CI = [371, 379]).';
    expect(detectNumericCitations(text)).toEqual([]);
  });
});

describe('analyze() does not link an interval to a reference', () => {
  it('a Vancouver paper with "uniformly from [1,100]" keeps only its real citations', () => {
    const body =
      'Prior work examined this [1]. Others replicated it [2,3]. ' +
      'Parameters were drawn uniformly from [1,100] for every run. ' +
      'Further evidence exists [4].\n\nReferences\n';
    const refs = [
      '1. Smith J, Brown K. A first study. J Psychol. 2001;12:1-10.',
      '2. Lee M. A second study. Psychol Sci. 2003;14:11-20.',
      '3. Chan P, Wong T. A third study. Cognition. 2005;98:21-30.',
      '4. Kim S. A fourth study. Mem Cognit. 2007;35:31-40.',
    ].join('\n');
    const r = analyze(body + refs);
    expect(r.citations.some(c => c.raw === '[1,100]')).toBe(false);
  });
});
