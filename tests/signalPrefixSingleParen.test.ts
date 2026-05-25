/**
 * Regression: signal-phrase prefix inside a single-citation paren must not
 * block detection. citationguard-iterate cycle 14 — chen_2021_jesp had
 * "(see Hoffrage & Pohl, 2003)" and collabra_90203 had "(e.g., Lakens et al.,
 * 2018)" — both single-citation parens (no `;`) so the cycle-9 split-handler
 * strip didn't apply.
 *
 * Cycle 9 (multi-citation bundle) + cycle 14 (single-citation paren) together
 * cover every "(signal-phrase Author, YEAR)" shape.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

describe('signal-phrase prefix in single-citation paren', () => {
  it('detects "(see Hoffrage & Pohl, 2003)"', () => {
    const text = 'See the related work (see Hoffrage & Pohl, 2003) for context.';
    const cits = detectCitations(text);
    const h = cits.find(c => /hoffrage/i.test(c.authors[0]?.normalized || ''));
    expect(h).toBeDefined();
    expect(h!.year).toBe('2003');
  });

  it('detects "(e.g., Lakens et al., 2018)"', () => {
    const text = 'For equivalence testing (e.g., Lakens et al., 2018), the t-test is used.';
    const cits = detectCitations(text);
    const l = cits.find(c => /lakens/i.test(c.authors[0]?.normalized || ''));
    expect(l).toBeDefined();
    expect(l!.year).toBe('2018');
  });

  it('detects "(cf. Smith, 2020)" — cf. prefix on single-author paren', () => {
    const text = 'A related framework (cf. Smith, 2020) supports this view.';
    const cits = detectCitations(text);
    const s = cits.find(c => /smith/i.test(c.authors[0]?.normalized || ''));
    expect(s).toBeDefined();
    expect(s!.year).toBe('2020');
  });
});
