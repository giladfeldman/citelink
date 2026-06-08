/**
 * Regression: a single parenthetical may bundle 2+ citations separated by PROSE
 * rather than a semicolon:
 *   "(Hong & Reed, 2021, reanalysis with RoBMA in Bartoš, Maier, Wagenmakers,
 *    et al., 2022)"
 *
 * citationguard-iterate 2026-06-08d (D3/D6). The semicolon-bundle splitter
 * (multipleCitations) never fires because there is no ';'. The (...)-anchored
 * single/two-author/et-al/mixed-list patterns all fail because prose sits
 * between the open paren and the trailing ')'. Result: BOTH citations were lost
 * (confirmed against collabra_90203 docpluck-extracted text — Hong & Reed 2021
 * page-3 occurrence + Bartoš et al. 2022 page-3 occurrence both missed).
 *
 * Fix: a "prose-bundled parenthetical" scan — for a paren with NO ';' that
 * contains >=2 author-year groups, scan the interior for each "<Surname-list>
 * [et al.], YYYY" group and emit it at its true position. Overlap-aware so it
 * never re-emits a citation an earlier pattern already detected (no
 * occurrence-count inflation), and the standard surname/connector/month guards
 * keep ordinary prose from inventing citations.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

describe('prose-bundled parenthetical (no semicolon, prose between cites)', () => {
  it('detects BOTH cites in the collabra L94 prose-bundled paren', () => {
    const text =
      'RoBMA outperformed other methods for publication bias correction in a ' +
      'large simulation study (Hong & Reed, 2021, reanalysis with RoBMA in ' +
      'Bartoš, Maier, Wagenmakers, et al., 2022), which combined the ' +
      'simulation environments from four previous studies.';
    const cits = detectCitations(text);
    const hong = cits.find(
      c => /hong/i.test(c.authors[0]?.normalized || '') && c.year === '2021',
    );
    const bartos = cits.find(
      c => /barto/i.test(c.authors[0]?.normalized || '') && c.year === '2022',
    );
    expect(hong).toBeDefined();
    expect(bartos).toBeDefined();
  });

  it('emits each prose-bundled cite exactly once (no occurrence inflation)', () => {
    const text =
      '(Hong & Reed, 2021, reanalysis with RoBMA in Bartoš, Maier, ' +
      'Wagenmakers, et al., 2022)';
    const cits = detectCitations(text);
    const hongCount = cits.filter(
      c => /hong/i.test(c.authors[0]?.normalized || '') && c.year === '2021',
    ).length;
    const bartosCount = cits.filter(
      c => /barto/i.test(c.authors[0]?.normalized || '') && c.year === '2022',
    ).length;
    expect(hongCount).toBe(1);
    expect(bartosCount).toBe(1);
  });

  it('FP guard: a clean single parenthetical is detected once, not duplicated', () => {
    const text = 'A key result was reported earlier (Smith, 2020).';
    const cits = detectCitations(text);
    const smith = cits.filter(
      c => /smith/i.test(c.authors[0]?.normalized || '') && c.year === '2020',
    );
    expect(smith.length).toBe(1);
  });

  it('FP guard: a clean semicolon bundle is not double-counted', () => {
    const text = 'Background (Smith, 2020; Jones, 2019) is rich.';
    const cits = detectCitations(text);
    expect(
      cits.filter(c => /smith/i.test(c.authors[0]?.normalized || '') && c.year === '2020').length,
    ).toBe(1);
    expect(
      cits.filter(c => /jones/i.test(c.authors[0]?.normalized || '') && c.year === '2019').length,
    ).toBe(1);
  });

  it('FP guard: a single cite with a trailing prose note yields no spurious cite', () => {
    const text = 'The effect was robust (Smith, 2020, in their main analysis).';
    const cits = detectCitations(text);
    const smith = cits.filter(
      c => /smith/i.test(c.authors[0]?.normalized || '') && c.year === '2020',
    );
    expect(smith.length).toBe(1);
    // No second, prose-derived citation.
    expect(cits.length).toBe(1);
  });

  it('FP guard: prose containing a bare year and a lowercase word invents nothing', () => {
    const text = 'The model was revised in 2020 after extensive review by the team.';
    const cits = detectCitations(text);
    expect(cits.length).toBe(0);
  });

  it('FP guard: a same-author multi-year list is unaffected', () => {
    const text = 'Prospect theory developed over time (Thaler, 1985, 1999).';
    const cits = detectCitations(text);
    expect(
      cits.filter(c => /thaler/i.test(c.authors[0]?.normalized || '')).length,
    ).toBe(2); // 1985 + 1999
  });

  // Oxford-comma + ampersand author lists must key on the FIRST author, not the
  // trailing name. chen_2021_jesp: "(in comparison ..., see Fritz, Morris, &
  // Richler, 2012)" and "(e.g., Harley, Carlsen, & Loftus, 2004)" — a naive
  // last-name capture mis-keyed these as Richler 2012 / Loftus 2004
  // (2026-06-08d). The gold lists Fritz 2012 and Harley 2004.
  it('keys a ", & "-joined author list on the FIRST author (Fritz, not Richler)', () => {
    const text =
      'phi was lower in the hindsight condition (in comparison with the other ' +
      'condition, see Fritz, Morris, & Richler, 2012), as expected.';
    const cits = detectCitations(text);
    const fritz = cits.find(c => /fritz/i.test(c.authors[0]?.normalized || '') && c.year === '2012');
    const richlerFirst = cits.find(c => /richler/i.test(c.authors[0]?.normalized || '') && c.year === '2012');
    expect(fritz).toBeDefined();
    expect(richlerFirst).toBeUndefined();
  });

  it('keys "(e.g., Harley, Carlsen, & Loftus, 2004)" on Harley, not Loftus', () => {
    const text =
      'task difficulty is related to the outcome (e.g., Harley, Carlsen, & ' +
      'Loftus, 2004), based on the assumption that.';
    const cits = detectCitations(text);
    const harley = cits.find(c => /harley/i.test(c.authors[0]?.normalized || '') && c.year === '2004');
    const loftusFirst = cits.find(c => /loftus/i.test(c.authors[0]?.normalized || '') && c.year === '2004');
    expect(harley).toBeDefined();
    expect(loftusFirst).toBeUndefined();
  });
});
