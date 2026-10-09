import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';
import { parseReferences } from '../src/referenceParser';
import { matchCitationsToReferences } from '../src/citationMatcher';

/**
 * A citation that NAMES its co-authors is linked to the reference those co-authors wrote.
 *
 * "(Klein, Hegarty, & Fischhoff, 2017)" is detected as type `et_al` (3+ authors), and
 * `matchEtAl` scored it on the first author alone. With two 2017 references by a first author
 * Klein in the list, both scored 0.965, the same-key guard resolved the tie by LIST ORDER, and
 * the citation was reported as `matched` to "Klein, O., Hardwicke, T. E., Aust, F., ... (2017)",
 * a different paper. Same for "(Aguinis, Gottfredson, & Wright, 2011)" -> "Aguinis, Boyd,
 * Pierce, & Short (2011)". (Production qa-multi-doc on platform v1.74.111, 2026-09-28.)
 *
 * The rule: when the citation names co-authors and the reference's own author list is complete
 * (not itself truncated with "et al."), every named co-author must appear among the reference's
 * other authors. A reference missing one is a different work: it is scored into the SUGGESTED
 * band (never `matched`), so a lone same-first-author reference is still offered as a flagged
 * probable link, and the reference that does carry the co-authors wins outright.
 */

const KLEIN_O = 'Klein, O., Hardwicke, T. E., Aust, F., Breuer, J., Danielsson, H., Mohr, A. H., Ijzerman, H., Nilsonne, G., Vanpaemel, W., & Frank, M. C. (2017). A practical guide for transparency in psychological science. Collabra: Psychology, 4(1), 20.';
const KLEIN_P = 'Klein, P., Hegarty, M., & Fischhoff, B. (2017). Risk communication in practice. Journal of Risk Research, 20(1), 1-10.';
const AGUINIS_B = 'Aguinis, H., Boyd, B. K., Pierce, C. A., & Short, J. C. (2011). Walking new avenues in management research methods and theories. Journal of Management, 37(2), 395-403.';
const AGUINIS_G = 'Aguinis, H., Gottfredson, R. K., & Wright, T. A. (2011). Best-practice recommendations for estimating interaction effects using meta-analysis. Journal of Organizational Behavior, 32(8), 1033-1043.';

function run(body: string, refs: string[]) {
  const doc = `${body}\n\nReferences\n\n${refs.join('\n\n')}\n`;
  const cites = detectCitations(doc).filter((c) => c.position.start < doc.indexOf('References'));
  const parsed = parseReferences(doc, 'apa');
  return { matches: matchCitationsToReferences(cites, parsed, 'apa'), parsed };
}

const BODY = 'Prior work shows this (Klein, Hegarty, & Fischhoff, 2017). Others disagree (Aguinis, Gottfredson, & Wright, 2011). Klein, Hegarty, and Fischhoff (2017) went further.';

describe('a citation naming its co-authors', () => {
  it('the fixture parses every reference with its full author list (vacuity check)', () => {
    const { parsed } = run('Nothing cited.', [AGUINIS_B, AGUINIS_G, KLEIN_O, KLEIN_P]);
    expect(parsed).toHaveLength(4);
    expect(parsed.find((r) => r.raw.startsWith('Klein, P.'))?.allAuthorLastNamesNormalized).toEqual(['klein', 'hegarty', 'fischhoff']);
    expect(parsed.find((r) => r.raw.startsWith('Aguinis, H., Gottfredson'))?.authorCount).toBe(3);
  });

  it('links to the reference whose co-authors it names, whatever the list order', () => {
    for (const refs of [[AGUINIS_B, AGUINIS_G, KLEIN_O, KLEIN_P], [AGUINIS_G, AGUINIS_B, KLEIN_P, KLEIN_O]]) {
      const { matches } = run(BODY, refs);
      const want: Array<[string, string]> = [
        ['(Klein, Hegarty, & Fischhoff, 2017)', 'Klein, P., Hegarty'],
        ['(Aguinis, Gottfredson, & Wright, 2011)', 'Aguinis, H., Gottfredson'],
        ['Klein, Hegarty, and Fischhoff (2017)', 'Klein, P., Hegarty'],
      ];
      for (const [cite, ref] of want) {
        const m = matches.find((x) => x.citation.raw === cite);
        expect(m).toBeDefined();
        expect(m!.status).toBe('matched');
        expect(m!.reference?.raw.startsWith(ref)).toBe(true);
      }
    }
  });

  it('is never `matched` to a same-first-author reference that lacks the named co-authors', () => {
    const { matches } = run(BODY, [AGUINIS_B, KLEIN_O]);
    for (const cite of ['(Klein, Hegarty, & Fischhoff, 2017)', '(Aguinis, Gottfredson, & Wright, 2011)']) {
      const m = matches.find((x) => x.citation.raw === cite);
      expect(m).toBeDefined();
      expect(m!.status).not.toBe('matched');
      expect(m!.confidence).toBeLessThan(0.75);
    }
  });

  it('tolerates a co-author the reference parse lost: at least half of the named co-authors must be found', () => {
    // chen_2021_jesp: before twoWordParticleMidList.test.ts, the parsed author list of this entry
    // lacked Borsboom. Requiring EVERY named co-author demoted the correct link to suggested. The
    // parser is fixed, so the lost co-author is simulated here by removing him from the parse.
    const { matches, parsed } = run(
      'An agenda (Wagenmakers, Wetzels, Borsboom, van der Maas, & Kievit, 2012).',
      ['Wagenmakers, E. J., Wetzels, R., Borsboom, D., van der Maas, H. L., & Kievit, R. A. (2012). An agenda for purely confirmatory research. Perspectives on Psychological Science, 7, 632-638.'],
    );
    const lossy = {
      ...parsed[0],
      allAuthorLastNames: ['Wagenmakers', 'Wetzels', 'van der Maas', 'Kievit'],
      allAuthorLastNamesNormalized: ['wagenmakers', 'wetzels', 'van der maas', 'kievit'],
    };
    const cite = matches.find((x) => x.citation.raw.startsWith('(Wagenmakers'))!.citation;
    const [m] = matchCitationsToReferences([cite], [lossy], 'apa');
    expect(m.status).toBe('matched');
  });

  it('a plain "et al." citation is unaffected (scores on its first author)', () => {
    const { matches } = run('Shown before (Klein et al., 2017).', [KLEIN_O]);
    const m = matches.find((x) => x.citation.raw === '(Klein et al., 2017)');
    expect(m!.status).toBe('matched');
    expect(m!.reference?.raw.startsWith('Klein, O.')).toBe(true);
  });

  it('a reference itself truncated with "et al." is not penalised for co-authors it does not list', () => {
    const { matches } = run('Shown before (Klein, Hegarty, & Fischhoff, 2017).', [
      'Klein P, Hegarty M, et al. (2017) Risk communication in practice. Journal of Risk Research 20: 1-10.',
    ]);
    const m = matches.find((x) => x.citation.raw === '(Klein, Hegarty, & Fischhoff, 2017)');
    expect(m!.status).toBe('matched');
  });
});
