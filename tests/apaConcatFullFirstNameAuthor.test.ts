import { describe, it, expect } from '@jest/globals';
import { parseReferences, splitConcatenatedApaReferences } from '../src/referenceParser';

/**
 * Regression: an APA reference whose author spells the GIVEN NAME in full
 * ("Hoffman, Martin L. (1981)") was swallowed when concatenated after a
 * DOI/URL-terminated previous reference (citationguard-iterate cycle 7, 2026-06-30 —
 * chan_feldman_2025_cogemo, R-0177 Sonnet deep audit).
 *
 * `splitConcatenatedApaReferences`' author opener required `Surname, Initials.`
 * ("Hoffman, M. L."). A full first name ("Hoffman, Martin L.") did not match, so when
 * docpluck flowed it onto the previous reference's tail ("…309601282 Hoffman, Martin
 * L. (1981). …") the splitter never opened a new reference and the Hoffman entry was
 * lost entirely (chan: 89 refs parsed vs 90 gold).
 *
 * Fix: the given name may be initials OR a Capitalized full word + optional middle
 * initial. The trailing `(year).` closer keeps it from over-matching a mid-title
 * "Word, Word".
 */

describe('APA concat split — full-first-name author (cycle 7)', () => {
  it('splits "…<DOI> Hoffman, Martin L. (1981). …" into two references', () => {
    const block =
      'Hittner, J. B., May, K., & Silver, N. C. (2003). A Monte Carlo evaluation of tests. ' +
      'The Journal of General Psychology, 130(2), 149-168. https://doi.org/10.1080/00221300309601282 ' +
      'Hoffman, Martin L. (1981). Is altruism part of human nature?. Journal of Personality and ' +
      'Social Psychology, 40(1), 121-137.';
    const parts = splitConcatenatedApaReferences(block);
    expect(parts.length).toBe(2);
    expect(parts[1]).toMatch(/^Hoffman, Martin L\./);
  });

  it('parses the full-first-name reference as a distinct entry', () => {
    const doc =
      'References\n\n' +
      'Hittner, J. B. (2003). A Monte Carlo evaluation. The Journal of General Psychology, 130(2), ' +
      '149-168. https://doi.org/10.1080/00221300309601282 Hoffman, Martin L. (1981). Is altruism part ' +
      'of human nature?. Journal of Personality and Social Psychology, 40(1), 121-137.\n' +
      'Hotelling, H. (1940). The selection of variates. Annals of Mathematical Statistics, 11(3), 271-283.\n';
    const refs = parseReferences(doc, 'apa');
    const hoffman = refs.find((r) => /hoffman/i.test(r.firstAuthorLastName || ''));
    expect(hoffman).toBeDefined();
    expect(String(hoffman!.year)).toBe('1981');
  });

  it('still requires the (year). closer — does not over-split a "Word, Word" mid-title (guard)', () => {
    // A title containing "Surname, Givenname"-shaped prose must NOT trigger a split
    // because no "(year)." follows it.
    const block =
      'Smith, J. A. (2020). A study of the Roberts, Thomas method and its consequences for the field. ' +
      'Journal of Things, 5(2), 10-20.';
    expect(splitConcatenatedApaReferences(block)).toEqual([block]);
  });
});
