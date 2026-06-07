/**
 * Regression: a hyphenated alphanumeric compound split across a line break with a
 * NUMERIC tail — "COVID-\n19", "SARS-CoV-\n2", "IL-\n6" — truncated the reference
 * and fabricated a fragment.
 *
 * citationguard-iterate (session 2026-06-07b) N1 — surfaced on nat_comms_2 ref #2.
 * "… Long-term neurologic outcomes of COVID-\n19. Nat. Med. 28, … (2022)." — the
 * orphaned "19." started its own line and the numbered-reference splitter read it
 * as reference #19, so the Xu entry was cut at "COVID-" (its year/journal lost)
 * and a fragment was fabricated. The fix rejoins "COVID-\n19" → "COVID-19" KEEPING
 * the semantic hyphen (unlike word-hyphenation, which removes it). Same family as
 * the v0.7.10 digit-range split fix, but for letter-hyphen-digit.
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

const REFS = `References
1. Drake, T. M. et al. Characterisation of in-hospital complications. Lancet 398, 223–237 (2021).
2. Xu, E., Xie, Y. & Al-Aly, Z. Long-term neurologic outcomes of COVID-
19. Nat. Med. 28, 2406–2415 (2022).
3. Varatharaj, A. et al. Neurological and neuropsychiatric complications. Lancet Psychiatry 7, 875–882 (2020).
`;

describe('compound hyphen line-split (N1)', () => {
  const refs = parseReferences(REFS, 'nature');

  it('keeps the Xu reference intact (year recovered, not cut at "COVID-")', () => {
    const xu = refs.find((r) => (r.authors[0]?.lastName || '').includes('Xu'));
    expect(xu).toBeDefined();
    expect(xu!.year).toBe('2022');
    expect(xu!.title || '').toMatch(/COVID-19/);
  });

  it('does NOT fabricate a fragment reference numbered 19', () => {
    // Before the fix, "19. Nat. Med. …" became its own bogus entry.
    const bogus = refs.find((r) => r.listNumber === 19);
    expect(bogus).toBeUndefined();
  });
});
