import { describe, it, expect } from '@jest/globals';
import {
  parseReferences,
  splitConcatenatedAomReferences,
} from '../src/referenceParser';

/**
 * Regression: AOM (Academy of Management) bare-year run-on references
 * (citationguard-iterate 2026-06-25, amp_1 — TC-1 / TC-2).
 *
 * AOM style writes the author list with a comma + period-initials exactly like
 * APA ("Egghe, L. 2006.", "Certo, S. T., Sirmon, D. G., & Brymer, R. A. 2010.")
 * but the year is a BARE "2006." — never the parenthesized "(2006)." that BOTH
 * the APA and Harvard concatenation splitters require. So when docpluck flows two
 * AOM entries onto one line ("Egghe, L. 2006. … 131-152. Elsevier. 2016.
 * CiteScore … Elsevier. 2021. …"), neither existing splitter fires and the
 * second+ entries are swallowed into the first. On amp_1 this lost the two
 * "Elsevier." org-authored references (TC-1) and the "van Raan, A. F. 2006."
 * particle-surname reference (TC-2). Fix: splitConcatenatedAomReferences, an
 * AOM-only bare-year sibling of the APA/Harvard splitters.
 *
 * The text below is the REAL docpluck-academic extraction of amp_1's reference
 * section (DOI 10.5465/amp.2023.0198), verbatim — line 905 carries Egghe plus
 * two concatenated "Elsevier." org entries; line 951 is the standalone "van Raan"
 * particle-surname entry.
 */

// Real fixture line 905: Egghe + two concatenated org-authored "Elsevier." refs.
const AOM_CONCAT_LINE =
  'Egghe, L. 2006. Theory and practice of the g-index. Scientometrics, 69: 131-152. ' +
  'Elsevier. 2016. CiteScore: A new metric to help you track journal performance and make decisions. ' +
  'Retrieved from https://www.elsevier.com/connect/editorsupdate/citescore ' +
  "Elsevier. 2021. Measuring a journal's impact. Retrieved from https://www.elsevier.com/authors";

// Real fixture line 951: particle-surname standalone entry.
const AOM_VAN_RAAN =
  'van Raan, A. F. 2006. Comparison of the Hirsch-index with standard bibliometric indicators ' +
  'and with peer judgment for 147 chemistry research groups. Scientometrics, 67: 491-502.';

const DOC =
  'Some body text discussing the h-index and bibliometrics.\n\nReferences\n' +
  AOM_CONCAT_LINE + '\n' + AOM_VAN_RAAN + '\n';

describe('AOM bare-year run-on reference splitting (amp_1)', () => {
  it('splits a concatenated AOM bare-year block into individual entries', () => {
    const parts = splitConcatenatedAomReferences(AOM_CONCAT_LINE);
    // Egghe + Elsevier 2016 + Elsevier 2021 = 3 entries, never 1 glob.
    expect(parts.length).toBe(3);
    expect(parts[0]).toMatch(/^Egghe, L\. 2006\./);
    expect(parts[1]).toMatch(/^Elsevier\. 2016\./);
    expect(parts[2]).toMatch(/^Elsevier\. 2021\./);
  });

  it('parseReferences recovers the two concatenated "Elsevier." org references (TC-1)', () => {
    const refs = parseReferences(DOC, 'aom');
    const elsevier = refs.filter((r) => /^Elsevier\.\s+20(16|21)\b/.test((r.raw || '').trim()));
    // Both Elsevier entries must be their own references, not swallowed into Egghe.
    expect(elsevier.length).toBe(2);
    const years = elsevier.map((r) => r.year).sort();
    expect(years).toEqual(['2016', '2021']);
    // And Egghe must survive as its own (no-longer-giant) entry.
    const egghe = refs.find((r) => /^Egghe/.test((r.raw || '').trim()));
    expect(egghe).toBeDefined();
    expect(egghe!.year).toBe('2006');
  });

  it('parseReferences recovers the "van Raan" particle-surname reference (TC-2)', () => {
    const refs = parseReferences(DOC, 'aom');
    const vanRaan = refs.find((r) => /^van Raan/.test((r.raw || '').trim()));
    expect(vanRaan).toBeDefined();
    expect(vanRaan!.year).toBe('2006');
  });

  it('does not fire on a clean APA "Surname, A. (year)." reference (no AOM false-split)', () => {
    // Guard: the AOM bare-year splitter must be a no-op on parenthesized-year APA
    // text — its opener requires a BARE "year." so a "(year)." entry is invisible.
    const apa =
      'Cameron, C. D., & Payne, B. K. (2011). Escaping affect. ' +
      'Journal of Personality and Social Psychology, 100(1), 1-15.';
    const parts = splitConcatenatedAomReferences(apa);
    expect(parts).toEqual([apa]);
  });

  it('does not split a single clean AOM entry at an internal year-like token', () => {
    // A lone AOM reference whose title/journal happens to contain a "year." must
    // stay one entry — the opener also requires a following author signature.
    const single =
      'Aguinis, H. 2013. Performance management, 3rd ed. Upper Saddle River, NJ: Pearson Prentice Hall.';
    const parts = splitConcatenatedAomReferences(single);
    expect(parts).toEqual([single]);
  });
});
