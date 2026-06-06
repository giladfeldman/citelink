/**
 * Regression: a surname containing the German eszett "ß" (U+00DF) must be
 * detected. The lowercase surname character class ran "à-ÿ" (U+00E0–U+00FF),
 * which starts one code point ABOVE ß (U+00DF), so "Groß" truncated to "Gro"
 * and "(Groß & Bayen, 2015)" was missed entirely.
 *
 * citationguard-iterate cycle 23 — surfaced on chen_2021_jesp.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

const firstKeys = (text: string) =>
  detectCitations(text).map(
    c => c.authors[0].normalized + '|' + c.year + (c.yearSuffix || ''),
  );

describe('eszett (ß) in surnames', () => {
  it('detects a two-author parenthetical with an eszett first author', () => {
    const k = firstKeys('Memory work (Groß & Bayen, 2015) shows this.');
    // normalizeText folds ß → ss via NFD? No — ß has no decomposition, so it
    // stays "groß". The key is whatever citelink normalizes it to; assert the
    // citation is detected at all and carries the year.
    expect(k.some(x => x.endsWith('|2015'))).toBe(true);
    expect(k.join(' ')).toMatch(/gro/);
  });

  it('detects an eszett surname as a bundle entry', () => {
    const k = firstKeys('Earlier (Smith, 1990; Groß & Bayen, 2015; Lee, 2018) found this.');
    expect(k.join(' ')).toMatch(/gro\S*\|2015/);
  });

  it('still detects a plain ASCII surname (no regression)', () => {
    expect(firstKeys('A study (Cohen, 1988) established this.')).toContain('cohen|1988');
  });
});
