import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser';

/**
 * Regression: a reference dated "n.d." (no date) lost its AUTHOR entirely
 * (the platform's hardening workflow 2026-08-04, surfaced on annals_3 = 10.5465/annals.2022.0049).
 *
 * "n.d." is the standard APA/AOM marker for an undated source — typically a
 * dictionary entry, standards body, or web page — and takes a disambiguating
 * letter suffix when one author has several:
 *
 *   Merriam-Webster. n.d.a. System. Retrieved from https://www.merriam-webster.com/...
 *   Merriam-Webster. n.d.b. Transaction. Retrieved from https://www.merriam-webster.com/...
 *
 * The year matcher only recognizes a 4-digit year, so an "n.d." entry matched no
 * year, the author/title extraction (which is gated on the year position) never
 * ran, and the entry came out with an EMPTY firstAuthorLastName and no title. The
 * same organization WITH a real year ("Merriam-Webster. 2020. System.") parses
 * correctly, which is what isolates this to the date token.
 *
 * Both annals_3 "n.d." references were unmatched as a result. An unparsed
 * reference cannot be matched to its in-text citation, cannot be verified, and
 * shows the user a blank author in their reference list.
 *
 * The defect is NOT specific to the suffixed form: a bare "n.d." with no letter
 * loses the author too.
 */
describe('an "n.d." (no date) reference keeps its author and title', () => {
  // A trailing control entry is included so the reference-section parser has a
  // normal neighbouring entry to segment against.
  const parse = (entry: string) =>
    parseReferences('REFERENCES\n' + entry + '\nSmith, J. A. 2019. Control entry. Journal, 10: 1-5.');

  it('parses a suffixed "n.d.a." organization reference', () => {
    const r = parse('Merriam-Webster. n.d.a. System. Retrieved from https://www.merriam-webster.com/dictionary/system.');
    expect(r[0].firstAuthorLastName).toMatch(/Merriam-Webster/);
    expect(r[0].title).toMatch(/System/);
  });

  it('parses a bare "n.d." organization reference (no letter suffix)', () => {
    const r = parse('Merriam-Webster. n.d. System. Retrieved from https://www.merriam-webster.com/dictionary/system.');
    expect(r[0].firstAuthorLastName).toMatch(/Merriam-Webster/);
    expect(r[0].title).toMatch(/System/);
  });

  it('splits two CONCATENATED n.d. entries by the same author (the annals_3 shape)', () => {
    // annals_3 prints all three of these on ONE line, with no newline between
    // them, so the AOM concatenation splitter must treat "n.d.a."/"n.d.b." as a
    // date token. Requiring 4 digits meant an undated reference could not open an
    // entry and BOTH dictionary entries were swallowed into the preceding
    // reference. This is the real document's layout, not a synthetic one.
    // Style is passed explicitly, as the worker does after style detection —
    // annals_3 is an AOM (bare-year) paper, so the AOM concatenation splitter runs.
    const r = parseReferences(
      'REFERENCES\n' +
      'Maula, M., Heimeriks, K. H., & Keil, T. 2023. Organizational experience and performance: ' +
      'A systematic review and contingency framework. Academy of Management Annals, 17: 546-585. ' +
      'Merriam-Webster. n.d.a. System. Retrieved from https://www.merriam-webster.com/dictionary/system. ' +
      'Accessed November 2, 2022. ' +
      'Merriam-Webster. n.d.b. Transaction. Retrieved from https://www.merriam-webster.com/dictionary/transaction. ' +
      'Accessed February 11, 2023.',
      'aom'
    );
    const mw = r.filter(x => /Merriam-Webster/.test(x.firstAuthorLastName ?? ''));
    expect(mw).toHaveLength(2);
    // Each keeps its OWN n.d. suffix, so the two entries stay distinct...
    expect(mw.map(x => x.year).sort()).toEqual(['n.d.a', 'n.d.b']);
    // ...and neither takes the trailing "Accessed …, 2022/2023" note as its year.
    expect(mw.map(x => x.year)).not.toContain('2022');
    expect(mw.map(x => x.year)).not.toContain('2023');
    const titles = mw.map(x => x.title ?? '').join(' | ');
    expect(titles).toMatch(/System/);
    expect(titles).toMatch(/Transaction/);
    // The preceding dated reference is untouched.
    expect(r.some(x => x.firstAuthorLastName === 'Maula' && x.year === '2023')).toBe(true);
  });

  it('parses an n.d. reference with a PERSONAL author', () => {
    const r = parse('Doe, J. A. n.d. A working paper with no date. Some Institute.');
    expect(r[0].firstAuthorLastName).toMatch(/Doe/);
    expect(r[0].title).toMatch(/working paper/);
  });

  it('does not mistake an AUTHOR\'S INITIALS "N. D." for the n.d. marker', () => {
    // Regression on the fix itself. A case-INSENSITIVE n.d. pattern matched the
    // initials of "Tomcik, N. D." in chan_feldman_2025_cogemo, so a perfectly
    // dated 2009 reference was re-dated "n.d." and dropped its match — turning a
    // 1.000 references paper into 0.989. Caught ONLY by the full-corpus diff, not
    // by any unit test. The marker is the lowercase literal "n.d."; author
    // initials are always uppercase.
    const r = parse(
      'Gordon, K. C., Hughes, F. M., Tomcik, N. D., Dixon, L. J., & Litzinger, S. C. (2009). ' +
      'Widening spheres of impact: The role of forgiveness in marital and family functioning. ' +
      'Journal of Family Psychology, 23(1), 1-13.'
    );
    expect(r[0].firstAuthorLastName).toMatch(/Gordon/);
    expect(r[0].year).toBe('2009');
  });

  it('leaves an ordinary dated organization reference untouched (control)', () => {
    const r = parse('Merriam-Webster. 2020. System. Retrieved from https://x.example/a.');
    expect(r[0].firstAuthorLastName).toMatch(/Merriam-Webster/);
    expect(r[0].year).toBe('2020');
  });
});
