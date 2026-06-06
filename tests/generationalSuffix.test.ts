/**
 * Regression: a generational suffix (Jr / Sr / II / III / IV) on a surname
 * must not break citation detection, and must not leak into the author key.
 *
 * citationguard-iterate cycle 21 (R2 of the 2026-05-26 handoff). The chen_2021_jesp
 * canary repeatedly missed "(Hom Jr & Van Nuland, 2019; …)" — the trailing "Jr"
 * after "Hom" defeated the two-author parenthetical pattern, which expected a
 * "&" immediately after the first surname. The fix lets COMPOUND_SURNAME consume
 * an optional generational suffix; the suffix is stripped from the normalized
 * author so the matched key stays "hom", not "hom jr".
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

// First-author identity key — mirrors how the matcher / scorer resolves a
// citation (authors[0]), so a multi-author citation keys on its first author.
const firstKeys = (text: string) =>
  detectCitations(text).map(
    c => c.authors[0].normalized + '|' + c.year + (c.yearSuffix || ''),
  );

describe('generational suffix on surnames', () => {
  it('detects a two-author parenthetical whose first author carries "Jr"', () => {
    const k = firstKeys('Replication concerns (Hom Jr & Van Nuland, 2019) are common.');
    expect(k).toContain('hom|2019');
  });

  it('detects "Jr" as a secondary entry inside a semicolon bundle', () => {
    const k = firstKeys(
      'Several authors (Bosco, Aguinis, Field, & Dalton, 2016; Hom Jr & Smith, 2019; Shrout & Rodgers, 2018) agree.',
    );
    expect(k).toContain('hom|2019');
  });

  it('detects a narrative citation with a "Jr" suffix', () => {
    const k = firstKeys('As Hom Jr (2019) argued, the effect holds.');
    expect(k).toContain('hom|2019');
  });

  it('does not leak the suffix into the author key (Sr / III / IV)', () => {
    expect(firstKeys('See (King Sr, 2001) for context.')).toContain('king|2001');
    expect(firstKeys('See (Adams III, 1998) for context.')).toContain('adams|1998');
    expect(firstKeys('See (Ford IV, 2010) for context.')).toContain('ford|2010');
  });

  it('still detects a plain surname with no suffix (no regression)', () => {
    expect(firstKeys('A classic study (Cohen, 1988) established this.')).toContain('cohen|1988');
  });
});
