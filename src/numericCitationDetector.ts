/**
 * Numeric Citation Detection Module
 * Detects bracket [N] and superscript citation patterns used in
 * Vancouver, IEEE, Nature, and AMA styles.
 */

import type { DetectedCitation, ParsedCitationAuthor } from './citationDetector.js';

/** Prefix patterns that indicate non-citation bracket numbers */
const FALSE_POSITIVE_PREFIX =
  /(?:Table|Figure|Fig|Eq|Equation|Chapter|Section|Step|Item|page|pages|pp?|Appendix|Supplement|Panel|Part|Scheme|Algorithm|Listing|Line|Row|Column|Criterion|Condition|Model|Experiment|Sample|Group|Phase|Trial|Block|Protocol|Hypothesis|H\d+)\s*\.?\s*$/i;

/** Expand a range string like "1,3-5,7" into [1,3,4,5,7] */
export function expandNumericRange(rangeStr: string): number[] {
  const nums: number[] = [];
  // First, handle thousands-separator commas: "1,234" should be 1234, not [1, 234]
  // A comma between digit groups of exactly 3 is a thousands separator
  const cleaned = rangeStr.replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
  const parts = cleaned.split(/\s*,\s*/);
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = start; i <= end && i - start < 100; i++) {
        nums.push(i);
      }
    } else {
      const n = parseInt(part.trim(), 10);
      if (!isNaN(n)) nums.push(n);
    }
  }
  return nums;
}

/** Extract context around a position */
function extractContext(text: string, pos: number, len: number): string {
  const radius = 100;
  const start = Math.max(0, pos - radius);
  const end = Math.min(text.length, pos + len + radius);
  return text.slice(start, end);
}

/**
 * Detect numeric bracket citations: [1], [1,2], [1-3], [1,3-5,7]
 */
export function detectNumericCitations(
  text: string,
  referenceSectionStart?: number,
): DetectedCitation[] {
  const citations: DetectedCitation[] = [];
  const processedPositions = new Set<string>();

  // ── Bracket patterns ──
  const bracketPattern =
    /\[(\d+(?:\s*[-–—]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*)\]/g;

  let m: RegExpExecArray | null;
  while ((m = bracketPattern.exec(text)) !== null) {
    // Skip citations within reference section
    if (referenceSectionStart !== undefined && m.index >= referenceSectionStart) continue;

    // Skip false positives
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    if (FALSE_POSITIVE_PREFIX.test(before)) continue;

    const posKey = `${m.index}-${m.index + m[0].length}`;
    if (processedPositions.has(posKey)) continue;
    processedPositions.add(posKey);

    const numbers = expandNumericRange(m[1]);
    if (numbers.length === 0) continue;
    // Skip if any number is 0 — reference numbers start at 1; [0, 1] is a math interval
    if (numbers.some(n => n === 0)) continue;
    // Skip single numbers that look like years (1800-2099) or are implausibly large (>500)
    if (numbers.length === 1 && (numbers[0] >= 1800 || numbers[0] > 500)) continue;

    citations.push({
      raw: m[0],
      normalized: m[0],
      type: 'numeric' as any,
      citationStyle: 'parenthetical',
      authors: [] as ParsedCitationAuthor[],
      year: '',
      citationNumbers: numbers,
      position: { start: m.index, end: m.index + m[0].length },
      context: extractContext(text, m.index, m[0].length),
    });
  }

  // ── Narrative numeric: "Smith [1]" or "Smith et al. [1,2]" ──
  const narrativePattern =
    /([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+et\s+al\.?)?)\s*\[(\d+(?:\s*[-–—,]\s*\d+)*)\]/g;

  while ((m = narrativePattern.exec(text)) !== null) {
    if (referenceSectionStart !== undefined && m.index >= referenceSectionStart) continue;

    // Check false positive: the "author" word is actually a prefix like Table, Figure, Section, etc.
    const authorWord = m[1].trim().replace(/\s+et\s+al\.?$/i, '');
    if (FALSE_POSITIVE_PREFIX.test(authorWord)) continue;

    const posKey = `${m.index}-${m.index + m[0].length}`;
    if (processedPositions.has(posKey)) continue;

    // Check that the bracket part wasn't already captured
    const bracketStart = m.index + m[0].indexOf('[');
    const bracketPosKey = `${bracketStart}-${m.index + m[0].length}`;
    if (processedPositions.has(bracketPosKey)) continue;
    processedPositions.add(posKey);

    const numbers = expandNumericRange(m[2]);
    if (numbers.length === 0) continue;

    const authorName = m[1].trim();
    const authors: ParsedCitationAuthor[] = [{
      raw: authorName,
      normalized: authorName.toLowerCase(),
      isEtAl: /et\s+al/i.test(authorName),
      isOrganization: false,
    }];

    citations.push({
      raw: m[0],
      normalized: m[0],
      type: 'numeric' as any,
      citationStyle: 'narrative',
      authors,
      year: '',
      citationNumbers: numbers,
      position: { start: m.index, end: m.index + m[0].length },
      context: extractContext(text, m.index, m[0].length),
    });
  }

  // ── Superscript Unicode digits ──
  const superscriptMap: Record<string, string> = {
    '\u2070': '0', '\u00B9': '1', '\u00B2': '2', '\u00B3': '3',
    '\u2074': '4', '\u2075': '5', '\u2076': '6', '\u2077': '7',
    '\u2078': '8', '\u2079': '9',
  };
  const superscriptDigits = Object.keys(superscriptMap).join('');
  const superPattern = new RegExp(
    `[${superscriptDigits}][${superscriptDigits}\\u207B,–—-]*`,
    'g',
  );

  while ((m = superPattern.exec(text)) !== null) {
    if (referenceSectionStart !== undefined && m.index >= referenceSectionStart) continue;

    // Must follow a word character or period
    if (m.index > 0 && !/[a-zA-Z.]/.test(text[m.index - 1])) continue;

    const posKey = `${m.index}-${m.index + m[0].length}`;
    if (processedPositions.has(posKey)) continue;
    processedPositions.add(posKey);

    // Convert superscript to ASCII digits
    let asciiStr = '';
    for (const ch of m[0]) {
      asciiStr += superscriptMap[ch] || ch;
    }
    // Replace minus sign (⁻) with dash
    asciiStr = asciiStr.replace(/\u207B/g, '-');

    const numbers = expandNumericRange(asciiStr);
    if (numbers.length === 0) continue;

    citations.push({
      raw: m[0],
      normalized: `[${asciiStr}]`,
      type: 'numeric' as any,
      citationStyle: 'parenthetical',
      authors: [] as ParsedCitationAuthor[],
      year: '',
      citationNumbers: numbers,
      position: { start: m.index, end: m.index + m[0].length },
      context: extractContext(text, m.index, m[0].length),
    });
  }

  // ── Plain digit superscripts (from PDF extraction) ──
  // When superscript numbers are extracted from PDFs, they often become plain
  // digits attached to the preceding word: "integrity1", "events5,", "adults.2,3"
  const PLAIN_DIGIT_FP_WORD =
    /(?:Table|Figure|Fig|Eq|Equation|Chapter|Section|Step|Item|page|pages|pp?|Appendix|Supplement|Panel|Part|Scheme|Algorithm|Listing|Line|Row|Column|Criterion|Condition|Model|Experiment|Sample|Group|Phase|Trial|Block|Protocol|Hypothesis|Version|vol|no|CO|H2O|COVID|SARS|mp|km|mg|kg|Hz|kHz|MHz|GHz|dB|mm|cm|nm|pH)$/i;

  const plainDigitPattern = /([a-z.)"])(\d{1,3}(?:[,–-]\d{1,3})*)/g;
  while ((m = plainDigitPattern.exec(text)) !== null) {
    if (referenceSectionStart !== undefined && m.index >= referenceSectionStart) continue;

    const digitStr = m[2];
    // Skip 4-digit years
    if (/^\d{4}/.test(digitStr)) continue;
    // Skip numbers > 300
    const firstNum = parseInt(digitStr, 10);
    if (firstNum > 300 || firstNum === 0) continue;

    // ── False positive filtering ──

    // Skip if preceded by a digit (part of a larger number like "0.91", "41180")
    if (m.index > 0 && /\d/.test(text[m.index - 1])) continue;
    // Skip if the preceding char is a decimal point preceded by a digit (e.g., "0.91")
    if (m[1] === '.' && m.index > 0 && /\d/.test(text[m.index - 1])) continue;
    // Skip decimal numbers starting with period (e.g., "= .31", "(.08)", ", .18", ").60")
    // These are common effect sizes in meta-analyses, not citations
    if (m[1] === '.' && m.index > 0 && /[\s=(<,)]/.test(text[m.index - 1])) continue;
    // Skip if followed by a decimal digit (e.g., ".91" is part of "0.91x")
    const afterEnd = m.index + m[0].length;
    if (afterEnd < text.length && /\d/.test(text[afterEnd])) continue;
    // Skip if inside a DOI pattern (look for "doi" or "10." nearby)
    const nearContext = text.slice(Math.max(0, m.index - 50), Math.min(text.length, afterEnd + 20));
    if (/doi[.:]|10\.\d{4,}/i.test(nearContext) && !/[a-z]{3,}\d/i.test(m[0])) continue;
    // Skip if inside a URL (e.g., "https://osf.io/dbn92" — "n92" is not a citation)
    const preUrl = text.slice(Math.max(0, m.index - 80), m.index + 1);
    if (/https?:\/\/\S+$/.test(preUrl)) continue;
    // Skip percentage patterns: "86%"
    if (afterEnd < text.length && text[afterEnd] === '%') continue;
    // Skip if preceded by "pp." or "p." (page numbers)
    const before10 = text.slice(Math.max(0, m.index - 10), m.index);
    if (/pp?\.\s*$/.test(before10)) continue;
    // Skip if preceded by "vol." or "no."
    if (/(?:vol|no)\.\s*$/i.test(before10)) continue;

    // Skip standalone single-letter + digit (table row labels like "a54", "b39")
    // A standalone letter has no preceding letter — it's a label, not a superscript attachment
    if (/[a-z]/.test(m[1]) && (m.index === 0 || !/[a-zA-Z]/.test(text[m.index - 1]))) continue;

    // Skip digits followed by a parenthetical number range (table data with CI/ranges)
    // e.g., "participants76 (66 to 87)" or "results74 (63-84)"
    const digitEnd2 = m.index + m[0].length;
    const afterRangeCtx = text.slice(digitEnd2, digitEnd2 + 30);
    if (/^\s*\(\s*[-−]?\d+\s*(?:to|[-–—])\s*\d+/.test(afterRangeCtx)) continue;

    // Check preceding word for false positives
    const beforePos = Math.max(0, m.index - 30);
    const beforeText = text.slice(beforePos, m.index + 1);
    const wordMatch = beforeText.match(/([A-Za-z]+)[.)"]*$/);
    if (wordMatch && PLAIN_DIGIT_FP_WORD.test(wordMatch[1])) continue;
    // Skip if preceding word contains consecutive uppercase (acronym/name: IMpower150, BRCA1)
    if (wordMatch && /[A-Z]{2}/.test(wordMatch[1])) continue;

    // Position key: the digit portion starts at m.index + m[1].length
    const digitStart = m.index + m[1].length;
    const digitEnd = digitStart + digitStr.length;
    const posKey = `${digitStart}-${digitEnd}`;
    if (processedPositions.has(posKey)) continue;
    processedPositions.add(posKey);

    const numbers = expandNumericRange(digitStr);
    if (numbers.length === 0) continue;

    citations.push({
      raw: m[0],
      normalized: `[${digitStr}]`,
      type: 'numeric' as any,
      citationStyle: 'parenthetical',
      authors: [] as ParsedCitationAuthor[],
      year: '',
      citationNumbers: numbers,
      position: { start: digitStart, end: digitEnd },
      context: extractContext(text, m.index, m[0].length),
    });
  }

  // ── Parenthetical numeric: (1), (1, 2), (1–3), (1, 3–5, 7) ──
  // Used by PNAS, some science journals. High false-positive risk — needs careful filtering.
  // Only activated when bracket citations are scarce (< 3) to avoid double-counting.
  if (citations.filter(c => c.raw.startsWith('[')).length < 3) {
    const parenPattern =
      /\((\d+(?:\s*[-–—]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*)\)/g;

    while ((m = parenPattern.exec(text)) !== null) {
      if (referenceSectionStart !== undefined && m.index >= referenceSectionStart) continue;

      const innerText = m[1].trim();
      const numbers = expandNumericRange(innerText);
      if (numbers.length === 0) continue;

      // ── Aggressive false-positive filtering for parenthetical numbers ──

      // Skip if any number is 0 — reference numbers start at 1
      if (numbers.some(n => n === 0)) continue;

      // Skip years: any number 1800-2099
      if (numbers.length === 1 && numbers[0] >= 1800 && numbers[0] <= 2099) continue;

      // Skip if all numbers > 300 (unlikely citation numbers)
      if (numbers.every(n => n > 300)) continue;

      // Skip if preceded by common non-citation contexts
      const before40 = text.slice(Math.max(0, m.index - 40), m.index);
      if (FALSE_POSITIVE_PREFIX.test(before40)) continue;

      // Skip statistical/mathematical contexts: "= (N)", "n = (N)", "N = (N)", "p (N)"
      if (/[=<>≤≥nNpPrRdDfFtTzZχ]\s*$/.test(before40)) continue;
      // Skip after percent, dollar, or other numeric contexts
      if (/\d\s*$/.test(before40)) continue;
      // Skip "SD" "SE" "CI" "OR" "HR" "RR" "M" before parens
      if (/(?:SD|SE|CI|OR|HR|RR|M|df|SS)\s*$/i.test(before40)) continue;

      // Skip if followed by common non-citation suffixes: %, unit, year range
      const after10 = text.slice(m.index + m[0].length, m.index + m[0].length + 10);
      if (/^[%°]/.test(after10)) continue;

      // Skip if inside a larger parenthetical expression (already inside parens)
      // Check: is there an unmatched open paren before us on this line?
      const lineStart = text.lastIndexOf('\n', m.index) + 1;
      const linePrefix = text.slice(lineStart, m.index);
      const openParens = (linePrefix.match(/\(/g) || []).length;
      const closeParens = (linePrefix.match(/\)/g) || []).length;
      if (openParens > closeParens) continue;

      const posKey = `${m.index}-${m.index + m[0].length}`;
      if (processedPositions.has(posKey)) continue;
      processedPositions.add(posKey);

      citations.push({
        raw: m[0],
        normalized: `[${innerText}]`,
        type: 'numeric' as any,
        citationStyle: 'parenthetical',
        authors: [] as ParsedCitationAuthor[],
        year: '',
        citationNumbers: numbers,
        position: { start: m.index, end: m.index + m[0].length },
        context: extractContext(text, m.index, m[0].length),
      });
    }
  }

  // ── Standalone line numbers (from PDF superscript extraction) ──
  // When PDFs with superscript citations are extracted, the numbers often
  // appear on their own line as plain digits: "...care.\n1–3\n...choice.\n4–6\n"
  // Only activate if very few citations were found by other patterns,
  // AND there are enough standalone number patterns to be confident.
  if (citations.length < 3) {
    const standalonePattern =
      /([.,:;!?)\]"])\s*\n[ \t]*(\d{1,3}(?:[\s,–-]+\d{1,3})*)[ \t]*(?:\n|$)/g;

    const standaloneCandidates: Array<{ match: RegExpExecArray; numbers: number[] }> = [];
    while ((m = standalonePattern.exec(text)) !== null) {
      if (referenceSectionStart !== undefined && m.index >= referenceSectionStart) continue;

      const digitStr = m[2].trim();
      const numbers = expandNumericRange(digitStr.replace(/\s+/g, ','));
      if (numbers.length === 0) continue;
      if (numbers.some(n => n === 0 || n > 300)) continue;

      // Skip if preceded by page/figure/table context
      const before30 = text.slice(Math.max(0, m.index - 30), m.index);
      if (FALSE_POSITIVE_PREFIX.test(before30)) continue;

      standaloneCandidates.push({ match: m, numbers });
    }

    // Only accept standalone numbers if there are enough of them (≥3)
    // to indicate a systematic citation pattern, not isolated occurrences
    if (standaloneCandidates.length >= 3) {
      for (const { match: sm, numbers } of standaloneCandidates) {
        const digitPart = sm[2].trim();
        const digitStart = sm.index + sm[0].indexOf(digitPart);
        const digitEnd = digitStart + digitPart.length;
        const posKey = `${digitStart}-${digitEnd}`;
        if (processedPositions.has(posKey)) continue;
        processedPositions.add(posKey);

        citations.push({
          raw: digitPart,
          normalized: `[${digitPart}]`,
          type: 'numeric' as any,
          citationStyle: 'parenthetical',
          authors: [] as ParsedCitationAuthor[],
          year: '',
          citationNumbers: numbers,
          position: { start: digitStart, end: digitEnd },
          context: extractContext(text, sm.index, sm[0].length),
        });
      }
    }
  }

  // Sort by position
  citations.sort((a, b) => a.position.start - b.position.start);
  return citations;
}
