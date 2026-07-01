import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';

/**
 * Regression: a narrative citation whose parentheses hold a MULTI-YEAR LIST
 * ("McCullough et al. (1997, 1998)") must emit ONE citation per year — not drop
 * every year after the first (citationguard-iterate cycle 8, 2026-07-01 —
 * chan_feldman_2025_cogemo, TC-I, R-0177 Sonnet deep audit).
 *
 * Root cause: the single/two/et-al narrative patterns each accept an OPTIONAL
 * trailing in-paren qualifier `(?:,\s*[^)]+)?` (added in cycle 7 for "(1977,
 * Experiment 3)" / "(1977, p. 12)"). That same tolerance SWALLOWED a genuine
 * second year — "(1997, 1998)" matched with year=1997 and the ", 1998" absorbed
 * as an ignored qualifier — so only 1997 was detected. The PARENTHETICAL form
 * "(Author, 1997, 1998)" was already handled by `sameAuthorMultiYear`.
 *
 * Fix: a new `sameAuthorMultiYearNarrative` pattern fires FIRST on a pure
 * year-list (2+ comma-separated years, no page/note token), emitting each year
 * at a distinct position window; the single/two/et-al narrative loops skip a
 * span that loop already consumed. A NON-year qualifier ("p. 12", "Experiment
 * 3") does not match the year-list, so those loops keep owning the qualifier case.
 *
 * The `it(...multi-year...)` inputs use text VERBATIM from the chan extraction
 * (DOI 10.1080/02699931.2024.2434156).
 */

function yearsFor(text: string, surname: string): string[] {
  return detectCitations(text)
    .filter(c => c.authors.some(a => (a.raw ?? a.normalized ?? '').toLowerCase().includes(surname.toLowerCase())))
    .map(c => `${c.year}${c.yearSuffix ?? ''}`);
}

describe('narrative multi-year list (cycle 8, TC-I)', () => {
  it('emits both years for an et-al narrative dual-year list (chan McCullough 1997, 1998, verbatim)', () => {
    const text =
      'Overall, this was a successful replication of the findings by McCullough et al. (1997, 1998) with the empathy model of forgiveness receiving strong empirical support.';
    expect(yearsFor(text, 'McCullough').sort()).toEqual(['1997', '1998']);
  });

  it('emits both years for a single-author narrative multi-year list', () => {
    expect(yearsFor('Bishop (2019, 2020) reported a robust effect.', 'Bishop').sort()).toEqual([
      '2019',
      '2020',
    ]);
  });

  it('emits both years for a two-author narrative multi-year list', () => {
    expect(yearsFor('Werth and Strack (2001, 2003) argued the opposite.', 'Werth').sort()).toEqual([
      '2001',
      '2003',
    ]);
  });

  it('emits every year (with suffixes) for a 3-year et-al list', () => {
    expect(yearsFor('Jones et al. (2018a, 2018b, 2019) found this.', 'Jones').sort()).toEqual([
      '2018a',
      '2018b',
      '2019',
    ]);
  });

  it('does NOT emit a duplicate first-year at the full span (de-overlap guard)', () => {
    // Exactly two citations, one per year — the full-span et-al match must be
    // suppressed so 1997 is not counted twice.
    const cites = detectCitations('Prior work by McCullough et al. (1997, 1998) matters.');
    const mc = cites.filter(c => c.authors.some(a => (a.raw ?? '').includes('McCullough')));
    expect(mc.length).toBe(2);
    expect(mc.map(c => c.year).sort()).toEqual(['1997', '1998']);
  });

  it('leaves a single-author "p. NN" qualifier as ONE year (must not over-split)', () => {
    expect(yearsFor('Fischhoff (1977, p. 12) argued as much.', 'Fischhoff')).toEqual(['1977']);
  });

  it('leaves an et-al "Experiment N" qualifier as ONE year (must not over-split)', () => {
    expect(yearsFor('Slovic et al. (1977, Experiment 3) was first.', 'Slovic')).toEqual(['1977']);
  });

  it('does not fabricate a citation from a bare year-list with no author', () => {
    expect(detectCitations('Data appear elsewhere (2020, 2021 data).').length).toBe(0);
  });
});
