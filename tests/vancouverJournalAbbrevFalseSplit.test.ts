/**
 * Regression: a Vancouver reference whose title is followed by a multi-word
 * journal abbreviation beginning "<Word> J <Word>…" ("Eur J Obstet Gynecol
 * Reprod Biol", "Int J Gynaecol Obstet" — J = "Journal") was FALSE-SPLIT at the
 * title→journal period. Step-1c inline splitting validated the journal fragment
 * as a new reference because its `refStartPattern` Vancouver alternative accepted
 * "Surname Initials" followed by a BARE SPACE — so "Eur J Obstet…" looked like
 * "Surname=Eur, initial=J". The yearless author+title half was then dropped,
 * leaving the journal as an author-less reference.
 *
 * citationguard-iterate (session 2026-06-07e, O1-residual) — surfaced on
 * plos_med_1 (Cornelissen #9, Munro #25). Fix: the Vancouver initials must be
 * followed by a comma (next author) or period (end of authors), not a space.
 * Reference strings are verbatim from the plos_med_1 extraction fixture.
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

describe('Vancouver journal-abbreviation false split (O1-residual)', () => {
  it('keeps "Cornelissen LGH, … Eur J Obstet …" as one ref with author Cornelissen', () => {
    const REFS =
      'References\n' +
      'Cornelissen LGH, Kortekaas JC, Schoot BC, van Vliet HAAM. Four year evaluation of therapeutic hysteroscopy under procedural sedation in an outpatient clinic. Eur J Obstet Gynecol Reprod Biol. 2021; 261:65-71. https://doi.org/10.1016/j.ejogrb.2021.04.002 PMID: 33894620\n';
    const refs = parseReferences(REFS, 'vancouver');
    const c = refs.find((r) => /cornelissen/i.test(r.authors?.[0]?.lastName || ''));
    expect(c).toBeDefined();
    expect(c?.year).toBe('2021');
    // the journal must NOT have become its own author-less reference
    expect(refs.some((r) => /^Eur$/i.test(r.authors?.[0]?.lastName || ''))).toBe(false);
  });

  it('keeps "Munro MG, … Int J Gynaecol Obstet …" as one ref with author Munro', () => {
    const REFS =
      'References\n' +
      'Munro MG, Critchley HOD, Broder MS, Fraser IS. FIGO classification system (PALM-COEIN) for causes of abnormal uterine bleeding in nongravid women of reproductive age. Int J Gynaecol Obstet. 2011; 113:3-13. https://doi.org/10.1016/j.ijgo.2010.11.011 PMID: 21345435\n';
    const refs = parseReferences(REFS, 'vancouver');
    const m = refs.find((r) => /munro/i.test(r.authors?.[0]?.lastName || ''));
    expect(m).toBeDefined();
    expect(m?.year).toBe('2011');
  });

  it('STILL splits a genuine run-on of two Vancouver references', () => {
    // first ref ends in a bare year (no page-range immediately before the split,
    // which the pre-existing page-range guard would skip) so the genuine
    // author-pattern split is exercised.
    // Block must exceed 200 chars for step-1c inline splitting to run, and the
    // first ref must end in a bare year (not a page range, which the pre-existing
    // guard skips) so the genuine author-pattern split is exercised.
    const REFS =
      'References\n' +
      'Smith JA, Jones BC, Williams DE. A first comprehensive study title here for exercising the inline reference splitter behavior thoroughly. J Foo. 2019. Brown KL, Green MN, Taylor RS. A second entirely distinct comprehensive study title here for the same purpose. J Bar. 2020.\n';
    const refs = parseReferences(REFS, 'vancouver');
    expect(refs.some((r) => /smith/i.test(r.authors?.[0]?.lastName || ''))).toBe(true);
    expect(refs.some((r) => /brown/i.test(r.authors?.[0]?.lastName || ''))).toBe(true);
  });
});
