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

// Surname-particle whitelist. The optional middle group in author-capture
// patterns is meant to accept compound surnames like "Van der Berg" / "De la
// Cruz" / "Von Restorff", NOT arbitrary sentence prefixes. A bare `[a-z]+`
// previously matched "Replication of Fischhoff (1975)" as one three-word
// author, simultaneously inventing spurious citations and missing the real
// "Fischhoff (1975)". The fix restricts the middle word to known surname
// particles (Dutch/German/French/Italian/Spanish/Portuguese/Scandinavian/
// Semitic). Match is case-insensitive so "Van Der Berg" works too.
// Case-insensitive on the first letter so "Van Knippenberg" / "De Bruin" /
// "Von Restorff" (capital-initial particle, common in narrative reference
// lists) match alongside the lowercase canonical forms ("van der", "de la",
// "von"). The lowercase ASCII characters after the leading letter are
// strict — particles are too short to risk further variation.
// The Dutch contracted-article forms "van't" / "van's" (and bare "'t" / "'s",
// the elided "het"/"des") are listed FIRST so the alternation prefers the
// longer contracted form over bare "van". They match an apostrophe directly
// (no whitespace), which a `${PARTICLE}\s+` consumer would otherwise reject.
// Cycle 25 — "van't Veer".
const SURNAME_PARTICLE =
  "(?:[Vv]an['’]t|[Vv]an['’]s|['’]t|['’]s|[Dd]e|[Dd]el|[Dd]ella|[Dd]ello|[Dd]er|[Dd]en|[Dd]es|[Dd]i|[Dd]u|[Dd]a|[Dd]al|[Dd]alla|[Dd]ei|[Dd]egli|[Dd]elle|[Dd]os|[Dd]as|[Ee]l|[Aa]f|[Aa]v|[Ll]a|[Ll]e|[Ll]os|[Ll]as|[Tt]en|[Tt]er|[Vv]an|[Vv]on|[Yy]|[Zz]u|[Zz]ur|[Aa]l|[Bb]en|[Bb]in|[Ii]bn|[Aa]bu|[Ss]t|[Ss]aint)";
// SURNAME_LASTNAME allows ONE embedded uppercase letter to admit CamelCase
// surnames like McCullough / DeScioli / MacDonald / O'Connor — without
// admitting "FooBarBaz" or two-word phrases. The reference parser got this
// fix in cycle 3 (vancouverMultiAuthorAndConnector); cycle 8 ports it to the
// citation detector after the gate enhancement surfaced 25+ missed
// "McCullough et al." citations in chan_feldman_2025_cogemo.
// Optional generational suffix (Jr / Sr / II / III / IV) after a surname. A
// trailing "Hom Jr" defeated every author-capture pattern that expected a "&",
// ",", or year immediately after the surname, so "(Hom Jr & Van Nuland, 2019)"
// was missed entirely. Baked into SURNAME_LASTNAME (so every pattern — anchored
// bundle fragments included — tolerates it) as a captured-but-stripped tail:
// the suffix is consumed so the pattern keeps matching, then removed from the
// normalized author by createParsedAuthor so the key stays "hom". Cycle 21 (R2).
const GENERATIONAL_SUFFIX = '(?:\\s+(?:Jr|Sr|II|III|IV)\\.?)?';
// The lowercase class includes "ß" (U+00DF) explicitly: the "à-ÿ" range starts
// at U+00E0, one code point above ß, so "Groß" would otherwise truncate to
// "Gro" and the citation be missed. Cycle 23.
const SURNAME_LASTNAME =
  "[A-ZÀ-Ÿ][a-zßà-ÿā-ž'-]+(?:[A-Z][a-zßà-ÿā-ž'-]+)?" + GENERATIONAL_SUFFIX;
// COMPOUND_SURNAME allows 0-2 leading particles ("Van Knippenberg",
// "Von Restorff", "De Bruin", "van der Maas", "de la Cruz") in addition to
// the middle-particle form ("Van der Berg"). Both branches are matched as a
// single unit so multi-author patterns see compound surnames as one unit.
// The {0,2} bound covers up to two stacked particles ("van der", "de la",
// "von der") before the surname; anything beyond two is vanishingly rare.
const COMPOUND_SURNAME =
  `(?:${SURNAME_PARTICLE}\\s+){0,2}${SURNAME_LASTNAME}(?:\\s+${SURNAME_PARTICLE}\\s+${SURNAME_LASTNAME})?`;
// Optional signal-phrase prefix inside parens, e.g. "(e.g., Lakens et al.,
// 2018)" or "(see Hoffrage & Pohl, 2003)". cycle 9 stripped this in the
// multi-citation split handler; cycle 14 extends the strip to single-citation
// patterns so a signal-prefixed paren still detects its citation. Trailing
// whitespace consumed so the rest of the pattern keeps using `\s*` for
// the author position.
const SIGNAL_PREFIX =
  '(?:e\\.g\\.,?|i\\.e\\.,?|cf\\.,?|see(?:[\\s,]+(?:also|for\\s+example|e\\.g\\.?))?\\.?,?|as\\s+in|c\\.f\\.,?' +
  // Multi-word review / recency lead-ins observed inside parentheticals (collabra
  // 2026-06-08c, O2): "(most recently, in Mayiwar et al., 2023)" and "(for reviews
  // see Carter et al., 2019; …)". These are specific multi-word phrases anchored
  // immediately before an "Author, year" inside parens, so the FP surface is small.
  '|most\\s+recently,?\\s+in|for\\s+(?:a\\s+)?reviews?,?\\s+see)\\s+';
// Optional initial(s) prefix on a surname: "S. Lee" / "M. D. Lee" — used to
// disambiguate co-authors who share a surname. Period is REQUIRED after each
// initial (so the pronoun "I" can't accidentally match). 0-3 initials.
// Non-capturing — the surname stays the captured key. Cycle 16.
const INITIAL_PREFIX = '(?:[A-Z]\\.\\s*){0,3}';

// Comprehensive APA 7 citation patterns
const CITATION_PATTERNS = {
  // ============ PARENTHETICAL PATTERNS ============
  
  // Single author: (Smith, 2020) or (Smith, 2020a) or (Smith, n.d.) or (Smith, in press)
  // Optional leading signal-phrase prefix ("e.g.,", "see", "cf.", etc.)
  // Optional leading initial(s) ("S. Lee, 2020").
  singleParenthetical: new RegExp(
    `\\(\\s*(?:${SIGNAL_PREFIX})?${INITIAL_PREFIX}(${COMPOUND_SURNAME})\\s*,\\s*(\\d{4}[a-z]?|n\\.d\\.|in\\s+press)\\s*\\)`,
    'gi',
  ),
  
  // Single with page: (Smith, 2020, p. 15) or (Smith, 2020, pp. 15-20)
  singleWithPage: new RegExp(
    `\\(\\s*${INITIAL_PREFIX}(${SURNAME_LASTNAME})\\s*,\\s*(\\d{4}[a-z]?)\\s*,\\s*(pp?\\.\\s*[\\d–\\-]+)\\s*\\)`,
    'gi',
  ),
  
  // Two authors parenthetical: (Smith & Jones, 2020) - uses ampersand.
  // Optional initial prefix on each surname for disambiguation (S. Lee &
  // Feeley, 2018 / M. D. Lee & Wagenmakers, 2013).
  twoAuthorParenthetical: new RegExp(
    `\\(\\s*(?:${SIGNAL_PREFIX})?${INITIAL_PREFIX}(${COMPOUND_SURNAME})\\s*&\\s*${INITIAL_PREFIX}(${COMPOUND_SURNAME})\\s*,\\s*(\\d{4}[a-z]?|n\\.d\\.)\\s*\\)`,
    'gi',
  ),
  
  // Two authors with page: (Smith & Jones, 2020, p. 15)
  twoAuthorWithPage: new RegExp(
    `\\(\\s*${INITIAL_PREFIX}(${SURNAME_LASTNAME})\\s*&\\s*${INITIAL_PREFIX}(${SURNAME_LASTNAME})\\s*,\\s*(\\d{4}[a-z]?)\\s*,\\s*(pp?\\.\\s*[\\d–\\-]+)\\s*\\)`,
    'gi',
  ),
  
  // Multi-author parenthetical (3-6 authors): "(Hoffrage, Hertwig, & Gigerenzer,
  // 2000)", "(Bosco, Aguinis, Field, Pierce, & Dalton, 2016)". APA 6 / many
  // psychology papers list all authors instead of using "et al."; APA 7 mandates
  // et al. for 3+. The classifyCitation helper collapses 3+ authors → et_al
  // automatically; this pattern just needs to capture them.
  multiAuthorParenthetical: new RegExp(
    `\\(\\s*(${COMPOUND_SURNAME}(?:,\\s+${COMPOUND_SURNAME}){1,5})\\s*,?\\s*&\\s*(${COMPOUND_SURNAME})\\s*,\\s*(\\d{4}[a-z]?|n\\.d\\.)\\s*\\)`,
    'g',
  ),

  // Mixed-list with trailing et al. (APA 7 same-year disambiguator):
  // "(Bartoš, Maier, Wagenmakers, et al., 2022)", "(Maier, Bartoš, et al.,
  // 2022)". Used when two refs share first author + year and need 2+ named
  // authors before collapsing the rest to et al.
  // The `g` flag without `i` is intentional — case-insensitive matching would
  // let the [A-Z] requirement collapse and accept lowercase first letters
  // ("reanalysis, Bartoš, …" — the first \b match position is at "r"
  // unless capitalization is strictly enforced).
  mixedListEtAlParenthetical: new RegExp(
    `\\(\\s*(${COMPOUND_SURNAME}(?:,\\s+${COMPOUND_SURNAME}){1,5})\\s*,?\\s+et\\s*\\.?\\s*al\\.?\\s*,?\\s*(\\d{4}[a-z]?|n\\.d\\.)\\s*\\)`,
    'g',
  ),

  // Mixed-list narrative form: "Bartoš, Maier, Wagenmakers, et al. (2022)".
  // Same disambiguator pattern but with the year in trailing parens rather
  // than the whole thing in parens.
  mixedListEtAlNarrative: new RegExp(
    `\\b(${COMPOUND_SURNAME}(?:,\\s+${COMPOUND_SURNAME}){1,5})\\s*,?\\s+et\\s*\\.?\\s*al\\.?\\s+\\((\\d{4}[a-z]?|n\\.d\\.)\\)`,
    'g',
  ),

  // Multi-author narrative with "and" (APA 6 / older style): "Hart, Lane, and
  // Chinn (2018)", "Arkes, Wortmann, Saville, and Harkness (1981)". 2-5
  // named authors with "and" before the last. classifyCitation collapses
  // 3+ authors → 'et_al'. Cycle 15. Without `i` flag — same reason as
  // mixedListEtAlNarrative (cycle 13): `\b` would otherwise start matches
  // at lowercase words preceding the real author list.
  multiAuthorAndNarrative: new RegExp(
    `\\b(${COMPOUND_SURNAME}(?:,\\s+${COMPOUND_SURNAME}){1,5})\\s*,?\\s+and\\s+(${COMPOUND_SURNAME})\\s+\\((\\d{4}[a-z]?|n\\.d\\.)\\)`,
    'g',
  ),

  // Et al. parenthetical: (Smith et al., 2020) - handles common errors
  // Handles: et al., et al, et. al., etal., Et Al., ET AL.
  // Optional leading signal-phrase prefix (cycle 14).
  etAlParenthetical: new RegExp(
    `\\(\\s*(?:${SIGNAL_PREFIX})?(${SURNAME_LASTNAME})\\s*,?\\s+et\\s*\\.?\\s*al\\.?\\s*,?\\s*(\\d{4}[a-z]?|n\\.d\\.)\\s*\\)`,
    'gi',
  ),

  // ============ HARVARD NO-COMMA PATTERNS (B34) ============
  // Some Harvard / British style guides drop the comma between author and year:
  //   (Smith 2020), (Smith and Jones 2020), (Smith et al. 2020)
  // These patterns require the parens to wrap ONLY the citation (no leading
  // text, no trailing extras besides optional whitespace) so we don't over-
  // match constructions like "(see Figure 2020)" or "(model 2020 baseline)".

  // Single author Harvard no-comma: (Smith 2020) or (Smith 2020a)
  // ALSO accidentally matches "(January 2023)" / "(April 2023)" date references —
  // the consumer filters via isMonthName() before adding the detection.
  singleParentheticalHarvardNoComma: new RegExp(
    `\\(\\s*(${COMPOUND_SURNAME})\\s+(\\d{4}[a-z]?)\\s*\\)`,
    'g',
  ),

  // Two authors Harvard no-comma (uses "and"): (Smith and Jones 2020)
  twoAuthorParentheticalHarvardNoComma: new RegExp(
    `\\(\\s*(${SURNAME_LASTNAME})\\s+and\\s+(${SURNAME_LASTNAME})\\s+(\\d{4}[a-z]?)\\s*\\)`,
    'g',
  ),

  // Et al. Harvard no-comma: (Smith et al. 2020)
  etAlParentheticalHarvardNoComma: new RegExp(
    `\\(\\s*(${SURNAME_LASTNAME})\\s+et\\s*\\.?\\s*al\\.?\\s+(\\d{4}[a-z]?)\\s*\\)`,
    'gi',
  ),

  // Et al. with page: (Smith et al., 2020, p. 15)
  etAlWithPage: new RegExp(
    `\\(\\s*(${SURNAME_LASTNAME})\\s+et\\s*\\.?\\s*al\\.?\\s*,\\s*(\\d{4}[a-z]?)\\s*,\\s*(pp?\\.\\s*[\\d–\\-]+)\\s*\\)`,
    'gi',
  ),
  
  // ============ NARRATIVE PATTERNS ============
  
  // Single author narrative: Smith (2020)
  singleNarrative: new RegExp(
    `\\b(${COMPOUND_SURNAME})\\s+\\((\\d{4}[a-z]?|n\\.d\\.)\\)`,
    'g',
  ),

  // Two authors narrative: Smith and Jones (2020) - uses "and"
  twoAuthorNarrative: new RegExp(
    `\\b(${COMPOUND_SURNAME})\\s+and\\s+(${COMPOUND_SURNAME})\\s+\\((\\d{4}[a-z]?|n\\.d\\.)\\)`,
    'g',
  ),
  
  // Et al. narrative: Smith et al. (2020). Optional trailing page or note inside
  // the parens: "Brandt et al. (2014, p. 218)", "Smith et al. (2020, Experiment 3)".
  etAlNarrative: new RegExp(
    `\\b(${SURNAME_LASTNAME})\\s+et\\s*\\.?\\s*al\\.?\\s+\\((\\d{4}[a-z]?|n\\.d\\.)(?:,\\s*[^)]+)?\\)`,
    'g',
  ),

  // Possessive single: Smith's (2020) study
  possessiveSingle: new RegExp(
    `\\b(${SURNAME_LASTNAME})['’']s\\s+\\((\\d{4}[a-z]?|n\\.d\\.)\\)`,
    'g',
  ),

  // Possessive two authors: Smith and Jones's (2020) study
  possessiveTwoAuthor: new RegExp(
    `\\b(${SURNAME_LASTNAME})\\s+and\\s+(${SURNAME_LASTNAME})['’']s\\s+\\((\\d{4}[a-z]?|n\\.d\\.)\\)`,
    'g',
  ),

  // Possessive et al.: Smith et al.'s (2020) study
  possessiveEtAl: new RegExp(
    `\\b(${SURNAME_LASTNAME})\\s+et\\s*\\.?\\s*al\\.?['’']s\\s+\\((\\d{4}[a-z]?|n\\.d\\.)\\)`,
    'g',
  ),

  // And colleagues: Smith and colleagues (2020) or Smith & colleagues (2020)
  // Must match before two-author narrative pattern
  andColleagues: new RegExp(
    `\\b(${SURNAME_LASTNAME})\\s+(?:and|&)\\s+colleagues\\s+\\((\\d{4}[a-z]?|n\\.d\\.)\\)`,
    'g',
  ),

  // With colleagues: Smith with colleagues (2020)
  withColleagues: new RegExp(
    `\\b(${SURNAME_LASTNAME})\\s+with\\s+colleagues\\s+\\((\\d{4}[a-z]?|n\\.d\\.)\\)`,
    'g',
  ),
  
  // ============ GROUP/ORGANIZATION PATTERNS ============
  
  // Full name with abbreviation: (World Health Organization [WHO], 2020)
  groupWithAbbrev: /\(\s*([A-Z][A-Za-z\s&]+)\s*\[([A-Z]{2,})\]\s*,\s*(\d{4}[a-z]?|n\.d\.)\s*\)/g,
  
  // Abbreviation only: (WHO, 2020) or (CDC, 2020)
  groupAbbrevOnly: /\(\s*([A-Z]{2,})\s*,\s*(\d{4}[a-z]?|n\.d\.)\s*\)/g,

  // Acronym-colon institutional author: (KNAW: Royal Dutch Academy of Arts and
  // Sciences, 2018). Keyed on the acronym. Name part may contain and/&/commas.
  groupAcronymColon: /\(\s*(?:(?:e\.g\.|i\.e\.|see)[\s,]+)?([A-Z]{2,})\s*:\s*[A-Z][A-Za-z&,'’.\-\s]+?\s*,\s*(\d{4}[a-z]?|n\.d\.)\s*\)/g,
  
  // Full organization name: (World Health Organization, 2020)
  // Matches organizations starting with common prefixes
  groupFullName: /\(\s*((?:World|American|National|United|International|European|Centers|Federal|British|Canadian|Australian)[A-Za-z\s&]+(?:Organization|Association|Institute|Agency|Foundation|Committee|Council|Department|Bureau|Board|Commission|Center|Centre|Administration|Service|Office))\s*,\s*(\d{4}[a-z]?|n\.d\.)\s*\)/gi,
  
  // ============ SPECIAL PATTERNS ============
  
  // Secondary source: (Freud, 1923, as cited in Smith, 2020)
  secondarySource: /\(\s*([^,]+)\s*,\s*(\d{4}[a-z]?)\s*,\s*as\s+cited\s+in\s+([^,]+)\s*,\s*(\d{4}[a-z]?)\s*\)/gi,
  
  // Multiple citations: (Smith, 2020; Jones, 2019)
  multipleCitations: /\(\s*([^)]+;\s*[^)]+)\s*\)/g,

  // Same-author multi-year: "(Bishop, 2019, 2020a, 2020b)", "(Thaler, 1985,
  // 1999)", "(e.g., Dickert et al., 2012, 2015)". One author (optionally with
  // an "et al."), then 2+ comma-separated years. Each year becomes its own
  // citation sharing the author. Cycle 18 (2026-05-26 canary audit): the
  // previous `sameAuthorMultipleYears` / `sameAuthorSameYear` patterns were
  // defined but never consumed by any loop, so every bare-year continuation
  // ("2020b", "1999", "2015") was an INTEXT-DETECTION-MISS. This pattern is
  // consumed by an actual loop below. Optional signal prefix ("e.g.,") and
  // optional "et al." are stripped/handled in the loop. The group captures
  // the author, an optional et-al marker, and the full comma-separated year
  // tail; the loop splits the tail on commas. `i` flag for case tolerance.
  sameAuthorMultiYear: new RegExp(
    `\\(\\s*(?:${SIGNAL_PREFIX})?(${COMPOUND_SURNAME})\\s*(,?\\s+et\\s*\\.?\\s*al\\.?)?\\s*,\\s*((?:\\d{4}[a-z]?)(?:\\s*,\\s*\\d{4}[a-z]?){1,8})\\s*\\)`,
    'gi',
  ),
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

// Month names — when a parenthetical like "(January 2023)" or "(April, 2023)"
// is a date reference rather than an author citation, the author-capture
// patterns mis-detect the month as a single-word lastname. citationguard-
// iterate cycle 11 — chan_feldman_2025_cogemo had "(January 2023)" and
// "(April 2023)" surface as spurious detections after gate enhancement
// (cycle 6). Filtering the captured first-author against this set drops the
// false positives without losing real citations (no academic author has a
// month name as their only lastname).
const MONTH_NAMES = new Set([
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

/** True if the captured "first author" is actually a month name. */
function isMonthName(str: string): boolean {
  return MONTH_NAMES.has(str.trim().toLowerCase().replace(/\.$/, ''));
}

// Sentence-initial connectors and adverbs. The 2026-05-26 cycle-1 canary
// audit surfaced four distinct hallucinations of this class across three
// canary papers — citelink parsed sentence-initial "Also,", "Furthermore,",
// "Therefore,", "Recently," as first author when followed by a real
// narrative citation ("Also, Werth and Strack (2003)" matched
// multiAuthorAndNarrative with first author = "Also"). Filtering the captured
// first author against this set drops the spurious detection AND lets
// downstream patterns (twoAuthorNarrative, etAlNarrative) pick up the real
// citation that follows. Conservative blocklist — only words that (a) appear
// at sentence-start in academic prose AND (b) are not credible surnames in
// the reference-list context. Matched case-insensitively, trailing period
// tolerated.
const SENTENCE_CONNECTORS = new Set([
  // additive
  'also', 'additionally', 'furthermore', 'moreover', 'besides', 'likewise', 'similarly',
  // adversative
  'however', 'nevertheless', 'nonetheless', 'conversely', 'instead', 'otherwise', 'yet', 'still',
  // causal
  'therefore', 'thus', 'hence', 'consequently', 'accordingly',
  // temporal / sequential
  'recently', 'previously', 'currently', 'subsequently', 'finally', 'initially',
  'originally', 'eventually', 'meanwhile', 'first', 'second', 'third', 'lastly',
  // emphasis
  'importantly', 'notably', 'interestingly', 'specifically', 'indeed', 'clearly',
  'obviously', 'certainly', 'particularly', 'especially', 'crucially', 'critically',
  // generalising
  'overall', 'generally', 'typically', 'usually', 'often',
  // alternative
  'alternatively',
]);

/** True if the captured "first author" is actually a sentence-initial connector. */
function isSentenceConnector(str: string): boolean {
  return SENTENCE_CONNECTORS.has(str.trim().toLowerCase().replace(/\.$/, ''));
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

  // Strip a trailing generational suffix (Jr / Sr / II / III / IV) from the
  // normalized key so "Hom Jr" matches the reference "Hom". normalizeText has
  // already lowercased and removed the period, so the suffix is a bare word.
  const normalized = normalizeText(trimmed).replace(/\s+(?:jr|sr|ii|iii|iv)$/i, '');

  return {
    raw: trimmed,
    normalized,
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
  
  // ============ GROUP ACRONYM-COLON (institutional author) ============
  CITATION_PATTERNS.groupAcronymColon.lastIndex = 0;
  while ((match = CITATION_PATTERNS.groupAcronymColon.exec(text)) !== null) {
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
      context: extractContext(text, match.index, match[0].length),
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
  
  // ============ MULTI-AUTHOR NARRATIVE WITH "AND" ============
  // Run before twoAuthorNarrative so "Hart, Lane, and Chinn (2018)" isn't
  // partially consumed by a two-author match on "Lane and Chinn (2018)".
  // classifyCitation collapses 3+ authors → 'et_al'.
  CITATION_PATTERNS.multiAuthorAndNarrative.lastIndex = 0;
  while ((match = CITATION_PATTERNS.multiAuthorAndNarrative.exec(text)) !== null) {
    // Sentence-connector guard (2026-05-26 canary audit cycle): the leading
    // captured token in the comma-separated author list is the part most
    // susceptible to absorbing a sentence-initial adverb (e.g. "Also, Werth
    // and Strack (2003)" → first author = "Also"). Skip and let downstream
    // narrative patterns pick up the real citation.
    const firstToken = match[1].split(/\s*,\s*/)[0] ?? '';
    if (isSentenceConnector(firstToken)) continue;
    const { year, suffix } = parseYear(match[3]);
    const authors = [
      ...match[1].split(/\s*,\s*/).map(a => createParsedAuthor(a)),
      createParsedAuthor(match[2]),
    ];
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: classifyCitation(authors, false, false),
      citationStyle: 'narrative',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: match.index, end: match.index + match[0].length },
      context: extractContext(text, match.index, match[0].length),
    });
  }

  // ============ MIXED-LIST NARRATIVE WITH TRAILING ET AL. ============
  CITATION_PATTERNS.mixedListEtAlNarrative.lastIndex = 0;
  while ((match = CITATION_PATTERNS.mixedListEtAlNarrative.exec(text)) !== null) {
    // Sentence-connector guard (mirrors multiAuthorAndNarrative).
    const firstToken = match[1].split(/\s*,\s*/)[0] ?? '';
    if (isSentenceConnector(firstToken)) continue;
    const { year, suffix } = parseYear(match[2]);
    const authors = [
      ...match[1].split(/\s*,\s*/).map(a => createParsedAuthor(a)),
      createParsedAuthor('et al.', true),
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
      context: extractContext(text, match.index, match[0].length),
    });
  }

  // ============ MIXED-LIST WITH TRAILING ET AL. ============
  // Run before multiAuthorParenthetical and twoAuthorParenthetical so
  // "(Bartoš, Maier, Wagenmakers, et al., 2022)" isn't partially consumed
  // by an inner multi-author match on the named prefix.
  CITATION_PATTERNS.mixedListEtAlParenthetical.lastIndex = 0;
  while ((match = CITATION_PATTERNS.mixedListEtAlParenthetical.exec(text)) !== null) {
    // Sentence-connector guard (very rare inside parens but harmless to apply).
    const firstToken = match[1].split(/\s*,\s*/)[0] ?? '';
    if (isSentenceConnector(firstToken)) continue;
    const { year, suffix } = parseYear(match[2]);
    const authors = [
      ...match[1].split(/\s*,\s*/).map(a => createParsedAuthor(a)),
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

  // ============ MULTI-AUTHOR PARENTHETICAL (3-6 AUTHORS) ============
  // Run before twoAuthorParenthetical so "(Hoffrage, Hertwig, & Gigerenzer,
  // 2000)" isn't partially consumed by a two-author match on the trailing
  // pair. classifyCitation collapses 3+ authors → 'et_al'.
  CITATION_PATTERNS.multiAuthorParenthetical.lastIndex = 0;
  while ((match = CITATION_PATTERNS.multiAuthorParenthetical.exec(text)) !== null) {
    // Sentence-connector guard (very rare inside parens but harmless to apply).
    const firstToken = match[1].split(/\s*,\s*/)[0] ?? '';
    if (isSentenceConnector(firstToken)) continue;
    const { year, suffix } = parseYear(match[3]);
    const authors = [
      ...match[1].split(/\s*,\s*/).map(a => createParsedAuthor(a)),
      createParsedAuthor(match[2]),
    ];
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
    if (isMonthName(match[1])) continue;  // "(January 2023)" is a date, not an author
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
    if (isMonthName(match[1])) continue;  // "(January 2023)" is a date, not an author
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
    // Sentence-connector guard — "Recently et al. (2021)" should not parse
    // as a citation; "Recently, Moche and Västfjäll (2021)" should let the
    // multiAuthorAndNarrative loop find the real citation downstream.
    if (isSentenceConnector(match[1])) continue;
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
    // Sentence-connector guard — same rationale as etAlNarrative.
    if (isSentenceConnector(match[1])) continue;
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

    // Sentence-connector guard (2026-05-26 canary audit cycle).
    if (isSentenceConnector(match[1])) continue;

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
  
  // ============ SAME-AUTHOR MULTI-YEAR ============
  // "(Bishop, 2019, 2020a, 2020b)", "(Thaler, 1985, 1999)", "(e.g., Dickert
  // et al., 2012, 2015)". Emits one citation per year, all sharing the author.
  // Runs BEFORE multipleCitations and the single/two-author parenthetical
  // loops so the bare-year tail isn't dropped. cycle 18 (2026-05-26).
  CITATION_PATTERNS.sameAuthorMultiYear.lastIndex = 0;
  while ((match = CITATION_PATTERNS.sameAuthorMultiYear.exec(text)) !== null) {
    const authorName = match[1];
    if (isSentenceConnector(authorName) || isMonthName(authorName)) continue;
    const isEtAl = !!match[2];
    const years = match[3].split(/\s*,\s*/).map(y => y.trim()).filter(Boolean);
    if (years.length < 2) continue; // must be a genuine multi-year list
    const authors = isEtAl
      ? [createParsedAuthor(authorName), createParsedAuthor('et al.', true)]
      : [createParsedAuthor(authorName)];
    // Each year becomes its own citation. addCitation() dedupes by exact
    // (start-end) position, so siblings must get DISTINCT positions or only
    // the first survives. Locate each year token's offset inside the matched
    // text (searching forward from the previous year so repeated years still
    // advance) and give each sibling a narrow position window there. The
    // scorer multisets by citKey (author|year), so these narrow windows only
    // matter for sorting + de-overlap, both of which the identity-aware
    // de-overlap pass below now respects.
    const matchStart = match.index;
    const matchText = match[0];
    let searchFrom = 0;
    for (const rawYear of years) {
      const { year, suffix } = parseYear(rawYear);
      if (!year) continue;
      const yearOffset = matchText.indexOf(rawYear, searchFrom);
      const start = yearOffset >= 0 ? matchStart + yearOffset : matchStart;
      const end = yearOffset >= 0 ? start + rawYear.length : matchStart + matchText.length;
      if (yearOffset >= 0) searchFrom = yearOffset + rawYear.length;
      addCitation({
        raw: matchText,
        normalized: normalizeCitation(matchText),
        type: classifyCitation(authors, false, false),
        citationStyle: 'parenthetical',
        authors,
        year,
        yearSuffix: suffix,
        position: { start, end },
        context: extractContext(text, matchStart, matchText.length),
      });
    }
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

    for (const rawCiteText of multipleCites) {
      // Strip leading signal-phrase prefixes ("e.g.", "i.e.", "cf.", "see",
      // "as in", "e.g.,") — these prevent the anchored `^` regexes below
      // from matching the first item of a multi-citation bundle like
      // "(e.g. Enright & Coyle, 1998; Strelan & Covic, 2006)". Without
      // stripping, every first item that follows a signal phrase is missed
      // and counts as both a detection-recall miss AND (downstream) a
      // matching miss.
      // Strip a leading signal phrase OR bundle connector. Beyond the
      // "e.g./i.e./cf./see/as in" signal phrases, multi-citation bundles
      // join later items with prose connectors — "(Lee, 2019; and
      // Renkewitz & Keiner, 2019)", "(Slovic, 2007, in Mayiwar et al.,
      // 2023)". The leading "and "/"in " on those fragments defeats the
      // `^`-anchored matchers below, dropping the citation. cycle 18
      // (2026-05-26). "and"/"in" are only stripped when followed by an
      // uppercase letter (a surname), so prose like "and 2019" is untouched.
      const citeText = rawCiteText
        .replace(/^(?:e\.g\.?|i\.e\.?|cf\.?|see(?:[\s,]+(?:also|for\s+example|e\.g\.?))?|as in|c\.f\.?|most recently,? in|for (?:a )?reviews?,? see)\s*,?\s+/i, '')
        .replace(/^(?:and|in)\s+(?=[A-ZÀ-Ÿ])/i, '')
        // Strip a TRAILING page locator (", p. 105" / ", pp. 12-15") from a bundle
        // fragment. The fragment matchers below are $-anchored right after the year,
        // so a page suffix dropped the citation — the middle item of "(e.g.,
        // Jeffreys, 1939; M. D. Lee & Wagenmakers, 2013, p. 105; Wasserman, 2000)"
        // was missed (collabra 2026-06-08c). The standalone single-paren patterns
        // already tolerate a page suffix; this brings the bundle path to parity.
        .replace(/,\s*pp?\.\s*\d+(?:\s*[-–—]\s*\d+)?\s*$/i, '');
      // Try to match individual citation patterns

      // Institutional acronym-colon author FIRST: "KNAW: Royal Dutch Academy of
      // Arts and Sciences, 2018" as a bundle item. Keyed on the acronym. The
      // name part may contain "and"/"&"/commas (institution names do), so it is
      // matched non-greedily up to the trailing ", YEAR". cycle 26.
      const acronymColonFrag = citeText.match(
        /^([A-Z]{2,})\s*:\s*[A-Z][A-Za-z&,'’.\-\s]+?\s*,\s*(\d{4}[a-z]?|n\.d\.)$/,
      );
      if (acronymColonFrag) {
        const { year, suffix } = parseYear(acronymColonFrag[2]);
        addCitation({
          raw: `(${citeText})`,
          normalized: normalizeCitation(`(${citeText})`),
          type: 'group',
          citationStyle: 'parenthetical',
          authors: [createParsedAuthor(acronymColonFrag[1])],
          year,
          yearSuffix: suffix,
          position: { start: currentPos, end: currentPos + citeText.length },
          context: extractContext(text, currentPos, citeText.length),
        });
        currentPos += citeText.length + 2;
        continue;
      }

      // Multi-year fragment FIRST: "Dickert et al., 2012, 2015",
      // "Thaler, 1985, 1999", "Bishop, 2019, 2020a, 2020b" appearing as a
      // semicolon-bundle item (e.g. "(...; Dickert et al., 2012, 2015;
      // Slovic & Västfjäll, 2010)"). The single/two/et-al matchers below
      // are `$`-anchored on a SINGLE trailing year, so a multi-year tail
      // fails all of them and the whole fragment is silently dropped. Emit
      // one citation per year, sharing the author. cycle 18 (2026-05-26).
      const multiYearFrag = citeText.match(new RegExp(
        `^(${COMPOUND_SURNAME})(\\s*,?\\s+et\\s*\\.?\\s*al\\.?)?\\s*,\\s*((?:\\d{4}[a-z]?)(?:\\s*,\\s*\\d{4}[a-z]?){1,8})$`,
        'i',
      ));
      if (multiYearFrag && !isSentenceConnector(multiYearFrag[1]) && !isMonthName(multiYearFrag[1])) {
        const fragIsEtAl = !!multiYearFrag[2];
        const fragYears = multiYearFrag[3].split(/\s*,\s*/).map(y => y.trim()).filter(Boolean);
        const fragAuthors = fragIsEtAl
          ? [createParsedAuthor(multiYearFrag[1]), createParsedAuthor('et al.', true)]
          : [createParsedAuthor(multiYearFrag[1])];
        let yearSearchFrom = 0;
        for (const rawYear of fragYears) {
          const { year, suffix } = parseYear(rawYear);
          if (!year) continue;
          const off = citeText.indexOf(rawYear, yearSearchFrom);
          const yStart = off >= 0 ? currentPos + off : currentPos;
          const yEnd = off >= 0 ? yStart + rawYear.length : currentPos + citeText.length;
          if (off >= 0) yearSearchFrom = off + rawYear.length;
          addCitation({
            raw: `(${citeText})`,
            normalized: normalizeCitation(`(${citeText})`),
            type: classifyCitation(fragAuthors, false, false),
            citationStyle: 'parenthetical',
            authors: fragAuthors,
            year,
            yearSuffix: suffix,
            position: { start: yStart, end: yEnd },
            context: extractContext(text, currentPos, citeText.length),
          });
        }
        currentPos += citeText.length + 2;
        continue;
      }

      // Et al. pattern
      const etAlMatch = citeText.match(new RegExp(
        `^(${SURNAME_LASTNAME})\\s*,?\\s+et\\s*\\.?\\s*al\\.?\\s*,?\\s*(\\d{4}[a-z]?|n\\.d\\.)$`,
        'i',
      ));
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
      
      // Two author pattern (with optional initial prefix on each — "S. Lee &
      // Feeley, 2018" / "M. D. Lee & Wagenmakers, 2013"). Uses COMPOUND_SURNAME
      // so a particle surname ("Van Nuland", "De Bruin", "van der Berg") is
      // detected as a bundle-secondary entry — the standalone two-author paren
      // pattern already does; cycle 22 brings the anchored bundle fragment to
      // parity, recovering "(…; Hom Jr & Van Nuland, 2019; …)".
      const twoAuthorMatch = citeText.match(new RegExp(
        `^${INITIAL_PREFIX}(${COMPOUND_SURNAME})\\s*&\\s*${INITIAL_PREFIX}(${COMPOUND_SURNAME})\\s*,\\s*(\\d{4}[a-z]?|n\\.d\\.)$`,
        'i',
      ));
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
      
      // Mixed-list with trailing et al.: "Bartoš, Maier, Wagenmakers, et al., 2022"
      const mixedEtAlMatch = citeText.match(new RegExp(
        `^(${COMPOUND_SURNAME}(?:,\\s+${COMPOUND_SURNAME}){1,5})\\s*,?\\s+et\\s*\\.?\\s*al\\.?\\s*,?\\s*(\\d{4}[a-z]?|n\\.d\\.)$`,
        'i',
      ));
      if (mixedEtAlMatch) {
        const { year, suffix } = parseYear(mixedEtAlMatch[2]);
        const authors = [
          ...mixedEtAlMatch[1].split(/\s*,\s*/).map(a => createParsedAuthor(a)),
          createParsedAuthor('et al.', true),
        ];
        addCitation({
          raw: `(${citeText})`,
          normalized: normalizeCitation(`(${citeText})`),
          type: 'et_al',
          citationStyle: 'parenthetical',
          authors,
          year,
          yearSuffix: suffix,
          position: { start: currentPos, end: currentPos + citeText.length },
          context: extractContext(text, currentPos, citeText.length),
        });
        currentPos += citeText.length + 2;
        continue;
      }

      // Multi-author pattern (3-6 authors): "Bosco, Aguinis, Field, & Dalton, 2016"
      const multiAuthorMatch = citeText.match(new RegExp(
        `^(${COMPOUND_SURNAME}(?:,\\s+${COMPOUND_SURNAME}){1,5})\\s*,?\\s*&\\s*(${COMPOUND_SURNAME})\\s*,\\s*(\\d{4}[a-z]?|n\\.d\\.)$`,
        'i',
      ));
      if (multiAuthorMatch) {
        const { year, suffix } = parseYear(multiAuthorMatch[3]);
        const authors = [
          ...multiAuthorMatch[1].split(/\s*,\s*/).map(a => createParsedAuthor(a)),
          createParsedAuthor(multiAuthorMatch[2]),
        ];
        addCitation({
          raw: `(${citeText})`,
          normalized: normalizeCitation(`(${citeText})`),
          type: classifyCitation(authors, false, false),
          citationStyle: 'parenthetical',
          authors,
          year,
          yearSuffix: suffix,
          position: { start: currentPos, end: currentPos + citeText.length },
          context: extractContext(text, currentPos, citeText.length),
        });
        currentPos += citeText.length + 2;
        continue;
      }

      // Single author pattern (with optional initial prefix — "S. Lee, 2018")
      const singleMatch = citeText.match(new RegExp(
        `^${INITIAL_PREFIX}(${COMPOUND_SURNAME})\\s*,\\s*(\\d{4}[a-z]?|n\\.d\\.)$`,
        'i',
      ));
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
  // (e.g., "Lopez and Rey (2017)" is inside "Merida-Lopez and Rey (2017)").
  //
  // Identity key guards two cases against false removal:
  //  1. Same-author multi-year siblings (cycle 18) — "(Bishop, 2019, 2020a,
  //     2020b)" emits three citations at the SAME source span; without the
  //     identity check each would be "contained" by the others and ALL three
  //     would be dropped.
  //  2. Genuine duplicates (same span AND same identity) are still collapsed
  //     to one.
  // A citation is dropped only if another citation has a STRICTLY larger span
  // containing it, OR an equal span with a DIFFERENT-and-already-kept identity
  // is the same physical detection (true duplicate, same identity).
  const identityKey = (c: DetectedCitation) =>
    `${c.authors.map(a => a.normalized).join('+')}|${c.year}|${c.yearSuffix ?? ''}`;
  const deoverlapped: DetectedCitation[] = [];
  const keptKeys = new Set<string>();
  for (const c of citations) {
    const cKey = identityKey(c);
    const strictlyContained = citations.some(other =>
      other !== c &&
      identityKey(other) !== cKey &&
      other.position.start <= c.position.start &&
      other.position.end >= c.position.end &&
      (other.position.end - other.position.start) > (c.position.end - c.position.start)
    );
    if (strictlyContained) continue;
    // Collapse exact-identity duplicates (same author+year+suffix), keeping
    // the first by position (already sorted).
    const dupKey = `${cKey}@${c.position.start}-${c.position.end}`;
    if (keptKeys.has(dupKey)) continue;
    keptKeys.add(dupKey);
    deoverlapped.push(c);
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




