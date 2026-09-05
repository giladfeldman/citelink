import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';

/**
 * Regression: an explicit MULTI-AUTHOR parenthetical citation with a trailing
 * YEAR LIST — "(de Melo, Marsella, & Gratch, 2016, 2017)", "(Wang & Benbasat,
 * 2016, 2017)", "(Aguinis, Suarez, & Joo, 2019, 2021)" — emitted only ONE
 * citation (the first year), dropping every later year in the list. The gold
 * expects one citation PER year, all sharing the full author list.
 *
 * Root cause: the `sameAuthorMultiYear` PARENTHETICAL splitter handles only the
 * SINGLE-author "(de Melo, 2016, 2017)" and ET-AL "(Smith et al., 2016, 2017)"
 * shapes. The explicit-author list ("A & B", "A, B, & C") fell through to the
 * generic in-paren `INPAREN_AUTHOR_YEAR` scanner, whose regex captures a single
 * year — so it emitted "(…, 2016)" and left the ", 2017" tail unparsed.
 *
 * Fix (the platform's hardening workflow 2026-07-03): after the in-paren scanner matches
 * "author-list, YEAR", it now detects a "(\s*,\s*YYYY)+" continuation
 * immediately following and emits each extra year as its own citation sharing
 * the author list, with a distinct narrow position window (addCitation dedupes
 * by exact start-end). This is a DISTINCT defect class from the v0.7.61
 * NARRATIVE-connector fixes (Hard Rule 8: its own atomic cycle). Surfaced on
 * annals_1 (Glikson & Woolley "Human Trust in AI"), which cites
 * "(de Melo, Marsella, & Gratch, 2016, 2017)".
 *
 * Text is clean (no docpluck corruption) — a genuine detection defect.
 */
describe('multi-author parenthetical with a trailing year list emits one citation per year', () => {
  const detect = (text: string) => {
    const cites = detectCitations(text);
    return {
      n: cites.length,
      keys: cites.map((c) => `${c.authors?.[0]?.normalized}|${c.year}`),
      firstAuthors: cites.map((c) => c.authors?.[0]?.normalized),
      years: cites.map((c) => c.year).sort(),
    };
  };

  it('(de Melo, Marsella, & Gratch, 2016, 2017) → 2 citations, first-author "de melo", years 2016+2017', () => {
    const r = detect('Prior work (de Melo, Marsella, & Gratch, 2016, 2017) showed effects.');
    expect(r.n).toBe(2);
    expect(r.years).toEqual(['2016', '2017']);
    expect(new Set(r.firstAuthors)).toEqual(new Set(['de melo']));
  });

  it('(Wang & Benbasat, 2016, 2017) → 2 citations, first-author "wang"', () => {
    const r = detect('Trust in AI (Wang & Benbasat, 2016, 2017) has been studied.');
    expect(r.n).toBe(2);
    expect(r.years).toEqual(['2016', '2017']);
    expect(new Set(r.firstAuthors)).toEqual(new Set(['wang']));
  });

  it('(Aguinis, Suarez, & Joo, 2019, 2021) → 2 citations, first-author "aguinis"', () => {
    const r = detect('(Aguinis, Suarez, & Joo, 2019, 2021)');
    expect(r.n).toBe(2);
    expect(r.years).toEqual(['2019', '2021']);
    expect(new Set(r.firstAuthors)).toEqual(new Set(['aguinis']));
  });

  it('three-year list (de Melo, Marsella, & Gratch, 2015, 2016, 2017) → 3 citations', () => {
    const r = detect('(de Melo, Marsella, & Gratch, 2015, 2016, 2017)');
    expect(r.n).toBe(3);
    expect(r.years).toEqual(['2015', '2016', '2017']);
    expect(new Set(r.firstAuthors)).toEqual(new Set(['de melo']));
  });

  it('year-suffix list (Wang & Benbasat, 2016b, 2017a) → 2 citations', () => {
    const r = detect('(Wang & Benbasat, 2016b, 2017a)');
    expect(r.n).toBe(2);
    expect(new Set(r.firstAuthors)).toEqual(new Set(['wang']));
  });

  it('signal-prefixed two-author multi-year "see (de Melo & Gratch, 2016, 2017)" → 2 citations', () => {
    const r = detect('see (de Melo & Gratch, 2016, 2017)');
    expect(r.n).toBe(2);
    expect(r.years).toEqual(['2016', '2017']);
    expect(new Set(r.firstAuthors)).toEqual(new Set(['de melo']));
  });

  // ── Guards: a SINGLE-year multi-author paren must NOT be split, and a page
  //    locator that follows the year must NOT be read as a second year. ──
  it('single-year multi-author (de Melo, Marsella, & Gratch, 2016) → exactly 1 citation', () => {
    const r = detect('(de Melo, Marsella, & Gratch, 2016)');
    expect(r.n).toBe(1);
    expect(r.years).toEqual(['2016']);
  });

  it('single-year two-author (Wang & Benbasat, 2007) → exactly 1 citation', () => {
    const r = detect('(Wang & Benbasat, 2007)');
    expect(r.n).toBe(1);
  });

  it('year + page locator (Smith & Lee, 2016, p. 15) → exactly 1 citation (page is not a year)', () => {
    const r = detect('(Smith & Lee, 2016, p. 15)');
    expect(r.n).toBe(1);
    expect(r.years).toEqual(['2016']);
  });
});

/**
 * The SAME defect class also manifests inside a ';'-BUNDLE member — this is how it
 * actually appears in annals_1: "(de Melo, Marsella, &\nGratch, 2016, 2017; Lee &
 * Baykal, 2017)". The bundle path (multipleCitations splitter) is a DISTINCT code
 * location from the standalone PROSE_PAREN scanner above; its $-anchored member
 * matchers captured a single year, so a "…, 2016, 2017" member matched none of them
 * and the WHOLE member was dropped — not just the extra year. The shared
 * `emitAllBundleYears` helper (called by each member matcher) fixes it, emitting one
 * narrow-window citation per year so the de-overlap pass keeps every sibling.
 */
describe('multi-year multi-author citation INSIDE a semicolon bundle', () => {
  const detect = (text: string) => {
    const cites = detectCitations(text);
    return {
      n: cites.length,
      keys: cites.map((c) => `${c.authors?.[0]?.normalized}|${c.year}`).sort(),
    };
  };

  it('annals_1 exact "(de Melo, Marsella, &\\nGratch, 2016, 2017; Lee & Baykal, 2017)" → 3 citations', () => {
    const r = detect('(de Melo, Marsella, &\nGratch, 2016, 2017; Lee & Baykal, 2017).');
    expect(r.n).toBe(3);
    expect(r.keys).toEqual(['de melo|2016', 'de melo|2017', 'lee|2017']);
  });

  it('simple bundle "(Jones, 2016; Smith & Lee, 2018, 2019)" → 3 citations (Jones + Smith&Lee×2)', () => {
    const r = detect('(Jones, 2016; Smith & Lee, 2018, 2019)');
    expect(r.n).toBe(3);
    expect(r.keys).toEqual(['jones|2016', 'smith|2018', 'smith|2019']);
  });

  it('single-author bundle member with a year list "(Smith, 2016; Jones, 2018, 2019; Lee, 2020)" → 4 citations', () => {
    const r = detect('(Smith, 2016; Jones, 2018, 2019; Lee, 2020)');
    expect(r.n).toBe(4);
    expect(r.keys).toEqual(['jones|2018', 'jones|2019', 'lee|2020', 'smith|2016']);
  });

  it('bundle WITHOUT a year list is unchanged "(Smith & Jones, 2016; Lee, 2018)" → exactly 2', () => {
    const r = detect('(Smith & Jones, 2016; Lee, 2018)');
    expect(r.n).toBe(2);
    expect(r.keys).toEqual(['lee|2018', 'smith|2016']);
  });
});
