/**
 * Regression: in a bracket-numbered ([1], [2], …) reference list, a bare "N." at
 * line start is a volume/edition number wrapped inside an entry, NOT a reference
 * marker. The step-1 numberedSplitPattern must not split there.
 *
 * citationguard-iterate 2026-06-10 (ieee_access_2). Reference [17] is a book:
 *   "[17]. Koch I, Reisig W, and Schreiber F, Modeling in Systems Biology: The
 *    Petri Net Approach, vol.\n16. Cham, Switzerland: Springer, 2010."
 * The volume "16" wraps to a new line as "16. Cham…". The bare-"N." alternative
 * of numberedSplitPattern matched "16. Cham", splitting [17] into a year-less
 * "Koch … vol." half and a phantom author-less "Cham, Switzerland: Springer,
 * 2010." reference carrying a DUPLICATE listNumber=16. The phantom shifted later
 * numeric indices (compare-citelink.mjs matching.wrong_target on ieee_access_2).
 *
 * Fix: when bracket markers clearly dominate the section, split ONLY on "[N]"
 * markers — drop the bare-"N." and digit-glued alternatives. Bare-numbered lists
 * (plos_med_1: 4 brackets vs 33 bare markers) keep the full splitter.
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

const BRACKET_SLICE =
  '[15]. Scharf S, Ackermann J, and Koch I, "Holistic view on the structure of ' +
  'immune response," Biomedicines, vol. 11, no. 2, 2023, Art. no. 452.\n' +
  '[16]. Beccuti M, Bibbona E, and Balbo G, "Analysis of Petri net models ' +
  'through stochastic differential equations," in Proc. Int. Conf. Appl. Theory ' +
  'Petri Nets, 2014, pp. 1-20.\n' +
  '[17]. Koch I, Reisig W, and Schreiber F, Modeling in Systems Biology: The ' +
  'Petri Net Approach, vol.\r\n16. Cham, Switzerland: Springer, 2010.\n' +
  '[18]. Peng L, Xie P, and Liu F, "Modeling and analyzing transmission of ' +
  'infectious diseases," Appl. Sci, vol. 11, no. 18, 2021, Art. no. 8262.';

describe('bracket-numbered list: bare volume number must not split an entry', () => {
  it('keeps IEEE book ref [17] whole — no phantom, no duplicate listNumber', () => {
    const refs = parseReferences('References\n' + BRACKET_SLICE, 'vancouver');
    expect(refs).toHaveLength(4);
    const dup16 = refs.filter(r => r.listNumber === 16);
    expect(dup16).toHaveLength(1);
    const phantom = refs.find(r => /^Cham\b/.test(r.raw || '') && !r.authors.length);
    expect(phantom).toBeUndefined();
  });

  it('parses ref [17] as Koch with year 2010 (year not lost to the split)', () => {
    const refs = parseReferences('References\n' + BRACKET_SLICE, 'vancouver');
    const r17 = refs.find(r => r.listNumber === 17);
    expect(r17?.authors[0]?.lastName).toBe('Koch');
    expect(r17?.year).toBe('2010');
  });

  it('still splits a genuinely bare-numbered (non-bracket) list', () => {
    // plos-style "1. Author … 2020. 2. Author …" must keep splitting on bare N.
    const bare =
      'References\n' +
      '1. Smith J, Doe A. A first study with a long enough title. J Med. 2020;1:1-10.\n' +
      '2. Brown K, Lee M. A second study with a long enough title. J Med. 2021;2:11-20.\n' +
      '3. Green P, Hall R. A third study with a long enough title. J Med. 2022;3:21-30.';
    const refs = parseReferences(bare, 'vancouver');
    expect(refs.length).toBeGreaterThanOrEqual(3);
  });
});
