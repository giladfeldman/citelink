/**
 * Regression: IEEE style detection on SINGLE-INITIAL authors (`[1] W. Yang, ...`).
 *
 * citationguard-iterate cycle 6 — ieee_access_2 (IEEE Access, bracketed `[N]`
 * citations, reference list authors printed initials-first as `W. Yang`,
 * `S. Connolly`, ...). The R-0177 Sonnet canary audit (run against a docpluck
 * v2.4.98 fixture, whose pdftotext engine yields the IEEE text layer's
 * initials-first author order) found citelink detected style=`vancouver`, which
 * routed the reference list to `parseVancouverReference`. That parser expects
 * surname-first authors (`Yang W`) and so kept the whole `W. Yang` token as the
 * surname, making `firstAuthorLastName="W. Yang"` (key `w yang`) instead of
 * `"Yang"` — the gold's first_author. Result: references F1 collapsed 1.000 →
 * 0.000 (0/36 paired), matching accuracy 0.000.
 *
 * Root cause: `hasIEEEAuthors` required at least TWO initials
 * (`[A-Z]\.\s*[A-Z]?\.\s*[A-Z][a-z]` — the second `\.` is mandatory), so it
 * matched `J. A. Smith` but NOT the very common single-initial IEEE author
 * `W. Yang`. With no IEEE author signal, the numeric-paradigm branch fell
 * through to `vancouver`. The fix makes additional initials optional
 * (`[A-Z]\.\s*(?:[A-Z]\.\s*)*[A-Z][a-z]`), so a bracketed `[N] Initial. Surname`
 * (one OR more initials) is recognised as IEEE — which then routes
 * `parseIEEEReference`, correctly extracting `Yang`.
 *
 * This is a real, production-active defect: production feeds citelink docpluck
 * (`method=pdftotext_default`) text, which carries the `W. Yang` initials-first
 * order. The prior 1.000 was a stale-fixture artifact (an older fixture carried
 * the pymupdf surname-first `Yang W` order, which the Vancouver parser handled).
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitationStyle } from '../src/citationStyleDetector.js';
import { analyze } from '../src/analyze.js';

// Real extracted reference-section text from ieee_access_2
// (apps/worker/tests/extraction-results/ieee_access_2.docpluck_academic.txt,
// docpluck v2.4.98 / method=pdftotext_default). Authors are single-initial
// initials-first (`W. Yang`), bracketed `[N]`, quoted titles — canonical IEEE.
const IEEE_REF_SECTION = `
Some prior theoretical results indicate that Petri net SIR models converge [16],
and the fitting abilities of Petri nets compared to ODEs are not considered in
[8], [17], [18], and [19]. These advances underscore the urgency [20], [21].

References
[1] W. Yang, D. Zhang, L. Peng, C. Zhuge, and L. Hong, "Rational evaluation of various epidemic models based on the covid-19 data of china," Epidemics, vol. 37, p. 100501, 2021.
[2] S. Connolly, D. Gilbert, and M. Heiner, "From epidemic to pandemic modelling," Frontiers in Systems Biology, vol. 2, p. 861562, 2022.
[3] P. Castagno, S. Pernice, G. Ghetti, M. Povero, L. Pradelli, D. Paolotti, G. Balbo, M. Sereno, and M. Beccuti, "A computational framework for modeling and studying pertussis epidemiology and vaccination," BMC Bioinformatics, vol. 21, p. 344, Sept. 2020.
[4] F. Pommereau and C. Gaucherel, "A Multivalued, Spatialized, and Timed Modelling Language for Social-Ecological Systems," vol. 3730, p. 13, June 2024.
[5] Z. Wang, T. Wen, and W. Wu, "Modeling and simulation of rumor propagation in social networks based on Petri net theory," in 2015 IEEE 12th International Conference on Networking, Sensing and Control, pp. 492-497, IEEE, Apr. 2015.
[6] R. Aduddell, J. Fairbanks, A. Kumar, and B. T. Shapiro, "A compositional account of motifs, mechanisms, and dynamics in biochemical regulatory networks," Compositionality, vol. 6, May 2024.
[7] M. Herajy, F. Liu, and M. Heiner, "Design patterns for the construction of computational biological models," Briefings in Bioinformatics, vol. 25, p. bbae318, July 2024.
[8] S. Libkind, A. Baas, M. Halter, E. Patterson, and J. P. Fairbanks, "An algebraic framework for structured epidemic modelling," Philosophical Transactions of the Royal Society A, vol. 380, no. 2233, p. 20210309, 2022.
`;

describe('IEEE style detection: single-initial initials-first authors (W. Yang)', () => {
  it('detects style=ieee (not vancouver) on bracketed refs with single-initial authors', () => {
    const r = detectCitationStyle(IEEE_REF_SECTION);
    expect(r.paradigm).toBe('numeric');
    expect(r.style).toBe('ieee');
  });

  it('parses the first reference author as the surname "Yang", not "W. Yang"', () => {
    const result = analyze(IEEE_REF_SECTION);
    expect(result.references.length).toBeGreaterThanOrEqual(8);
    // Routed through parseIEEEReference, the initials-first "W. Yang" yields
    // surname "Yang" (gold's first_author). The Vancouver-parser bug kept the
    // whole "W. Yang" token.
    expect(result.references[0].firstAuthorLastName).toBe('Yang');
    expect(result.references[1].firstAuthorLastName).toBe('Connolly');
    expect(result.references[2].firstAuthorLastName).toBe('Castagno');
  });
});
