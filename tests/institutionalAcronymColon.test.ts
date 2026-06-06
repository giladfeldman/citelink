/**
 * Regression: an institutional author written as "ACRONYM: Full Name" (e.g.
 * "KNAW: Royal Dutch Academy of Arts and Sciences") must be detected, keyed on
 * the acronym. The existing group patterns covered "(WHO, 2020)",
 * "(World Health Organization, 2020)", and "(Full Name [WHO], 2020)", but not
 * the acronym-colon-name form, which appears in semicolon bundles.
 *
 * citationguard-iterate cycle 26 — surfaced on chen_2021_jesp:
 * "(e.g., KNAW: Royal Dutch Academy of Arts and Sciences, 2018; Simons et al., 2014)".
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

const firstKeys = (text: string) =>
  detectCitations(text).map(
    c => c.authors[0].normalized + '|' + c.year + (c.yearSuffix || ''),
  );

describe('institutional acronym-colon author', () => {
  it('detects "ACRONYM: Full Name, year" as a bundle entry, keyed on the acronym', () => {
    const k = firstKeys(
      'Per guidance (e.g., KNAW: Royal Dutch Academy of Arts and Sciences, 2018; Simons et al., 2014) this holds.',
    );
    expect(k).toContain('knaw|2018');
    expect(k).toContain('simons|2014');
  });

  it('detects a standalone "ACRONYM: Full Name, year"', () => {
    const k = firstKeys('Policy (NWO: Netherlands Organisation for Scientific Research, 2019) applies.');
    expect(k).toContain('nwo|2019');
  });

  it('does not over-match a non-acronym lead-in ("Note: Smith, 2020")', () => {
    // "Note" is not an all-caps acronym; must not be parsed as an institution.
    const k = firstKeys('(Note: Smith, 2020) is an aside.');
    expect(k).not.toContain('note|2020');
  });
});
