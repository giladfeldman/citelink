/**
 * Stacked back-matter headings push the reference list down (2026-10-06)
 *
 * Some two-column journal layouts come out of pdftotext with every back-matter heading in one
 * block — "Notes", "6. References", "Funding", an author name — followed by the notes' bodies
 * and only then the reference list. The section scan started right after "References", hit
 * "Funding" (an end-of-references pattern) on its first line, and the look-ahead saw an author
 * name with no year, so it stopped with nothing collected. parseReferences returned [] and the
 * downstream platform reported a 77-page replication paper as having zero references.
 *
 * The layout below is SYNTHETIC — invented names and titles arranged in the measured shape of
 * that extraction (the real paper is referenced by its upload, not reproduced here).
 */

import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

const STACKED = [
  'We thank the reviewers for their comments and the original authors for their materials.',
  '',
  'Supplemental Material',
  'The supplemental material is available in the online version of the article.',
  '',
  'Notes',
  '1.',
  '2.',
  '',
  '6. References',
  '',
  'Funding',
  '',
  'Jane Example',
  '',
  '5.',
  '',
  'Participants from the second sample were recruited in the United Kingdom.',
  'We ran all the models below with study included as a fixed effect.',
  'The additional condition presented both kinds of information and was excluded.',
  '',
  'Albarracı́n, D., & Kumar, G. T. (2003). Affect as information in persuasion: A model.',
  'Journal of Imaginary Psychology, 84(3), 453-469.',
  'https://doi.org/10.1037/0000-0000.84.3.453',
  'Aldous, A. S., & Smithson, P. (1994). A study of the inverse relationship between two judgments. Risk Studies, 14(6), 1085-1096.',
  'Anders, A. (1981). Foundations of an integration theory. Example Press.',
  'Beckett, E. B. (2005). Consequences of affect: Combining two mechanisms. Journal of Examples, 32(3), 355-362.',
  'Carver, M., van Dijk, A., & Wolters, J. M. (2012). The rules of the game. Perspectives on Examples, 7(6), 543-554.',
  '',
  'Appendix A',
  'Results of the within-subjects mediation analysis',
].join('\n');

describe('stacked back-matter headings before the reference list', () => {
  it('finds the list below the heading block instead of returning nothing', () => {
    const refs = parseReferences(STACKED, 'apa');
    expect(refs.map(r => r.year)).toEqual(['2003', '1994', '1981', '2005', '2012']);
  });

  it('keeps a first author whose accent is a combining character', () => {
    // pdftotext writes "Albarracín" as dotless i + U+0301; the first entry must not be skipped.
    const refs = parseReferences(STACKED, 'apa');
    expect(refs[0].raw.startsWith('Albarrac')).toBe(true);
  });

  it('stops at the appendix that follows the list', () => {
    const refs = parseReferences(STACKED, 'apa');
    expect(refs.some(r => /Appendix|mediation analysis/.test(r.raw))).toBe(false);
  });

  it('does not resume on a single stray author-date line in prose', () => {
    // One line that looks like a reference start is not a list. A run is required, so a
    // heading block followed by ordinary prose still yields no references.
    const text = [
      'References',
      'Funding',
      'Jane Example',
      'Smith, J. (2000). This sentence happens to look like a reference start.',
      'The rest of this section is ordinary prose about the funding sources of the study.',
      'It continues for a few more lines without any further reference-like structure.',
    ].join('\n');
    expect(parseReferences(text, 'apa')).toEqual([]);
  });
});
