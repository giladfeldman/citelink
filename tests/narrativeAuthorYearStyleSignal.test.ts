/**
 * Regression: a paper that cites only NARRATIVELY — "Jovanovic (1982)", "Ericson and Pakes
 * (1995)", "Bloom et al. (2014)" — had no author-year signal at all.
 *
 * `countAuthorYearComma` / `countAuthorYearNoComma` count only the PARENTHETICAL forms
 * "(Author, 2004)" and "(Author 2004)". Economics and finance journals cite almost
 * exclusively in the narrative form, so their author-year total was 0, and any handful of
 * numeric-looking tokens then won the paradigm vote: regression-table column headers
 * "[1] [2] [3]", equation numbers "(1)", footnote digits "15%.1". The paper was classified
 * numeric and the numeric detector emitted every equation number and footnote marker as a
 * citation, while the paper's real citations were never read.
 *
 * Measured 2026-09-25 on production-extractor text: an AER article (author-year) was
 * classified vancouver (49 detections, all equation numbers and table counts) and an SSRN
 * working paper was classified ama (41 detections, all footnote markers and equation
 * numbers). With the narrative signal they read as author-year, with 58 and 43 narrative
 * citations detected.
 *
 * Guard rails, each measured:
 *  - a narrative mention directly followed by a numeric citation ("Treiman (1977)¹⁷",
 *    "Lee et al. (2018).³") is part of a numeric citation, not author-year evidence;
 *  - the narrative count must EXCEED the hard numeric count (brackets + Unicode
 *    superscripts), so a numeric paper that also names a few authors stays numeric;
 *  - a running header split over a blank line ("Smith et al. Journal", blank line,
 *    "(2023)") is not a narrative citation.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitationStyle, countNarrativeSignals } from '../src/citationStyleDetector.js';
import { analyze } from '../src/analyze.js';

// Synthetic, economics-style: narrative citations only, plus the three numeric-looking
// token kinds that decided the old vote — table column headers, equation numbers and
// footnote digits.
const economics = [
  'Productivity differences drive firm survival (see, for example, Jovanovic (1982), Hopenhayn',
  '(1992), Ericson and Pakes (1995), and Melitz (2003)). Recent research by Bloom (2009),',
  'Bloom et al. (2014), and Bachmann and Bayer (2013) documents the role of uncertainty.',
  'An uncertainty shock increases volatility by 15%.1 Output falls on impact.2',
  'Profits are given by',
  '',
  'pi = alpha + delta - eta q .',
  '',
  '(1)',
  '',
  'Combining (1) with the demand curve gives the price,',
  '',
  'p = omega / (eta + gamma) .',
  '',
  '(2)',
  '',
  'Following Jermann (1998), each firm owns its capital. Syverson (2004) and Foster,',
  'Haltiwanger, and Krizan (2001) use physical output data.',
  '',
  'Table 3. Persistence',
  'Specification:',
  '',
  '[1]',
  '',
  '[2]',
  '',
  '[3]',
  '',
  '[4]',
  '',
  '-0.040',
  '',
  'References',
  'Bloom, Nicholas. 2009. "The Impact of Uncertainty Shocks." Econometrica 77 (3): 623-685.',
  'Jovanovic, Boyan. 1982. "Selection and the Evolution of Industry." Econometrica 50 (3): 649-670.',
].join('\n');

describe('narrative author-year citations are an author-year signal (2026-09-25)', () => {
  it('an economics paper that cites only narratively is author-year, not numeric', () => {
    expect(detectCitationStyle(economics).paradigm).toBe('author-year');
  });

  it('so the equation numbers, footnote digits and table headers are not emitted as citations', () => {
    const { citations } = analyze(economics);
    const texts = citations.map((c) => c.raw);
    expect(texts.some((t) => /^\(?\[?\d+\]?\)?$/.test(t.trim()))).toBe(false);
    expect(texts.some((t) => /Jovanovic/.test(t))).toBe(true);
    expect(texts.some((t) => /Ericson and Pakes/.test(t))).toBe(true);
  });

  it('a numeric paper whose narrative mentions carry a superscript citation stays numeric', () => {
    const hybrid =
      'Treiman (1977)¹ showed that prestige is stable. Laumann and Guttman (1966).² ' +
      'Hill et al. (2019)³ used income. Lee et al. (2018).⁴ Erola et al. (2022)⁵ ' +
      'estimated heritability, as did Marks (2017)⁶ and Clark and Cummins (2022).⁷';
    expect(detectCitationStyle(hybrid).paradigm).toBe('numeric');
  });

  it('a numeric replication report whose tables repeat its target studies stays numeric', () => {
    // Prose names the targets with citation numbers (plain digits after extraction, so no
    // HARD numeric signal); a table lists the same 6 studies by author-year, many times.
    const prose =
      'We replicated the study by Falk and Szech1 and the study by Gelstein et al.2 as planned. ' +
      'For Janssen et al.3 the design changed. Rand et al.4 reported two studies; Duncan et al.5 ' +
      'one. Kovacs et al.6 used an online sample. Wilson et al.7 was run in the lab. ' +
      'Following Hauser et al.8 we pooled sessions.\n\n';
    const row = (s: string) => `${s}, Science\n\n✓\n\n✓\n\n`;
    const studies = ['Falk and Szech (2013)', 'Gelstein et al. (2011)', 'Janssen et al. (2010)',
      'Rand et al. (2012)', 'Duncan et al. (2012)', 'Kovacs et al. (2010)'];
    const table = Array.from({ length: 5 }, () => studies.map(row).join('')).join('');
    const refs =
      '\n\nReferences\n1. Falk, A. & Szech, N. Morals and markets. Science 340, 707-711 (2013).\n' +
      '2. Gelstein, S. et al. Human tears contain a chemosignal. Science 331, 226-230 (2011).\n' +
      '3. Janssen, M. A. et al. Lab experiments for the study of social-ecological systems. Science 328, 613-617 (2010).\n' +
      '4. Rand, D. G. et al. Spontaneous giving and calculated greed. Nature 489, 427-430 (2012).\n' +
      '5. Duncan, K. et al. Evidence for area CA1 as a match/mismatch detector. Science 335, 1197-1200 (2012).\n' +
      '6. Kovacs, A. M. et al. The social sense. Science 330, 1830-1834 (2010).\n';
    const text = prose + table + refs;
    expect(detectCitationStyle(text).paradigm).toBe('numeric');
  });

  it('a bracket-numeric paper that names a few authors stays numeric', () => {
    const numeric =
      'Transmission was modelled [1, 2] and fitted [3]. As Kermack and McKendrick (1927) ' +
      'proposed, compartments are used [4]. Anderson (1991) and May (1976) extended it [5-7]. ' +
      'Later work [8] and reviews [9], [10] followed; Hethcote (2000) summarises [11]. ' +
      'The idea goes back to Farr (1840).';
    // 5 narrative mentions (past the floor) against 8 bracket citations.
    expect(detectCitationStyle(numeric).paradigm).toBe('numeric');
  });

  // The four cases below were raised by the Sonnet seat of the 2026-09-25 cross-model
  // consult; each reproduced before it was fixed.
  it('document labels before a year are not narrative citations', () => {
    const labels = 'Table (2019). Table (2020). Phase (2018). Phase (2021). Act (2022). Survey (2017).';
    expect(countNarrativeSignals(labels).mentions).toBe(0);
  });

  it('accented surnames count, lowercase accented words do not', () => {
    expect(countNarrativeSignals('Özdemir (2010), Ålund (2011), Émile (2012), Øster (2013).').mentions).toBe(4);
    expect(countNarrativeSignals('über (2010) ölçü (2011) élan (2012)').mentions).toBe(0);
  });

  it('a name-then-number mention needs the number to touch the name', () => {
    expect(countNarrativeSignals('Miller and Cohen 5 decades ago; Smith and Jones 3 times.').authorNumberMentions).toBe(0);
    expect(countNarrativeSignals('as Gelstein et al.2 and Falk and Szech1 showed').authorNumberMentions).toBe(2);
  });

  it('the veto needs at least 5 narrative mentions', () => {
    const tail = ' Specification:\n\n[1]\n\n[2]\n\n[3]\n';
    const four = 'Jovanovic (1982), Hopenhayn (1992), Melitz (2003) and Bloom (2009) agree.';
    expect(detectCitationStyle(four + tail).paradigm).toBe('numeric');
    expect(detectCitationStyle(four + ' So does Syverson (2004).' + tail).paradigm).toBe('author-year');
  });

  it('a running header split over a blank line is not a narrative citation', () => {
    // Plain-digit citations and a numbered list: no HARD numeric signal, so eight counted
    // headers would outvote it.
    // No digit after "(2023)", so only the blank-line rule keeps it out of the count.
    const header = 'Smith et al. Journal of Medicine\n\n(2023)\n\nPage 3 of 10\n\n';
    const body = 'Atrial fibrillation is common.1 Risk rises with age2 and with alcohol.3';
    const refs =
      '\n\nReferences\n1. Chugh SS, Havmoeller R. Worldwide epidemiology. Circulation. 2014;129:837-47.\n' +
      '2. Kornej J, Benjamin EJ. Epidemiology of atrial fibrillation. Circ Res. 2020;127:4-20.\n' +
      '3. Voskoboinik A, Kalman JM. Alcohol and atrial fibrillation. J Am Coll Cardiol. 2016;68:2567-76.\n' +
      '4. Larsson SC, Drca N. Alcohol consumption and risk. J Am Coll Cardiol. 2014;64:281-9.\n' +
      '5. Kodama S, Saito K. Alcohol consumption and atrial fibrillation. J Am Coll Cardiol. 2011;57:427-36.\n';
    const text = Array.from({ length: 8 }, () => header + body).join('\n\n') + refs;
    expect(detectCitationStyle(text).paradigm).toBe('numeric');
  });
});
