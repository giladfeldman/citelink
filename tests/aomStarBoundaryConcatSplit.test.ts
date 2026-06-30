import { describe, it, expect } from '@jest/globals';
import { parseReferences, splitConcatenatedAomReferences } from '../src/referenceParser';

/**
 * Regression: AOM reference concatenation separated by a literal `*` bullet marker
 * (citationguard-iterate cycle 7, 2026-06-30 — annals_2, surfaced by the R-0177
 * Sonnet audit + the runner's same-author-year pairing artifact).
 *
 * docpluck's two-column AOM extraction preserves a per-entry bullet as a literal
 * `*` BETWEEN concatenated references on the same line:
 *
 *   "…Education, 13: 623-639. *Aguinis, H., & Vandenberg, R. J. 2014. An ounce of
 *    prevention… 1: 569-595. *Aguinis, H., Werner, S., … 2010b. Customer-centric…"
 *
 * The `*` sits between the previous entry's terminal period and the next author,
 * so `splitConcatenatedAomReferences`' bare-year opener (whose lookahead expects an
 * author CAPITAL immediately after the whitespace) never fired and the whole run
 * stayed one block — citelink lost every entry after the first. On annals_2 this
 * swallowed ~50 references (refs.f1 0.684 → 0.936, matching 0.630 → 0.919). The `*`
 * never occurs mid-word in the corpus, so it is unambiguously a boundary artifact:
 * drop a ` *` marker to a space before splitting.
 */

// Real annals_2 fixture: a 3-reference AOM concatenation joined by ` *` markers.
const STAR_CONCAT =
  'Aguinis, H., Shapiro, D. L., Antonacopoulou, E., & Cummings, T. G. 2014. ' +
  'Scholarly impact: A pluralist conceptualization. Academy of Management Learning & Education, 13: 623-639. ' +
  '*Aguinis, H., & Vandenberg, R. J. 2014. An ounce of prevention is worth a pound of cure: ' +
  'Improving research quality before data collection. Annual Review of Organizational Psychology and ' +
  'Organizational Behavior, 1: 569-595. ' +
  '*Aguinis, H., Werner, S., Abbott, J. L., Angert, C., Park, J. H., & Kohlhausen, D. 2010b. ' +
  'Customer-centric science: Reporting significant research results with rigor, relevance, and practical ' +
  'impact in mind. Organizational Research Methods, 13: 515-539.';

describe('AOM star-bullet concatenation split (cycle 7)', () => {
  it('splits a `*`-joined AOM concatenation into its 3 component references', () => {
    const parts = splitConcatenatedAomReferences(STAR_CONCAT);
    // BEFORE the fix this returned 1 (the whole run unsplit).
    expect(parts.length).toBe(3);
    expect(parts[0]).toContain('Scholarly impact');
    expect(parts[1]).toContain('An ounce of prevention');
    expect(parts[1]).toMatch(/^Aguinis, H\., & Vandenberg/); // `*` stripped, author intact
    expect(parts[2]).toContain('Customer-centric science');
  });

  it('parses the middle (Vandenberg) reference that was previously swallowed', () => {
    const refs = parseReferences(`References\n\n${STAR_CONCAT}\n`, 'aom');
    const vandenberg = refs.find((r) =>
      (r.title || '').includes('An ounce of prevention'),
    );
    expect(vandenberg).toBeDefined();
    expect(String(vandenberg!.year)).toBe('2014');
  });

  it('does not split a normal AOM reference that merely CONTAINS no bullet marker (guard)', () => {
    const single =
      'Egghe, L. 2006. Theory and practice of the g-index. Scientometrics, 69: 131-152.';
    expect(splitConcatenatedAomReferences(single)).toEqual([single]);
  });
});
