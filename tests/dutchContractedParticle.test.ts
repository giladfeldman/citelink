/**
 * Regression: a Dutch contracted-article particle surname ("van't Veer",
 * "van 't Hooft") must be detected. The particle whitelist matched "van" only
 * when followed by whitespace, so "van't" (apostrophe, no space) defeated the
 * surname pattern and "(van't Veer & Giner-Sorolla, 2016)" was missed.
 *
 * citationguard-iterate cycle 25 — surfaced on chen_2021_jesp.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

const firstKeys = (text: string) =>
  detectCitations(text).map(
    c => c.authors[0].normalized.replace(/'/g, '') + '|' + c.year + (c.yearSuffix || ''),
  );

describe("Dutch contracted-article particle (van't)", () => {
  it("detects \"van't Veer\" as a two-author parenthetical", () => {
    const k = firstKeys("Concerns (van't Veer & Giner-Sorolla, 2016) recur.");
    expect(k).toContain('vant veer|2016');
  });

  it("detects \"van't Veer\" as a bundle entry", () => {
    const k = firstKeys('Prior (Nosek et al., 2018; van\'t Veer & Giner-Sorolla, 2016; Lee, 2012) work.');
    expect(k).toContain('vant veer|2016');
  });

  it('still detects a plain "van" compound (no regression)', () => {
    const k = firstKeys('As shown (van der Maas & Smith, 2011) earlier.');
    expect(k.join(' ')).toMatch(/van der maas\|2011/);
  });
});
