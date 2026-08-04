import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';

/**
 * Regression: an UNPARENTHESIZED multi-author narrative citation with a bare comma-year
 * was never detected (scimeto-iterate 2026-08-04, annals_1 — R-0177 Sonnet audit,
 * the "Fox" finding; the last of the four handoff items).
 *
 * annals_1 prints, verbatim:
 *
 *   "In a meta-analysis of 32 studies, Fox, (Grace) Ahn, Janssen, Yeykelis, Segovia, &
 *    Bailenson, 2015 found that when avatars were presented to users as humans…"
 *
 * The year carries NO parentheses, so every narrative pattern in the detector — all of
 * which anchor on `\(year\)` — missed it and the citation was not detected at all.
 * v0.7.66 fixed the `(Grace)` aside, which was a SEPARATE defect stacked on the same
 * citation; this is the other half.
 *
 * WHY THIS PATTERN IS SO TIGHT. "Surname, YYYY" in running prose is overwhelmingly not
 * a citation. Measured across the 18-paper corpus body text (reference lists excluded):
 * a loose `Surname, YYYY` rule fires 42 times to catch this ONE real citation — about
 * 2% precision. The false hits are country-year pairs ("Poland, 2015"), date ranges
 * ("Italy, 1992-"), and multi-line parenthetical spillover. Requiring (1) >=3
 * comma-separated surnames, (2) a final "& Surname" connector, (3) a bare `, YYYY`, and
 * (4) a following reporting verb yields 1 hit / 1 true positive / 0 false positives on
 * the same corpus.
 *
 * The NON-REGRESSION block below pins each of those four guards. If a future cycle
 * loosens this, re-measure precision first — the over-detection risk exceeds the recall
 * gain.
 */

const keysOf = (text: string) =>
  detectCitations(text).map((c) => ({
    authors: c.authors.map((a) => a.raw),
    year: c.year,
  }));

describe('bare-year multi-author narrative (annals_1 Fox 2015, R-0177)', () => {
  it('detects the verbatim annals_1 citation and keys it on the FIRST author', () => {
    const found = keysOf(
      'In a meta-analysis of 32 studies, Fox, (Grace) Ahn, Janssen, Yeykelis, Segovia, ' +
        '& Bailenson, 2015 found that when avatars were presented to users as humans, ' +
        'they were more influential than when they were presented as AI-based.',
    );
    expect(found).toHaveLength(1); // was 0
    expect(found[0].authors).toEqual([
      'Fox',
      'Ahn',
      'Janssen',
      'Yeykelis',
      'Segovia',
      'Bailenson',
    ]);
    expect(found[0].year).toBe('2015');
  });

  it('does not swallow the sentence lead-in into the first author', () => {
    // "…of 32 studies, Fox, …" — the list starts mid-sentence.
    const [c] = keysOf(
      'In a meta-analysis of 32 studies, Fox, Ahn, Janssen, Segovia, & Bailenson, 2015 ' +
        'found that avatars mattered.',
    );
    expect(c.authors[0]).toBe('Fox');
  });

  it('works across the reporting verbs journals actually use', () => {
    for (const verb of ['found', 'showed', 'demonstrated', 'reported', 'concluded']) {
      const found = keysOf(
        `In a review, Fox, Ahn, Janssen, Segovia, & Bailenson, 2015 ${verb} that avatars mattered.`,
      );
      expect(found).toHaveLength(1);
      expect(found[0].authors[0]).toBe('Fox');
    }
  });

  describe('NON-REGRESSION — each precision guard must hold', () => {
    it('requires a reporting verb (guard 4)', () => {
      // Without a verb this is indistinguishable from prose; must NOT fire.
      expect(
        keysOf('In a meta-analysis, Fox, Ahn, Janssen, Segovia, & Bailenson, 2015 and other work.'),
      ).toHaveLength(0);
    });

    it('requires the "& Surname" multi-author connector (guard 2)', () => {
      expect(keysOf('In a study, Fox & Bailenson, 2015 found that avatars mattered.')).toHaveLength(
        0,
      );
    });

    it('does not fire on a country-year or date-range pair', () => {
      // The exact false-positive class the loose rule produced on bjps_1 / amp_1.
      expect(keysOf('We compare Poland, 2015 showed strong effects.')).toHaveLength(0);
      expect(keysOf('The sample covers Italy, 1992 documented in the appendix.')).toHaveLength(0);
    });

    it('leaves the ordinary PARENTHESIZED forms to their own patterns', () => {
      // Must still be exactly one citation, not a duplicate emitted by both loops.
      const paren = keysOf(
        'Avatars mattered (Fox, Ahn, Janssen, Yeykelis, Segovia, & Bailenson, 2015).',
      );
      expect(paren).toHaveLength(1);

      const narrative = keysOf('Fox, Ahn, and Bailenson (2015) found that avatars mattered.');
      expect(narrative).toHaveLength(1);
      expect(narrative[0].authors[0]).toBe('Fox');
    });

    it('does not double-emit when the same sentence is scanned', () => {
      const found = keysOf(
        'In a meta-analysis of 32 studies, Fox, (Grace) Ahn, Janssen, Yeykelis, Segovia, ' +
          '& Bailenson, 2015 found that avatars mattered.',
      );
      expect(found).toHaveLength(1);
    });
  });
});
