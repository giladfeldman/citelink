/**
 * Regression: an organisation or journal cited as an author, whose name contains
 * a lowercase function word, was truncated to its LAST WORD — a wrong author, not
 * a missing one.
 *
 * scimeto-iterate cycle 9 (2026-09-01), surfaced on annals_2
 * (10.5465/annals.2016.0011), which cites an editorial policy statement as
 * "(Journal of Applied Psychology, 2017)". citelink reported
 * **"(Psychology, 2017)"** — `orgMultiWordParenthetical` admits only
 * whitespace-joined CAPITALISED tokens, so the run stopped dead at the lowercase
 * "of", and `singleParenthetical` then matched the trailing "Psychology" as an
 * ordinary surname.
 *
 * The corpus has one instance, but the class is wide and every member of it fails
 * the same way: "National Institute of Mental Health", "Ministry of Health",
 * "University of California", "Department of Education" — each currently keys on
 * its final word, matches the wrong reference or none, and the manuscript is
 * accused of an unmatched citation.
 *
 * THE CONSTRAINT THAT MAKES THIS SAFE, and it is the reason the tokens were
 * capitalised-only in the first place: "and" must NEVER be admitted. Admitting it
 * would let a two-author citation "(Smith and Jones, 2020)" be swallowed whole as
 * a single organisation named "Smith and Jones". So the admitted set is a closed
 * list of function words that are not author connectives — of, for, the, in, on,
 * at, to — and "and" / "&" stay out.
 *
 * The cost of that, stated rather than left to be discovered: an organisation
 * whose name genuinely contains "and" — "Centers for Disease Control and
 * Prevention" — still truncates, now to "Centers for Disease Control" rather than
 * to "Prevention". That is a better key and a worse one than complete; it is
 * accepted because the alternative breaks every two-author citation in the corpus.
 *
 * Also NOT fixed here, and asserted as such below: a TITLE cited as an author
 * ("(The battle for brainpower, 2006)") still returns nothing, because its interior
 * words are ordinary lowercase prose rather than function words, and admitting
 * those would match arbitrary parenthetical prose.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

const cite = (text: string): string[] =>
  detectCitations(text).map(
    (c) => `${(c.authors ?? []).map((a) => a.raw).join('+')}|${c.year}${c.yearSuffix ?? ''}`,
  );

describe('organisation author containing a lowercase function word', () => {
  it('keeps the whole name (annals_2 verbatim shape)', () => {
    expect(cite('the policy statement (Journal of Applied Psychology, 2017) requires that'))
      .toEqual(['Journal of Applied Psychology|2017']);
  });

  it('never reports only the trailing word', () => {
    const got = cite('the policy statement (Journal of Applied Psychology, 2017) requires that');
    expect(got).not.toContain('Psychology|2017');
  });

  it('handles the common institutional shapes', () => {
    expect(cite('funding guidance (National Institute of Mental Health, 2020) states'))
      .toEqual(['National Institute of Mental Health|2020']);
    expect(cite('enrolment data (University of California, 2021) shows'))
      .toEqual(['University of California|2021']);
  });
});

describe('controls — the function-word set must not swallow author connectives', () => {
  it('CONTROL a two-author citation written with "and" stays two authors', () => {
    expect(cite('prior work (Smith and Jones, 2020) showed that')).toEqual(['Smith+Jones|2020']);
  });

  it('CONTROL a two-author citation written with "&" stays two authors', () => {
    expect(cite('prior work (Hunton & Rose, 2011) showed that')).toEqual(['Hunton+Rose|2011']);
  });

  it('CONTROL the already-working all-capitalised org forms are unchanged', () => {
    expect(cite('analyses were run in R (R Core Team, 2019) using base packages'))
      .toEqual(['R Core Team|2019']);
    expect(cite('the replication project (Open Science Collaboration, 2015) reported'))
      .toEqual(['Open Science Collaboration|2015']);
  });

  it('CONTROL ordinary parenthetical prose is still not a citation', () => {
    expect(cite('the sample (all of whom were students, 2019 cohort) completed')).toEqual([]);
    expect(cite('the effect (measured at the end of the study, 2020 wave) was small')).toEqual([]);
  });

  it('CONTROL an ordinary single-author citation is unchanged', () => {
    expect(cite('prior work (Becker, 2005) showed that')).toEqual(['Becker|2005']);
  });
});

describe('scope limits recorded, not silently accepted', () => {
  it('KNOWN DEFECT: an organisation whose name contains "and" is read as TWO AUTHORS', () => {
    // Verified against the prior committed code (git checkout HEAD -- src, rebuild,
    // probe): this predates the function-word change and is NOT a regression from
    // it. "Centers for Disease Control and Prevention" is reported as the
    // two-author citation "Control and Prevention" — two people who do not exist.
    //
    // It is not fixed here because the only cheap fix is admitting "and" to
    // ORG_AUTHOR, which would swallow every genuine two-author citation. A correct
    // fix has to teach twoAuthorParenthetical to decline when a capitalised-token
    // run precedes its first author inside the same parenthetical, and that
    // deserves its own change with its own corpus diff.
    //
    // Asserted at its exact current value so the defect is pinned rather than
    // forgotten: if anyone fixes it, this test goes red and must be updated
    // deliberately.
    expect(cite('guidance (Centers for Disease Control and Prevention, 2019) states'))
      .toEqual(['Control+Prevention|2019']);
  });

  it('a TITLE cited as an author is still not detected', () => {
    // Its interior words are ordinary prose, not function words; admitting those
    // would match arbitrary parenthetical text. annals_4 has two of these.
    expect(cite('as reported (The battle for brainpower, 2006) firms compete for')).toEqual([]);
  });
});
