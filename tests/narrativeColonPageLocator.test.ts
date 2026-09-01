/**
 * Regression: a NARRATIVE citation carrying an AOM/Chicago colon page locator —
 * "Teple (1949: 153)", "Keltner et al. (2003: 268–269)" — was not detected at
 * all, by any of the five narrative patterns.
 *
 * scimeto-iterate cycle 9 (2026-09-01). Measured across the 18-paper
 * corpus: 11 of the 83 remaining gold recall misses are exactly this shape, in
 * amj_1 (10.5465/amj.2016.1196), annals_2 (10.5465/annals.2016.0011) and
 * annals_3 (10.5465/annals.2022.0049) — 13% of all remaining in-text recall
 * loss, from one gap.
 *
 * AOM and Chicago author-date write the page after the year as ": 153", where
 * APA writes ", p. 153". `singleNarrative`, `twoAuthorNarrative` and
 * `etAlNarrative` already tolerated the APA comma form via `(?:,\s*[^)]+)?`;
 * the colon form was never added, and each pattern anchors on the closing paren
 * immediately after the year, so the whole citation was lost.
 *
 * A second, worse defect fell out of the same measurement, and it is a WRONG
 * value rather than a missing one. `mixedListEtAlNarrative` and
 * `multiAuthorAndNarrative` carried NO trailing-qualifier tolerance at all — not
 * even the APA comma form the other three had. So
 * "Ferris, Liden, Munyon, Summers, Basik, and Buckley (2009, p. 1397)" fell
 * through to `singleNarrative` and was mis-keyed to the LAST author, reporting
 * **Buckley (2009)**. A citation attributed to the wrong first author resolves
 * to the wrong reference — or to none — so an honest manuscript is reported as
 * having an unmatched citation. That is the same failure class as the v0.7.74
 * running-head fabrication, reached by a different route.
 *
 * The colon form is admitted only when a DIGIT follows the colon, mirroring the
 * bundle-fragment colon-locator rule already in the `;`-splitter, so a real
 * "Author: Title" or an institutional "ACRONYM: Name" cannot be swallowed.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

const cite = (text: string): string[] =>
  detectCitations(text).map(
    (c) => `${(c.authors ?? []).map((a) => a.raw).join('+')}|${c.year}${c.yearSuffix ?? ''}`,
  );

describe('narrative citation with an AOM/Chicago colon page locator', () => {
  it('single author (annals_3 verbatim)', () => {
    expect(cite('in defining the employer-employee relationship, Teple (1949: 153)\nstated, "Everyone works'))
      .toEqual(['Teple|1949']);
  });

  it('single author, en-dash page range', () => {
    expect(cite('As Ottino (2003: 293) noted, complex systems cannot be understood'))
      .toEqual(['Ottino|2003']);
  });

  it('two authors (annals_3 verbatim)', () => {
    expect(cite('the boundary conditions. Molloy and Barney (2015: 310) argued that'))
      .toEqual(['Molloy+Barney|2015']);
  });

  it('et al. (annals_3 verbatim)', () => {
    expect(cite('servant leadership in their empirical review. Shaffer et al. (2016: 102) recommended'))
      .toEqual(['Shaffer+et al.|2016']);
  });

  it('et al. with an en-dash page range (amj_1 verbatim)', () => {
    expect(cite('In line with this argument, Keltner et al. (2003: 268–269) proposed'))
      .toEqual(['Keltner+et al.|2003']);
  });

  it('six-author "and" list keeps the FIRST author (annals_3 verbatim)', () => {
    expect(cite('as Ferris, Liden, Munyon, Summers, Basik, and Buckley (2009: 1397) put it'))
      .toEqual(['Ferris+Liden+Munyon+Summers+Basik+Buckley|2009']);
  });
});

describe('narrative multi-author lists must not lose their first author to a qualifier', () => {
  it('an APA comma page locator no longer mis-keys a multi-author "and" list to its LAST author', () => {
    // Before the fix this returned ['Buckley|2009'] — a citation attributed to
    // the wrong researcher, which resolves to the wrong reference or to none.
    expect(cite('as Ferris, Liden, Munyon, Summers, Basik, and Buckley (2009, p. 1397) put it'))
      .toEqual(['Ferris+Liden+Munyon+Summers+Basik+Buckley|2009']);
  });

  it('an APA comma note no longer mis-keys a multi-author "and" list', () => {
    expect(cite('as Arkes, Wortmann, Saville, and Harkness (1981, Experiment 3) showed'))
      .toEqual(['Arkes+Wortmann+Saville+Harkness|1981']);
  });

  it('a mixed-list et-al form tolerates a qualifier at all', () => {
    // Before the fix both of these returned nothing whatsoever.
    expect(cite('Bartos, Maier, Wagenmakers, et al. (2022, p. 14) reported that'))
      .toEqual(['Bartos+Maier+Wagenmakers+et al.|2022']);
    expect(cite('Bartos, Maier, Wagenmakers, et al. (2022: 14) reported that'))
      .toEqual(['Bartos+Maier+Wagenmakers+et al.|2022']);
  });
});

describe('controls — the colon tolerance must not swallow non-locators', () => {
  it('CONTROL bare narrative citations are unchanged', () => {
    expect(cite('As Teple (1949) stated, everyone works for someone')).toEqual(['Teple|1949']);
    expect(cite('Molloy and Barney (2015) argued that')).toEqual(['Molloy+Barney|2015']);
    expect(cite('Shaffer et al. (2016) recommended that')).toEqual(['Shaffer+et al.|2016']);
  });

  it('CONTROL the APA comma form still works on the three patterns that had it', () => {
    expect(cite('As Teple (1949, p. 153) stated')).toEqual(['Teple|1949']);
    expect(cite('Molloy and Barney (2015, Experiment 3) argued')).toEqual(['Molloy+Barney|2015']);
    expect(cite('Shaffer et al. (2016, Table 2) recommended')).toEqual(['Shaffer+et al.|2016']);
  });

  it('CONTROL a colon NOT followed by a digit is not treated as a locator', () => {
    // "(2016: Reconsidering the evidence)" is not a page locator. The pattern
    // requires a digit after the colon, so this must not match as a citation
    // with a swallowed qualifier.
    const got = cite('the report Smith (2016: Reconsidering the evidence) was withdrawn');
    expect(got).toEqual([]);
  });

  it('CONTROL an ordinary parenthetical citation is unaffected', () => {
    expect(cite('prior work (Green, Tonidandel, & Cortina, 2016) showed'))
      .toEqual(['Green+Tonidandel+Cortina|2016']);
  });
});
