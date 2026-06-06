/**
 * Regression: author-year citations must NOT be detected inside the reference
 * section itself (reference-list bleed).
 *
 * citationguard-iterate cycle 4 — surfaced on collabra_90203. A
 * replication/meta-analysis paper's reference entries routinely cite their
 * originals inside the entry title ("... extension of Kogut and Ritov (2005a)
 * Study 2 ..."). The author-year detectors (detectCitations / detectHarvardCitations)
 * scanned the whole document, so these reference-embedded "(2005a)" forms were
 * emitted as spurious in-text citations (extra_pred). The numeric detector
 * already filtered on findReferenceSectionStart; analyze() now applies the same
 * boundary to the author-year paths. collabra extra_pred 6 → 4, chan 9 → 5, no
 * recall loss.
 *
 * Text shape verbatim-modeled on the collabra_90203 extraction fixture
 * (apps/worker/tests/extraction-results/collabra_90203.pdf_pymupdf.txt, body
 * line 398 + reference line 2447).
 */
import { describe, it, expect } from '@jest/globals';
import { analyze } from '../src/analyze.js';

const DOC = `The identifiable victim effect demonstrated by Kogut and Ritov (2005) who
showed that people give more to a single identified victim. This was later
extended by Smith and Jones (2018) across several domains.

References
Kogut, T., & Ritov, I. (2005). The identifiable victim effect. Journal of
Behavioral Decision Making, 18(3), 157–167.
Majumder, S., Lee, A., & Park, J. (2023). A replication and extension of Kogut
and Ritov (2005a) Study 2. Journal of Replication, 4(1), 1–20.
Smith, A., & Jones, B. (2018). Identifiability across domains. Journal of
Social Psychology, 58(2), 200–215.
`;

describe('reference-section bleed', () => {
  const { citations } = analyze(DOC);
  const keys = citations.map((c) => (c.authors?.[0]?.normalized ?? '') + '|' + c.year);

  it('detects the genuine body citation', () => {
    expect(keys.some((k) => k.startsWith('kogut') && k.endsWith('2005'))).toBe(true);
  });

  it('does NOT emit a citation for the reference-title-embedded "(2005a)"', () => {
    // Before the fix, the Majumder reference title's "Kogut and Ritov (2005a)"
    // produced a spurious kogut|2005a in-text citation.
    expect(keys.some((k) => k === 'kogut|2005a')).toBe(false);
  });

  it('does not detect any citation positioned in the reference section', () => {
    const refStart = DOC.indexOf('\nReferences');
    const inRefs = citations.filter((c) => (c.position?.start ?? 0) >= refStart);
    expect(inRefs.length).toBe(0);
  });
});
