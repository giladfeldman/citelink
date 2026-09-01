/**
 * Regression: a two-word surname led by a Title-cased nobiliary particle
 * ("Santos Silva", "Van Fleet", "El Soufi") truncated to its final token in the
 * APA/AOM detector, taking every PRECEDING author with it — a wrong first author,
 * which resolves to the wrong reference or to none.
 *
 * scimeto-iterate cycle 9 (2026-09-02). Measured: the SAME input parsed
 * correctly by `detectHarvardCitations` and incorrectly by `detectCitations`:
 *
 *   "while Barros and Santos Silva (2019) show that malesp"
 *      harvard  -> Barros + Santos Silva | 2019      (correct)
 *      APA/AOM  -> Silva | 2019                      (wrong author, Barros lost)
 *
 * So the library gave two different answers for one string depending on which
 * style its detector had decided the paper was — a defect in its own right,
 * independent of which answer is right.
 *
 * THE FIX IS A PORT, NOT AN INVENTION. `harvardCitationDetector.ts` solved this in
 * cycle 2 (bjps_1 H2) with a vetted `CAP_PARTICLE` whitelist, and its comment
 * states why a whitelist is REQUIRED rather than a bare cap+cap extension: without
 * one, "As Smith and Jones (2019)" captures a first author of "As Smith",
 * regressing every narrative citation that opens a sentence. That control is
 * asserted below and was verified in isolation before the shared constant — which
 * ~30 patterns depend on — was touched at all.
 *
 * OUT OF REACH, and stated rather than implied: an Iberian double surname whose
 * first element is an ordinary surname rather than a particle
 * ("Delgado López-Cózar", "McLean Parks") still truncates. Whitelisting those
 * would mean listing surnames, which is keying on paper identity instead of on a
 * structural signature — the thing this codebase's rules forbid. amp_1 and
 * annals_4 each hold one; they stay open.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';
import { detectHarvardCitations } from '../src/harvardCitationDetector.js';

const fmt = (cits: ReturnType<typeof detectCitations>): string[] =>
  cits.map((c) => `${(c.authors ?? []).map((a) => a.raw).join('+')}|${c.year}${c.yearSuffix ?? ''}`);
const apa = (t: string) => fmt(detectCitations(t));

describe('Title-cased surname particle in the APA/AOM detector', () => {
  it('keeps both authors and the whole second surname (bjps_1 verbatim shape)', () => {
    const text = 'while Barros and Santos Silva (2019) show that malesp';
    expect(apa(text)).toEqual(['Barros+Santos Silva|2019']);
  });

  it('agrees with the Harvard detector on the same string', () => {
    const text = 'while Barros and Santos Silva (2019) show that malesp';
    expect(apa(text)).toEqual(fmt(detectHarvardCitations(text) as never));
  });

  it('applies in a parenthetical (amp_1 verbatim shape)', () => {
    expect(apa('recent work (Hourneaux, Hamza & Santos Jhunior, 2023) suggests'))
      .toEqual(['Hourneaux+Hamza+Santos Jhunior|2023']);
  });

  it('applies to a single-author narrative', () => {
    expect(apa('the point Van Fleet (2009) argued was that')).toEqual(['Van Fleet|2009']);
  });
});

describe('a SEPARATE pre-existing defect this work surfaced', () => {
  it('KNOWN DEFECT: a capitalised sentence opener before a particle surname is absorbed', () => {
    // "As Van Fleet (2009)" is keyed on "As Van Fleet". The route is NOT the
    // cap-particle prefix added here — it is the lowercase-particle INFIX branch
    // `(?:\s+SURNAME_PARTICLE\s+SURNAME_LASTNAME)?` combined with the `i` flag on
    // several patterns: "As" is itself a valid SURNAME_LASTNAME, "Van" matches the
    // lowercase particle `van` case-insensitively, and "Fleet" closes it.
    //
    // Verified against the prior committed code (checkout v0.7.78, rebuild, probe)
    // that this is PRE-EXISTING and not a regression from the cap-particle port:
    // HEAD returned "As Van Fleet|2009" and "As De Vries|2015" before this change
    // and returns them after it, unchanged.
    //
    // Not fixed here because the fix is a different one — either dropping the `i`
    // flag from the affected patterns or requiring the infix particle to be
    // genuinely lowercase in the source — and either needs its own corpus diff.
    // Pinned at its exact current value so it cannot be forgotten.
    expect(apa('As Van Fleet (2009) argued, the field')).toEqual(['As Van Fleet|2009']);
    expect(apa('As De Vries (2015) noted')).toEqual(['As De Vries|2015']);
  });
});

describe('controls — the whitelist is what keeps a sentence word out', () => {
  it('CONTROL a capitalised sentence opener is not absorbed into the first surname', () => {
    // The failure this whitelist exists to prevent: a bare cap+cap extension
    // would key this citation on "As Smith".
    expect(apa('As Smith and Jones (2019) showed, the effect')).toEqual(['Smith+Jones|2019']);
    expect(apa('While Barros and Silva (2019) show that')).toEqual(['Barros+Silva|2019']);
  });

  it('CONTROL lowercase particles still work', () => {
    expect(apa('while de Visser and van Berg (2017) show that'))
      .toEqual(['de Visser+van Berg|2017']);
  });

  it('CONTROL plain surnames are unchanged', () => {
    expect(apa('prior work (Hunton & Rose, 2011) showed that')).toEqual(['Hunton+Rose|2011']);
    expect(apa('Shaffer et al. (2016) recommended that')).toEqual(['Shaffer+et al.|2016']);
  });
});

describe('scope limit recorded, not silently accepted', () => {
  it('an Iberian double surname whose first element is not a particle still truncates', () => {
    // "Delgado" is a surname, not a nobiliary particle. Admitting it would mean
    // whitelisting surnames — keying on paper identity rather than on structure.
    // Pinned at its exact current value so the gap is visible, not forgotten.
    expect(apa('as Martin and Delgado Lopez (2021) report')).toEqual(['Lopez|2021']);
  });
});
