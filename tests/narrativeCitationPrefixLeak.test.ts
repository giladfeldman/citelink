/**
 * Regression: narrative citation regex must not accept arbitrary lowercase words
 * as the middle particle of a compound surname.
 *
 * citationguard-iterate cycle 7 — gate-enhancement (cycle 6) surfaced a defect
 * class hidden by the previous summary-only intext metric: citelink's narrative
 * patterns include an optional middle group `(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][...])?`
 * intended to support compound surnames like "Van der Berg" or "De La Cruz".
 * The bare `[a-z]+` accepts ANY lowercase word, so phrases like:
 *
 *   "Replication of Fischhoff (1975)"      → author = "Replication of Fischhoff"
 *   "Since the Fischhoff (1975) article"   → author = "Since the Fischhoff"
 *   "We chose Slovic (1977)"               → author = "We chose Slovic"
 *   "We employed Diedenhofen and Musch"    → author1 = "We employed Diedenhofen"
 *   "Replication of Gilovich and Medvec"   → author1 = "Replication of Gilovich"
 *
 * are mis-parsed, simultaneously inventing spurious authors AND failing to match
 * the real citations to the reference list. Fix: restrict the middle particle
 * to a whitelist of known surname particles (van/von/de/der/del/della/di/du/la/
 * le/y/af/av/da/dos/das/al/el/ten/ter/zu/zur/st/saint/ibn/ben/bin/abu).
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

describe('narrative citation: prefix-leak guard', () => {
  it('does NOT include preceding sentence words in the author name', () => {
    const text =
      'In a foundational study, Replication of Fischhoff (1975) demonstrated the ' +
      'bias. Since the Fischhoff (1975) article was published, the field has ' +
      'grown. We chose Slovic (1977) as the second target. Across studies, ' +
      'We employed Diedenhofen and Musch (2015) for correlation comparison.';
    const cits = detectCitations(text);
    const authorKeys = cits.map(c =>
      c.authors.map(a => (a.normalized || '').toLowerCase()).join('|'),
    );
    // No predicted citation should have a preceding-sentence word baked into
    // the author name.
    for (const k of authorKeys) {
      expect(k).not.toMatch(/^replication of /);
      expect(k).not.toMatch(/^since the /);
      expect(k).not.toMatch(/^we (chose|employed|used|tested|examined|tried) /);
    }
    // The real citations must still be detected with the bare surname.
    expect(authorKeys.some(k => k === 'fischhoff')).toBe(true);
    expect(authorKeys.some(k => k === 'slovic')).toBe(true);
    // The two-author narrative must still detect "Diedenhofen and Musch (2015)".
    const dh = cits.find(c =>
      c.authors.length === 2 &&
      (c.authors[0].normalized || '').toLowerCase() === 'diedenhofen' &&
      (c.authors[1].normalized || '').toLowerCase() === 'musch',
    );
    expect(dh).toBeDefined();
  });

  it('still accepts genuine compound surnames with allowed particles', () => {
    // The middle-particle group exists for a reason — it lets "Van der Berg",
    // "De la Cruz" (lowercase middle), "Von Restorff", etc. parse as one
    // surname. The fix must not break these.
    const text =
      'In a longitudinal study, Van der Berg (2020) found similar effects. ' +
      'Subsequent work by De la Cruz (2021) replicated the finding. ' +
      'Earlier, Von Restorff (1933) had observed the underlying mechanism.';
    const cits = detectCitations(text);
    const surnames = cits.map(c => (c.authors[0]?.normalized || '').toLowerCase());
    expect(surnames.some(s => /van\s*der\s*berg/.test(s))).toBe(true);
    expect(surnames.some(s => /de\s*la\s*cruz/.test(s))).toBe(true);
    // "Von Restorff" — capital-initial particle "Von" is not consumed by the
    // optional lowercase-particle middle group (and never was, even before the
    // fix). Document the pre-existing convention: surname parses as just
    // "Restorff" in this case. This trade-off is accepted; capital-initial
    // particles are rare in APA reference lists, which typically lowercase
    // them.
    expect(surnames.some(s => /restorff/.test(s))).toBe(true);
  });
});
