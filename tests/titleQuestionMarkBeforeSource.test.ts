/**
 * A title that ENDS in "?" or "!" no longer absorbs the journal, volume and pages after it.
 *
 * The title terminator prefers the first "." so an interior "?" ("Science or protoscience? Ten
 * years later.") does not truncate a title (apaTitleQuestionMarkBoundary.test.ts). That rule had
 * a documented trade-off: a title that truly ends in "?" ran on to the period after the pages,
 * "Predicting behavior from actions in the past: Repeated decision making or a matter of habit?
 * Journal of Applied Social Psychology, 28, 1355-1374." The 2026-10-08 canary audit counted 26
 * such titles over 5 papers (Aarts, Brandt, Pezzo, Dawson in chen; Simonson, Buhrmester, Milberg
 * in xiao; Kogut in collabra; Sjostrom in chan).
 *
 * The rule: when the text between a "?"/"!" and the chosen period ENDS like a source locator
 * (", <volume>[(<issue>)], <pages>" or ", <volume>[(<issue>)]"), the title ends at the "?".
 * An interior "?" followed by more title words keeps the old behaviour.
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

function titleOf(refLine: string, author: RegExp, style: 'apa' | 'harvard' = 'apa') {
  const text = `Body text.

References
${refLine}
Filler, A. B. (2020). A filler reference to anchor the section. Journal of Filler, 1, 1-10.`;
  const ref = parseReferences(text, style).find((r) => author.test(r.firstAuthorLastName));
  expect(ref).toBeDefined();
  return ref!.title;
}

describe('a title ending in "?" before the source', () => {
  it('APA: volume and page range', () => {
    expect(titleOf(
      'Aarts, H., Verplanken, B., & Van Knippenberg, A. (1998). Predicting behavior from actions in the past: Repeated decision making or a matter of habit? Journal of Applied Social Psychology, 28, 1355-1374.',
      /Aarts/,
    )).toBe('Predicting behavior from actions in the past: Repeated decision making or a matter of habit?');
  });

  it('APA: volume(issue), pages, with a DOI after', () => {
    expect(titleOf(
      'Buhrmester, M., Kwang, T., & Gosling, S. D. (2011). Amazon\'s Mechanical Turk: A new source of inexpensive, yet high-quality, data? Perspectives on Psychological Science, 6(1), 3-5. https://doi.org/10.1177/1745691610393980',
      /Buhrmester/,
    )).toBe('Amazon\'s Mechanical Turk: A new source of inexpensive, yet high-quality, data?');
  });

  it('APA: article number instead of pages, and an exclamation mark', () => {
    expect(titleOf(
      'Smith, A. (2020). Stop the presses! Psychological Science, 31(4), e12345.',
      /Smith/,
    )).toBe('Stop the presses!');
  });

  it('an interior "?" followed by more title words still keeps the whole title', () => {
    expect(titleOf(
      'Kaplan, H., & Barach, P. (2002). Incident reporting: Science or protoscience? Ten years later. BMJ Quality & Safety, 11, 144-145.',
      /Kaplan/,
    )).toBe('Incident reporting: Science or protoscience? Ten years later.');
  });

  it('a "?" title with digits inside the continuation is not cut there', () => {
    expect(titleOf(
      'Jones, B. (2019). Does size matter? Evidence from 1,000 firms in 12 countries. Journal of Firms, 4, 1-9.',
      /Jones/,
    )).toBe('Does size matter? Evidence from 1,000 firms in 12 countries.');
  });
});
