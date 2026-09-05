import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';
import { parseReferences } from '../src/referenceParser';

/**
 * Regression: a parenthesized PREFERRED-NAME aside inside an author list broke BOTH the
 * citation detector and the reference parser (the platform's hardening workflow 2026-08-04, annals_1 —
 * R-0177 Sonnet canary audit; open finding #1 in the 2026-07-04 handoff).
 *
 * Some authors publish under a given name that differs from their legal first name, and
 * journals print it parenthesized. annals_1 contains, verbatim:
 *
 *   in-text:   "Fox, (Grace) Ahn, Janssen, Yeykelis, Segovia, & Bailenson, 2015"
 *   reference: "Fox, J., (Grace) Ahn, S. J., Janssen, J. H., Yeykelis, L.,
 *               Segovia, K. Y., & Bailenson, J. N. 2015. ..."
 *
 * TWO independent defects, either of which alone breaks matching:
 *
 *  1. CITATION SIDE — the author-list alternation could not cross "(Grace)", so the
 *     citation was not detected AT ALL (0 citations returned), at every author count and
 *     in parenthetical, narrative, and et-al forms.
 *
 *  2. REFERENCE SIDE (not noted in the handoff, and the more dangerous half) — the
 *     `authorPattern` lookahead after "Fox, J.," requires `,\s*[A-ZÀ-Ÿ]`; it saw "("
 *     instead, so the scan resynced at the next parseable author and SILENTLY DROPPED
 *     the first author "Fox". The reference was keyed on "Ahn". This is invisible in
 *     aggregate metrics because the remaining five authors parse cleanly — the reference
 *     still looks well-formed while being keyed to the wrong person.
 *
 * Fix: strip the aside in `parseAuthorsFromSection` (reference side) and tolerate it via
 * PREFERRED_NAME_ASIDE in COMPOUND_SURNAME, stripping it in `createParsedAuthor`
 * (citation side) so it never survives into the author key.
 */

const FOX_REFERENCE =
  'Fox, J., (Grace) Ahn, S. J., Janssen, J. H., Yeykelis, L., Segovia, K. Y., ' +
  '& Bailenson, J. N. 2015. Avatars versus agents: A meta-analysis. ' +
  'Human-Computer Interaction, 30: 401-432.';

const refAuthors = (refText: string, style = 'aom') =>
  (parseReferences(`Body text.\n\nReferences\n\n${refText}\n`, style as never)[0]?.authors ?? [])
    .map((a) => a.lastName ?? '');

describe('parenthesized preferred-name aside (annals_1 Fox 2015, R-0177)', () => {
  describe('reference side — the silent first-author drop', () => {
    it('keeps "Fox" as the FIRST author (was dropped, keying the reference on "Ahn")', () => {
      const authors = refAuthors(FOX_REFERENCE);
      expect(authors[0]).toBe('Fox');
      expect(authors).toEqual(['Fox', 'Ahn', 'Janssen', 'Yeykelis', 'Segovia', 'Bailenson']);
    });

    it('does not leave the aside inside the following surname', () => {
      expect(refAuthors(FOX_REFERENCE)).not.toContain('(Grace) Ahn');
    });
  });

  describe('citation side — the total detection miss', () => {
    it('detects the six-author parenthetical and keys it on "Fox"', () => {
      const citations = detectCitations(
        'Avatars mattered (Fox, (Grace) Ahn, Janssen, Yeykelis, Segovia, & Bailenson, 2015).',
      );
      expect(citations).toHaveLength(1); // was 0
      expect(citations[0].authors.map((a) => a.raw)).toEqual([
        'Fox',
        'Ahn',
        'Janssen',
        'Yeykelis',
        'Segovia',
        'Bailenson',
      ]);
      expect(citations[0].year).toBe('2015');
    });

    it('handles the two-author, narrative, and et-al forms', () => {
      expect(detectCitations('Avatars mattered (Fox & (Grace) Ahn, 2015).')).toHaveLength(1);
      expect(
        detectCitations('Fox, (Grace) Ahn, and Bailenson (2015) found that avatars mattered.')[0]
          .authors[0].normalized,
      ).toBe('fox');
      expect(detectCitations('Avatars mattered (Fox, (Grace) Ahn, et al., 2015).')).toHaveLength(1);
    });

    it('strips the aside from the author key so it can match the reference', () => {
      const [citation] = detectCitations(
        'Avatars mattered (Fox, (Grace) Ahn, Janssen, Yeykelis, Segovia, & Bailenson, 2015).',
      );
      const ahn = citation.authors[1];
      expect(ahn.raw).toBe('Ahn');
      expect(ahn.normalized).toBe('ahn');
    });
  });

  describe('both sides agree on the author key (the matching contract)', () => {
    it('citation first author === reference first author', () => {
      const [citation] = detectCitations(
        'Avatars mattered (Fox, (Grace) Ahn, Janssen, Yeykelis, Segovia, & Bailenson, 2015).',
      );
      expect(citation.authors[0].raw).toBe(refAuthors(FOX_REFERENCE)[0]);
    });
  });

  describe('NON-REGRESSION: parenthesized content that is NOT a preferred name', () => {
    it('does not invent a pseudo-author from a PERIOD-LESS "(Ed)" editor phrase', () => {
      // The regression this guards: the first aside-strip relied on "(Ed.)" carrying a
      // trailing period to be safe. Upstream normalization can drop it, and the
      // period-less "(Ed)" then read as a preferred name. Stripping it turned
      //   "… In H. Aguinis (Ed.), Test-score banding in human resource selection …"
      // into a parseable pseudo-author, so annals_4 grew a SPURIOUS second
      // "Aguinis 2004" reference that out-competed the real "Aguinis & Harden 2004"
      // for its in-text citation. Corpus matching fell 0.9133 -> 0.9101; the unit
      // suite stayed green, which is why this assertion exists.
      const doc =
        'Body text.\n\nReferences\n\n' +
        'Aguinis, H., & Harden, E. (2004). Will banding benefit my organization? ' +
        'An application of multi-attribute utility analysis. In H. Aguinis (Ed), ' +
        'Test-score banding in human resource selection: Legal, technical, and ' +
        'societal issues (pp. 193-216). Westport, CT: Praeger.\n';
      const refs = parseReferences(doc, 'apa' as never);

      expect(refs).toHaveLength(1);
      expect(refs[0].authors.map((a) => a.lastName)).toEqual(['Aguinis', 'Harden']);
    });

    it('the aside-strip does not consume editorial markers, years, or editions', () => {
      // "(Ed.)" / "(Eds.)" / "(Trans.)" / "(2nd ed.)" end in a period or contain a digit,
      // and "(1975)" is numeric — none can match the alphabetic-only aside pattern.
      // Asserted directly against the strip so a future loosening cannot silently eat
      // them on their way to the downstream editor/edition handling.
      const ROLE = '(?:Eds?|Trans|Comps?|Illus|Narr|Dir|Prod|Vol|Pt|No)';
      const ASIDE = new RegExp(
        `\\(\\s*(?!${ROLE}\\s*\\.?\\s*\\))[A-ZÀ-Ÿ][a-zà-ÿā-ž'’-]{1,20}\\s*\\.?\\s*\\)\\s*`,
        'g',
      );
      // Both the period-carrying and the PERIOD-LESS forms must survive.
      for (const marker of [
        '(Ed.) ',
        '(Ed) ',
        '(Eds.) ',
        '(Eds) ',
        '(Trans.) ',
        '(Trans) ',
        '(2nd ed.) ',
        '(1975) ',
      ]) {
        expect(marker.replace(ASIDE, '')).toBe(marker);
      }
      // ...while a real preferred-name aside IS removed.
      expect('(Grace) '.replace(ASIDE, '')).toBe('');
    });

    it('does not swallow a signal phrase or a nested year in a citation', () => {
      expect(detectCitations('As shown (e.g., Lakens, 2018).')[0].authors[0].normalized).toBe(
        'lakens',
      );
      const plain = detectCitations('Avatars mattered (Fox & Bailenson, 2015).');
      expect(plain).toHaveLength(1);
      expect(plain[0].authors.map((a) => a.raw)).toEqual(['Fox', 'Bailenson']);
    });

    it('a plain author list is unchanged', () => {
      const citations = detectCitations(
        'Avatars mattered (Fox, Ahn, Janssen, Yeykelis, Segovia, & Bailenson, 2015).',
      );
      expect(citations).toHaveLength(1);
      expect(citations[0].authors).toHaveLength(6);
    });
  });
});
