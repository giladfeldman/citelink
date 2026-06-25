import { describe, it, expect } from '@jest/globals';
import { parseReferences, splitConcatenatedApaReferences } from '../src/referenceParser';

/**
 * Regression: a concatenated acronym-colon ORG author entry ("KNAW: Royal Dutch
 * Academy of Arts and Sciences. (2018). …") was swallowed into the previous
 * reference (citationguard-iterate 2026-06-25, chen — R-0177 Sonnet re-audit).
 *
 * chen line: "Sowden, W. (2018). Many labs 2: … 1(4), 443-490. KNAW: Royal Dutch
 * Academy of Arts and Sciences. (2018). Replication studies: …". The APA
 * concatenated-reference splitter recognized personal-author openers and
 * "…Team/Society/Collaboration" org openers, but NOT an acronym-colon-org author
 * ("KNAW: <Org Name>."), whose name does not end in an org-suffix word — so the
 * KNAW 2018 entry was lost into the Sowden 2018 reference (refs.f1 capped; the
 * "(KNAW, 2018)" in-text citation had no reference to match).
 *
 * Fix: add an `acronymOrgAuthor` opener alternative ("[A-Z]{2,}: <CapName>.") to
 * splitConcatenatedApaReferences, mirroring how parseAPAReference's acronymOrg
 * branch already keys such an author on the acronym.
 */

const CONCAT =
  'Sowden, W. (2018). Many labs 2: Investigating variation in replicability across ' +
  'samples and settings. Advances in Methods and Practices in Psychological Science, ' +
  '1(4), 443-490. KNAW: Royal Dutch Academy of Arts and Sciences. (2018). Replication ' +
  'studies: Improving reproducibility in the empirical sciences. Amsterdam, Netherlands ' +
  'Retrieved from https://knaw.nl/en/news/publications/replication-studies.';

describe('APA acronym-colon org concatenated-reference split (chen R-0177)', () => {
  it('splits the Sowden…KNAW block into two references', () => {
    const parts = splitConcatenatedApaReferences(CONCAT);
    expect(parts.length).toBe(2);
    expect(parts[0]).toMatch(/^Sowden/);
    expect(parts[1]).toMatch(/^KNAW:/);
  });

  it('parseReferences recovers the KNAW 2018 org reference keyed on the acronym', () => {
    const doc = 'Body.\n\nReferences\n\n' + CONCAT;
    const refs = parseReferences(doc, 'apa');
    const knaw = refs.find(r => /^KNAW$/i.test(r.firstAuthorLastName || ''));
    expect(knaw).toBeDefined();
    expect(knaw?.year).toBe('2018');
    expect(knaw?.title || '').toMatch(/^Replication studies/);
    // and Sowden survives as its own entry
    expect(refs.some(r => /^Sowden$/i.test(r.firstAuthorLastName || ''))).toBe(true);
  });
});
