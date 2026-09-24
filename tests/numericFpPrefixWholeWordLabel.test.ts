/**
 * Regression: the bracket branch's non-citation prefix guard (FALSE_POSITIVE_PREFIX)
 * discarded real numeric citations in two ways.
 *
 * 1. It was END-anchored only, so it fired on any word that merely ENDS in a label
 *    token: "relatio[nship]"→"p", "profi[table]", "counter[part]", "on-[line]",
 *    "WGAN-G[P]". Every "[n]" after such a word was dropped — the same defect the
 *    plain-digit branch fixed on 2026-06-07 by anchoring both ends.
 * 2. It treated a LOWERCASE prose noun as a document label. "Model 2", "Experiment 1",
 *    "Step 3" are labels; "the SIR model [13]", "the Gillespie algorithm [27]",
 *    "a study protocol [23]" are what a paper cites a source FOR. The line break
 *    before "[13]" in ieee_access_2 is irrelevant: the same sentence on one line was
 *    dropped too (measured, 2026-09-24 — the line-initial hypothesis was refuted).
 *
 * Surfaced on ieee_access_2 (10.1109/ACCESS.2025.3645087): gold num:13 missed, in-text
 * F1 0.989. Distribution across 147 extracted article texts / 89 bracket-paradigm papers:
 * the guard fired 39 times; in the numeric papers the lowercase-noun and suffix hits
 * were citations, and the one genuine lowercase label was an element noun
 * ("differential equation [3]"), which this fix keeps skipping.
 *
 * The ieee_access_2 input is VERBATIM from its docpluck-academic extraction.
 */
import { describe, it, expect } from '@jest/globals';
import { detectNumericCitations } from '../src/numericCitationDetector.js';

const numbersIn = (text: string): number[] =>
  detectNumericCitations(text).flatMap((c) => c.citationNumbers ?? []);

describe('numeric bracket FP-prefix guard: whole words, lowercase prose nouns (2026-09-24)', () => {
  it('detects [13] after "the SIR model" across a line break (ieee_access_2, verbatim)', () => {
    const text =
      'These parameters are known to control the relative asymptotic convergence of PN, ' +
      'ODE, and SDE systems for the SIR model\n[13]. Since the deterministic, dynamic arc ' +
      'weight implementation of the SIRS model is novel in the PN literature, we give more ' +
      'attention to the details of its implementation.';
    expect(numbersIn(text)).toContain(13);
  });

  it('detects [13] after "the SIR model" on one line (the line break is not the cause)', () => {
    expect(numbersIn('convergence of PN, ODE, and SDE systems for the SIR model [13]. Since')).toContain(13);
  });

  it.each([
    ['the Gillespie algorithm [27] was used', 27],
    ['peer review of a prespecified study protocol [23] followed', 23],
    ['prolonged postures, e.g., in a sitting condition [6], were', 6],
    ['replicated in an independent large-scale sample [14], and', 14],
    ['a VGG-Face CNN model [28] pre-trained on faces', 28],
  ])('detects a citation after a lowercase prose noun: %s', (text, n) => {
    expect(numbersIn(text)).toContain(n);
  });

  it.each([
    ['a strong relationship [5] between the two', 5],
    ['echo chambers abound both in person and online [3] today', 3],
    ['the full code available on-line [27] and', 27],
    ['its empirical counterpart [11] closely', 11],
    ['for CELEBA-HQ we rely on WGAN-GP [24], and', 24],
    ['a skill that takes time to develop [41] in', 41],
  ])('detects a citation after a word that merely ENDS in a label token: %s', (text, n) => {
    expect(numbersIn(text)).toContain(n);
  });

  it.each([
    ['As shown in Table [1], the results', 1],
    ['See Figure [2] for the diagram.', 2],
    ['as in Fig. [3] above', 3],
    ['substituting into Eq. [4] gives', 4],
    ['Model [2] adds the covariates', 2],
    ['must satisfy the following differential equation [3]', 3],
    ['reported in Section [5] below', 5],
    ['on page [7] of the manual', 7],
  ])('STILL skips a document-element or capitalised label: %s', (text, n) => {
    expect(numbersIn(text)).not.toContain(n);
  });

  it('keeps the existing behaviour when a period separates the noun and the bracket', () => {
    // "our model. [3]" — a lowercase noun that ENDS a sentence is not the
    // "noun [n]" citation shape this fix admits; that case is left as it was.
    expect(numbersIn('responses for all three shocks in our model. [3] Consistent with')).not.toContain(3);
  });
});
