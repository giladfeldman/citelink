/**
 * Citation-Reference Matching Module - APA 7 Style
 * Matches detected citations to parsed references using type-based matching
 * 
 * Matching strategies by citation type:
 * 1. Single author: Match first author + year
 * 2. Two authors: Match BOTH authors + year (reference must have exactly 2 authors)
 * 3. Et al.: Match first author + year (reference must have 3+ authors)
 * 4. Group/Organization: Match abbreviation or full name + year
 * 5. Secondary source: Match the secondary (citing) author
 * 
 * Features:
 * - Fuzzy name matching with Levenshtein distance
 * - Unicode/accent normalization
 * - Year suffix support (2020a, 2020b)
 * - Typo tolerance
 * - Ambiguity detection
 */

import {
  DetectedCitation,
  CitationType,
  ParsedCitationAuthor,
  normalizeText,
  getOrganizationFullName
} from './citationDetector.js';
import {
  ParsedReference,
  normalizeName,
  getOrganizationAbbreviations
} from './referenceParser.js';
import type { CitationStyleType } from './types.js';

// Matching configuration with tiered thresholds
const MATCHING_CONFIG = {
  // Auto-match threshold (high confidence - no user intervention needed)
  AUTO_MATCH_THRESHOLD: 0.75,
  // Suggested match threshold (medium confidence - show to user for confirmation)
  SUGGESTED_MATCH_THRESHOLD: 0.4,
  // Minimum score to even consider as a possible match
  MIN_SCORE_THRESHOLD: 0.3,
  // Threshold for considering multiple matches as ambiguous
  AMBIGUOUS_SCORE_DIFFERENCE: 0.1,
};

export interface MatchResult {
  citation: DetectedCitation;
  reference: ParsedReference | null;
  confidence: number;
  status: 'matched' | 'suggested' | 'ambiguous' | 'no_match';
  matchMethod?: string;
  matchDetails?: {
    authorScore: number;
    yearScore: number;
    typeValidation?: boolean;
  };
  alternativeMatches?: {
    reference: ParsedReference;
    confidence: number;
  }[];
}

interface MatchScore {
  total: number;
  method: string;
  details: {
    authorScore: number;
    yearScore: number;
    typeValidation?: boolean;
  };
}

// Organization abbreviation lookup (reverse: full name to abbreviation)
const ORG_FULL_TO_ABBREV: Record<string, string> = {};
const orgAbbrevs = getOrganizationAbbreviations();
for (const [abbrev, fullNames] of Object.entries(orgAbbrevs)) {
  for (const fullName of fullNames) {
    ORG_FULL_TO_ABBREV[fullName.toLowerCase()] = abbrev;
  }
}

/**
 * Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Fuzzy match two names with tolerance for typos
 * Returns score between 0 and 1
 */
function fuzzyNameMatch(name1: string, name2: string): number {
  if (!name1 || !name2) return 0;
  
  const norm1 = normalizeName(name1);
  const norm2 = normalizeName(name2);
  
  // Exact match after normalization
  if (norm1 === norm2) return 1.0;
  
  // One contains the other (handles particles like "van der Berg" vs "Berg")
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.95;

  // Hyphenated name suffix match: "Peyton" matches "Bigda-Peyton", "Muñoz" matches "Mendieta-Muñoz"
  if (norm1.includes('-') && norm1.endsWith(norm2)) return 0.9;
  if (norm2.includes('-') && norm2.endsWith(norm1)) return 0.9;
  
  // Check if they share a significant common substring
  const minLen = Math.min(norm1.length, norm2.length);
  if (minLen >= 4) {
    // Check for common prefix/suffix
    let commonPrefix = 0;
    for (let i = 0; i < minLen; i++) {
      if (norm1[i] === norm2[i]) commonPrefix++;
      else break;
    }
    if (commonPrefix >= minLen * 0.8) return 0.9;
  }
  
  // Levenshtein distance
  const distance = levenshteinDistance(norm1, norm2);
  const maxLen = Math.max(norm1.length, norm2.length);
  
  if (distance === 1) return 0.9;  // 1 character difference
  if (distance === 2) return 0.8;  // 2 character difference
  if (distance <= maxLen * 0.2) return 0.7;  // Up to 20% different
  if (distance <= maxLen * 0.3) return 0.5;  // Up to 30% different
  
  return 0;  // Too different
}

/**
 * Match year with support for suffixes and special cases
 */
function matchYear(
  citationYear: string,
  citationSuffix: string | undefined,
  referenceYear: string,
  referenceSuffix: string | undefined
): number {
  // Normalize years (remove any suffixes for base comparison)
  const cYear = citationYear.replace(/[a-z]$/i, '').toLowerCase();
  const rYear = referenceYear.replace(/[a-z]$/i, '').toLowerCase();
  const cSuffix = citationSuffix?.toLowerCase() || '';
  const rSuffix = referenceSuffix?.toLowerCase() || '';
  
  // Handle special cases
  if (cYear === 'n.d.' || rYear === 'n.d.') {
    return cYear === rYear ? 0.9 : 0.5;
  }
  if (cYear === 'in press' || rYear === 'in press') {
    return cYear === rYear ? 0.9 : 0.5;
  }
  
  // Exact year and suffix match
  if (cYear === rYear && cSuffix === rSuffix) return 1.0;
  
  // Exact year, no suffix in citation (acceptable - user might not know suffix)
  if (cYear === rYear && !cSuffix) return 0.95;
  
  // Exact year, different suffix (disambiguation needed)
  if (cYear === rYear && cSuffix && rSuffix && cSuffix !== rSuffix) return 0.3;
  
  // Year off by 1 (common publication date confusion)
  const cYearNum = parseInt(cYear);
  const rYearNum = parseInt(rYear);
  if (!isNaN(cYearNum) && !isNaN(rYearNum)) {
    if (Math.abs(cYearNum - rYearNum) === 1) return 0.6;
  }
  
  return 0;  // Years don't match
}

/**
 * Match single author citation to reference
 */
function matchSingleAuthor(
  citation: DetectedCitation,
  reference: ParsedReference
): number {
  const citationAuthor = citation.authors[0];
  if (!citationAuthor) return 0;

  // Strip possessive 's from author name
  const rawName = citationAuthor.raw.replace(/'s$/i, '');
  const citationName = citationAuthor.normalized
    ? citationAuthor.normalized.replace(/'s$/i, '')
    : normalizeName(rawName);
  const referenceName = reference.firstAuthorLastNameNormalized ||
    normalizeName(reference.firstAuthorLastName);

  const firstAuthorScore = fuzzyNameMatch(citationName, referenceName);
  if (firstAuthorScore >= 0.8) return firstAuthorScore;

  // Fallback: check if cited author matches any author in the ref (e.g., "Zimmerman's (2005)"
  // where Zimmerman is the second author — common in narrative possessive citations)
  const refNames = reference.allAuthorLastNamesNormalized || [];
  if (refNames.length > 1) {
    const bestOtherScore = Math.max(...refNames.map(rn => fuzzyNameMatch(citationName, rn)));
    if (bestOtherScore >= 0.8) {
      // Penalty for not matching first author (this is typically an imprecise citation)
      return bestOtherScore * 0.85;
    }
  }

  return firstAuthorScore;
}

/**
 * Match two-author citation to reference
 * Reference MUST have exactly 2 authors
 */
function matchTwoAuthors(
  citation: DetectedCitation,
  reference: ParsedReference
): number {
  const cite1 = citation.authors[0];
  const cite2 = citation.authors[1];

  if (!cite1 || !cite2) return 0;

  const citeName1 = cite1.normalized || normalizeName(cite1.raw);
  const citeName2 = cite2.normalized || normalizeName(cite2.raw);

  // Reference must have exactly 2 authors for a two-author citation
  if (reference.authorCount === 2) {
    const refName1 = reference.firstAuthorLastNameNormalized ||
      normalizeName(reference.firstAuthorLastName);
    const refName2 = reference.secondAuthorLastNameNormalized ||
      (reference.secondAuthorLastName ? normalizeName(reference.secondAuthorLastName) : '');

    if (!refName2) return 0.2;

    const score1 = fuzzyNameMatch(citeName1, refName1);
    const score2 = fuzzyNameMatch(citeName2, refName2);

    // Both must match reasonably well
    if (score1 < 0.7 || score2 < 0.7) {
      return Math.min(score1, score2) * 0.5;
    }

    return (score1 + score2) / 2;
  }

  // Fallback for 3+ author refs: check if both cited authors appear anywhere
  // in the ref's author list (common when authors incorrectly omit middle authors)
  if (reference.authorCount >= 3) {
    const refNames = reference.allAuthorLastNamesNormalized || [];
    const score1 = Math.max(...refNames.map(rn => fuzzyNameMatch(citeName1, rn)), 0);
    const score2 = Math.max(...refNames.map(rn => fuzzyNameMatch(citeName2, rn)), 0);
    if (score1 >= 0.8 && score2 >= 0.8) {
      // Slight penalty: this is a citation error (should be "et al." not two names)
      return ((score1 + score2) / 2) * 0.85;
    }
  }

  return 0.2;
}

/**
 * Match et al. citation to reference
 * Reference MUST have 3 or more authors
 */
function matchEtAl(
  citation: DetectedCitation,
  reference: ParsedReference
): number {
  // Reference must have 3+ authors for et al.
  if (reference.authorCount < 3) return 0.2;
  
  // Get the first (non-et-al) author from citation
  const citationFirstAuthor = citation.authors.find(a => !a.isEtAl);
  if (!citationFirstAuthor) return 0;
  
  const citationName = citationFirstAuthor.normalized || normalizeName(citationFirstAuthor.raw);
  const referenceName = reference.firstAuthorLastNameNormalized || 
    normalizeName(reference.firstAuthorLastName);
  
  const nameScore = fuzzyNameMatch(citationName, referenceName);
  
  // Boost score slightly for having correct author count structure
  return nameScore * 0.95;
}

/**
 * Match group/organization author citation to reference
 */
function matchGroupAuthor(
  citation: DetectedCitation,
  reference: ParsedReference
): number {
  // Check if reference is a group author; if not, check if the citation org name
  // appears in the reference first author (handles undetected orgs like "Instituto Brasileiro ... (IBGE)")
  if (!reference.isGroupAuthor) {
    const citName = citation.authors[0]?.raw?.toLowerCase() || '';
    const refFirstAuthor = reference.firstAuthorLastName?.toLowerCase() || '';
    if (citName && refFirstAuthor.includes(citName)) {
      return 0.9; // org abbreviation found in ref first author
    }
    return 0.1;
  }
  
  const citationOrg = citation.authors[0];
  if (!citationOrg) return 0;
  
  const citationOrgName = citationOrg.raw;
  const citationOrgAbbrev = citationOrg.abbreviation;
  
  const referenceOrgName = reference.groupName;
  const referenceOrgAbbrev = reference.groupAbbreviation;
  
  // Check abbreviation match
  if (citationOrgAbbrev && referenceOrgAbbrev) {
    if (citationOrgAbbrev.toUpperCase() === referenceOrgAbbrev.toUpperCase()) {
      return 1.0;
    }
  }
  
  // Check if citation abbreviation matches known full name
  if (citationOrgAbbrev && referenceOrgName) {
    const knownFullNames = getOrganizationFullName(citationOrgAbbrev);
    if (knownFullNames) {
      for (const fullName of knownFullNames) {
        if (normalizeName(fullName) === normalizeName(referenceOrgName)) {
          return 1.0;
        }
      }
    }
  }
  
  // Check if citation full name matches reference
  if (citationOrgName && referenceOrgName) {
    const score = fuzzyNameMatch(citationOrgName, referenceOrgName);
    if (score > 0.8) return score;

    // Word overlap matching for org names: "US Census Bureau" vs "United States Census Bureau"
    const citeWords = citationOrgName.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    const refWords = referenceOrgName.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    if (citeWords.length >= 2 && refWords.length >= 2) {
      const overlap = citeWords.filter(w => refWords.includes(w)).length;
      const overlapScore = overlap / Math.min(citeWords.length, refWords.length);
      if (overlapScore >= 0.6 && overlap >= 2) return 0.9;
    }
  }
  
  // Check if citation name matches reference abbreviation via lookup
  if (citationOrgName && !citationOrgAbbrev) {
    const lookupAbbrev = ORG_FULL_TO_ABBREV[citationOrgName.toLowerCase()];
    if (lookupAbbrev && referenceOrgAbbrev) {
      if (lookupAbbrev.toUpperCase() === referenceOrgAbbrev.toUpperCase()) {
        return 0.95;
      }
    }
  }

  // Check if citation name is itself a known abbreviation (e.g., "US Census Bureau" → "United States Census Bureau")
  if (citationOrgName && referenceOrgName) {
    const knownFullNames = getOrganizationFullName(citationOrgName);
    if (knownFullNames) {
      for (const fullName of knownFullNames) {
        if (normalizeName(fullName) === normalizeName(referenceOrgName)) {
          return 1.0;
        }
      }
    }
    // Also check reverse: ref name is the abbreviation, citation name is the full form
    const refLookupFullNames = getOrganizationFullName(referenceOrgName || '');
    if (refLookupFullNames) {
      for (const fullName of refLookupFullNames) {
        if (normalizeName(fullName) === normalizeName(citationOrgName)) {
          return 1.0;
        }
      }
    }
  }

  return 0;
}

/**
 * Calculate match score based on citation type
 */
function calculateMatchScore(
  citation: DetectedCitation,
  reference: ParsedReference
): MatchScore {
  // Step 1: Year match (important but not eliminating)
  const yearScore = matchYear(
    citation.year,
    citation.yearSuffix,
    reference.year,
    reference.yearSuffix
  );
  
  // If years completely don't match, reduce but don't eliminate
  if (yearScore < 0.3) {
    return {
      total: yearScore * 0.3,
      method: 'year_mismatch',
      details: { authorScore: 0, yearScore }
    };
  }
  
  // Step 2: Match based on citation type
  let authorScore = 0;
  let method = 'unknown';
  let typeValidation = true;
  
  switch (citation.type) {
    case 'single':
      authorScore = matchSingleAuthor(citation, reference);
      method = 'single_author';
      break;
      
    case 'two_authors':
      authorScore = matchTwoAuthors(citation, reference);
      method = 'two_authors';
      // Type validation: 2 authors ideal, but 3+ can match if both cited names appear
      typeValidation = reference.authorCount === 2 || (reference.authorCount >= 3 && authorScore > 0.6);
      break;
      
    case 'et_al':
      authorScore = matchEtAl(citation, reference);
      method = 'et_al';
      // Type validation: reference should have 3+ authors
      typeValidation = reference.authorCount >= 3;
      break;
      
    case 'group':
    case 'group_full':
      authorScore = matchGroupAuthor(citation, reference);
      method = 'group_author';
      // Type validation: reference should be a group author
      typeValidation = reference.isGroupAuthor;
      break;
      
    case 'secondary':
      // For secondary sources, match the secondary (citing) author
      authorScore = matchSingleAuthor(citation, reference);
      method = 'secondary_source';
      break;
      
    case 'multiple':
      // Multiple citations are split, so this shouldn't happen often
      authorScore = matchSingleAuthor(citation, reference);
      method = 'multiple';
      break;
      
    default:
      // Fallback to single author matching
      authorScore = matchSingleAuthor(citation, reference);
      method = 'fallback';
  }
  
  // Combine scores: 70% author, 30% year
  const total = (authorScore * 0.7) + (yearScore * 0.3);
  
  // Apply small penalty if type validation fails
  const adjustedTotal = typeValidation ? total : total * 0.9;
  
  return {
    total: adjustedTotal,
    method,
    details: {
      authorScore,
      yearScore,
      typeValidation
    }
  };
}

/**
 * Match a single citation to all references
 * Returns sorted list of matches with confidence scores
 */
export function matchCitationToReferences(
  citation: DetectedCitation,
  references: ParsedReference[]
): MatchResult[] {
  const results: MatchResult[] = [];
  
  for (const reference of references) {
    const score = calculateMatchScore(citation, reference);
    
    if (score.total > MATCHING_CONFIG.MIN_SCORE_THRESHOLD) {
      results.push({
        citation,
        reference,
        confidence: score.total,
        status: 'no_match', // Will be set below
        matchMethod: score.method,
        matchDetails: score.details
      });
    }
  }
  
  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);
  
  // If no matches found
  if (results.length === 0) {
    return [{
      citation,
      reference: null,
      confidence: 0,
      status: 'no_match'
    }];
  }
  
  // Determine status for best match
  const bestMatch = results[0];
  
  // Check for ambiguity (multiple high-scoring matches)
  const ambiguousMatches = results
    .slice(1)
    .filter(m => (bestMatch.confidence - m.confidence) < MATCHING_CONFIG.AMBIGUOUS_SCORE_DIFFERENCE)
    .slice(0, 3);
  
  if (bestMatch.confidence >= MATCHING_CONFIG.AUTO_MATCH_THRESHOLD) {
    if (ambiguousMatches.length > 0) {
      bestMatch.status = 'ambiguous';
      bestMatch.alternativeMatches = ambiguousMatches.map(m => ({
        reference: m.reference!,
        confidence: m.confidence
      }));
    } else {
      bestMatch.status = 'matched';
    }
  } else if (bestMatch.confidence >= MATCHING_CONFIG.SUGGESTED_MATCH_THRESHOLD) {
    if (ambiguousMatches.length > 0) {
      bestMatch.status = 'ambiguous';
      bestMatch.alternativeMatches = ambiguousMatches.map(m => ({
        reference: m.reference!,
        confidence: m.confidence
      }));
    } else {
      bestMatch.status = 'suggested';
    }
  } else {
    bestMatch.status = 'no_match';
  }
  
  return [bestMatch];
}

/**
 * Match numeric citations to references by position/list number
 */
function matchNumericCitation(
  citation: DetectedCitation,
  references: ParsedReference[],
): MatchResult[] {
  const numbers: number[] = (citation as any).citationNumbers || [];
  if (numbers.length === 0) {
    return [{ citation, reference: null, confidence: 0, status: 'no_match' }];
  }

  // Build map: reference list number → reference
  const refByNumber = new Map<number, ParsedReference>();
  references.forEach((ref, idx) => {
    const num = ref.listNumber ?? (idx + 1);
    refByNumber.set(num, ref);
  });

  // Cap to the maximum reference number to avoid inflated no_match counts
  // from range citations like [64-102] when only 39 refs exist
  const maxRefNum = Math.max(...Array.from(refByNumber.keys()), 0);

  const results: MatchResult[] = [];
  for (const num of numbers) {
    // Skip numbers clearly beyond the reference list — these would all be
    // no_match and would inflate the unmatched count misleadingly
    if (maxRefNum > 0 && num > maxRefNum) continue;

    const ref = refByNumber.get(num);
    if (ref) {
      results.push({
        citation,
        reference: ref,
        confidence: 1.0,
        status: 'matched',
        matchMethod: 'numeric_position',
        matchDetails: { authorScore: 1, yearScore: 1, typeValidation: true },
      });
    } else {
      results.push({
        citation,
        reference: null,
        confidence: 0,
        status: 'no_match',
        matchMethod: 'numeric_position',
      });
    }
  }

  return results.length > 0 ? results : [{ citation, reference: null, confidence: 0, status: 'no_match' }];
}

/** Check if a citation style is a numeric paradigm */
function isNumericStyle(style?: CitationStyleType): boolean {
  return style === 'vancouver' || style === 'ieee' || style === 'nature' || style === 'ama';
}

/**
 * Match all citations to references
 * Main entry point for matching
 */
export function matchCitationsToReferences(
  citations: DetectedCitation[],
  references: ParsedReference[],
  citationStyle?: CitationStyleType,
): MatchResult[] {
  if (references.length === 0) {
    return citations.map(citation => ({
      citation,
      reference: null,
      confidence: 0,
      status: 'no_match' as const,
    }));
  }

  const results: MatchResult[] = [];

  for (const citation of citations) {
    // Use numeric matching for numeric citation types
    if ((citation.type as string) === 'numeric' || isNumericStyle(citationStyle)) {
      const matchResults = matchNumericCitation(citation, references);
      results.push(...matchResults);
    } else {
      const matchResults = matchCitationToReferences(citation, references);
      results.push(...matchResults);
    }
  }

  return results;
}

/**
 * Utility: Get match statistics
 */
export function getMatchStatistics(results: MatchResult[]): {
  total: number;
  matched: number;
  suggested: number;
  ambiguous: number;
  noMatch: number;
  matchRate: number;
} {
  const stats = {
    total: results.length,
    matched: 0,
    suggested: 0,
    ambiguous: 0,
    noMatch: 0,
    matchRate: 0
  };
  
  for (const result of results) {
    switch (result.status) {
      case 'matched':
        stats.matched++;
        break;
      case 'suggested':
        stats.suggested++;
        break;
      case 'ambiguous':
        stats.ambiguous++;
        break;
      case 'no_match':
        stats.noMatch++;
        break;
    }
  }
  
  stats.matchRate = stats.total > 0 
    ? (stats.matched + stats.suggested + stats.ambiguous) / stats.total 
    : 0;
  
  return stats;
}

// Re-export types for convenience
export type { CitationType, ParsedCitationAuthor } from './citationDetector.js';
export type { ParsedReference, ParsedReferenceAuthor } from './referenceParser.js';
