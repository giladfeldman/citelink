/**
 * Regression: a numbered (IEEE/Vancouver) reference whose conference/journal
 * info embeds a capitalized word immediately followed by a publication month +
 * year must NOT be split there.
 *
 * citationguard-iterate 2026-06-10 (ieee_access_2). Reference [5] is:
 *   "[5]. Wang Z, Wen T, and Wu W, "Modeling and simulation of rumor
 *    propagation in social networks based on Petri net theory," in Proc. IEEE
 *    12th Int. Conf. Netw., Sens. Control, Apr. 2015, pp. 492-497. ..."
 * The venue is "…Networking, Sensing and Control" abbreviated to "Netw., Sens.
 * Control". step 1c's inline splitter read "Control, Apr. 2015" as a new
 * "Surname=Control, Firstname=Apr … year=2015" reference start, splitting [5]
 * into a year-less "Wang … Netw., Sens." half and a phantom author-less
 * "Control 2015" reference. That phantom shifted every later numeric index, so
 * citations [16]/[17] resolved to the wrong reference (compare-citelink.mjs
 * matching.wrong_target on ieee_access_2).
 *
 * Fix: in step 1c Pass-2 validation, reject a candidate whose word after the
 * comma is a month (full or abbreviated) followed by a digit — a publication
 * date, never a real "Surname, Firstname" reference start. "Surname, June A."
 * (a first name that happens to be a month, followed by an initial not a digit)
 * is still a valid split.
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

const REF_SLICE =
  '[4]. Pommereau F and Gaucherel C, "A multivalued, spatialized, and timed ' +
  'modelling language for social-ecological systems," in Proc. Int. Workshop ' +
  'Petri Nets Softw. Eng. (PNSE), Geneva, Switzerland, Jun. 2024, pp. 20-40.\n' +
  '[5]. Wang Z, Wen T, and Wu W, "Modeling and simulation of rumor propagation ' +
  'in social networks based on Petri net theory," in Proc. IEEE 12th Int. Conf. ' +
  'Netw., Sens. Control, Apr. 2015, pp. 492-497. [Online]. Available: ' +
  'http://ieeexplore.ieee.org/document/7116086/\n' +
  '[6]. Aduddell R, Fairbanks J, Kumar A, Ocal PS, Patterson E, and Shapiro BT, ' +
  '"A compositional account of biological systems," J. Theor. Biol., vol. 600, ' +
  'May 2025, Art. no. 112000.';

describe('numbered reference: month+date inside venue must not trigger a split', () => {
  it('keeps IEEE ref [5] whole — no phantom "Control" reference', () => {
    const refs = parseReferences('References\n' + REF_SLICE, 'vancouver');
    expect(refs).toHaveLength(3);
    const phantom = refs.find(r => (r.authors[0]?.lastName || '') === 'Control');
    expect(phantom).toBeUndefined();
  });

  it('parses ref [5] as Wang with year 2015 (year not lost to the split)', () => {
    const refs = parseReferences('References\n' + REF_SLICE, 'vancouver');
    const wang = refs.find(r => (r.authors[0]?.lastName || '') === 'Wang');
    expect(wang).toBeDefined();
    expect(wang?.year).toBe('2015');
    expect(wang?.listNumber).toBe(5);
  });

  it('still splits a real "Surname, Firstname" start where the firstname is a month (June A.)', () => {
    // A first name that happens to be a month, followed by an initial (not a
    // date digit), must remain a valid reference boundary.
    const text =
      'References\n' +
      'Aarts, H. (1998). Predicting behavior from past actions, a long enough ' +
      'title for the parser. Journal of Applied Social Psychology. ' +
      'Maybury, June A. (2015). A second study with a sufficiently long title to ' +
      'parse. Journal of Examples, 12, 33-50.';
    const refs = parseReferences(text, 'apa');
    const maybury = refs.find(r => (r.authors[0]?.lastName || '') === 'Maybury');
    expect(maybury).toBeDefined();
  });
});
