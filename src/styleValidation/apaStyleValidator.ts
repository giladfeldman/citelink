/**
 * APA 7 Style Validator Service
 * Validates citations and references against APA 7th Edition formatting rules
 * Reference: https://apastyle.apa.org/
 */

import type { CitationInput as Citation, ReferenceInput as Reference } from './inputTypes.js';

export interface APAViolation {
  type: 'citation' | 'reference' | 'reference-match';
  severity: 'error' | 'warning' | 'info';
  code: string;
  description: string;
  location: string;
  suggestion?: string;
  affectedText?: string;
}

/**
 * Check if citation uses correct parenthetical format
 * Should be: (Author, Year) or (Author et al., Year)
 */
export function validateCitationFormat(citation: Citation): APAViolation[] {
  const violations: APAViolation[] = [];
  const text = citation.citation_text || '';

  if (!text) return violations;

  // Check for common citation format issues
  const issues: { pattern: RegExp; code: string; message: string }[] = [
    {
      pattern: /\(\w+\s+\d{4}\)/g,  // (Word 2020) - missing comma
      code: 'CITATION_MISSING_COMMA',
      message: 'Citation missing comma between author and year. Should be (Author, Year)',
    },
    {
      pattern: /\b\w+\s+et\s+al\.\s+\d{4}/g,  // et al. 2020 - missing parentheses
      code: 'CITATION_MISSING_PARENS',
      message: 'Multiple author citation missing parentheses. Should be (Author et al., Year)',
    },
    {
      pattern: /\(\s*et\s+al\s*,/g,  // (et al, - missing period
      code: 'CITATION_MISSING_PERIOD',
      message: 'et al. missing period. Should be "et al."',
    },
    {
      pattern: /\(([A-Z][a-z]+),\s*([A-Z][a-z]+)\s*&\s*([A-Z][a-z]+),\s*\d{4}\)/g,  // Three author names in citation
      code: 'CITATION_SHOULD_USE_ET_AL',
      message: 'Three or more authors in citation should use "et al." format',
    },
  ];

  for (const issue of issues) {
    if (issue.pattern.test(text)) {
      violations.push({
        type: 'citation',
        severity: 'warning',
        code: issue.code,
        description: issue.message,
        location: citation.id || text.substring(0, 50),
        affectedText: text.substring(0, 100),
      });
    }
  }

  return violations;
}

/**
 * Validate reference author formatting
 * APA 7: Last, First Initial. & Last, First Initial.
 */
export function validateReferenceAuthors(reference: Reference): APAViolation[] {
  const violations: APAViolation[] = [];
  const text = reference.raw_text || '';

  if (!text) return violations;

  const issues: { pattern: RegExp; code: string; message: string }[] = [
    {
      pattern: /^[A-Z][a-z]+,\s+[A-Z][a-z]+/,  // Smith, John - should be J
      code: 'AUTHOR_FULL_FIRST_NAME',
      message: 'Reference should use first initial only (e.g., "Smith, J." not "Smith, John")',
    },
    {
      pattern: /\b\w+,\s+\w+\.\s*$/,  // Missing & for last author
      code: 'MISSING_AMPERSAND',
      message: 'Last author in list should be preceded by & (e.g., "& Smith, J.")',
    },
  ];

  for (const issue of issues) {
    if (issue.pattern.test(text)) {
      violations.push({
        type: 'reference',
        severity: 'warning',
        code: issue.code,
        description: issue.message,
        location: reference.id || text.substring(0, 50),
        affectedText: text.substring(0, 100),
      });
    }
  }

  return violations;
}

/**
 * Validate reference year formatting
 * APA 7: (Year). [in parentheses at start]
 */
export function validateReferenceYear(reference: Reference): APAViolation[] {
  const violations: APAViolation[] = [];
  const text = reference.raw_text || '';

  if (!text) return violations;

  // Check if year appears at start in parentheses
  const yearMatch = text.match(/\(\d{4}\)/);

  if (!yearMatch) {
    violations.push({
      type: 'reference',
      severity: 'warning',
      code: 'MISSING_YEAR_PARENS',
      description: 'Reference year should be in parentheses near the start',
      location: reference.id || text.substring(0, 50),
      suggestion: 'Add year in parentheses: "(Year)."',
    });
  } else if (!text.includes(yearMatch[0] + '.')) {
    violations.push({
      type: 'reference',
      severity: 'warning',
      code: 'YEAR_MISSING_PERIOD',
      description: 'Year in parentheses should be followed by a period',
      location: reference.id || text.substring(0, 50),
      suggestion: `Format as: "${yearMatch[0]}."`,
    });
  }

  return violations;
}

/**
 * Validate reference title capitalization
 * APA 7: Only first word and proper nouns capitalized (sentence case)
 */
export function validateTitleCapitalization(title: string): APAViolation[] {
  const violations: APAViolation[] = [];

  if (!title) return violations;

  // Count capitalized words (excluding first word and known proper nouns)
  const words = title.split(/\s+/);
  let capitalizedCount = 0;

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    // Skip articles, prepositions, conjunctions
    const skipWords = ['a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'as', 'is', 'was', 'are', 'were'];

    if (!skipWords.includes(word.toLowerCase()) && word[0] === word[0].toUpperCase()) {
      capitalizedCount++;
    }
  }

  if (capitalizedCount > 2) {  // Allow for some proper nouns
    violations.push({
      type: 'reference',
      severity: 'info',
      code: 'TITLE_CAPITALIZATION',
      description: 'Reference title appears to have excessive capitalization. APA 7 uses sentence case (only first word capitalized)',
      location: title.substring(0, 50),
      affectedText: title,
      suggestion: 'Only capitalize the first word and proper nouns',
    });
  }

  return violations;
}

/**
 * Validate journal name formatting
 * APA 7: Journal name should be italicized (check for consistent formatting)
 */
export function validateJournalFormatting(reference: Reference): APAViolation[] {
  const violations: APAViolation[] = [];
  const text = reference.raw_text || '';

  if (!text) return violations;

  // Look for journal name patterns (usually between title and volume/issue)
  // This is a basic check - actual italics would need HTML/markdown context
  const issuePatterns = [
    {
      pattern: /[a-z]\d+\(/,  // Missing space before volume number
      code: 'JOURNAL_SPACING',
      message: 'Missing space before volume number',
    },
    {
      pattern: /Volume\s+\d+|Vol\.\s+\d+/i,  // Should use just number
      code: 'JOURNAL_ABBREVIATION',
      message: 'Should use volume number only, not "Volume" or "Vol."',
    },
  ];

  for (const issue of issuePatterns) {
    if (issue.pattern.test(text)) {
      violations.push({
        type: 'reference',
        severity: 'info',
        code: issue.code,
        description: issue.message,
        location: reference.id || text.substring(0, 50),
      });
    }
  }

  return violations;
}

/**
 * Validate DOI formatting
 * APA 7: https://doi.org/[DOI] or doi:[DOI]
 * If rawText is provided and already contains this DOI in correct format, skip DOI_INVALID_PREFIX (avoids false positives).
 */
export function validateDOIFormat(doi: string | null | undefined, rawText?: string | null): APAViolation[] {
  const violations: APAViolation[] = [];

  if (!doi) return violations;

  const normalizedDoi = doi.replace(/^(https:\/\/doi\.org\/|doi:)/i, '').trim();
  const alreadyFormattedInText =
    !!rawText &&
    (rawText.includes(`https://doi.org/${normalizedDoi}`) || rawText.includes(`doi:${normalizedDoi}`));

  const issues = [
    {
      test: !alreadyFormattedInText && !doi.startsWith('https://doi.org/') && !doi.startsWith('doi:'),
      code: 'DOI_INVALID_PREFIX',
      message: 'DOI should start with "https://doi.org/" or "doi:"',
    },
    {
      test: doi.includes('http://'),  // Should use https
      code: 'DOI_INSECURE',
      message: 'DOI URLs should use https:// not http://',
    },
  ];

  for (const issue of issues) {
    if (issue.test) {
      violations.push({
        type: 'reference',
        severity: 'warning',
        code: issue.code,
        description: issue.message,
        location: doi,
        affectedText: doi,
        suggestion: `Format as: "https://doi.org/${doi.replace(/^(https:\/\/doi\.org\/|doi:)/, '')}"`,
      });
    }
  }

  return violations;
}

/**
 * Validate URL formatting
 * APA 7: Full URL, in plain text
 */
export function validateURLFormat(url: string | null | undefined): APAViolation[] {
  const violations: APAViolation[] = [];

  if (!url) return violations;

  const issues = [
    {
      test: !url.startsWith('http://') && !url.startsWith('https://'),
      code: 'URL_MISSING_PROTOCOL',
      message: 'URL should start with http:// or https://',
    },
    {
      test: url.includes('http://'),  // Should use https
      code: 'URL_INSECURE',
      message: 'URLs should use https:// not http://',
    },
    {
      test: url.endsWith(','),
      code: 'URL_TRAILING_PUNCTUATION',
      message: 'URL should not include trailing punctuation',
    },
  ];

  for (const issue of issues) {
    if (issue.test) {
      violations.push({
        type: 'reference',
        severity: 'warning',
        code: issue.code,
        description: issue.message,
        location: url,
        affectedText: url,
      });
    }
  }

  return violations;
}

/**
 * Validate page number formatting
 * APA 7: pp. 123-145 (for books) or 123-145 (for journals)
 */
export function validatePageFormat(reference: Reference): APAViolation[] {
  const violations: APAViolation[] = [];
  const text = reference.raw_text || '';

  if (!text) return violations;

  const issues = [
    {
      pattern: /\bpages?\s+\d+/i,  // "pages 123" should be "pp. 123"
      code: 'PAGE_FORMAT',
      message: 'Use "pp." for multiple pages or "p." for single page',
    },
    {
      pattern: /pp\.\s+\d+-\d+\./,  // pp. 123-145. (extra period)
      code: 'PAGE_EXTRA_PERIOD',
      message: 'Remove period after page numbers',
    },
    {
      pattern: /\d+–\d+/,  // em dash instead of hyphen
      code: 'PAGE_DASH',
      message: 'Use hyphen (-) not en-dash (–) for page ranges',
    },
  ];

  for (const issue of issues) {
    if (issue.pattern.test(text)) {
      violations.push({
        type: 'reference',
        severity: 'info',
        code: issue.code,
        description: issue.message,
        location: reference.id || text.substring(0, 50),
      });
    }
  }

  return violations;
}

/**
 * Validate reference-citation matching
 * Check if reference format matches what citation expects
 */
export function validateReferenceCitationMatch(
  citation: Citation,
  reference: Reference
): APAViolation[] {
  const violations: APAViolation[] = [];

  // Extract year from citation
  const citationYearMatch = citation.citation_text?.match(/(\d{4})/);
  const citationYear = citationYearMatch ? citationYearMatch[1] : null;

  // Extract year from reference
  const referenceYearMatch = reference.raw_text?.match(/\((\d{4})\)/);
  const referenceYear = referenceYearMatch ? referenceYearMatch[1] : null;

  // Check year consistency
  if (citationYear && referenceYear && citationYear !== referenceYear) {
    violations.push({
      type: 'reference-match',
      severity: 'error',
      code: 'YEAR_MISMATCH',
      description: `Citation year (${citationYear}) doesn't match reference year (${referenceYear})`,
      location: reference.id || reference.raw_text?.substring(0, 50) || 'unknown',
      suggestion: 'Verify the year in both citation and reference',
    });
  }

  return violations;
}

/**
 * Comprehensive APA 7 validation
 * Run all validators on a reference
 */
export function validateReference(reference: Reference): APAViolation[] {
  const allViolations: APAViolation[] = [];

  // Run all validators
  allViolations.push(...validateReferenceAuthors(reference));
  allViolations.push(...validateReferenceYear(reference));
  allViolations.push(...validateJournalFormatting(reference));
  allViolations.push(...validateDOIFormat(reference.doi, reference.raw_text));
  allViolations.push(...validateURLFormat(reference.parsed_data?.url));
  allViolations.push(...validatePageFormat(reference));

  if (reference.parsed_data?.title) {
    allViolations.push(...validateTitleCapitalization(reference.parsed_data.title));
  }

  return allViolations;
}

/**
 * Comprehensive APA 7 validation for citations
 */
export function validateCitation(citation: Citation): APAViolation[] {
  const allViolations: APAViolation[] = [];

  allViolations.push(...validateCitationFormat(citation));

  return allViolations;
}

/**
 * Get severity count for summary
 */
export function getSeverityCounts(violations: APAViolation[]): {
  errors: number;
  warnings: number;
  info: number;
} {
  return {
    errors: violations.filter(v => v.severity === 'error').length,
    warnings: violations.filter(v => v.severity === 'warning').length,
    info: violations.filter(v => v.severity === 'info').length,
  };
}

/**
 * Group violations by type
 */
export function groupViolationsByType(violations: APAViolation[]): Record<string, APAViolation[]> {
  const grouped: Record<string, APAViolation[]> = {};

  for (const violation of violations) {
    if (!grouped[violation.type]) {
      grouped[violation.type] = [];
    }
    grouped[violation.type].push(violation);
  }

  return grouped;
}
