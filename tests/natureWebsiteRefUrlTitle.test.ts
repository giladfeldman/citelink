/**
 * Nature website reference — URL must not become the title
 * (nat_comms_2 — citationguard-iterate R-0177 audit 2026-06-26)
 *
 * Reference #47 of nat_comms_2 is an organizational website entry with no separate
 * work title:
 *
 *   "47. ISARIC4C Comprehensive Clinical Characterisation Collaboration Website.
 *        https://isaric4c.net."
 *
 * The only post-author text is the URL, so the title extractor put the URL into the
 * `title` field ("https://isaric4c") — a URL is never a title, and it scored as
 * title-drift against the gold (gold title = "ISARIC4C Comprehensive Clinical
 * Characterisation Collaboration Website."). The repair reconstructs the title from
 * the raw text before the URL.
 *
 * Snippet is verbatim from the docpluck v2.4.98 academic extraction of nat_comms_2
 * (DOI 10.1038/s41467-023-42320-4).
 */

import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

const SECTION =
  'References\n\n' +
  '46. Desole, G. et al. HGF and MET: from brain development to neurological ' +
  'disorders. Front. Cell Dev. Biol. 9, 683609 (2021).\n' +
  '47. ISARIC4C Comprehensive Clinical Characterisation Collaboration Website. ' +
  'https://isaric4c.net.\n' +
  '48. Ellul, M. A. et al. Neurological associations of COVID-19. Lancet Neurol. ' +
  '19, 767-783 (2020).';

describe('Nature website reference URL-as-title repair (nat_comms_2 ISARIC4C)', () => {
  const refs = parseReferences(SECTION, 'nature');
  const isaric = refs.find(r => /ISARIC4C/i.test(r.authors[0]?.lastName ?? r.title ?? ''));

  it('parses the ISARIC4C website reference', () => {
    expect(isaric).toBeDefined();
  });

  it('does NOT put the URL in the title field', () => {
    expect(isaric!.title).not.toMatch(/^https?:\/\//);
    expect(isaric!.title).not.toMatch(/isaric4c\.net/);
  });

  it('uses the org-name "…Website." text as the title (gold-faithful)', () => {
    expect(isaric!.title).toMatch(/Comprehensive Clinical Characterisation Collaboration Website/);
  });

  it('keeps the URL in the url field', () => {
    expect(isaric!.url).toMatch(/isaric4c\.net/);
  });

  it('regression guard — a normal Nature ref with a real title is unaffected', () => {
    const ellul = refs.find(r => /Ellul/i.test(r.authors[0]?.lastName ?? ''));
    expect(ellul).toBeDefined();
    expect(ellul!.title).toMatch(/^Neurological associations of COVID-19/);
  });
});
