/**
 * Reference Parsing Module - APA 7 Style
 * Parses reference list entries to extract structured data
 * 
 * Supports:
 * - Single and multiple authors (up to 20, with ellipsis for 21+)
 * - Group/organization authors with abbreviations
 * - Complex names (hyphenated, particles, suffixes, accents)
 * - Year suffixes (2020a, 2020b)
 * - Special dates (n.d., in press)
 * - Various reference types (journal, book, chapter, website, report)
 */

import { normalizeText } from './citationDetector.js';
import type { CitationStyleType } from './types.js';

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
  'ProFAN': ['ProFAN Consortium'],
  'NICE': ['National Institute for Health and Care Excellence'],
  'NHS': ['National Health Service'],
  'IBGE': ['Instituto Brasileiro de Geografia e Estatística'],
  'AAPOR': ['American Association for Public Opinion Research'],
  'US Census Bureau': ['United States Census Bureau'],
  'IACO': ['International Alliance of Carer Organizations'],
  'WWF': ['World Wildlife Fund', 'World Wide Fund for Nature'],
  'IUCN': ['International Union for Conservation of Nature'],
  'IPCC': ['Intergovernmental Panel on Climate Change'],
  'UNDP': ['United Nations Development Programme'],
  'FAO': ['Food and Agriculture Organization'],
  'ILO': ['International Labour Organization'],
  'USDA': ['United States Department of Agriculture'],
  'NOAA': ['National Oceanic and Atmospheric Administration'],
  'NRC': ['National Research Council'],
  'NAS': ['National Academy of Sciences'],
  'USGS': ['United States Geological Survey'],
  'DFID': ['Department for International Development'],
  'UNEP': ['United Nations Environment Programme'],
  'UNCTAD': ['United Nations Conference on Trade and Development'],
  'IOM': ['International Organization for Migration'],
  'UNHCR': ['United Nations High Commissioner for Refugees'],
  'UNAIDS': ['Joint United Nations Programme on HIV/AIDS'],
  'NHTSA': ['National Highway Traffic Safety Administration'],
  'SAMHSA': ['Substance Abuse and Mental Health Services Administration'],
  'BLS': ['Bureau of Labor Statistics'],
  'GAO': ['Government Accountability Office'],
  'CBO': ['Congressional Budget Office'],
  'AAAS': ['American Association for the Advancement of Science'],
};

// Reverse lookup: full name to abbreviation
const ORGANIZATION_FULL_TO_ABBREV: Record<string, string> = {};
for (const [abbrev, fullNames] of Object.entries(ORGANIZATION_ABBREVIATIONS)) {
  for (const fullName of fullNames) {
    ORGANIZATION_FULL_TO_ABBREV[fullName.toLowerCase()] = abbrev;
  }
}

export interface ParsedReferenceAuthor {
  lastName: string;
  lastNameNormalized: string;
  firstName?: string;
  initials?: string;
  suffix?: string;           // Jr., III, etc.
  isOrganization: boolean;
}

export interface ParsedReference {
  raw: string;
  authors: ParsedReferenceAuthor[];
  authorCount: number;
  firstAuthorLastName: string;
  firstAuthorLastNameNormalized: string;
  secondAuthorLastName?: string;
  secondAuthorLastNameNormalized?: string;
  allAuthorLastNames: string[];
  allAuthorLastNamesNormalized: string[];
  year: string;
  yearSuffix?: string;
  title: string;
  source?: string;        // Journal name, book title, etc.
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  isGroupAuthor: boolean;
  groupName?: string;
  groupAbbreviation?: string;
  listNumber?: number;
  type: 'journal' | 'book' | 'chapter' | 'website' | 'report' | 'unknown';
}

// Legacy interface for backward compatibility
export interface Author {
  lastName: string;
  firstName?: string;
  initials?: string;
}

// Name particles that should be kept with the last name
const NAME_PARTICLES = [
  'van', 'von', 'de', 'del', 'della', 'der', 'den', 'la', 'le', 'les',
  'du', 'des', 'di', 'da', 'dos', 'das', 'ten', 'ter', 'bin', 'ibn',
  'al', 'el', 'lo', 'los', 'san', 'santa', 'st', 'mac', 'mc', "o'"
];

// Name suffixes to extract
const NAME_SUFFIXES = ['Jr', 'Jr.', 'Sr', 'Sr.', 'II', 'III', 'IV', 'V', 'VI'];

// Regex patterns for reference components
const REFERENCE_PATTERNS = {
  // Year in parentheses with optional month and day:
  // (2020) or (2020a) or (n.d.) or (in press) or (2024, March 26) or (2024, March) or (2024, 26)
  // Also handles month-first: (May 05, 2020) or (March 2024)
  year: /\((\d{4}[a-z]?(?:,\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{1,2})?|\d{1,2})?|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|n\.d\.|in\s+press)\)/i,

  // DOI pattern
  doi: /(?:https?:\/\/)?(?:dx\.)?doi\.org\/([^\s]+)|doi:\s*([^\s]+)/i,

  // URL pattern
  url: /https?:\/\/[^\s]+/,

  // Journal volume/issue/pages: 45(2), 123-145
  journalInfo: /(\d+)\((\d+)\),?\s*([\d–\-]+)/,

  // Organization author pattern (starts with capital word that's an org keyword)
  organizationAuthor: /^((?:World|American|National|United|International|European|Centers|Federal|British|Canadian|Australian|Royal|Institute|University|Department|Ministry|Office|Bureau|Agency|Council|Committee|Commission|Board|Foundation|Association|Organization|Society|Academy|ProFAN)[A-Za-z\s&,]+?)(?:\.\s*\(|\s+\()/i,

  // Ellipsis pattern for 21+ authors
  ellipsis: /\.{3}|…|,\s*\.\.\.\s*,|\.\s+\.\s+\./,
};

// Patterns to strip from the beginning of references (meta-analysis markers, etc.)
const REFERENCE_PREFIX_PATTERNS = [
  /^\s*\*+\s*/,           // Asterisks: *, **, ***
  /^\s*†+\s*/,            // Daggers: †, ††
  /^\s*‡+\s*/,            // Double daggers: ‡
  /^\s*§+\s*/,            // Section signs: §
  /^\s*¶+\s*/,            // Pilcrow: ¶
  /^\s*#+\s*/,            // Hash: #
  /^\s*#\d+(?:Matched)?\s*/i, // #1Matched, #1, etc.
  /^\s*\d{1,3}(?=[A-ZÀ-Ÿ])/,  // Number directly attached to author: "1Burnett" → "Burnett"
  /^\s*\d+\s+citations\s*/i,  // "46 citations"
  /^\s*Not processed yet\s*/i, // Noise from some PDF tools
  /^\s*can jigsaw classroom increase learning outcomes.*?\d*\s*/i, // Specific title noise
  /^\s*\d+\.\s*/,         // Numbered: 1. 2. 3.
  /^\s*\d{1,3}\s+(?=[A-ZÀ-Ÿ])/,  // Number with space before author: "1 Straume" (BMJ Open style)
  /^\s*\[\d+\]\.?\s*/,    // Bracketed numbers: [1] [2] or [1]. [2].
  /^\s*\(\d+\)\s*/,       // Parenthetical numbers: (1) (2)
  /^\s*[a-z]\.\s*/,       // Lettered: a. b. c. (lowercase only — don't strip uppercase initials)
  /^\s*\[[a-z]\]\s*/i,    // Bracketed letters: [a] [b]
  /^\s*•\s*/,             // Bullet points
  /^\s*[-–—]\s*/,         // Dashes
];

/**
 * Normalize a name for comparison
 * Handles accents, hyphens, apostrophes, special characters, and case
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    // Remove standalone accent marks (PDF extraction artifacts: Al´os → Alos)
    .replace(/[\u00B4\u02C6\u00A8\u0060\u02DC\u02CA\u02CB]/g, '')
    // Handle special Scandinavian characters that NFD doesn't decompose
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/ð/g, 'd')
    .replace(/þ/g, 'th')
    .replace(/ł/g, 'l')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove accents
    .replace(/[''`]/g, "'")            // Normalize apostrophes
    .replace(/[.,;:]/g, '')            // Remove punctuation
    .replace(/\s+/g, ' ')              // Normalize spaces
    .replace(/-/g, '')                 // Remove hyphens for comparison
    .trim();
}

/**
 * Extract name particles from a name
 * Returns [particles, remainingName]
 */
function extractNameParticles(name: string): [string, string] {
  const words = name.split(/\s+/);
  const particles: string[] = [];
  let i = 0;

  while (i < words.length - 1) {
    const word = words[i].toLowerCase().replace(/['']/g, "'");
    if (NAME_PARTICLES.includes(word) || NAME_PARTICLES.includes(word.replace(/'/g, "'"))) {
      particles.push(words[i]);
      i++;
    } else {
      break;
    }
  }

  if (particles.length > 0) {
    return [particles.join(' '), words.slice(i).join(' ')];
  }
  return ['', name];
}

/**
 * Extract suffix from a name
 * Returns [nameWithoutSuffix, suffix]
 */
function extractNameSuffix(name: string): [string, string | undefined] {
  for (const suffix of NAME_SUFFIXES) {
    const suffixPattern = new RegExp(`,?\\s*${suffix.replace('.', '\\.')}\\s*$`, 'i');
    if (suffixPattern.test(name)) {
      return [name.replace(suffixPattern, '').trim(), suffix.replace('.', '')];
    }
  }
  return [name, undefined];
}

/**
 * Check if text looks like an organization name
 */
function isOrganizationName(text: string): boolean {
  const lower = text.toLowerCase();

  // Check against known abbreviations
  if (text.toUpperCase() in ORGANIZATION_ABBREVIATIONS) {
    return true;
  }

  // Check against known full names
  if (lower in ORGANIZATION_FULL_TO_ABBREV) {
    return true;
  }

  // All-caps names of 3+ characters are likely organization abbreviations (NICE, NHS, IBGE, AAPOR)
  if (/^[A-Z]{3,}$/.test(text.trim())) {
    return true;
  }

  // Check for organization keywords
  const orgKeywords = [
    'organization', 'organisation', 'association', 'institute', 'instituto',
    'agency', 'foundation', 'committee', 'council', 'department', 'bureau',
    'board', 'commission', 'center', 'centre', 'administration', 'service',
    'office', 'ministry', 'university', 'college', 'society', 'academy',
    'corporation', 'company', 'consortium', 'authority', 'tribunal',
    'collaboration', 'network', 'initiative',
  ];

  if (orgKeywords.some(keyword => lower.includes(keyword))) return true;

  // Short, common org-suffix words ("JASP Team", "R Core Team", a working "Group")
  // need a WORD boundary so a personal surname that merely CONTAINS them
  // ("Steamer", "Grouping") is not misclassified as an organization.
  // (citationguard-iterate 2026-06-07e — O4 JASP Team org-author reference.)
  return /\b(?:team|group)\b/.test(lower);
}

/**
 * Get abbreviation for an organization name
 */
function getOrganizationAbbreviation(name: string): string | undefined {
  const lower = name.toLowerCase();
  return ORGANIZATION_FULL_TO_ABBREV[lower];
}

/**
 * Parse a single author string into ParsedReferenceAuthor
 * Handles: "Smith, J. A.", "van der Berg, J.", "Smith, J. A., Jr."
 */
function parseAuthor(authorStr: string): ParsedReferenceAuthor | null {
  const trimmed = authorStr.trim();
  if (!trimmed || trimmed.length < 2) return null;

  // Check if it's an organization
  if (isOrganizationName(trimmed)) {
    return {
      lastName: trimmed,
      lastNameNormalized: normalizeName(trimmed),
      isOrganization: true
    };
  }

  // Pattern: "LastName, FirstName Initials" or "LastName, Initials"
  // Also handles: "van der Berg, J. A." or "O'Brien, K."
  const commaMatch = trimmed.match(/^([^,]+),\s*(.+)$/);

  if (commaMatch) {
    let lastName = commaMatch[1].trim();
    let firstNamePart = commaMatch[2].trim();

    // Extract suffix from first name part (e.g., "J. A., Jr.")
    const [firstNameWithoutSuffix, suffix] = extractNameSuffix(firstNamePart);
    firstNamePart = firstNameWithoutSuffix;

    // Extract initials vs full first name
    const initialsMatch = firstNamePart.match(/^([A-Z]\.?\s*)+$/);
    const initials = initialsMatch ? firstNamePart.replace(/\s+/g, ' ').trim() : undefined;
    const firstName = initialsMatch ? undefined : firstNamePart;

    return {
      lastName,
      lastNameNormalized: normalizeName(lastName),
      firstName,
      initials,
      suffix,
      isOrganization: false
    };
  }

  // No comma — check for Vancouver-style "LastName Initials" (e.g., "Smith JA", "Penk W")
  // Pattern: one or more name words followed by 1-4 uppercase letters (initials without periods)
  const vcStyleMatch = trimmed.match(/^(.+?)\s+([A-Z]{1,4})$/);
  if (vcStyleMatch && vcStyleMatch[1].length >= 2) {
    const ln = vcStyleMatch[1].trim();
    const ini = vcStyleMatch[2];
    // Only treat as Vancouver if the "initials" part is truly initials (not an acronym name)
    // and the last-name part starts with a capital followed by lowercase
    if (/^[A-ZÀ-Ÿ][a-zà-ÿā-ž]/.test(ln) && ini.length <= 4) {
      return {
        lastName: ln,
        lastNameNormalized: normalizeName(ln),
        initials: ini.split('').join('. ') + '.',
        isOrganization: false,
      };
    }
  }

  // Just a last name or organization
  return {
    lastName: trimmed,
    lastNameNormalized: normalizeName(trimmed),
    isOrganization: isOrganizationName(trimmed)
  };
}

/**
 * Parse authors from the author section of a reference
 * Handles multiple authors separated by commas and "&"
 */
function parseAuthorsFromSection(authorSection: string): ParsedReferenceAuthor[] {
  const authors: ParsedReferenceAuthor[] = [];

  // Check for organization author first
  const orgMatch = authorSection.match(REFERENCE_PATTERNS.organizationAuthor);
  if (orgMatch) {
    const orgName = orgMatch[1].trim();
    authors.push({
      lastName: orgName,
      lastNameNormalized: normalizeName(orgName),
      isOrganization: true
    });
    return authors;
  }

  // Check for ellipsis (21+ authors)
  const hasEllipsis = REFERENCE_PATTERNS.ellipsis.test(authorSection);

  // Split by the final "&" or "and" first
  let mainPart = authorSection;
  let lastAuthor: string | null = null;

  // Look for final "&" first (APA style — non-greedy finds the first &, [^&]+$ ensures it's the last)
  let ampersandMatch = authorSection.match(/^(.+?),?\s*&\s*([^&]+)$/);
  if (!ampersandMatch) {
    // Try "and" connector (Harvard/ASA/Chicago style — greedy finds the LAST "and")
    ampersandMatch = authorSection.match(/^(.+),?\s*\band\b\s*(.+)$/);
  }
  if (ampersandMatch) {
    mainPart = ampersandMatch[1].replace(/,\s*$/, '');
    lastAuthor = ampersandMatch[2].trim();
  }

  // Split main part by commas, but be careful with "LastName, Initials" pattern
  // Strategy: Look for patterns like "LastName, I. I.," and split on those
  const authorStrings: string[] = [];

  // Use a more sophisticated split that respects author boundaries
  // Pattern: LastName (possibly with particles or camelCase), comma, initials, then comma or end
  // Note: no `i` flag — `[a-z]` must be case-sensitive to avoid matching initials as names
  // LastName patterns:
  //   - Simple: Smith, García, O'Brien
  //   - CamelCase: DeScioli, LeBel, McCarthy, McKenzie, McNulty, DeWall
  //   - Particles with spaces: De Martino, van Dalen, von der Berg, El-Erian
  //   - Hyphenated: Zuniga-Fajuri, Kordes-de Vaal, Díaz-Loving
  // Particle prefixes that can appear before surnames (lowercase or capitalized)
  const particleAlt = '(?:[Vv]an|[Vv]on|[Dd]e|[Dd]el|[Dd]er|[Dd]en|[Dd]i|[Dd]u|[Dd]a|[Dd]o|[Dd]os|[Dd]as|[Ll]a|[Ll]e|[Ee]l|[Aa]l|[Bb]in|[Aa]bd|[Aa]bu)';
  const authorPattern = new RegExp(
    `(?:${particleAlt}\\s+)?` +                     // Optional particle prefix
    `(?:[A-ZÀ-Ÿ][A-Za-zÀ-ÿā-ž'-]+` +              // LastName (allows camelCase + Latin Extended-A, e.g. "Bartoš")
    `(?:\\s+[a-z]+(?:\\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+))?` + // Optional "van der Berg" continuation
    `(?:-(?:[a-z]+\\s+)?[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)*)` + // Optional hyphenated part
    `\\s*,\\s*` +                                     // Comma separator
    `(?:[A-ZÀ-Ÿ]\\.?\\s*)+` +                       // Initials (A. B. or AB)
    `(?:,\\s*(?:Jr|Sr|II|III|IV)\\.?)?\\s*` +        // Optional suffix
    `(?=,\\s*[A-ZÀ-Ÿ]|,\\s*${particleAlt}\\s+[A-ZÀ-Ÿ]|$|\\.{3}|…)`, // Lookahead
    'g'
  );

  let match;
  let lastIndex = 0;

  while ((match = authorPattern.exec(mainPart)) !== null) {
    authorStrings.push(match[0].trim());
    lastIndex = match.index + match[0].length;
  }

  // If no matches with the sophisticated pattern, fall back to simpler approach
  if (authorStrings.length === 0) {
    // Strategy: split on commas, then re-join "LastName" + "Initials" pairs.
    // A comma-separated list like "DeScioli, P., Bruening, R." should produce
    // ["DeScioli, P.", "Bruening, R."] not ["DeScioli", "P.", "Bruening", "R."]
    const rawParts = mainPart.split(/,\s+/);
    let i = 0;
    while (i < rawParts.length) {
      const part = rawParts[i].trim();
      if (!part || part.match(/^\.{3}$|^…$/)) { i++; continue; }

      // Check if next part looks like initials (1-4 letters, possibly with periods)
      const nextPart = rawParts[i + 1]?.trim();
      if (nextPart && /^[A-Z]\.?(\s*[A-Z]\.?)*$/.test(nextPart)) {
        // Check for suffix after initials (Jr., Sr., II, III, IV)
        const suffixPart = rawParts[i + 2]?.trim();
        if (suffixPart && /^(?:Jr|Sr|II|III|IV)\.?$/.test(suffixPart)) {
          authorStrings.push(`${part}, ${nextPart}, ${suffixPart}`);
          i += 3;
        } else {
          authorStrings.push(`${part}, ${nextPart}`);
          i += 2;
        }
      } else {
        // Part might be a full name without comma-separated initials, or a suffix
        // Skip standalone suffixes that got separated
        if (/^(?:Jr|Sr|II|III|IV)\.?$/.test(part)) { i++; continue; }
        authorStrings.push(part);
        i++;
      }
    }
  }

  // Add the last author (after &)
  if (lastAuthor && lastAuthor.length > 0) {
    const cleanedLast = lastAuthor.replace(/\.\s*$/, '').trim();
    if (cleanedLast.length > 0) {
      authorStrings.push(cleanedLast);
    }
  }

  // Parse each author string
  for (const authorStr of authorStrings) {
    // Skip ellipsis markers
    if (authorStr.match(/^\.{3}$|^…$/)) continue;

    const author = parseAuthor(authorStr);
    if (author) {
      authors.push(author);
    }
  }

  return authors;
}

/**
 * Parse year string and extract suffix
 * Handles various formats:
 * - 2020, 2020a (standard year with optional suffix)
 * - 2024, March 26 (year with month and day)
 * - 2024, March (year with month only)
 * - n.d., in press (special cases)
 */
function parseYear(yearStr: string): { year: string; suffix?: string } {
  // Handle year with month and/or day: "2024, March 26" or "2024, March"
  const dateMatch = yearStr.match(/^(\d{4})([a-z])?,\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{1,2})?$/i);
  if (dateMatch) {
    return {
      year: dateMatch[1],
      suffix: dateMatch[2]?.toLowerCase()
    };
  }

  // Handle month-first format: "May 05, 2020" or "March 2024"
  const monthFirstMatch = yearStr.match(/^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:\d{1,2},\s*)?(\d{4})$/i);
  if (monthFirstMatch) {
    return { year: monthFirstMatch[1] };
  }

  // Handle standard year with optional suffix: "2020" or "2020a"
  const match = yearStr.match(/^(\d{4})([a-z])?$/i);
  if (match) {
    return {
      year: match[1],
      suffix: match[2]?.toLowerCase()
    };
  }

  // Handle special cases
  const lower = yearStr.toLowerCase();
  if (lower === 'n.d.' || lower === 'in press') {
    return { year: lower };
  }

  return { year: yearStr };
}

/**
 * Extract list number from a reference prefix (1., [1], (1)) BEFORE stripping.
 */
function extractListNumber(raw: string): number | undefined {
  // Standard numbered: "1. ", "[1] ", "(1) " — limit to 4 digits to prevent bigint overflow
  const m = raw.match(/^\s*(?:(\d{1,4})\.\s?|\[(\d{1,4})\]\.?\s?|\((\d{1,4})\)\s)/);
  if (m) {
    const num = parseInt(m[1] || m[2] || m[3], 10);
    if (num > 0 && num <= 9999) return num;
  }
  // Number directly attached to author name: "1Burnett", "15Anderson"
  // Common in BJPsych and some other journals
  const m2 = raw.match(/^\s*(\d{1,3})(?=[A-ZÀ-Ÿ])/);
  if (m2) {
    return parseInt(m2[1], 10);
  }
  // Number with space before author: " 1 Straume" (BMJ Open style)
  const m3 = raw.match(/^\s*(\d{1,3})\s+(?=[A-ZÀ-Ÿ])/);
  if (m3) {
    return parseInt(m3[1], 10);
  }
  return undefined;
}

/**
 * Parse all references from text
 */
export function parseReferences(text: string, style?: CitationStyleType): ParsedReference[] {
  // Find the References/Bibliography section
  const refSection = extractReferenceSection(text, style);
  if (!refSection) {
    console.warn('No reference section found in document');
    return [];
  }

  // Split into individual references (usually by double newline or hanging indent)
  const rawRefs = splitIntoReferences(refSection, style);

  // Parse and deduplicate references
  const parsed = rawRefs
    .map(raw => parseReference(raw, style))
    .filter(ref => {
      // Strict validation: must have authors AND year to be considered valid
      // Or must have DOI/URL (web references)
      const isNumeric = style && ['vancouver', 'ieee', 'nature', 'ama'].includes(style);
      const hasValidStructure =
        (ref.authors.length > 0 && ref.year) || // Standard reference with author + year
        (ref.doi || ref.url) || // Web reference with DOI/URL
        (ref.listNumber !== undefined && ref.year) || // Numbered ref with year (numeric styles)
        (ref.listNumber !== undefined && isNumeric); // Numeric style: list number alone is sufficient (matching by position)

      // Additional check: filter out text that's clearly not a reference
      const rawLower = ref.raw.toLowerCase();
      const isMainText =
        rawLower.startsWith('in study') ||
        rawLower.startsWith('we extended') ||
        rawLower.startsWith('figure') ||
        rawLower.startsWith('table') ||
        rawLower.startsWith('note.') ||
        rawLower.startsWith('to guide') ||
        rawLower.match(/^\[-?\d+\.\d+/); // Confidence intervals

      return hasValidStructure && !isMainText;
    });

  // Deduplicate by raw text (case-insensitive, trimmed)
  // Include list number in key for numbered references (same paper at different positions is distinct)
  const seen = new Set<string>();
  const deduplicated: ParsedReference[] = [];

  for (const ref of parsed) {
    const textKey = ref.raw.trim().toLowerCase();
    const key = ref.listNumber !== undefined ? `#${ref.listNumber}:${textKey}` : textKey;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(ref);
    }
  }

  // Fallback: if the declared style parser produced poor results,
  // the reference list might be in a different format (e.g., PMC reformats all refs
  // to Vancouver-like format). Try Vancouver parser as fallback.
  const isAuthorYearStyle = !style || ['apa', 'harvard', 'aom', 'asa', 'chicago-ad'].includes(style);
  const goodRefs = deduplicated.filter(r => r.year && r.authors.length > 0).length;

  // Check for suspicious author names — if many authors have very short last names
  // (1-2 chars like "ND", "LK"), it means APA parser misinterpreted Vancouver-style
  // "LastName Initials" format as "LastName, Initials" and extracted initials as last names.
  let suspiciousAuthors = 0;
  let totalAuthors = 0;
  for (const ref of deduplicated) {
    for (const a of ref.authors) {
      totalAuthors++;
      if (a.lastName.length <= 2 && /^[A-Z]+$/.test(a.lastName)) {
        suspiciousAuthors++;
      }
    }
  }
  const hasSuspiciousAuthors = totalAuthors > 5 && suspiciousAuthors > totalAuthors * 0.2;

  const isNumericStyle = style && ['vancouver', 'ieee', 'nature', 'ama'].includes(style);
  const needsFallback = refSection.length > 500 && (
    deduplicated.length < 5 ||              // Very few refs parsed
    goodRefs < deduplicated.length * 0.3 || // Most refs are missing year or authors
    hasSuspiciousAuthors                     // Author names look like initials (misparse)
  );
  if (needsFallback) {
    // Try multiple alternative styles and pick the one with most valid refs.
    // This handles PMC reformatting (Vancouver), bare-year formats (AOM/ASA),
    // and numeric style misdetection (IEEE detected as Vancouver or vice versa).
    const fallbackStyles: CitationStyleType[] = isNumericStyle
      ? ['ieee', 'vancouver', 'apa']  // For numeric: try other numeric + APA
      : ['vancouver', 'apa', 'aom'];  // For author-year: try Vancouver + alternatives
    // Don't retry the same style that already failed
    const stylesToTry = fallbackStyles.filter(s => s !== style);

    let bestFallbackRefs: ParsedReference[] = [];
    let bestFallbackGood = goodRefs;

    for (const fbStyle of stylesToTry) {
      const fallbackRawRefs = splitIntoReferences(refSection, fbStyle);
      const fallbackParsed = fallbackRawRefs
        .map(raw => parseReference(raw, fbStyle))
        .filter(ref => {
          const hasValidStructure =
            (ref.authors.length > 0 && ref.year) ||
            (ref.doi || ref.url) ||
            (ref.listNumber !== undefined && ref.year);
          return hasValidStructure;
        });
      const fallbackGoodRefs = fallbackParsed.filter(r => r.year && r.authors.length > 0).length;
      if (fallbackGoodRefs > bestFallbackGood) {
        bestFallbackGood = fallbackGoodRefs;
        bestFallbackRefs = fallbackParsed;
      }
    }

    if (bestFallbackRefs.length > 0) {
      const fallbackSeen = new Set<string>();
      const fallbackDedup: ParsedReference[] = [];
      for (const ref of bestFallbackRefs) {
        const textKey = ref.raw.trim().toLowerCase();
        const key = ref.listNumber !== undefined ? `#${ref.listNumber}:${textKey}` : textKey;
        if (!fallbackSeen.has(key)) {
          fallbackSeen.add(key);
          fallbackDedup.push(ref);
        }
      }
      return fallbackDedup;
    }
  }

  return deduplicated;
}

/**
 * Find the start position of the references section in the document text
 * Returns the character index where the references section begins, or null if not found
 * Only matches clear section headers (at start of line, possibly with formatting)
 * 
 * Supports various reference section headings including:
 * - References, Bibliography, Works Cited, Literature Cited
 * - Literature (standalone)
 * - Numbered sections (e.g., "1. References")
 * - Markdown headers (e.g., "# References")
 * - Underlined headers (e.g., "References\n---")
 */
export function findReferenceSectionStart(text: string): number | null {
  // Look for common section headers - must be at start of line (possibly with whitespace)
  // and followed by newline or end of text
  const headerPatterns = [
    // Standard reference section headers
    /(?:^|\n)\s*(?:\d+\.?[ \t]*)?References\s*\n/i,           // "References" or "1. References" at start of line
    /(?:^|\n)\s*(?:\d+\.?[ \t]*)?Bibliography\s*\n/i,         // "Bibliography" or "1. Bibliography"
    /(?:^|\n)\s*(?:\d+\.?[ \t]*)?Works Cited\s*\n/i,          // "Works Cited"
    /(?:^|\n)\s*(?:\d+\.?[ \t]*)?Literature Cited\s*\n/i,     // "Literature Cited"
    /(?:^|\n)\s*(?:\d+\.?[ \t]*)?Literature\s*\n/i,           // "Literature" (standalone)
    /(?:^|\n)\s*(?:\d+\.?[ \t]*)?Cited Literature\s*\n/i,     // "Cited Literature"
    /(?:^|\n)\s*(?:\d+\.?[ \t]*)?Reference List\s*\n/i,       // "Reference List"
    /(?:^|\n)\s*(?:\d+\.?[ \t]*)?List of References\s*\n/i,   // "List of References"
    
    // End of document variants
    /(?:^|\n)\s*(?:\d+\.?[ \t]*)?References\s*$/i,            // "References" at end of document
    /(?:^|\n)\s*(?:\d+\.?[ \t]*)?Bibliography\s*$/i,          // "Bibliography" at end of document
    /(?:^|\n)\s*(?:\d+\.?[ \t]*)?Literature\s*$/i,            // "Literature" at end of document
    
    // Formatted headers
    /(?:^|\n)\s*#+\s*References\s*\n/i,                       // Markdown header: "# References"
    /(?:^|\n)\s*#+\s*Bibliography\s*\n/i,                     // Markdown header: "# Bibliography"
    /(?:^|\n)\s*#+\s*Literature\s*\n/i,                       // Markdown header: "# Literature"
    /(?:^|\n)\s*References\s*[-=]{2,}\s*\n/i,                  // Underlined: "References\n---"
    /(?:^|\n)\s*Bibliography\s*[-=]{2,}\s*\n/i,                // Underlined: "Bibliography\n---"
    /(?:^|\n)\s*Literature\s*[-=]{2,}\s*\n/i,                  // Underlined: "Literature\n---"
    /(?:^|\n)\s*R\s*E\s*F\s*E\s*R\s*E\s*N\s*C\s*E\s*S\s*\n/i, // Spaced "R E F E R E N C E S"
  ];

  // Collect ALL matching header positions — we'll pick the best one.
  // The actual reference section is usually the last one, but supplementary
  // material can contain a small secondary "References" section.
  const allCandidates: number[] = [];

  for (const pattern of headerPatterns) {
    const globalPattern = new RegExp(pattern.source, 'gi');
    let match;
    while ((match = globalPattern.exec(text)) !== null) {
      const idx = match.index ?? 0;
      // Deduplicate positions within 20 chars of each other
      if (!allCandidates.some(c => Math.abs(c - idx) < 20)) {
        allCandidates.push(idx);
      }
    }
  }

  if (allCandidates.length > 0) {
    // Sort by position
    allCandidates.sort((a, b) => a - b);

    if (allCandidates.length === 1) {
      return allCandidates[0];
    }

    // When there are multiple candidates, pick the one with the most
    // reference-like entries in the following text. This avoids picking a
    // small supplementary "References" section over the main one.
    let bestIndex = allCandidates[allCandidates.length - 1]; // default: last
    let bestRefCount = 0;

    for (const candidatePos of allCandidates) {
      // Sample the next 15000 chars after the heading
      const sample = text.slice(candidatePos, candidatePos + 15000);
      // Count reference-like patterns: "(YYYY)" or "YYYY." or "[N]" at line starts
      const yearParenMatches = (sample.match(/\((?:19|20)\d{2}[a-z]?\)/g) || []).length;
      const yearDotMatches = (sample.match(/\b(?:19|20)\d{2}[a-z]?\./g) || []).length;
      const numberedMatches = (sample.match(/^\[\d+\]/gm) || []).length;
      const doiMatches = (sample.match(/doi\.org/gi) || []).length;
      const refCount = yearParenMatches + yearDotMatches + numberedMatches + doiMatches;

      if (refCount > bestRefCount) {
        bestRefCount = refCount;
        bestIndex = candidatePos;
      }
    }

    return bestIndex;
  }

  // Fallback: detect numbered reference lists without a header (e.g., PNAS format)
  // Look for a sequence of numbered entries like "1.\tAuthor..." starting in the last 40% of doc
  const minStart = Math.floor(text.length * 0.6);
  const tailText = text.slice(minStart);
  // Match "1." followed by tab/spaces and then an author initial pattern (e.g., "J. M. Wicherts")
  const numberedListMatch = tailText.match(
    /(?:^|\n)(1\.\s*\n?\s*(?:[A-ZÀ-Ÿ]\.\s*){1,3}[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)/m
  );
  if (numberedListMatch && numberedListMatch.index !== undefined) {
    // Verify there's a "2." nearby (within 500 chars)
    const afterFirst = tailText.slice(numberedListMatch.index, numberedListMatch.index + 500);
    if (/\n2\.\s/m.test(afterFirst)) {
      return minStart + numberedListMatch.index;
    }
  }

  return null;
}

/**
 * Extract the reference section from document text
 * Only extracts text that actually looks like references
 */
function extractReferenceSection(text: string, style?: CitationStyleType): string | null {
  const startPos = findReferenceSectionStart(text);
  if (startPos === null) {
    return null;
  }

  // Look for the header pattern to get the content start
  const headerPatterns = [
    /(?:\d+\.?[ \t]*)?References\s*\n/i,
    /(?:\d+\.?[ \t]*)?Bibliography\s*\n/i,
    /(?:\d+\.?[ \t]*)?Works Cited\s*\n/i,
    /(?:\d+\.?[ \t]*)?Literature Cited\s*\n/i,
    /(?:\d+\.?[ \t]*)?Literature\s*\n/i,
    /(?:\d+\.?[ \t]*)?Cited Literature\s*\n/i,
    /(?:\d+\.?[ \t]*)?Reference List\s*\n/i,
    /(?:\d+\.?[ \t]*)?List of References\s*\n/i,
    /(?:\d+\.?[ \t]*)?References\s*$/i,
    /(?:\d+\.?[ \t]*)?Bibliography\s*$/i,
    /(?:\d+\.?[ \t]*)?Literature\s*$/i,
  ];

  let contentStart = startPos;
  for (const pattern of headerPatterns) {
    const match = text.slice(startPos).match(pattern);
    if (match) {
      contentStart = startPos + match.index! + match[0].length;
      break;
    }
  }

  // Extract text from content start, but stop when we hit non-reference content
  const remainingText = text.slice(contentStart);

  // Split into lines and find where references end
  const lines = remainingText.split('\n');
  const referenceLines: string[] = [];

  // Patterns that indicate we've left the references section
  const endPatterns = [
    /^(Figure|Table|Figure \d+|Table \d+)/i,
    /^Appendix(?!\s+\w+\.\s*\(continued)/i,   // "Appendix" but NOT "Appendix A. (continued)"
    /^(In Study|We extended|For Study|This study|Our study)/i,
    /^(Note\.|See |Cf\.|e\.g\.|i\.e\.)/i,
    /^\[-?\d+\.\d+/i, // Confidence intervals like [0.00, 0.15]
    /^[-+]?\d+\.\d+\s*\[/i, // Numbers with CIs like 0.183 [0.04, 0.33]
    /^To guide|^In addition|^We propose/i, // Discussion text
    /^Supplementary\b/i, // Supplementary material section
    /^Supporting Information/i, // Supporting information section
    /^Online Supplement/i, // Online supplement section
    /^Supplemental Materials?/i, // Supplemental material(s)
    /^Author Bio/i, // Author biography section after references
    /^Author Note/i, // Author note section after references
    /^About the Author/i, // About the author section
    /^\w+\s+is\s+(?:a |an |the )?(?:Senior |Associate |Assistant |Full )?(?:Professor|Researcher|Lecturer|Fellow|Director|Doctoral|PhD|Postdoc)/i, // Author bio: "John is a Professor..."
    // Author bio: "Herman Aguinis (haguinis@gwu.edu) is the..." — name + email in parens
    /^[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[A-ZÀ-Ÿ]\.?)+\s*\([^)]*@[^)]*\)\s+(?:is|was|has|holds)/i,
    // Author bio: "HERMAN AGUINIS is the..." — ALL CAPS name + "is"
    /^[A-Z]{2,}(?:\s+[A-Z]\.?)*(?:\s+[A-Z]{2,})+\s+(?:is|was|has|holds)\s/,
    // Author bio: "Ravi S. Ramani PhD received..." — name + degree
    /^[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[A-ZÀ-Ÿ]\.?\s*)*(?:\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?\s+(?:PhD|Ph\.D|MD|MPH|MSc|MSW|DrPH|RN|FRCPC|FRCP)\b/i,
    // Author bio: "Name, Affiliation" or "Name is an? adjective? role at/in/for/with"
    /^[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[A-ZÀ-Ÿ]\.?)+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+\s+is\s+/,
    // Author contributions / conflict of interest sections
    /^(Competing Interests?|Conflicts? of Interest|Declaration of Interest|Disclosure|Funding|Data Availability|Ethics|ORCID)\b/i,
    // AOM-style author bios: "Name is at Department/School of..."
    /^[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[A-ZÀ-Ÿ]\.?\s*)*(?:\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)*\s+is\s+(?:at|with|in)\s+(?:the\s+)?(?:Department|School|Faculty|College|Division|Institute|Center|Centre)\b/i,
    // "Corresponding author:" section
    /^Corresponding author\b/i,
    // "Address:" or "E-mail:" or "Email:" bio contact info
    /^(?:Address|E-?mail|Tel|Fax|Contact)\s*:/i,
    // AOM "Accepted by Editor" or "Action Editor" lines
    /^(?:Accepted by|Action Editor|Handling Editor|Received|Revised|Published)\s*:?\s/i,
  ];

  // Running page-footer pattern — journal name + volume + year-in-parens +
  // article-number / page-range. PDFs of journal articles repeat this footer
  // on every page (e.g. "Journal of Experimental Social Psychology 96 (2021)
  // — 104154"); when one slips between two references the splitter treats it
  // as a new entry, producing a SECTION-BOUNDARY defect (cycle-1 chen canary).
  // Filter ENTIRELY (don't push) so it doesn't disrupt the splitter.
  // Conservative: requires journal-like prefix (no comma — real references
  // start with "Last, F."), volume digits, year-in-parens, and a trailing
  // number / page range. cycle 18 (2026-05-26).
  const RUNNING_PAGE_FOOTER = /^[A-Z][A-Za-z'’&\-:.\s]{4,80}\s+\d{1,4}\s*\((19|20)\d{2}\)\s*[\s—\-–]*\s*\d{1,7}(?:[-–]\d{1,7})?\.?\s*$/;
  // Download-watermark pattern — "Downloaded from <URL> by <institution> on
  // <date>" appears on every page of UCPress / OUP / Wiley / etc. open-access
  // PDFs and was parsed as 3 separate references in the cycle-1 collabra
  // canary (HALLUCINATION class). Filter entirely, same way as the running
  // page-footer. cycle 18 (2026-05-26).
  const DOWNLOAD_WATERMARK = /^Downloaded\s+from\s+https?:\/\/\S+\s+by\s+.+\s+on\s+\d{1,2}\s+\w+\s+\d{4}\s*$/i;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const trimmed = lines[lineIdx].trim();

    // Drop running page footers and download watermarks entirely so they
    // don't disrupt the splitter.
    if (RUNNING_PAGE_FOOTER.test(trimmed) || DOWNLOAD_WATERMARK.test(trimmed)) {
      continue;
    }

    // Skip empty lines, page numbers, pipe separators, and PMC manuscript artifacts
    if (/^\s*$/.test(trimmed) || /^\s*\|?\s*\d{1,4}\s*$/.test(trimmed) || trimmed === '|'
      || /^Page\s+\d+$/i.test(trimmed)
      || /^Author\s+Manuscript$/i.test(trimmed)
      || /Author manuscript;\s*available in PMC/i.test(trimmed)) {
      referenceLines.push(lines[lineIdx]);
      continue;
    }

    // Stop if we hit a clear non-reference pattern
    let shouldStop = false;
    for (const pattern of endPatterns) {
      if (pattern.test(trimmed)) {
        shouldStop = true;
        break;
      }
    }

    if (shouldStop) {
      // Before stopping, look ahead to see if references continue after this line.
      // PMC manuscripts may have figure/table captions or other artifacts interleaved
      // with references. If the next non-empty content line looks like a reference,
      // skip this line instead of stopping.
      let refsFollowAfter = false;
      for (let ahead = 1; ahead <= 10 && lineIdx + ahead < lines.length; ahead++) {
        const nextLine = lines[lineIdx + ahead].trim();
        if (!nextLine || /^\s*\|?\s*\d{1,4}\s*$/.test(nextLine) || nextLine === '|'
          || /^Page\s+\d+$/i.test(nextLine)
          || /^Author\s+Manuscript$/i.test(nextLine)
          || /Author manuscript;\s*available in PMC/i.test(nextLine)
          || /^[A-Z]{2,}(?:\s+[A-Z]{2,})*\s+et\s+al\.?$/i.test(nextLine)) continue;
        // Check if next content line looks like a reference
        if (nextLine.match(/^[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+[,\s]/) &&
            (nextLine.match(/\(\d{4}[a-z]?\)/) || nextLine.match(/\b(19|20)\d{2}[a-z]?[;.]/))) {
          refsFollowAfter = true;
        }
        break;
      }
      if (refsFollowAfter) {
        // References continue — skip this line, don't stop
        continue;
      }
      break;
    }

    // Skip "AUTHOR et al." running page headers (common in PMC manuscripts)
    if (/^[A-Z]{2,}(?:\s+[A-Z]{2,})*\s+et\s+al\.?$/i.test(trimmed)) {
      continue;
    }

    // Stop if we hit another major section header (all caps or numbered)
    // BUT first look ahead to see if references continue after it (running page headers)
    if (trimmed.match(/^[A-Z][A-Z\s]{10,}$/) && !trimmed.match(/^[A-Z][a-z]+/)) {
      // Check next 5 non-empty lines: if any look like references, this is just a page header
      let looksLikePageHeader = false;
      for (let ahead = 1; ahead <= 10 && lineIdx + ahead < lines.length; ahead++) {
        const nextLine = lines[lineIdx + ahead].trim();
        if (!nextLine || /^\s*\|?\s*\d{1,4}\s*$/.test(nextLine) || nextLine === '|'
          || /^Page\s+\d+$/i.test(nextLine)
          || /^Author\s+Manuscript$/i.test(nextLine)
          || /Author manuscript;\s*available in PMC/i.test(nextLine)
          || /^[A-Z]{2,}(?:\s+[A-Z]{2,})*\s+et\s+al\.?$/i.test(nextLine)) continue;
        // Check if this content line looks like a reference (author pattern or numbered ref)
        if (nextLine.match(/^[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+[,\s]/) ||
            nextLine.match(/^\[\d+\]/) ||
            nextLine.match(/^\d+\.\s*[A-Z]/) ||
            nextLine.match(/\(\d{4}[a-z]?\)/) ||
            nextLine.match(/\b(19|20)\d{2}[a-z]?[;.]/)) {
          looksLikePageHeader = true;
          break;
        }
        // Not a reference start. If it's a CONTINUATION fragment, the all-caps
        // running header split a reference mid-entry (e.g. a "COGNITION AND
        // EMOTION\n1247" header landed inside the Hareli entry, between
        // "...forgiveness. Motivation" and the continuation lines "and Emotion,
        // 30(3), 189–197." then "006-9025-x" [a DOI suffix]). Such fragments
        // start lowercase, with a digit/page-number/volume token, with a DOI
        // suffix, or with an opening bracket — never with capitalized prose.
        // References DO resume a line or two later, so keep scanning the window
        // for the next genuine reference start rather than treating the header
        // as the end of the section. A capitalized non-reference line, by
        // contrast, is real post-references prose, so stop there as before.
        // (Numbered-reference starts like "1. Smith" / "[1]" already matched the
        // reference-start patterns above, so a digit here is a fragment, not a ref.)
        if (/^[a-zà-ÿ0-9&(\[\-–.]/.test(nextLine) || /^(?:and|der|van|de|von|et|of|the|in)\b/i.test(nextLine)) {
          continue;
        }
        break; // genuine capitalized post-references prose → references ended
      }
      if (!looksLikePageHeader) {
        break;
      }
      // It's a running page header — skip it, don't add to referenceLines
      continue;
    }

    // Stop if line looks like it's part of main text (too long, no reference structure)
    // Threshold 500 chars (was 200): pdftotext produces long continuation lines for titles
    // and journal names that are legitimate reference content, not body text.
    if (trimmed.length > 500 && !trimmed.match(/\b(19|20)\d{2}[a-z]?\b/) && !trimmed.match(/\((\d{4}[a-z]?|n\.d\.)/)) {
      // Very long line without a year - probably not a reference
      // But allow it if it has author pattern at start, DOI, PMC markers, or journal info
      if (!trimmed.match(/^[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+,?\s*[A-Z]/) && !trimmed.match(/^\[\d+\]/) && !trimmed.match(/^\d+\.\s/)
        && !trimmed.match(/\b10\.\d{4,}\//) && !trimmed.match(/doi\.org/i)
        && !trimmed.match(/\[DOI\]|\[PubMed\]|\[Google Scholar\]|\[PMC/)
        && !trimmed.match(/\d+\(\d+\)[,:]\s*[\d–\-]/)) {
        break;
      }
    }

    referenceLines.push(lines[lineIdx]);
  }

  const refSection = referenceLines.join('\n').trim();

  // Validate that we actually found references (not just empty or main text)
  if (refSection.length < 50) {
    return null; // Too short to be a real references section
  }

  // Check if it has at least some reference-like patterns
  const hasReferencePatterns =
    refSection.match(/\((\d{4}[a-z]?|n\.d\.|in\s+press)\)/i) ||       // APA/Harvard/Nature: year in parens
    refSection.match(/\b(19|20)\d{2}[a-z]?[;.]/i) ||                   // Vancouver/AOM: bare year
    refSection.match(/^[A-ZÀ-Ÿ][\wà-ÿā-ž'\s-]{1,40},\s*[A-Z]/m) ||     // APA author: Smith, J.
    refSection.match(/^[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+\s[A-Z]{1,4}[,.]/m) ||    // Vancouver author: Smith JA,
    refSection.match(/^\[\d+\]\.?\s/m) ||                                 // IEEE/Vancouver numbered: [1] or [1].
    refSection.match(/doi\.org|https?:\/\//i);                          // DOI/URL

  if (!hasReferencePatterns) {
    return null; // Doesn't look like references
  }

  // Clean up hyphenation and spacing common in PDF extractions
  const cleanedSection = refSection
    // Handle hyphenation at line breaks: "Educa-\ntional" -> "Educational"
    .replace(/([a-zA-ZÀ-Ÿà-ÿā-ž])-\s*\n\s*([a-zA-ZÀ-Ÿà-ÿā-ž])/g, '$1$2')
    // Join a numeric RANGE split across a line break: a page/year range like
    // "243–\n248." otherwise leaves the trailing number alone on its line, where
    // the numbered-reference splitter mistakes it for a new reference number
    // ("248. ...") — fabricating a bogus reference and stealing the real next
    // entry's number. Rejoin the range so it stays one token.
    .replace(/(\d)\s*[-–—]\s*\n\s*(\d)/g, '$1–$2')
    // Join a hyphenated alphanumeric compound split across a line break where the
    // tail is a NUMBER: "COVID-\n19", "SARS-CoV-\n2", "IL-\n6". The hyphen is
    // SEMANTIC (part of the term) so it is KEPT — unlike the word-hyphenation rule
    // above, which removes it. Without this the orphaned "19." starts its own line
    // and the numbered-reference splitter reads it as reference #19, truncating
    // the real entry (its year/journal lost) and fabricating a fragment. Same
    // failure family as the digit-range split (v0.7.10); surfaced on nat_comms_2
    // ref #2 (Xu …, COVID-19, year dropped). (session 2026-06-07b, N1.)
    .replace(/([A-Za-zÀ-Ÿà-ÿā-ž])-\s*\n\s*(\d)/g, '$1-$2')
    // Normalize line breaks
    .replace(/\r\n/g, '\n')
    // Remove multiple trailing spaces at end of lines
    .replace(/[ \t]+\n/g, '\n')
    // Join "and" connector across line breaks within reference author lists:
    // "Kotz, D. M. and\nBasu, D." → "Kotz, D. M. and Basu, D."
    // Pattern: capital letter (optionally with period), whitespace, "and", then newline
    .replace(/([A-Z]\.?\s+and)\s*\n\s*/g, '$1 ')
    // Join continuation lines: if a line ends with comma/semicolon, the next line continues it
    // "Allen, Danielle, Sarah Hubbard,\nShlomit Wagman" → joined
    .replace(/([,;])\s*\n\s*/g, '$1 ')
    // Join multi-line author lists: "and FirstName [Initial.]\nLastName"
    // Handles: "and Terttu\nKortelainen. 2019." or "and Christopher\nA. Bail. 2020."
    .replace(/(\band\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž]+(?:\s+[A-Z]\.)*)\s*\n\s*/g, '$1 ')
    // Join first names split from last names: ", FirstName [Initial.]\nLastName"
    // Handles: "Jung, Brian\nScassellati" or "Gridley, Julia Crouch, Alicia\nWang"
    .replace(/(,\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž]+(?:\s+[A-Z]\.)*)\s*\n\s*/g, '$1 ')
    // Join year on next line after author list: "...Beckham.\n2021." or "...Lupton.\n2024."
    .replace(/([A-Za-zÀ-Ÿà-ÿā-ž]\.)\s*\n\s*((?:19|20)\d{2})/g, '$1 $2')
    // Join lines starting with lowercase (journal/title continuations)
    // "scoping review. Int. J. Soc.\nRes. Methodol." → joined
    .replace(/\n(\s*[a-z])/g, ' $1')
    // Join lines starting with URL, DOI, or "Retrieved"/"Accessed" (link continuations)
    .replace(/\n(\s*(?:https?:|doi[.:]|10\.\d|Retrieved|Accessed|Available))/gi, ' $1')
    .trim();

  return cleanedSection;
}

/**
 * Get a style-specific split regex for refining reference boundaries
 */
function getAuthorYearSplitRegex(style?: CitationStyleType): RegExp {
  switch (style) {
    case 'vancouver':
    case 'ama':
      // Vancouver/AMA: "Smith JA, Jones BC." — no comma between last name and initials
      // Also handle bare numbered refs like "1Ruck Keene A," (no bracket/dot, common in PMC AMA format)
      // [N]. format (period after bracket) is common in PMC IEEE manuscripts
      return /\n(?=(?:\d+\.\s*|\[\d+\]\.?\s*|\d+(?=[A-ZÀ-Ÿ]))?[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+\s[A-Z]{1,4}[,.])/g;
    case 'ieee':
      // Handle both [N] and [N]. formats
      return /\n(?=\[?\d+\]?\.?\s)/g;
    case 'nature':
      // Nature uses APA author format but year at end
      return /\n(?=(?:\d+\.\s*)?[A-ZÀ-Ÿ][\wà-ÿā-ž'\s-]{1,60},\s*[A-Z]\.?\s*)/g;
    case 'aom':
    case 'asa':
    case 'chicago-ad':
      // Three author-name patterns to handle:
      // 1. With comma: "LastName, I." or "LastName, FirstName"
      // 2. No comma, initials: "LastName AB" (PMC Vancouver-reformatted)
      // 3. No comma, full name: "LastName FirstName" (ASA PMC manuscripts)
      // Each followed by bare year "Year." or parenthetical "(Year)"
      return /\n(?=(?:\d+\.\s*|\*\s*)?(?:[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+,\s+[A-ZÀ-Ÿ]|[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+\s+[A-ZÀ-Ÿ]{1,3}[,.\s]|[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž]{2,}).*?(?:\.\s*(?:19|20)\d{2}[a-z]?[.;:]|\b(?:19|20)\d{2}[a-z]?[.;:]|\((?:19|20)\d{2}[a-z]?\)))/gi;
    default:
      // APA/Harvard: existing pattern
      // Comma is optional before initial to handle PMC Vancouver-format authors (e.g., "Smith JA, Jones BC")
      // Asterisk prefix for meta-analysis markers
      // Also match bare year; for PMC Vancouver-format refs (e.g., "2008;42(6):1183", "Report 2022:")
      return /\n(?=(?:\d+\.\s*|\[\d+\]\s*|•\s*|[-–—]\s*|\*\s*)?[A-ZÀ-Ÿ][\wà-ÿā-ž'\s-]{1,60},?\s*[A-Z]\.?\s*(?:&|and|and\s+others)?.*?(?:\((?:\d{4}[a-z]?|n\.d\.|in\s+press)\)|\b(?:19|20)\d{2}[a-z]?[;.:]))/gi;
  }
}

/**
 * Split a block that still contains MULTIPLE complete APA references concatenated
 * without a separating newline. This is a pdftotext extraction artifact: reference
 * entries get joined across a line, sometimes after a DOI with no trailing period
 * (e.g. "...75.6.1586 McCullough, M. E., & Rachal, K. C. (1997). Interpersonal
 * forgiving..."). Step 1c's inline splitter skips blocks that are mostly
 * newline-separated, so a few run-on lines survive intact and only the first
 * reference on the line is parsed — every later citation to the swallowed entries
 * then fails to match (chan_feldman_2025_cogemo: McCullough et al. cited 64×,
 * 0 matched, against docpluck-academic text — citationguard-iterate 2026-06-07b).
 *
 * Splits ONLY on the unambiguous APA entry opener: an author list
 * (Surname, Initials[, coauthors / & coauthor / et al.]) ending in a parenthetical
 * year followed by '.' or ',', where the boundary is preceded by a reference-end
 * signal (period, close-paren, or digit). That signature does not occur inside a
 * reference title, and the preceding-char guard avoids mid-sentence author mentions
 * ("...reply to Jones, K. (2019)..."). Returns [block] unchanged when no confident
 * interior boundary exists, so it is a no-op on already-clean references. The
 * continuation-merge pass in splitIntoReferences repairs any rare over-split.
 */
export function splitConcatenatedApaReferences(block: string): string[] {
  if (block.length < 120) return [block];
  const author =
    `(?:(?:[Dd]e[l]?|[Vv]an(?:'t)?|[Vv]on|[Dd]i|[Ll][ea]|[Ee]l|[Dd]en|[Dd]ella|[Dd]os|[Dd]as|[Dd]u|[Mm]c|[Mm]ac|[Oo]['']|[Tt]en|[Aa]l-)\\s+)*` +
    `[A-ZÀ-Ÿ][\\wà-ÿā-ž'-]+,\\s+[A-Z]\\.(?:[-\\s]?[A-Z]\\.)*`;
  const personalList = `${author}(?:,\\s+(?:&\\s+|and\\s+)?(?:${author}|et\\s+al\\.?))*`;
  // Organizational author ending in an org-suffix word ("JASP Team", "R Core
  // Team", "... Collaboration") — these have no "Surname, Initials" shape, so the
  // personal-author boundary misses a concatenated org entry ("…doi… JASP Team.
  // (2023).") and it gets swallowed into the previous reference.
  // (citationguard-iterate 2026-06-07e — O4.)
  const orgAuthor =
    `[A-ZÀ-Ÿ][\\wÀ-ÿ&''.\\- ]*?\\b(?:Team|Group|Collaboration|Consortium|Network|Initiative|Project|Foundation|Association|Society)\\b\\.?`;
  const boundary = new RegExp(
    `(?<=[).\\d])\\s+(?=(?:${personalList}|${orgAuthor})\\s*\\((?:19|20)\\d{2}[a-z]?\\)[.,])`,
    'g'
  );
  const parts = block.split(boundary).map(s => s.trim()).filter(s => s.length > 20);
  return parts.length > 1 ? parts : [block];
}

/**
 * Split reference section into individual references
 * Uses an aggressive recursive splitting strategy to handle lost line breaks.
 */
function splitIntoReferences(refSection: string, style?: CitationStyleType): string[] {
  // Normalize line breaks
  const section = refSection.replace(/\r\n/g, '\n');

  // 1. Initial rough split by double newlines or clear numbering
  // Also handles "1Burnett" and " 1 Author" formats
  const numberedSplitPattern = /\n\s*(?=\d{1,3}\.(?:\s+|(?=[A-Za-zÀ-Ÿ]))|\[\d+\]\.?\s*|\d{1,3}(?=[A-ZÀ-Ÿ][a-zà-ÿā-ž])|\d{1,3}\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž])/g;
  let blocks = section.split(/\n\s*\n/).flatMap(b => b.split(numberedSplitPattern)).map(b => b.trim()).filter(b => b.length > 20);

  // 1b. Handle pdftotext output: if the split produced only one giant block
  // (no double newlines), use line-by-line joining. pdftotext wraps at page width
  // (~80 chars) so references are single-newline-separated with continuation lines
  // starting with uppercase words (titles, journals) that aren't new references.
  // 1b. Handle pdftotext output: references may be single-newline-wrapped across lines.
  // After header/footer stripping, double newlines may appear where headers were removed,
  // creating multiple blocks. Apply line-by-line joining to each large block.
  const isNumeric = style && ['vancouver', 'ieee', 'nature', 'ama'].includes(style);
  if (!isNumeric) {
    // Match author patterns at line start:
    // - APA: "Smith, J." or "Smith, John" (comma after last name)
    // - Vancouver/British: "Smith J," or "Smith AB," (space between name and initials)
    // - Org with year: "WHO (2020)"
    // Match author patterns at line start. Handles:
    // - Simple: "Smith, J." or "Smith, John"
    // - Particle names: "De Martino, B." "van Dalen, H." "O'Brien, K."
    // - Org authors: "WHO (2020)"
    // - Vancouver: "Smith J," "Smith AB,"
    // Particle prefixes (case-insensitive): De, Van, Von, Di, Le, La, El, Al-, O', ten, Mc, Mac, Del, Della, Dos, Das, Den, du, van't, Kordes-de, etc.
    // Pattern: optional particle prefix(es) + Uppercase surname + comma/space + initial
    const particlePrefix = `(?:(?:[Dd]e[l]?|[Vv]an(?:'t)?|[Vv]on|[Dd]i|[Ll][ea]|[Ee]l|[Dd]en|[Dd]ella|[Dd]os|[Dd]as|[Dd]u|[Mm]c|[Mm]ac|[Oo]['']|[Tt]en|[Aa]l-)\\s+)*`;
    // Also handle hyphenated compound particles like "Kordes-de Vaal"
    const compoundParticle = `(?:[A-ZÀ-Ÿ][\\wà-ÿā-ž'-]+-(?:de|van|von|di|le|la)\\s+)?`;
    // Build pattern based on style — ASA gets extra no-comma full-name pattern
    const asaNoCommaPattern = (style === 'asa')
      ? `|${compoundParticle}${particlePrefix}[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+\\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž]{2,}`   // ASA no-comma: "LastName FirstName"
      : '';
    const newRefLinePattern = new RegExp(
      `^(?:\\*\\s*)?(?:` +
      `${compoundParticle}${particlePrefix}[A-ZÀ-Ÿ][\\wà-ÿā-ž'-]+,\\s*[A-Z](?:\\.|[a-zà-ÿā-ž])|` +  // With comma: "LastName, I." or "LastName, First"
      `${compoundParticle}${particlePrefix}[A-ZÀ-Ÿ][\\wà-ÿā-ž'-]+\\s+[A-Z]{1,3}[,.\\s]` +            // Vancouver: "LastName ABC,"
      asaNoCommaPattern +
      `)|^(?:\\*\\s*)?[A-ZÀ-Ÿ]{2,}[.\\s]+\\((?:19|20)\\d{2}` +
      // Acronym-colon org author: "KNAW: Royal Dutch Academy of Arts and
      // Sciences. (2018)." The year is NOT adjacent to the acronym (it follows
      // the spelled-out name), so the WHO-style "ACRONYM. (year)" alternative
      // above misses it and the entry gets merged into the previous reference.
      // An all-caps acronym + colon + a capitalized word at line start is a
      // distinctive org-author reference opener. (citationguard-iterate session
      // 2026-06-07b cycle 5; surfaced on chen_2021_jesp "KNAW: …".)
      `|^(?:\\*\\s*)?[A-ZÀ-Ÿ]{2,}:\\s+[A-ZÀ-Ÿ]`
    );
    const allJoinedRefs: string[] = [];

    for (const block of blocks) {
      // Only apply line-by-line joining to blocks that contain single-newline-wrapped content
      if (block.length < 200 || !block.includes('\n')) {
        allJoinedRefs.push(block);
        continue;
      }

      const bLines = block.split('\n');
      let current = bLines[0] || '';

      for (let i = 1; i < bLines.length; i++) {
        const line = bLines[i].trim();
        if (!line) continue;
        if (newRefLinePattern.test(line)) {
          // Check if the new line is actually a continuation (starts with "&" or "and")
          if (/^(?:&|and\b)/i.test(line)) {
            current += ' ' + line;
            continue;
          }
          const currentTrimmed = current.trim();
          // Relaxed completeness check: 40+ chars (was 80), also accept bare years like "2020." "2020;"
          const looksComplete = currentTrimmed.length > 40 &&
            (/\(\d{4}[a-z]?\)/.test(currentTrimmed) || /\b(19|20)\d{2}[a-z]?[.;,)\s]/.test(currentTrimmed)) &&
            !/[,&]\s*$/.test(currentTrimmed);
          if (looksComplete) {
            if (currentTrimmed.length > 20) allJoinedRefs.push(currentTrimmed);
            current = line;
          } else {
            current += ' ' + line;
          }
        } else {
          current += ' ' + line;
        }
      }
      if (current.trim().length > 20) allJoinedRefs.push(current.trim());
    }

    if (allJoinedRefs.length >= 2) {
      // Don't return yet — pass through step 1c for inline splitting of any
      // large blocks that step 1b couldn't separate (e.g., different author formats)
      blocks = allJoinedRefs;
    }
  }

  // 1c. Inline splitting: handle references concatenated without proper newlines.
  // Some PDFs (SSRN, certain publishers) output all references as one continuous text block.
  // Also catches blocks where line-by-line joining merged refs that should be separate.
  // Split at ". Author, I." boundaries where a year follows within ~300 chars.
  blocks = blocks.flatMap(block => {
    // Skip small blocks. For blocks with many well-separated newlines, skip inline splitting
    // to avoid false splits (the newline-based step 2 handles them properly).
    const newlineCount = (block.match(/\n/g) || []).length;
    if (block.length < 200 || (newlineCount > 5 && block.length / (newlineCount + 1) < 200)) {
      return [block];
    }

    // Two-pass approach: find candidate split points, then validate each one.
    // Pass 1: find positions where a new reference likely starts.
    // Pattern: after period/paren/bracket preceded by 2+ lowercase/digit chars (sentence end,
    // not author initial like "S."), followed by space and an uppercase letter.
    const candidates: number[] = [];
    // Match sentence endings: 2+ lowercase/digit chars then one or more closing punctuation
    // (.)\] etc.), then whitespace before uppercase. The + handles "89). " and "38]. " patterns.
    const candidatePattern = /[a-z0-9]{2}[\.\)\]]+\s+(?=[A-ZÀ-Ÿ])/g;
    let m: RegExpExecArray | null;
    while ((m = candidatePattern.exec(block)) !== null) {
      // Split position is right before the uppercase letter
      const splitPos = m.index + m[0].length;
      // Skip splitting at volume/page range boundaries: "94–107. Author" or "e123). Author"
      // These are within a single reference (page ranges), not between two references.
      // NOTE: Do NOT skip year boundaries ("2005. Author") — those ARE valid splits between refs.
      const preText = block.substring(Math.max(0, m.index - 10), m.index + m[0].length);
      if (/\d{1,4}[-–]\d{1,4}[\.\)]/.test(preText)) continue;
      if (/[pe]\d{2,}[\.\)]/.test(preText)) continue;
      candidates.push(splitPos);
    }

    if (candidates.length === 0) {
      return [block];
    }

    // Pass 2: validate each candidate — the text starting at splitPos must look like
    // a new reference author pattern followed by a year within ~300 chars.
    // Handles: APA "Smith, J.", ASA "Smith, John", Vancouver "Smith J,"
    // Also: no-period initials "Smart, C," (some British journals)
    const refStartPattern = /^[A-ZÀ-Ÿ][\wà-ÿā-ž'-]+(?:,\s+[A-Z](?:\.|[a-zà-ÿā-ž]{1,20}|,)|\s+[A-Z]{1,3}[,.\s])/;
    const validSplits: number[] = [0]; // always include start of block
    for (const pos of candidates) {
      const chunk = block.substring(pos, pos + 300);
      if (refStartPattern.test(chunk) && /\b(19|20)\d{2}\b/.test(chunk)) {
        validSplits.push(pos);
      }
    }

    if (validSplits.length >= 2) {
      const parts: string[] = [];
      for (let i = 0; i < validSplits.length; i++) {
        const start = validSplits[i];
        const end = i + 1 < validSplits.length ? validSplits[i + 1] : block.length;
        const part = block.substring(start, end).trim();
        if (part.length > 20) parts.push(part);
      }
      if (parts.length >= 2) return parts;
    }

    return [block];
  });

  // 2. Refine each block by splitting on single newlines followed by author pattern
  // This handles single-spaced references or PDF extractions where paragraphs were lost.
  // For numeric styles (Vancouver, IEEE, Nature, AMA), skip author-pattern refinement
  // since numbered splitting already handles them and author patterns would mis-split
  // multi-line references (e.g., "Computing, Vienna" looks like "Author, Initial").
  const isNumericStyle = style && ['vancouver', 'ieee', 'nature', 'ama'].includes(style);
  const authorYearSplitRegex = getAuthorYearSplitRegex(style);
  const authorOnlySplitRegex = /\n(?=(?:\d+\.\s*|\[\d+\]\.?\s*|•\s*|[-–—]\s*|\*\s*)?[A-ZÀ-Ÿ][\wà-ÿā-ž'\s-]{1,40},?\s*[A-Z]\.?\s*)/g;

  let refinedRefs: string[] = [];

  for (const block of blocks) {
    if (isNumericStyle) {
      // For numeric styles, numbered splitting is usually sufficient.
      // But if the block is very large (all refs merged into one), try the
      // style-specific author split regex as a fallback.
      if (block.length < 500) {
        refinedRefs.push(block);
        continue;
      }
      // Large block — try author-based splitting
      const numParts = block.split(authorYearSplitRegex).map(p => p.trim()).filter(p => p.length > 20);
      if (numParts.length >= 2) {
        refinedRefs.push(...numParts);
      } else {
        refinedRefs.push(block);
      }
      continue;
    }

    // Try most specific search first (Author + Year)
    let parts = block.split(authorYearSplitRegex).map(p => p.trim()).filter(p => p.length > 20);

    if (parts.length < 2) {
      // If block is large but no author+year found, try author matching
      if (block.length > 300) {
        parts = block.split(authorOnlySplitRegex).map(p => p.trim()).filter(p => p.length > 20);
      } else {
        parts = [block];
      }
    } else {
      // Re-split any remaining large parts that likely contain merged refs.
      // This handles cases where authorYearSplitRegex missed some boundaries
      // (e.g., organization authors, multi-line refs, PMC format differences).
      const reSplit: string[] = [];
      for (const part of parts) {
        if (part.length > 500) {
          const subParts = part.split(authorOnlySplitRegex).map(p => p.trim()).filter(p => p.length > 20);
          if (subParts.length >= 2) {
            reSplit.push(...subParts);
          } else {
            reSplit.push(part);
          }
        } else {
          reSplit.push(part);
        }
      }
      parts = reSplit;
    }

    refinedRefs.push(...parts);
  }

  // Post-split run-on references: a refined block may still hold MULTIPLE complete
  // references concatenated with no separating newline (pdftotext joining entries,
  // including after a DOI with no trailing period). Step 1c skips blocks that are
  // mostly newline-separated, so those survive here. Split on the unambiguous APA
  // author-list-then-parenthetical-year opener. No-op on numeric styles and on
  // already-clean refs; the continuation-merge below repairs any over-split.
  if (!isNumericStyle) {
    refinedRefs = refinedRefs.flatMap(splitConcatenatedApaReferences);
  }

  // Post-split fragment merging: merge fragments that are clearly continuations
  // (start with an initial like "A. Bail. 2020." or "Scassellati, and ...")
  // back into the previous reference entry.
  // Exempt: organization authors (all-caps 2-5 letters) and fragments with years.
  for (let i = refinedRefs.length - 1; i >= 1; i--) {
    const trimmed = refinedRefs[i].trim();

    // Skip merging if fragment starts with a known org pattern or all-caps abbreviation
    const startsWithOrg = /^[A-Z]{2,6}[\s.,(\[]/.test(trimmed) ||
      /^(?:World|American|National|United|International|European|Centers|Federal|British|Canadian|Australian|Royal|Institute|University|Department|Ministry|Office|Bureau|Agency|Council|Committee|Commission|Board|Foundation|Association|Organization|Society|Academy)/i.test(trimmed);
    if (startsWithOrg && /\b(19|20)\d{2}/.test(trimmed)) {
      continue; // Looks like a valid short org reference, don't merge
    }

    // Check if fragment starts with a journal/location/publisher name (not a real author)
    // Only treat as continuation if it has NO year (a real ref would have a year)
    const startsWithJournalOrLocation = !(/\b(19|20)\d{2}\b/.test(trimmed)) &&
      /^(?:Psychology|Sociology|Psychiatry|Journal|Review|Quarterly|Bulletin|Archives?|Proceedings|Research|Science|Medicine|Behavior|Behaviour|Cognition|Computing|Management|Organization|Marketing|Finance|Economics|Education|Political|Annual|Social|Public|Health|Human|Clinical|Applied|Experimental|Developmental|Personality|Cognitive|Abnormal|Consulting|General|Community|Organizational|Industrial|Environmental|Cross-Cultural|Comparative|Quantitative|Qualitative|Statistical|Psychological|Methods|Assessment|Measurement|Prevention|Intervention|Treatment|Rehabilitation|Occupational|Demography|Epidemiology|Criminology|New York|London|Cambridge|Oxford|Chicago|Boston|Washington|Philadelphia|Baltimore|Toronto|Melbourne|Berlin|Amsterdam|Vienna|Heidelberg|Springer|Elsevier|Wiley|Routledge|Sage|Taylor|Guilford|Erlbaum|Lawrence|Academic|Palgrave|Macmillan)\b/i.test(trimmed);

    const isContinuation =
      // Starts with just an initial: "A. Bail. 2020."
      /^[A-Z]\.\s/.test(trimmed) ||
      // Starts with "& Author" or "and Author" (continuation of author list)
      /^(?:&|and\b)/i.test(trimmed) ||
      // Starts with "LastName, and" (continuation of author list, not a new reference)
      /^[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+,\s+and\b/.test(trimmed) ||
      // Fragment starts with a journal/location name without a year — merge back (false split)
      startsWithJournalOrLocation ||
      // Very short fragment (< 60 chars) without a year — likely a split artifact
      // Note: no trailing \b — year suffixes like "2020a", "2020b" must still match
      (trimmed.length < 60 && !/\b(19|20)\d{2}/.test(trimmed));
    if (isContinuation) {
      refinedRefs[i - 1] = refinedRefs[i - 1] + ' ' + trimmed;
      refinedRefs.splice(i, 1);
    }
  }

  // Final filter to ensure they actually look like references
  return refinedRefs.filter(ref => {
    const trimmed = ref.trim();
    return trimmed.length > 20 && (
      trimmed.match(/\((\d{4}[a-z]?|n\.d\.|in\s+press)\)/i) ||
      trimmed.match(/\b(19|20)\d{2}[a-z]?[;.,)]/i) ||                // Year followed by ; . , or )
      trimmed.match(/doi\.org|https?:\/\//i) ||
      trimmed.match(/^\*?\s*[A-ZÀ-Ÿ][\wà-ÿā-ž'\s-]{1,40},?\s*[A-Z]/i) ||
      trimmed.match(/^\[\d+\]\.?\s*/i) ||                              // Bracketed number: [1] or [1].
      trimmed.match(/^\d+\.\s/i) ||                                    // Numbered: "1. Author..."
      trimmed.match(/^(?:World|American|National|United|International|European|Centers|Federal|British|Canadian|Australian|Royal|Institute|University|Department|Ministry|Office|Bureau|Agency|Council|Committee|Commission|Board|Foundation|Association|Organization|Society|Academy)/i)
    );
  });
}

/**
 * Strip common reference prefixes (meta-analysis markers, numbers, etc.)
 * Returns the cleaned reference text for parsing
 */
function stripReferencePrefix(text: string): string {
  let cleaned = text.trim();

  // Apply each pattern until no more changes
  for (const pattern of REFERENCE_PREFIX_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim();
}

/** Normalize smart/curly quotes to straight quotes */
function normalizeQuotes(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')  // double smart quotes → "
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");  // single smart quotes → '
}

/**
 * Parse a single reference entry — dispatches by style
 */
function parseReference(raw: string, style?: CitationStyleType): ParsedReference {
  const listNumber = extractListNumber(raw);
  // Normalize: smart quotes → straight, newlines → spaces (references are single logical lines)
  const cleanedText = normalizeQuotes(stripReferencePrefix(raw.trim())).replace(/\s*\n\s*/g, ' ');

  switch (style) {
    case 'vancouver':
    case 'ama':
      return parseVancouverReference(cleanedText, listNumber);
    case 'ieee':
      return parseIEEEReference(cleanedText, listNumber);
    case 'nature':
      return parseNatureReference(cleanedText, listNumber);
    case 'aom':
    case 'asa':
    case 'chicago-ad':
      return parseBareYearReference(cleanedText, listNumber, style);
    case 'harvard':
    default:
      return parseAPAReference(cleanedText, listNumber);
  }
}

// ── shared helpers for style-specific parsers ────────────────────────────

function makeEmptyRef(raw: string, listNumber?: number): ParsedReference {
  return {
    raw,
    authors: [],
    authorCount: 0,
    firstAuthorLastName: '',
    firstAuthorLastNameNormalized: '',
    allAuthorLastNames: [],
    allAuthorLastNamesNormalized: [],
    year: '',
    title: '',
    isGroupAuthor: false,
    listNumber,
    type: 'unknown',
  };
}

function fillAuthorFields(ref: ParsedReference): void {
  ref.authorCount = ref.authors.length;
  if (ref.authors.length > 0) {
    ref.firstAuthorLastName = ref.authors[0].lastName;
    ref.firstAuthorLastNameNormalized = ref.authors[0].lastNameNormalized;
    ref.isGroupAuthor = ref.authors[0].isOrganization;
    if (ref.isGroupAuthor) {
      ref.groupName = ref.authors[0].lastName.replace(/\.\s*$/, '');
      ref.groupAbbreviation = getOrganizationAbbreviation(ref.groupName);
    }
  }
  if (ref.authors.length >= 2) {
    ref.secondAuthorLastName = ref.authors[1].lastName;
    ref.secondAuthorLastNameNormalized = ref.authors[1].lastNameNormalized;
  }
  ref.allAuthorLastNames = ref.authors.map(a => a.lastName);
  ref.allAuthorLastNamesNormalized = ref.authors.map(a => a.lastNameNormalized);
}

function extractDOIAndURL(text: string, ref: ParsedReference): void {
  // Rejoin DOIs split across line breaks: "doi.org/10.1234/\njournal.2024" → "doi.org/10.1234/journal.2024"
  const textWithJoinedDOIs = text.replace(
    /((?:https?:\/\/)?(?:dx\.)?doi\.org\/[^\s]*)\s*\n\s*([^\s]+)/gi,
    '$1$2'
  ).replace(
    /(doi:\s*[^\s]*)\s*\n\s*([^\s]+)/gi,
    '$1$2'
  );
  const doiMatch = textWithJoinedDOIs.match(REFERENCE_PATTERNS.doi);
  if (doiMatch) {
    // Clean trailing punctuation from captured DOI
    ref.doi = (doiMatch[1] || doiMatch[2]).replace(/[.,;)\]]+$/, '');
  }
  if (!ref.doi) {
    const urlMatch = text.match(REFERENCE_PATTERNS.url);
    if (urlMatch) {
      ref.url = urlMatch[0];
      if (ref.type === 'unknown') ref.type = 'website';
    }
  }
}

function determineType(text: string, ref: ParsedReference): void {
  if (ref.type !== 'unknown') return;
  if (ref.url) { ref.type = 'website'; return; }
  if (ref.volume || ref.issue || ref.pages) { ref.type = 'journal'; return; }
  const lower = text.toLowerCase();
  if (lower.includes('book') || text.match(/\(ed\.\)|eds\./i)) { ref.type = 'book'; return; }
  if (lower.includes('chapter') || text.match(/\bIn:\s*[A-Z]/)) { ref.type = 'chapter'; return; }
  if (text.match(/in\s+[A-Z]/)) { ref.type = 'chapter'; return; }
}

// ── APA / Harvard parser (existing logic) ────────────────────────────────

function parseAPAReference(cleanedText: string, listNumber?: number): ParsedReference {
  const ref = makeEmptyRef(cleanedText, listNumber);

  // Extract year in parens
  let yearMatch = cleanedText.match(REFERENCE_PATTERNS.year);

  // Validate: ensure matched "year" is actually a year, not an org name or volume number in parens
  if (yearMatch && yearMatch[1]) {
    const yStr = yearMatch[1];
    // Check if it's a non-year string (org name, etc.)
    if (!/^\d{4}/.test(yStr) && !/^n\.d\.|^in\s+press/i.test(yStr)) {
      if (!/^(?:January|February|March|April|May|June|July|August|September|October|November|December)/i.test(yStr)) {
        yearMatch = null;
      }
    }
    // Check if numeric year is in valid range (1800-2099) — reject volume/issue numbers like (6336)
    if (yearMatch && /^\d{4}/.test(yStr)) {
      const yearNum = parseInt(yStr.slice(0, 4), 10);
      if (yearNum < 1800 || yearNum > 2099) {
        yearMatch = null;
      }
    }
  }

  if (yearMatch) {
    const { year, suffix } = parseYear(yearMatch[1]);
    ref.year = year;
    ref.yearSuffix = suffix;
  }

  // Bare year fallback for PMC Vancouver-format refs: "Author. Title. Journal. 2021;vol..."
  // Also handles: "Org Name 2024.", "Publisher; City: 2021.", "Title? 2020b.", "[QS200] 2021."
  if (!ref.year) {
    let bareYearMatch = cleanedText.match(/(?:\.\s+|;\s*|\)\s+|:\s+|\?\s+|\]\s+|\s{2,})((?:19|20)\d{2})([a-z])?(?=[;.,:\s]|$)/);
    if (!bareYearMatch) {
      // Broader fallback: year at word boundary followed by punctuation (handles "Report 2022:")
      bareYearMatch = cleanedText.match(/\s((?:19|20)\d{2})([a-z])?(?=[;.,:\s]|$)/);
    }
    if (bareYearMatch) {
      ref.year = bareYearMatch[1];
      ref.yearSuffix = bareYearMatch[2]?.toLowerCase();
    } else {
      // Try "in press." or "in press" without parens
      const inPressMatch = cleanedText.match(/\bin\s+press\b/i);
      if (inPressMatch) {
        ref.year = 'in press';
      }
    }
  }

  extractDOIAndURL(cleanedText, ref);

  // Authors: everything before year
  if (yearMatch && yearMatch.index !== undefined) {
    const authorSection = cleanedText.slice(0, yearMatch.index).trim();
    // Acronym-colon org author: "KNAW: Royal Dutch Academy of Arts and Sciences."
    // The author is the ACRONYM ("KNAW") — that is how it is cited in-text
    // ("(KNAW, 2018)") and how the reference key must read to match. Parsing the
    // whole spelled-out name as the surname produces a key nothing matches.
    // (citationguard-iterate session 2026-06-07b cycle 5.)
    const acronymOrg = authorSection.match(/^([A-ZÀ-Ÿ]{2,}):\s+[A-ZÀ-Ÿ]/);
    if (acronymOrg) {
      ref.authors = [{
        lastName: acronymOrg[1],
        lastNameNormalized: normalizeName(acronymOrg[1]),
        initials: '',
        isOrganization: true,
      }];
    } else {
      ref.authors = parseAuthorsFromSection(authorSection);
    }
  } else if (ref.year) {
    // Bare year fallback: extract authors from before the bare year
    // For "Bello Luiz. 2024. Title." or "McAllum K, Simpson ML. Title. 2021;43:263"
    // Find everything before the year and take the author portion
    const yearIdx = cleanedText.indexOf(ref.year);
    if (yearIdx > 0) {
      // Authors are before the year; look backward for the author-title boundary
      const beforeYear = cleanedText.slice(0, yearIdx).replace(/[.\s;,]+$/, '').trim();
      // Try to find authors at the start: "AuthorSection. Title portion"
      // For Vancouver: "McAllum K, Simpson ML, Unson C. The socialization..."
      // For ASA bare-year: "Bello Luiz" (just a name before the year)
      const authorTitleSplit = beforeYear.match(/^(.+?)\.\s+[A-Z"]/);
      if (authorTitleSplit) {
        ref.authors = parseAuthorsFromSection(authorTitleSplit[1].trim());
      } else {
        // No clear title split — treat entire beforeYear as author section
        ref.authors = parseAuthorsFromSection(beforeYear);
      }
    }
  } else {
    const firstParen = cleanedText.indexOf('(');
    if (firstParen > 0 && firstParen < 500) {
      ref.authors = parseAuthorsFromSection(cleanedText.slice(0, firstParen).trim());
    }
  }

  fillAuthorFields(ref);

  // Journal info
  const journalMatch = cleanedText.match(REFERENCE_PATTERNS.journalInfo);
  if (journalMatch) {
    ref.volume = journalMatch[1];
    ref.issue = journalMatch[2];
    ref.pages = journalMatch[3];
    ref.type = 'journal';

    if (yearMatch && yearMatch.index !== undefined && journalMatch.index !== undefined) {
      const journalSection = cleanedText.slice(yearMatch.index + yearMatch[0].length, journalMatch.index).trim();
      const journalName = journalSection.replace(/^[.,]\s*/, '').split('.')[0].trim();
      if (journalName.length > 3) ref.source = journalName;
    }
  }

  // Title — the first sentence after the year. In APA/Harvard the title runs
  // from just after "(year)." to the first sentence-ending period; the
  // journal / source / publisher follows. `afterYear` usually starts with the
  // orphan ". " left by the year parenthesis (REFERENCE_PATTERNS.year does not
  // capture the trailing period), so leading punctuation/whitespace must be
  // stripped before the title's terminal period is located — otherwise an
  // indexOf-style search returns 0 and the title comes out empty (the
  // no-issue-journal bug). Anchoring on the first sentence-ending period also
  // stops the title before the journal name on with-issue references.
  if (yearMatch && yearMatch.index !== undefined) {
    const afterYear = cleanedText.slice(yearMatch.index + yearMatch[0].length);
    const titleSection = afterYear.replace(/^[.,\s]+/, '');
    // A title can legitimately contain `?` or `!` mid-title (e.g.
    // "Science or protoscience? Ten years later."). Prefer the first `.` as
    // the terminator so the title is not cut at an interior question mark.
    // Only fall back to `?`/`!` when no period exists in the title section
    // (rare; covers titles that genuinely end with `?` or `!`).
    let sentenceEnd = titleSection.search(/\.(?:\s|$)/);
    if (sentenceEnd < 0) {
      sentenceEnd = titleSection.search(/[?!](?:\s|$)/);
    }
    if (sentenceEnd > 0) {
      ref.title = titleSection.slice(0, sentenceEnd + 1).trim();
    } else if (titleSection) {
      ref.title = titleSection.trim();
    }
  }

  determineType(cleanedText, ref);
  return ref;
}

// ── Vancouver / AMA parser ───────────────────────────────────────────────

function parseVancouverAuthor(str: string): ParsedReferenceAuthor | null {
  const trimmed = str.trim().replace(/^(?:and|&)\s+/i, '');
  if (!trimmed || trimmed.length < 2) return null;

  if (isOrganizationName(trimmed)) {
    return { lastName: trimmed, lastNameNormalized: normalizeName(trimmed), isOrganization: true };
  }

  // Pattern: "Smith JA" — last name then initials (no comma between them).
  // The lastname allows an optional embedded uppercase letter to handle
  // CamelCase surnames like McKendrick, MacDonald, DeScioli, LeBel.
  const m = trimmed.match(/^([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)\s+([A-Z]{1,4})$/);
  if (m) {
    return {
      lastName: m[1],
      lastNameNormalized: normalizeName(m[1]),
      initials: m[2].split('').join('. ') + '.',
      isOrganization: false,
    };
  }

  // Fallback: treat as last name only
  return { lastName: trimmed, lastNameNormalized: normalizeName(trimmed), isOrganization: false };
}

function parseVancouverReference(cleanedText: string, listNumber?: number): ParsedReference {
  const ref = makeEmptyRef(cleanedText, listNumber);
  extractDOIAndURL(cleanedText, ref);

  // Vancouver year: appears after journal abbreviation, before semicolon: "J Educ Res. 2020;45(2):123-145"
  // Or: "2020 Jan 15. doi:..."
  // Reject 4-digit numbers outside the plausible-year range (1800-2099) so that
  // IEEE/Vancouver-style volume / issue / article numbers ("no. 2233", "p. 8400")
  // and arXiv suffix digits ("1209.3632") don't masquerade as the publication year.
  const yearCandidates = [...cleanedText.matchAll(/\.\s*((?:19|20)\d{2})([a-z])?(?=[;,.\s]|$)/g)];
  const yearMatch = yearCandidates.find(m => {
    const y = parseInt(m[1], 10);
    return y >= 1800 && y <= 2099;
  });
  if (yearMatch) {
    ref.year = yearMatch[1];
    if (yearMatch[2]) ref.yearSuffix = yearMatch[2].toLowerCase();
  } else {
    // Fallback: any (19|20)\d{2} as a word-bounded plausible year anywhere in the text
    const fallback = cleanedText.match(/\b((?:19|20)\d{2})([a-z])?\b/);
    if (fallback) {
      ref.year = fallback[1];
      if (fallback[2]) ref.yearSuffix = fallback[2].toLowerCase();
    }
  }

  // Vancouver journal info: 2020;45(2):123-145
  const vjm = cleanedText.match(/((?:19|20)\d{2})[a-z]?;(\d+)\((\d+)\):([\d–\-]+)/);
  if (vjm) {
    ref.year = vjm[1];
    ref.volume = vjm[2];
    ref.issue = vjm[3];
    ref.pages = vjm[4];
    ref.type = 'journal';
  } else {
    // Simpler: vol(issue):pages without year;
    const sjm = cleanedText.match(/(\d+)\((\d+)\):([\d–\-]+)/);
    if (sjm) {
      ref.volume = sjm[1];
      ref.issue = sjm[2];
      ref.pages = sjm[3];
      ref.type = 'journal';
    }
  }

  // Authors: determine author-title boundary
  // Try comma+quote split FIRST (IEEE-format: 'Author A, Author B, "Title," Journal...')
  // Then fall back to period-based split (Vancouver: 'Author A, Author B. Title here...')
  let authorTitleSplit: RegExpMatchArray | null = null;
  let splitType: 'period' | 'quote' = 'period';

  const quoteSplit = cleanedText.match(/^(.+?),\s*"(.+?)"/);
  if (quoteSplit) {
    authorTitleSplit = quoteSplit;
    splitType = 'quote';
  } else {
    authorTitleSplit = cleanedText.match(/^(.+?)\.\s+([A-Z])/);
  }

  if (authorTitleSplit) {
    const authorSection = splitType === 'quote' ? authorTitleSplit[1] : authorTitleSplit[1];
    // Handle "et al" in Vancouver
    // Also normalize the "and" connector: "X Y and W Z" → "X Y, W Z" so that the
    // comma-split below picks up the second author. Without this, a two-author
    // ref like "Pommereau F and Gaucherel C" parses as a single author whose
    // lastName is the whole string. The Oxford-comma form ", and " collapses to
    // ", " (avoiding an empty author chunk).
    const etAlRemoved = authorSection
      .replace(/,?\s*et\s+al\.?$/i, '')
      .replace(/,?\s+and\s+/gi, ', ');
    const authorParts = etAlRemoved.split(/,\s*/);
    for (const part of authorParts) {
      const a = parseVancouverAuthor(part.trim());
      if (a) ref.authors.push(a);
    }

    if (splitType === 'quote') {
      ref.title = authorTitleSplit[2];
    }
  }

  fillAuthorFields(ref);

  // Title: between first period and journal abbreviation/year
  if (authorTitleSplit && splitType === 'period') {
    const afterAuthors = cleanedText.slice(authorTitleSplit.index! + authorTitleSplit[1].length + 2);
    // Title ends at next period followed by abbreviated journal or year
    const titleEnd = afterAuthors.search(/\.\s+(?:[A-Z][a-z]*\s*\.?\s*(?:19|20)\d{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\.?\s*(?:19|20)\d{2})/);
    if (titleEnd > 0) {
      ref.title = afterAuthors.slice(0, titleEnd).trim();
    } else {
      // Fallback: take everything until next period
      const dotPos = afterAuthors.indexOf('.');
      if (dotPos > 0) {
        ref.title = afterAuthors.slice(0, dotPos).trim();
      }
    }
  }

  determineType(cleanedText, ref);
  return ref;
}

// ── IEEE parser ──────────────────────────────────────────────────────────

function parseIEEEReference(cleanedText: string, listNumber?: number): ParsedReference {
  const ref = makeEmptyRef(cleanedText, listNumber);
  extractDOIAndURL(cleanedText, ref);

  // IEEE: [1] J. A. Smith..., "Title," Journal, vol. 45, no. 2, pp. 123-145, 2020. doi: ...
  // Year is near the end, often before doi/URL or at end of string
  // Try: year followed by period (possibly then doi) at end
  const yearEnd = cleanedText.match(/\b((?:19|20)\d{2})\.\s*(?:doi:|$)/i);
  if (yearEnd) {
    ref.year = yearEnd[1];
  } else {
    // Fallback: last 4-digit year in the string
    const allYears = [...cleanedText.matchAll(/\b((?:19|20)\d{2})\b/g)];
    if (allYears.length > 0) ref.year = allYears[allYears.length - 1][1];
  }

  // IEEE vol/no/pp
  const volM = cleanedText.match(/vol\.\s*(\d+)/i);
  const noM = cleanedText.match(/no\.\s*(\d+)/i);
  const ppM = cleanedText.match(/pp\.\s*([\d–\-]+)/i);
  if (volM) ref.volume = volM[1];
  if (noM) ref.issue = noM[1];
  if (ppM) ref.pages = ppM[1];
  if (ref.volume || ref.pages) ref.type = 'journal';

  // Authors: everything before first quoted title
  const titleQuote = cleanedText.match(/^(.+?),\s*"(.+?)"/);
  if (titleQuote) {
    ref.title = titleQuote[2];
    const authorSection = titleQuote[1].trim();
    // IEEE authors: "A. Nordstrom, P. Nordstrom" or "J. Smith and B. Jones"
    // First handle "et al." — strip it and mark count
    const cleanAuthors = authorSection.replace(/\s*et\s+al\.?\s*$/i, '');
    // Split on " and " first, then split each segment by comma+initial
    const andParts = cleanAuthors.split(/,?\s+and\s+/i);
    for (const andPart of andParts) {
      // Split comma-separated authors: "A. Smith, B. Jones" (IEEE) or "Smith JA, Jones BC" (Vancouver)
      const subParts = andPart.split(/,\s+(?=[A-ZÀ-Ÿ]\.?\s*[A-Za-z])/);
      for (const sp of subParts) {
        const trimmed = sp.trim().replace(/,\s*$/, '');
        if (!trimmed) continue;
        // Try: "J. A. Smith" — initials then last name (IEEE)
        const ieeeM = trimmed.match(/^((?:[A-ZÀ-Ÿ]\.[-–—\u00AD]*\s*)+)\s*([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)$/);
        if (ieeeM) {
          ref.authors.push({
            lastName: ieeeM[2],
            lastNameNormalized: normalizeName(ieeeM[2]),
            initials: ieeeM[1].trim(),
            isOrganization: false,
          });
        } else if (isOrganizationName(trimmed)) {
          ref.authors.push({
            lastName: trimmed,
            lastNameNormalized: normalizeName(trimmed),
            initials: '',
            isOrganization: true,
          });
        } else {
          // Fallback handles Vancouver "LastName Initials" format
          const a = parseAuthor(trimmed);
          if (a) ref.authors.push(a);
        }
      }
    }
  } else {
    // No quoted title — IEEE book/report format:
    // "I. Goodfellow, Y. Bengio, and A. Courville, Deep Learning. City: Publisher, Year."
    // Find the author-title boundary by looking for "and <Author>," followed by a title word
    const andAuthorBoundary = cleanedText.match(
      /\band\s+(?:[A-Z]\.\s*)+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?,\s*/
    );
    if (andAuthorBoundary) {
      const authorEnd = andAuthorBoundary.index! + andAuthorBoundary[0].length;
      const authorSection = cleanedText.slice(0, authorEnd).replace(/,\s*$/, '').trim();
      const authorParts = authorSection.split(/\s+and\s+/i);
      for (const part of authorParts) {
        // Split comma-separated authors within each "and"-segment
        const subParts = part.split(/,\s+(?=[A-Z]\.)/);
        for (const sp of subParts) {
          const trimmed = sp.trim().replace(/,\s*$/, '');
          if (!trimmed) continue;
          const ieeeM = trimmed.match(/^((?:[A-Z]\.\s*)+)([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?)$/);
          if (ieeeM) {
            ref.authors.push({
              lastName: ieeeM[2],
              lastNameNormalized: normalizeName(ieeeM[2]),
              initials: ieeeM[1].trim(),
              isOrganization: false,
            });
          } else {
            const a = parseAuthor(trimmed);
            if (a) ref.authors.push(a);
          }
        }
      }
      // Title: everything after author section up to first period
      const titleSection = cleanedText.slice(authorEnd).trim();
      const dotPos = titleSection.indexOf('.');
      if (dotPos > 0) ref.title = titleSection.slice(0, dotPos).trim();
      else ref.title = titleSection.trim();
    } else {
      // Fallback for single-author IEEE books/reports (no "and", no quoted title):
      // "H. L. Van Trees, Optimum Array Processing. City: Publisher, Year."
      // Try to match: initials + last name, followed by comma and title word
      const singleAuthorMatch = cleanedText.match(
        /^((?:[A-Z]\.\s*)+[A-ZÀ-Ÿ][\w\s'-]+?),\s+([A-Z])/
      );
      if (singleAuthorMatch) {
        const authorStr = singleAuthorMatch[1].trim();
        const ieeeM = authorStr.match(/^((?:[A-Z]\.\s*)+)([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)?(?:\s+[A-Z][a-z]+)?)$/);
        if (ieeeM) {
          ref.authors.push({
            lastName: ieeeM[2].trim(),
            lastNameNormalized: normalizeName(ieeeM[2].trim()),
            initials: ieeeM[1].trim(),
            isOrganization: false,
          });
        } else {
          const a = parseAuthor(authorStr);
          if (a) ref.authors.push(a);
        }
        // Title: from after the comma to the next period
        const titleStart = singleAuthorMatch.index! + singleAuthorMatch[1].length + 2;
        const titleSection = cleanedText.slice(titleStart).trim();
        const dotPos = titleSection.indexOf('.');
        if (dotPos > 0) ref.title = titleSection.slice(0, dotPos).trim();
        else ref.title = titleSection.trim();
      }
    }
  }

  fillAuthorFields(ref);
  determineType(cleanedText, ref);
  return ref;
}

// ── Nature parser ────────────────────────────────────────────────────────

function parseNatureReference(cleanedText: string, listNumber?: number): ParsedReference {
  const ref = makeEmptyRef(cleanedText, listNumber);
  extractDOIAndURL(cleanedText, ref);

  // Nature: year at end in parentheses: "...pages (2020)." or "(Publisher, 2020)."
  const yearEnd = cleanedText.match(/\((\d{4}[a-z]?)\)\.\s*$/) ||
    cleanedText.match(/,\s*(\d{4}[a-z]?)\)\.\s*$/);  // "(Publisher, 2020)." book format
  if (yearEnd) {
    const { year, suffix } = parseYear(yearEnd[1]);
    ref.year = year;
    ref.yearSuffix = suffix;
  } else {
    // Fallback
    const fallback = cleanedText.match(/\b((?:19|20)\d{2})\b/);
    if (fallback) ref.year = fallback[1];
  }

  // Nature journal info: "Journal Vol, Pages (Year)."
  const natJm = cleanedText.match(/(\d+),\s*([\d–\-]+)\s*\(\d{4}\)/);
  if (natJm) {
    ref.volume = natJm[1];
    ref.pages = natJm[2];
    ref.type = 'journal';
  }

  // Check if authors use initials-first format (PNAS/Science):
  // "J. M. Wicherts et al., Title..." or "A. Gelman, E. Loken, Title..."
  // Also handles name particles: "S. van Erp" (lowercase particle before last name)
  const initialsFirst = /^(?:[A-ZÀ-Ÿ]\.[-–—\u00AD]*\s*){1,4}(?:[A-ZÀ-Ÿ][a-zà-ÿā-ž]|[a-z]{2,}\s+[A-ZÀ-Ÿ])/.test(cleanedText);

  let authorEndPos = -1;

  if (initialsFirst) {
    // PNAS/initials-first author parsing
    const etAlMatch = cleanedText.match(/et\s+al\.\s*,\s*/);
    if (etAlMatch) {
      // "J. M. Wicherts et al., Title..."
      const authorSection = cleanedText.slice(0, etAlMatch.index!).trim();
      parseInitialsFirstAuthors(authorSection, ref);
      authorEndPos = etAlMatch.index! + etAlMatch[0].length;
    } else {
      // Scan comma-separated segments: each author starts with "I." (initial + period)
      // Title starts when the next segment does NOT begin with an initial.
      let pos = 0;
      let boundary = -1;
      while (pos < cleanedText.length) {
        const commaPos = cleanedText.indexOf(',', pos);
        if (commaPos === -1) break;
        const afterComma = cleanedText.slice(commaPos + 1).trimStart();
        if (/^[A-ZÀ-Ÿ]\./.test(afterComma)) {
          // Next segment starts with an initial → still in authors
          pos = commaPos + 1;
        } else {
          // Next segment is the title
          boundary = commaPos;
          break;
        }
      }
      if (boundary > 0) {
        const authorSection = cleanedText.slice(0, boundary).trim();
        parseInitialsFirstAuthors(authorSection, ref);
        authorEndPos = boundary + 2; // skip ", "
      }
    }

    // Title extraction for initials-first: first period in the title section
    if (authorEndPos > 0) {
      const afterAuthors = cleanedText.slice(authorEndPos).trim();
      const dotPos = afterAuthors.indexOf('.');
      if (dotPos > 0) {
        ref.title = afterAuthors.slice(0, dotPos).trim();
      }
    }
  } else {
    // Standard Nature: "Smith, J. A. & Jones, B. C. Title..." or
    // "Smith, J. A. et al. Title...". The author list ends either at an explicit
    // "et al." (the unambiguous anchor — ~80% of Nature refs) or at the period
    // after the last author. The period heuristic alone mis-fires when the TITLE
    // begins with an acronym / hyphenated-caps token (COVID-19, SARS-CoV-2,
    // IL-12, N-methyl-d-aspartate) or a ligature word (inﬂammatory): those are
    // not [A-Z][a-z]{2,} words, so the search skipped the real boundary and
    // latched onto a later ". Journal" period — emitting the JOURNAL as the title
    // (nat_comms refs #11/16/22/33/45/57 parsed "Brain"/"Sci"/"Proc"/"Exp"). The
    // et-al anchor and a broadened title-word class fix both.
    let titleStartPos = -1;
    const etAlNature = cleanedText.match(/\bet\s+al\.\s+/);
    if (etAlNature && etAlNature.index !== undefined && etAlNature.index > 0) {
      ref.authors = parseAuthorsFromSection(cleanedText.slice(0, etAlNature.index).trim());
      titleStartPos = etAlNature.index + etAlNature[0].length;
    } else {
      // Period after the last author, where the title begins. Title-word
      // alternatives: an article; an ALLCAPS-word + space; a normal Capitalized
      // word (now ligature-tolerant via the ﬁ/ﬂ class); OR an acronym /
      // hyphenated-caps compound (COVID-19, IL-12, N-methyl). The last requires
      // an internal hyphen, which distinguishes it from a bare author initial
      // ("A.") so the boundary is never placed mid-author-list.
      const authorEnd = cleanedText.search(
        /\.\s+(?:(?:An?|The|In|On|To)\s+)?(?:(?:[A-Z]{2,}\s+)?[A-Za-z][a-zﬁﬂﬀﬃﬄ]{2,}|[A-Z][A-Za-z]*[-–][A-Za-z0-9])/
      );
      if (authorEnd > 0) {
        ref.authors = parseAuthorsFromSection(cleanedText.slice(0, authorEnd).trim());
        titleStartPos = authorEnd + 2;
      }
    }

    // Fallback for organization authors (e.g., "R Core Team, R: A Language...")
    // No period-delimited author end; try comma as boundary if first segment looks like an org
    if (ref.authors.length === 0) {
      const firstComma = cleanedText.indexOf(',');
      if (firstComma > 0) {
        const candidate = cleanedText.slice(0, firstComma).trim();
        if (isOrganizationName(candidate) || /^[A-Z][\w\s]+$/.test(candidate)) {
          ref.authors.push({
            lastName: candidate,
            lastNameNormalized: normalizeName(candidate),
            initials: '',
            isOrganization: true,
          });
          if (titleStartPos < 0) titleStartPos = firstComma + 2;
        }
      }
    }

    // Title: between the author boundary and the journal.
    if (titleStartPos > 0) {
      const afterAuthors = cleanedText.slice(titleStartPos);
      const titleEnd = afterAuthors.search(/\.\s+(?:[A-Z][a-z]+\.?\s+\d|[A-Z][a-z]+\s+\d|Preprint|arXiv)/);
      if (titleEnd > 0) {
        ref.title = afterAuthors.slice(0, titleEnd).trim();
      } else {
        const dotPos = afterAuthors.indexOf('.');
        if (dotPos > 0) ref.title = afterAuthors.slice(0, dotPos).trim();
      }
    }
  }

  fillAuthorFields(ref);
  determineType(cleanedText, ref);
  return ref;
}

/**
 * Parse initials-first authors (PNAS/Science format): "J. M. Wicherts", "S. van Erp", "E.-J. Wagenmakers"
 */
function parseInitialsFirstAuthors(authorSection: string, ref: ParsedReference): void {
  const parts = authorSection.split(/,\s+/);
  for (let part of parts) {
    part = part.trim();
    if (!part) continue;
    // Handle "and I. LastName"
    if (/^\s*and\s+/i.test(part)) {
      part = part.replace(/^\s*and\s+/i, '').trim();
    }
    // Match initials-first: "J. M. LastName" or "E.-J. LastName" or "S. van Erp"
    // Initials: one or more [A-Z]. possibly with hyphens (e.g., E.-J. or E.-­J.)
    const ieeeM = part.match(/^((?:[A-ZÀ-Ÿ]\.[-–—\u00AD]*\s*)+)\s*(.+)$/);
    if (ieeeM) {
      ref.authors.push({
        lastName: ieeeM[2].trim(),
        lastNameNormalized: normalizeName(ieeeM[2].trim()),
        initials: ieeeM[1].trim(),
        isOrganization: false,
      });
    } else if (isOrganizationName(part)) {
      ref.authors.push({
        lastName: part,
        lastNameNormalized: normalizeName(part),
        initials: '',
        isOrganization: true,
      });
    } else {
      const a = parseAuthor(part);
      if (a) ref.authors.push(a);
    }
  }
}

// ── Full-name author parser for ASA/Chicago ────────────────────────────────

/**
 * Parse authors from ASA/Chicago format with full first names.
 * Format: "LastName, FirstName [Middle], FirstName [Middle] LastName[, and FirstName LastName]"
 * First author: LastName, FirstName
 * Subsequent authors: FirstName LastName (no comma between first/last)
 */
function parseFullNameAuthors(authorSection: string): ParsedReferenceAuthor[] {
  // Strip editor markers before parsing
  let cleaned = authorSection.replace(/,?\s*\beds?s?\.?\s*$/i, '').trim();
  let mainPart = cleaned;
  let lastAuthorStr: string | null = null;

  // Split off last author (after "and")
  const andMatch = cleaned.match(/^(.+)\band\b\s*(.+)$/);
  if (andMatch) {
    mainPart = andMatch[1].replace(/,\s*$/, '').trim();
    lastAuthorStr = andMatch[2].replace(/\.\s*$/, '').trim();
  }

  const authors: ParsedReferenceAuthor[] = [];

  // Parse first author: "LastName, FirstName [Middle.]"
  const firstCommaIdx = mainPart.indexOf(',');
  if (firstCommaIdx > 0) {
    const firstLastName = mainPart.slice(0, firstCommaIdx).trim();
    const afterComma = mainPart.slice(firstCommaIdx + 1).trim();

    // Split remaining by comma to find additional authors
    // First part is always the first name of the first author
    // Subsequent parts are "FirstName [Middle] LastName" format
    const parts = afterComma.split(/,\s*/);
    const firstName = parts[0].trim();

    authors.push({
      lastName: firstLastName,
      lastNameNormalized: normalizeName(firstLastName),
      firstName,
      isOrganization: false,
    });

    // Additional authors: "FirstName [Middle.] LastName"
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;
      const words = part.split(/\s+/);
      if (words.length >= 2) {
        const lastName = words[words.length - 1];
        const fn = words.slice(0, -1).join(' ');
        authors.push({
          lastName,
          lastNameNormalized: normalizeName(lastName),
          firstName: fn,
          isOrganization: false,
        });
      }
    }
  } else {
    // No comma — single word author or organization
    authors.push({
      lastName: mainPart.trim(),
      lastNameNormalized: normalizeName(mainPart.trim()),
      isOrganization: isOrganizationName(mainPart.trim()),
    });
  }

  // Last author (after "and"): "FirstName [Middle.] LastName" (natural order)
  // OR "LastName, FirstName" (inverted order, e.g., "Gallin-Parisi, Alexandra")
  if (lastAuthorStr) {
    // Check if last author is in inverted "LastName, FirstName" format
    // Handles hyphenated names like "Gallin-Parisi, Alexandra"
    const invertedMatch = lastAuthorStr.match(/^([A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+(?:-[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)*(?:\s+[a-z]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+)*),\s+(.+)$/);
    if (invertedMatch) {
      // Inverted format: "Gallin-Parisi, Alexandra"
      authors.push({
        lastName: invertedMatch[1],
        lastNameNormalized: normalizeName(invertedMatch[1]),
        firstName: invertedMatch[2].replace(/\.\s*$/, '').trim(),
        isOrganization: false,
      });
    } else {
      const words = lastAuthorStr.split(/\s+/);
      if (words.length >= 2) {
        const lastName = words[words.length - 1];
        const fn = words.slice(0, -1).join(' ');
        authors.push({
          lastName,
          lastNameNormalized: normalizeName(lastName),
          firstName: fn,
          isOrganization: false,
        });
      } else if (words.length === 1) {
        authors.push({
          lastName: words[0],
          lastNameNormalized: normalizeName(words[0]),
          isOrganization: isOrganizationName(words[0]),
        });
      }
    }
  }

  return authors;
}

// ── No-comma full-name author parser (PMC ASA format) ────────────────────

/**
 * Parse authors from ASA/PMC format with NO comma between last and first name.
 * First author: "LastName FirstName [Middle]" (inverted, no comma)
 * Subsequent authors: "FirstName [Middle] LastName" (natural order, comma-separated)
 * Last author preceded by "and": "and FirstName LastName"
 *
 * Examples:
 *   "Allard Brian"
 *   "Anderson Kaitlin P., Egalite Anna J., and Mills Jonathan N."
 *   "Children's Defense Fund"
 */
function parseNoCommaFullNameAuthors(authorSection: string): ParsedReferenceAuthor[] {
  let cleaned = authorSection.replace(/,?\s*\beds?s?\.?\s*$/i, '').trim();
  // Remove trailing period
  cleaned = cleaned.replace(/\.\s*$/, '').trim();

  let mainPart = cleaned;
  let lastAuthorStr: string | null = null;

  // Split off last author (after ", and" or " and ")
  const andMatch = cleaned.match(/^(.+?),?\s+\band\b\s+(.+)$/);
  if (andMatch) {
    mainPart = andMatch[1].replace(/,\s*$/, '').trim();
    lastAuthorStr = andMatch[2].replace(/\.\s*$/, '').trim();
  }

  const authors: ParsedReferenceAuthor[] = [];

  // Split by comma to find authors
  const parts = mainPart.split(/,\s*/);

  // First author: "LastName FirstName [Middle]" — inverted order, no comma
  if (parts[0]) {
    const firstPart = parts[0].trim();
    const words = firstPart.split(/\s+/);
    if (words.length >= 2) {
      // First word is last name, rest is first name
      const lastName = words[0];
      const firstName = words.slice(1).join(' ');
      authors.push({
        lastName,
        lastNameNormalized: normalizeName(lastName),
        firstName,
        isOrganization: false,
      });
    } else if (words.length === 1) {
      authors.push({
        lastName: words[0],
        lastNameNormalized: normalizeName(words[0]),
        isOrganization: isOrganizationName(words[0]),
      });
    }
  }

  // Subsequent authors: "FirstName [Middle] LastName" — natural order
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;
    const words = part.split(/\s+/);
    if (words.length >= 2) {
      const lastName = words[words.length - 1];
      const fn = words.slice(0, -1).join(' ');
      authors.push({
        lastName,
        lastNameNormalized: normalizeName(lastName),
        firstName: fn,
        isOrganization: false,
      });
    } else if (words.length === 1) {
      authors.push({
        lastName: words[0],
        lastNameNormalized: normalizeName(words[0]),
        isOrganization: isOrganizationName(words[0]),
      });
    }
  }

  // Last author (after "and"): "FirstName [Middle] LastName" — natural order
  if (lastAuthorStr) {
    const words = lastAuthorStr.split(/\s+/);
    if (words.length >= 2) {
      const lastName = words[words.length - 1];
      const fn = words.slice(0, -1).join(' ');
      authors.push({
        lastName,
        lastNameNormalized: normalizeName(lastName),
        firstName: fn,
        isOrganization: false,
      });
    } else if (words.length === 1) {
      authors.push({
        lastName: words[0],
        lastNameNormalized: normalizeName(words[0]),
        isOrganization: isOrganizationName(words[0]),
      });
    }
  }

  return authors;
}

// ── Bare-year parser (AOM, ASA, Chicago Author-Date) ─────────────────────

function parseBareYearReference(cleanedText: string, listNumber?: number, style?: CitationStyleType): ParsedReference {
  const ref = makeEmptyRef(cleanedText, listNumber);
  extractDOIAndURL(cleanedText, ref);

  // Bare year: "Authors. Year. Title."
  // Pattern: period, then 4-digit year, then period
  const bareYearM = cleanedText.match(/\.\s*((?:19|20)\d{2}[a-z]?)\.\s*/);
  if (bareYearM && bareYearM.index !== undefined) {
    const { year, suffix } = parseYear(bareYearM[1]);
    ref.year = year;
    ref.yearSuffix = suffix;

    // Authors: everything before the year
    const authorSection = cleanedText.slice(0, bareYearM.index).trim();
    // Detect if first author has comma between last name and first name/initials.
    // Standard ASA/Chicago: "LastName, FirstName" or "LastName, I." (has comma)
    // PMC/non-standard: "LastName FirstName" (no comma within author name)
    const hasCommaInFirstAuthor = /^[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+,\s+[A-ZÀ-Ÿ]/.test(authorSection);
    // Detect full-name format: "LastName, FullFirstName" (2+ lowercase chars after initial uppercase)
    const hasFullNames = /^[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+,\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž]{2,}/.test(authorSection);
    // Detect no-comma full-name ASA: "LastName FirstName" (no comma, full first name)
    // E.g., "Anderson Kaitlin P." or "Allard Brian"
    const hasNoCommaFullNames = !hasCommaInFirstAuthor &&
      /^[A-ZÀ-Ÿ][a-zà-ÿā-ž'-]+\s+[A-ZÀ-Ÿ][a-zà-ÿā-ž]{2,}/.test(authorSection);
    // For ASA/Chicago with comma in first author: use full-name parser
    // (handles mixed initials/full-names where 2nd+ authors use natural order)
    // For no-comma full-name ASA: use no-comma parser
    // For formats without comma in first author: use APA parser
    const useFullNameParser = hasFullNames || (hasCommaInFirstAuthor && (style === 'asa' || style === 'chicago-ad'));
    if (hasNoCommaFullNames) {
      ref.authors = parseNoCommaFullNameAuthors(authorSection);
    } else {
      ref.authors = useFullNameParser ? parseFullNameAuthors(authorSection) : parseAuthorsFromSection(authorSection);
    }

    // Title + source: everything after "Year. "
    const afterYear = cleanedText.slice(bareYearM.index + bareYearM[0].length);

    // Check for quoted title (ASA/Chicago)
    const quotedTitle = afterYear.match(/^"(.+?)"\s*\.?\s*/);
    if (quotedTitle) {
      ref.title = quotedTitle[1];
    } else {
      // Non-quoted title: take until next period
      const dotPos = afterYear.indexOf('.');
      if (dotPos > 0) {
        ref.title = afterYear.slice(0, dotPos).trim();
      }
    }
  } else {
    // Fallback to APA parser
    return parseAPAReference(cleanedText, listNumber);
  }

  fillAuthorFields(ref);

  // Journal info: AOM uses "Journal, Vol(Issue): Pages" or similar
  const journalMatch = cleanedText.match(/(\d+)\((\d+)\)[,:]\s*([\d–\-]+)/);
  if (journalMatch) {
    ref.volume = journalMatch[1];
    ref.issue = journalMatch[2];
    ref.pages = journalMatch[3];
    ref.type = 'journal';
  }

  determineType(cleanedText, ref);
  return ref;
}

/**
 * Get the organization abbreviation lookup table
 */
export function getOrganizationAbbreviations(): Record<string, string[]> {
  return { ...ORGANIZATION_ABBREVIATIONS };
}
