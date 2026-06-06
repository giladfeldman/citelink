/**
 * Regression: a surname containing a Latin Extended-A character (U+0100–U+017F),
 * e.g. "Bartoš" (š = U+0161), must parse as the first author.
 *
 * citationguard-iterate cycle 3 — surfaced on collabra_90203. The reference
 * author pattern's LastName body class was `[A-Za-zÀ-ÿ'-]+`, which stops at the
 * Latin-1 Supplement boundary (U+00FF) and excludes Latin Extended-A. So
 * "Bartoš, F., & Maier, M. (2020)..." parsed its FIRST author as "Maier" — the
 * "š" truncated "Bartoš", the comma-author splitter skipped the broken entry,
 * and the second author became first. This cascaded into 3 mis-parsed
 * references + matching misses (every in-text "Bartoš ..." resolved to the wrong
 * or no reference). The rest of the codebase already used `ā-ž`; this brings the
 * straggler into line.
 *
 * The trigger is a MULTI-author comma-separated entry (the multi-author
 * `authorPattern`), not the two-author "&" form. Reference strings verbatim from
 * the collabra_90203 extraction fixture
 * (apps/worker/tests/extraction-results/collabra_90203.pdf_pymupdf.txt, line ~2242).
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

const REFS = `References
Bartoš, F., Maier, M., Wagenmakers, E.-J., Doucouliagos, H., & Stanley, T. D.
(2023). Robust Bayesian meta-analysis: Model-averaging across complementary
publication bias adjustment methods. Research Synthesis Methods, 14(1), 99–116.
Smith, J., Maier, M., & Jones, K. (2021). An ASCII control reference for the
parser. Journal of Testing, 5(2), 1–10.
`;

describe('Latin Extended-A surname parsing', () => {
  const refs = parseReferences(REFS, 'apa');
  const firstAuthors = refs.map((r) => r.firstAuthorLastName);

  it('parses "Bartoš" as the first author of a multi-author entry (š = U+0161 does not truncate it)', () => {
    // Before the fix this entry parsed first author = "Maier" (š truncated "Bartoš",
    // the broken entry was skipped, and the second author became first).
    const robma = refs.find((r) => /research synthesis|robust bayesian/i.test(r.title || ''));
    expect(robma).toBeDefined();
    expect(robma!.firstAuthorLastName).toContain('Bartoš');
  });

  it('ASCII surnames are unaffected', () => {
    expect(firstAuthors.some((a) => a === 'Smith')).toBe(true);
  });
});
