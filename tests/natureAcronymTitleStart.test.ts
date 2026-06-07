/**
 * Regression: a Nature numbered reference whose TITLE begins with an acronym /
 * hyphenated-caps token (COVID-19, SARS-CoV-2, IL-12, N-methyl-…, GM-CSF) or a
 * ligature word (inﬂammatory) parsed the JOURNAL name as the title.
 *
 * citationguard-iterate (session 2026-06-07b) cycle 2 — surfaced on nat_comms_2
 * once its AI gold was regenerated (the prior gold's title_start had bled into
 * the journal, masking the defect). parseNatureReference's author/title boundary
 * looked for ". " followed by a `[A-Z][a-z]{2,}` word. An acronym title-start is
 * not such a word, so the boundary skipped past the real title and latched onto
 * a later ". Journal" period — emitting "Brain 144, 2696–2708 (2021)", "Brain
 * Pathol", "Sci", "Proc", "Exp" as the parsed title. The fix anchors the author
 * list on the unambiguous "et al." marker and broadens the title-word class to
 * accept acronym / hyphen-caps / ligature-leading titles.
 *
 * Reference strings are verbatim from the nat_comms_2 extraction fixture
 * (apps/worker/tests/extraction-results/nat_comms_2.pdf_pymupdf.txt).
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

// One reference per line-group; Nature numbered style ("Author et al. Title. Journal Vol, Pages (Year).")
const REFS = `References
11. Thakur, K. T. et al. COVID-19 neuropathology at Columbia University Irving Medical Center/New York Presbyterian Hospital. Brain 144, 2696–2708 (2021).
16. Maiese, A. et al. SARS-CoV-2 and the brain: a review of the current knowledge on neuropathology in COVID-19. Brain Pathol. 31, e13013 (2021).
22. Thwaites, R. S. et al. Inﬂammatory proﬁles across the spectrum of disease reveal a distinct role for GM-CSF in severe COVID-19. Sci. Immunol. 6, eabg9873 (2021).
33. Mondal, S. et al. IL-12 p40 monomer is different from other IL-12 family members to selectively inhibit IL-12Rβ1 internalization and suppress EAE. Proc. Natl Acad. Sci. USA 117, 21557–21567 (2020).
57. Irani, S. R. et al. N-methyl-d-aspartate antibody encephalitis: temporal progression of clinical and paraclinical observations in a predominantly non-paraneoplastic disorder of both sexes. Brain 133, 1655–1667 (2010).
34. Kroenke, M. A., Carlson, T. J., Andjelkovic, A. V. & Segal, B. M. IL-12- and IL-23-modulated T cells induce distinct types of EAE. J. Exp. Med. 205, 1535–1541 (2008).
`;

describe('Nature acronym/ligature title-start parsing', () => {
  const refs = parseReferences(REFS, 'nature');
  const find = (author: string) => refs.find((r) => (r.firstAuthorLastName || '').includes(author));

  // Each title must be the real title, NOT the journal name. Before the fix the
  // parsed title was the journal token (Brain / Sci / Proc / Exp / Brain Pathol).
  it('Thakur (COVID-19 …) parses the title, not "Brain 144 …"', () => {
    const r = find('Thakur');
    expect(r).toBeDefined();
    expect(r!.title || '').toMatch(/^COVID-19 neuropathology/i);
    expect(r!.title || '').not.toMatch(/^Brain\b/);
  });

  it('Maiese (SARS-CoV-2 …) parses the title, not "Brain Pathol"', () => {
    const r = find('Maiese');
    expect(r!.title || '').toMatch(/^SARS-CoV-2 and the brain/i);
    expect(r!.title || '').not.toMatch(/^Brain Pathol/);
  });

  it('Thwaites (ligature "Inﬂammatory" …) parses the title, not "Sci"', () => {
    const r = find('Thwaites');
    expect(r!.title || '').toMatch(/^In.?ammatory pro.?les/i); // ﬁ/ﬂ ligature tolerant
    expect((r!.title || '').trim()).not.toBe('Sci');
  });

  it('Mondal (IL-12 …) parses the title, not "Proc"', () => {
    const r = find('Mondal');
    expect(r!.title || '').toMatch(/^IL-12 p40 monomer/i);
    expect((r!.title || '').trim()).not.toBe('Proc');
  });

  it('Irani (N-methyl-… ) parses the title, not "Brain 133 …"', () => {
    const r = find('Irani');
    expect(r!.title || '').toMatch(/^N-methyl-d-aspartate antibody encephalitis/i);
    expect(r!.title || '').not.toMatch(/^Brain\b/);
  });

  it('Kroenke (named authors, IL-12- title) parses the title, not "Exp"', () => {
    const r = find('Kroenke');
    expect(r!.title || '').toMatch(/^IL-12- and IL-23-modulated/i);
    expect((r!.title || '').trim()).not.toBe('Exp');
  });
});
