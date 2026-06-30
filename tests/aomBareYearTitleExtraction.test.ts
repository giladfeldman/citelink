import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser';

/**
 * Regression: AOM (Academy of Management) bare-year reference TITLE extraction
 * (citationguard-iterate cycle 7, 2026-06-30 — amp_1 + annals_2 Sonnet audit).
 *
 * The bare-year parser (`parseBareYearReference`, used for AOM / ASA / Chicago
 * author-date) extracted the title with a naive "first `.` wins" rule plus a
 * "take only the quoted span" rule. Both truncated real AOM titles that the
 * APA-path title extractor already handled correctly:
 *
 *  1. QUOTED-PHRASE + SUBTITLE: `"An A is an A": The new bottom line for valuing
 *     academic research.` — the opening quote is only a PHRASE of the title, not
 *     the whole title. The old `^"(.+?)"` rule grabbed only `An A is an A`,
 *     dropping the post-colon subtitle. (amp_1: Aguinis 2020, Rasheed 2020.)
 *  2. RETRACTION / single-word PREFIX: `Retraction. Externally commercializing
 *     technology assets: An examination…` — the first `.` truncated the title to
 *     the lone word `Retraction`. (annals_2: Hunton, Lichtenthaler, Min, Stapel,
 *     Walumbwa 2011 retraction notices.)
 *
 * Fix: `extractTitleFromAfterYear` — the bare-year path now anchors on the first
 * SENTENCE-ending period with the same single-word / volume-prefix re-anchors as
 * the APA path, and only treats a leading quote as the whole title when the
 * closing quote is immediately followed by a sentence boundary (never when a `:`
 * or more title prose follows).
 *
 * All inputs below are VERBATIM from the real docpluck-academic extraction of the
 * two papers (DOI 10.5465/amp.2023.0198 and 10.5465/annals.2016.0011).
 */

function titleOf(refText: string): string {
  const refs = parseReferences(`References\n\n${refText}\n`, 'aom');
  return (refs[0]?.title ?? '').trim();
}

describe('AOM bare-year title extraction (cycle 7)', () => {
  it('keeps the full title when a quoted phrase is followed by a post-colon subtitle (amp_1 Aguinis 2020)', () => {
    const title = titleOf(
      'Aguinis, H., Cummings, C., Ramani, R. S., & Cummings, T. G. 2020. ' +
        '"An A is an A": The new bottom line for valuing academic research. ' +
        'Academy of Management Perspectives, 34: 135-154.',
    );
    // BEFORE the fix this was the bare quoted phrase 'An A is an A'.
    expect(title).toContain('An A is an A');
    expect(title).toContain('The new bottom line for valuing academic research');
    // Must NOT swallow the journal name.
    expect(title).not.toContain('Academy of Management Perspectives');
  });

  it('keeps the full title for a quoted phrase + subtitle ending in "!" (amp_1 Rasheed 2020)', () => {
    const title = titleOf(
      'Rasheed, A. A., & Priem, R. L. 2020. ' +
        '"An A is an A": We have met the enemy, and he is us! ' +
        'Academy of Management Perspectives, 34: 155-163.',
    );
    expect(title).toContain('An A is an A');
    expect(title).toContain('We have met the enemy, and he is us');
  });

  it('keeps the full title past a "Retraction." prefix (annals_2 Hunton 2011)', () => {
    const title = titleOf(
      'Hunton, J. E., & Rose, J. M. 2011. Retraction. Effects of anonymous ' +
        'whistle-blowing and perceived reputation threats on investigations of ' +
        'whistle-blowing allegations by audit committee Members. ' +
        'Journal of Management Studies, 48: 75-98.',
    );
    // BEFORE the fix this was the lone word 'Retraction'.
    expect(title.startsWith('Retraction.')).toBe(true);
    expect(title).toContain('Effects of anonymous whistle-blowing');
    expect(title).not.toContain('Journal of Management Studies');
  });

  it('keeps the full title past a "Retraction." prefix (annals_2 Lichtenthaler 2008)', () => {
    const title = titleOf(
      'Lichtenthaler, U. 2008. Retraction. Externally commercializing technology ' +
        'assets: An examination of different process stages. ' +
        'Journal of Business Venturing, 23: 445-464.',
    );
    expect(title.startsWith('Retraction.')).toBe(true);
    expect(title).toContain('Externally commercializing technology assets');
  });

  it('does NOT extend a genuine one-word title into a Place: Publisher source (guard)', () => {
    // A real one-word title followed by "City: Publisher" must NOT be extended.
    const title = titleOf('Burns, J. M. 1978. Leadership. New York: Harper & Row.');
    expect(title).toBe('Leadership.');
  });

  it('parses a normal AOM title up to the first sentence period (guard)', () => {
    const title = titleOf('Egghe, L. 2006. Theory and practice of the g-index. Scientometrics, 69: 131-152.');
    expect(title).toBe('Theory and practice of the g-index.');
    expect(title).not.toContain('Scientometrics');
  });
});
