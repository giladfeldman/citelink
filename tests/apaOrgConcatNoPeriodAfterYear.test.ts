import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser';

/**
 * Regression: a concatenated ORG-author reference whose year-paren is NOT followed by a
 * period was mis-split, so the previous entry's editor became the new author
 * (citationguard-iterate 2026-06-25, chan_feldman — R-0177 Sonnet audit).
 *
 * chan: "Olkin, I. (1967). Correlations revisited. In J. C. Stanley (Ed.), Improving
 * experimental design and statistical analysis. Open Science Collaboration. (2015)
 * Estimating the reproducibility of psychological science. Science, 349(6251),
 * aac4716." The OSC entry is concatenated onto the Olkin book chapter and its
 * "(2015)" is followed by a space + capital (docpluck dropped the period). The concat
 * opener required the year-paren to be followed by "." or "," so the OSC opener did not
 * fire; the splitter instead split at the Olkin chapter's editor, and the second entry
 * keyed first_author = "In J. C. Stanley (Ed.)" with OSC's title/year — Open Science
 * Collaboration was lost and its in-text citation could not match.
 *
 * Fix: the ORG / acronym-org concat openers (narrow, distinctive author shapes already
 * ending in a strong reference-start signal) may also open when the year-paren is
 * followed by a space + capital, not only "." / ",". The high-frequency personal-author
 * opener keeps the strict "." / "," closer.
 */

describe('APA org concat split with no period after year (chan R-0177)', () => {
  it('splits Open Science Collaboration (2015) off an Olkin book chapter and keys it correctly', () => {
    const raw =
      'Olkin, I. (1967). Correlations revisited. In J. C. Stanley (Ed.), Improving ' +
      'experimental design and statistical analysis. Open Science Collaboration. (2015) ' +
      'Estimating the reproducibility of psychological science. Science, 349(6251), aac4716.';
    const refs = parseReferences('Body.\n\nReferences\n\n' + raw, 'apa');
    const osc = refs.find(r => /^Open Science Collaboration/i.test(r.firstAuthorLastName || ''));
    expect(osc).toBeDefined();
    expect(osc?.year).toBe('2015');
    expect(osc?.title || '').toMatch(/^Estimating the reproducibility/);
    // the editor of the Olkin chapter must NOT have become the OSC author
    expect(refs.some(r => /Stanley/i.test(r.firstAuthorLastName || ''))).toBe(false);
    // Olkin survives as its own entry
    expect(refs.some(r => /^Olkin$/i.test(r.firstAuthorLastName || ''))).toBe(true);
  });
});
