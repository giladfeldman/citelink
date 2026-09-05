import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser';

/**
 * Regression: a reference whose AUTHOR LIST wraps across a line and which is
 * preceded by a BLANK line was keyed on its LAST author, silently dropping the
 * first (the platform's hardening workflow 2026-08-04, found by the R-0177 Sonnet canary
 * audit on annals_2 = 10.5465/annals.2016.0011 — the F1 gate scored this paper
 * as passing).
 *
 * annals_2 prints, verbatim (the reference list marks reviewed studies with "*"):
 *
 *   ...Journal of Applied Psychology, 102: 274-290.
 *                                                      <-- blank line
 *   *Casper, W. J., Eby, L. T., Bordeaux, C., Lockwood, A., &
 *   Lambert, D. A. 2007. Review of research methods in IO/OB work-family research.
 *
 * The entry parsed as "Lambert 2007" instead of "Casper 2007". Because the
 * reference is keyed on the wrong author, the correctly-detected in-text citation
 * "Casper, Eby, Bordeaux, Lockwood, & Lambert (2007)" has no reference to resolve
 * to — a parse defect that surfaces to the user as an unmatched citation.
 *
 * The blank line is the trigger, which is why this survived: with a single "\r\n"
 * separator the SAME entry parses correctly as "Casper". Only the blank-line form
 * (how the paper actually lays it out) fails, so a synthetic single-newline test
 * would have passed while the real document stayed broken.
 */
describe('a wrapped author list after a blank line keeps its FIRST author', () => {
  const PRIOR = 'Alpha, A. A. 2001. First entry title. Journal A, 1: 1-9.';
  const CASPER =
    '*Casper, W. J., Eby, L. T., Bordeaux, C., Lockwood, A., &\r\n' +
    'Lambert, D. A. 2007. Review of research methods in IO/OB work-family research. Journal B, 92: 28-43.';
  const parse = (body: string) =>
    parseReferences('REFERENCES\n' + body).map(r => `${r.firstAuthorLastName}|${r.year}`);

  it('keys on the first author when a BLANK line precedes the entry', () => {
    expect(parse(`${PRIOR}\r\n\r\n${CASPER}`)).toEqual(['Alpha|2001', 'Casper|2007']);
  });

  it('still keys on the first author with a single newline (control)', () => {
    expect(parse(`${PRIOR}\r\n${CASPER}`)).toEqual(['Alpha|2001', 'Casper|2007']);
  });

  it('handles the same shape without the leading "*" review marker', () => {
    const noStar = CASPER.replace(/^\*/, '');
    expect(parse(`${PRIOR}\r\n\r\n${noStar}`)).toEqual(['Alpha|2001', 'Casper|2007']);
  });

  it('keys on the first author after a LONG preceding entry + blank line', () => {
    const cortina =
      'Cortina, J. M., Aguinis, H., & DeShon, R. P. 2017a. Twilight of dawn or of evening? ' +
      'A century of research methods in the Journal of Applied Psychology. ' +
      'Journal of Applied Psychology, 102: 274-290.';
    expect(parse(`${cortina}\r\n\r\n${CASPER}`)).toEqual(['Cortina|2017', 'Casper|2007']);
  });

  it('does not merge the entry into its predecessor (both survive)', () => {
    expect(parse(`${PRIOR}\r\n\r\n${CASPER}`)).toHaveLength(2);
  });
});
