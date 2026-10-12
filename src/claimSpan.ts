/**
 * The sentence(s) an in-text citation is tied to.
 *
 * A detection's `context` is a fixed character window, which is fine for matching and wrong for
 * a reader: it starts and ends mid-word and mid-claim. `findClaimSpan` returns sentence
 * boundaries instead, so a reader (or a downstream check) sees what the author actually says
 * about the cited work.
 *
 * A wrong span is worse than a short one: a span holding a different claim than the one the
 * citation supports misattributes words to the author. So every rule below errs towards ending
 * a sentence when the evidence is ambiguous, and the span is capped (`truncated`) rather than
 * stretched when no boundary is found.
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

/** Abbreviations that never end a sentence (compared lower-cased, without the final period). */
const ALWAYS_ABBREVIATION = new Set([
  'al', 'e.g', 'i.e', 'cf', 'vs', 'viz', 'fig', 'figs', 'tab', 'eq', 'eqs', 'eqn', 'ref', 'refs',
  'ex', 'pp', 'vol', 'vols', 'ch', 'chap', 'para', 'art', 'approx', 'ca', 'resp', 'esp', 'incl',
  'excl', 'dr', 'mr', 'mrs', 'ms', 'prof', 'st', 'ph.d', 'm.d', 'b.a', 'b.sc', 'm.sc', 'jan', 'feb',
  'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

/**
 * Abbreviations that also occur as the last word of a sentence ("yes or no.", "from the U.S.",
 * "by Pfizer Inc."). They end the sentence when a capitalised word or a quote follows, and do
 * not when a number, a bracket or lowercase text follows ("no. 3", "p. 12", "U.S. (Smith, 2020)").
 */
const WEAK_ABBREVIATION = new Set([
  'no', 'nos', 'sec', 'm', 'n', 'p', 'se', 'sd', 'co', 'inc', 'ltd', 'corp', 'ed', 'eds', 'rev',
  'exp', 'expt', 'u.s', 'u.k', 'jr', 'sr', 'etc', 'trans', 'suppl', 'dept', 'univ', 'n.d', 'pt',
  'appx',
]);

/**
 * Openers that make a sentence depend on the one before it: the claim being cited is (partly)
 * stated there. Matched at the very start of the citing sentence, case-sensitively.
 */
const CONTINUATION_OPENER =
  /^(?:This|These|That|Those|Such|It|They|Their|Its|He|She|Both|Another|The latter|The former|The same|However|Moreover|Furthermore|Further|Additionally|In addition|Also|Indeed|Thus|Therefore|Hence|Consequently|Accordingly|Similarly|Likewise|Conversely|In contrast|By contrast|Nevertheless|Nonetheless|Yet|But|And|Specifically|In particular|Notably|For example|For instance|Taken together|Consistent with|In line with|Relatedly)\b/;

/**
 * Openers that look like continuations but introduce a new, self-contained claim: dummy "it"
 * with a that/to clause, existential "there", and restrictive "those who".
 */
const NON_ANAPHORIC_OPENER =
  /^(?:It(?:'s| is| was| has been| had been| seems| seemed| appears| appeared| remains| remained| should be| must be| can be| may be| might be| would be| will be)\s+(?:\S+\s+){0,3}?(?:that|to|whether|how|why|what|if)\b|There\b|Those (?:who|with|that|which|whose)\b|Such as\b|That is\b|It\s+(?:is|was)\s+(?:not\s+)?(?:clear|unclear|known|unknown|possible|likely|unlikely|important|necessary|noteworthy|worth)\b)/;

const CLOSERS = /[)\]"'”’]/;
const SENTENCE_OPENER = /[\p{Lu}\p{N}"'(\[“‘]/u;

/** A citation marker printed right after a sentence's period: [12], (12), 3-5, or Unicode superscripts. */
const ATTACHED_MARKER = /^(?:\[[0-9][0-9,\s–—-]*\]|\([0-9][0-9,\s–—-]*\)|[0-9][0-9,–—-]*|[¹²³⁰-⁹⁻,–-]+)/;

const isSpace = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);

/** The word ending just before `dot`: letters, digits and inner periods ("e.g", "U.S", "J.A"). */
function wordBefore(text: string, dot: number): { word: string; start: number } {
  let k = dot - 1;
  while (k >= 0 && /[\p{L}\p{N}.]/u.test(text[k])) k--;
  return { word: text.slice(k + 1, dot), start: k + 1 };
}

/** Next whitespace-delimited token at or after `i` (skipping leading whitespace). */
function tokenAt(text: string, i: number): { tok: string; end: number } {
  while (i < text.length && isSpace(text[i])) i++;
  let j = i;
  while (j < text.length && !isSpace(text[j])) j++;
  return { tok: text.slice(i, j), end: j };
}

/** Previous whitespace-delimited token ending before `i`. */
function tokenBefore(text: string, i: number): string {
  let j = i;
  while (j > 0 && isSpace(text[j - 1])) j--;
  let k = j;
  while (k > 0 && !isSpace(text[k - 1])) k--;
  return text.slice(k, j);
}

const INITIAL = /^(?:\p{Lu}\.)+$/u;

/**
 * True when the capital(s) before `dot` are author initials rather than the last word of a
 * sentence ("vitamin D.", "Group A."). Initials need evidence: a surname with a comma before
 * them ("Smith, J."), another initial next to them ("J. K."), or a surname after them that is
 * itself followed by a citation-like token ("J. Smith (2001)", "J. Smith, …", "J. Smith and").
 */
function isInitial(text: string, wordStart: number, dot: number): boolean {
  const prev = tokenBefore(text, wordStart);
  if (/^\p{Lu}[\p{L}'-]+,$/u.test(prev)) return true;
  if (INITIAL.test(prev)) return true;
  const next = tokenAt(text, dot + 1);
  if (INITIAL.test(next.tok)) return true;
  if (/^\p{Lu}[\p{L}'-]+[,)]?$/u.test(next.tok)) {
    if (/,$/.test(next.tok)) return true;
    const after = tokenAt(text, next.end).tok;
    if (/^(?:\(|\[|et$|and$|&$)/.test(after)) return true;
  }
  return false;
}

interface Boundary {
  /** Offset just after the sentence's last character (terminator, closers, attached marker). */
  end: number;
  /** Offset where the next sentence starts (after whitespace). */
  next: number;
  /** True for a paragraph break or a heading line; a previous sentence is never taken across one. */
  paragraph: boolean;
}

/** If the period/!/? at `i` ends a sentence, the boundary; else null. */
function terminatorBoundary(text: string, i: number): Boundary | null {
  const ch = text[i];
  let j = i + 1;
  while (j < text.length && CLOSERS.test(text[j])) j++;

  let wordInfo: { word: string; start: number } | null = null;
  let abbrevKind: 'always' | 'weak' | 'initial' | null = null;
  if (ch === '.') {
    wordInfo = wordBefore(text, i);
    const w = wordInfo.word.toLowerCase();
    if (ALWAYS_ABBREVIATION.has(w)) abbrevKind = 'always';
    else if (WEAK_ABBREVIATION.has(w)) abbrevKind = 'weak';
    else if (/^(?:\p{Lu}\.)*\p{Lu}$/u.test(wordInfo.word) && isInitial(text, wordInfo.start, i)) abbrevKind = 'initial';
  }
  if (abbrevKind === 'always' || abbrevKind === 'initial') return null;

  // A citation marker glued to the terminator ("replicate.[12] Then", "kcal/d.3-5 Moreover").
  if (j === i + 1 && abbrevKind === null && i > 0 && /[\p{L})\]]/u.test(text[i - 1])) {
    const m = ATTACHED_MARKER.exec(text.slice(j, j + 40));
    if (m) {
      let k = j + m[0].length;
      if (k < text.length && isSpace(text[k])) {
        while (k < text.length && isSpace(text[k])) k++;
        if (k >= text.length || /[\p{Lu}"'“(\[]/u.test(text[k])) {
          return { end: j + m[0].length, next: k, paragraph: false };
        }
      }
    }
  }

  if (j < text.length && !isSpace(text[j])) return null; // "0.45", "e.g.,", "U.S.-based"
  let k = j;
  while (k < text.length && isSpace(text[k])) k++;
  if (k >= text.length) return { end: j, next: k, paragraph: false };
  const nextCh = text[k];
  if (!SENTENCE_OPENER.test(nextCh)) return null;
  if (abbrevKind === 'weak' && !/[\p{Lu}"'“‘]/u.test(nextCh)) return null;
  const paragraph = /\n[^\S\n]*\n/.test(text.slice(j, k));
  return { end: j, next: k, paragraph };
}

/** True when `line` reads as a section heading: short, unpunctuated, numbered or title-cased. */
function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!t || /[.!?:;,]$/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 8) return false;
  if (/^(?:\d+(?:\.\d+)*\.?|[IVX]+\.)\s+\S/.test(t)) return true;
  return words.every((w) => /^[\p{Lu}\p{N}]/u.test(w) || /^(?:and|of|the|in|for|on|to|a|an|with|or)$/.test(w));
}

/**
 * True when the text at `pos`, after skipping up to four short heading-like lines (page numbers,
 * running heads, a journal name), continues in lowercase: the sentence runs on across the page.
 */
function lowercaseAfterFurniture(text: string, pos: number): boolean {
  let p = pos;
  for (let hops = 0; hops <= 4 && p < text.length; hops++) {
    if (/\p{Ll}/u.test(text[p])) return true;
    const nl = text.indexOf('\n', p);
    if (nl < 0 || !isHeadingLine(text.slice(p, nl))) return false;
    p = nl + 1;
    while (p < text.length && isSpace(text[p])) p++;
  }
  return false;
}

/**
 * All sentence boundaries whose terminator lies in [from, to): terminal punctuation, blank lines
 * (any whitespace-only line), and the line breaks around a heading line. A blank line is not a
 * boundary when the text before it has no terminator and lowercase text follows (a page break
 * inside a sentence).
 */
function boundariesIn(text: string, from: number, to: number): Boundary[] {
  const out: Boundary[] = [];
  for (let i = from; i < to; i++) {
    const ch = text[i];
    if (ch === '.' || ch === '!' || ch === '?') {
      const b = terminatorBoundary(text, i);
      if (b) { out.push(b); i = Math.max(i, b.end - 1); }
      continue;
    }
    if (ch !== '\n') continue;

    // Blank line starting here?
    const blank = /^\n[^\S\n]*\n\s*/.exec(text.slice(i, i + 200));
    if (blank) {
      let e = i;
      while (e > 0 && isSpace(text[e - 1])) e--;
      const next = i + blank[0].length;
      // A blank line after unfinished text is a page or column break inside a sentence, unless
      // the line before it is a heading ("Method\n\nParticipants…"). A heading-like line followed
      // by lowercase text is page furniture (a page number, a running head) inside a sentence.
      const lastLine = text.slice(text.lastIndexOf('\n', e - 1) + 1, e);
      const unfinished = e > 0 && !/[.!?)\]"'”’:]/.test(text[e - 1]);
      const lowerNext = lowercaseAfterFurniture(text, next);
      const continues = unfinished && (!isHeadingLine(lastLine) || lowerNext);
      if (!continues && !out.some((b) => b.next === next)) out.push({ end: e, next, paragraph: true });
      i = next - 1;
      continue;
    }

    // Heading line between two single line breaks: break before and after it.
    const lineEnd = text.indexOf('\n', i + 1);
    if (lineEnd > 0) {
      const line = text.slice(i + 1, lineEnd);
      let e = i;
      while (e > 0 && isSpace(text[e - 1])) e--;
      const prevEnds = e === 0 || /[.!?)\]"'”’]/.test(text[e - 1]);
      let n = lineEnd + 1;
      while (n < text.length && isSpace(text[n])) n++;
      if (prevEnds && isHeadingLine(line) && n < text.length && /\p{Lu}/u.test(text[n])) {
        let hs = i + 1;
        while (hs < lineEnd && isSpace(text[hs])) hs++;
        let he = lineEnd;
        while (he > hs && isSpace(text[he - 1])) he--;
        if (!out.some((b) => b.next === hs)) out.push({ end: e, next: hs, paragraph: true });
        out.push({ end: he, next: n, paragraph: true });
        i = lineEnd;
      }
    }
  }
  out.sort((a, b) => a.next - b.next);
  return out;
}

/** Words of the citing sentence once the bracket group holding the citation and filler are removed. */
function ownWordCount(text: string, sentStart: number, sentEnd: number, citeStart: number, citeEnd: number): number {
  // Widen the citation to its enclosing bracket group, if any, within the sentence.
  let gs = citeStart;
  let ge = citeEnd;
  const open = Math.max(text.lastIndexOf('(', citeStart), text.lastIndexOf('[', citeStart));
  if (open >= sentStart) {
    const closeCh = text[open] === '(' ? ')' : ']';
    const close = text.indexOf(closeCh, Math.max(citeEnd - 1, open));
    if (close >= 0 && close < sentEnd) { gs = open; ge = close + 1; }
  }
  const rest = (text.slice(sentStart, gs) + ' ' + text.slice(ge, sentEnd))
    .replace(/\b(?:see|cf|e\.g|i\.e|also|et al)\b\.?/gi, ' ');
  return (rest.match(/\p{L}{2,}/gu) || []).length;
}

/**
 * Find the claim span for a citation at `[citeStart, citeEnd)` in `text`.
 *
 * The span is the sentence containing the citation, plus the sentence before it when the citing
 * sentence opens with a continuation word ("This", "However", "For example", ...) or has at most
 * one word of its own besides the citation's bracket group. A bare citation printed after a
 * sentence's period ("…replicate. [12] Next") belongs to that sentence. The previous sentence is
 * never taken across a paragraph break or a heading. When no boundary is found within 500
 * characters on a side (tables, reference-like runs), the span is capped there and `truncated`
 * is set.
 *
 * @throws RangeError when the positions are outside the text or reversed.
 */
export function findClaimSpan(text: string, citeStart: number, citeEnd: number): ClaimSpan {
  if (!(citeStart >= 0 && citeEnd >= citeStart && citeEnd <= text.length)) {
    throw new RangeError(`citation positions [${citeStart}, ${citeEnd}) are outside the text (length ${text.length})`);
  }
  const lo = Math.max(0, citeStart - 2 * MAX_REACH);
  const hi = Math.min(text.length, citeEnd + MAX_REACH);
  // Boundaries strictly inside the citation (a period in "2003." of "(See X, 2003.)") are ignored.
  const bs = boundariesIn(text, lo, hi).filter((b) => !(b.end > citeStart && b.end < citeEnd));
  let truncated = false;

  // Sentence containing the citation: after the last boundary that starts a sentence at or before it.
  const beforeIdx = (() => { let r = -1; bs.forEach((b, k) => { if (b.next <= citeStart) r = k; }); return r; })();
  let sentStart: number;
  if (beforeIdx >= 0 && bs[beforeIdx].next >= citeStart - MAX_REACH) sentStart = bs[beforeIdx].next;
  else if (citeStart - MAX_REACH <= 0) { sentStart = 0; while (sentStart < citeStart && isSpace(text[sentStart])) sentStart++; }
  else { sentStart = citeStart - MAX_REACH; truncated = true; }
  const startsAtParagraph = beforeIdx < 0 ? true : bs[beforeIdx].paragraph;

  const after = bs.find((b) => b.end >= citeEnd && b.next > citeStart);
  let end: number;
  if (after) end = after.end;
  else if (hi >= text.length) { end = text.length; while (end > citeEnd && isSpace(text[end - 1])) end--; }
  else { end = hi; truncated = true; }

  // Previous sentence, if one exists in reach and no paragraph break separates it.
  const prevStart = (): number | null => {
    if (truncated || startsAtParagraph || beforeIdx < 0) return null;
    const p = beforeIdx > 0 ? bs[beforeIdx - 1].next : 0;
    if (p >= sentStart || sentStart - p > MAX_REACH) return null;
    let s = p;
    while (s < sentStart && isSpace(text[s])) s++;
    return s;
  };

  // A bare citation that opens its "sentence" and is followed by a new sentence belongs to the
  // sentence before it.
  const bare = /^[([\p{N}¹²³⁰-⁹]/u.test(text[citeStart] ?? '');
  if (sentStart === citeStart && bare) {
    let k = citeEnd;
    while (k < text.length && isSpace(text[k])) k++;
    if (k >= text.length || !/\p{Ll}/u.test(text[k])) {
      const p = prevStart();
      if (p !== null) {
        let e = citeEnd;
        while (e < text.length && /[.!?;]/.test(text[e])) e++;
        while (e < text.length && CLOSERS.test(text[e])) e++;
        return { start: p, end: e, citingSentenceStart: sentStart, includesPrevious: true, truncated };
      }
    }
  }

  const citing = text.slice(sentStart, end);
  const opener = CONTINUATION_OPENER.test(citing) && !NON_ANAPHORIC_OPENER.test(citing);
  const leans = opener || ownWordCount(text, sentStart, end, citeStart, citeEnd) <= 1;

  let start = sentStart;
  let includesPrevious = false;
  if (leans) {
    const p = prevStart();
    if (p !== null) { start = p; includesPrevious = true; }
  }
  return { start, end, citingSentenceStart: sentStart, includesPrevious, truncated };
}
