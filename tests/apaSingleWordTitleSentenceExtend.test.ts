import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser';

/**
 * Regression: a single-WORD first sentence in an APA title was truncated to the
 * lone word (citationguard-iterate 2026-06-25, chen — R-0177 Sonnet canary audit).
 *
 * The title terminator anchors on the first "period + space". When a title legitimately
 * begins with a one-word fragment that ends in a period — a product/site name with an
 * internal period ("TurkPrime. Com: …", "Prolific. Ac--…"), an editorial prefix
 * ("Retraction. Effects of…"), or an odd leading clause ("Psychology. Estimating the
 * reproducibility…") — the parser cut the title to just "TurkPrime." / "Psychology." /
 * "Retraction." / "Prolific.", dropping the real title. chen lost the full titles of
 * Litman (2017, TurkPrime) and the Open Science Collaboration (2015), scoring 2
 * references.field_mismatches and capping refs.f1 at 0.966.
 *
 * Fix (referenceParser.parseAPAReference, title block): when the first sentence is a
 * single word ending in a period, re-anchor to the NEXT sentence period — but ONLY when
 * the continuation up to that period is genuine title PROSE (>= 3 lowercase words). A
 * real one-word title followed by a journal or a Place: Publisher
 * ("Leadership. New York: Harper & Row.", "Forgiveness. Annual Review of Psychology, …")
 * has no prose continuation and is left intact, so the source/publisher is never
 * absorbed into the title. Mirrors the existing roman-numeral / "Pt./Vol." prefix guard.
 *
 * Tests run the real parseReferences on the verbatim chen reference strings plus the
 * two keep-cases that must NOT extend.
 */

function parseOne(refLine: string) {
  // Wrap in a minimal doc so the reference-section detector fires.
  const doc = 'Body text.\n\nReferences\n\n' + refLine;
  const parsed = parseReferences(doc, 'apa');
  return parsed[0];
}

describe('APA single-word title sentence — extend past the lone-word period (chen R-0177)', () => {
  it('recovers the full TurkPrime title (Litman 2017, verbatim from chen)', () => {
    const ref = parseOne(
      'Litman, L., Robinson, J., & Abberbock, T. (2017). TurkPrime. Com: A versatile ' +
      'crowdsourcing data acquisition platform for the behavioral sciences. ' +
      'Behavior Research Methods, 49(2), 433-442.'
    );
    expect(ref).toBeDefined();
    expect(ref.title).toMatch(/^TurkPrime\. Com: A versatile crowdsourcing/);
    // must NOT be truncated to the lone word
    expect(ref.title).not.toBe('TurkPrime.');
  });

  it('recovers the full Open Science Collaboration title (2015, verbatim from chen)', () => {
    const ref = parseOne(
      'Open, S. C. (2015). Psychology. Estimating the reproducibility of psychological ' +
      'science. Science, 349(6251). aac4716.'
    );
    expect(ref).toBeDefined();
    expect(ref.title).toMatch(/^Psychology\. Estimating the reproducibility of psychological science/);
    expect(ref.title).not.toBe('Psychology.');
  });

  it('recovers an editorial "Retraction." prefix title', () => {
    const ref = parseOne(
      'Author, A. (2018). Retraction. Effects of anonymous whistle-blowing and ' +
      'perceived fairness. Journal of Business Ethics, 100, 1-10.'
    );
    expect(ref.title).toMatch(/^Retraction\. Effects of anonymous whistle-blowing/);
    expect(ref.title).not.toBe('Retraction.');
  });

  it('does NOT extend a genuine one-word BOOK title into the publisher (Leadership.)', () => {
    const ref = parseOne('Burns, J. M. (1978). Leadership. New York: Harper & Row.');
    expect(ref.title).toBe('Leadership.');
    // the Place: Publisher must not be absorbed into the title
    expect(ref.title).not.toMatch(/New York|Harper/);
  });

  it('does NOT extend a genuine one-word title when a journal follows (Forgiveness.)', () => {
    const ref = parseOne('Smith, J. (2005). Forgiveness. Annual Review of Psychology, 56, 1-10.');
    expect(ref.title).toBe('Forgiveness.');
    expect(ref.title).not.toMatch(/Annual Review/);
  });
});
