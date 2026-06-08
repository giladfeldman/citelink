/**
 * Regression: a two-word compound surname in "Surname, Initials" form
 * ("Ross Russell, A. L.") parsed as just the LAST word ("Russell"). The
 * `parseAuthorsFromSection` author tokenizer's surname-continuation group only
 * accepted a LOWERCASE particle ("van der Berg"), so the capitalized 2nd word
 * "Russell" was not absorbed and the regex re-anchored at "Russell".
 *
 * citationguard-iterate (session 2026-06-07e, O3) — surfaced on nat_comms_2
 * reference #4 (a Nature-numbered paper). Fix: allow ONE capitalized 2nd surname
 * word, kept safe by (a) requiring a trailing ", Initials" and (b) the 2nd word
 * needing lowercase letters (so an initial like "A" in "Smith A," is NOT eaten).
 * The first string is verbatim from the nat_comms_2 extraction fixture.
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

describe('two-word compound surname (O3)', () => {
  it('parses "Ross Russell, A. L." with the full compound surname', () => {
    const REFS =
      'References\n' +
      '4. Ross Russell, A. L. et al. Spectrum, risk factors and outcomes of neurological and psychiatric complications of COVID-19: a UK-wide cross-sectional surveillance study. Brain Commun. 3, fcab168 (2021).\n';
    const refs = parseReferences(REFS, 'nature');
    const r = refs.find((x) => /russell/i.test(x.authors?.[0]?.lastName || ''));
    expect(r?.authors?.[0]?.lastName).toBe('Ross Russell');
  });

  it('does NOT merge separate authors in a comma list (no over-capture)', () => {
    const REFS =
      'References\n' +
      'Smith, J. A., Brown, K. L., & Jones, M. R. (2020). A representative title for the regression guard here. Journal of Testing, 1(2), 3-4.\n';
    const refs = parseReferences(REFS, 'apa');
    const last = refs.find((x) => /smith|brown|jones/i.test(x.authors?.[0]?.lastName || ''));
    const names = (last?.authors || []).map((a) => a.lastName);
    // Smith must be its own author, NOT "Smith Brown" / "Smith J"
    expect(names[0]).toBe('Smith');
    expect(names).toContain('Brown');
    expect(names).toContain('Jones');
  });

  it('does NOT eat a single-initial as a surname word ("Smith A,")', () => {
    const REFS =
      'References\n' +
      'Smith A, Jones B, Taylor C. A Vancouver-style title for the guard test here. J Test. 2020; 1:2-3.\n';
    const refs = parseReferences(REFS, 'vancouver');
    const r = refs.find((x) => /smith/i.test(x.authors?.[0]?.lastName || ''));
    expect(r?.authors?.[0]?.lastName).toBe('Smith');
  });
});
