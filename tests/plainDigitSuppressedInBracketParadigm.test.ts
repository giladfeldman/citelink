/**
 * Regression: the plain-digit "superscript" recovery fabricated in-text
 * citations from math variables in BRACKET-paradigm papers.
 *
 * citationguard-iterate (2026-06-08) — surfaced on ieee_access_2.
 *
 * The plain-digit branch of `detectNumericCitations` exists to recover
 * Nature/AMA superscript citations that PDF extraction flattened onto the
 * preceding word ("integrity1" = integrity¹). It ran UNCONDITIONALLY, so in a
 * bracket-paradigm paper (IEEE / Vancouver — citations written "[n]") it read a
 * digit glued to a word as a citation. The IEEE Access ODE-modelling paper
 * defines variables "beta1" and "beta2"; the recovery emitted them as citations
 * "a1" / "a2" (10 spurious in-text citations — an academic-integrity tool must
 * never fabricate a citation from a math variable). plos_med_1 had the same
 * class ("s1", "i2"). Both papers carry dozens of real "[n]" bracket citations,
 * so glued digits there are never citations.
 *
 * Fix: gate the plain-digit recovery on bracket scarcity, mirroring the
 * parenthetical-numeric and standalone-number branches, which already suppress
 * themselves when bracket citations are abundant. Superscript-paradigm papers
 * (nat_comms_2: 0 brackets, 581 glued superscripts) keep the recovery untouched.
 *
 * All bracket / variable fragments below are verbatim from the ieee_access_2
 * docpluck-academic extraction fixture.
 */
import { describe, it, expect } from '@jest/globals';
import { detectNumericCitations } from '../src/numericCitationDetector.js';

/** A bracket-paradigm passage (real IEEE [n] citations) that also defines the
 * math variables "beta1" / "beta2". Fragments verbatim from ieee_access_2. */
const BRACKET_PARADIGM_TEXT = [
  'COVID-19 spread within and across countries [1], [2], pertussis vaccination [3],',
  'social-ecological systems [4], rumor propagation in social networks [5], and the',
  'behavior of network motifs [6]. Methods that enable large-scale simulation',
  'including deterministic and stochastic behaviors [9], [10], [11], [12].',
  'First, we define beta, beta1, and beta2 to have a range of [0, 1], as they',
  'represent the proportion of individuals. The model is enabled if I > beta1,',
  'rather than beta2S where beta2 is defined as a separate compartment.',
].join('\n');

/** A superscript-paradigm passage: no bracket citations, glued superscripts. */
const SUPERSCRIPT_PARADIGM_TEXT =
  'The assay confirmed cellular integrity1 across all replicates, and cell ' +
  'viability2 was preserved throughout the protocol described elsewhere5.';

const rawsOf = (text: string): string[] =>
  detectNumericCitations(text).map((c) => String(c.raw));

const numbersIn = (text: string): number[] =>
  detectNumericCitations(text).flatMap((c) => c.citationNumbers ?? []);

describe('plain-digit recovery is suppressed in bracket-paradigm papers', () => {
  it('does NOT fabricate citations from math variables (beta1/beta2 → a1/a2)', () => {
    const raws = rawsOf(BRACKET_PARADIGM_TEXT);
    // Plain-digit-glued signature: a lowercase letter immediately followed by a
    // digit ("a1", "a2", "s1"). There must be none in a bracket-paradigm text.
    const plainDigitFP = raws.filter((r) => /^[a-z]\d/.test(r));
    expect(plainDigitFP).toEqual([]);
  });

  it('still detects the real [n] bracket citations in the same text', () => {
    const nums = numbersIn(BRACKET_PARADIGM_TEXT);
    // The bracket citations [1]–[6], [9]–[12] must all survive.
    for (const n of [1, 2, 3, 4, 5, 6, 9, 10, 11, 12]) {
      expect(nums).toContain(n);
    }
    // The math interval "[0, 1]" must NOT be read as a citation (contains 0).
    expect(nums).not.toContain(0);
  });

  it('does NOT regress superscript-paradigm papers (no brackets → recovery runs)', () => {
    // With zero bracket citations the recovery must still fire and pick up the
    // PDF-flattened superscripts "integrity1", "viability2", "elsewhere5".
    const nums = numbersIn(SUPERSCRIPT_PARADIGM_TEXT);
    expect(nums).toContain(1);
    expect(nums).toContain(2);
    expect(nums).toContain(5);
  });
});
