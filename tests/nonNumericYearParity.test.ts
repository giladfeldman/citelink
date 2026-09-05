/**
 * Capability-integrity regression: this module's own header has advertised
 * "Special dates (n.d., in press)" since it was written, and the code delivered
 * `in press` in exactly ONE of eight citation shapes.
 *
 * the platform's hardening workflow cycle 9 (2026-09-01). Measured with an 8 shapes x 5
 * year-forms matrix (`tmp/iterate-cycle9/probe-nonnumeric-year.mjs` in
 * Scimeto), before the fix:
 *
 *   "2019"    8 of 8 shapes   detected
 *   "n.d."    8 of 8          detected
 *   "in press" 1 of 8         — only singleParenthetical listed it
 *   "n.d.a"   0 of 8          — the lettered no-date form was nowhere
 *   "n.d.b"   0 of 8
 *
 * `n.d.a` / `n.d.b` are the standard APA and AOM form when one author has
 * several undated works, exactly as `2019a` / `2019b` are for dated ones. A
 * citation the library claims to support and does not detect is a silent recall
 * loss with a documentation claim on top of it — the shape this codebase calls a
 * capability-integrity defect, and the reason the header comment is not evidence.
 *
 * Corpus incidence: 5 "in press" citations across annals_2 and annals_4, and 2
 * "n.d.a"/"n.d.b" citations in annals_3 (Merriam-Webster), all of them scored as
 * recall misses before this change.
 *
 * SCOPE, stated because it is deliberately partial. The 21 patterns that already
 * admitted `n.d.` now admit `n.d.<letter>` and `in press` too. The 19 patterns
 * that accept ONLY a numeric year are left alone: they are the bare-year forms
 * that carry no comma before the year ("(Smith 2020)") and the multi-year list
 * forms, where admitting a two-word "in press" would let ordinary prose such as
 * "(as noted in press releases)" pose as a citation. That trade is recorded here
 * rather than left to be rediscovered.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

const cite = (text: string): string[] =>
  detectCitations(text).map(
    (c) => `${(c.authors ?? []).map((a) => a.raw).join('+')}|${c.year}${c.yearSuffix ?? ''}`,
  );

describe('"in press" is accepted wherever "n.d." is', () => {
  it('two-author parenthetical (annals_4 verbatim shape)', () => {
    expect(cite('recent work (Cascio & Aguinis, in press) suggests')).toEqual(['Cascio+Aguinis|in press']);
  });

  it('et-al parenthetical (annals_2 verbatim shape)', () => {
    expect(cite('that is produced (Grand et al., in press). It is worrisome')).toEqual(['Grand+et al.|in press']);
  });

  it('three-author parenthetical', () => {
    expect(cite('recent work (Grand, Rogelberg, & Banks, in press) suggests'))
      .toEqual(['Grand+Rogelberg+Banks|in press']);
  });

  it('single-author narrative', () => {
    expect(cite('As Cascio (in press) argued, selection')).toEqual(['Cascio|in press']);
  });

  it('two-author narrative', () => {
    expect(cite('Cascio and Aguinis (in press) argued that')).toEqual(['Cascio+Aguinis|in press']);
  });

  it('et-al narrative', () => {
    expect(cite('Grand et al. (in press) argued that')).toEqual(['Grand+et al.|in press']);
  });

  it('as a member of a ;-bundle (annals_4 verbatim shape)', () => {
    expect(cite('recent work (Cascio & Aguinis, in press; McHenry, 2007) suggests'))
      .toEqual(['Cascio+Aguinis|in press', 'McHenry|2007']);
  });

  it('single parenthetical, which already worked, still works', () => {
    expect(cite('recent work (Cascio, in press) suggests')).toEqual(['Cascio|in press']);
  });
});

describe('the lettered no-date form "n.d.a" / "n.d.b"', () => {
  it('is detected in a parenthetical (annals_3 verbatim shape)', () => {
    expect(cite('the definition (Merriam-Webster, n.d.a) gives')).toEqual(['Merriam-Webster|n.d.a']);
    expect(cite('the definition (Merriam-Webster, n.d.b) gives')).toEqual(['Merriam-Webster|n.d.b']);
  });

  it('splits the letter into yearSuffix, exactly as a numeric year does', () => {
    const [c] = detectCitations('the definition (Merriam-Webster, n.d.a) gives');
    expect(c.year).toBe('n.d.');
    expect(c.yearSuffix).toBe('a');
    // parity with the numeric form
    const [d] = detectCitations('prior work (Merriam-Webster, 2019a) gives');
    expect(d.year).toBe('2019');
    expect(d.yearSuffix).toBe('a');
  });

  it('is detected in a narrative citation', () => {
    expect(cite('As Merriam-Webster (n.d.a) defines it,')).toEqual(['Merriam-Webster|n.d.a']);
  });
});

describe('controls', () => {
  it('CONTROL plain "n.d." is unchanged and carries no suffix', () => {
    const [c] = detectCitations('the definition (Merriam-Webster, n.d.) gives');
    expect(c.year).toBe('n.d.');
    expect(c.yearSuffix).toBeUndefined();
  });

  it('CONTROL numeric years are unchanged', () => {
    expect(cite('recent work (Cascio & Aguinis, 2019) suggests')).toEqual(['Cascio+Aguinis|2019']);
    expect(cite('Grand et al. (2019) argued that')).toEqual(['Grand+et al.|2019']);
  });

  it('CONTROL ordinary prose containing "in press" is not a citation', () => {
    // No author-comma shape, so nothing may fire.
    expect(cite('the findings were widely reported in press coverage that year')).toEqual([]);
    expect(cite('as noted in press releases from the university')).toEqual([]);
  });
});
