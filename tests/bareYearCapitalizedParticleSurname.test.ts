import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser';

/**
 * Regression: bare-year (AOM/ASA/Chicago) author parsing must keep a CAPITALIZED
 * two-word particle surname whole — "Van Iddekinge" must not truncate to "Van".
 * (citationguard-iterate cycle 7, 2026-06-30 — annals_2, R-0177 Sonnet audit.)
 *
 * `parseBareYearReference` chose its author sub-parser from `hasCommaInFirstAuthor`
 * / `hasNoCommaFullNames`, both of which tested `^[A-Z][a-z]+,` against the FIRST
 * WORD. For "Van Iddekinge, C. H., …" the first word "Van" is followed by a space
 * (not a comma), so it concluded "no comma in first author" and routed to the
 * no-comma full-name parser — which read "Van Iddekinge" as lastName="Van",
 * firstName="Iddekinge", dropping the real surname. The lowercase tussenvoegsel
 * "van Aken" already parsed correctly (its first word starts lowercase and never
 * matched `^[A-Z]`); the capitalized "Van X" was the gap.
 *
 * Fix: allow an optional capitalized-particle prefix in the comma-format detectors,
 * so "[Particle] Surname, Initials" is recognized as a comma-format first author and
 * routed to the parser that keeps the full surname.
 *
 * The first input is VERBATIM from the annals_2 extraction (DOI 10.5465/annals.2016.0011).
 */

function firstAuthorOf(refText: string): string {
  const r = parseReferences(`References\n\n${refText}\n`, 'aom')[0] ?? ({} as any);
  return r.firstAuthorLastName || r.authors?.[0]?.lastName || '';
}

describe('bare-year capitalized particle surname (cycle 7)', () => {
  it('keeps "Van Iddekinge" whole (annals_2)', () => {
    expect(
      firstAuthorOf(
        'Van Iddekinge, C. H., Aguinis, H., Mackey, J. D., & DeOrtentiis, P. S. 2017. ' +
          'A meta-analysis of the interactive, additive, and relative effects of cognitive ability ' +
          'and motivation on performance. Personnel Psychology, 70: 1-30.',
      ),
    ).toBe('Van Iddekinge');
  });

  it('keeps a lowercase tussenvoegsel surname whole — "van Aken" (regression guard)', () => {
    expect(
      firstAuthorOf('van Aken, J. E. 2004. Management research. Journal of Management Studies, 41: 219-246.'),
    ).toBe('van Aken');
  });

  it('keeps another capitalized particle surname whole — "De Wals"', () => {
    expect(
      firstAuthorOf('De Wals, P., & Smith, J. 2010. Vaccine safety. Annual Review of Public Health, 31: 1-20.'),
    ).toBe('De Wals');
  });

  it('does not over-extend a normal single-word surname (guard)', () => {
    expect(
      firstAuthorOf('Aguinis, H. 2014. Scholarly impact: A pluralist conceptualization. Academy of Management Learning & Education, 13: 623-639.'),
    ).toBe('Aguinis');
  });
});
