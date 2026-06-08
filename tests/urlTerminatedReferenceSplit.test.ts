/**
 * Regression: a reference whose trailing field is a URL / DOI must not swallow the
 * NEXT reference when they are concatenated without a clean separator.
 *
 * citationguard-iterate 2026-06-08c — collabra_90203 (O1 root). The reference list
 * in modern APA papers ends most entries with a URL/DOI, and docpluck extracts that
 * URL verbatim WITHOUT a trailing period (often with injected spaces: "package=RoBMA",
 * ".../osf.io/75bqn", ".../osf.io/tkm pc", ".../OSF.IO/A2TGB"). So the character
 * before the next reference is a LETTER. splitConcatenatedApaReferences only split a
 * concatenation when the previous reference ended in ')' '.' or a digit
 * (`(?<=[).\d])`), so a URL-terminated reference swallowed the following entry whole:
 *
 *   "…package=RoBMA Bartoš, F., Maier, M., Quintana… (2022)…"   ← 3 distinct
 *   "…osf.io/75bqn  Bartoš, F., Maier, M., Shanks…    (2022)…"      "Bartoš … (2022)"
 *   "…osf.io/tkmpc  Bartoš, F., Maier, M., Wagenmakers (2022)…"     refs were lost
 *   "…OSF.IO/A2TGB  McKenzie, C. R., Sher…            (2018)…"   ← McKenzie lost
 *
 * citelink parsed only the first entry of each run (e.g. "Bartoš 2020"), so the 3
 * Bartoš 2022 references + McKenzie 2018 were missing, and every in-text "Bartoš …,
 * 2022" / "McKenzie et al., 2018" citation went unmatched (matching.accuracy 0.904).
 *
 * Fix: accept a split when the reference being closed ENDS with a URL/DOI (anchored at
 * the boundary, allowing docpluck's space-broken URL tokens), provided the whitespace
 * is not inside an author list (',' '&' / 'and' / initial). Recovering the refs lifted
 * collabra matching.accuracy 0.904 → 0.959 and references.key_only.f1 0.972 → 1.000.
 *
 * Guard (same fix): a long multi-author entry whose start could not be split off must
 * NOT be FRAGMENTED at an interior particle surname ("van't Veer") just because an
 * earlier reference carried a URL — the URL must be LOCAL to the boundary, not merely
 * present somewhere in the accumulated text.
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences, splitConcatenatedApaReferences } from '../src/referenceParser.js';

// Verbatim collabra_90203 reference text (DOIs lightly trimmed for length; the URL
// tails still end in a LETTER, which is what triggers the defect). The Bartoš run is
// URL-concatenated on one block (the real defect); Hsee→Isager keep the real newline.
const SECTION = `References

Baron, J., & Greene, J. (1996). Determinants of insensitivity to quantity in valuation of public goods. Journal of Experimental Psychology: Applied, 2(2), 107-125. https://doi.org/10.1037/1076-898x.2.2.107 Bartoš, F., & Maier, M. (2020). RoBMA: An R package for robust Bayesian meta-analyses. R package version 2.1.1. https://CRAN.R-project.org/package=RoBMA Bartoš, F., Maier, M., Quintana, D. S., & Wagenmakers, E.-J. (2022). Adjusting for publication bias in JASP and r. Advances in Methods and Practices in Psychological Sciences. https://doi.org/10.31234/osf.io/75bqn Bartoš, F., Maier, M., Shanks, D., Stanley, T. D., Sladekova, M., & Wagenmakers, E.-J. (2022). MetaAnalyses in Psychology Often Overestimate Evidence for and Size of Effects. https://doi.org/10.31234/osf.io/tkmpc Bartoš, F., Maier, M., Wagenmakers, E.-J., Doucouliagos, H., & Stanley, T. D. (2022). Robust Bayesian metaanalysis: Model-averaging across complementary publication bias adjustment methods. Research Synthesis Methods. https://doi.org/10.1002/jrsm.1594
Hsee, C. K., Zhang, J., Lu, Z. Y., & Xu, F. (2013). Unit asking: A method to boost donations and beyond. Psychological Science, 24(9), 1801-1808. https://doi.org/10.1177/0956797613482947
Isager, P. M., van Aert, R. C. M., Bahník, Š., Brandt, M. J., DeSoto, K. A., Giner-Sorolla, R., Krueger, J. I., Perugini, M., Ropovik, I., van't Veer, A. E., Vranka, M., & Lakens, D. (2021). Deciding what to replicate. Psychological Methods. https://doi.org/10.1037/met0000438 Stulp, G. (2014). Replication and extensions. Open Science Framework. https://doi.org/10.17605/OSF.IO/A2TGB McKenzie, C. R., Sher, S., Leong, L. M., & Müller-Trede, J. (2018). Constructed preferences. Review of Behavioral Economics, 5(3-4), 337-370. https://doi.org/10.1561/105.00000091`;

describe('reference splitting: URL-terminated references do not swallow the next entry', () => {
  const refs = parseReferences(SECTION, 'apa');

  it('recovers all three distinct "Bartoš … (2022)" references swallowed after URLs', () => {
    const bartos2022 = refs.filter(
      r => /barto/i.test(r.firstAuthorLastName) && String(r.year) === '2022',
    );
    expect(bartos2022.length).toBe(3);
    // The three are distinct papers (Quintana / Shanks / Wagenmakers-Doucouliagos);
    // their titles must not all collapse to one.
    const titles = new Set(bartos2022.map(r => (r.title || '').slice(0, 20)));
    expect(titles.size).toBe(3);
  });

  it('recovers the McKenzie 2018 reference swallowed after a URL-terminated entry', () => {
    expect(
      refs.some(r => /mckenzie/i.test(r.firstAuthorLastName) && String(r.year) === '2018'),
    ).toBe(true);
  });

  it('does NOT fragment the long multi-author Isager 2021 entry (URL-locality guard)', () => {
    expect(
      refs.some(r => /isager/i.test(r.firstAuthorLastName) && String(r.year) === '2021'),
    ).toBe(true);
    // The interior particle surname "van't Veer" must never become a reference start.
    expect(refs.some(r => /^veer$/i.test(r.firstAuthorLastName))).toBe(false);
    expect(refs.some(r => /^perugini$/i.test(r.firstAuthorLastName))).toBe(false);
  });
});

describe('splitConcatenatedApaReferences: unit behavior', () => {
  it('splits a URL-concatenated run of same-author references into separate entries', () => {
    const block =
      'Bartoš, F., & Maier, M. (2020). RoBMA: An R package for robust Bayesian meta-analyses. ' +
      'R package version 2.1.1. https://CRAN.R-project.org/package=RoBMA ' +
      'Bartoš, F., Maier, M., Quintana, D. S., & Wagenmakers, E.-J. (2022). Adjusting for publication bias. ' +
      'Advances in Methods and Practices in Psychological Sciences. https://doi.org/10.31234/osf.io/75bqn ' +
      'Bartoš, F., Maier, M., Shanks, D., Stanley, T. D., Sladekova, M., & Wagenmakers, E.-J. (2022). MetaAnalyses in Psychology. ' +
      'https://doi.org/10.31234/osf.io/tkmpc ' +
      'Bartoš, F., Maier, M., Wagenmakers, E.-J., Doucouliagos, H., & Stanley, T. D. (2022). Robust Bayesian metaanalysis. ' +
      'Research Synthesis Methods. https://doi.org/10.1002/jrsm.1594';
    const parts = splitConcatenatedApaReferences(block);
    expect(parts.length).toBe(4);
    // Every part must start with the real first author "Bartoš", not an orphaned
    // second author "Maier" (the over-split failure mode).
    for (const p of parts) expect(p.startsWith('Bartoš')).toBe(true);
  });

  it('does not fragment a multi-author entry whose preceding reference ended in a URL', () => {
    const block =
      'Hsee, C. K., Zhang, J., Lu, Z. Y., & Xu, F. (2013). Unit asking. Psychological Science, 24(9), 1801-1808. https://doi.org/10.1177/0956797613482947 ' +
      "Isager, P. M., van Aert, R. C. M., Bahník, Š., Brandt, M. J., DeSoto, K. A., Krueger, J. I., Perugini, M., Ropovik, I., van't Veer, A. E., Vranka, M., & Lakens, D. (2021). Deciding what to replicate. Psychological Methods. https://doi.org/10.1037/met0000438 " +
      'JASP Team. (2023). JASP (Version 0.17). [Computer software].';
    const parts = splitConcatenatedApaReferences(block);
    // No part may BEGIN at an interior author of the Isager list ("Veer"/"Perugini"):
    // that is the fragmentation regression the URL-locality guard prevents.
    for (const p of parts) {
      expect(/^Veer\b/.test(p)).toBe(false);
      expect(/^Perugini\b/.test(p)).toBe(false);
    }
  });
});
