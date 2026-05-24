/**
 * Regression: Vancouver vs AMA discriminator in detectCitationStyle.
 *
 * citationguard-iterate cycle 4 — plos_med_1 (PLOS Medicine, bracketed
 * Vancouver `[N]` citations, 24+ in-text brackets, Vancouver-style refs) was
 * detected as `ama`. Root cause: the numeric-paradigm sub-branch chose
 * Nature/AMA whenever `effectiveSuperscriptCount > bracketCount`, where
 * `effectiveSuperscriptCount = superscriptCount + plainDigitCount`. The
 * `plainDigitCount` proxy for PDF-extracted superscripts is noisy on
 * statistics-heavy papers (decimal values, page numbers, table cells), and
 * inflated past `bracketCount` even when 24 real `[N]` citations were
 * present. The fix uses only Unicode `superscriptCount` (the hard signal)
 * against `bracketCount` once `bracketCount >= 5`, so real bracket citations
 * dominate noisy plain-digit "superscripts".
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitationStyle } from '../src/citationStyleDetector.js';

describe('Vancouver vs AMA: hard bracketed citations dominate noisy plain-digit signals', () => {
  it('detects vancouver when the body has many `[N]` brackets and Vancouver refs (PLOS-style)', () => {
    // Mimic a PLOS Medicine body: many [N] brackets, no Unicode superscripts,
    // but lots of decimal-heavy statistics that countPlainDigitSuperscripts
    // would otherwise misread as superscript citations.
    const body = Array.from({ length: 12 }, (_, i) =>
      `Some clinical finding here [${i + 1}]. Another statement with mean 12.5 and p=0.034 [${i + 2}]. The odds ratio was 1.27 (95% CI 0.91-1.78) [${i + 3},${i + 4}].`
    ).join('\n');
    const refs = `
References
1. Smith JA, Jones BC. A clinical trial of widgets. N Engl J Med. 2020;382(1):1-10.
2. Brown DE, White F. Outcomes of widget therapy. Lancet. 2019;394(10):2233-40.
3. Penk W. A meta-analysis. JAMA. 2018;320(5):450-9.
4. Adler D, Ansell B. Housing policy. BMJ. 2020;368:m1234.
5. Chen X. Statistical methods. Stat Med. 2017;36(15):2345-60.
`;
    const text = body + '\n' + refs;
    const r = detectCitationStyle(text);
    expect(r.style).toBe('vancouver');
    expect(r.paradigm).toBe('numeric');
  });

  it('still detects ama when bracket citations are absent and superscripts dominate', () => {
    const text = `
A clinical observation.¹ Another sentence.² Yet another.³⁻⁵ More findings.⁶
References
1. Smith JA, Jones BC. A clinical trial. JAMA. 2020;323(1):1-10.
2. Brown DE. Outcomes. JAMA. 2019;321(5):450-9.
3. Penk W. Meta-analysis. JAMA. 2018;320(5):500-10.
4. Adler D. Statistical methods. JAMA. 2017;317(15):1500-10.
5. Chen X. Sample size. JAMA. 2016;315(10):1100-8.
6. Lee H. Outcomes. JAMA. 2015;314(5):500-8.
`;
    const r = detectCitationStyle(text);
    expect(r.paradigm).toBe('numeric');
    expect(['ama', 'nature']).toContain(r.style);
  });
});
