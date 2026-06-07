/**
 * Regression: plain-digit (PDF-superscript) citation detection fabricated a
 * citation from a digit sitting INSIDE a bare URL / domain token.
 *
 * citationguard-iterate (session 2026-06-07e) — surfaced on nat_comms_2, whose
 * methods section references the consortium URL "isaric4c.net". pdftotext keeps
 * it as one token "isaric4c.net/sccp/..." and the detector's letter-then-digit
 * rule matched "c4" → emitted a bogus citation [4]. For an academic-integrity
 * tool, fabricating a citation from a web address is exactly the false-positive
 * class we must never produce. The pre-existing guard only caught "http://"-
 * prefixed URLs; bare domains slipped through.
 *
 * Text snippets are verbatim from the nat_comms_2 extraction fixture.
 */
import { describe, it, expect } from '@jest/globals';
import { detectNumericCitations } from '../src/numericCitationDetector.js';

const numbersIn = (text: string): number[] => {
  const cites = detectNumericCitations(text);
  return cites.flatMap((c) => c.citationNumbers ?? []);
};

describe('numeric URL/bare-domain FP guard (2026-06-07e)', () => {
  it('does NOT fabricate a citation from a digit inside a bare domain ("isaric4c.net")', () => {
    const text =
      'The study was approved by an ethics committee at isaric4c.net/sccp and registered.';
    expect(numbersIn(text)).not.toContain(4);
  });

  it('does NOT fabricate from a bare domain with a trailing digit ("osf.io/dbn92")', () => {
    const text = 'Materials are available at osf.io/dbn92 for all conditions.';
    expect(numbersIn(text)).not.toContain(92);
  });

  it('STILL detects a real superscript citation on a word ("severity43.")', () => {
    // The guard must not over-skip: a genuine glued superscript citation on a
    // normal word (no TLD in its token) is still a citation.
    const text = 'These markers correlated with disease severity43. A review followed.';
    expect(numbersIn(text)).toContain(43);
  });

  it('STILL detects a real superscript after a closing paren near non-URL text', () => {
    const text = 'found in cerebrospinal fluid (CSF)13. Another sentence follows.';
    expect(numbersIn(text)).toContain(13);
  });
});
