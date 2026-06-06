/**
 * Regression: the multi-word signal prefix "see for example" (and "see, e.g.")
 * must be stripped so the citation after it is detected.
 *
 * citationguard-iterate cycle 24 (R1). The fragment-prefix strip recognised
 * "see" / "see also" but not "see for example", so
 * "(see for example Arkes et al., 1981; Harley et al., 2004)" lost its first
 * entry (the leftover "for example Arkes…" defeated the matcher). Surfaced on
 * chen_2021_jesp.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

const firstKeys = (text: string) =>
  detectCitations(text).map(
    c => c.authors[0].normalized + '|' + c.year + (c.yearSuffix || ''),
  );

describe('"see for example" signal prefix', () => {
  it('strips "see for example" in a bundle and detects both entries', () => {
    const k = firstKeys('Prior work (see for example Arkes et al., 1981; Harley et al., 2004) shows this.');
    expect(k).toContain('arkes|1981');
    expect(k).toContain('harley|2004');
  });

  it('strips "see for example" in a single-citation parenthetical', () => {
    const k = firstKeys('This holds (see for example Smith, 2001).');
    expect(k).toContain('smith|2001');
  });

  it('strips "see, e.g.," in a bundle', () => {
    const k = firstKeys('Prior work (see, e.g., Jones, 2010; Lee, 2012) shows this.');
    expect(k).toContain('jones|2010');
    expect(k).toContain('lee|2012');
  });

  it('still strips a plain "see" prefix (no regression)', () => {
    expect(firstKeys('This holds (see Fritz et al., 2012).')).toContain('fritz|2012');
  });
});
