/**
 * Regression (SaneCite report, 2026-11-17): a citation is found in every
 * position of a ';'-bundle exactly when it is found on its own, in both the APA
 * and the Harvard detector, and its position points at its own text.
 *
 * Measured on v0.7.88 (a 140-cell matrix: 7 author shapes x comma / no comma
 * before the year x 5 positions x 2 detectors):
 *   - APA: a bundle member joined by "and" ("Smith and Jones, 2008") was dropped;
 *     the bundle matchers took only "&". The reported case was
 *     "(Lee, 2001; Smith and Jones, 2008)" -> only Lee 2001.
 *   - APA: a bundle member with no comma before the year was dropped (except et al.).
 *   - APA: after a stripped lead-in ("e.g., ") every member's position was shifted.
 *   - APA: "(Smith, Brown, & Jones 2008)" on its own was not found.
 *   - Harvard: nothing with a comma before the year was found at all, and the
 *     three-author pattern took only "and".
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';
import { detectHarvardCitations } from '../src/harvardCitationDetector.js';

const MEMBERS: Record<string, string> = {
  two_amp: 'Smith & Jones',
  two_and: 'Smith and Jones',
  three_amp: 'Smith, Brown, & Jones',
  three_and: 'Smith, Brown, and Jones',
  three_and_no_serial_comma: 'Smith, Brown and Jones',
  et_al: 'Smith et al.',
  single: 'Smith',
};

const DETECTORS = { apa: detectCitations, harvard: detectHarvardCitations };

const cases: Array<[string, string, string, string]> = [];
for (const det of Object.keys(DETECTORS)) {
  for (const sep of [', ', ' ']) {
    for (const [name, member] of Object.entries(MEMBERS)) {
      const target = `${member}${sep}2008`;
      const contexts: Record<string, string> = {
        alone: `(${target})`,
        first: `(${target}; Lee${sep}2001)`,
        second: `(Lee${sep}2001; ${target})`,
        middle: `(Lee${sep}2001; ${target}; Kim${sep}2010)`,
        after_lead_in: `(e.g., Lee${sep}2001; ${target})`,
        wide_spacing: `(Lee${sep}2001;   ${target})`,
      };
      for (const [pos, paren] of Object.entries(contexts)) {
        cases.push([det, sep === ', ' ? 'comma' : 'no comma', `${name} ${pos}`, paren]);
      }
    }
  }
}

describe('bundle members are found wherever they stand', () => {
  it.each(cases)('%s, %s: %s', (det, _sep, _label, paren) => {
    const text = `This was shown before ${paren}. End.`;
    const cites = DETECTORS[det as keyof typeof DETECTORS](text);
    const hit = cites.find(c => c.year === '2008' && c.authors[0]?.normalized === 'smith');
    expect(hit).toBeDefined();
    // The span must lie on the member's own text.
    const span = text.slice(hit!.position.start, hit!.position.end);
    expect(span).toContain('2008');
    expect(span).toContain('Smith');
  });
});

describe('the reported case', () => {
  it('(Lee, 2001; Smith and Jones, 2008) yields both citations', () => {
    const keys = detectCitations('Shown (Lee, 2001; Smith and Jones, 2008).').map(
      c => `${c.authors.map(a => a.normalized).join('+')}|${c.year}`,
    );
    expect(keys).toEqual(expect.arrayContaining(['lee|2001', 'smith+jones|2008']));
  });
});

describe('no-comma bundle members do not admit dates or prose', () => {
  it.each([
    '(Lee, 2001; June 2008)',
    '(Lee, 2001; Since 2008)',
  ])('%s', paren => {
    const cites = detectCitations(`It happened ${paren}.`);
    expect(cites.some(c => c.year === '2008')).toBe(false);
  });
  it('a real surname that is also a month is still found WITH a comma', () => {
    const cites = detectCitations('It happened (Lee, 2001; May, 2008).');
    expect(cites.some(c => c.year === '2008' && c.authors[0]?.normalized === 'may')).toBe(true);
  });
});

describe('stand-alone no-comma parentheticals do not admit prose either', () => {
  it.each(['(Since 2008)', '(In 2008)', '(June 2008)', '(However 2008)'])('%s', paren => {
    expect(detectCitations(`It happened ${paren}.`).some(c => c.year === '2008')).toBe(false);
  });
  it('(Smith 2008) is still found', () => {
    expect(detectCitations('It happened (Smith 2008).').some(c => c.year === '2008')).toBe(true);
  });
});

describe('numbered-item labels before a bare number are not authors', () => {
  const det = { apa: detectCitations, harvard: detectHarvardCitations };
  it.each([
    ['apa', '(Image 1750; mean valence = 8.19)'],
    ['apa', '(Lee, 2001; Image 1750)'],
    ['apa', '(maximum 1350; see Appendix)'],
    ['apa', '(Lee, 2001; Smith 9001)'],
    ['harvard', '(Image 1750)'],
    ['harvard', '(Lee 2001; Image 1750)'],
    ['harvard', '(Since 2008)'],
  ])('%s: %s', (d, paren) => {
    const cites = det[d as 'apa' | 'harvard'](`A snake ${paren}.`);
    expect(cites.some(c => ['1750', '1350', '9001', '2008'].includes(c.year))).toBe(false);
  });
  it.each([
    ['apa', '(Lee, 2001; van Dijk 2008)', 'van dijk'],
    ['harvard', '(Lee 2001; van Dijk 2008)', 'van dijk'],
    ['harvard', '(Hume 1739)', 'hume'],
  ])('%s: %s is still found', (d, paren, who) => {
    const cites = det[d as 'apa' | 'harvard'](`It was shown ${paren}.`);
    expect(cites.some(c => c.authors[0]?.normalized === who)).toBe(true);
  });
});
