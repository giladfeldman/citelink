import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';
import { parseReferences } from '../src/referenceParser';
import { matchCitationsToReferences } from '../src/citationMatcher';

/**
 * Regression: et-al in-text citations failed to match an et-al REFERENCE
 * (citationguard-iterate 2026-06-25, bjps_1 — TC-5).
 *
 * Harvard / Vancouver / AOM reference lists frequently abbreviate a 3+ author
 * entry as "Sides J et al. (2019)" — so `parseReferences` reports authorCount=1
 * for that reference. The et-al matcher required `reference.authorCount >= 3` and
 * otherwise returned a 0.2 author score; combined with an exact year that landed
 * at confidence 0.396, BELOW the 0.4 suggested-match threshold, so a CORRECT
 * match ("Sides et al. 2019" → "Sides J et al. (2019)") was dropped as no_match.
 * On bjps_1, 49 of 102 citations were wrongly rejected this way (matching 0.622).
 *
 * Fix: a reference whose raw text contains "et al." is itself a truncated 3+
 * author list — never abbreviated for 1-2 authors — so the <3 penalty must not
 * apply to it. matching rose to 0.945 with zero false matches added.
 */

const DOC = `
Recent work (Sides et al. 2019; Grasso et al. 2019) and meta-analytic methods
(Borenstein et al. 2009) inform this study, alongside Cools et al. (2021).

References
Sides J et al. (2019) Identity Crisis. Princeton: Princeton University Press.
Grasso MT et al. (2019) Thatcher's children, Blair's babies, political socialisation. British Journal of Political Science 49, 17-36.
Borenstein M et al. (2009) Introduction to Meta-Analysis. Chichester: Wiley.
Cools S et al. (2021) Local immigration and support for anti-immigration parties. American Journal of Political Science 65, 988-1006.
`;

describe('et-al citation matched to an et-al reference (bjps_1 TC-5)', () => {
  it('matches an "et al." citation to a reference written with "et al." (authorCount=1)', () => {
    const style = 'harvard' as const;
    const cites = detectCitations(DOC);
    const refs = parseReferences(DOC, style);
    const matched = matchCitationsToReferences(cites, refs);

    // The reference list entries are truncated et-al lists → authorCount 1.
    const sidesRef = refs.find((r) => (r.raw || '').startsWith('Sides'));
    expect(sidesRef).toBeDefined();
    expect(sidesRef!.authorCount).toBe(1);

    // Every et-al citation must resolve to its (et-al) reference, not be dropped.
    for (const name of ['Sides', 'Grasso', 'Borenstein', 'Cools']) {
      const entry = matched.find((mm) => (mm.citation?.raw || '').includes(name));
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('matched');
      expect(entry!.reference).toBeTruthy();
    }
  });

  it('still REJECTS an "et al." citation against a genuine 1-author reference (no over-match)', () => {
    // Guard: the relaxation is keyed on "et al." IN THE REFERENCE. A solo-author
    // reference (no "et al.") must still not absorb an et-al citation for a
    // different work that merely shares the surname + year is absent.
    const doc = `
A claim is made (Smithson et al. 2018).

References
Smith J (2018) A single-author book with no co-authors. Oxford: Oxford University Press.
`;
    const cites = detectCitations(doc);
    const refs = parseReferences(doc, 'harvard');
    const matched = matchCitationsToReferences(cites, refs);
    const entry = matched.find((mm) => (mm.citation?.raw || '').includes('Smithson'));
    // "Smithson et al." must NOT auto-match the solo "Smith (2018)" reference.
    if (entry) {
      expect(entry.status).not.toBe('matched');
    }
  });
});
