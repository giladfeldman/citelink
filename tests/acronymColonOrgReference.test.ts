/**
 * Regression: an APA reference whose author is an acronym-colon organisation —
 * "KNAW: Royal Dutch Academy of Arts and Sciences. (2018). Replication
 * studies: …" — was lost (merged into the previous reference) and, once split,
 * carried the whole spelled-out name as its surname so nothing matched it.
 *
 * citationguard-iterate (session 2026-06-07b) cycle 5 — surfaced on chen_2021_jesp.
 * Two parts:
 *  1. splitIntoReferences did not treat "ACRONYM: Capitalized" as a new-reference
 *     start (the year is NOT adjacent to the acronym — it follows the spelled-out
 *     name — so the existing "ACRONYM. (year)" org opener missed it).
 *  2. parseAPAReference now parses the author as the ACRONYM ("KNAW"), which is
 *     how the work is cited in-text ("(KNAW, 2018)") and how the key must read.
 *
 * Reference string is verbatim from the chen_2021_jesp extraction fixture.
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

const REFS = `References
Klein, R. A., Vianello, M., Hasselman, F., Adams, B. G., Adams, R. B., Jr., Alper, S., … Sowden, W. (2018). Many labs 2: Investigating variation in replicability across samples and settings. Advances in Methods and Practices in Psychological Science, 1(4), 443–490.
KNAW: Royal Dutch Academy of Arts and Sciences. (2018). Replication studies: Improving reproducibility in the empirical sciences. Amsterdam: KNAW.
Litman, L., Robinson, J., & Abberbock, T. (2017). TurkPrime.com: A versatile crowdsourcing data acquisition platform. Behavior Research Methods, 49(2), 433–442.
`;

describe('acronym-colon organisation reference (cycle 5)', () => {
  const refs = parseReferences(REFS, 'apa');

  it('parses the KNAW reference as a separate entry (not merged into Klein)', () => {
    const knaw = refs.find((r) => (r.authors[0]?.lastName || '').startsWith('KNAW'));
    expect(knaw).toBeDefined();
  });

  it('uses the ACRONYM "KNAW" as the author surname (matches the in-text "(KNAW, 2018)")', () => {
    const knaw = refs.find((r) => (r.authors[0]?.lastName || '').startsWith('KNAW'));
    expect(knaw!.authors[0].lastName).toBe('KNAW');
    expect(knaw!.year).toBe('2018');
  });

  it('parses the KNAW title, not the spelled-out organisation name', () => {
    const knaw = refs.find((r) => (r.authors[0]?.lastName || '').startsWith('KNAW'));
    expect(knaw!.title || '').toMatch(/^Replication studies/i);
  });

  it('still parses the neighbouring Klein and Litman references correctly', () => {
    expect(refs.find((r) => r.authors[0]?.lastName === 'Klein')).toBeDefined();
    expect(refs.find((r) => r.authors[0]?.lastName === 'Litman')).toBeDefined();
  });
});
