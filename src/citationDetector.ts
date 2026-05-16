/**
 * Citation Detection Module - APA 7 Style
 * Comprehensive detection of in-text citations with type classification
 * 
 * Supports:
 * - Single author citations (parenthetical and narrative)
 * - Two author citations (with & or "and")
 * - Et al. citations (3+ authors)
 * - Group/organization authors (with abbreviations)
 * - Secondary sources ("as cited in")
 * - Multiple citations in one parenthesis
 * - Possessive forms
 * - Page numbers
 * - Year suffixes (2020a, 2020b)
 * - Special dates (n.d., in press)
 */

// Citation type classification
export type CitationType =
  | 'single'        // (Smith, 2020)
  | 'two_authors'   // (Smith & Jones, 2020)
  | 'et_al'         // (Smith et al., 2020)
  | 'group'         // (WHO, 2020) - abbreviation
  | 'group_full'    // (World Health Organization, 2020)
  | 'secondary'     // (Freud, 1923, as cited in Smith, 2020)
  | 'multiple'      // (Smith, 2020; Jones, 2019)
  | 'numeric';      // [1], [1,2], [1-3]

export interface ParsedCitationAuthor {
  raw: string;              // Original text: "Smith"
  normalized: string;       // Lowercase, no accents: "smith"
  isEtAl: boolean;          // true if this is "et al."
  isOrganization: boolean;  // true if detected as org
  abbreviation?: string;    // "WHO" if organization
}

export interface DetectedCitation {
  raw: string;                    // Original text: "(Smith et al., 2020)"
  normalized: string;             // Cleaned version
  type: CitationType;             // Classification
  citationStyle: 'parenthetical' | 'narrative';
  authors: ParsedCitationAuthor[];
  year: string;                   // "2020"
  yearSuffix?: string;            // "a" if year is "2020a"
  pageNumbers?: string;           // "pp. 15-20"
  position: {
    start: number;
    end: number;
  };
  context: string;
  // For secondary sources
  originalAuthor?: string;
  originalYear?: string;
  // For backward compatibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Common organization abbreviations for detection
const ORGANIZATION_ABBREVIATIONS: Record<string, string[]> = {
  'WHO': ['World Health Organization'],
  'APA': ['American Psychological Association', 'American Psychiatric Association'],
  'CDC': ['Centers for Disease Control and Prevention'],
  'NIH': ['National Institutes of Health'],
  'UNESCO': ['United Nations Educational, Scientific and Cultural Organization'],
  'UNICEF': ['United Nations Children\'s Fund', 'United Nations International Children\'s Emergency Fund'],
  'NASA': ['National Aeronautics and Space Administration'],
  'FDA': ['Food and Drug Administration'],
  'EPA': ['Environmental Protection Agency'],
  'NIMH': ['National Institute of Mental Health'],
  'NIST': ['National Institute of Standards and Technology'],
  'NSF': ['National Science Foundation'],
  'EU': ['European Union'],
  'UN': ['United Nations'],
  'OECD': ['Organisation for Economic Co-operation and Development'],
  'IMF': ['International Monetary Fund'],
  'WTO': ['World Trade Organization'],
};

// Comprehensive APA 7 citation patterns
const CITATION_PATTERNS = {
  // ============ PARENTHETICAL PATTERNS ============
  
  // Single author: (Smith, 2020) or (Smith, 2020a) or (Smith, n.d.) or (Smith, in press)
  singleParenthetical: /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)\s*,\s*(\d{4}[a-z]?|n\.d\.|in\s+press)\s*\)/gi,
  
  // Single with page: (Smith, 2020, p. 15) or (Smith, 2020, pp. 15-20)
  singleWithPage: /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s*,\s*(\d{4}[a-z]?)\s*,\s*(pp?\.\s*[\d–\-]+)\s*\)/gi,
  
  // Two authors parenthetical: (Smith & Jones, 2020) - uses ampersand
  twoAuthorParenthetical: /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)\s*&\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)\s*,\s*(\d{4}[a-z]?|n\.d\.)\s*\)/gi,
  
  // Two authors with page: (Smith & Jones, 2020, p. 15)
  twoAuthorWithPage: /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s*&\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s*,\s*(\d{4}[a-z]?)\s*,\s*(pp?\.\s*[\d–\-]+)\s*\)/gi,
  
  // Et al. parenthetical: (Smith et al., 2020) - handles common errors
  // Handles: et al., et al, et. al., etal., Et Al., ET AL.
  etAlParenthetical: /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s*,?\s+et\s*\.?\s*al\.?\s*,?\s*(\d{4}[a-z]?|n\.d\.)\s*\)/gi,

  // ============ HARVARD NO-COMMA PATTERNS (B34) ============
  // Some Harvard / British style guides drop the comma between author and year:
  //   (Smith 2020), (Smith and Jones 2020), (Smith et al. 2020)
  // These patterns require the parens to wrap ONLY the citation (no leading
  // text, no trailing extras besides optional whitespace) so we don't over-
  // match constructions like "(see Figure 2020)" or "(model 2020 baseline)".

  // Single author Harvard no-comma: (Smith 2020) or (Smith 2020a)
  singleParentheticalHarvardNoComma:
    /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)\s+(\d{4}[a-z]?)\s*\)/g,

  // Two authors Harvard no-comma (uses "and"): (Smith and Jones 2020)
  twoAuthorParentheticalHarvardNoComma:
    /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+and\s+([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+(\d{4}[a-z]?)\s*\)/g,

  // Et al. Harvard no-comma: (Smith et al. 2020)
  etAlParentheticalHarvardNoComma:
    /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+et\s*\.?\s*al\.?\s+(\d{4}[a-z]?)\s*\)/gi,
  
  // Et al. with page: (Smith et al., 2020, p. 15)
  etAlWithPage: /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+et\s*\.?\s*al\.?\s*,\s*(\d{4}[a-z]?)\s*,\s*(pp?\.\s*[\d–\-]+)\s*\)/gi,
  
  // ============ NARRATIVE PATTERNS ============
  
  // Single author narrative: Smith (2020)
  singleNarrative: /\b([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)\s+\((\d{4}[a-z]?|n\.d\.)\)/g,
  
  // Two authors narrative: Smith and Jones (2020) - uses "and"
  twoAuthorNarrative: /\b([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)\s+and\s+([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)\s+\((\d{4}[a-z]?|n\.d\.)\)/g,
  
  // Et al. narrative: Smith et al. (2020)
  etAlNarrative: /\b([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+et\s*\.?\s*al\.?\s+\((\d{4}[a-z]?|n\.d\.)\)/g,

  // Possessive single: Smith's (2020) study
  possessiveSingle: /\b([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)['']s\s+\((\d{4}[a-z]?|n\.d\.)\)/g,

  // Possessive two authors: Smith and Jones's (2020) study
  possessiveTwoAuthor: /\b([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+and\s+([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)['']s\s+\((\d{4}[a-z]?|n\.d\.)\)/g,

  // Possessive et al.: Smith et al.'s (2020) study
  possessiveEtAl: /\b([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+et\s*\.?\s*al\.?['']s\s+\((\d{4}[a-z]?|n\.d\.)\)/g,

  // And colleagues: Smith and colleagues (2020) or Smith & colleagues (2020)
  // Must match before two-author narrative pattern
  andColleagues: /\b([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+(?:and|&)\s+colleagues\s+\((\d{4}[a-z]?|n\.d\.)\)/g,

  // With colleagues: Smith with colleagues (2020)
  withColleagues: /\b([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s+with\s+colleagues\s+\((\d{4}[a-z]?|n\.d\.)\)/g,
  
  // ============ GROUP/ORGANIZATION PATTERNS ============
  
  // Full name with abbreviation: (World Health Organization [WHO], 2020)
  groupWithAbbrev: /\(\s*([A-Z][A-Za-z\s&]+)\s*\[([A-Z]{2,})\]\s*,\s*(\d{4}[a-z]?|n\.d\.)\s*\)/g,
  
  // Abbreviation only: (WHO, 2020) or (CDC, 2020)
  groupAbbrevOnly: /\(\s*([A-Z]{2,})\s*,\s*(\d{4}[a-z]?|n\.d\.)\s*\)/g,
  
  // Full organization name: (World Health Organization, 2020)
  // Matches organizations starting with common prefixes
  groupFullName: /\(\s*((?:World|American|National|United|International|European|Centers|Federal|British|Canadian|Australian)[A-Za-z\s&]+(?:Organization|Association|Institute|Agency|Foundation|Committee|Council|Department|Bureau|Board|Commission|Center|Centre|Administration|Service|Office))\s*,\s*(\d{4}[a-z]?|n\.d\.)\s*\)/gi,
  
  // ============ SPECIAL PATTERNS ============
  
  // Secondary source: (Freud, 1923, as cited in Smith, 2020)
  secondarySource: /\(\s*([^,]+)\s*,\s*(\d{4}[a-z]?)\s*,\s*as\s+cited\s+in\s+([^,]+)\s*,\s*(\d{4}[a-z]?)\s*\)/gi,
  
  // Multiple citations: (Smith, 2020; Jones, 2019)
  multipleCitations: /\(\s*([^)]+;\s*[^)]+)\s*\)/g,
  
  // Same author multiple years: (Smith, 2019, 2020)
  sameAuthorMultipleYears: /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s*,\s*(\d{4}[a-z]?)\s*,\s*(\d{4}[a-z]?)\s*\)/gi,
  
  // Same author same year: (Smith, 2020a, 2020b)
  sameAuthorSameYear: /\(\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s*,\s*(\d{4}[a-z])\s*,\s*(\d{4}[a-z])\s*\)/gi,
};

/**
 * Normalize text for comparison
 * Removes accents, normalizes spaces and punctuation
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove accents
    .replace(/[''`]/g, "'")            // Normalize apostrophes
    .replace(/[.,;:]/g, '')            // Remove punctuation
    .replace(/\s+/g, ' ')              // Normalize spaces
    .trim();
}

/**
 * Normalize citation text for comparison
 * Handles common spacing and punctuation errors
 */
function normalizeCitation(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')              // Normalize multiple spaces
    .replace(/\(\s+/g, '(')            // Remove space after opening paren
    .replace(/\s+\)/g, ')')            // Remove space before closing paren
    .replace(/,\s*/g, ', ')            // Normalize comma spacing
    .replace(/;\s*/g, '; ')            // Normalize semicolon spacing
    .trim();
}

/**
 * Parse year and extract suffix if present
 */
function parseYear(yearStr: string): { year: string; suffix?: string } {
  const match = yearStr.match(/^(\d{4})([a-z])?$/i);
  if (match) {
    return {
      year: match[1],
      suffix: match[2]?.toLowerCase()
    };
  }
  // Handle special cases
  if (yearStr.toLowerCase() === 'n.d.' || yearStr.toLowerCase() === 'in press') {
    return { year: yearStr.toLowerCase() };
  }
  return { year: yearStr };
}

/**
 * Check if a string is an organization abbreviation
 */
function isOrganizationAbbreviation(str: string): boolean {
  return str.toUpperCase() in ORGANIZATION_ABBREVIATIONS || /^[A-Z]{2,}$/.test(str);
}

/**
 * Check if a string looks like an organization name
 */
function isOrganizationName(str: string): boolean {
  const orgKeywords = [
    'organization', 'association', 'institute', 'agency', 'foundation',
    'committee', 'council', 'department', 'bureau', 'board', 'commission',
    'center', 'centre', 'administration', 'service', 'office'
  ];
  const lower = str.toLowerCase();
  return orgKeywords.some(keyword => lower.includes(keyword));
}

/**
 * Create a ParsedCitationAuthor from a raw author string
 */
function createParsedAuthor(raw: string, isEtAl: boolean = false): ParsedCitationAuthor {
  const trimmed = raw.trim();
  const isOrg = isOrganizationAbbreviation(trimmed) || isOrganizationName(trimmed);
  
  return {
    raw: trimmed,
    normalized: normalizeText(trimmed),
    isEtAl,
    isOrganization: isOrg,
    abbreviation: isOrganizationAbbreviation(trimmed) ? trimmed.toUpperCase() : undefined
  };
}

/**
 * Classify citation type based on parsed data
 */
function classifyCitation(
  authors: ParsedCitationAuthor[],
  hasSecondary: boolean,
  isMultiple: boolean
): CitationType {
  if (hasSecondary) return 'secondary';
  if (isMultiple) return 'multiple';
  
  // Check for et al.
  if (authors.some(a => a.isEtAl)) return 'et_al';
  
  // Check for organization
  if (authors.length === 1 && authors[0].isOrganization) {
    return authors[0].abbreviation ? 'group' : 'group_full';
  }
  
  // Count non-et-al authors
  const realAuthors = authors.filter(a => !a.isEtAl);
  if (realAuthors.length === 1) return 'single';
  if (realAuthors.length === 2) return 'two_authors';
  
  // 3+ authors without et al. - treat as et al. (APA 7 rule)
  return 'et_al';
}

/**
 * Extract context around citation (100 chars before and after)
 */
function extractContext(text: string, position: number, length: number): string {
  const contextRadius = 100;
  const start = Math.max(0, position - contextRadius);
  const end = Math.min(text.length, position + length + contextRadius);
  return text.slice(start, end);
}

/**
 * Parse author string into array of ParsedCitationAuthor
 */
function parseAuthors(authorString: string): ParsedCitationAuthor[] {
  const authors: ParsedCitationAuthor[] = [];
  
  // Handle "et al." (case-insensitive, various formats)
  const etAlMatch = authorString.match(/^(.+?)\s*,?\s*et\s*\.?\s*al\.?$/i);
  if (etAlMatch) {
    authors.push(createParsedAuthor(etAlMatch[1].trim()));
    authors.push(createParsedAuthor('et al.', true));
    return authors;
  }
  
  // Handle "and colleagues" or "& colleagues"
  const colleaguesMatch = authorString.match(/^(.+?)\s+(?:and|&|with)\s+colleagues$/i);
  if (colleaguesMatch) {
    authors.push(createParsedAuthor(colleaguesMatch[1].trim()));
    authors.push(createParsedAuthor('et al.', true)); // Treat as et al.
    return authors;
  }
  
  // Split by "&" or "and" (but not "and" in organization names)
  const parts = authorString.split(/\s*(?:&|(?<![A-Za-z])and(?![A-Za-z]))\s*/i);
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length > 0) {
      authors.push(createParsedAuthor(trimmed));
    }
  }
  
  return authors;
}

/**
 * Main citation detection function
 * Detects all APA 7 style citations in text
 */
export function detectCitations(text: string): DetectedCitation[] {
  const citations: DetectedCitation[] = [];
  const processedPositions = new Set<string>();
  
  /**
   * Helper to add citation if not already processed
   */
  function addCitation(citation: DetectedCitation): void {
    const posKey = `${citation.position.start}-${citation.position.end}`;
    if (!processedPositions.has(posKey)) {
      processedPositions.add(posKey);
      citations.push(citation);
    }
  }
  
  let match: RegExpExecArray | null;
  
  // ============ SECONDARY SOURCE (most specific, process first) ============
  CITATION_PATTERNS.secondarySource.lastIndex = 0;
  while ((match = CITATION_PATTERNS.secondarySource.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[4]);
    const authors = parseAuthors(match[3]); // Secondary author
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'secondary',
      citationStyle: 'parenthetical',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length),
      originalAuthor: match[1].trim(),
      originalYear: match[2]
    });
  }
  
  // ============ GROUP WITH ABBREVIATION ============
  CITATION_PATTERNS.groupWithAbbrev.lastIndex = 0;
  while ((match = CITATION_PATTERNS.groupWithAbbrev.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[3]);
    const author = createParsedAuthor(match[1].trim());
    author.isOrganization = true;
    author.abbreviation = match[2].toUpperCase();
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'group_full',
      citationStyle: 'parenthetical',
      authors: [author],
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ GROUP ABBREVIATION ONLY ============
  CITATION_PATTERNS.groupAbbrevOnly.lastIndex = 0;
  while ((match = CITATION_PATTERNS.groupAbbrevOnly.exec(text)) !== null) {
    // Skip if it looks like a regular citation that was mismatched
    const abbrev = match[1];
    if (abbrev.length < 2 || abbrev.length > 10) continue;
    
    const { year, suffix } = parseYear(match[2]);
    const author = createParsedAuthor(abbrev);
    author.isOrganization = true;
    author.abbreviation = abbrev.toUpperCase();
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'group',
      citationStyle: 'parenthetical',
      authors: [author],
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ GROUP FULL NAME ============
  CITATION_PATTERNS.groupFullName.lastIndex = 0;
  while ((match = CITATION_PATTERNS.groupFullName.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[2]);
    const author = createParsedAuthor(match[1].trim());
    author.isOrganization = true;
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'group_full',
      citationStyle: 'parenthetical',
      authors: [author],
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ ET AL. WITH PAGE (PARENTHETICAL) ============
  CITATION_PATTERNS.etAlWithPage.lastIndex = 0;
  while ((match = CITATION_PATTERNS.etAlWithPage.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[2]);
    const authors = [
      createParsedAuthor(match[1]),
      createParsedAuthor('et al.', true)
    ];
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'et_al',
      citationStyle: 'parenthetical',
      authors,
      year,
      yearSuffix: suffix,
      pageNumbers: match[3],
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ ET AL. PARENTHETICAL ============
  CITATION_PATTERNS.etAlParenthetical.lastIndex = 0;
  while ((match = CITATION_PATTERNS.etAlParenthetical.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[2]);
    const authors = [
      createParsedAuthor(match[1]),
      createParsedAuthor('et al.', true)
    ];
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'et_al',
      citationStyle: 'parenthetical',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ TWO AUTHORS WITH PAGE (PARENTHETICAL) ============
  CITATION_PATTERNS.twoAuthorWithPage.lastIndex = 0;
  while ((match = CITATION_PATTERNS.twoAuthorWithPage.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[3]);
    const authors = [
      createParsedAuthor(match[1]),
      createParsedAuthor(match[2])
    ];
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'two_authors',
      citationStyle: 'parenthetical',
      authors,
      year,
      yearSuffix: suffix,
      pageNumbers: match[4],
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ TWO AUTHORS PARENTHETICAL ============
  CITATION_PATTERNS.twoAuthorParenthetical.lastIndex = 0;
  while ((match = CITATION_PATTERNS.twoAuthorParenthetical.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[3]);
    const authors = [
      createParsedAuthor(match[1]),
      createParsedAuthor(match[2])
    ];
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'two_authors',
      citationStyle: 'parenthetical',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ SINGLE WITH PAGE (PARENTHETICAL) ============
  CITATION_PATTERNS.singleWithPage.lastIndex = 0;
  while ((match = CITATION_PATTERNS.singleWithPage.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[2]);
    const authors = [createParsedAuthor(match[1])];
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: classifyCitation(authors, false, false),
      citationStyle: 'parenthetical',
      authors,
      year,
      yearSuffix: suffix,
      pageNumbers: match[3],
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ SINGLE PARENTHETICAL ============
  CITATION_PATTERNS.singleParenthetical.lastIndex = 0;
  while ((match = CITATION_PATTERNS.singleParenthetical.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[2]);
    const authors = parseAuthors(match[1]);
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: classifyCitation(authors, false, false),
      citationStyle: 'parenthetical',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ HARVARD NO-COMMA: ET AL. PARENTHETICAL (B34) ============
  // Run before two-author and single Harvard so "(Smith et al. 2020)" doesn't
  // get partially captured by the single-author Harvard pattern.
  CITATION_PATTERNS.etAlParentheticalHarvardNoComma.lastIndex = 0;
  while ((match = CITATION_PATTERNS.etAlParentheticalHarvardNoComma.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[2]);
    const authors = [
      createParsedAuthor(match[1]),
      createParsedAuthor('et al.', true),
    ];
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'et_al',
      citationStyle: 'parenthetical',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length),
    });
  }

  // ============ HARVARD NO-COMMA: TWO AUTHORS PARENTHETICAL (B34) ============
  CITATION_PATTERNS.twoAuthorParentheticalHarvardNoComma.lastIndex = 0;
  while ((match = CITATION_PATTERNS.twoAuthorParentheticalHarvardNoComma.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[3]);
    const authors = [
      createParsedAuthor(match[1]),
      createParsedAuthor(match[2]),
    ];
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'two_authors',
      citationStyle: 'parenthetical',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length),
    });
  }

  // ============ HARVARD NO-COMMA: SINGLE PARENTHETICAL (B34) ============
  CITATION_PATTERNS.singleParentheticalHarvardNoComma.lastIndex = 0;
  while ((match = CITATION_PATTERNS.singleParentheticalHarvardNoComma.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[2]);
    const authors = parseAuthors(match[1]);
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: classifyCitation(authors, false, false),
      citationStyle: 'parenthetical',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length),
    });
  }

  // ============ POSSESSIVE ET AL. (NARRATIVE) ============
  CITATION_PATTERNS.possessiveEtAl.lastIndex = 0;
  while ((match = CITATION_PATTERNS.possessiveEtAl.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[2]);
    const authors = [
      createParsedAuthor(match[1]),
      createParsedAuthor('et al.', true)
    ];
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'et_al',
      citationStyle: 'narrative',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ POSSESSIVE TWO AUTHORS (NARRATIVE) ============
  CITATION_PATTERNS.possessiveTwoAuthor.lastIndex = 0;
  while ((match = CITATION_PATTERNS.possessiveTwoAuthor.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[3]);
    const authors = [
      createParsedAuthor(match[1]),
      createParsedAuthor(match[2])
    ];
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'two_authors',
      citationStyle: 'narrative',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ POSSESSIVE SINGLE (NARRATIVE) ============
  CITATION_PATTERNS.possessiveSingle.lastIndex = 0;
  while ((match = CITATION_PATTERNS.possessiveSingle.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[2]);
    const authors = [createParsedAuthor(match[1])];
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'single',
      citationStyle: 'narrative',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ ET AL. NARRATIVE ============
  CITATION_PATTERNS.etAlNarrative.lastIndex = 0;
  while ((match = CITATION_PATTERNS.etAlNarrative.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[2]);
    const authors = [
      createParsedAuthor(match[1]),
      createParsedAuthor('et al.', true)
    ];
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'et_al',
      citationStyle: 'narrative',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ AND COLLEAGUES (NARRATIVE) - MUST BE BEFORE TWO AUTHORS ============
  CITATION_PATTERNS.andColleagues.lastIndex = 0;
  while ((match = CITATION_PATTERNS.andColleagues.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[2]);
    const authors = [
      createParsedAuthor(match[1]),
      createParsedAuthor('et al.', true) // Treat as et al.
    ];
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'et_al',
      citationStyle: 'narrative',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ WITH COLLEAGUES (NARRATIVE) ============
  CITATION_PATTERNS.withColleagues.lastIndex = 0;
  while ((match = CITATION_PATTERNS.withColleagues.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[2]);
    const authors = [
      createParsedAuthor(match[1]),
      createParsedAuthor('et al.', true) // Treat as et al.
    ];
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'et_al',
      citationStyle: 'narrative',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ TWO AUTHORS NARRATIVE ============
  CITATION_PATTERNS.twoAuthorNarrative.lastIndex = 0;
  while ((match = CITATION_PATTERNS.twoAuthorNarrative.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[3]);
    const authors = [
      createParsedAuthor(match[1]),
      createParsedAuthor(match[2])
    ];
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'two_authors',
      citationStyle: 'narrative',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ SINGLE NARRATIVE ============
  CITATION_PATTERNS.singleNarrative.lastIndex = 0;
  while ((match = CITATION_PATTERNS.singleNarrative.exec(text)) !== null) {
    const { year, suffix } = parseYear(match[2]);
    const authors = [createParsedAuthor(match[1])];
    
    // Skip if author looks like a common word
    const authorLower = match[1].toLowerCase();
    const commonWords = ['the', 'this', 'that', 'these', 'those', 'their', 'there', 'where', 'when', 'while', 'which', 'what', 'with', 'from', 'into', 'upon', 'about', 'after', 'before', 'between', 'through', 'during', 'without', 'within', 'among', 'along', 'across', 'behind', 'beyond', 'under', 'over', 'above', 'below', 'around', 'toward', 'towards', 'against', 'throughout', 'despite', 'figure', 'table', 'section', 'chapter', 'study', 'research', 'analysis', 'results', 'method', 'discussion', 'conclusion', 'introduction', 'abstract', 'however', 'therefore', 'furthermore', 'moreover', 'nevertheless', 'although', 'whereas', 'because', 'since', 'unless', 'until', 'while'];
    if (commonWords.includes(authorLower)) continue;
    
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'single',
      citationStyle: 'narrative',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length)
    });
  }
  
  // ============ MULTIPLE CITATIONS ============
  CITATION_PATTERNS.multipleCitations.lastIndex = 0;
  while ((match = CITATION_PATTERNS.multipleCitations.exec(text)) !== null) {
    // Skip if already processed
    const posKey = `${match.index}-${match.index + match[0].length}`;
    if (processedPositions.has(posKey)) continue;
    
    // Split by semicolon and process each citation
    const multipleCites = match[1].split(';').map(cite => cite.trim());
    let currentPos = match.index + 1; // Start after opening parenthesis
    
    for (const citeText of multipleCites) {
      // Try to match individual citation patterns
      
      // Et al. pattern
      const etAlMatch = citeText.match(/^([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s*,?\s+et\s*\.?\s*al\.?\s*,?\s*(\d{4}[a-z]?|n\.d\.)$/i);
      if (etAlMatch) {
        const { year, suffix } = parseYear(etAlMatch[2]);
        addCitation({
          raw: `(${citeText})`,
          normalized: normalizeCitation(`(${citeText})`),
          type: 'et_al',
          citationStyle: 'parenthetical',
          authors: [
            createParsedAuthor(etAlMatch[1]),
            createParsedAuthor('et al.', true)
          ],
          year,
          yearSuffix: suffix,
          position: { start: currentPos, end: currentPos + citeText.length },
          context: extractContext(text, currentPos, citeText.length)
        });
        currentPos += citeText.length + 2;
        continue;
      }
      
      // Two author pattern
      const twoAuthorMatch = citeText.match(/^([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s*&\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)\s*,\s*(\d{4}[a-z]?|n\.d\.)$/i);
      if (twoAuthorMatch) {
        const { year, suffix } = parseYear(twoAuthorMatch[3]);
        addCitation({
          raw: `(${citeText})`,
          normalized: normalizeCitation(`(${citeText})`),
          type: 'two_authors',
          citationStyle: 'parenthetical',
          authors: [
            createParsedAuthor(twoAuthorMatch[1]),
            createParsedAuthor(twoAuthorMatch[2])
          ],
          year,
          yearSuffix: suffix,
          position: { start: currentPos, end: currentPos + citeText.length },
          context: extractContext(text, currentPos, citeText.length)
        });
        currentPos += citeText.length + 2;
        continue;
      }
      
      // Single author pattern
      const singleMatch = citeText.match(/^([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)\s*,\s*(\d{4}[a-z]?|n\.d\.)$/i);
      if (singleMatch) {
        const { year, suffix } = parseYear(singleMatch[2]);
        const authors = parseAuthors(singleMatch[1]);
        addCitation({
          raw: `(${citeText})`,
          normalized: normalizeCitation(`(${citeText})`),
          type: classifyCitation(authors, false, false),
          citationStyle: 'parenthetical',
          authors,
          year,
          yearSuffix: suffix,
          position: { start: currentPos, end: currentPos + citeText.length },
          context: extractContext(text, currentPos, citeText.length)
        });
      }
      
      currentPos += citeText.length + 2; // +2 for "; "
    }
  }
  
  // Sort by position
  citations.sort((a, b) => a.position.start - b.position.start);

  // Remove citations whose positions are contained within a longer citation
  // (e.g., "Lopez and Rey (2017)" is inside "Merida-Lopez and Rey (2017)")
  const deoverlapped: DetectedCitation[] = [];
  for (const c of citations) {
    const isContained = citations.some(other =>
      other !== c &&
      other.position.start <= c.position.start &&
      other.position.end >= c.position.end
    );
    if (!isContained) deoverlapped.push(c);
  }

  return deoverlapped;
}

/**
 * Get organization full name from abbreviation
 */
export function getOrganizationFullName(abbreviation: string): string[] | undefined {
  return ORGANIZATION_ABBREVIATIONS[abbreviation.toUpperCase()];
}

/**
 * Get all known organization abbreviations
 */
export function getKnownOrganizationAbbreviations(): Record<string, string[]> {
  return { ...ORGANIZATION_ABBREVIATIONS };
}




