/**
 * Author-bio rejection in the reference parser (annals_2 / amp_1 — AOM journals).
 *
 * AOM journals (Academy of Management Annals / Perspectives / Journal) print an
 * "About the authors" block immediately after the reference list. When a bio
 * line carries a year, the reference parser used to harvest the author name and
 * the stray year and emit a FABRICATED reference — an academic-integrity defect
 * (a citation that does not exist). citelink already stripped bios written in
 * the initials form ("Herman A. (email) is…") via extractReferenceSection
 * end-patterns, but the FULL-surname form slipped through:
 *
 *   annals_2 → ref #102 "Herman Aguinis (haguinis@gwu.edu) is the Avram Tucker
 *              Distinguished Scholar…"  (year mis-harvested → fake ref)
 *   amp_1    → ref #79  "Jose R. Beltran (https://www.jrbeltran.org) is an
 *              assistant professor…"    (fake ref)
 *
 * Bio openings below are VERBATIM from the docpluck-academic extraction of
 * annals_2 (10.5465/annals.2016.0011) and amp_1; the closing degree-year clause
 * is the realistic year that makes the bio a valid-structure reference candidate
 * (authors + year), i.e. the exact condition under which the old parser emitted
 * the phantom. Fix: parseReferences rejects any parsed reference whose raw reads
 * as an author bio (contact-paren + biographical verb, or "<Name> is a/the
 * <role>"), keyed on structure, never paper identity.
 */

import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

const hasAuthor = (refs: ReturnType<typeof parseReferences>, surnameNormalized: string) =>
  refs.some(r => r.allAuthorLastNamesNormalized.includes(surnameNormalized));

describe('author-bio rejection in reference parsing (AOM)', () => {
  it('does NOT emit an email-form author bio (Aguinis) as a reference, but keeps the real refs', () => {
    const text =
      'References\n' +
      'Zhu, H., & Yoshikawa, T. 2016. Contingent value of director identification: The role of ' +
      'government directors in monitoring and resource provision in an emerging economy. ' +
      'Strategic Management Journal, 37: 1787-1807.\n' +
      'Herman Aguinis (haguinis@gwu.edu; www.hermanaguinis. com) is the Avram Tucker ' +
      'Distinguished Scholar and Professor of Management at George Washington University ' +
      'School of Business. He earned his PhD in 1993 from the University at Albany, ' +
      'State University of New York.\n';
    const refs = parseReferences(text, 'aom');
    // Real reference is parsed.
    expect(hasAuthor(refs, 'zhu')).toBe(true);
    // The author bio is NOT emitted as a reference (no "aguinis"/"herman" ref).
    expect(hasAuthor(refs, 'aguinis')).toBe(false);
    expect(refs.some(r => /haguinis@gwu\.edu/.test(r.raw))).toBe(false);
  });

  it('does NOT emit a URL-form author bio (Beltran) as a reference', () => {
    const text =
      'References\n' +
      'Zhang, C. T. 2009. A proposal for calculating weighted citations based on author rank. ' +
      'EMBO Reports, 10: 416-417.\n' +
      'Jose R. Beltran (https://www.jrbeltran.org) is an assistant professor of management at ' +
      'Rutgers School of Business--Camden. He holds a PhD from Iowa State University, earned ' +
      'in 2024, and his research focuses on strategic leadership.\n';
    const refs = parseReferences(text, 'aom');
    expect(hasAuthor(refs, 'zhang')).toBe(true);
    expect(hasAuthor(refs, 'beltran')).toBe(false);
    expect(refs.some(r => /jrbeltran\.org/.test(r.raw))).toBe(false);
  });

  it('does NOT over-reject a real reference whose title merely contains a role word', () => {
    // "Professor"/"director" inside a TITLE must not trip the bio guard — the
    // guard keys on the "<Name> is a/the <role>" / contact-paren grammar at the
    // START of the entry, not on the mere presence of a role word.
    const text =
      'References\n' +
      'Sennett, R. 2008. The craftsman and the making of a professor. ' +
      'New Haven, CT: Yale University Press.\n' +
      'Khurana, R. 2007. From higher aims to hired hands: The director of the business school. ' +
      'Princeton, NJ: Princeton University Press.\n';
    const refs = parseReferences(text, 'aom');
    expect(hasAuthor(refs, 'sennett')).toBe(true);
    expect(hasAuthor(refs, 'khurana')).toBe(true);
  });
});
