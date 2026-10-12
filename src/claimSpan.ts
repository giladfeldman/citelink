/**
 * The sentence(s) an in-text citation is tied to.
 *
 * A detection's `context` is a fixed character window, which is fine for matching and wrong for
 * a reader: it starts and ends mid-word and mid-claim. `findClaimSpan` returns sentence
 * boundaries instead, so a reader (or a downstream check) sees what the author actually says
 * about the cited work.
 *
 * Positions are in the coordinate space of the `text` you pass, which must be the same text the
 * citation positions came from.
 */

/** Where the claim around one citation starts and ends, as offsets into the input text. */
export interface ClaimSpan {
  /** Start of the span (the previous sentence's start when `includesPrevious`). */
  start: number;
  /** End of the span: just after the citing sentence's terminal punctuation. */
  end: number;
  /** Start of the sentence that contains the citation. Equals `start` unless `includesPrevious`. */
  citingSentenceStart: number;
  /** True when the sentence before the citing one was included because the claim leans on it. */
  includesPrevious: boolean;
  /** True when no sentence boundary was found within the search window and the span was capped. */
  truncated: boolean;
}

/** How far to look for a boundary on each side of the citation before capping the span. */
const MAX_REACH = 500;

/**
 * Tokens that end in a period without ending a sentence. Compared lower-cased, without the
 * period. Single capital letters (author initials) are handled separately.
 */
const ABBREVIATIONS = new Set([
  'al', 'e.g', 'i.e', 'cf', 'vs', 'viz', 'etc', 'ca', 'approx', 'resp', 'esp',
  'fig', 'figs', 'tab', 'eq', 'eqs', 'no', 'nos', 'vol', 'vols', 'p', 'pp', 'ch', 'chap', 'sec',
  'ed', 'eds', 'trans', 'rev', 'suppl', 'n.d', 'dr', 'mr', 'mrs', 'ms', 'prof', 'st', 'jr', 'sr',
  'inc', 'ltd', 'co', 'corp', 'dept', 'univ', 'exp', 'expt', 'm', 'sd', 'se', 'n', 'u.s', 'u.k',
]);

/**
 * Openers that make a sentence depend on the one before it: the claim being cited is (partly)
 * stated there. Matched at the very start of the citing sentence, case-sensitively, so a
 * mid-sentence "this" is not a cue.
 */
const CONTINUATION_OPENER =
  /^(?:This|These|That|Those|Such|It|They|Their|Its|He|She|However|Moreover|Furthermore|Additionally|In addition|Also|Indeed|Thus|Therefore|Hence|Accordingly|Similarly|Likewise|Conversely|In contrast|By contrast|Nevertheless|Nonetheless|Yet|But|And|Specifically|In particular|Notably|For example|For instance|Consistent with|In line with|Relatedly|Here|There)\b/;

/** A citing sentence with fewer content words than this, outside the citation, takes the previous one. */
const MIN_OWN_WORDS = 4;

const CLOSERS = new Set([')', ']', '"', "'", '”', '’']);

function isWordChar(ch: string): boolean {
  return /[\p{L}\p{N}.]/u.test(ch);
}

/** True when the text from `i` on starts with a paragraph break (a line containing only whitespace). */
function paragraphBreakAt(text: string, i: number): number {
  const m = /^[ \t]*\r?\n[ \t]*\r?\n\s*/.exec(text.slice(i, i + 64));
  return m ? m[0].length : 0;
}

/**
 * Length of a citation-number run printed right after a sentence's period, as AMA and other
 * superscript styles do ("kcal/d.3-5 Moreover"), or 0. Only after a word-final period (a letter
 * or closing bracket before it), so decimals and section numbers ("2.1 Results") never qualify,
 * and only when whitespace and a capital follow the run.
 */
function superscriptRunAfter(text: string, dot: number): number {
  if (text[dot] !== '.' || dot === 0 || !/[\p{L})\]]/u.test(text[dot - 1])) return 0;
  const m = /^[0-9][0-9,–—-]*(?=\s+[\p{Lu}"'(“])/u.exec(text.slice(dot + 1, dot + 40));
  return m ? m[0].length : 0;
}

/**
 * True when the period at `dot` ends a sentence: it is followed by optional closers, then
 * whitespace, then something that can open a sentence — and the word before it is not an
 * abbreviation or an initial.
 */
function periodEndsSentence(text: string, dot: number): boolean {
  if (superscriptRunAfter(text, dot) > 0) return true;
  let j = dot + 1;
  while (j < text.length && CLOSERS.has(text[j])) j++;
  if (j >= text.length) return true;
  if (!/\s/.test(text[j])) return false; // "0.45", "e.g.,", "U.S.-based"
  while (j < text.length && /\s/.test(text[j])) j++;
  if (j >= text.length) return true;
  const next = text[j];
  if (!/[\p{Lu}\p{N}("'\[“‘]/u.test(next)) return false;

  if (text[dot] !== '.') return true; // "!" and "?" end sentences without the abbreviation test
  let k = dot - 1;
  while (k >= 0 && isWordChar(text[k])) k--;
  const word = text.slice(k + 1, dot);
  // Author initial "J.". Known limitation: a sentence ending in a lone capital ("condition B.")
  // reads as an initial and is joined to the next sentence, so the span runs one sentence long.
  if (word.length === 1 && /\p{Lu}/u.test(word)) return false;
  if (ABBREVIATIONS.has(word.toLowerCase())) return false;
  return true;
}

/** Offset just after the sentence end at or after `from`, or -1 if none within `limit`. */
function nextBoundary(text: string, from: number, limit: number): number {
  for (let i = from; i < limit; i++) {
    const ch = text[i];
    if ((ch === '.' || ch === '!' || ch === '?') && periodEndsSentence(text, i)) {
      let j = i + 1 + superscriptRunAfter(text, i);
      while (j < text.length && CLOSERS.has(text[j])) j++;
      return j;
    }
    if (ch === '\n' || ch === '\r') {
      // A paragraph break ends the sentence at the last non-space character before it.
      if (paragraphBreakAt(text, i) > 0) {
        let e = i;
        while (e > from && /\s/.test(text[e - 1])) e--;
        return e;
      }
    }
  }
  return -1;
}

/**
 * Start of the sentence containing `pos`, or -1 if none within `limit` characters back. A
 * sentence starts after a sentence end or after a paragraph break.
 */
function sentenceStartBefore(text: string, pos: number, limit: number): { start: number; afterParagraph: boolean } | null {
  for (let i = pos - 1; i >= limit; i--) {
    const ch = text[i];
    if ((ch === '.' || ch === '!' || ch === '?') && periodEndsSentence(text, i)) {
      let j = i + 1 + superscriptRunAfter(text, i);
      while (j < text.length && CLOSERS.has(text[j])) j++;
      while (j < pos && /\s/.test(text[j])) j++;
      if (j <= pos) return { start: j, afterParagraph: false };
    }
    if (ch === '\n') {
      // Is there a blank line ending at i?  Look back for "\n<ws>*\n".
      let k = i - 1;
      while (k >= 0 && (text[k] === ' ' || text[k] === '\t' || text[k] === '\r')) k--;
      if (k >= 0 && text[k] === '\n') {
        let j = i + 1;
        while (j < pos && /\s/.test(text[j])) j++;
        return { start: j, afterParagraph: true };
      }
    }
  }
  if (limit <= 0) {
    let j = 0;
    while (j < pos && /\s/.test(text[j])) j++;
    return { start: j, afterParagraph: true };
  }
  return null;
}

/** Words in `s` after removing the citation's own characters. */
function ownWordCount(sentence: string, citeInSentence: string): number {
  const rest = sentence.replace(citeInSentence, ' ').replace(/[()[\]]/g, ' ');
  return (rest.match(/[\p{L}]{2,}/gu) || []).length;
}

/**
 * Find the claim span for a citation at `[citeStart, citeEnd)` in `text`.
 *
 * The span is the sentence containing the citation, plus the sentence before it when the
 * citing sentence opens with a continuation word ("This", "However", "For example", ...) or has
 * fewer than four words of its own besides the citation. The previous sentence is never taken
 * across a paragraph break. When no boundary is found within 500 characters on a side (tables,
 * reference-like runs), the span is capped there and `truncated` is set.
 *
 * @throws RangeError when the positions are outside the text or reversed.
 */
export function findClaimSpan(text: string, citeStart: number, citeEnd: number): ClaimSpan {
  if (!(citeStart >= 0 && citeEnd >= citeStart && citeEnd <= text.length)) {
    throw new RangeError(`citation positions [${citeStart}, ${citeEnd}) are outside the text (length ${text.length})`);
  }
  let truncated = false;

  const back = sentenceStartBefore(text, citeStart, Math.max(0, citeStart - MAX_REACH));
  let sentenceStart: number;
  let afterParagraph = false;
  if (back) {
    sentenceStart = back.start;
    afterParagraph = back.afterParagraph;
  } else {
    sentenceStart = Math.max(0, citeStart - MAX_REACH);
    truncated = true;
  }

  const forwardLimit = Math.min(text.length, citeEnd + MAX_REACH);
  // A superscript citation printed after the period ("kcal/d.3-5") closes the sentence it follows.
  const trailsPeriod = citeStart > 0 && superscriptRunAfter(text, citeStart - 1) >= citeEnd - citeStart;
  let end = trailsPeriod ? citeEnd : nextBoundary(text, citeEnd, forwardLimit);
  if (end < 0) {
    if (forwardLimit >= text.length) {
      end = text.length;
      while (end > citeEnd && /\s/.test(text[end - 1])) end--;
    } else {
      end = forwardLimit;
      truncated = true;
    }
  }

  const citing = text.slice(sentenceStart, end);
  const citeText = text.slice(citeStart, citeEnd);
  const leans = CONTINUATION_OPENER.test(citing) || ownWordCount(citing, citeText) < MIN_OWN_WORDS;

  let start = sentenceStart;
  let includesPrevious = false;
  if (leans && !afterParagraph && !truncated && sentenceStart > 0) {
    // Step back over the whitespace, closers and terminal mark that end the previous sentence,
    // so the search starts INSIDE it rather than finding its own end.
    let p = sentenceStart;
    while (p > 0 && /\s/.test(text[p - 1])) p--;
    while (p > 0 && CLOSERS.has(text[p - 1])) p--;
    // ...and over a superscript citation printed after that sentence's period ("kcal/d.3-5").
    let q = p;
    while (q > 0 && /[0-9,–—-]/.test(text[q - 1])) q--;
    if (q < p && q > 0 && superscriptRunAfter(text, q - 1) === p - q) p = q;
    while (p > 0 && /[.!?]/.test(text[p - 1])) p--;
    const prev = sentenceStartBefore(text, p, Math.max(0, p - MAX_REACH));
    if (prev && prev.start < sentenceStart) {
      start = prev.start;
      includesPrevious = true;
    }
  }

  return { start, end, citingSentenceStart: sentenceStart, includesPrevious, truncated };
}
