/**
 * Regression: an organizational author whose name ends in an org-suffix word
 * ("JASP Team. (2023).") was CONCATENATED onto the end of the previous reference
 * (after that entry's DOI, with no line break) and never split out — so the work
 * had no reference entry and any in-text "(JASP Team, 2023)" / "JASP (2023)"
 * citation could not match.
 *
 * citationguard-iterate (session 2026-06-07e) — surfaced on collabra_90203.
 * splitConcatenatedApaReferences only recognised a "Surname, Initials. (year)"
 * opener; an org author ("JASP Team. (2023)") has no such shape. Reference
 * string is verbatim from the collabra_90203 extraction fixture (the Isager
 * entry's DOI directly followed by the JASP Team entry).
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences, splitConcatenatedApaReferences } from '../src/referenceParser.js';

const REFS = `References
Isager, P. M., van Aert, R. C. M., Bahník, Š., Brandt, M. J., DeSoto, K. A., Giner-Sorolla, R., Krueger, J. I., Perugini, M., Ropovik, I., van't Veer, A. E., Vranka, M., & Lakens, D. (2021). Deciding what to replicate: A decision model for replication study selection under resource and knowledge constraints. Psychological Methods. Advance online publication. https://doi.org/10.1037/met0000438 JASP Team. (2023). JASP (Version 0.16).
Jeffreys, H. (1939). Theory of probability (1st ed.). Oxford University Press.
`;

describe('organizational-suffix author reference run-on split (O4)', () => {
  const refs = parseReferences(REFS, 'apa');

  it('splits "JASP Team. (2023)" out as its own reference', () => {
    const jasp = refs.find((r) => /jasp/i.test(r.authors?.[0]?.lastName || ''));
    expect(jasp).toBeDefined();
    expect(jasp?.year).toBe('2023');
  });

  it('classifies the JASP Team author as an organization', () => {
    const jasp = refs.find((r) => /jasp/i.test(r.authors?.[0]?.lastName || ''));
    // field name is isOrganization on ParsedReference (isGroupAuthor on the
    // analyze() projection) — accept either.
    const orgFlag = (jasp as any)?.isOrganization ?? (jasp as any)?.isGroupAuthor;
    expect(orgFlag).toBe(true);
  });

  it('does NOT swallow JASP into the Isager reference', () => {
    const isager = refs.find((r) => (r.authors?.[0]?.lastName || '').startsWith('Isager'));
    expect(isager).toBeDefined();
    expect(isager?.raw || '').not.toContain('JASP Team');
  });

  it('still splits a normal two-author APA run-on (no regression)', () => {
    const block =
      'Smith, J. A. (2019). A title goes here in this reference. Journal of Things, 1, 2-3. https://doi.org/10.1037/abc123 Brown, K. L. (2020). Another full title for the next one. Journal of Stuff, 4, 5-6.';
    expect(splitConcatenatedApaReferences(block).length).toBe(2);
  });
});
