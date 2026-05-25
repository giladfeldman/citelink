/**
 * Regression: parenthetical patterns like "(January 2023)" or "(April, 2023)"
 * are date references, not author citations.
 *
 * citationguard-iterate cycle 11 — chan_feldman_2025_cogemo body has phrases
 * like "At the time of writing (January 2023)" and "(April 2023)" which
 * citelink mis-detected as `january|2023` / `april|2023` author citations.
 * Filter via isMonthName(captured-author).
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

describe('month-name parenthetical filter', () => {
  it('does NOT detect "(January 2023)" as an author citation', () => {
    const text = 'At the time of writing (January 2023), there were 2404 citations.';
    const cits = detectCitations(text);
    const m = cits.find(c => /january/i.test(c.authors[0]?.normalized || ''));
    expect(m).toBeUndefined();
  });

  it('does NOT detect "(April 2023)" / "(April, 2023)" as an author citation', () => {
    const text =
      'Reviewed in (April 2023) and again later (April, 2023) by the same team.';
    const cits = detectCitations(text);
    const apr = cits.filter(c => /april/i.test(c.authors[0]?.normalized || ''));
    expect(apr.length).toBe(0);
  });

  it('still detects authors whose surname contains "May" or other month-like fragments', () => {
    // A real author surnamed "Maybury" or "Mayer" must not be filtered.
    const text = 'A foundational paper by Mayer (2020) discussed the issue.';
    const cits = detectCitations(text);
    const m = cits.find(c => /mayer/i.test(c.authors[0]?.normalized || ''));
    expect(m).toBeDefined();
  });
});
