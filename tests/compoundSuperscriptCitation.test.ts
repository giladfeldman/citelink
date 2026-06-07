/**
 * Regression: a superscript citation list glued to a disease-name compound was
 * never detected — "COVID-1914,27" (i.e. "COVID-19" + superscript "14,27").
 *
 * citationguard-iterate (session 2026-06-07b) cycle 4 — surfaced on nat_comms_2.
 * The compound's own 2-digit number and the citation digits fuse into one run
 * ("COVID-19"+"14,27" → "COVID-1914,27"), so the plain-digit pattern (which needs
 * a [a-z.)"] separator before the digits) never matched, and the preceding-digit
 * guard would have rejected it anyway. A real number is never written "1914,27",
 * so a 2+-member comma/range list glued to a "WORD-NN" token is a citation.
 *
 * Text snippets are verbatim from the nat_comms_2 extraction fixture.
 */
import { describe, it, expect } from '@jest/globals';
import { detectNumericCitations } from '../src/numericCitationDetector.js';

const numbersIn = (text: string): number[] => {
  const cites = detectNumericCitations(text);
  return cites.flatMap((c) => c.citationNumbers ?? []);
};

describe('compound-superscript citation detection (cycle 4)', () => {
  it('detects a comma list glued to COVID-19: "COVID-1914,27"', () => {
    const text =
      'specific neuronal autoantibodies have been reported in some neurological patients following COVID-1914,27 and other infections.';
    const n = numbersIn(text);
    expect(n).toContain(14);
    expect(n).toContain(27);
  });

  it('detects a comma list glued to COVID-19 at end of sentence: "COVID-1940,41."', () => {
    const text =
      'this phenotype persists months after COVID-1940,41. Animal models have provided key insights.';
    const n = numbersIn(text);
    expect(n).toContain(40);
    expect(n).toContain(41);
  });

  it('detects "COVID-1921,22" and "studies14,52"', () => {
    expect(numbersIn('immune responses in COVID-1921,22 were elevated.')).toEqual(
      expect.arrayContaining([21, 22]),
    );
    expect(numbersIn('this aligns with previous studies14,52 in the field.')).toEqual(
      expect.arrayContaining([14, 52]),
    );
  });

  it('does NOT treat a genuine hyphenated number as a citation list', () => {
    // No comma/range list after the 2-digit compound number → not a citation.
    // "COVID-19" alone, and "COVID-19 patients", must yield no 19-from-compound.
    const n = numbersIn('Patients with COVID-19 were enrolled in the study.');
    // 19 may legitimately appear elsewhere as a real citation, but the bare
    // compound here must not fabricate a citation list.
    expect(numbersIn('Patients with COVID-19 were enrolled.')).toEqual([]);
    void n;
  });

  it('does NOT mis-split a thousands-style number', () => {
    // "in 2019,234 cases" — "2019" is a year, ",234" a thousands group; the
    // [A-Za-z]{3,}-\d\d compound prefix is absent, so no false citation.
    expect(numbersIn('There were 2019,234 reported cases overall.')).not.toContain(234);
  });
});
