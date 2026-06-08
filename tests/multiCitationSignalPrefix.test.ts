/**
 * Regression: multi-citation bundles like
 *   "(e.g., Smith & Jones, 2020; Lee, 2019; Brown et al., 2018)"
 * must detect every citation in the bundle — not just the ones that don't
 * follow a signal phrase.
 *
 * citationguard-iterate cycle 9 — the gate-enhancement (cycle 6) diagnostics
 * surfaced ~15 missed citations in chan_feldman_2025_cogemo of the form
 * "(e.g. Enright & Coyle, 1998; ...)", "(i.e. Dunn & Clark, 1969; ...)" —
 * the first item of every signal-phrased bundle was silently dropped because
 * the inline `^...$` anchored regex in the multipleCitations handler required
 * the citeText to start with a capital letter, but "e.g. Enright" starts with
 * lowercase "e".
 *
 * Two sub-fixes shipped:
 *  (a) Strip a leading signal-phrase ("e.g.", "i.e.", "cf.", "see", "see
 *      also", "as in") from each split citeText before matching.
 *  (b) The inline regexes now use the same CamelCase-tolerant lastname shape
 *      and the surname-particle whitelist as the top-level patterns
 *      (cycles 7 & 8 fixes), so "(e.g., McCullough et al., 1997; DeScioli
 *      & Smith, 2015)" also works.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

describe('multi-citation: signal-phrase prefix + CamelCase inside ()', () => {
  it('detects all citations in "(e.g. Enright & Coyle, 1998; Strelan & Covic, 2006)"', () => {
    const text =
      'A range of work on forgiveness (e.g. Enright & Coyle, 1998; ' +
      'Strelan & Covic, 2006) has examined the construct.';
    const cits = detectCitations(text);
    const enright = cits.find(c =>
      /enright/i.test(c.authors[0]?.normalized || '') &&
      c.year === '1998',
    );
    const strelan = cits.find(c =>
      /strelan/i.test(c.authors[0]?.normalized || '') &&
      c.year === '2006',
    );
    expect(enright).toBeDefined();
    expect(strelan).toBeDefined();
  });

  it('detects "(i.e. Dunn & Clark, 1969; Smith, 2020)" — i.e. prefix on first item', () => {
    // Single-citation parens with signal-phrase prefix is a separate edge case
    // (the multipleCitations handler only fires when `;` is present). For now
    // the multi-citation case is what the chan_feldman_2025_cogemo gap
    // required; the single-citation case is filed as a follow-up.
    const text = 'Earlier work (i.e. Dunn & Clark, 1969; Smith, 2020) used the method.';
    const cits = detectCitations(text);
    const dc = cits.find(c => /dunn/i.test(c.authors[0]?.normalized || ''));
    expect(dc).toBeDefined();
    expect(dc!.year).toBe('1969');
  });

  it('detects "(see Smith, 2020; Jones, 2019)" — see prefix', () => {
    const text = 'Background on this construct (see Smith, 2020; Jones, 2019) is rich.';
    const cits = detectCitations(text);
    const smith = cits.find(c => /smith/i.test(c.authors[0]?.normalized || '') && c.year === '2020');
    const jones = cits.find(c => /jones/i.test(c.authors[0]?.normalized || '') && c.year === '2019');
    expect(smith).toBeDefined();
    expect(jones).toBeDefined();
  });

  it('detects CamelCase surnames inside multi-citation bundles', () => {
    const text =
      'Foundational work on forgiveness (McCullough et al., 1997; ' +
      'DeScioli & Smith, 2015; MacDonald, 2018) established the model.';
    const cits = detectCitations(text);
    const mc = cits.find(c =>
      /mccullough/i.test(c.authors[0]?.normalized || '') && c.year === '1997',
    );
    const ds = cits.find(c =>
      /descioli/i.test(c.authors[0]?.normalized || '') && c.year === '2015',
    );
    const md = cits.find(c =>
      /macdonald/i.test(c.authors[0]?.normalized || '') && c.year === '2018',
    );
    expect(mc).toBeDefined();
    expect(ds).toBeDefined();
    expect(md).toBeDefined();
  });

  // citationguard-iterate 2026-06-08c (O2) — review/recency lead-in phrases.
  it('detects a single parenthetical with a "most recently, in" lead-in', () => {
    // collabra_90203 L1176: "(most recently, in Mayiwar et al., 2023)" detected
    // nothing — the lead-in blocked the et-al parenthetical pattern.
    const text =
      'we struggled to find support for seminal articles in this domain ' +
      '(most recently, in Mayiwar et al., 2023), and it would seem.';
    const cits = detectCitations(text);
    const mayiwar = cits.find(c => /mayiwar/i.test(c.authors[0]?.normalized || '') && c.year === '2023');
    expect(mayiwar).toBeDefined();
  });

  it('detects the first item after a "for reviews see" lead-in in a bundle', () => {
    // collabra_90203 L46: "(for reviews see Carter et al., 2019; and Renkewitz &
    // Keiner, 2019)" detected only Renkewitz — "for reviews see" blocked Carter.
    const text =
      'Many have proposed alternatives (for reviews see Carter et al., 2019; ' +
      'and Renkewitz & Keiner, 2019).';
    const cits = detectCitations(text);
    const carter = cits.find(c => /carter/i.test(c.authors[0]?.normalized || '') && c.year === '2019');
    const renk = cits.find(c => /renkewitz/i.test(c.authors[0]?.normalized || '') && c.year === '2019');
    expect(carter).toBeDefined();
    expect(renk).toBeDefined();
  });

  it('detects a bundle middle item carrying a trailing page locator', () => {
    // collabra_90203 L100: "(e.g., Jeffreys, 1939; M. D. Lee & Wagenmakers, 2013,
    // p. 105; Wasserman, 2000)" detected only Jeffreys + Wasserman — the trailing
    // ", p. 105" broke the $-anchored two-author bundle-fragment matcher. The
    // standalone single-paren path already tolerated a page suffix.
    const text =
      'Bayes factors larger than 10 are often regarded as strong evidence ' +
      '(e.g., Jeffreys, 1939; M. D. Lee & Wagenmakers, 2013, p. 105; Wasserman, 2000).';
    const cits = detectCitations(text);
    const lee = cits.find(c => /lee/i.test(c.authors[0]?.normalized || '') && c.year === '2013');
    const jeffreys = cits.find(c => /jeffreys/i.test(c.authors[0]?.normalized || '') && c.year === '1939');
    const wasserman = cits.find(c => /wasserman/i.test(c.authors[0]?.normalized || '') && c.year === '2000');
    expect(lee).toBeDefined();
    expect(jeffreys).toBeDefined();
    expect(wasserman).toBeDefined();
  });

  it('still detects a "pp." page-range locator and a single-item page locator in a bundle', () => {
    const text = '(Smith & Jones, 2019, pp. 12-15; Brown, 2020, p. 7)';
    const cits = detectCitations(text);
    expect(cits.find(c => /smith/i.test(c.authors[0]?.normalized || '') && c.year === '2019')).toBeDefined();
    expect(cits.find(c => /brown/i.test(c.authors[0]?.normalized || '') && c.year === '2020')).toBeDefined();
  });

  it('FP guard: the new lead-ins do not invent a citation from ordinary prose', () => {
    // The lead-ins are only stripped immediately before an "Author, year" inside
    // parens; ordinary prose using the same words must NOT yield a citation.
    const text =
      'These methods were reviewed most recently, in great detail. ' +
      'The authors argued for reviews see as a poor proxy for replication.';
    const cits = detectCitations(text);
    expect(cits.length).toBe(0);
  });
});
