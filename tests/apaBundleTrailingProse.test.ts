/**
 * APA ';'-bundle member carrying a trailing prose note (xiao_2021 / cycle 5)
 *
 * The semicolon-bundle splitter owns ';'-delimited parentheticals, and its
 * per-fragment matchers are $-anchored right after the year. A bundle whose LAST
 * member trails into prose — "(...; Król & Król, 2019 for attempts to explain
 * the replication failures)" — therefore failed every fragment matcher and the
 * citation was dropped. (The prose-bundled fallback pass skips ';'-bundles, so
 * it could not recover it either.)
 *
 * The fix strips a trailing prose note that follows the year, but ONLY when the
 * year is followed by whitespace + a LOWERCASE word — a real following citation
 * starts with an uppercase surname, and a year suffix ("2020a") has no space.
 *
 * Text snippet is verbatim from the docpluck-academic extraction of xiao_2021
 * (DOI 10.1080/23743603.2021.1878340), keeping the CRLF the extractor emitted.
 */

import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

const findByKey = (text: string, normalizedFirstAuthor: string, year: string) =>
  detectCitations(text).find(
    c => c.authors[0]?.normalized === normalizedFirstAuthor && c.year === year,
  );

describe("APA ';'-bundle member with a trailing prose note", () => {
  it('recovers the last bundle member when prose trails the year', () => {
    const text =
      '(for criticisms of the challenge, see Huber et al., 2014; Lichters et al., 2015; ' +
      'Simonson, 2014; see also\r\nKaptein et al., 2016; Król & Król, 2019 for attempts to explain the replication failures)';
    // normalizeText strips diacritics: "Król" -> "krol".
    expect(findByKey(text, 'krol', '2019')).toBeDefined();
    // The earlier well-formed members are still detected.
    expect(findByKey(text, 'lichters', '2015')).toBeDefined();
    expect(findByKey(text, 'kaptein', '2016')).toBeDefined();
  });

  it('does NOT strip a following real citation (uppercase surname after the year)', () => {
    // A "Year Surname, Year" continuation must be left intact — only lowercase
    // prose is a note. Here both members must survive.
    const text = '(Smith, 2020; Jones, 2019)';
    expect(findByKey(text, 'smith', '2020')).toBeDefined();
    expect(findByKey(text, 'jones', '2019')).toBeDefined();
  });

  it('does NOT mangle a year suffix (2020a) — no space before the suffix', () => {
    const text = '(Bishop, 2019; Thaler, 2020a)';
    expect(findByKey(text, 'thaler', '2020')).toBeDefined();
  });
});

describe("APA bundle with a multi-word \"for <prose> see\" lead-in", () => {
  // xiao_2021: the first bundle member is prefixed by arbitrary review/criticism
  // prose ("for criticisms of the challenge, see …", "for recent reviews, see …")
  // that the signal-prefix strip only handled for the narrow "for [a] review(s)
  // see" form — so the first cited work was dropped.
  it('strips "for criticisms of the challenge, see" and keeps the real first author', () => {
    const text =
      '(for criticisms of the challenge, see Huber et al., 2014; Lichters et al., 2015; Simonson, 2014)';
    expect(findByKey(text, 'huber', '2014')).toBeDefined();
    expect(findByKey(text, 'lichters', '2015')).toBeDefined();
  });

  it('strips "for recent reviews, see" (two-author first member)', () => {
    const text = '(for recent reviews, see Gaudeul & Crosetto, 2019; Lichters et al., 2015)';
    expect(findByKey(text, 'gaudeul', '2019')).toBeDefined();
  });

  it('does NOT strip a trailing "for <prose>" that is not a lead-in', () => {
    // "(Smith, 2020) tested for differences" — "for differences" is prose AFTER a
    // detected citation, not a bundle lead-in; the citation must survive.
    const text = 'as shown (Smith, 2020) tested for group differences';
    expect(findByKey(text, 'smith', '2020')).toBeDefined();
  });
});
