import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser';

/**
 * Regression: reject an ORPHANED EDITOR LIST emitted as a phantom reference
 * (citationguard-iterate cycle 7, 2026-06-30 — amp_1, R-0177 Sonnet re-audit).
 *
 * When docpluck injects a running-header page number mid reference-list, an
 * edited-book-chapter reference can split into two: the real chapter
 * ("Feldman, D. C. 2008. Building and maintaining a strong editorial board. In Y.
 * Baruch, … (Eds.), Opening the black box of editorship: 68-74. London: Palgrave
 * Macmillan.") and an orphaned tail beginning with the EDITOR LIST and ending in the
 * injected page-footer year ("Baruch, A. M. Konrad, … (Eds.), Opening the black box
 * of editorship: 68-74. London: Palgrave Macmillan. 2024"). citelink keyed the orphan
 * as a phantom reference "Baruch (2024)" with an empty title.
 *
 * Fix: reject an entry with an empty title whose author segment runs into "(Eds.),"
 * with NO 4-digit publication year ahead of the editor list. A real chapter always
 * carries its year before the editors ("Author. 2008. Title. In <eds> (Eds.), …"); a
 * "." inside author initials ("A. M.") is not a sentence break, so the year — not a
 * period scan — is the reliable signal.
 */

describe('orphaned editor-list rejection (cycle 7)', () => {
  it('rejects the phantom "Baruch (2024)" orphaned editor list (amp_1)', () => {
    const section =
      'References\n\n' +
      'Feldman, D. C. 2008. Building and maintaining a strong editorial board and cadre of ad hoc ' +
      'reviewers. In Y. Baruch, A. M. Konrad, H. Aguinis, & W. H. Starbuck (Eds.), Opening the black ' +
      'box of editorship: 68-74. London: Palgrave Macmillan. ' +
      'Baruch, A. M. Konrad, H. Aguinis, & W. H. Starbuck (Eds.), Opening the black box of editorship: ' +
      '68-74. London: Palgrave Macmillan. 2024\n';
    const refs = parseReferences(section, 'aom');
    // The orphaned "Baruch … 2024" tail must NOT survive as a reference.
    const baruchPhantom = refs.filter(
      (r) => /^baruch/i.test(r.firstAuthorLastName || r.authors?.[0]?.lastName || '') && String(r.year) === '2024',
    );
    expect(baruchPhantom.length).toBe(0);
    // …but the real Feldman 2008 chapter MUST be kept.
    const feldman = refs.find((r) => /feldman/i.test(r.firstAuthorLastName || ''));
    expect(feldman).toBeDefined();
    expect(String(feldman!.year)).toBe('2008');
  });

  it('keeps a real edited-book chapter that has its year before the editors (guard)', () => {
    const section =
      'References\n\n' +
      'Zedeck, S. 2008. Editing a top academic management journal. In Y. Baruch, A. M. Konrad, ' +
      'H. Aguinis, & W. H. Starbuck (Eds.), Opening the black box of editorship: 145-156. London: ' +
      'Palgrave Macmillan.\n';
    const refs = parseReferences(section, 'aom');
    const zedeck = refs.find((r) => /zedeck/i.test(r.firstAuthorLastName || ''));
    expect(zedeck).toBeDefined();
    expect(String(zedeck!.year)).toBe('2008');
  });
});
