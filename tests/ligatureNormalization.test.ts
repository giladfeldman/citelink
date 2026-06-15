/**
 * Cross-project lesson transfer R-0001 (docpluck => citelink): the citation
 * matching gates must fold the full Latin typographic ligature block
 * U+FB00–U+FB06 (ﬀﬁﬂﬃﬄﬅﬆ) to ASCII. pdftotext preserves these presentation-
 * form glyphs verbatim, so a reference printed "conﬁdent" / "inﬂuence" failed to
 * match its citation. NFD (used by normalizeText and normalizeName) does NOT
 * decompose these compatibility ligatures, and an NFKC pass would yield "ſt"
 * (non-ASCII LONG S) for U+FB05 — so docpluck uses an explicit ASCII map
 * (normalize.py decompose_ligatures), which this ports into the shared gate.
 */
import { describe, it, expect } from '@jest/globals';
import { normalizeText } from '../src/citationDetector.js';
import { normalizeName } from '../src/referenceParser.js';

describe('Latin ligature folding (U+FB00–FB06) in the matching gates', () => {
  it('normalizeText folds each f-ligature so ligature text matches its ASCII form', () => {
    expect(normalizeText('eﬀect')).toBe(normalizeText('effect')); // ﬀ -> ff
    expect(normalizeText('conﬁdent')).toBe(normalizeText('confident')); // ﬁ -> fi
    expect(normalizeText('inﬂuence')).toBe(normalizeText('influence')); // ﬂ -> fl
    expect(normalizeText('oﬃce')).toBe(normalizeText('office')); // ﬃ -> ffi
    expect(normalizeText('baﬄe')).toBe(normalizeText('baffle')); // ﬄ -> ffl
  });

  it('normalizeText folds the st-ligatures U+FB05/U+FB06 to ASCII "st"', () => {
    expect(normalizeText('ﬅ')).toBe('st'); // ﬅ long-s + t
    expect(normalizeText('ﬆ')).toBe('st'); // ﬆ st
  });

  it('leaves the normalized output free of any residual ligature code point', () => {
    const out = normalizeText('oﬃce of the ﬅate');
    expect(/[ﬀ-ﬆ]/.test(out)).toBe(false);
    expect(out).toBe('office of the state');
  });

  it('normalizeName folds ligatures in surnames so they match the ASCII spelling', () => {
    expect(normalizeName('ﬁscher')).toBe(normalizeName('fischer')); // Fischer
    expect(normalizeName('Pﬂug')).toBe(normalizeName('Pflug')); // Pflug
  });

  it('does not alter plain ASCII text (no regression)', () => {
    expect(normalizeText('confident influence effect')).toBe('confident influence effect');
    expect(normalizeName('Cohen')).toBe('cohen');
  });
});
