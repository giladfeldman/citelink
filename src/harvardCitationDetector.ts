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
  const trimmed = raw.trim();
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
]);

// ── Harvard parenthetical patterns (no comma before year) ────────────────

const HARVARD_PATTERNS = {
  // (Smith 2020) or (Smith 2020a) or (Smith n.d.)
  single: /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)\s+(\d{4}[a-z]?|n\.d\.)\s*\)/gi,

  // (Smith & Jones 2020) or (Smith and Jones 2020)
  twoAuthor: /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)\s+(?:&|and)\s+([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)\s+(\d{4}[a-z]?|n\.d\.)\s*\)/gi,

  // (Author, Author, and Author Year) — ASA 3+ author style
  threeAuthor: /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?(?:,\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)*),?\s+and\s+([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)\s+(\d{4}[a-z]?|n\.d\.)\s*\)/gi,

  // (Smith et al. 2020)
  etAl: /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+et\s*\.?\s*al\.?\s+(\d{4}[a-z]?|n\.d\.)\s*\)/gi,

  // (Smith 2020, p. 15) or (Smith 2020, pp. 15-20)
  singleWithPage: /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+(\d{4}[a-z]?)\s*,\s*(pp?\.\s*[\d–\-]+)\s*\)/gi,

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
      const etAlMatch = part.match(/^([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+et\s*\.?\s*al\.?\s+(\d{4}[a-z]?|n\.d\.)$/i);
      // Try two-author: "Author & Author Year" or "Author and Author Year"
      const twoMatch = part.match(/^([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+(?:&|and)\s+([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+(\d{4}[a-z]?|n\.d\.)$/i);
      // Try multi-author: "Author, Author, and Author Year"
      const multiMatch = part.match(/^([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:,\s*[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)*,?\s+and\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+(\d{4}[a-z]?|n\.d\.)$/i);
      // Try single: "Author Year"
      const singleMatch = part.match(/^([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+(\d{4}[a-z]?|n\.d\.)$/i);

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
  const narrativeEtAl = /\b([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+et\s*\.?\s*al\.?\s+\((\d{4}[a-z]?|n\.d\.)\)/g;
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
  const narrativeTwo = /\b([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+and\s+([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+\((\d{4}[a-z]?|n\.d\.)\)/g;
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
  const narrativeSingle = /\b([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)\s+\((\d{4}[a-z]?|n\.d\.)\)/g;
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
