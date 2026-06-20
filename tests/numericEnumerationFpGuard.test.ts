/**
 * Regression: the parenthetical-numeric branch fabricated citations from body
 * **list enumerations** — "the exclusion criteria were as follows: (1) … ; (2) …".
 *
 * citationguard-iterate 2026-06-20 cycle 5 — surfaced on sci_rep_3
 * (10.1038/s41598-023-50401-z, Nature/superscript style). The paper has NO
 * genuine parenthetical citations (its citations are bare superscripts), yet the
 * `(N)` branch (active because the paper has <3 bracket citations) emitted the
 * inclusion/exclusion-criteria enumerators as 7 spurious in-text citations
 * (intext precision 0.885). An enumeration marker is introduced by ':'/';' and
 * followed by a lowercase clause — a real numeric citation never is. The guard is
 * keyed on that structural signature, not on sci_rep_3.
 *
 * Negative assertions use verbatim sci_rep_3 fixture text. Positive controls are
 * synthetic, asserting the guard does not over-skip real parenthetical citations.
 */
import { describe, it, expect } from '@jest/globals';
import { detectNumericCitations } from '../src/numericCitationDetector.js';

const numbersIn = (text: string): number[] => {
  const cites = detectNumericCitations(text);
  return cites.flatMap((c) => c.citationNumbers ?? []);
};
const parentheticalRawsIn = (text: string): string[] =>
  detectNumericCitations(text)
    .map((c) => String(c.raw).trim())
    .filter((raw) => /^\(\d+\)$/.test(raw));

describe('numeric parenthetical enumeration FP guard (2026-06-20)', () => {
  it('does NOT detect ":"-introduced enumeration items as citations (verbatim sci_rep_3)', () => {
    const text =
      'The exclusion criteria were as follows: (1) survival months = 0 or ' +
      'unknown, n = 222; (2) unknown race, n = 22; (2) unknown stage, n = 486; ' +
      '(4) unknown site, n = 51; and (5) unknown grade, n = 1118.';
    // None of the enumerators are citations — they are list items.
    expect(parentheticalRawsIn(text)).toEqual([]);
  });

  it('does NOT detect a ";"-separated enumeration item in discussion prose', () => {
    const text =
      'so that further research can be conducted; (3) the model should be ' +
      'validated externally before clinical use.';
    expect(numbersIn(text)).not.toContain(3);
  });

  it('STILL detects a real parenthetical citation not introduced by ":"/";"', () => {
    // PNAS-style: the marker follows prose, not a list-introducer.
    const text = 'This effect has been reported previously (1). A review followed.';
    expect(numbersIn(text)).toContain(1);
  });

  it('STILL detects a real parenthetical citation group after a colon + punctuation', () => {
    // "see refs: (1, 2)." — followed by a comma/paren-close + period, NOT a
    // lowercase clause, so it is a citation list, not an enumeration.
    const text = 'The mechanism is well established: see refs (1, 2). Details follow.';
    expect(numbersIn(text)).toContain(2);
  });
});
