/**
 * Regression: a numeric page/year RANGE split across a line break must not
 * fabricate a reference (HALLUCINATION class) or steal the next entry's number.
 *
 * citationguard-iterate cycle 6 — surfaced on plos_med_1 (Vancouver numbered
 * style). A reference ended "... BJOG. 2004; 111:243–" and the next line was
 * "248. https://doi.org/...". The numbered-reference splitter read the line-start
 * "248." as a NEW reference number, fabricating reference #248 and leaving the
 * real next entry (Munro, #25) to be mis-numbered. extractReferenceSection now
 * joins a digit-range split across a line break ("243–\n248" → "243–248"),
 * mirroring the existing word-hyphenation join.
 *
 * Reference strings verbatim from the plos_med_1 extraction fixture
 * (apps/worker/tests/extraction-results/plos_med_1.pdf_pymupdf.txt, lines ~990–996).
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

const REFS = `References
24.
Marsh F, Kremer C, Duffy S. Delivering an effective outpatient service in gynaecology. A randomised
controlled trial analysing the cost of outpatient versus daycase hysteroscopy. BJOG. 2004; 111:243–
248. https://doi.org/10.1111/j.1471-0528.2004.00064.x PMID: 14961886
25.
Munro MG, Critchley HOD, Broder MS, Fraser IS. FIGO classification system (PALM-COEIN) for
causes of abnormal uterine bleeding in nongravid women of reproductive age. Int J Gynaecol Obstet.
2011; 113:3–13. https://doi.org/10.1016/j.ijgo.2010.11.011 PMID: 21345435
`;

describe('numbered reference with a page range split across a line', () => {
  const refs = parseReferences(REFS, 'vancouver');
  const nums = refs.map((r) => Number(r.listNumber)).filter(Number.isFinite);

  it('does NOT fabricate a reference numbered from the page range (#248)', () => {
    expect(nums).not.toContain(248);
  });

  it('does not number any reference absurdly high (range digits leaking into list numbers)', () => {
    expect(Math.max(...nums)).toBeLessThan(100);
  });
});
