import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';

/**
 * Regression: a narrative citation whose author is an ALL-CAPS organization acronym
 * ("JASP (2023)", "WHO (2020)") must be detected — but ONLY for known-org acronyms,
 * never for inline technical acronyms ("(SDE)", "(SIR)", "(ODE)" + a year), which is
 * the corpus-wide false-positive risk that kept the bare all-caps narrative form
 * deferred. (citationguard-iterate cycle 7, 2026-06-30 — collabra_90203, R-0177 deep
 * audit; "Note. Created in JASP (2023) version 0.16.")
 *
 * The pattern is gated on the `ORGANIZATION_ABBREVIATIONS` allowlist, and the citation
 * is keyed on the EXPANDED org name so it matches a "JASP Team" reference.
 */

function groupCitations(text: string) {
  return detectCitations(text).filter((c) => c.type === 'group');
}

describe('narrative all-caps acronym org citation (cycle 7)', () => {
  it('detects "JASP (2023)" (allowlisted software-org acronym)', () => {
    const cites = groupCitations('Note. Created in JASP (2023) version 0.16.');
    expect(cites.length).toBe(1);
    expect(cites[0].raw).toBe('JASP (2023)');
    // keyed on the expanded org name so it matches a "JASP Team" reference
    expect(cites[0].authors?.[0]?.normalized).toContain('jasp team');
  });

  it('detects "WHO (2020)" (allowlisted)', () => {
    const cites = groupCitations('as reported by WHO (2020) the data show');
    expect(cites.length).toBe(1);
    expect(cites[0].raw).toBe('WHO (2020)');
  });

  it('does NOT detect an inline technical acronym + year — "SDE (2015)" (guard)', () => {
    expect(groupCitations('the model (SDE) (2015) approach').length).toBe(0);
  });

  it('does NOT detect a non-allowlisted acronym — "ABC (2020)" (guard)', () => {
    expect(groupCitations('the ABC (2020) method').length).toBe(0);
  });

  it('does NOT detect "SIR (2020)" (technical model acronym, guard)', () => {
    expect(groupCitations('using SIR (2020) dynamics').length).toBe(0);
  });
});
