import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';

/**
 * Regression: a numbered TABLE-NOTE SOURCE CATALOGUE was harvested as in-text
 * citations (scimeto-iterate 2026-08-04, surfaced on annals_2 =
 * 10.5465/annals.2016.0011).
 *
 * Academy of Management Annals tables carry a footnote listing every source
 * behind the table's recommendations, each entry PREFIXED BY ITS INDEX NUMBER
 * with no separator:
 *
 *   Notes: Sources used to derive evidence-based recommendations: 3Aguinis and
 *   Vandenberg (2014), 7Aram and Salipante (2003), 32Castro (2002),
 *   80Ployhart and Vandenberg (2010), ...
 *
 * The digits key the superscript markers in the table body ("(3, 12, 23)").
 * These are a bibliography-style catalogue, not prose citations, and the
 * human-verified gold excludes them: authors appearing ONLY in such blocks
 * (Ployhart, Aram, Gephart) have zero gold entries, while authors also cited in
 * running prose (Bluhm, Chenail) appear in gold from their PROSE occurrences.
 *
 * What made this subtle: the glued digit ALREADY breaks the first author, so
 * "3Aguinis and Vandenberg (2014)" is not detected at "Aguinis" — citelink
 * anchors on the SECOND author and emits a MIS-KEYED "Vandenberg (2014)".
 * The damage is therefore worse than a spurious extra: the real first author is
 * lost, and the mis-keyed citation reaches the user as a citation-matching
 * ISSUE against their manuscript. 147 such detections on annals_2, none of
 * which appears in the gold.
 */
describe('table-note numbered source catalogue is not an in-text citation', () => {
  it('suppresses the mis-keyed trailing author of a digit-glued catalogue entry', () => {
    // "3Aguinis and Vandenberg (2014)" would otherwise surface as "Vandenberg (2014)".
    const text =
      'Notes: Sources used to derive evidence-based recommendations: ' +
      '3Aguinis and Vandenberg (2014), 7Aram and Salipante (2003), ' +
      '80Ployhart and Vandenberg (2010).';
    expect(detectCitations(text)).toHaveLength(0);
  });

  it('suppresses a multi-author catalogue entry', () => {
    const text = '21Bluhm, Harman, Lee, and Mitchell (2011), 85Schriesheim, Castro, Zhou, and Yammarino (2002).';
    expect(detectCitations(text)).toHaveLength(0);
  });

  it('suppresses a catalogue entry whose first author carries a particle', () => {
    // "90Van Iddekinge and Ployhart (2008)" — the walk must reach the glued "90".
    const text = '89van Aken (2004), 90Van Iddekinge and Ployhart (2008).';
    expect(detectCitations(text)).toHaveLength(0);
  });

  it('still detects the SAME authors when they appear in running prose', () => {
    // The fix must not cost recall: Bluhm/Chenail are in the gold precisely
    // because they are also cited in prose.
    const text =
      'As Ployhart and Vandenberg (2010) argued, longitudinal designs matter. ' +
      'This was echoed by Castro (2002) and by Bluhm, Harman, Lee, and Mitchell (2011).';
    const keys = detectCitations(text).map(c => c.authors[0]?.normalized);
    expect(keys).toContain('ployhart');
    expect(keys).toContain('castro');
    expect(keys).toContain('bluhm');
  });

  it('does not suppress a citation merely NEAR a digit (space-separated)', () => {
    const text = 'Reviewed in 2011 Smith (2014) reported a null result.';
    expect(detectCitations(text).map(c => c.authors[0]?.normalized)).toContain('smith');
  });

  it('does not suppress a parenthetical citation after a numeral in prose', () => {
    const text = 'Across 12 (Jones, 2015) independent samples the effect held.';
    expect(detectCitations(text).map(c => c.authors[0]?.normalized)).toContain('jones');
  });

  it('does not suppress a prose citation whose sentence contains an earlier year', () => {
    // The leftward walk must STOP at sentence punctuation. Without the hard
    // stops it reached an unrelated digit and flagged real prose citations.
    const text =
      'Between 2012-2015, the number of retractions has increased (Karabag & Berggren, 2016). ' +
      'Similar concerns were raised 24 hours a day (Cortina et al., 2017a).';
    const keys = detectCitations(text).map(c => c.authors[0]?.normalized);
    expect(keys).toContain('karabag');
    expect(keys).toContain('cortina');
  });
});
