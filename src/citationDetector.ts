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
  // Statistical-software org authors cited as the tool acronym ("JASP Team" → cited
  // in-text as "JASP (2023)"). (scimeto-iterate cycle 7, collabra — R-0177.)
  'JASP': ['JASP Team'],
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
// The Welsh patronymics "ap"/"ab" ("son of") are real surname particles —
// "Ap Cenydd", "Ab Owen". Without them the citation detector keyed
// "(Headleand, Jackson, Williams, Priday, Teahan, & Ap Cenydd, 2016)" on the
// bare last token "Cenydd" and DROPPED the five preceding authors, so the
// citation never matched its reference (whose positional `Lastname, Initials`
// parse had kept "Ap Cenydd" whole all along — the asymmetry was the bug).
// scimeto-iterate 2026-08-04, R-0177 Sonnet audit on annals_1.
const SURNAME_PARTICLE =
  "(?:[Vv]an['’]t|[Vv]an['’]s|['’]t|['’]s|[Dd]e|[Dd]el|[Dd]ella|[Dd]ello|[Dd]er|[Dd]en|[Dd]es|[Dd]i|[Dd]u|[Dd]a|[Dd]al|[Dd]alla|[Dd]ei|[Dd]egli|[Dd]elle|[Dd]os|[Dd]as|[Ee]l|[Aa]f|[Aa]v|[Ll]a|[Ll]e|[Ll]os|[Ll]as|[Tt]en|[Tt]er|[Vv]an|[Vv]on|[Yy]|[Zz]u|[Zz]ur|[Aa]l|[Aa]p|[Aa]b|[Bb]en|[Bb]in|[Ii]bn|[Aa]bu|[Ss]t|[Ss]aint)";
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
// A parenthesized PREFERRED-NAME aside may precede a surname inside an author
// list, when an author publishes under a given name that differs from their legal
// first name and the journal prints it parenthesized:
//
//   "(Fox, (Grace) Ahn, Janssen, Yeykelis, Segovia, & Bailenson, 2015)"
//
// Without this, the author-list alternation cannot cross "(Grace)", so the whole
// citation failed to match and was never detected at all (annals_1 cites this
// reference once; the reference parser dropped its first author on the same
// input — see parseAuthorsFromSection).
//
// Deliberately restricted to a single short Capitalized alphabetic token so it
// cannot swallow a nested real citation, an "(e.g., …)" signal phrase, or a year.
// It is NOT anchored to the start of the surname group, so an aside is tolerated
// wherever it appears between authors.
//
// Editorial ROLE words are excluded via a negative lookahead rather than by relying
// on their trailing period, which upstream normalization can drop — a period-less
// "(Ed)" otherwise reads as a preferred name. (The reference-side twin of this
// oversight manufactured a spurious "Aguinis 2004" reference in annals_4; see
// parseAuthorsFromSection.)
// (scimeto-iterate 2026-08-04, annals_1 — R-0177 Sonnet audit, Fox 2015.)
// Spelled-out role words are listed alongside the abbreviations — excluding only
// "Ed"/"Eds" leaves the same hazard open for any journal that writes "(Editor)".
// (codex cross-model review 2026-08-04.)
const EDITORIAL_ROLE_WORD =
  '(?:Eds?|Editors?|Trans|Translators?|Comps?|Compilers?|Illus|Illustrators?|Narr|Narrators?|Dir|Directors?|Prod|Producers?|Chairs?|Vol|Pt|No)';
const PREFERRED_NAME_ASIDE =
  `(?:\\(\\s*(?!${EDITORIAL_ROLE_WORD}\\s*\\.?\\s*\\))[A-ZÀ-Ÿ][a-zà-ÿā-ž'’-]{1,20}\\s*\\.?\\s*\\)\\s*)?`;
const COMPOUND_SURNAME =
  `${PREFERRED_NAME_ASIDE}(?:${SURNAME_PARTICLE}\\s+){0,2}${SURNAME_LASTNAME}(?:\\s+${SURNAME_PARTICLE}\\s+${SURNAME_LASTNAME})?`;
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
  // see Carter et al., 2019; …)". The `for <prose> see` form is generalized to
  // arbitrary short prose so "(for recent reviews, see …)" and "(for criticisms of
  // the challenge, see Huber et al., 2014; …)" strip too (xiao_2021, cycle 6).
  // Bounded to 40 non-comma/semicolon/paren chars so the FP surface stays small.
  '|most\\s+recently,?\\s+in|for\\s+[^,;()]{0,40}?,?\\s*see' +
  // "see <short prose> in <Citation>" / "also see interview in …" — a see-lead-in
  // that points INTO a work, ending in " in" before the author. chen
  // "(Fischhoff, 2007, p. 11; also see interview in Klein, Hegarty, & Fischhoff,
  // 2017)" lost the 2nd citation: the ";"-split segment began with this prose and
  // the existing "see(also)?" branch did not consume the "interview in" tail, so
  // the author position never reached "Klein". Bounded to 30 non-comma/semicolon/
  // paren chars. (scimeto-iterate 2026-06-25, chen — R-0177 Sonnet audit.)
  '|(?:also\\s+)?see\\s+[^,;()]{0,30}?\\s+in)\\s+';
// Optional initial(s) prefix on a surname: "S. Lee" / "M. D. Lee" — used to
// disambiguate co-authors who share a surname. Period is REQUIRED after each
// initial (so the pronoun "I" can't accidentally match). 0-3 initials.
// Non-capturing — the surname stays the captured key. Cycle 16.
const INITIAL_PREFIX = '(?:[A-Z]\\.\\s*){0,3}';

// Organizational / multi-word author: a run of 2+ capitalized tokens that are
// NOT joined by a surname particle — "Open Science Collaboration", "R Core
// Team", "Pew Research Center". COMPOUND_SURNAME captures only the LAST token of
// such a run (it expects a single surname optionally extended by a whitelisted
// particle), so the citation was mis-keyed to that last token standalone
// ("(R Core Team, 2019)" -> "team") and dropped entirely inside a ';'-bundle
// ("(...; Open Science Collaboration, 2015)"). This is the APA analog of the
// Harvard multi-token in-text surname work (H2-B, cycle 2). Cycle 4
// (2026-06-17, APA-ORG-AUTHOR).
//
// Whitespace-joined capitalized tokens ONLY — NO lowercase connective ("and",
// "of", "for") is admitted between tokens. This is deliberate: a two-author
// parenthetical written with a lowercase "and" ("Smith and Jones, 2020") must
// NEVER be swallowed as a single org author, and a run stops at the first
// lowercase word so "(See Smith, 2020)" / "(In Tykocinski et al., 2023)" can't
// be glued. The leading-token prose guard (orgLeadAllowed) drops the residual
// "Capitalized prose word + Surname" false positives the [A-Z]-anchor lets
// through.
const ORG_CAP_TOKEN = "[A-Z][\\w.'’\\-]*";
const ORG_AUTHOR = `${ORG_CAP_TOKEN}(?:\\s+${ORG_CAP_TOKEN}){1,5}`;

// A trailing in-paren QUALIFIER after the year of a NARRATIVE citation. Two
// forms, because two style families write the page locator differently:
//   APA           "Teple (1949, p. 153)", "Slovic and Fischhoff (1977, Experiment 3)"
//   AOM / Chicago "Teple (1949: 153)", "Keltner et al. (2003: 268-269)"
// Every narrative pattern anchors on the closing paren immediately after the
// year, so an untolerated qualifier does not degrade the match - it destroys it.
//
// Measured 2026-09-01 across the 18-paper iterate corpus (scimeto-iterate
// cycle 9): the colon form was detected by NONE of the five narrative patterns,
// and 11 of the 83 remaining in-text recall misses are exactly this shape, in
// amj_1, annals_2 and annals_3 - 13% of all remaining recall loss from one gap.
//
// Worse, and this one is a WRONG VALUE rather than a missing one:
// mixedListEtAlNarrative and multiAuthorAndNarrative carried NO tolerance at all,
// not even the APA comma form the other three had. So "Ferris, Liden, Munyon,
// Summers, Basik, and Buckley (2009, p. 1397)" fell through to singleNarrative and
// was mis-keyed to the LAST author - reported as Buckley (2009). A citation
// attributed to the wrong first author resolves to the wrong reference, or to
// none, so an honest manuscript is accused of an unmatched citation.
//
// The colon branch requires a DIGIT after the colon, mirroring the rule already
// used by the ';'-bundle splitter, so a real "Author: Title" or an institutional
// "ACRONYM: Name" cannot be swallowed. tests/narrativeColonPageLocator.test.ts
// asserts that control alongside the APA-comma and bare-year controls.
// A qualifier is a PAGE or a NOTE - never a YEAR LIST. The comma branch refuses
// a qualifier that opens with a bare year followed by ',' or ')', because that is
// the multi-year shape "(2018, 2019, 2020)" that sameAuthorMultiYearNarrative
// owns, emitting one citation per year at its own narrow window. Without the
// refusal, the narrative pattern matches the whole list as ONE citation whose span
// strictly CONTAINS those siblings, and the de-overlap pass then drops every
// sibling - turning three citations into one. (Caught by
// tests/multiAuthorMultiYearNarrative.test.ts the moment the qualifier reached
// multiAuthorAndNarrative; it is the same containment hazard the emitAllBundleYears
// comment describes, reached from the other direction.)
const NARRATIVE_QUALIFIER =
  '(?:,(?!\\s*(?:19|20)\\d{2}[a-z]?\\s*[,)])\\s*[^)]+|:\\s*\\d[^)]*)?';

// The YEAR slot of a citation. Three forms, and all three are load-bearing:
//   1999 / 1999a   an ordinary year, optionally lettered when one author has
//                  several works in it
//   n.d. / n.d.a   an UNDATED source - the lettered form is standard APA and AOM
//                  when one author has several undated works, exactly as 2019a is
//                  for dated ones
//   in press       accepted, not published yet
//
// This module's header has advertised "Special dates (n.d., in press)" since it
// was written. Measured 2026-09-01 across 8 citation shapes (scimeto-iterate
// cycle 9): "in press" was detected in exactly ONE of them, and "n.d.a"/"n.d.b" in
// NONE. A citation the library claims to support and silently does not detect is a
// recall loss with a documentation claim on top of it - the header comment was not
// evidence, and is not evidence now either; tests/nonNumericYearParity.test.ts is.
//
// Corpus incidence: 5 "in press" citations across annals_2 and annals_4, 2
// "n.d.a"/"n.d.b" in annals_3, every one of them scored as a recall miss.
//
// Used ONLY by the patterns that already admitted n.d. The bare-year forms that
// carry no comma before the year ("(Smith 2020)") and the multi-year lists keep a
// numeric-only year on purpose: a two-word "in press" there would let ordinary
// prose - "(as noted in press releases)" - pose as a citation.
const YEAR_TOKEN = '\\d{4}[a-z]?|n\\.d\\.[a-z]?|in\\s+press';

// Comprehensive APA 7 citation patterns
const CITATION_PATTERNS = {
  // ============ PARENTHETICAL PATTERNS ============
  
  // Single author: (Smith, 2020) or (Smith, 2020a) or (Smith, n.d.) or (Smith, in press)
  // Optional leading signal-phrase prefix ("e.g.,", "see", "cf.", etc.)
  // Optional leading initial(s) ("S. Lee, 2020").
  singleParenthetical: new RegExp(
    `\\(\\s*(?:${SIGNAL_PREFIX})?${INITIAL_PREFIX}(${COMPOUND_SURNAME})\\s*,\\s*(${YEAR_TOKEN})\\s*\\)`,
    'gi',
  ),

  // Organizational / multi-word author parenthetical: (R Core Team, 2019),
  // (Open Science Collaboration, 2015). 2-6 whitespace-joined capitalized tokens
  // followed by ", year". NO `i` flag — the [A-Z] anchor in ORG_CAP_TOKEN must
  // hold so lowercase prose can't lead the run. The leading-token prose guard
  // (orgLeadAllowed) in the consumer drops "Capitalized-prose-word + Surname"
  // residue. Runs AFTER singleParenthetical so a single/compound surname is
  // always preferred. Cycle 4 (APA-ORG-AUTHOR).
  orgMultiWordParenthetical: new RegExp(
    `\\(\\s*(?:${SIGNAL_PREFIX})?(${ORG_AUTHOR})\\s*,\\s*(${YEAR_TOKEN})\\s*\\)`,
    'g',
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
    `\\(\\s*(?:${SIGNAL_PREFIX})?${INITIAL_PREFIX}(${COMPOUND_SURNAME})\\s*&\\s*${INITIAL_PREFIX}(${COMPOUND_SURNAME})\\s*,\\s*(${YEAR_TOKEN})\\s*\\)`,
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
    `\\(\\s*(${COMPOUND_SURNAME}(?:,\\s+${COMPOUND_SURNAME}){1,5})\\s*,?\\s*&\\s*(${COMPOUND_SURNAME})\\s*,\\s*(${YEAR_TOKEN})\\s*\\)`,
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
    `\\(\\s*(${COMPOUND_SURNAME}(?:,\\s+${COMPOUND_SURNAME}){1,5})\\s*,?\\s+et\\s*\\.?\\s*al\\.?\\s*,?\\s*(${YEAR_TOKEN})\\s*\\)`,
    'g',
  ),

  // Mixed-list narrative form: "Bartoš, Maier, Wagenmakers, et al. (2022)".
  // Same disambiguator pattern but with the year in trailing parens rather
  // than the whole thing in parens.
  mixedListEtAlNarrative: new RegExp(
    `\\b(${COMPOUND_SURNAME}(?:,\\s+${COMPOUND_SURNAME}){1,5})\\s*,?\\s+et\\s*\\.?\\s*al\\.?\\s+\\((${YEAR_TOKEN})${NARRATIVE_QUALIFIER}\\)`,
    'g',
  ),

  // Multi-author narrative with "and" (APA 6 / older style): "Hart, Lane, and
  // Chinn (2018)", "Arkes, Wortmann, Saville, and Harkness (1981)". 2-5
  // named authors with "and" before the last. classifyCitation collapses
  // 3+ authors → 'et_al'. Cycle 15. Without `i` flag — same reason as
  // mixedListEtAlNarrative (cycle 13): `\b` would otherwise start matches
  // at lowercase words preceding the real author list.
  multiAuthorAndNarrative: new RegExp(
    `\\b(${COMPOUND_SURNAME}(?:,\\s+${COMPOUND_SURNAME}){1,5})\\s*,?\\s+(?:and|&)\\s+(${COMPOUND_SURNAME})\\s+\\((${YEAR_TOKEN})${NARRATIVE_QUALIFIER}\\)`,
    'g',
  ),

  // Et al. parenthetical: (Smith et al., 2020) - handles common errors
  // Handles: et al., et al, et. al., etal., Et Al., ET AL.
  // Optional leading signal-phrase prefix (cycle 14).
  etAlParenthetical: new RegExp(
    `\\(\\s*(?:${SIGNAL_PREFIX})?(${SURNAME_LASTNAME})\\s*,?\\s+et\\s*\\.?\\s*al\\.?\\s*,?\\s*(${YEAR_TOKEN})\\s*\\)`,
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

  // Two authors Harvard no-comma (uses "and" or "&"): (Smith and Jones 2020) /
  // (Smith & Jones 2020) — the ampersand no-comma form is also valid Harvard.
  twoAuthorParentheticalHarvardNoComma: new RegExp(
    `\\(\\s*(${SURNAME_LASTNAME})\\s+(?:and|&)\\s+(${SURNAME_LASTNAME})\\s+(\\d{4}[a-z]?)\\s*\\)`,
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
  
  // Single author narrative: Smith (2020). A trailing in-paren qualifier after the
  // year — "Smith (2020, p. 12)", "Slovic and Fischhoff (1977, Experiment 3)" — is
  // optional and ignored (same `(?:,\s*[^)]+)?` tolerance the et-al narrative already
  // has; without it the closing-paren anchor fails and the citation is missed).
  // (scimeto-iterate cycle 7, chen — R-0177 Sonnet deep audit.)
  singleNarrative: new RegExp(
    `\\b(${COMPOUND_SURNAME})\\s+\\((${YEAR_TOKEN})${NARRATIVE_QUALIFIER}\\)`,
    'g',
  ),

  // Two authors narrative: Smith and Jones (2020) - uses "and". Trailing in-paren
  // qualifier after the year is optional and ignored (see singleNarrative).
  // Two-author narrative: "Smith and Jones (2020)" / "Wang & Benbasat (2007)".
  // The connector accepts BOTH "and" and "&" — the ampersand form is common in
  // narrative citations too, and the parenthetical patterns (twoAuthorParenthetical)
  // already accept `&`. Before this, only literal "and" matched, so "Wang &
  // Benbasat (2007)" fell through to singleNarrative and was mis-keyed to the LAST
  // author ("Benbasat") instead of first-author "Wang" (scimeto-iterate cycle
  // 9, annals_1 — a Glikson & Woolley trust-in-AI review that uses "&" narratively
  // throughout: Möhlmann & Zalmanson, Wang & Benbasat, Komiak & Benbasat, …).
  twoAuthorNarrative: new RegExp(
    `\\b(${COMPOUND_SURNAME})\\s+(?:and|&)\\s+(${COMPOUND_SURNAME})\\s+\\((${YEAR_TOKEN})${NARRATIVE_QUALIFIER}\\)`,
    'g',
  ),
  
  // Et al. narrative: Smith et al. (2020). Optional trailing page or note inside
  // the parens: "Brandt et al. (2014, p. 218)", "Smith et al. (2020, Experiment 3)".
  // First author is COMPOUND_SURNAME (not plain SURNAME_LASTNAME) so a multi-word
  // PARTICLE surname is captured whole: "de Visser et al. (2017)", "Ben Mimoun et
  // al. (2012)", "Von Der Pütten et al. (2010)". Before this, SURNAME_LASTNAME
  // dropped the particle and keyed the citation on the last name-part ("visser",
  // "mimoun", "putten"), so it never matched its reference (scimeto-iterate
  // cycle 9, annals_1 — Dutch/Arabic/German particle surnames throughout).
  etAlNarrative: new RegExp(
    `\\b(${COMPOUND_SURNAME})\\s+et\\s*\\.?\\s*al\\.?\\s+\\((${YEAR_TOKEN})${NARRATIVE_QUALIFIER}\\)`,
    'g',
  ),

  // Same-author multi-year NARRATIVE: "McCullough et al. (1997, 1998)", "Bishop
  // (2019, 2020)", "Werth and Strack (2001, 2003)". The narrative analog of
  // `sameAuthorMultiYear` (which handles the PARENTHETICAL "(Bishop, 2019, 2020)").
  // The et-al / single / two-author narrative patterns each accept an OPTIONAL
  // trailing in-paren qualifier (`(?:,\s*[^)]+)?`) that ignores "(1997, p. 12)" /
  // "(2020, Experiment 3)" — but that same tolerance SWALLOWS a genuine second
  // YEAR ("(1997, 1998)"), emitting only the first year and dropping the rest
  // (scimeto-iterate cycle 7 TC-I, chan McCullough — R-0177 Sonnet audit).
  // This pattern fires FIRST on a PURE year-list (2+ comma-separated years, no
  // page/note token), emitting one citation per year at a distinct position
  // window (mirroring the parenthetical loop). group 1 = first surname; group 2 =
  // the connector (` et al.` / ` and <Surname>` / empty); group 3 = the year list.
  // A non-year qualifier (`p. 12`, `Experiment 3`) does NOT match group 3, so the
  // existing single/two/et-al narrative loops keep owning the qualifier case.
  // group 1 = the leading author list (one surname, OR a comma-separated run of
  //   2+ surnames — "de Melo, Marsella" — for the explicit multi-author form).
  // group 2 = the connector: " et al." | " and/&  <LastSurname>" (with an optional
  //   Oxford comma before the connector, "…, & Gratch") | empty.
  // group 3 = the pure year list (2+ years).
  // TC-MULTIYEAR-NARRATIVE-MULTIAUTHOR (scimeto-iterate 2026-07-04): before,
  // group 1 was a SINGLE surname, so "de Melo, Marsella, & Gratch (2016, 2017)" did
  // not match at "de Melo" (the ", Marsella, &…" tail was neither an et-al nor an
  // "and <Surname>" connector) and instead matched at the LAST author "Gratch",
  // mis-keying both year siblings to gratch. group 1 now admits the comma list and
  // the handler splits it, so the citation keys on the FIRST author (de melo).
  sameAuthorMultiYearNarrative: new RegExp(
    `\\b(${COMPOUND_SURNAME}(?:\\s*,\\s*${COMPOUND_SURNAME})*)` +
      `(\\s+et\\s*\\.?\\s*al\\.?|\\s*,?\\s*(?:and|&)\\s+${COMPOUND_SURNAME})?` +
      `\\s+\\(((?:\\d{4}[a-z]?)(?:\\s*,\\s*\\d{4}[a-z]?)+)\\)`,
    'g',
  ),

  // UNPARENTHESIZED multi-author narrative with a bare comma-year, followed by a
  // reporting verb:
  //
  //   "In a meta-analysis of 32 studies, Fox, (Grace) Ahn, Janssen, Yeykelis,
  //    Segovia, & Bailenson, 2015 found that when avatars were presented…"
  //
  // The year carries NO parentheses, so every narrative pattern above (which anchor
  // on `\(year\)`) misses it and the citation was never detected at all — annals_1,
  // R-0177 Sonnet audit (the "Fox" finding), scimeto-iterate 2026-08-04.
  //
  // DELIBERATELY TIGHT, because "Surname, YYYY" in running prose is overwhelmingly
  // NOT a citation. Measured over the 18-paper corpus body text (reference lists
  // excluded): a loose `Surname, YYYY` rule fires 42 times to catch this ONE real
  // citation — ~2% precision, matching country-year pairs ("Poland, 2015"), date
  // ranges ("Italy, 1992-"), and multi-line parenthetical spillover. This pattern
  // instead requires ALL of:
  //   1. an explicit list of >=3 comma-separated capitalized surnames,
  //   2. a final "& Surname" connector (the multi-author shape),
  //   3. a bare `, YYYY`, and
  //   4. an immediately-following REPORTING VERB.
  // With those four, it scores 1 hit / 1 true positive / 0 false positives on the
  // same corpus. If this ever needs loosening, re-measure precision first — the
  // over-detection risk here is far larger than the recall gain.
  bareYearMultiAuthorNarrative: new RegExp(
    `\\b(${COMPOUND_SURNAME}(?:\\s*,\\s*${COMPOUND_SURNAME}){1,})\\s*,\\s*&\\s*(${COMPOUND_SURNAME})` +
      `\\s*,\\s*(\\d{4}[a-z]?)\\s+` +
      `(?:found|showed|shows|demonstrated|demonstrates|reported|reports|argued|argues|` +
      `noted|notes|observed|observes|concluded|concludes|suggested|suggests|examined|` +
      `examines|proposed|proposes|revealed|reveals|documented|documents|established)\\b`,
    'g',
  ),

  // Et al. narrative with the FULL reference inlined in square brackets:
  // "McCullough et al. [McCullough, M. E., Worthington, E. L., & Rachal, K. C.
  // (1997). Interpersonal Forgiving… 73(2), 321-336.] demonstrated…". An unusual
  // form (a narrative et-al lead-in whose bracket spells out the whole reference)
  // seen in chan_feldman_2025_cogemo's abstract (TC-J, scimeto-iterate cycle
  // 8, R-0177 Sonnet audit). The bracket opener is TIGHTLY anchored — it must begin
  // with an author-list token `Surname, X.` (surname, comma, initial+dot) — so it
  // can never fire on an editorial bracket (`[Note: …]`, `[sic]`), a numeric
  // citation (`[12]`), or a bracketed quote. group 1 = the lead-in surname; group 2
  // = the FIRST year inside the bracket (the reference's publication year).
  etAlBracketedInlineRef: new RegExp(
    `\\b(${SURNAME_LASTNAME})\\s+et\\s*\\.?\\s*al\\.?\\s+` +
      `\\[${SURNAME_LASTNAME},\\s*[A-Z]\\.[^\\]]*?\\((\\d{4}[a-z]?)\\)`,
    'g',
  ),

  // Possessive single: Smith's (2020) study
  possessiveSingle: new RegExp(
    `\\b(${SURNAME_LASTNAME})['’']s\\s+\\((${YEAR_TOKEN})\\)`,
    'g',
  ),

  // Possessive two authors: Smith and Jones's (2020) / Wang & Benbasat's (2007)
  possessiveTwoAuthor: new RegExp(
    `\\b(${SURNAME_LASTNAME})\\s+(?:and|&)\\s+(${SURNAME_LASTNAME})['’']s\\s+\\((${YEAR_TOKEN})\\)`,
    'g',
  ),

  // Possessive et al.: Smith et al.'s (2020) study
  possessiveEtAl: new RegExp(
    `\\b(${SURNAME_LASTNAME})\\s+et\\s*\\.?\\s*al\\.?['’']s\\s+\\((${YEAR_TOKEN})\\)`,
    'g',
  ),

  // And colleagues: Smith and colleagues (2020) or Smith & colleagues (2020)
  // Must match before two-author narrative pattern
  andColleagues: new RegExp(
    `\\b(${SURNAME_LASTNAME})\\s+(?:and|&)\\s+colleagues\\s+\\((${YEAR_TOKEN})\\)`,
    'g',
  ),

  // With colleagues: Smith with colleagues (2020)
  withColleagues: new RegExp(
    `\\b(${SURNAME_LASTNAME})\\s+with\\s+colleagues\\s+\\((${YEAR_TOKEN})\\)`,
    'g',
  ),
  
  // ============ GROUP/ORGANIZATION PATTERNS ============
  
  // Full name with abbreviation: (World Health Organization [WHO], 2020).
  // The name char class includes hyphen / apostrophe / period so a hyphenated or
  // compound organization name parses ("Collaborative Open-science REsearch
  // [CORE], 2020"). Without the hyphen the name run broke at "Open-science" and
  // the whole group citation was missed (xiao_2021 / APA-ORG-AUTHOR cycle 4).
  groupWithAbbrev: /\(\s*([A-Z][A-Za-z\s&.'’-]+)\s*\[([A-Z]{2,})\]\s*,\s*(\d{4}[a-z]?|n\.d\.)\s*\)/g,
  
  // Abbreviation only: (WHO, 2020) or (CDC, 2020)
  groupAbbrevOnly: /\(\s*([A-Z]{2,})\s*,\s*(\d{4}[a-z]?|n\.d\.)\s*\)/g,

  // NARRATIVE abbreviation: "JASP (2023)", "WHO (2020)" — an ALL-CAPS acronym author
  // with the year in trailing parens (the narrative analogue of groupAbbrevOnly). The
  // consumer gates this on the known-org allowlist (ORGANIZATION_ABBREVIATIONS) so it
  // CANNOT fire on inline technical acronyms like "(SDE)", "(SIR)", "(ODE)" + a year,
  // which is exactly the corpus-wide false-positive risk that kept the bare all-caps
  // narrative form deferred. (scimeto-iterate cycle 7, collabra JASP — R-0177.)
  narrativeAbbrev: /\b([A-Z]{2,})\s+\((\d{4}[a-z]?|n\.d\.)\)/g,

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

// Latin typographic ligatures U+FB00–U+FB06 (ﬀ ﬁ ﬂ ﬃ ﬄ ﬅ ﬆ). pdftotext
// preserves these presentation-form glyphs verbatim, so a reference printed
// "conﬁdent" / "inﬂuence" fails to match its citation. NFD does NOT decompose
// these compatibility ligatures, and an NFKC pass would yield "ſt" (non-ASCII
// LONG S) for U+FB05 — so we use an explicit ASCII map, ported from docpluck's
// normalize.py::decompose_ligatures (cross-project lesson transfer R-0001).
// Shared by BOTH matching gates: normalizeText (here) and normalizeName
// (referenceParser.ts), mirroring docpluck's single-shared-helper design.
const LIGATURE_MAP: Record<string, string> = {
  'ﬀ': 'ff', // ﬀ
  'ﬁ': 'fi', // ﬁ
  'ﬂ': 'fl', // ﬂ
  'ﬃ': 'ffi', // ﬃ
  'ﬄ': 'ffl', // ﬄ
  'ﬅ': 'st', // ﬅ (long-s + t)
  'ﬆ': 'st', // ﬆ
};
const LIGATURE_RE = /[ﬀ-ﬆ]/g;

/**
 * Decompose Latin typographic ligatures (U+FB00–U+FB06) to ASCII. The single
 * shared helper for citelink's text-comparison gates (see LIGATURE_MAP note).
 */
export function decomposeLigatures(text: string): string {
  return text.replace(LIGATURE_RE, (m) => LIGATURE_MAP[m] ?? m);
}

/**
 * Normalize text for comparison
 * Removes accents, normalizes spaces and punctuation
 */
export function normalizeText(text: string): string {
  return decomposeLigatures(text.toLowerCase())
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
  // Handle special cases. The lettered no-date form splits exactly as a lettered
  // year does - "n.d.a" is to "n.d." what "2019a" is to "2019" - so a consumer that
  // keys on (author, year) sees the same shape for both and does not have to learn a
  // second convention.
  const undated = yearStr.toLowerCase().match(/^(n\.d\.)([a-z])?$/);
  if (undated) {
    return { year: undated[1], suffix: undated[2] };
  }
  if (yearStr.toLowerCase().replace(/\s+/g, ' ') === 'in press') {
    return { year: 'in press' };
  }
  return { year: yearStr };
}

// Month names — when a parenthetical like "(January 2023)" or "(April, 2023)"
// is a date reference rather than an author citation, the author-capture
// patterns mis-detect the month as a single-word lastname. scimeto-
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

// Capitalized prose words that are NOT credible surnames — function words,
// document-structure nouns, discourse nouns. Shared by the single-narrative
// guard and the prose-bundled-parenthetical pass so "(Discussion, 2020)" /
// "Section (2020)" can't masquerade as an author citation. Folded into a Set
// (was an inline array in the single-narrative loop).
const COMMON_NON_AUTHOR_WORDS = new Set([
  'the', 'this', 'that', 'these', 'those', 'their', 'there', 'where', 'when',
  'while', 'which', 'what', 'with', 'from', 'into', 'upon', 'about', 'after',
  'before', 'between', 'through', 'during', 'without', 'within', 'among',
  'along', 'across', 'behind', 'beyond', 'under', 'over', 'above', 'below',
  'around', 'toward', 'towards', 'against', 'throughout', 'despite', 'figure',
  'table', 'section', 'chapter', 'study', 'research', 'analysis', 'results',
  'method', 'discussion', 'conclusion', 'introduction', 'abstract', 'however',
  'therefore', 'furthermore', 'moreover', 'nevertheless', 'although', 'whereas',
  'because', 'since', 'unless', 'until', 'while',
]);

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

// Common capitalized prose words that can begin a sentence right before an author
// and are NOT surname particles — e.g. "As de Visser et al. (2017)" where the
// compound-surname first-author pattern (particle-aware) would otherwise swallow
// the leading "As" into "As de Visser". Distinct from SENTENCE_CONNECTORS (which
// guards a whole-string match); this set is consulted only for the FIRST WORD of a
// multi-word compound capture. (scimeto-iterate cycle 9.)
const LEADING_NON_NAME_WORDS = new Set([
  'as', 'when', 'while', 'where', 'although', 'though', 'because', 'since', 'if',
  'whereas', 'after', 'before', 'unlike', 'like', 'per', 'following', 'given',
  'in', 'on', 'at', 'by', 'for', 'with', 'from', 'and', 'but', 'or', 'so', 'see',
]);

/**
 * A compound surname whose first author admits a leading particle can over-capture
 * a preceding sentence word when the second token is a particle ("As de Visser").
 * If the captured surname is multi-word and its FIRST word is a sentence connector
 * or a common non-name lead-in, strip that word and return the remainder (the real
 * particle surname). If nothing valid remains, return null so the caller skips.
 * A single-word capture, or one whose first word is a real particle / name, is
 * returned unchanged.
 */
function stripLeadingNonNameWord(surname: string): string | null {
  const s = surname.trim();
  const words = s.split(/\s+/);
  if (words.length < 2) return s || null;
  const first = words[0].toLowerCase().replace(/\.$/, '');
  const isLeadIn = LEADING_NON_NAME_WORDS.has(first) || SENTENCE_CONNECTORS.has(first);
  // Only strip when the first word is a lead-in AND the SECOND word is a particle
  // (that is exactly the over-capture shape "As de Visser"); a genuine two-part
  // surname whose first word happens to be a lead-in AND is NOT followed by a
  // particle ("Long March 2020"—contrived) is left intact.
  if (isLeadIn) {
    const rest = words.slice(1).join(' ');
    return rest || null;
  }
  return s;
}

// Capitalized prose words that legitimately precede a real author inside a
// parenthetical ("(See Smith, 2020)", "(In Tykocinski et al., 2023)") and must
// never lead a multi-word ORG_AUTHOR run — otherwise the run glues the prose
// word onto the surname ("see smith") and the real single-author detection is
// lost in de-overlap. Beyond the signal/connector/common-word sets, these are
// the capitalized lead-ins + document-structure nouns observed before a
// citation. Cycle 4 (APA-ORG-AUTHOR).
const ORG_LEAD_BLOCK = new Set([
  'see', 'as', 'per', 'via', 'cf', 'eg', 'ie', 'ed', 'eds', 'vol', 'no', 'nos',
  'pp', 'fig', 'figs', 'in', 'of', 'for', 'and', 'but', 'compare', 'reviewed',
  'supplementary', 'supporting', 'appendix', 'note', 'notes', 'data', 'panel',
]);

/**
 * True if `firstWord` is a credible LEADING token for an organizational /
 * multi-word author run (i.e. NOT prose, NOT a sentence connector, NOT a
 * document-structure noun, NOT a month). Gates every ORG_AUTHOR detection.
 */
function orgLeadAllowed(firstWord: string): boolean {
  const w = firstWord.trim().toLowerCase().replace(/[.,]+$/, '');
  if (!w) return false;
  if (ORG_LEAD_BLOCK.has(w)) return false;
  if (SENTENCE_CONNECTORS.has(w)) return false;
  if (COMMON_NON_AUTHOR_WORDS.has(w)) return false;
  if (isMonthName(firstWord)) return false;
  return true;
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
  // Drop a parenthesized preferred-name aside that COMPOUND_SURNAME tolerated so the
  // citation could be detected at all ("(Grace) Ahn" -> "Ahn"). It must not survive
  // into `raw` or `normalized`, or the author key would never match the reference's
  // plain surname. See PREFERRED_NAME_ASIDE.
  const trimmed = raw
    .replace(
      new RegExp(
        `\\(\\s*(?!${EDITORIAL_ROLE_WORD}\\s*\\.?\\s*\\))[A-ZÀ-Ÿ][a-zà-ÿā-ž'’-]{1,20}\\s*\\.?\\s*\\)\\s*`,
        'g',
      ),
      '',
    )
    .trim();
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
 * The page-running-head signature consumed by maskPageRunningHeadYears.
 * Module level so the pattern is compiled once; it carries the `g` flag and is
 * used ONLY with String.replace (never .test), so no lastIndex state leaks
 * between calls (CLAUDE.md gotcha #15).
 */
const RUNNING_HEAD_IN_CITATION =
  /(\([^()]{0,300}?,)(\s*\f[^\S\n]*)((?:19|20)\d{2}[a-z]?)([^\S\n]*\n\s*)((?:19|20)\d{2}[a-z]?)(?=[^\S\n]*(?:[\r\n)\],;:]|$))/g;

/**
 * Every bare year glued to a page-break form feed, used to tell a RECURRING
 * running head from a one-off. Separate from RUNNING_HEAD_IN_CITATION so the two
 * never share `lastIndex`.
 */
const FORM_FEED_GLUED_YEAR = /\f[^\S\n]*((?:19|20)\d{2}[a-z]?)/g;

/**
 * Blank a PAGE RUNNING HEAD that is a bare year and has landed INSIDE a
 * parenthetical citation, so that the year following it -- the real one -- is
 * the one detected.
 *
 * WHY. A journal that prints its volume year as a running head emits that year
 * as its own line immediately after the page-break form feed. When the page
 * break falls between a citation's author list and its year, the extracted text
 * reads (verbatim, AOM Annals 10.5465/annals.2016.0011):
 *
 *   (Green, Tonidandel, & Cortina,<LF><LF><FF>2018<LF><LF>2016).
 *
 * Every parenthetical matcher below takes the FIRST year token after the author
 * list, so this emitted a citation with year 2018 -- a year that appears nowhere
 * in the paper -- and lost the real 2016. For an integrity tool that is the
 * worst failure available: the fabricated citation resolves to no reference, so
 * an honest manuscript is accused of an unmatched citation. Inside a ';'-bundle
 * it is worse still: the member matchers are $-anchored after the year, so the
 * intervening running head made the whole member unmatchable and it was dropped.
 *
 * Measured 2026-09-01 (scimeto-iterate cycle 9): 57 bare-year running-head
 * lines survive docpluck 2.4.137's H0_header_banner_strip across the 6 AOM papers
 * in the iterate corpus, so this is systematic for that publisher, not a one-off.
 * Filed upstream too; this guard is citelink's own defence, because citelink is
 * fed text by extractors it does not control.
 *
 * THE RULE, and both halves are load-bearing:
 *   (a) the year is adjacent to a form feed and alone on its line -- that is what
 *       makes it page furniture rather than content; and
 *   (b) another bare year follows it on a later line inside the same parenthetical
 *       -- that is what proves the citation's real year is still to come.
 * Requiring (b) alone would corrupt a legitimate citation split across a page,
 * (Smith,<LF><FF><LF>2016). Requiring (a) alone would corrupt a real multi-year
 * citation, (de Melo, Marsella, & Gratch, 2016, 2017). Both controls are asserted
 * in tests/pageRunningHeadYear.test.ts.
 *
 * The furniture year is replaced by the SAME NUMBER OF SPACES, never deleted, so
 * every `position` this module reports still indexes the caller's own string. An
 * offset-shifting fix here would be invisible to a diff and fatal to any consumer
 * that slices by offset.
 */
export function maskPageRunningHeadYears(text: string): string {
  if (text.indexOf('\u000c') === -1) return text;
  // A running head REPEATS - once per page. A year caught in a genuine
  // mid-citation page split does not. Measured across the 18-paper iterate corpus
  // (2026-09-01): every form-feed-glued bare year occurs at least twice, one
  // distinct value per document, counts 2/13/10/12/10/10, and there are ZERO
  // singletons. Without this test the guard cannot tell furniture from a second
  // REAL year, and silently drops 2016a from '(Author,<LF><LF><FF>2016a<LF><LF>2016b)'.
  const gluedYearCounts = new Map<string, number>();
  for (const m of text.matchAll(FORM_FEED_GLUED_YEAR)) {
    gluedYearCounts.set(m[1], (gluedYearCounts.get(m[1]) ?? 0) + 1);
  }
  return text.replace(RUNNING_HEAD_IN_CITATION, (
    match: string,
    head: string,
    gap: string,
    furniture: string,
    separator: string,
    realYear: string,
  ) => ((gluedYearCounts.get(furniture) ?? 0) >= 2
    ? head + gap + ' '.repeat(furniture.length) + separator + realYear
    : match));
}

/**
 * Main citation detection function
 * Detects all APA 7 style citations in text
 */
export function detectCitations(rawText: string): DetectedCitation[] {
  // A bare-year page running head corrupts the year of any citation the page
  // break falls inside -- see maskPageRunningHeadYears. Length-preserving, so
  // every position below still indexes the caller's own string.
  const text = maskPageRunningHeadYears(rawText);
  const citations: DetectedCitation[] = [];
  const processedPositions = new Set<string>();
  // Full-match spans consumed by the same-author multi-year NARRATIVE loop
  // ("McCullough et al. (1997, 1998)"). The single/two/et-al narrative loops
  // that run afterwards would otherwise re-match the same span and emit ONLY
  // the first year at the full span — a duplicate of the per-year siblings this
  // loop already emitted. Each of those three loops skips a match whose start
  // falls inside a consumed span (TC-I, scimeto-iterate cycle 8).
  const multiYearNarrativeSpans: Array<{ start: number; end: number }> = [];
  const inMultiYearNarrativeSpan = (pos: number): boolean =>
    multiYearNarrativeSpans.some(s => pos >= s.start && pos < s.end);

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

  // Narrative abbreviation: "JASP (2023)", "WHO (2020)". Gated on the known-org
  // allowlist so an inline technical acronym ("(SDE)", "(SIR)") + a year can NEVER
  // be mistaken for a citation — only acronyms in ORGANIZATION_ABBREVIATIONS fire.
  CITATION_PATTERNS.narrativeAbbrev.lastIndex = 0;
  while ((match = CITATION_PATTERNS.narrativeAbbrev.exec(text)) !== null) {
    const abbrev = match[1];
    const expansions = ORGANIZATION_ABBREVIATIONS[abbrev.toUpperCase()];
    if (!expansions) continue; // allowlist gate — never fires on inline technical acronyms
    const { year, suffix } = parseYear(match[2]);
    const author = createParsedAuthor(abbrev);
    author.isOrganization = true;
    author.abbreviation = abbrev.toUpperCase();
    // Key on the EXPANDED org name too, so the citation matches a reference / gold
    // that records the full author ("JASP (2023)" ↔ the "JASP Team" reference) rather
    // than the bare acronym.
    author.normalized = normalizeText(expansions[0]);
    addCitation({
      raw: match[0],
      normalized: normalizeCitation(match[0]),
      type: 'group',
      citationStyle: 'narrative',
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
  
  // ============ BARE-YEAR MULTI-AUTHOR NARRATIVE ============
  // "…, Fox, (Grace) Ahn, …, & Bailenson, 2015 found that…" — an unparenthesized
  // author list with a bare comma-year, disambiguated from prose by a following
  // reporting verb. See the pattern comment for the precision measurement that
  // justifies how tight this is. (annals_1, R-0177 Sonnet audit.)
  CITATION_PATTERNS.bareYearMultiAuthorNarrative.lastIndex = 0;
  while ((match = CITATION_PATTERNS.bareYearMultiAuthorNarrative.exec(text)) !== null) {
    const leadingList = match[1].split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
    // The list can begin mid-sentence ("In a meta-analysis of 32 studies, Fox, …"),
    // so drop a leading prose word the same way the et-al narrative loop does.
    const cleanedLead = stripLeadingNonNameWord(leadingList[0]);
    if (cleanedLead === null) continue;
    leadingList[0] = cleanedLead;
    const authors = [
      ...leadingList.map(a => createParsedAuthor(a)),
      createParsedAuthor(match[2]),
    ];
    const { year, suffix } = parseYear(match[3]);
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

  // ============ SAME-AUTHOR MULTI-YEAR (NARRATIVE) ============
  // "McCullough et al. (1997, 1998)", "Bishop (2019, 2020)", "Werth and Strack
  // (2001, 2003)". Emits one citation per year, all sharing the author(s). Runs
  // BEFORE the single/two/et-al narrative loops so the bare-year continuation
  // ("1998") isn't swallowed as an ignored trailing qualifier and dropped
  // (TC-I, scimeto-iterate cycle 8 — R-0177 Sonnet audit, chan McCullough).
  // The parenthetical analog is `sameAuthorMultiYear`; this is its narrative twin.
  CITATION_PATTERNS.sameAuthorMultiYearNarrative.lastIndex = 0;
  while ((match = CITATION_PATTERNS.sameAuthorMultiYearNarrative.exec(text)) !== null) {
    // group 1 may be a single surname OR a comma-separated list ("de Melo, Marsella").
    const leadingList = match[1].split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
    // Particle over-capture guard (same as etAlNarrative): the compound first author
    // admits a leading particle, so a preceding sentence word ("As de Visser…") can be
    // swallowed as "As de Visser". Strip a lead-in word from the FIRST list element.
    const strippedFirst = stripLeadingNonNameWord(leadingList[0]);
    if (!strippedFirst) continue;
    leadingList[0] = strippedFirst;
    const firstAuthor = leadingList[0];
    if (isSentenceConnector(firstAuthor) || isMonthName(firstAuthor)) continue;
    const connector = match[2] || '';
    const years = match[3].split(/\s*,\s*/).map(y => y.trim()).filter(Boolean);
    if (years.length < 2) continue; // regex guarantees ≥2, but be defensive
    // Build the author list from the leading list + the connector shape:
    //  "A"          + " et al."        → [A, et al.]
    //  "A"          + " and <B>"       → [A, B]
    //  "A, B"       + " & <C>"         → [A, B, C]         (explicit multi-author)
    //  "A"          + ""               → [A]               (single)
    let authors: ParsedCitationAuthor[];
    const etAlMatch = /^\s+et\s*\.?\s*al\.?$/i.test(connector);
    const andMatch = connector.match(/^\s*,?\s*(?:and|&)\s+(.+)$/i);
    if (etAlMatch) {
      authors = [...leadingList.map(a => createParsedAuthor(a)), createParsedAuthor('et al.', true)];
    } else if (andMatch) {
      const last = andMatch[1].trim();
      if (isSentenceConnector(last) || isMonthName(last)) continue;
      authors = [...leadingList.map(a => createParsedAuthor(a)), createParsedAuthor(last)];
    } else {
      // No connector: a bare comma list with no "& last" is almost never a real
      // citation lead-in ("Smith, 2019, 2020" is the parenthetical splitter's job);
      // keep the prior single-author behavior and only take the first surname.
      authors = [createParsedAuthor(firstAuthor)];
    }
    // Record the full span so the narrative loops below don't re-emit the first
    // year at the full span (which would duplicate the per-year siblings here).
    const matchStart = match.index;
    const matchText = match[0];
    multiYearNarrativeSpans.push({ start: matchStart, end: matchStart + matchText.length });
    // Locate each year token's offset inside the matched text (searching forward
    // so repeated/adjacent years still advance) and give each sibling a distinct
    // narrow position window — the de-overlap pass keeps identity-distinct
    // siblings at distinct positions (see the sameAuthorMultiYear note).
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
        citationStyle: 'narrative',
        authors,
        year,
        yearSuffix: suffix,
        position: { start, end },
        context: extractContext(text, matchStart, matchText.length),
      });
    }
  }

  // ============ ET AL. NARRATIVE WITH BRACKETED INLINE REFERENCE ============
  // "McCullough et al. [McCullough, M. E., … (1997). … 321-336.] demonstrated…"
  // The bracket spells out the whole reference; the citation is the et-al lead-in
  // keyed to the FIRST year inside the bracket (TC-J, scimeto-iterate cycle
  // 8). Register the full span so the bracket's inner "(1997)" isn't separately
  // emitted by a downstream parenthetical/narrative pattern.
  CITATION_PATTERNS.etAlBracketedInlineRef.lastIndex = 0;
  while ((match = CITATION_PATTERNS.etAlBracketedInlineRef.exec(text)) !== null) {
    const leadSurname = match[1];
    if (isSentenceConnector(leadSurname) || isMonthName(leadSurname)) continue;
    const { year, suffix } = parseYear(match[2]);
    if (!year) continue;
    const authors = [createParsedAuthor(leadSurname), createParsedAuthor('et al.', true)];
    multiYearNarrativeSpans.push({ start: match.index, end: match.index + match[0].length });
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

  // ============ MULTI-AUTHOR NARRATIVE WITH "AND" ============
  // Run before twoAuthorNarrative so "Hart, Lane, and Chinn (2018)" isn't
  // partially consumed by a two-author match on "Lane and Chinn (2018)".
  // classifyCitation collapses 3+ authors → 'et_al'.
  CITATION_PATTERNS.multiAuthorAndNarrative.lastIndex = 0;
  while ((match = CITATION_PATTERNS.multiAuthorAndNarrative.exec(text)) !== null) {
    // Sentence-connector guard (2026-05-26 canary audit cycle): the leading
    // captured token in the comma-separated author list is the part most
    // susceptible to absorbing a sentence-initial adverb (e.g. "Also, Werth
    // and Strack (2003)" → first author = "Also").
    //
    // For a TWO-author list ("Also, Werth and Strack (2003)") dropping the match
    // is safe — `twoAuthorNarrative` re-picks "Werth and Strack (2003)" downstream.
    // But for a 3+-author list ("Similarly, Kickul, Griffiths, Brannback, and Robb
    // (2023)") there is NO downstream pattern that recovers the full citation: only
    // `singleNarrative` survives, catching the LAST author ("Robb (2023)") as a
    // spurious solo citation with the wrong first author. So instead of discarding
    // the whole match, STRIP the leading connector token(s) and re-emit starting at
    // the first real surname — recovering "Kickul, Griffiths, Brannback, and Robb
    // (2023)" with the correct first author. (scimeto-iterate cycle 7, amp_1
    // — TC-D, R-0177 Sonnet audit.)
    let namedTokens = match[1].split(/\s*,\s*/).filter(t => t.length > 0);
    let leadStripped = 0;
    while (namedTokens.length > 0 && isSentenceConnector(namedTokens[0])) {
      namedTokens.shift();
      leadStripped++;
    }
    // If nothing real remains before the "and <lastAuthor>", skip (a bare connector
    // list is not a citation; let downstream patterns handle it).
    if (namedTokens.length === 0) continue;
    const { year, suffix } = parseYear(match[3]);
    const authors = [
      ...namedTokens.map(a => createParsedAuthor(a)),
      createParsedAuthor(match[2]),
    ];
    // Recompute the citation span to begin at the first real surname when a leading
    // connector was stripped, so `raw`/`position` don't carry the discourse adverb.
    let citeStart = match.index;
    let citeRaw = match[0];
    if (leadStripped > 0) {
      const firstReal = namedTokens[0];
      const off = match[0].indexOf(firstReal);
      if (off > 0) {
        citeStart = match.index + off;
        citeRaw = match[0].slice(off);
      }
    }
    addCitation({
      raw: citeRaw,
      normalized: normalizeCitation(citeRaw),
      type: classifyCitation(authors, false, false),
      citationStyle: 'narrative',
      authors,
      year,
      yearSuffix: suffix,
      position: { start: citeStart, end: match.index + match[0].length },
      context: extractContext(text, citeStart, (match.index + match[0].length) - citeStart),
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

  // ============ ORGANIZATIONAL / MULTI-WORD AUTHOR PARENTHETICAL ============
  // "(R Core Team, 2019)", "(Open Science Collaboration, 2015)". Runs AFTER
  // singleParenthetical (single/compound surnames win) and BEFORE the prose-
  // bundled pass — so the prose pass's would-be last-token candidate
  // ("Team, 2019" / "Collaboration, 2015") overlaps this full-span detection and
  // is dropped, leaving exactly one citation keyed on the full org. Cycle 4
  // (APA-ORG-AUTHOR).
  CITATION_PATTERNS.orgMultiWordParenthetical.lastIndex = 0;
  while ((match = CITATION_PATTERNS.orgMultiWordParenthetical.exec(text)) !== null) {
    const orgRaw = match[1].trim();
    const firstWord = orgRaw.split(/\s+/)[0] ?? '';
    if (!orgLeadAllowed(firstWord)) continue;
    if (isMonthName(orgRaw)) continue;
    const { year, suffix } = parseYear(match[2]);
    const author = createParsedAuthor(orgRaw);
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
      context: extractContext(text, match.index, match[0].length),
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
    // Skip a span already emitted per-year by the multi-year narrative loop
    // ("McCullough et al. (1997, 1998)") — otherwise this loop re-emits the
    // first year at the full span, duplicating the sibling (TC-I).
    if (inMultiYearNarrativeSpan(match.index)) continue;
    // Sentence-connector guard — "Recently et al. (2021)" should not parse
    // as a citation; "Recently, Moche and Västfjäll (2021)" should let the
    // multiAuthorAndNarrative loop find the real citation downstream.
    if (isSentenceConnector(match[1])) continue;
    // Particle over-capture guard (scimeto-iterate cycle 9): the compound
    // first-author now admits a leading particle, so a preceding sentence word
    // followed by a particle-surname ("As de Visser et al.") can be swallowed as
    // "As de Visser". If the FIRST word is a sentence connector / common lead-in
    // and the remainder still forms a particle surname, strip the lead-in and
    // re-key on the real surname; if only the lead-in remains, skip.
    const etAlFirstAuthor = stripLeadingNonNameWord(match[1]);
    if (!etAlFirstAuthor) continue;
    const { year, suffix } = parseYear(match[2]);
    const authors = [
      createParsedAuthor(etAlFirstAuthor),
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
    // Skip a span already emitted per-year by the multi-year narrative loop (TC-I).
    if (inMultiYearNarrativeSpan(match.index)) continue;
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
    // Skip a span already emitted per-year by the multi-year narrative loop (TC-I).
    if (inMultiYearNarrativeSpan(match.index)) continue;
    const { year, suffix } = parseYear(match[2]);
    const authors = [createParsedAuthor(match[1])];

    // Sentence-connector guard (2026-05-26 canary audit cycle).
    if (isSentenceConnector(match[1])) continue;

    // Skip if author looks like a common word
    if (COMMON_NON_AUTHOR_WORDS.has(match[1].toLowerCase())) continue;
    
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
        // NOTE: this is the bundle-fragment copy of the SIGNAL_PREFIX strip (the
        // module-level SIGNAL_PREFIX const is consumed by the single-paren matchers).
        // Keep the two in sync — the "(also) see <prose> in" alternative below was
        // added to both for chen "(Fischhoff, 2007, p. 11; also see interview in
        // Klein, Hegarty, & Fischhoff, 2017)": this 2nd ";"-fragment begins
        // "also see interview in Klein…", which the old strip left intact so the
        // $-anchored fragment matchers never reached "Klein" (R-0177 Sonnet audit,
        // scimeto-iterate 2026-06-25). Bounded to 30 non-comma/semicolon/paren
        // chars after "see" so the FP surface stays small.
        .replace(/^(?:e\.g\.?|i\.e\.?|cf\.?|see(?:[\s,]+(?:also|for\s+example|e\.g\.?))?|as in|c\.f\.?|most recently,? in|for [^,;()]{0,40}?,?\s*see|(?:also\s+)?see\s+[^,;()]{0,30}?\s+in)\s*,?\s+/i, '')
        .replace(/^(?:and|in)\s+(?=[A-ZÀ-Ÿ])/i, '')
        // Strip a TRAILING page locator (", p. 105" / ", pp. 12-15") from a bundle
        // fragment. The fragment matchers below are $-anchored right after the year,
        // so a page suffix dropped the citation — the middle item of "(e.g.,
        // Jeffreys, 1939; M. D. Lee & Wagenmakers, 2013, p. 105; Wasserman, 2000)"
        // was missed (collabra 2026-06-08c). The standalone single-paren patterns
        // already tolerate a page suffix; this brings the bundle path to parity.
        .replace(/,\s*pp?\.\s*\d+(?:\s*[-–—]\s*\d+)?\s*$/i, '')
        // Strip a TRAILING AOM/Chicago COLON page locator ("2009a: 211" /
        // "2014: 88-90") from a bundle fragment. AOM (Academy of Management) and
        // Chicago note-style write the page after the year as ": page", not the
        // APA ", p. page" handled above — so the colon-form suffix slipped past
        // and, because the fragment matchers below are $-anchored right after the
        // year, dropped the FIRST citation of a multi-citation parenthetical:
        // "(Bedeian, Van Fleet & Hyman, 2009a: 211; Honig et al. 2014)" detected
        // only Honig 2014, losing Bedeian 2009a (amp_1; scimeto-iterate
        // 2026-06-25 — TC-4). Only strip when a 4-digit year (optional letter
        // suffix) immediately precedes the colon, so a real "Author: Title" or an
        // institutional "ACRONYM: Name" opener is untouched.
        .replace(/((?:19|20)\d{2}[a-z]?)\s*:\s*\d+(?:\s*[-–—]\s*\d+)?\s*$/i, '$1')
        // Strip a TRAILING prose note that follows the year on the LAST bundle
        // member: "Król & Król, 2019 for attempts to explain the replication
        // failures" -> "Król & Król, 2019". The fragment matchers below are
        // $-anchored right after the year, so trailing prose dropped the citation
        // (xiao_2021 / APA-ORG-AUTHOR cycle 5). Only stripped when the year is
        // followed by whitespace + a LOWERCASE word — a real following citation
        // starts with an uppercase surname (same heuristic as the leading
        // "and"/"in" strip above), and a year suffix ("2020a") has no space so
        // it is untouched.
        .replace(/(,\s*\d{4}[a-z]?)\s+[a-z][\s\S]*$/, '$1');
      // Try to match individual citation patterns

      // TC-MULTIYEAR-MULTIAUTHOR bundle form (scimeto-iterate 2026-07-03):
      // a ';'-bundle MEMBER carrying a trailing YEAR LIST — "(…; de Melo,
      // Marsella, & Gratch, 2016, 2017; …)", "(Jones, 2016; Smith & Lee, 2018,
      // 2019)". Every $-anchored member matcher below captures ONE year, so a
      // "…, 2016, 2017" member matched NONE of them and the WHOLE member was
      // dropped (not just the extra year). The shared `emitExtraBundleYears`
      // helper is called by each matcher right after its first-year addCitation:
      // it scans for a "(\s*,\s*YYYY)+" tail immediately after the matched year in
      // the member and emits one sibling citation per extra year, sharing the
      // author list, each at its own narrow position window (addCitation dedupes
      // by exact (start,end)). This mirrors the standalone `(A, B, & C, Y1, Y2)`
      // fix in the PROSE_PAREN pass, which never sees ';'-bundles.
      //
      // NON-RECURSIVE by design (CLAUDE.md gotcha #15): we never call
      // detectCitations() from inside this loop — the module-level
      // CITATION_PATTERNS regexes carry `g`-flag `lastIndex` state and a nested
      // call would reset multipleCitations.lastIndex, corrupting THIS loop into an
      // infinite loop. The helper re-parses only its own local literal.
      // Returns TRUE if `citeText` carried a trailing "YYYY(, YYYY)+" list and the
      // helper emitted one citation PER year (each at its own narrow window at the
      // year token) — in which case the caller MUST NOT also emit its usual
      // full-span primary, because the full span would strictly CONTAIN the narrow
      // year siblings and the de-overlap pass would drop every sibling but the
      // first (different identity key + larger containing span = dropped). This is
      // the same narrow-window discipline the `sameAuthorMultiYear` splitter uses.
      // Returns FALSE for a single-year member (no list) so the caller emits its
      // normal full-span citation unchanged.
      const emitAllBundleYears = (
        authors: ParsedCitationAuthor[],
        baseType: DetectedCitation['type'],
        matchedFirstYear: string,
      ): boolean => {
        if (authors.length === 0) return false;
        const firstIdx = citeText.indexOf(matchedFirstYear);
        if (firstIdx < 0) return false;
        const afterFirst = citeText.slice(firstIdx + matchedFirstYear.length);
        const tail = /^((?:\s*,\s*\d{4}[a-z]?)+)\s*$/.exec(afterFirst);
        if (!tail) return false; // single year — caller emits its normal primary
        const headText = citeText.slice(0, firstIdx).replace(/,\s*$/, '');
        // The full year list = the first matched year + the tail years.
        const allYears = [matchedFirstYear, ...tail[1].split(/\s*,\s*/).map((y) => y.trim())].filter(Boolean);
        let searchFrom = firstIdx;
        for (const rawYear of allYears) {
          const { year, suffix } = parseYear(rawYear);
          if (!year) continue;
          const off = citeText.indexOf(rawYear, searchFrom);
          const yStart = off >= 0 ? currentPos + off : currentPos;
          const yEnd = off >= 0 ? yStart + rawYear.length : currentPos + citeText.length;
          if (off >= 0) searchFrom = off + rawYear.length;
          addCitation({
            raw: `(${headText}, ${rawYear})`,
            normalized: normalizeCitation(`(${headText}, ${rawYear})`),
            type: baseType,
            citationStyle: 'parenthetical',
            authors,
            year,
            yearSuffix: suffix,
            position: { start: yStart, end: yEnd },
            context: extractContext(text, currentPos, citeText.length),
          });
        }
        return true;
      };

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

      // Group-with-bracket-abbreviation author as a bundle item: "Collaborative
      // Open-science REsearch [CORE], 2020", "World Health Organization [WHO],
      // 2020". The standalone groupWithAbbrev pattern only fires when the WHOLE
      // parenthetical is the org, so inside a ';'-bundle the member fell through
      // every matcher and was dropped. Keyed on the NAME (not the acronym), so
      // authors[0] matches the gold's full-name key. Name run is non-greedy up
      // to the "[ABBR]". cycle 4 (APA-ORG-AUTHOR / xiao_2021).
      const bracketAbbrevFrag = citeText.match(
        /^([A-Z][A-Za-z&.'’\-\s]+?)\s*\[([A-Z]{2,})\]\s*,\s*(\d{4}[a-z]?|n\.d\.)$/,
      );
      if (bracketAbbrevFrag) {
        const { year, suffix } = parseYear(bracketAbbrevFrag[3]);
        const author = createParsedAuthor(bracketAbbrevFrag[1].trim());
        author.isOrganization = true;
        author.abbreviation = bracketAbbrevFrag[2].toUpperCase();
        addCitation({
          raw: `(${citeText})`,
          normalized: normalizeCitation(`(${citeText})`),
          type: 'group_full',
          citationStyle: 'parenthetical',
          authors: [author],
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

      // Et al. pattern.
      // COMPOUND_SURNAME (not the single-word SURNAME_LASTNAME) so a PARTICLE surname
      // survives as a ';'-bundle member: "(de Visser et al., 2016; Pak, Fink, Price,
      // Bass, & Sturre, 2012; …)". Every sibling matcher in this loop already uses
      // COMPOUND_SURNAME; this one alone did not, so "de Visser et al., 2016" matched
      // no bundle matcher at all and the member was silently DROPPED — while the very
      // same citation OUTSIDE a bundle ("(e.g., de Visser et al., 2016)") detected
      // fine. That asymmetry is why it read as an occurrence-count discrepancy (1 of 2
      // found) rather than an outright parse failure.
      // (scimeto-iterate 2026-08-04, annals_1 — R-0177 Sonnet audit, de Visser.)
      const etAlMatch = citeText.match(new RegExp(
        `^(${COMPOUND_SURNAME})\\s*,?\\s+et\\s*\\.?\\s*al\\.?\\s*,?\\s*(${YEAR_TOKEN})$`,
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
        `^${INITIAL_PREFIX}(${COMPOUND_SURNAME})\\s*&\\s*${INITIAL_PREFIX}(${COMPOUND_SURNAME})\\s*,\\s*(${YEAR_TOKEN})(?:\\s*,\\s*\\d{4}[a-z]?)*$`,
        'i',
      ));
      if (twoAuthorMatch) {
        const { year, suffix } = parseYear(twoAuthorMatch[3]);
        const twoAuthors = [
          createParsedAuthor(twoAuthorMatch[1]),
          createParsedAuthor(twoAuthorMatch[2]),
        ];
        if (!emitAllBundleYears(twoAuthors, 'two_authors', twoAuthorMatch[3])) {
          addCitation({
            raw: `(${citeText})`,
            normalized: normalizeCitation(`(${citeText})`),
            type: 'two_authors',
            citationStyle: 'parenthetical',
            authors: twoAuthors,
            year,
            yearSuffix: suffix,
            position: { start: currentPos, end: currentPos + citeText.length },
            context: extractContext(text, currentPos, citeText.length)
          });
        }
        currentPos += citeText.length + 2;
        continue;
      }
      
      // Mixed-list with trailing et al.: "Bartoš, Maier, Wagenmakers, et al., 2022"
      const mixedEtAlMatch = citeText.match(new RegExp(
        `^(${COMPOUND_SURNAME}(?:,\\s+${COMPOUND_SURNAME}){1,5})\\s*,?\\s+et\\s*\\.?\\s*al\\.?\\s*,?\\s*(${YEAR_TOKEN})(?:\\s*,\\s*\\d{4}[a-z]?)*$`,
        'i',
      ));
      if (mixedEtAlMatch) {
        const { year, suffix } = parseYear(mixedEtAlMatch[2]);
        const authors = [
          ...mixedEtAlMatch[1].split(/\s*,\s*/).map(a => createParsedAuthor(a)),
          createParsedAuthor('et al.', true),
        ];
        if (!emitAllBundleYears(authors, 'et_al', mixedEtAlMatch[2])) {
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
        }
        currentPos += citeText.length + 2;
        continue;
      }

      // Multi-author pattern (3-6 authors): "Bosco, Aguinis, Field, & Dalton, 2016"
      const multiAuthorMatch = citeText.match(new RegExp(
        `^(${COMPOUND_SURNAME}(?:,\\s+${COMPOUND_SURNAME}){1,5})\\s*,?\\s*&\\s*(${COMPOUND_SURNAME})\\s*,\\s*(${YEAR_TOKEN})(?:\\s*,\\s*\\d{4}[a-z]?)*$`,
        'i',
      ));
      if (multiAuthorMatch) {
        const { year, suffix } = parseYear(multiAuthorMatch[3]);
        const authors = [
          ...multiAuthorMatch[1].split(/\s*,\s*/).map(a => createParsedAuthor(a)),
          createParsedAuthor(multiAuthorMatch[2]),
        ];
        const maType = classifyCitation(authors, false, false);
        if (!emitAllBundleYears(authors, maType, multiAuthorMatch[3])) {
          addCitation({
            raw: `(${citeText})`,
            normalized: normalizeCitation(`(${citeText})`),
            type: maType,
            citationStyle: 'parenthetical',
            authors,
            year,
            yearSuffix: suffix,
            position: { start: currentPos, end: currentPos + citeText.length },
            context: extractContext(text, currentPos, citeText.length),
          });
        }
        currentPos += citeText.length + 2;
        continue;
      }

      // Single author pattern (with optional initial prefix — "S. Lee, 2018")
      const singleMatch = citeText.match(new RegExp(
        `^${INITIAL_PREFIX}(${COMPOUND_SURNAME})\\s*,\\s*(${YEAR_TOKEN})(?:\\s*,\\s*\\d{4}[a-z]?)*$`,
        'i',
      ));
      if (singleMatch) {
        const { year, suffix } = parseYear(singleMatch[2]);
        const authors = parseAuthors(singleMatch[1]);
        const smType = classifyCitation(authors, false, false);
        if (!emitAllBundleYears(authors, smType, singleMatch[2])) {
          addCitation({
            raw: `(${citeText})`,
            normalized: normalizeCitation(`(${citeText})`),
            type: smType,
            citationStyle: 'parenthetical',
            authors,
            year,
            yearSuffix: suffix,
            position: { start: currentPos, end: currentPos + citeText.length },
            context: extractContext(text, currentPos, citeText.length)
          });
        }
      } else {
        // Organizational / multi-word author fragment: "Open Science
        // Collaboration, 2015", "R Core Team, 2019" as a ';'-bundle member. The
        // structured matchers above all require a single COMPOUND_SURNAME (or a
        // &/comma list), so a run of 2+ plain capitalized tokens fell through
        // and the whole fragment was silently dropped. Fallback only — fires
        // when singleMatch (and every earlier matcher) missed. Cycle 4
        // (APA-ORG-AUTHOR).
        const orgFrag = citeText.match(new RegExp(
          `^(${ORG_AUTHOR})\\s*,\\s*(${YEAR_TOKEN})$`,
        ));
        if (orgFrag && orgLeadAllowed(orgFrag[1].split(/\s+/)[0] ?? '') && !isMonthName(orgFrag[1])) {
          const { year, suffix } = parseYear(orgFrag[2]);
          const author = createParsedAuthor(orgFrag[1]);
          author.isOrganization = true;
          addCitation({
            raw: `(${citeText})`,
            normalized: normalizeCitation(`(${citeText})`),
            type: 'group_full',
            citationStyle: 'parenthetical',
            authors: [author],
            year,
            yearSuffix: suffix,
            position: { start: currentPos, end: currentPos + citeText.length },
            context: extractContext(text, currentPos, citeText.length),
          });
        }
      }

      currentPos += citeText.length + 2; // +2 for "; "
    }
  }
  
  // ============ PROSE-BUNDLED PARENTHETICAL ============
  // A parenthetical can bundle citations separated by PROSE rather than a ';',
  // or carry a trailing prose note: "(Hong & Reed, 2021, reanalysis with RoBMA
  // in Bartoš, Maier, Wagenmakers, et al., 2022)" / "(Smith, 2020, in their
  // main analysis)". The semicolon splitter (multipleCitations) never fires (no
  // ';'), and the (...)-anchored single/two-author/et-al/mixed-list patterns all
  // fail because non-citation prose sits between the year and the closing ')',
  // so BOTH citations are lost (collabra_90203 L94: Hong & Reed 2021 + Bartoš
  // et al. 2022 both missed — scimeto-iterate 2026-06-08d D3/D6). This
  // pass scans the interior of each ';'-free parenthetical for "<Surname-list>
  // [et al.], YYYY" groups and emits each at its TRUE position. It is
  // OVERLAP-AWARE: a candidate overlapping a citation an earlier pattern already
  // detected is dropped, so a cleanly-handled paren ("(Smith, 2020)", "(Thaler,
  // 1985, 1999)") is never re-emitted — no occurrence-count inflation. NO `i`
  // flag: the [A-ZÀ-Ÿ] surname anchor in COMPOUND_SURNAME must hold so lowercase
  // prose ("reanalysis with robma in") cannot masquerade as an author; the
  // sentence-connector / month / common-word guards drop the residual FPs.
  const PROSE_PAREN = /\(([^)]{1,400})\)/g;
  // Author list: comma-separated surnames, optionally closed by a final
  // "& Surname" / "and Surname" (incl. the Oxford-comma forms ", & Surname" /
  // ", and Surname"). Greedy so "Harley, Carlsen, & Loftus" / "Fritz, Morris, &
  // Richler" capture the FULL list (first author Harley / Fritz) rather than the
  // trailing name only — a wrong-first-author bug that mis-keyed the citation.
  const INPAREN_AUTHOR_LIST =
    `${COMPOUND_SURNAME}(?:\\s*,\\s*${COMPOUND_SURNAME})*(?:\\s*,?\\s*(?:&|and)\\s*${COMPOUND_SURNAME})?`;
  const INPAREN_AUTHOR_YEAR = new RegExp(
    `(?<![A-Za-zÀ-ÿ])(${INPAREN_AUTHOR_LIST})` +
    `(?:\\s*,?\\s*(et\\s*\\.?\\s*al\\.?))?` +
    `\\s*,\\s*(\\d{4}[a-z]?)(?![\\d])`,
    'g',
  );
  const overlapsExisting = (s: number, e: number): boolean =>
    citations.some(c => s < c.position.end && c.position.start < e);
  let pMatch: RegExpExecArray | null;
  PROSE_PAREN.lastIndex = 0;
  while ((pMatch = PROSE_PAREN.exec(text)) !== null) {
    const interior = pMatch[1];
    // ';'-delimited bundles are owned by the multipleCitations splitter above.
    if (interior.includes(';')) continue;
    const interiorStart = pMatch.index + 1;
    INPAREN_AUTHOR_YEAR.lastIndex = 0;
    let am: RegExpExecArray | null;
    while ((am = INPAREN_AUTHOR_YEAR.exec(interior)) !== null) {
      const authorList = am[1];
      const firstAuthorRaw =
        authorList.split(/\s*(?:,|&|and)\s*/i)[0]?.trim() || '';
      if (
        isSentenceConnector(firstAuthorRaw) ||
        isMonthName(firstAuthorRaw) ||
        COMMON_NON_AUTHOR_WORDS.has(firstAuthorRaw.toLowerCase())
      ) {
        continue;
      }
      const start = interiorStart + am.index;
      const end = start + am[0].length;
      // Drop anything an earlier pattern already detected at this location.
      if (overlapsExisting(start, end)) continue;
      const isEtAl = !!am[2];
      const names = authorList
        .split(/\s*(?:,|&|(?<![A-Za-z])and(?![A-Za-z]))\s*/i)
        .map(s => s.trim())
        .filter(Boolean);
      const authors = names.map(n => createParsedAuthor(n));
      if (isEtAl) authors.push(createParsedAuthor('et al.', true));
      if (authors.length === 0) continue;
      const { year, suffix } = parseYear(am[3]);
      addCitation({
        raw: `(${am[0]})`,
        normalized: normalizeCitation(`(${am[0]})`),
        type: classifyCitation(authors, false, false),
        citationStyle: 'parenthetical',
        authors,
        year,
        yearSuffix: suffix,
        position: { start, end },
        context: extractContext(text, start, am[0].length),
      });
      // TC-MULTIYEAR-MULTIAUTHOR (scimeto-iterate 2026-07-03): an explicit
      // multi-author parenthetical with a trailing YEAR LIST —
      // "(de Melo, Marsella, & Gratch, 2016, 2017)", "(Wang & Benbasat, 2016,
      // 2017)" — must emit ONE citation per year, all sharing the author list
      // (gold expects 2 works). The `sameAuthorMultiYear` splitter above handles
      // only the SINGLE-author "(de Melo, 2016, 2017)" and ET-AL "(Smith et al.,
      // 2016, 2017)" shapes; the explicit-author list falls to this generic
      // in-paren scanner, whose regex captures a single year and dropped the
      // "2016" tail's siblings. Here we look for a "(\s*,\s*YYYY)+" continuation
      // in `interior` immediately after this match's first year and emit each
      // extra year as its own citation with a DISTINCT narrow position window
      // (addCitation dedupes by exact start-end, so siblings need distinct
      // windows or only the first survives — same discipline as sameAuthorMultiYear).
      const YEAR_TAIL = /^((?:\s*,\s*\d{4}[a-z]?)+)/;
      const tailMatch = interior.slice(am.index + am[0].length).match(YEAR_TAIL);
      if (tailMatch) {
        const extraYears = tailMatch[1]
          .split(/\s*,\s*/)
          .map(y => y.trim())
          .filter(Boolean);
        // Absolute offset (into `interior`) where the year tail begins.
        const tailBaseInInterior = am.index + am[0].length;
        let searchFrom = 0;
        for (const rawYear of extraYears) {
          const { year: yr, suffix: sfx } = parseYear(rawYear);
          if (!yr) continue;
          const off = tailMatch[1].indexOf(rawYear, searchFrom);
          if (off < 0) continue;
          searchFrom = off + rawYear.length;
          const yStart = interiorStart + tailBaseInInterior + off;
          const yEnd = yStart + rawYear.length;
          if (overlapsExisting(yStart, yEnd)) continue;
          addCitation({
            raw: `(${am[1]}${am[2] ? ', ' + am[2] : ''}, ${rawYear})`,
            normalized: normalizeCitation(`(${am[1]}, ${rawYear})`),
            type: classifyCitation(authors, false, false),
            citationStyle: 'parenthetical',
            authors,
            year: yr,
            yearSuffix: sfx,
            position: { start: yStart, end: yEnd },
            context: extractContext(text, start, am[0].length),
          });
        }
        // Advance the scanner past the consumed year tail so the bare years
        // aren't re-examined as author-less fragments on the next iteration.
        INPAREN_AUTHOR_YEAR.lastIndex = am.index + am[0].length + tailMatch[1].length;
      }
    }
  }

  // ============ YEAR-ELIDED PAGE-ONLY BACK-REFERENCE (stateful post-pass) ============
  // A same-paragraph back-reference that omits the year because the author was
  // cited (with a year) just before: '"…quote…" (Slovic & Fischhoff, p. 549).'
  // (valid APA — chen_2021_jesp, TC-G, scimeto-iterate cycle 8). citelink's
  // year-anchored detectors require a 4-digit year, so this is missed.
  //
  // FP is bounded HARD by two requirements: (1) the parenthetical must carry a
  // page locator ("p. N" / "pp. N") and NO year — a bare "(Name)" never matches;
  // (2) the year is RESOLVED only from an ALREADY-DETECTED citation whose first
  // author surname matches, taking the nearest such citation that appears BEFORE
  // this position. So it can fire only where citelink already found that exact
  // author cited with a year — it can never invent a citation for an author not
  // otherwise present. Runs as a post-pass so every year-bearing citation this
  // author has is already in `citations`.
  {
    const YEAR_ELIDED_PAGE_REF = new RegExp(
      `\\((${COMPOUND_SURNAME})(?:\\s*(?:&|and)\\s*(${COMPOUND_SURNAME}))?` +
        `,\\s*pp?\\.\\s*\\d+[^)]*\\)`,
      'g',
    );
    // Snapshot of citations detected so far, sorted by position, for nearest-prior lookup.
    const priorByAuthor = citations
      .filter(c => c.year && /^\d{4}$/.test(c.year))
      .map(c => ({
        surname: (c.authors[0]?.normalized ?? c.authors[0]?.raw ?? '').toLowerCase(),
        year: c.year,
        yearSuffix: c.yearSuffix,
        start: c.position.start,
      }));
    let em: RegExpExecArray | null;
    YEAR_ELIDED_PAGE_REF.lastIndex = 0;
    while ((em = YEAR_ELIDED_PAGE_REF.exec(text)) !== null) {
      // The parenthetical must NOT already contain a 4-digit year (that would be a
      // normal citation another pattern owns).
      if (/\b(?:19|20)\d{2}\b/.test(em[0])) continue;
      const first = em[1];
      if (isSentenceConnector(first) || isMonthName(first)) continue;
      const firstNorm = first.toLowerCase();
      // Resolve the year from the nearest already-detected same-first-author
      // citation that starts before this occurrence; fall back to the nearest
      // overall if none precedes (still same author).
      const sameAuthor = priorByAuthor.filter(p => p.surname === firstNorm);
      if (sameAuthor.length === 0) continue; // author never cited with a year → do not invent
      const before = sameAuthor.filter(p => p.start < em!.index);
      const resolved = (before.length ? before[before.length - 1] : sameAuthor[0]);
      const authors = em[2]
        ? [createParsedAuthor(first), createParsedAuthor(em[2])]
        : [createParsedAuthor(first)];
      addCitation({
        raw: em[0],
        normalized: normalizeCitation(em[0]),
        type: classifyCitation(authors, false, false),
        citationStyle: 'parenthetical',
        authors,
        year: resolved.year,
        yearSuffix: resolved.yearSuffix,
        position: { start: em.index, end: em.index + em[0].length },
        context: extractContext(text, em.index, em[0].length),
      });
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
    if (isDigitGluedSourceIndex(text, c)) continue;
    keptKeys.add(dupKey);
    deoverlapped.push(c);
  }

  // `raw` and `context` are documented as the ORIGINAL text, and Scimeto
  // stores them verbatim as the user-visible citation_text / context_text
  // (apps/worker/src/processors/coreProcessors.ts:186,195). Matching runs against
  // the masked copy, but what we hand back must be the caller's own bytes - a
  // field that claims to be the source and is not is exactly the class of defect
  // this library exists to catch. The mask is length-preserving, so every position
  // indexes rawText correctly. `normalized` is deliberately left as computed from
  // the masked text: it is the cleaned form, not a claim about the source.
  // Raised by the openai seat of the 2026-09-01 cross-model round.
  if (text !== rawText) {
    for (const citation of deoverlapped) {
      const { start, end } = citation.position;
      citation.raw = rawText.slice(start, end);
      citation.context = extractContext(rawText, start, end - start);
    }
  }

  return deoverlapped;
}

/**
 * True when a detected citation is really an entry in a NUMBERED SOURCE
 * CATALOGUE — a table/figure footnote that lists each source prefixed by the
 * index number the table body refers to, with no separator:
 *
 *   Notes: Sources used to derive evidence-based recommendations: 3Aguinis and
 *   Vandenberg (2014), 7Aram and Salipante (2003), 32Castro (2002), ...
 *
 * These are a bibliography-style catalogue keyed to superscript markers in the
 * table ("(3, 12, 23)"), not prose citations, and the human-verified gold
 * excludes them. On annals_2 (10.5465/annals.2016.0011) six such blocks produced
 * 199 of citelink's 343 detections — precision 0.475 against recall 0.937 — and
 * every spurious detection reaches the user as a citation to reconcile, or as a
 * citation-matching ISSUE when it fails to resolve.
 *
 * The signature is structural rather than paper-specific: a catalogue entry
 * OPENS with its index digits glued straight onto the first author's surname
 * ("3Aguinis", "80Ployhart", "12Banks") — a form running prose never produces.
 *
 * Detecting it needs care, because the glued digit ALREADY breaks the first
 * author: citelink does not detect "3Aguinis and Vandenberg (2014)" at
 * "Aguinis" — it anchors on the SECOND author and emits a mis-keyed
 * "Vandenberg (2014)", losing the real first author. So the character before
 * the citation's own span is an ordinary space, and a span-local digit test
 * finds nothing. We therefore walk LEFT from the span over the entry's
 * author-list run and test whether the ENTRY's opener is digit-glued.
 *
 * The walk stops at any character that cannot occur inside a single author
 * list — '.', ';', ':', '(', ')', and digits — which keeps it inside one
 * catalogue entry. That bound is load-bearing: a permissive 90-char walk
 * (letters/spaces/commas only, no hard stops) crossed sentence boundaries and
 * flagged 158 detections including real prose citations
 * ("(Karabag & Berggren, 2016)", "(Cortina et al., 2017a)"), because it
 * eventually reached an unrelated digit such as a year. With the stops it
 * flags 147 on annals_2, every one a genuine catalogue entry, and ZERO of
 * them appears in the human-verified gold — so the guard costs no recall.
 *
 * Author-year only by construction: numeric-paradigm papers are detected by
 * `detectNumericCitations` (analyze.ts), a separate path this function is not on
 * — so a numeric citation, which legitimately lives among digits, can never
 * reach this guard. (scimeto-iterate 2026-08-04.)
 */
function isDigitGluedSourceIndex(text: string, c: DetectedCitation): boolean {
  let i = c.position.start;
  const limit = Math.max(0, i - 80);
  // Walk left over the entry's author-list run. Anything else — sentence
  // punctuation, brackets, or a digit — ends the entry and stops the walk.
  while (i > limit && /[A-Za-zÀ-ÿ,&'’\-\s]/.test(text[i - 1])) i--;
  if (i <= 0) return false;
  if (!/[0-9]/.test(text[i - 1])) return false;
  // The entry opens with a surname glued onto its index digits. Usually
  // capitalized ("3Aguinis"), but a particle surname can open lowercase
  // ("89van Aken (2004)"), so accept a lowercase particle as the opener too —
  // requiring a capital here left that entry's citation live.
  if (/[A-ZÀ-Ý]/.test(text[i])) return true;
  return LOWERCASE_PARTICLE_OPENER.test(text.slice(i, i + 12));
}

/** A name particle opening a catalogue entry in lowercase ("89van Aken"). */
const LOWERCASE_PARTICLE_OPENER =
  /^(?:van|von|de|del|della|den|der|des|di|do|dos|du|la|le|ten|ter|bin|ibn|ben|ap|al|el)\s+[A-ZÀ-Ý]/;

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




