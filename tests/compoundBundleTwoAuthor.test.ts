/**
 * Regression: a two-author entry whose author carries a surname PARTICLE
 * ("Van Nuland", "De Bruin", "van der Berg") must be detected when it appears
 * as a secondary entry inside a semicolon bundle.
 *
 * citationguard-iterate cycle 22. The standalone two-author parenthetical
 * pattern already used COMPOUND_SURNAME, but the anchored bundle-fragment
 * two-author pattern (the one that scores each ';'-split fragment) used the
 * particle-less SURNAME_LASTNAME, so "(…; Hom Jr & Van Nuland, 2019; …)" lost
 * its middle entry. Combined with cycle 21 (generational suffix), this recovers
 * the chen_2021_jesp "Hom Jr & Van Nuland" citations.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

const firstKeys = (text: string) =>
  detectCitations(text).map(
    c => c.authors[0].normalized + '|' + c.year + (c.yearSuffix || ''),
  );

describe('compound-surname two-author bundle entries', () => {
  it('detects a particle second author in a bundle ("De Bruin & Jones")', () => {
    const k = firstKeys('Prior work (Smith, 1990; De Bruin & Jones, 2015; Lee, 2018) agrees.');
    expect(k).toContain('de bruin|2015');
  });

  it('detects a particle first author in a bundle ("Van Nuland & Smith")', () => {
    const k = firstKeys('Prior work (Smith, 1990; Van Nuland & Jones, 2019; Lee, 2018) agrees.');
    expect(k).toContain('van nuland|2019');
  });

  it('recovers "Hom Jr & Van Nuland" as a bundle entry (cycle 21 + 22 together)', () => {
    const k = firstKeys(
      'Concerns (Bosco, Aguinis, Field, & Dalton, 2016; Hom Jr & Van Nuland, 2019; Shrout & Rodgers, 2018) recur.',
    );
    expect(k).toContain('hom|2019');
  });

  it('still detects a plain two-author bundle entry (no regression)', () => {
    const k = firstKeys('Prior work (Smith, 1990; Hawkins & Hastie, 1990; Lee, 2018) agrees.');
    expect(k).toContain('hawkins|1990');
  });
});
