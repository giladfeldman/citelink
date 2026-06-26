/**
 * Harvard reference NOT orphan-split at a title phrase that reads as "Surname, Firstname"
 * (bjps_1 — citationguard-iterate R-0177 audit 2026-06-26)
 *
 * Two bjps_1 references carry a TITLE whose leading words form a "Word, Word, and
 * Word" phrase that the APA-oriented step-1c inline splitter mistook for a
 * "Surname, Firstname" reference start (a year sits later in the entry — in the
 * SSRN URL — satisfying the "year within 300 chars" guard):
 *
 *   "Baccini L and Sattler T (2021) Austerity, Economic Vulnerability, and Populism;
 *      Unpublished Manuscript, Available from SSRN https://…3766022 …"
 *   "Foster C and Frieden J (2019) Compensation, Austerity, and Populism; Paper
 *      prepared for \"Seminar on the State and Capitalism Since 1800\", … 2019."
 *
 * Step 1c FALSE-split each at its title — orphaning "Baccini (2021)" / "Foster
 * (2019)" with an EMPTY title plus a phantom author-less "Austerity ()" /
 * "Compensation (2019)" entry. The fix requires, for Harvard-family styles, a
 * parenthetical "(year)" close to the candidate start (the Harvard author→year
 * shape), which a title phrase lacks.
 *
 * Snippets are verbatim from the docpluck v2.4.98 academic extraction of bjps_1
 * (DOI 10.1017/S0007123424000024).
 */

import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

const SECTION =
  'References\n\n' +
  'Autor DH et al. (2020) Importing political polarization? The Electoral ' +
  'Consequences of Rising Trade Exposure. American Economic Review 110, 3139-83.\n' +
  'Baccini L and Sattler T (2021) Austerity, Economic Vulnerability, and Populism; ' +
  'Unpublished Manuscript, Available from SSRN https://ssrn.com/abstract=3766022, ' +
  'http://dx.doi.org/10.2139/ssrn.3766022 (accessed 6 April 2021).\n' +
  'Baccini L and Weymouth S (2021) Gone for good: Deindustrialization, white voter ' +
  'backlash, and US presidential voting. American Political Science Review 115, 550-67.\n' +
  'Foster C and Frieden J (2019) Compensation, Austerity, and Populism; Paper ' +
  'prepared for "Seminar on the State and Capitalism Since 1800", Center for ' +
  'European Studies, Harvard University, December 6, 2019.\n' +
  'Freire D et al. (2023) The effect of legislature size on public spending: A ' +
  'meta-analysis. British Journal of Political Science 53, 776-88.';

describe('Harvard title-phrase orphan-split guard (bjps_1)', () => {
  const refs = parseReferences(SECTION, 'harvard');

  it('does NOT emit a phantom "Austerity" author-less reference', () => {
    expect(refs.some(r => /^Austerity/i.test(r.authors[0]?.lastName ?? ''))).toBe(false);
  });

  it('does NOT emit a phantom "Compensation" author-less reference', () => {
    expect(refs.some(r => /^Compensation/i.test(r.authors[0]?.lastName ?? ''))).toBe(false);
  });

  it('keeps Baccini & Sattler (2021) as ONE reference with its title', () => {
    const bs = refs.find(
      r => /^Baccini/i.test(r.authors[0]?.lastName ?? '') &&
        /Austerity, Economic Vulnerability/.test(r.title ?? ''),
    );
    expect(bs).toBeDefined();
    expect(bs!.year).toBe('2021');
  });

  it('keeps Foster & Frieden (2019) as ONE reference with its title', () => {
    const ff = refs.find(r => /^Foster/i.test(r.authors[0]?.lastName ?? ''));
    expect(ff).toBeDefined();
    expect(ff!.title).toMatch(/^Compensation, Austerity, and Populism/);
    expect(ff!.year).toBe('2019');
  });

  it('regression guard — the surrounding clean refs all parse', () => {
    expect(refs.some(r => /^Autor/i.test(r.authors[0]?.lastName ?? ''))).toBe(true);
    expect(refs.some(r => /^Freire/i.test(r.authors[0]?.lastName ?? ''))).toBe(true);
    // Baccini & Weymouth stays distinct from Baccini & Sattler (both 2021).
    expect(
      refs.filter(r => /^Baccini/i.test(r.authors[0]?.lastName ?? '')).length,
    ).toBe(2);
  });
});
