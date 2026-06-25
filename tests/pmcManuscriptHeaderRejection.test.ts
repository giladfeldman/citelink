import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser';

/**
 * Regression: a PMC running page-header was harvested as a fabricated reference
 * (citationguard-iterate 2026-06-25, ieee_access_2 — R-0177 Sonnet audit).
 *
 * PMC-hosted PDFs stamp "<Journal>. Author manuscript; available in PMC <date>." on
 * EVERY page; docpluck preserves it. The reference parser took "<Journal>" as an org
 * author and the trailing PMC year as the year, emitting a reference that does not
 * exist (an academic-integrity defect). ieee_access_2 parsed 37 references vs the
 * gold's 36 — the extra was "IEEE Access. Author manuscript; available in PMC 2026
 * February 25." keyed as a 2026 reference.
 *
 * Fix: reject any reference candidate whose raw matches the PMC boilerplate signature
 * ("author manuscript … available in PMC"). Keyed on the unique PMC phrasing, never on
 * paper identity — a real reference never carries it.
 */

function refsFrom(refLines: string) {
  const doc = 'Body.\n\nReferences\n\n' + refLines;
  return parseReferences(doc, 'vancouver');
}

describe('PMC manuscript-header reference rejection (ieee_access_2 R-0177)', () => {
  it('does not emit the PMC running header as a reference', () => {
    const refs = refsFrom(
      '[15] M. Beccuti et al., "A real example reference," IEEE Access, vol. 3, 2014.\n' +
      'IEEE Access. Author manuscript; available in PMC 2026 February 25.\n' +
      '[16] A. Other, "Another reference," IEEE Trans., vol. 4, 2021.'
    );
    const pmc = refs.filter(r => /author manuscript|available in pmc/i.test(r.raw || ''));
    expect(pmc.length).toBe(0);
    // at least one real numbered reference still survives (the PMC line did not eat them)
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects the PMC header even as a standalone candidate', () => {
    const refs = refsFrom('Some Journal Name. Author manuscript; available in PMC 2025 January 3.');
    expect(refs.filter(r => /available in pmc/i.test(r.raw || '')).length).toBe(0);
  });
});
