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
});
