/**
 * Regression: citation detection must accept surnames with one embedded
 * uppercase letter (McCullough, MacDonald, DeScioli, McKendrick, O'Brien-style
 * compound caps).
 *
 * citationguard-iterate cycle 8 — chan_feldman_2025_cogemo's gold has 25+
 * "McCullough et al. (1997)" / "McCullough et al. (1998)" citations across
 * the body; citelink missed every one because the surname-capture regex
 * `[A-Z][a-zà-ÿā-ž'-]+` rejected the embedded "C" in "McCullough". The same
 * defect class was fixed for the reference parser in cycle 3
 * (vancouverMultiAuthorAndConnector); cycle 8 ports that fix to the citation
 * detector.
 *
 * The fix allows ONE embedded uppercase letter in a lastname:
 * `[A-Z][a-zà-ÿā-ž'-]+(?:[A-Z][a-zà-ÿā-ž'-]+)?` — admits "McCullough",
 * "DeScioli", "MacDonald", "O'Connor" — without admitting two-word phrases.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

describe('citation detection: CamelCase surnames', () => {
  it('detects "McCullough et al. (1997)" as an et al. citation', () => {
    const text = 'Previous work by McCullough et al. (1997) established the model.';
    const cits = detectCitations(text);
    const mc = cits.find(c => /mccullough/i.test(c.authors[0]?.normalized || ''));
    expect(mc).toBeDefined();
    expect(mc!.year).toBe('1997');
    expect(mc!.type).toBe('et_al');
  });

  it('detects "(McCullough et al., 1998)" as a parenthetical et al. citation', () => {
    const text = 'A foundational meta-analysis (McCullough et al., 1998) reviewed the field.';
    const cits = detectCitations(text);
    const mc = cits.find(c => /mccullough/i.test(c.authors[0]?.normalized || ''));
    expect(mc).toBeDefined();
    expect(mc!.year).toBe('1998');
  });

  it('detects "McKendrick (2010)" as a single-author narrative citation', () => {
    const text = 'In a related study, McKendrick (2010) replicated the finding.';
    const cits = detectCitations(text);
    const mk = cits.find(c => /mckendrick/i.test(c.authors[0]?.normalized || ''));
    expect(mk).toBeDefined();
    expect(mk!.year).toBe('2010');
  });

  it('detects "DeScioli and Smith (2015)" as a two-author narrative citation', () => {
    const text = 'A subsequent paper, DeScioli and Smith (2015), extended the result.';
    const cits = detectCitations(text);
    const ds = cits.find(c =>
      /descioli/i.test(c.authors[0]?.normalized || '') &&
      /smith/i.test(c.authors[1]?.normalized || ''),
    );
    expect(ds).toBeDefined();
    expect(ds!.year).toBe('2015');
  });

  it('detects "(MacDonald, 2018)" as a single-author parenthetical citation', () => {
    const text = 'Reading the model (MacDonald, 2018), we see the same pattern.';
    const cits = detectCitations(text);
    const md = cits.find(c => /macdonald/i.test(c.authors[0]?.normalized || ''));
    expect(md).toBeDefined();
    expect(md!.year).toBe('2018');
  });

  it('does NOT allow two embedded uppercase letters (no two-word phrase passes as one surname)', () => {
    // The fix permits exactly ONE embedded uppercase letter; "FooBarBaz" or
    // "Smith Jones" with no particle in between must not pass.
    const text = 'See FooBarBaz (2020) for details and Smith Jones (2021) for context.';
    const cits = detectCitations(text);
    // FooBarBaz should NOT be captured as a single author — it has two embedded caps.
    const foo = cits.find(c => /foobarbaz/i.test(c.authors[0]?.normalized || ''));
    expect(foo).toBeUndefined();
  });
});
