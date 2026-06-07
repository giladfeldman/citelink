/**
 * Regression: plain-digit (PDF-superscript) citation detection discarded real
 * citations because two false-positive guards over-fired.
 *
 * citationguard-iterate (session 2026-06-07b) cycle 3 — surfaced on nat_comms_2.
 *
 * 1. PLAIN_DIGIT_FP_WORD was anchored only at the END ($), so it matched any word
 *    ENDING in an FP token: "follow-up26" → "up" matched "pp?" (page), so the
 *    superscript "26" was dropped. Now anchored at BOTH ends (^…$): "up" ≠ "p",
 *    while "page"/"pp"/"Table"/"Fig" still match exactly and are still skipped.
 * 2. The consecutive-uppercase acronym guard ("BRCA1", "IMpower150") also killed
 *    a superscript that immediately follows a parenthetical acronym — "(CSF)13" —
 *    because "CSF" precedes the digit. The guard is now exempted when the digit
 *    follows a closing paren, which is a citation signal, not a name-with-number.
 *
 * Text snippets are verbatim from the nat_comms_2 extraction fixture.
 */
import { describe, it, expect } from '@jest/globals';
import { detectNumericCitations } from '../src/numericCitationDetector.js';

const numbersIn = (text: string): number[] => {
  const cites = detectNumericCitations(text);
  return cites.flatMap((c) => c.citationNumbers ?? []);
};

describe('plain-digit FP-guard anchoring (cycle 3)', () => {
  it('detects a superscript after a parenthetical acronym: "(CSF)13"', () => {
    const text =
      'In addition, virus and/or anti-viral antibodies were rarely found in cerebrospinal fluid (CSF)13. Another sentence follows here.';
    expect(numbersIn(text)).toContain(13);
  });

  it('detects a superscript after a hyphenated word ending in an FP-like suffix: "follow-up26"', () => {
    const text =
      'another study showed that baseline CSF NfL levels correlated with neurological outcomes at follow-up26 but overall the relationship was weak.';
    expect(numbersIn(text)).toContain(26);
  });

  it('detects "online47"-style (word ending in "Line") — both-ends anchor guard', () => {
    const text = 'The full protocol is available online47 and was pre-registered.';
    expect(numbersIn(text)).toContain(47);
  });

  it('STILL skips genuine cross-references where the FP word is the WHOLE word', () => {
    // These must NOT be detected as citations — the FP guard still applies when
    // the preceding token IS the FP word exactly.
    expect(numbersIn('As shown in Table13 the effect held.')).not.toContain(13);
    expect(numbersIn('see page5 for details')).not.toContain(5);
    expect(numbersIn('described on pp23 of the manual')).not.toContain(23);
  });

  it('STILL skips a name-with-embedded-number that is NOT after a paren ("BRCA1")', () => {
    // The acronym guard still fires when the digit is glued to the acronym body
    // (no closing paren between them).
    expect(numbersIn('Mutations in BRCA1 were assessed in the cohort.')).not.toContain(1);
  });
});
