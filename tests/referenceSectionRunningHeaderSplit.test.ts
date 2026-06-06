/**
 * Regression: a running page-header that lands MID-ENTRY must not truncate the
 * reference section.
 *
 * citationguard-iterate cycle 2 — surfaced (and previously mis-attributed to
 * docpluck) on chan_feldman_2025_cogemo. The PDF's all-caps running header
 * "COGNITION AND EMOTION" + page number "1247" was injected by extraction INSIDE
 * the Hareli (2006) reference, between "...forgiveness. Motivation" and the
 * continuation "and Emotion, 30(3), 189–197." extractReferenceSection saw the
 * all-caps line, looked ahead exactly ONE content line — Hareli's orphaned
 * lowercase continuation, which carries no reference-start signature — and
 * concluded the section had ended, dropping all 50 references after Hareli
 * (McCullough, Hendrickson, Strelan, Worthington, … Zwaan). citelink parsed 40
 * of 90 refs; matching accuracy collapsed to 0.33 because the in-text cites had
 * no reference to resolve to.
 *
 * Fix: when the first content line after an all-caps header is a continuation
 * fragment (lowercase / digit / DOI-suffix / bracket — not capitalized prose),
 * keep scanning the look-ahead window for the next genuine reference start
 * instead of treating the header as the end of the section.
 *
 * The reference strings below are verbatim from the chan_feldman_2025_cogemo
 * extraction fixture (apps/worker/tests/extraction-results/
 * chan_feldman_2025_cogemo.pdf_pymupdf.txt, lines ~1908–1922), line wraps and
 * the injected header/page-number/blank preserved.
 */
import { describe, it, expect } from '@jest/globals';
import { parseReferences } from '../src/referenceParser.js';

const REFS = `References
Gilovich, T., & Medvec, V. H. (1994). The temporal pattern to the experience of regret.
Journal of Personality and Social Psychology, 67(3), 357–365.
Hareli, S., & Eisikovits, Z. (2006). The role of communicating social
emotions accompanying apologies in forgiveness. Motivation
COGNITION AND EMOTION
1247

and Emotion, 30(3), 189–197. https://doi.org/10.1007/s11031-
006-9025-x
Hendrickson, G. F., Stanley, J. C., & Hills, J. R. (1970). Olkin’s new
formula for significance of r13 vs. r23 compared with hotelling’s
method. American Educational Research Journal, 7(2), 189–195.
McCullough, M. E., Worthington, E. L., & Rachal, K. C. (1997). Interpersonal
forgiving in close relationships. Journal of Personality and Social Psychology,
73(2), 321–336.
`;

describe('reference section: running header splitting an entry mid-line', () => {
  const refs = parseReferences(REFS, 'apa');
  const has = (last: string, year: string) =>
    refs.some((r) => r.firstAuthorLastName.toLowerCase().includes(last) && String(r.year) === year);

  it('parses the entry that the header split (Hareli is not lost)', () => {
    expect(has('hareli', '2006')).toBe(true);
  });

  it('does NOT truncate at the mid-entry header: references after it are parsed', () => {
    // These three all appear AFTER the "COGNITION AND EMOTION / 1247" header.
    // Before the fix they were silently dropped.
    expect(has('hendrickson', '1970')).toBe(true);
    expect(has('mccullough', '1997')).toBe(true);
  });

  it('recovers the full reference count, not the truncated prefix', () => {
    // 4 distinct references in this snippet; the bug returned only the 2 before
    // the header (Gilovich, Hareli).
    expect(refs.length).toBeGreaterThanOrEqual(4);
  });
});
