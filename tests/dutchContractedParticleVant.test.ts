import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser';

/**
 * Regression: the Dutch contracted tussenvoegsel "van 't" written closed-up as "van't"
 * was dropped from the first-author surname (citationguard-iterate 2026-06-25, chen —
 * R-0177 Sonnet canary audit).
 *
 * "van't Veer, A. E., & Giner-Sorolla, R. (2016)." parsed first_author = "Veer", not
 * "van't Veer": the surname-extraction particle alternation matched only "[Vv]an" and
 * then required whitespace, which the apostrophe ("'t") broke, so the whole particle was
 * skipped and the surname parser keyed the author as "Veer". chen cites
 * "(van't Veer & Giner-Sorolla, 2016)" twice; both in-text citations then resolved to the
 * WRONG reference (matching.wrong_target x2), and refs.f1 carried a parse error.
 *
 * Fix (referenceParser, particleAlt + NAME_PARTICLES): admit "[Vv]an(?:'[ts])?" and a
 * bare "'t"/"'s" so "van't" / "van's" / "'t Hart" are recognized as particles and kept
 * with the surname. Plain particles ("van Raan", "von …") are unaffected.
 *
 * Tests run the real parseReferences on the verbatim chen reference string and assert the
 * surname round-trips, plus a non-regression guard on a plain "van" particle.
 */

function firstAuthorOf(refLine: string) {
  const doc = 'Body text.\n\nReferences\n\n' + refLine;
  return parseReferences(doc, 'apa')[0];
}

describe("Dutch contracted particle van't (chen R-0177)", () => {
  it("keeps van't with the surname (van't Veer 2016, verbatim from chen)", () => {
    const ref = firstAuthorOf(
      "van't Veer, A. E., & Giner-Sorolla, R. (2016). Pre-registration in social " +
      'psychology--A discussion and suggested template. Journal of Experimental Social ' +
      'Psychology, 67, 2-12.'
    );
    expect(ref).toBeDefined();
    expect(ref.firstAuthorLastName).toBe("van't Veer");
    expect(ref.authors?.[0]?.lastName).toBe("van't Veer");
    // The bug keyed it as the bare surname.
    expect(ref.firstAuthorLastName).not.toBe('Veer');
  });

  it('does not regress a plain "van" particle (van Raan)', () => {
    const ref = firstAuthorOf(
      'van Raan, A. F. J. (2006). Comparison of bibliometric indicators. ' +
      'Scientometrics, 67, 491-502.'
    );
    expect(ref.firstAuthorLastName).toBe('van Raan');
  });
});
