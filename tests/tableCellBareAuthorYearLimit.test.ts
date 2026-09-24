/**
 * DOCUMENTED, DELIBERATE LIMIT — an un-parenthesised "Surname & Surname, YYYY" standing
 * alone on a line (a flattened table cell) is NOT detected as an in-text citation.
 *
 * Surfaced 2026-09-24 on chen_2021_jesp (10.1016/j.jesp.2021.104154): its
 * replication-comparison table (PDF p. 14) names the original study in a cell,
 * "Slovic & Fischhoff, 1977", and the gold counts it. This was the paper's real
 * remaining in-text miss; the scorer had been hiding it by pairing that gold entry with
 * citelink's (correct) year-elided "(Slovic & Fischhoff, p. 549)" detection.
 *
 * Why not detect it: across 147 extracted article texts, a line consisting only of
 * "Author(s), YYYY" occurs 29 times. On the papers that have gold it is a citation
 * once (chen) and NOT a citation three times — country-year cells in bjps_1
 * (10.1017/S0007123424000024): "Poland, 2015", "UK, 2016", "US, 2020". Golds also
 * disagree on whether a table cell is a citation at all (annals_2's gold excludes
 * its table source catalogue). A line rule would fabricate more citations than it
 * recovers, and an integrity tool must not invent a citation.
 *
 * If this limit is ever lifted, it needs a discriminator that the country-year cells
 * fail — e.g. requiring the surname to match a parsed reference — and these
 * assertions must be revised with that evidence, not deleted.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

const yearsFor = (text: string, surname: string): string[] =>
  detectCitations(text)
    .filter((c) => (c.authors[0]?.normalized ?? '').toLowerCase() === surname)
    .map((c) => c.year);

describe('bare author-year table cell (deliberate limit, 2026-09-24)', () => {
  it('does not detect a flattened table cell "Slovic & Fischhoff, 1977" (chen, verbatim layout)', () => {
    const text =
      'p-value original\n\nOriginal effect:\nCohen\'s da\n\nSlovic & Fischhoff, 1977\nPresent Study\nVirgin Rat A\n';
    expect(yearsFor(text, 'slovic')).toEqual([]);
  });

  it('does not detect a country-year cell "Poland, 2015" (bjps_1 layout — the reason for the limit)', () => {
    const text = 'Foreign currency debt shock\n\nDesign\n\n(2020)\n\nPoland, 2015\n\nPopulist radical right;\n';
    expect(yearsFor(text, 'poland')).toEqual([]);
  });

  it('STILL detects the same authors inside parentheses in prose', () => {
    expect(yearsFor('as reported earlier (Slovic & Fischhoff, 1977), participants', 'slovic')).toEqual(['1977']);
  });
});
