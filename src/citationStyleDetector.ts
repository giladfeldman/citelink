/**
 * Citation Style Auto-Detection Module
 * Detects the citation paradigm and named style used in a document.
 *
 * Paradigms:
 *   author-year  — APA, Harvard, AOM, ASA, Chicago Author-Date
 *   numeric      — Vancouver, IEEE, Nature, AMA
 *
 * Pure function — no DB access.
 */

import type { CitationStyleType, CitationParadigm } from './types.js';

export interface StyleDetectionResult {
  style: CitationStyleType;
  paradigm: CitationParadigm;
  confidence: number;
}

// ── helpers ──────────────────────────────────────────────────────────────

/** Words that precede bracket numbers but are NOT citations */
const NUMERIC_FALSE_POSITIVE_PREFIX =
  /(?:Table|Figure|Fig|Eq|Equation|Chapter|Section|Step|Item|page|pages|pp?|Appendix|Supplement|Panel|Part|Hypothesis|H\d+|Study|Experiment|Model|Wave|Phase|Condition|Group|Sample|Level|Block|Trial|Round)\s*\.?\s*$/i;

/**
 * Count bracket-citation patterns [N], [N,N], [N-N] that are NOT
 * preceded by false-positive prefixes.
 */
function countBracketCitations(text: string): number {
  const pattern = /\[(\d+(?:\s*[-–—]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*)\]/g;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    // Check preceding text for false-positive prefix
    const before = text.slice(Math.max(0, m.index - 30), m.index);
    if (!NUMERIC_FALSE_POSITIVE_PREFIX.test(before)) {
      count++;
    }
  }
  return count;
}

/** Count Unicode superscript digit sequences (Nature/AMA style) */
function countSuperscriptCitations(text: string): number {
  // Unicode superscript digits: ¹²³ ⁰⁴⁵⁶⁷⁸⁹
  const pattern = /[\u00B9\u00B2\u00B3\u2070\u2074-\u2079][\u00B9\u00B2\u00B3\u2070\u2074-\u2079\u207B,–—-]*/g;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    // Must be preceded by a word character or period (end of sentence)
    if (m.index > 0 && /[a-zA-Z.]/.test(text[m.index - 1])) {
      count++;
    }
  }
  return count;
}

/** Words that should NOT be followed by "plain digit superscript" */
const PLAIN_DIGIT_FALSE_POSITIVE_WORD =
  /^(?:Table|Figure|Fig|Eq|Equation|Chapter|Section|Step|Item|page|pages|pp?|Appendix|Supplement|Panel|Part|Scheme|Algorithm|Listing|Line|Row|Column|Criterion|Condition|Model|Experiment|Sample|Group|Phase|Trial|Block|Protocol|Hypothesis|Version|vol|no|CO|H2O|COVID|SARS|mp|km|mg|kg|Hz|kHz|MHz|GHz|dB|mm|cm|nm|pH)$/i;

/**
 * Count plain-digit superscript citations (Nature/AMA in extracted PDF text).
 * When superscript numbers are extracted from PDFs, they often become plain
 * digits attached to the preceding word: "integrity1", "events5,", "adults.2,3"
 */
function countPlainDigitSuperscripts(text: string): number {
  // Find reference section to exclude it
  const refStart = text.search(/\n\s*(?:References|Bibliography|Literature)\s*\n/i);
  const bodyText = refStart > 0 ? text.slice(0, refStart) : text;

  // Pattern: a lowercase letter or period followed immediately by 1-3 digit number(s)
  // Captures: word ending + digit sequence (possibly comma-separated)
  const pattern = /([a-z.)"])(\d{1,3}(?:[,–-]\d{1,3})*)/g;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(bodyText)) !== null) {
    const digitStr = m[2];
    // Skip if the digits form a 4-digit year-like number
    if (/^\d{4}/.test(digitStr)) continue;
    // Skip numbers > 300 (unlikely citation number)
    const firstNum = parseInt(digitStr, 10);
    if (firstNum > 300 || firstNum === 0) continue;
    // Skip decimals: if preceded by a digit (part of "0.91", "41180")
    if (m.index > 0 && /\d/.test(bodyText[m.index - 1])) continue;
    if (m[1] === '.' && m.index > 0 && /\d/.test(bodyText[m.index - 1])) continue;
    // Skip decimal numbers starting with period (e.g., "= .31", "(.08)", ", .18")
    if (m[1] === '.' && m.index > 0 && /[\s=(<,]/.test(bodyText[m.index - 1])) continue;
    // Skip percentages
    const afterEnd = m.index + m[0].length;
    if (afterEnd < bodyText.length && bodyText[afterEnd] === '%') continue;
    // Check preceding word for false positives
    const beforePos = Math.max(0, m.index - 30);
    const beforeText = bodyText.slice(beforePos, m.index + 1);
    const wordMatch = beforeText.match(/([A-Za-z]+)[.)"]*$/);
    if (wordMatch && PLAIN_DIGIT_FALSE_POSITIVE_WORD.test(wordMatch[1])) continue;
    // Skip if preceding word contains consecutive uppercase (acronym/name: IMpower150, BRCA1)
    if (wordMatch && /[A-Z]{2}/.test(wordMatch[1])) continue;
    // Skip statistical expressions: digits after stat operators (t, F, r, p, N, n, df, =, <, >)
    // e.g., "t(2,35)" → "t" + "2", "(N=23)" → "=23" with ")" ending
    if (m[1] === ')' && m.index > 1) {
      // Check if inside a statistical parenthetical like t(df), F(df1,df2), χ²(df)
      const preParen = bodyText.slice(Math.max(0, m.index - 40), m.index + 1);
      if (/[tFrpzZχ]\s*\([^)]*\)$/.test(preParen)) continue;
    }
    // Skip if preceding char is "=" (statistical: N=23, p=.05)
    if (m.index > 0 && bodyText[m.index - 1] === '=') continue;
    count++;
  }
  return count;
}

/**
 * Count parenthetical numeric citations: (1), (1, 2), (1–3), (1, 3–5, 7)
 * Used by PNAS and some science journals. High false-positive risk, so requires
 * strict filtering and is only counted when bracket/superscript counts are low.
 */
function countParentheticalNumeric(text: string): number {
  // Only count in body text (before references)
  const refStart = text.search(/\n\s*(?:References|Bibliography|Literature)\s*\n/i);
  const bodyText = refStart > 0 ? text.slice(0, refStart) : text.slice(0, Math.floor(text.length * 0.7));

  const pattern = /\((\d+(?:\s*[-–—]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*)\)/g;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(bodyText)) !== null) {
    const numbers = m[1].split(/[\s,–—-]+/).map(Number).filter(n => !isNaN(n));
    if (numbers.length === 0) continue;
    // Skip years
    if (numbers.length === 1 && numbers[0] >= 1800 && numbers[0] <= 2099) continue;
    // Skip large numbers
    if (numbers.every(n => n > 300)) continue;
    // Skip statistical contexts
    const before = bodyText.slice(Math.max(0, m.index - 30), m.index);
    if (NUMERIC_FALSE_POSITIVE_PREFIX.test(before)) continue;
    if (/[=<>≤≥nNpPrRdDfFtTzZχ]\s*$/.test(before)) continue;
    if (/\d\s*$/.test(before)) continue;
    if (/(?:SD|SE|CI|OR|HR|RR|M|df|SS)\s*$/i.test(before)) continue;
    // Skip percentages
    const afterEnd = m.index + m[0].length;
    if (afterEnd < bodyText.length && bodyText[afterEnd] === '%') continue;
    // Skip if inside a larger parenthetical
    const lineStart = bodyText.lastIndexOf('\n', m.index) + 1;
    const linePrefix = bodyText.slice(lineStart, m.index);
    const openParens = (linePrefix.match(/\(/g) || []).length;
    const closeParens = (linePrefix.match(/\)/g) || []).length;
    if (openParens > closeParens) continue;
    count++;
  }
  return count;
}

/** Check for full first names in reference list (ASA/Chicago signal) */
function hasFullFirstNames(text: string): boolean {
  const after = findRefSectionText(text);
  if (!after) return false;
  // Pattern: "LastName, FirstName" where FirstName is 3+ lowercase chars (not initials)
  const fullNameMatches = (after.match(/[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+,\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž]{2,}/g) || []).length;
  return fullNameMatches >= 3;
}

/**
 * Distinguish Chicago Author-Date from ASA by journal volume/issue formatting.
 * Chicago: "Journal Vol (Issue): Pages" — SPACE before (Issue), SPACE after colon
 * ASA:     "Journal Vol(Issue):Pages"  — NO space before (Issue), NO space after colon
 */
function hasChicagoJournalFormat(text: string): boolean {
  const after = findRefSectionText(text);
  if (!after) return false;
  // Chicago: "Vol (Issue): Pages" — space before ( and space after :
  const chicagoFormat = (after.match(/\d+\s+\(\d+\)\s*:\s+\d/g) || []).length;
  // ASA: "Vol(Issue):Pages" — no space before ( and no space after :
  const asaFormat = (after.match(/\d+\(\d+\):\d/g) || []).length;
  // If Chicago format is dominant, return true
  return chicagoFormat > asaFormat;
}

/** Count (Author, Year) patterns — APA/AOM/Chicago comma paradigm */
function countAuthorYearComma(text: string): number {
  const pattern = /\(\s*[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+(?:et\s+al\.?|(?:&|and)\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+))?\s*,\s*\d{4}[a-z]?\s*\)/gi;
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

/** Count (Author Year) patterns WITHOUT comma — Harvard/ASA paradigm */
function countAuthorYearNoComma(text: string): number {
  const pattern = /\(\s*[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+(?:et\s+al\.?|(?:&|and)\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+))?\s+\d{4}[a-z]?\s*\)/gi;
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

/** Check if reference list starts with numbered entries */
function hasNumberedReferenceList(text: string): boolean {
  // Find a reference-section header
  let refStart = text.search(/\n\s*(?:References|Bibliography|Literature)\s*\n/i);

  // Fallback: detect headerless numbered reference lists (PNAS, Science, etc.)
  // Look in the last 40% of the document for a "1.\t" pattern followed by "2.\t"
  if (refStart === -1) {
    const minStart = Math.floor(text.length * 0.6);
    const tailText = text.slice(minStart);
    const numberedListMatch = tailText.match(
      /(?:^|\n)(1\.\s)/m
    );
    if (numberedListMatch && numberedListMatch.index !== undefined) {
      const after = tailText.slice(numberedListMatch.index, numberedListMatch.index + 500);
      if (/\n2\.\s/m.test(after) && /\n3\.\s/m.test(after)) {
        refStart = minStart + numberedListMatch.index;
      }
    }
  }

  if (refStart === -1) return false;

  const after = text.slice(refStart).slice(0, 2000); // look at first 2000 chars of refs
  const numberedLines = (after.match(/^\s*(?:\d+\.\s|\[\d+\]\s)/gm) || []).length;
  const totalNonEmptyLines = (after.match(/^\s*\S/gm) || []).length;

  // If enough reference lines are numbered → numeric reference list.
  // Multi-line refs (title, journal, DOI on separate lines) typically have
  // 20-35% numbered lines. Use 0.20 threshold with minimum 5 numbered lines.
  if (totalNonEmptyLines > 2 && numberedLines >= 5 && numberedLines / totalNonEmptyLines > 0.20) {
    return true;
  }

  // Sequential numbering check: if "1.", "2.", "3.", "4.", "5." appear in order,
  // it's a numbered reference list regardless of ratio. Nature papers have
  // numbers on their own lines with multi-line continuation text, so ratio can be low.
  const seqCheck = after.match(/(?:^|\n)\s*(\d+)\.\s/gm);
  if (seqCheck && seqCheck.length >= 5) {
    const nums = seqCheck.map(m => parseInt(m.trim(), 10));
    let sequential = true;
    for (let i = 1; i < Math.min(nums.length, 8); i++) {
      if (nums[i] !== nums[i - 1] + 1) { sequential = false; break; }
    }
    if (sequential && nums[0] === 1) return true;
  }

  return false;
}

/** Check for Vancouver-style author format (Smith JA,) in reference list */
function hasVancouverAuthors(text: string): boolean {
  const after = findRefSectionText(text);
  if (!after) return false;
  // Vancouver: "Smith JA, Jones BC." — no comma between last name and initials
  const vcMatches = (after.match(/[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+\s+[A-Z]{1,4}[,;.]/g) || []).length;
  return vcMatches >= 3;
}

/** Check for IEEE/PNAS author format (J. A. Smith, or single-initial W. Yang) in reference list */
function hasIEEEAuthors(text: string): boolean {
  const after = findRefSectionText(text);
  if (!after) return false;
  // IEEE: "[1] J. A. Smith and B. C. Jones, ..." or PNAS: "1.\tJ. A. Smith et al., ..."
  // The leading initial is required; ADDITIONAL initials are optional — so a
  // single-initial author "[1] W. Yang" matches as well as the two-initial
  // "J. A. Smith". The earlier pattern made the second initial's period
  // mandatory ([A-Z]?\.), so a single-initial IEEE author was missed, the IEEE
  // signal read 0, and the numeric branch mis-detected vancouver — routing the
  // surname-first Vancouver parser at an initials-first IEEE list, which kept
  // "W. Yang" whole instead of extracting "Yang" (citationguard-iterate cycle 6,
  // ieee_access_2 — references F1 1.000 → 0.000 against the real pdftotext text).
  const ieeeMatches = (after.match(/(?:\[\d+\]|\d+\.)\s*[A-Z]\.\s*(?:[A-Z]\.\s*)*[A-Z][a-z]/g) || []).length;
  return ieeeMatches >= 2;
}

/** Check for bare year after authors (AOM/ASA/Chicago) */
function hasBareYearAfterAuthors(text: string): boolean {
  const after = findRefSectionText(text);
  if (!after) return false;
  // Pattern: "Author. 2020. Title" — year NOT in parentheses, after a period
  // Matches both initials (J. A. 2020.) and full names (Eduardo. 2006.)
  // Allow double period (PMC ASA format: "G.. 2021.") and close-paren before period ("(AAPOR). 2016.")
  // Include Unicode curly quotes (\u201C \u201D \u2018 \u2019) alongside ASCII quotes
  const bareYearMatches = (after.match(/[A-Za-z)]\.{0,2}\s+(?:19|20)\d{2}[a-z]?\.\s+[A-Z"'\u201C\u201D\u2018\u2019]/g) || []).length;
  return bareYearMatches >= 3;
}

/** Check for Nature-style year at end: (2020). */
function hasYearAtEnd(text: string): boolean {
  const after = findRefSectionText(text);
  if (!after) return false;
  // Nature/PNAS: "...pages (2020)." at end of reference
  // Also allow DOI/URL after the year-period: "(2020). https://doi.org/..."
  const endYearMatches = (after.match(/\((?:19|20)\d{2}[a-z]?\)\.(?:\s*$|\s+(?:https?:|doi[.:]|10\.\d))/gm) || []).length;
  return endYearMatches >= 3;
}

/**
 * Find reference section text, with fallback for headerless numbered lists.
 * Returns first ~3000 chars of the reference section, or null.
 */
function findRefSectionText(text: string): string | null {
  let refStart = text.search(/\n\s*(?:References|Bibliography|Literature)\s*\n/i);
  if (refStart === -1) {
    // Fallback: numbered list in last 40%
    const minStart = Math.floor(text.length * 0.6);
    const tailText = text.slice(minStart);
    const m = tailText.match(/(?:^|\n)(1\.\s)/m);
    if (m && m.index !== undefined) {
      const after = tailText.slice(m.index, m.index + 500);
      if (/\n2\.\s/m.test(after) && /\n3\.\s/m.test(after)) {
        refStart = minStart + m.index;
      }
    }
  }
  if (refStart === -1) return null;
  return text.slice(refStart).slice(0, 3000);
}

// ── main detector ────────────────────────────────────────────────────────

export function detectCitationStyle(text: string): StyleDetectionResult {
  // Count signals for each paradigm
  const bracketCount = countBracketCitations(text);
  const superscriptCount = countSuperscriptCitations(text);
  const plainDigitCount = countPlainDigitSuperscripts(text);
  const commaCount = countAuthorYearComma(text);
  const noCommaCount = countAuthorYearNoComma(text);

  // Plain digit superscripts (from PDF extraction) count toward superscript total
  const effectiveSuperscriptCount = superscriptCount + plainDigitCount;

  // Parenthetical numeric (N) — only count if bracket/superscript citations are scarce
  const parenNumericCount = (bracketCount + effectiveSuperscriptCount) < 3
    ? countParentheticalNumeric(text)
    : 0;

  const numericTotal = bracketCount + effectiveSuperscriptCount + parenNumericCount;
  const authorYearTotal = commaCount + noCommaCount;

  const numberedRefs = hasNumberedReferenceList(text);
  const vancouverAuthors = hasVancouverAuthors(text);
  const ieeeAuthors = hasIEEEAuthors(text);
  const bareYear = hasBareYearAfterAuthors(text);
  const yearAtEnd = hasYearAtEnd(text);
  const fullFirstNames = hasFullFirstNames(text);

  // ── Determine paradigm ──

  // Author-year patterns (Author, Year) are very high-precision signals — almost never
  // false positives. Parenthetical numeric (N) and plain-digit superscripts are noisy
  // (sample sizes, stats, decimal values in psychology papers).
  // Bracket [N] and Unicode superscript signals are high-precision.
  const hardNumericCount = bracketCount + superscriptCount; // Unicode superscripts only
  const softNumericCount = parenNumericCount + plainDigitCount; // noisy signals

  // Author-year signals get a 2x credibility multiplier against soft numeric signals
  // but compete 1:1 against hard numeric signals (brackets/superscripts)
  const effectiveAuthorYearForComparison = authorYearTotal * 2;
  const effectiveNumericForComparison = hardNumericCount + softNumericCount;

  const isNumeric =
    // Strong numeric signals (brackets or superscripts) dominate AND no meaningful author-year signal
    // If there are 3+ author-year citations, those are high-precision — require overwhelming numeric evidence
    (hardNumericCount >= 3 && hardNumericCount > authorYearTotal * 3 && authorYearTotal < 3) ||
    (hardNumericCount >= 3 && hardNumericCount > authorYearTotal && authorYearTotal === 0) ||
    // Soft numeric signals need to overwhelm boosted author-year count
    // BUT: require at least one hard signal (brackets/superscripts) or a numbered reference list.
    // Plain digit "superscripts" alone are too noisy (page numbers, table cells, stat values).
    // AND: if there are ANY author-year citations, soft signals alone cannot win.
    (effectiveNumericForComparison >= 3 && effectiveNumericForComparison > effectiveAuthorYearForComparison && authorYearTotal === 0 && (hardNumericCount > 0 || numberedRefs)) ||
    // Numbered reference list with no author-year at all
    (numberedRefs && authorYearTotal === 0);

  if (isNumeric && numericTotal > authorYearTotal) {
    // ── NUMERIC paradigm ──
    const total = Math.max(numericTotal, 1);

    if (ieeeAuthors || (bracketCount > 0 && ieeeAuthors)) {
      return {
        style: 'ieee',
        paradigm: 'numeric',
        confidence: Math.min(0.95, 0.6 + (bracketCount / total) * 0.35),
      };
    }

    // Discriminator between bracketed Vancouver / IEEE and superscript Nature / AMA.
    // Use only the HARD superscript signal (Unicode superscript chars) against
    // bracketCount; `effectiveSuperscriptCount` adds `plainDigitCount`, a noisy
    // PDF-extraction proxy that includes stats decimals, page numbers, and table
    // cells. When a paper has a meaningful bracketed-citation count (≥ 5), real
    // bracket citations should dominate noisy plain-digit superscripts.
    const hardSupVsBrackets = bracketCount >= 5
      ? superscriptCount > bracketCount
      : effectiveSuperscriptCount > bracketCount;
    if (hardSupVsBrackets) {
      // Superscript → Nature or AMA
      if (yearAtEnd) {
        return {
          style: 'nature',
          paradigm: 'numeric',
          confidence: Math.min(0.95, 0.6 + (effectiveSuperscriptCount / total) * 0.35),
        };
      }
      // AMA: Vancouver-style refs (LastName Initials) with superscript citations
      if (vancouverAuthors) {
        return {
          style: 'ama',
          paradigm: 'numeric',
          confidence: Math.min(0.90, 0.5 + (effectiveSuperscriptCount / total) * 0.35),
        };
      }
      return {
        style: 'nature',
        paradigm: 'numeric',
        confidence: Math.min(0.85, 0.5 + (effectiveSuperscriptCount / total) * 0.3),
      };
    }

    // Bracket → Vancouver (default numeric bracket style)
    if (vancouverAuthors || numberedRefs) {
      return {
        style: 'vancouver',
        paradigm: 'numeric',
        confidence: Math.min(0.95, 0.6 + (bracketCount / total) * 0.35),
      };
    }

    // Generic bracket numeric
    return {
      style: 'vancouver',
      paradigm: 'numeric',
      confidence: Math.min(0.85, 0.5 + (bracketCount / total) * 0.3),
    };
  }

  // ── AUTHOR-YEAR paradigm ──

  // Check for bare year (AOM/ASA/Chicago)
  // Bare year in references is a strong signal — AOM/ASA/Chicago all use their own citation format,
  // but their REFERENCES use bare years (no parentheses around year).
  const chicagoJournal = hasChicagoJournalFormat(text);

  if (bareYear) {
    const total = Math.max(authorYearTotal, 1);
    if (noCommaCount > commaCount) {
      // No-comma citations + bare year refs → ASA or Chicago-AD
      if (fullFirstNames) {
        // Full first names in refs. Differentiate by journal format:
        // Chicago: "Vol (Issue): Pages" with spaces; ASA: "Vol(Issue):Pages" compact
        if (chicagoJournal) {
          return {
            style: 'chicago-ad',
            paradigm: 'author-year',
            confidence: Math.min(0.90, 0.55 + (noCommaCount / total) * 0.3),
          };
        }
        return {
          style: 'asa',
          paradigm: 'author-year',
          confidence: Math.min(0.85, 0.5 + (noCommaCount / total) * 0.3),
        };
      }
      // No full first names but no comma → likely ASA with initials
      return {
        style: 'asa',
        paradigm: 'author-year',
        confidence: Math.min(0.80, 0.5 + (noCommaCount / total) * 0.25),
      };
    }
    // Comma citations + bare year refs → AOM
    return {
      style: 'aom',
      paradigm: 'author-year',
      confidence: Math.min(0.85, 0.5 + (authorYearTotal / total) * 0.3),
    };
  }

  if (noCommaCount > commaCount && noCommaCount >= 3) {
    // No-comma dominant, no bare year → Harvard
    const total = Math.max(authorYearTotal, 1);
    return {
      style: 'harvard',
      paradigm: 'author-year',
      confidence: Math.min(0.95, 0.6 + (noCommaCount / total) * 0.35),
    };
  }

  // Default: APA (comma paradigm, most common)
  const total = Math.max(authorYearTotal, 1);
  return {
    style: 'apa',
    paradigm: 'author-year',
    confidence: Math.min(0.95, 0.6 + (commaCount / total) * 0.35),
  };
}
