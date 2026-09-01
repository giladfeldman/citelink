/**
 * Regression: a PAGE RUNNING HEAD that is a bare year was being taken as the
 * citation's year, FABRICATING a citation that does not exist in the paper and
 * losing the real one.
 *
 * scimeto-iterate cycle 9 (2026-09-01) — surfaced on annals_2
 * (AOM Annals, 10.5465/annals.2016.0011). The extracted text reads, verbatim:
 *
 *   "(Green, Tonidandel, & Cortina,\n\n\f2018\n\n2016)."
 *
 * The page break (`\f`) falls between the author list and the year, and AOM
 * Annals prints the volume year "2018" as its running head. docpluck's
 * H0_header_banner_strip does not remove a bare-year running head — measured on
 * 2026-09-01, 57 such lines survive across 6 AOM papers in the iterate corpus —
 * so the header lands INSIDE the citation.
 *
 * citelink took the FIRST year token after the author list and emitted
 * "(Green, Tonidandel, & Cortina, 2018)". The reference list says 2016
 * ("Green, J. P., Tonidandel, S., & Cortina, J. M. 2016. Getting through the
 * gate…"), so downstream this becomes a FALSE "in-text citation has no matching
 * reference" accusation against an honest paper — the worst class of defect for
 * an integrity tool.
 *
 * The fix masks a bare year that is (a) adjacent to a form feed and (b) followed
 * by another bare year inside the same parenthetical. Both conditions are
 * required: (b) alone would break a legitimate citation split across a page, and
 * (a) alone would break a real multi-year citation. Controls for both are below.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

const yearsFor = (text: string, surname: string): string[] =>
  detectCitations(text)
    .filter((c) => (c.authors ?? []).some((a) => a.raw.toLowerCase() === surname.toLowerCase()))
    .map((c) => String(c.year) + (c.yearSuffix ?? ''));

describe('page running-head year inside a parenthetical citation', () => {
  it('takes the real year, not the running head (verbatim annals_2 span)', () => {
    const text =
      'reviewer evaluations regarding methodological aspects of submitted manuscripts ' +
      '(Green, Tonidandel, & Cortina,\n\n\f2018\n\n2016). Specifically, Bluhm et al. (2011) measured';
    const years = yearsFor(text, 'Green');
    expect(years).toEqual(['2016']);
    expect(years).not.toContain('2018');
  });

  it('applies to a two-author parenthetical', () => {
    const text = 'prior work (Hunton & Rose,\n\n\f2018\n\n2011) showed that';
    expect(yearsFor(text, 'Hunton')).toEqual(['2011']);
  });

  it('applies to an et-al parenthetical, preserving the year suffix', () => {
    const text = 'prior work (Banks et al.,\n\n\f2018\n\n2016a) showed that';
    expect(yearsFor(text, 'Banks')).toEqual(['2016a']);
  });

  it('applies to a single-author parenthetical', () => {
    const text = 'prior work (Becker,\n\n\f2018\n\n2005) showed that';
    expect(yearsFor(text, 'Becker')).toEqual(['2005']);
  });

  it('recovers a ;-bundle member that the running head was dropping entirely', () => {
    const text = 'prior work (Smith, 1999; Hunton & Rose,\n\n\f2018\n\n2011) showed that';
    expect(yearsFor(text, 'Smith')).toEqual(['1999']);
    expect(yearsFor(text, 'Hunton')).toEqual(['2011']);
  });

  // ── controls: the mask must NOT fire on these ──────────────────────────────

  it('CONTROL leaves a legitimate citation split across a page break alone', () => {
    // A page break with no running head: the year IS form-feed-adjacent but no
    // second year follows, so nothing may be masked.
    const text = 'prior work (Green, Tonidandel, & Cortina,\n\f\n2016) showed that';
    expect(yearsFor(text, 'Green')).toEqual(['2016']);
  });

  it('CONTROL leaves a real comma-separated multi-year citation alone', () => {
    const text = 'prior work (de Melo, Marsella, & Gratch, 2016, 2017) showed that';
    expect(yearsFor(text, 'de Melo').sort()).toEqual(['2016', '2017']);
  });

  it('CONTROL leaves an ordinary single-line citation alone', () => {
    const text = 'prior work (Green, Tonidandel, & Cortina, 2016) showed that';
    expect(yearsFor(text, 'Green')).toEqual(['2016']);
  });
});
