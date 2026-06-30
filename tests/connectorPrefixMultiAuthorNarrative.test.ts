import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';

/**
 * Regression: a sentence-initial connector before a 3+-author narrative citation
 * must not collapse the citation to its LAST author (citationguard-iterate cycle 7,
 * 2026-06-30 — amp_1, R-0177 Sonnet audit).
 *
 * `multiAuthorAndNarrative` matches "A, B, C, and D (year)". The 2026-05-26 fix
 * dropped a match whose first captured token is a sentence connector ("Also,",
 * "Similarly,") so a downstream pattern could re-pick the real citation. That works
 * for a TWO-author list ("Also, Werth and Strack (2003)" → twoAuthorNarrative re-picks
 * "Werth and Strack"). But for a 3+-author list there is NO downstream pattern that
 * recovers the full citation: only `singleNarrative` survives, catching the LAST
 * author ("Similarly, Kickul, Griffiths, Brannback, and Robb (2023)" → spurious
 * "Robb (2023)" with the wrong first author).
 *
 * Fix: strip the leading connector token(s) and re-emit the citation starting at the
 * first real surname, recovering "Kickul, Griffiths, Brannback, and Robb (2023)".
 *
 * NOTE: amp_1's actual occurrence of this citation is additionally corrupted by a
 * docpluck glyph defect ("Brännback" → "Br€ annback", filed to docpluck) which breaks
 * the surname token regardless, so the live-fixture instance only recovers once
 * docpluck fixes the glyph. This test exercises the clean-text form the citelink fix
 * is responsible for.
 */

function firstAuthorRaw(text: string): { raw: string; first: string } {
  const cites = detectCitations(text);
  const c = cites[0];
  return { raw: c?.raw ?? '', first: c?.authors?.[0]?.raw ?? '' };
}

describe('connector-prefixed multi-author narrative (cycle 7)', () => {
  it('keeps the full 4-author citation after "Similarly," (not just the last author)', () => {
    const { raw, first } = firstAuthorRaw('Similarly, Kickul, Griffiths, Brannback, and Robb (2023) replicated these results.');
    expect(raw).toBe('Kickul, Griffiths, Brannback, and Robb (2023)');
    expect(first).toBe('Kickul');
  });

  it('keeps the full 3-author citation after "Furthermore,"', () => {
    const { raw, first } = firstAuthorRaw('Furthermore, Hart, Lane, and Chinn (2018) showed the effect.');
    expect(raw).toBe('Hart, Lane, and Chinn (2018)');
    expect(first).toBe('Hart');
  });

  it('still re-picks a TWO-author citation after "Also," (downstream pattern, guard)', () => {
    const { raw, first } = firstAuthorRaw('Also, Werth and Strack (2003) found support.');
    expect(raw).toBe('Werth and Strack (2003)');
    expect(first).toBe('Werth');
  });

  it('still handles a single-author citation after "Also," (guard)', () => {
    const { raw, first } = firstAuthorRaw('Also, Smith (2020) found support.');
    expect(raw).toBe('Smith (2020)');
    expect(first).toBe('Smith');
  });

  it('does not alter a 3-author citation with NO leading connector (guard)', () => {
    const { raw, first } = firstAuthorRaw('Hart, Lane, and Chinn (2018) showed the effect.');
    expect(raw).toBe('Hart, Lane, and Chinn (2018)');
    expect(first).toBe('Hart');
  });
});
