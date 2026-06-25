import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';

/**
 * Regression: AOM / Chicago colon page-locator dropped the FIRST citation of a
 * multi-citation parenthetical (citationguard-iterate 2026-06-25, amp_1 — TC-4).
 *
 * AOM (Academy of Management) and Chicago note-style write a page locator after
 * the year as ": page" ("Bedeian, Van Fleet & Hyman, 2009a: 211"), NOT the APA
 * ", p. page". The multi-citation bundle handler splits on ";" and then runs
 * $-anchored fragment matchers that expect the year at the END of the fragment.
 * The existing strip removed only the APA ", p. 211" form — so the colon-form
 * "2009a: 211" suffix survived, the fragment matcher failed, and the FIRST
 * citation was dropped:
 *
 *   "(Bedeian, Van Fleet & Hyman, 2009a: 211; Honig et al. 2014)"
 *      → before: detected only Honig 2014 (Bedeian 2009a lost)
 *      → after:  detects both
 *
 * Fix: strip a trailing colon page locator ("year: page" / "year: 88-90") from a
 * bundle fragment, guarded to fire only when a 4-digit year (optional letter
 * suffix) immediately precedes the colon — so "ACRONYM: Name" / "Author: Title"
 * openers are untouched.
 */

const yearsOf = (text: string) =>
  detectCitations(text)
    .map((c) => `${c.year ?? ''}${(c as { yearSuffix?: string }).yearSuffix ?? ''}`)
    .sort();

describe('AOM colon page-locator in a multi-citation parenthetical (amp_1 TC-4)', () => {
  it('detects BOTH citations when the first carries a colon page locator', () => {
    const text = 'This is established (Bedeian, Van Fleet & Hyman, 2009a: 211; Honig et al. 2014).';
    const years = yearsOf(text);
    expect(years).toContain('2009a');
    expect(years).toContain('2014');
    expect(years.length).toBe(2);
  });

  it('detects a colon page locator on the LAST bundle member too', () => {
    const text = 'See (Honig et al. 2014; Bedeian, Van Fleet & Hyman, 2009a: 211).';
    const years = yearsOf(text);
    expect(years).toContain('2009a');
    expect(years).toContain('2014');
    expect(years.length).toBe(2);
  });

  it('handles a colon page RANGE locator ("2014: 88-90")', () => {
    const text = 'As shown (Smith, 2010; Jones, 2014: 88-90).';
    const years = yearsOf(text);
    expect(years).toContain('2010');
    expect(years).toContain('2014');
    expect(years.length).toBe(2);
  });

  it('does NOT strip an institutional "ACRONYM: Name" bundle opener (no false collapse)', () => {
    // The colon here introduces an org name, not a page — the year is at the end,
    // so the colon-locator strip must NOT touch it.
    const text = '(KNAW: Royal Dutch Academy of Arts and Sciences, 2018; Smith, 2020).';
    const years = yearsOf(text);
    expect(years).toContain('2018');
    expect(years).toContain('2020');
    expect(years.length).toBe(2);
  });

  it('leaves a clean multi-citation bundle (no locators) unchanged', () => {
    const text = 'Prior work (Bedeian, Van Fleet & Hyman, 2009a; Honig et al. 2014).';
    const years = yearsOf(text);
    expect(years).toEqual(['2009a', '2014']);
  });
});
