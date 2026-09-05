/**
 * Regression: a PAGE RUNNING HEAD that is a bare year was being taken as the
 * citation's year, FABRICATING a citation that does not exist in the paper and
 * losing the real one.
 *
 * the platform's hardening workflow cycle 9 (2026-09-01) — surfaced on annals_2
 * (AOM Annals, 10.5465/annals.2016.0011). The extracted text reads, verbatim:
 *
 *   "(Green, Tonidandel, & Cortina,\n\n\f2018\n\n2016)."
 *
 * The page break (`\f`) falls between the author list and the year, and AOM
 * Annals prints the volume year "2018" as its running head. docpluck 2.4.137's
 * H0_header_banner_strip does not remove a bare-year running head — measured
 * 2026-09-01, 57 such lines survive across the 6 AOM papers in the iterate
 * corpus — so the header lands INSIDE the citation.
 *
 * citelink took the FIRST year token after the author list and emitted
 * "(Green, Tonidandel, & Cortina, 2018)". The reference list says 2016
 * ("Green, J. P., Tonidandel, S., & Cortina, J. M. 2016. Getting through the
 * gate…"), so downstream this becomes a FALSE "in-text citation has no matching
 * reference" accusation against an honest paper — the worst class of defect for
 * an integrity tool.
 *
 * THE DISCRIMINATOR IS DISTRIBUTIONAL, AND IT WAS MEASURED, NOT ARGUED. Across
 * all 18 papers of the iterate corpus every form-feed-glued bare year occurs at
 * least twice — one distinct value per document, counts 2/13/10/12/10/10 — and
 * there are ZERO singletons. A running head repeats once per page; a year caught
 * in a genuine mid-citation page split does not. So the guard fires only on a
 * form-feed-glued year that RECURS, and every fixture below that exercises the
 * masking path carries the running head on more than one page, the way a real
 * document does. A single-occurrence fixture would not be a smaller version of
 * the real input — it would be a different input, and the guard is right to
 * leave it alone.
 *
 * Known and accepted limitation: a document whose running head appears exactly
 * once (a one-page extract) is not protected. That is the price of refusing to
 * guess, and it is the safe direction — a miss, never a wrong year.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

const yearsFor = (text: string, surname: string): string[] =>
  detectCitations(text)
    .filter((c) => (c.authors ?? []).some((a) => a.raw.toLowerCase() === surname.toLowerCase()))
    .map((c) => String(c.year) + (c.yearSuffix ?? ''));

/** Two earlier page breaks carrying the same running head, as every real paper has. */
const pages = (head: string) =>
  `first page of the article text\n\n\f${head}\n\nsecond page of the article text\n\n\f${head}\n\n`;

describe('page running-head year inside a parenthetical citation', () => {
  it('takes the real year, not the running head (verbatim annals_2 span)', () => {
    const text = pages('2018') +
      'reviewer evaluations regarding methodological aspects of submitted manuscripts ' +
      '(Green, Tonidandel, & Cortina,\n\n\f2018\n\n2016). Specifically, Bluhm et al. (2011) measured';
    const years = yearsFor(text, 'Green');
    expect(years).toEqual(['2016']);
    expect(years).not.toContain('2018');
  });

  it('applies to a two-author parenthetical', () => {
    expect(yearsFor(pages('2018') + 'prior work (Hunton & Rose,\n\n\f2018\n\n2011) showed that', 'Hunton'))
      .toEqual(['2011']);
  });

  it('applies to an et-al parenthetical, preserving the year suffix', () => {
    expect(yearsFor(pages('2018') + 'prior work (Banks et al.,\n\n\f2018\n\n2016a) showed that', 'Banks'))
      .toEqual(['2016a']);
  });

  it('applies to a single-author parenthetical', () => {
    expect(yearsFor(pages('2018') + 'prior work (Becker,\n\n\f2018\n\n2005) showed that', 'Becker'))
      .toEqual(['2005']);
  });

  it('recovers a ;-bundle member that the running head was dropping entirely', () => {
    const text = pages('2018') + 'prior work (Smith, 1999; Hunton & Rose,\n\n\f2018\n\n2011) showed that';
    expect(yearsFor(text, 'Smith')).toEqual(['1999']);
    expect(yearsFor(text, 'Hunton')).toEqual(['2011']);
  });

  // ── controls: the mask must NOT fire on these ──────────────────────────────

  it('CONTROL leaves a legitimate citation split across a page break alone', () => {
    // A page break with no running head: the year is form-feed-adjacent but no
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

// ─── found by the cross-model round of 2026-09-01 (the platform's hardening workflow cycle 9) ───
//
// The v0.7.74 guard shipped with a clean full-corpus diff and 664 green tests.
// All three seats — anthropic, openai and xai, independently — found a way for it
// to report a WRONG year rather than no year. Every one is asserted below.

describe('the running-head guard must not corrupt a real year', () => {
  // SONNET (anthropic) and GROK (xai), 2026-09-01, independently. The
  // two-condition rule cannot by itself tell page furniture from a second REAL
  // year: a legitimate multi-year citation whose page break lands between the
  // author list and the first year has exactly the same shape. Reproduced
  // against the v0.7.74 build: this returned Author|2016b alone, silently
  // dropping the real 2016a. Grok added the inverted layout — furniture emitted
  // AFTER the resumed body — which the recurrence test also covers, because the
  // real year in that layout does not recur.
  it('leaves a real multi-year citation alone when the year occurs only once', () => {
    const text = 'prior work (Author,\n\n\f2016a\n\n2016b) showed that';
    expect(yearsFor(text, 'Author')).toEqual(['2016a']);
  });

  it('leaves a real bundle member alone when the year occurs only once', () => {
    // The mask correctly declines to fire (2016 appears form-feed-glued once).
    // What remains is a PRE-EXISTING recall gap, not a wrong value: the
    // ';'-bundle member matchers are $-anchored after the year, so a member with
    // an intervening page break is unmatchable and is dropped. Asserting the
    // exact current output rather than a loose "not 2020" keeps this honest — if
    // the bundle gap is ever fixed, this assertion must be updated deliberately.
    const text = 'prior work (Smith, 1999; Jones,\n\n\f2016\n\n2020) showed that';
    expect(yearsFor(text, 'Smith')).toEqual(['1999']);
    expect(yearsFor(text, 'Jones')).toEqual([]);
  });

  it('still masks the furniture when the same year recurs as a running head', () => {
    const text = pages('2018') +
      'reviewer evaluations (Green, Tonidandel, & Cortina,\n\n\f2018\n\n2016). Specifically,';
    expect(yearsFor(text, 'Green')).toEqual(['2016']);
  });

  // SOL (openai), 2026-09-01. The pattern had no right boundary after the real
  // year, so any token merely STARTING with four digits satisfied it: "2020
  // participants completed the study" made the guard blank the REAL 2016 and
  // report 2020. Grok reached the same hole from "2017 participants".
  it('does not treat a number that merely starts with four digits as the real year', () => {
    const text = pages('2016') +
      'prior work (Smith,\n\f2016\n\n2020 participants completed the study) showed that';
    expect(yearsFor(text, 'Smith')).not.toContain('2020');
  });

  // SOL (openai) and GROK (xai), 2026-09-01. `raw` and `context` are documented
  // as the original text, and Scimeto stores them verbatim as the
  // user-visible citation_text / context_text (coreProcessors.ts:186,195).
  // Masking made them carry blanks where the source had characters — a field
  // claiming to be the source while not being it. They are now sliced from the
  // UNMASKED string.
  it("reports raw and context from the caller's own text, not the masked copy", () => {
    const text = pages('2018') + 'prior work (Becker,\n\n\f2018\n\n2005) showed that';
    const becker = detectCitations(text).find(
      (c) => (c.authors ?? []).some((a) => a.raw === 'Becker'),
    );
    expect(becker).toBeDefined();
    expect(becker!.year).toBe('2005');
    expect(becker!.raw).toBe(text.slice(becker!.position.start, becker!.position.end));
    expect(becker!.raw).toContain('2018');
    expect(becker!.raw).not.toMatch(/ {4}/);
  });
});
