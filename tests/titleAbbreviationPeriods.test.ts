/**
 * A period that belongs to an abbreviation or a part number inside a title does not end it, and
 * a group author keeps no trailing period. (2026-10-08 canary audit, chan_feldman_2025_cogemo;
 * expected values are the AI gold's verbatim entries.)
 *
 *  - "Olkin's new formula for significance of r13 vs. r23 compared with hotelling's method."
 *    was cut at "vs.".
 *  - "Interpersonal forgiving in close relationships: II. Theoretical Elaboration and
 *    Measurement." was cut at "II." — a part number after a colon, not the end of the title.
 *    (A LEADING part number, "VII. Mathematical contributions…", was already handled.)
 *  - "Will it replicate? McCullough et al. 1997 | Study 1 poll on Twitter (Mar 26, 2023)." was
 *    cut at "et al.".
 *  - "Open Science Collaboration. (2015)" keyed its author as "Open Science Collaboration.".
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

function first(line: string) {
  const text = `Body.\n\nReferences\n${line}\nFiller, A. B. (2020). A filler reference to anchor the section. Journal of Filler, 1, 1-10.\n`;
  return parseReferences(text, 'apa')[0];
}

describe('periods inside a title that do not end it', () => {
  it('"vs." does not end a title', () => {
    expect(first("Hendrickson, G. F., Stanley, J. C., & Hills, J. R. (1970). Olkin's new formula for significance of r13 vs. r23 compared with hotelling's method. American Educational Research Journal, 7(2), 189-195.").title)
      .toBe("Olkin's new formula for significance of r13 vs. r23 compared with hotelling's method.");
  });

  it('a roman part number after a colon does not end a title', () => {
    expect(first('McCullough, M. E., Rachal, K. C., Sandage, S. J., Worthington, E. L., Brown, S. W., & Hight, T. L. (1998). Interpersonal forgiving in close relationships: II. Theoretical Elaboration and Measurement. Journal of Personality and Social Psychology, 75(6), 1586-1603.').title)
      .toBe('Interpersonal forgiving in close relationships: II. Theoretical Elaboration and Measurement.');
  });

  it('"et al." inside a title does not end it', () => {
    expect(first('Feldman, G. (2023). Will it replicate? McCullough et al. 1997 | Study 1 poll on Twitter (Mar 26, 2023). https://twitter.com/giladfeldman/status/1639889114630586370.').title)
      .toMatch(/^Will it replicate\? McCullough et al\. 1997 \| Study 1 poll on Twitter/);
  });

  // A title that genuinely ENDS in the abbreviation: what follows is the source, so the period
  // ends the title after all. Without this the journal, volume and pages were read as title
  // (Sonnet cross-model review 2026-10-09).
  it.each([
    ['Jones, A. (2019). A reply to Smith et al. Psychological Science, 30, 1-5.', 'A reply to Smith et al.'],
    ['Jones, A. (2019). Nature vs. Psychological Science, 30(2), 1-5.', 'Nature vs.'],
    ['Smith, J. (2020). Forgiving: II. Journal of Y, 3, 4-5.', 'Forgiving: II.'],
  ])('a title ending in an abbreviation stops before its source: %s', (ref, title) => {
    expect(first(ref).title).toBe(title);
  });

  it('an ordinary title still ends at its first sentence period', () => {
    expect(first('McCullough, M. E., Worthington, E. L., & Rachal, K. C. (1997). Interpersonal forgiving in close relationships. Journal of Personality and Social Psychology, 73(2), 321-336.').title)
      .toBe('Interpersonal forgiving in close relationships.');
  });
});

describe('group author', () => {
  it('"Open Science Collaboration. (2015)" keys the author without the period', () => {
    const r = first('Open Science Collaboration. (2015) Estimating the reproducibility of psychological science. Science, 349(6251), aac4716.');
    expect(r.isGroupAuthor).toBe(true);
    expect(r.firstAuthorLastName).toBe('Open Science Collaboration');
  });
});
