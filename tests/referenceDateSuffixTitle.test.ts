import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser';

/**
 * Regression: a reference carrying a FULL PUBLICATION DATE ("2023, January 10.")
 * had the month-and-day taken as its title (scimeto-iterate 2026-08-04,
 * surfaced on amd_1 = 10.5465/amd.2023.0106).
 *
 * APA cites magazines, blog posts, working papers, and news items with a full
 * date rather than a bare year:
 *
 *   Christodoulou, D. 2023, January 10. AI marking: Could ChatGPT mark your
 *   students' essays? Tes Magazine.
 *
 * The year matcher consumes "2023", leaving ", January 10. AI marking: …".
 * The title is anchored on the first sentence-ending period, which lands on
 * "January 10." — so the parsed title was the DATE and the real title was lost.
 * 3 of amd_1's 24 references (all its dated web/working-paper sources) were
 * affected, holding references F1 at 0.833 with a perfect 1.000 author+year key
 * match — the signature of a pure field defect.
 *
 * A wrong title is not cosmetic here: the title is what reference verification,
 * retraction lookup, and DOI resolution match on, and it is what the user reads
 * in the reference list. A reference whose title is "January 10." silently
 * cannot be verified against any external source.
 *
 * This is the same "the first sentence is not the title, re-anchor past it"
 * class as the existing roman-numeral/part-number and single-word branches.
 */
describe('a full publication date is not the reference title', () => {
  const parse = (entry: string) => parseReferences('REFERENCES\n' + entry)[0];

  // These assert the EXACT title. An earlier version of this test asserted only
  // "not exactly the date" + "contains the real title", which a title that merely
  // STARTS with the date satisfies — so it passed while the parser still returned
  // "January 10. AI marking: … ? Tes Magazine.", carrying both the date AND the
  // journal. (Caught by a codex cross-model review, 2026-08-04.)
  it('strips "January 10." from the front of the title', () => {
    const r = parse(
      'Christodoulou, D. 2023, January 10. AI marking: Could ChatGPT mark your students’ essays? Tes Magazine.'
    );
    expect(r.title).toMatch(/^AI marking: Could ChatGPT/);
    expect(r.title).not.toMatch(/January/);
    // NOTE: this title ends in "?" and the trailing "Tes Magazine." is still
    // absorbed. That is a SEPARATE, PRE-EXISTING defect in the terminator search,
    // which deliberately prefers "." over "?" so that an interior question mark
    // ("Science or protoscience? Ten years later.") does not truncate a title.
    // Verified pre-existing and independent of the date fix: a plain bare-year
    // reference shows it too ("Smith, J. 2019. Does power corrupt? Tes Magazine."
    // → "Does power corrupt? Tes Magazine."). Taking the EARLIEST of [.?!] was
    // measured across the 16-paper corpus and moved references F1 by exactly
    // 0.0000 — no demonstrated benefit — so the existing trade-off stands rather
    // than be churned. Left deliberately unasserted here; see LEARNINGS.
  });

  it('strips "December 3." (blog post)', () => {
    const r = parse(
      'Mollick, E. 2022, December 3. How to use AI to generate ideas [Blog post]. Retrieved from https://example.org/x'
    );
    expect(r.title).toBe('How to use AI to generate ideas [Blog post].');
    expect(r.title).not.toMatch(/December/);
  });

  it('strips "March 2." (working paper)', () => {
    const r = parse(
      'Noy, S., & Zhang, W. 2023, March 2. Experimental evidence on the productivity effects of generative AI (MIT working paper). Cambridge, MA: MIT.'
    );
    expect(r.title).toMatch(/^Experimental evidence/);
    expect(r.title).not.toMatch(/March/);
    expect(r.title).not.toMatch(/Cambridge/);
  });

  it('accepts an ordinal day and an abbreviated month', () => {
    expect(parse('Lee, K. 2020, June 3rd. Hybrid teams and trust. Wired.').title)
      .toBe('Hybrid teams and trust.');
    expect(parse('Ng, A. 2024, Jan. 10. Scaling laws revisited. The Batch.').title)
      .toBe('Scaling laws revisited.');
  });

  it('leaves a month-ONLY head to the single-word branch (both directions)', () => {
    // "March." with no day is ambiguous: it can be a real one-word title. The
    // date rule requires a DAY, so it does not fire here — stripping month-only
    // heads unconditionally promoted the journal into the title.
    expect(parse('Author, A. 2023. March. Journal of Applied Psychology, 88: 1-10.').title)
      .toMatch(/^March\./);
  });

  it('does not strip a month followed by a YEAR rather than a day', () => {
    // "May 2023." is not "Month D." — 4 digits is not a day.
    const r = parse('Doe, J. 2023, May 2023. A real title about things. Nature.');
    expect(r.title).not.toMatch(/^A real title/);
  });

  it('leaves an ordinary bare-year reference untouched (control)', () => {
    const r = parse(
      'Berg, J. M., & Miron-Spektor, E. 2023. Escaping irony: Making research more creative. OBHDP, 175: 104235.'
    );
    expect(r.title).toMatch(/^Escaping irony/);
  });

  it('does not extend a title that merely BEGINS with a month-like word', () => {
    // "March of the machines." is a real title, not a date suffix — it must not
    // be discarded in favour of the following sentence.
    const r = parse(
      'Ford, M. 2015. March of the machines. New York: Basic Books.'
    );
    expect(r.title).toMatch(/^March of the machines/);
  });
});
