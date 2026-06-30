import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector';

/**
 * Regression: a narrative citation with a trailing in-paren qualifier after the year
 * must still be detected (citationguard-iterate cycle 7, 2026-06-30 — chen_2021_jesp,
 * R-0177 Sonnet deep audit).
 *
 * `singleNarrative` and `twoAuthorNarrative` anchored on the closing paren
 * IMMEDIATELY after the year — "Smith (2020)" — so a legal trailing qualifier
 * ("Slovic and Fischhoff (1977, Experiment 3)", "Fischhoff (1977, p. 12)") failed the
 * closing-paren match and the whole citation was dropped. The et-al narrative already
 * tolerated this via `(?:,\s*[^)]+)?`; the single/two-author narratives did not.
 *
 * Fix: add the same optional `(?:,\s*[^)]+)?` qualifier to both patterns.
 *
 * The first input is VERBATIM from the chen extraction (DOI 10.1016/j.jesp.2021.104154).
 */

function rawOf(text: string): string {
  const c = detectCitations(text)[0];
  return c?.raw ?? '';
}

describe('narrative year-paren trailing qualifier (cycle 7)', () => {
  it('detects a two-author narrative with an "Experiment N" qualifier (chen Slovic & Fischhoff 1977)', () => {
    const raw = rawOf('Slovic and Fischhoff (1977, Experiment 3) was the first study that we know of.');
    expect(raw).toBe('Slovic and Fischhoff (1977, Experiment 3)');
  });

  it('detects a single-author narrative with a "p. NN" qualifier', () => {
    const raw = rawOf('Fischhoff (1977, p. 12) argued that the occurrence increases probability.');
    expect(raw).toBe('Fischhoff (1977, p. 12)');
  });

  it('still detects a normal narrative with no qualifier (guard)', () => {
    const raw = rawOf('Slovic and Fischhoff (1977) examined the relationship.');
    expect(raw).toBe('Slovic and Fischhoff (1977)');
  });

  it('does not over-capture past the closing paren (guard)', () => {
    // The qualifier match is bounded by the first ")" — it must not swallow following text.
    const raw = rawOf('Smith (2020, p. 5) and then more prose here.');
    expect(raw).toBe('Smith (2020, p. 5)');
  });
});
