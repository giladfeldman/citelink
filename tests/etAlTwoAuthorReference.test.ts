import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';
import { parseReferences } from '../src/referenceParser';
import { matchCitationsToReferences } from '../src/citationMatcher';

/**
 * "X et al." written for a TWO-author reference is SUGGESTED, not dropped (v0.7.83).
 *
 * APA names both authors of a two-author work, so "Vallacher et al. (2014)" for
 * "Vallacher, R. R., & Wegner, D. M. (2014)" is an author's citation error — but it plainly
 * cites that entry. `matchEtAl` returned a 0.2 author score for any reference with fewer
 * than 3 authors, which with an exact year lands at 0.396: below the 0.40 suggested threshold,
 * so the citation was reported as having NO reference.
 *
 * That was invisible until the platform's worker began passing citelink's citation `type`
 * through (it had been matching every citation on its first author only). Replaying 62
 * production documents with the type restored, 29 correct links were lost this way in 11
 * documents, e.g. "Vallacher et al. (2014)" in six of them.
 *
 * The rule: same first author (fuzzy >= 0.8) and exactly two parsed authors scores 0.3 x the
 * name score. With an exact year that is (0.3*0.7 + 0.3) * 0.9 = 0.459 — inside the suggested
 * band and below the < 0.5 ceiling `citationMatching.test.ts` keeps for this case, so it is a
 * flagged "probable" link, never a confident one. A year that is also off, a different first
 * author, or a one-author reference still fall below 0.40.
 */

const REFS = [
  'References',
  'Stamates, A. L., & Lau-Barraco, C. (2017). Impulsivity and risk-taking as predictors of alcohol use patterns. Addictive Behaviors, 65, 32-38.',
  'Vallacher, R. R., & Wegner, D. M. (2014). A theory of action identification. Psychology Press.',
  'Zajonc, R. B. (1965). Social facilitation. Science, 149(3681), 269-274.',
];

function run(body: string, refs: string[] = REFS) {
  const doc = `${body}\n\n${refs.join('\n')}\n`;
  const cites = detectCitations(doc).filter((c) => c.position.start < doc.indexOf('References'));
  const parsed = parseReferences(doc, 'apa');
  return { matches: matchCitationsToReferences(cites, parsed, 'apa'), parsed };
}

describe('"et al." citation of a two-author reference', () => {
  it('the fixture parses the two-author references as TWO authors (vacuity check)', () => {
    const { parsed } = run('Nothing cited here.');
    expect(parsed.find((r) => r.raw.startsWith('Vallacher'))?.authorCount).toBe(2);
    expect(parsed.find((r) => r.raw.startsWith('Stamates'))?.authorCount).toBe(2);
  });

  it('is linked as SUGGESTED to the two-author reference, with confidence in [0.40, 0.50)', () => {
    const { matches } = run('As Vallacher et al. (2014) argued, and others found (Stamates et al., 2017).');
    for (const [cite, ref] of [['Vallacher et al. (2014)', 'Vallacher, R. R., & Wegner'], ['(Stamates et al., 2017)', 'Stamates, A. L., & Lau-Barraco']]) {
      const m = matches.find((x) => x.citation.raw === cite);
      expect(m).toBeDefined();
      expect(m!.status).toBe('suggested');
      expect(m!.reference?.raw.startsWith(ref)).toBe(true);
      expect(m!.confidence).toBeGreaterThanOrEqual(0.4);
      expect(m!.confidence).toBeLessThan(0.5);
    }
  });

  it('a genuine 3+-author reference with the same first author and year still wins, as matched', () => {
    const { matches } = run('As Vallacher et al. (2014) argued.', [
      ...REFS,
      'Vallacher, R. R., Wegner, D. M., & Somoza, M. P. (2014). That\'s easy for you to say. Journal of Personality and Social Psychology, 56(2), 199-208.',
    ]);
    const m = matches.find((x) => x.citation.raw === 'Vallacher et al. (2014)');
    expect(m!.status).toBe('matched');
    expect(m!.reference?.raw).toMatch(/Somoza/);
  });

  // Production replay, 3 documents: "(Hom et al., 2012)" — whose reference list has only
  // "Hom & Xiao (2011)" — was SUGGESTED to "Choi, Kim, Sung, & Sohn (2012)" on the year alone:
  // matchEtAl scored an unrelated first author (name score ~0.2) x 0.95, which with an exact
  // year reaches 0.433. A different first author is not an et-al match at any year.
  it('an et-al citation is never suggested to a 3+-author reference whose first author differs', () => {
    const { matches } = run('As shown before (Hom et al., 2012).', [
      'References',
      'Choi, S. M., Kim, Y., Sung, Y., & Sohn, D. (2012). Bridging or bonding? Information, Communication & Society, 14(1), 107-129.',
      'Hom, P. W., & Xiao, Z. (2011). Embedding social networks. Organizational Behavior and Human Decision Processes, 116(2), 188-202.',
    ]);
    const m = matches.find((x) => x.citation.raw === '(Hom et al., 2012)');
    expect(m).toBeDefined();
    expect({ status: m!.status, ref: m!.reference && m!.status !== 'no_match' ? m!.reference.raw.slice(0, 20) : null })
      .toEqual({ status: 'no_match', ref: null });
  });

  it('stays no_match when the year is also off, the first author differs, or the reference has ONE author', () => {
    const { matches } = run('Vallacher et al. (2015) and Wegner et al. (2014) and Zajonc et al. (1965).');
    for (const cite of ['Vallacher et al. (2015)', 'Wegner et al. (2014)', 'Zajonc et al. (1965)']) {
      const m = matches.find((x) => x.citation.raw === cite);
      expect({ cite, status: m?.status }).toEqual({ cite, status: 'no_match' });
    }
  });
});
