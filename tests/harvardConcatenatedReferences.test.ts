import { describe, it, expect } from '@jest/globals';
import {
  parseReferences,
  splitConcatenatedHarvardReferences,
} from '../src/referenceParser';

/**
 * Regression: Harvard run-on reference lists (citationguard-iterate 2026-06-12, bjps_1).
 *
 * docpluck's academic normalization flows the reference SECTION of Harvard-style
 * papers into ONE paragraph (it keeps per-entry newlines for APA, but joins
 * Harvard). citelink then received all entries on one line. The APA splitter and
 * the comma-anchored step-1c opener both require "Surname, A." (comma + period
 * initials), which Harvard's "Adler D and Ansell B (2020)" / "Algan Y et al.
 * (2017)" never have — so the whole list collapsed into ~9 mega-references
 * (refs.f1 0.051 on the production substrate). Two defects were fixed:
 *   1. splitConcatenatedHarvardReferences — segment the run-on Harvard list.
 *   2. parseAuthorsFromSection strips a trailing "et al." so the leading author
 *      parses ("Algan Y et al." → first author "Algan", not "Algan Y et al.").
 *
 * The text below is the REAL docpluck-academic extraction of bjps_1's reference
 * section (DOI 10.1017/S0007123424000024), verbatim — single-author, two-author
 * "and"-joined, and "et al." entries all concatenated on one line.
 */
const BJPS_RUNON_REFS =
  'Adler D and Ansell B (2020) Housing and populism. West European Politics 43, 344-65. ' +
  'Ahlquist J et al. (2020) The political consequences of external economic shocks: Evidence from Poland. American Journal of Political Science 64, 904-20. ' +
  "Albanese G et al. (2022) Populist voting and Losers' discontent: Does redistribution matter? European Economic Review 141, 104000. " +
  'Algan Y et al. (2017) The European trust crisis and the rise of populism. Brookings Papers on Economic Activity 2017, 309-400. ' +
  'Amengay A and Stockemer D (2019) The radical right in Western Europe: a meta-analysis of structural factors. Political Studies Review 17, 30-40. ' +
  'Amsalem E and Zoizner A (2022) Real, but limited: A meta-analytic assessment of framing effects in the political domain. British Journal of Political Science 52, 221-37. ' +
  'Anelli M et al. (2021) Individual vulnerability to industrial robot adoption increases support for the radical right. Proceedings of the National Academy of Sciences 118, e2111611118. ' +
  'Autor DH et al. (2020) Importing political polarization? The Electoral Consequences of Rising Trade Exposure. American Economic Review 110, 3139-83.';

const DOC = `Some body text discussing populism and globalization.\n\nReferences\n${BJPS_RUNON_REFS}\n`;

describe('Harvard run-on reference splitting (bjps_1)', () => {
  it('splits a concatenated Harvard reference block into individual entries', () => {
    const parts = splitConcatenatedHarvardReferences('References ' + BJPS_RUNON_REFS);
    // 8 references in the snippet — must not collapse into 1-2 globs.
    expect(parts.length).toBeGreaterThanOrEqual(7);
  });

  it('parseReferences segments the run-on Harvard list (not 1-2 globs)', () => {
    const refs = parseReferences(DOC, 'harvard');
    expect(refs.length).toBeGreaterThanOrEqual(7);
  });

  it('extracts the correct first author for "Surname Initials et al." entries', () => {
    const refs = parseReferences(DOC, 'harvard');
    const byYearTitle = (frag: string) =>
      refs.find((r) => (r.raw || '').includes(frag));
    // "et al." must be stripped — first author is the surname, not "Algan Y et al."
    const algan = byYearTitle('European trust crisis');
    expect(algan).toBeDefined();
    expect(algan!.authors[0].lastName).toBe('Algan');
    expect(algan!.year).toBe('2017');

    const autor = byYearTitle('Importing political polarization');
    expect(autor).toBeDefined();
    expect(autor!.authors[0].lastName).toBe('Autor');
  });

  it('keeps two-author "and"-joined entries on the FIRST author (no second-author orphan split)', () => {
    const refs = parseReferences(DOC, 'harvard');
    const amengay = refs.find((r) => (r.raw || '').includes('radical right in Western Europe'));
    expect(amengay).toBeDefined();
    // Must be "Amengay A and Stockemer D (2019)" keyed on Amengay — never split at
    // the second author "Stockemer D (2019)".
    expect(amengay!.authors[0].lastName).toBe('Amengay');
    expect(amengay!.year).toBe('2019');
  });

  it('does not fire on a clean APA "Surname, A. (year)." reference (no Harvard false-split)', () => {
    // Guard: the Harvard splitter must be a no-op on already-comma-delimited APA text.
    const apa = 'Cameron, C. D., & Payne, B. K. (2011). Escaping affect. Journal of Personality and Social Psychology, 100(1), 1-15.';
    const parts = splitConcatenatedHarvardReferences(apa);
    expect(parts).toEqual([apa]);
  });
});
