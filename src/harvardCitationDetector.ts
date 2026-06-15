/**
 * Harvard/ASA Citation Detection Module
 * Detects author-year citations WITHOUT comma: (Author Year)
 *
 * Key differences from APA:
 *   APA:     (Smith, 2020)   (Smith & Jones, 2020)   (Smith et al., 2020)
 *   Harvard: (Smith 2020)    (Smith & Jones 2020)    (Smith et al. 2020)
 *
 * Narrative citations like "Smith (2020)" are identical to APA.
 */

import {
  DetectedCitation,
  ParsedCitationAuthor,
  CitationType,
  normalizeText,
} from './citationDetector.js';

// ── helpers ──────────────────────────────────────────────────────────────

function createAuthor(raw: string, isEtAl = false): ParsedCitationAuthor {
  // Strip a trailing possessive (`Barr's` / `Jones'` — straight or curly apostrophe)
  // so the in-text surname keys on the bare name ("barr"), matching the gold + the
  // reference. No real surname ends in apostrophe-s, so this is unconditional.
  const trimmed = raw.trim().replace(/['‘’]s?$/, '');
  const isOrg = /^[A-Z]{2,}$/.test(trimmed);
  return {
    raw: trimmed,
    normalized: normalizeText(trimmed),
    isEtAl,
    isOrganization: isOrg,
    abbreviation: isOrg ? trimmed.toUpperCase() : undefined,
  };
}

function extractContext(text: string, pos: number, len: number): string {
  const r = 100;
  return text.slice(Math.max(0, pos - r), Math.min(text.length, pos + len + r));
}

function parseYear(s: string): { year: string; suffix?: string } {
  const m = s.match(/^(\d{4})([a-z])?$/i);
  if (m) return { year: m[1], suffix: m[2]?.toLowerCase() };
  if (s.toLowerCase() === 'n.d.' || s.toLowerCase() === 'in press') return { year: s.toLowerCase() };
  return { year: s };
}

function classify(authors: ParsedCitationAuthor[]): CitationType {
  if (authors.some(a => a.isEtAl)) return 'et_al';
  if (authors.length === 1 && authors[0].isOrganization) return 'group';
  if (authors.length === 1) return 'single';
  if (authors.length === 2) return 'two_authors';
  return 'et_al';
}

/** Words that are commonly false-positive narrative matches */
const COMMON_WORDS = new Set([
  'the', 'this', 'that', 'these', 'those', 'their', 'there', 'where', 'when',
  'while', 'which', 'what', 'with', 'from', 'into', 'upon', 'about', 'after',
  'before', 'between', 'through', 'during', 'without', 'within', 'among',
  'along', 'across', 'behind', 'beyond', 'under', 'over', 'above', 'below',
  'around', 'toward', 'towards', 'against', 'throughout', 'despite',
  'figure', 'table', 'section', 'chapter', 'study', 'research', 'analysis',
  'results', 'method', 'discussion', 'conclusion', 'introduction', 'abstract',
  'however', 'therefore', 'furthermore', 'moreover', 'nevertheless',
  'although', 'whereas', 'because', 'since', 'unless', 'until',
  'also', 'like', 'unlike', 'see', 'following', 'including', 'notably',
  'specifically', 'particularly', 'especially', 'given', 'except',
  // narrative lead-in: guards the prefix-leak the page-locator tolerance exposes,
  // e.g. "According to Barr's (2009, 44)" mis-keying the citation to "according"
  'according',
]);

// ── shared surname fragments (composed into every matcher below; DRY) ─────
// A surname mis-captured at its LEFT boundary keys the citation to the wrong
// author, so it matches neither the gold nor its reference (bjps_1 H2, cycle 2).
// The previous sub-pattern only spanned a multi-token surname joined by a
// LOWERCASE particle ("Smith van Berg"), so three real surname shapes fell
// through to the LAST token: a CAPITALIZED particle ("El Soufi",
// "Van Staalduinen"), a bare double surname ("Santos Silva"), and a hyphen-cap
// compound ("Rhodes-Purdy"). The fragments below capture all three. Define once,
// compose with `new RegExp` — the fragment repeats ~11× across the matchers.

/** A single surname token, including hyphen-cap compounds ("Rhodes-Purdy"). The
 *  char class no longer carries the hyphen (it stopped at the uppercase after
 *  it); an explicit compound group crosses into the capitalized continuation. */
const CORE = String.raw`[A-ZÀ-Ÿ][a-zà-ÿā-ž']+(?:-[A-Za-zÀ-ÿ][a-zà-ÿā-ž']*)*`;

/** Inter-token separator WITHIN a multi-token surname: horizontal whitespace
 *  plus at most a SINGLE line break (a line-wrapped name, e.g. "Colantone and\n
 *  Stanig"). It deliberately does NOT cross a blank line (`\n\n`). A flattened
 *  table stacks a column heading above the citation, separated by a blank line
 *  ("Import exposure\n\nColantone and Stanig (2018b)"); a plain `\s+` lets the
 *  multi-token surname swallow the heading and key the citation on it
 *  ("importex" instead of "colanton"). Anchoring the surname span at the
 *  blank-line boundary keeps the heading out (bjps_1 H2-C). */
const SEP = String.raw`(?:[^\S\r\n]+(?:\r?\n[^\S\r\n]*)?|\r?\n[^\S\r\n]*)`;

/** Capitalized nobiliary / compound-surname prefixes ("El Soufi",
 *  "Van Staalduinen", "Santos Silva", "De Vries"). A WHITELIST is required: a
 *  bare cap+cap extension would absorb a preceding capitalized sentence word
 *  ("As Smith and Jones" → first author "As Smith"), regressing every narrative
 *  citation that opens a sentence. Lowercase particles ("Smith van Berg") are
 *  handled separately by the infix branch in SURNAME, so this list is only the
 *  Title-cased prefixes that directly precede a capitalized surname. */
const CAP_PARTICLE = String.raw`(?:El|Van|Von|De|Del|Della|Den|Der|Des|Di|Da|Das|Dos|Du|La|Le|Lo|Las|Los|San|Santa|Santos|Saint|St|Mac|Mc|Ten|Ter)`;

/** Lowercase nobiliary particles joining a surname ("Smith van Berg"). The infix
 *  MUST be a known particle, never any lowercase word: `[a-z]+` would absorb a
 *  capitalized lead-in's connector ("According to Barr's" captured as one surname
 *  starting at "According", then dropped by COMMON_WORDS — or worse, keyed on the
 *  lead-in in `narrativeTwo`, which has no such guard). Mirrors the worker's
 *  pre-detection particle list. */
const LC_PARTICLE = String.raw`(?:van|von|de|del|della|den|der|des|di|da|das|do|dos|du|la|le|lo|las|los|el|al|y|e|ten|ter)`;

/** One author's full surname: an optional capitalized particle, the core token,
 *  and an optional lowercase-PARTICLE infix ("Smith van Berg"). Covers
 *  particle-led ("El Soufi"), double ("Santos Silva"), hyphen-cap
 *  ("Rhodes-Purdy", via CORE) and lowercase-infix surnames. Every extension is
 *  optional and backtracks, so a bare "De" / "Della" still parses as a plain
 *  single surname when not followed by a capitalized token. */
const SURNAME = String.raw`(?:${CAP_PARTICLE}${SEP})?${CORE}(?:${SEP}${LC_PARTICLE}${SEP}${CORE})?`;

/** A name RUN: a surname optionally joined to 1–2 more surnames by `and`/`&`
 *  ONLY. Used by the single-author matchers so their span COINCIDES with the
 *  earlier-added two-/three-author span and is position-deduped — otherwise a
 *  contained second surname ("Silva" inside "Barros and Santos Silva") survives
 *  as a spurious single. Joining on `and`/`&` (never a bare space) is what keeps
 *  a leading sentence word ("As Smith and Jones") from being swallowed. */
const NAME_RUN = String.raw`${SURNAME}(?:${SEP}(?:&|and)${SEP}${SURNAME}){0,2}`;

/** Year with optional letter suffix or n.d. — a CAPTURE group. */
const YEAR = String.raw`(\d{4}[a-z]?|n\.d\.)`;

/** Optional trailing page locator after the year, e.g. ", 513" / ", S5" /
 *  ", 43-5" / ", p. 15" / ", pp. 15-20". Harvard frequently omits the p./pp.
 *  prefix, which every year-anchored pattern previously rejected — so any
 *  in-text citation carrying a bare page was missed entirely (bjps_1 H2 cycle 1).
 *  Non-capturing. */
const PAGE = String.raw`(?:\s*,\s*(?:pp?\.\s*)?[A-Z]?\d+(?:\s*[–\-]\s*\d+)?)?`;

// ── Harvard parenthetical patterns (no comma before year) ────────────────
const HARVARD_PATTERNS = {
  // (Smith 2020) / (Santos Silva 2020a) / (Smith n.d.) — NAME_RUN so a paren
  // two-/three-author span is captured as one span and deduped against it.
  single: new RegExp(String.raw`\(\s*(${NAME_RUN})\s+${YEAR}${PAGE}\s*\)`, 'gi'),

  // (Smith & Jones 2020) / (Barros and Santos Silva 2020) / (Kurer and Van Staalduinen 2022)
  twoAuthor: new RegExp(String.raw`\(\s*(${SURNAME})\s+(?:&|and)\s+(${SURNAME})\s+${YEAR}${PAGE}\s*\)`, 'gi'),

  // (Author, Author, and Author Year) — ASA 3+ author style
  threeAuthor: new RegExp(String.raw`\(\s*(${SURNAME}(?:,\s+${SURNAME})*),?\s+and\s+(${SURNAME})\s+${YEAR}${PAGE}\s*\)`, 'gi'),

  // (Smith et al. 2020) / (Rhodes-Purdy et al. 2020)
  etAl: new RegExp(String.raw`\(\s*(${CORE})\s+et\s*\.?\s*al\.?\s+${YEAR}${PAGE}\s*\)`, 'gi'),

  // (Smith 2020, p. 15) or (Smith 2020, pp. 15-20)
  singleWithPage: new RegExp(String.raw`\(\s*(${SURNAME})\s+(\d{4}[a-z]?)\s*,\s*(pp?\.\s*[\d–\-]+)\s*\)`, 'gi'),

  // Multiple in one: (Smith 2020; Jones 2019)
  multiple: /\(\s*([^)]+;\s*[^)]+)\s*\)/g,
};

// ── main detection ──────────────────────────────────────────────────────

export function detectHarvardCitations(text: string): DetectedCitation[] {
  const citations: DetectedCitation[] = [];
  const processedPositions = new Set<string>();

  function add(c: DetectedCitation): void {
    const k = `${c.position.start}-${c.position.end}`;
    if (!processedPositions.has(k)) {
      processedPositions.add(k);
      citations.push(c);
    }
  }

  let m: RegExpExecArray | null;

  // ── Et al. ──
  HARVARD_PATTERNS.etAl.lastIndex = 0;
  while ((m = HARVARD_PATTERNS.etAl.exec(text)) !== null) {
    const { year, suffix } = parseYear(m[2]);
    add({
      raw: m[0],
      normalized: m[0].replace(/\s+/g, ' ').trim(),
      type: 'et_al',
      citationStyle: 'parenthetical',
      authors: [createAuthor(m[1]), createAuthor('et al.', true)],
      year,
      yearSuffix: suffix,
      position: { start: m.index, end: m.index + m[0].length },
      context: extractContext(text, m.index, m[0].length),
    });
  }

  // ── Three+ authors (ASA style: Author, Author, and Author Year) ──
  HARVARD_PATTERNS.threeAuthor.lastIndex = 0;
  while ((m = HARVARD_PATTERNS.threeAuthor.exec(text)) !== null) {
    const { year, suffix } = parseYear(m[3]);
    // Parse all comma-separated authors + the last "and" author
    const authorList = m[1].split(/,\s+/).map(a => createAuthor(a.trim()));
    authorList.push(createAuthor(m[2]));
    add({
      raw: m[0],
      normalized: m[0].replace(/\s+/g, ' ').trim(),
      type: 'two_authors', // Use two_authors type for matching compatibility
      citationStyle: 'parenthetical',
      authors: authorList,
      year,
      yearSuffix: suffix,
      position: { start: m.index, end: m.index + m[0].length },
      context: extractContext(text, m.index, m[0].length),
    });
  }

  // ── Two authors ──
  HARVARD_PATTERNS.twoAuthor.lastIndex = 0;
  while ((m = HARVARD_PATTERNS.twoAuthor.exec(text)) !== null) {
    const { year, suffix } = parseYear(m[3]);
    add({
      raw: m[0],
      normalized: m[0].replace(/\s+/g, ' ').trim(),
      type: 'two_authors',
      citationStyle: 'parenthetical',
      authors: [createAuthor(m[1]), createAuthor(m[2])],
      year,
      yearSuffix: suffix,
      position: { start: m.index, end: m.index + m[0].length },
      context: extractContext(text, m.index, m[0].length),
    });
  }

  // ── Single with page ──
  HARVARD_PATTERNS.singleWithPage.lastIndex = 0;
  while ((m = HARVARD_PATTERNS.singleWithPage.exec(text)) !== null) {
    const { year, suffix } = parseYear(m[2]);
    add({
      raw: m[0],
      normalized: m[0].replace(/\s+/g, ' ').trim(),
      type: 'single',
      citationStyle: 'parenthetical',
      authors: [createAuthor(m[1])],
      year,
      yearSuffix: suffix,
      pageNumbers: m[3],
      position: { start: m.index, end: m.index + m[0].length },
      context: extractContext(text, m.index, m[0].length),
    });
  }

  // ── Single ──
  HARVARD_PATTERNS.single.lastIndex = 0;
  while ((m = HARVARD_PATTERNS.single.exec(text)) !== null) {
    const { year, suffix } = parseYear(m[2]);
    const authors = [createAuthor(m[1])];
    add({
      raw: m[0],
      normalized: m[0].replace(/\s+/g, ' ').trim(),
      type: classify(authors),
      citationStyle: 'parenthetical',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: m.index, end: m.index + m[0].length },
      context: extractContext(text, m.index, m[0].length),
    });
  }

  // ── Multiple (semicolon-separated) ──
  HARVARD_PATTERNS.multiple.lastIndex = 0;
  while ((m = HARVARD_PATTERNS.multiple.exec(text)) !== null) {
    const posKey = `${m.index}-${m.index + m[0].length}`;
    if (processedPositions.has(posKey)) continue;

    const parts = m[1].split(';').map(s => s.trim());
    let pos = m.index + 1;
    for (const part of parts) {
      // Try et al.: "Author et al. Year"
      const etAlMatch = part.match(new RegExp(String.raw`^(${CORE})\s+et\s*\.?\s*al\.?\s+${YEAR}${PAGE}$`, 'i'));
      // Try two-author: "Author & Author Year" or "Author and Author Year"
      const twoMatch = part.match(new RegExp(String.raw`^(${SURNAME})\s+(?:&|and)\s+(${SURNAME})\s+${YEAR}${PAGE}$`, 'i'));
      // Try multi-author: "Author, Author, and Author Year"
      const multiMatch = part.match(new RegExp(String.raw`^(${SURNAME}(?:,\s*${SURNAME})*,?\s+and\s+${SURNAME})\s+${YEAR}${PAGE}$`, 'i'));
      // Try single: "Author Year"
      const singleMatch = part.match(new RegExp(String.raw`^(${NAME_RUN})\s+${YEAR}${PAGE}$`, 'i'));

      let authors: ParsedCitationAuthor[] = [];
      let yearStr = '';

      if (etAlMatch) {
        authors = [createAuthor(etAlMatch[1]), createAuthor('et al.', true)];
        yearStr = etAlMatch[2];
      } else if (twoMatch) {
        authors = [createAuthor(twoMatch[1]), createAuthor(twoMatch[2])];
        yearStr = twoMatch[3];
      } else if (multiMatch) {
        // Extract individual authors from comma/and-separated list
        const authNames = multiMatch[1].split(/,\s+and\s+|,\s+|\s+and\s+/).filter(s => s.trim());
        authors = authNames.map(n => createAuthor(n));
        yearStr = multiMatch[2];
      } else if (singleMatch) {
        authors = [createAuthor(singleMatch[1])];
        yearStr = singleMatch[2];
      }

      if (authors.length > 0 && yearStr) {
        const { year, suffix } = parseYear(yearStr);
        add({
          raw: `(${part})`,
          normalized: `(${part})`,
          type: classify(authors),
          citationStyle: 'parenthetical',
          authors,
          year,
          yearSuffix: suffix,
          position: { start: pos, end: pos + part.length },
          context: extractContext(text, pos, part.length),
        });
      }
      pos += part.length + 2;
    }
  }

  // ── Narrative citations (identical to APA) ──
  // Smith (2020), Smith and Jones (2020), Smith et al. (2020)
  // These are shared across APA and Harvard — reuse the same patterns.
  // Order matters: more specific patterns first (et al., two-author) before single.

  // Et al. narrative
  const narrativeEtAl = new RegExp(String.raw`\b(${CORE})\s+et\s*\.?\s*al\.?\s+\(${YEAR}${PAGE}\)`, 'g');
  while ((m = narrativeEtAl.exec(text)) !== null) {
    if (COMMON_WORDS.has(m[1].toLowerCase())) continue;
    const { year, suffix } = parseYear(m[2]);
    add({
      raw: m[0],
      normalized: m[0].replace(/\s+/g, ' ').trim(),
      type: 'et_al',
      citationStyle: 'narrative',
      authors: [createAuthor(m[1]), createAuthor('et al.', true)],
      year,
      yearSuffix: suffix,
      position: { start: m.index, end: m.index + m[0].length },
      context: extractContext(text, m.index, m[0].length),
    });
  }

  // Two author narrative
  const narrativeTwo = new RegExp(String.raw`\b(${SURNAME})\s+and\s+(${SURNAME})\s+\(${YEAR}${PAGE}\)`, 'g');
  while ((m = narrativeTwo.exec(text)) !== null) {
    if (COMMON_WORDS.has(m[1].toLowerCase())) continue;
    const { year, suffix } = parseYear(m[3]);
    add({
      raw: m[0],
      normalized: m[0].replace(/\s+/g, ' ').trim(),
      type: 'two_authors',
      citationStyle: 'narrative',
      authors: [createAuthor(m[1]), createAuthor(m[2])],
      year,
      yearSuffix: suffix,
      position: { start: m.index, end: m.index + m[0].length },
      context: extractContext(text, m.index, m[0].length),
    });
  }

  // Single narrative (last — least specific)
  const narrativeSingle = new RegExp(String.raw`\b(${NAME_RUN})\s+\(${YEAR}${PAGE}\)`, 'g');
  while ((m = narrativeSingle.exec(text)) !== null) {
    // Check both the full captured name and its first word (for "Also like Kalmijn" → "also")
    const firstWord = m[1].split(/\s+/)[0].toLowerCase();
    if (COMMON_WORDS.has(m[1].toLowerCase()) || COMMON_WORDS.has(firstWord)) continue;
    const { year, suffix } = parseYear(m[2]);
    add({
      raw: m[0],
      normalized: m[0].replace(/\s+/g, ' ').trim(),
      type: 'single',
      citationStyle: 'narrative',
      authors: [createAuthor(m[1])],
      year,
      yearSuffix: suffix,
      position: { start: m.index, end: m.index + m[0].length },
      context: extractContext(text, m.index, m[0].length),
    });
  }

  citations.sort((a, b) => a.position.start - b.position.start);
  return citations;
}
