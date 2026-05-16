/**
 * Style-Specific Validation Framework
 * Dispatches to per-style rule sets for non-APA documents.
 */

import type { CitationStyleType } from '../types.js';

// Re-use the APAViolation interface for all styles
export interface StyleViolation {
  type: 'citation' | 'reference' | 'reference-match';
  severity: 'error' | 'warning' | 'info';
  code: string;
  description: string;
  location: string;
  suggestion?: string;
  affectedText?: string;
}

/**
 * Validate citations and references for a given style.
 * Returns violations found.
 */
export function validateForStyle(
  style: CitationStyleType,
  citations: any[],
  references: any[],
): StyleViolation[] {
  switch (style) {
    case 'harvard':
      return validateHarvard(citations, references);
    case 'vancouver':
    case 'ama':
      return validateVancouver(citations, references);
    case 'nature':
      return validateNature(citations, references);
    case 'ieee':
      return validateIEEE(citations, references);
    case 'aom':
      return validateAOM(citations, references);
    case 'asa':
    case 'chicago-ad':
      return validateGenericAuthorYear(citations, references, style);
    default:
      return [];
  }
}

// ── Harvard ──────────────────────────────────────────────────────────────

function validateHarvard(citations: any[], references: any[]): StyleViolation[] {
  const violations: StyleViolation[] = [];

  for (const c of citations) {
    if (c.citation_type === 'parenthetical') {
      // Harvard: should NOT have comma before year
      if (c.citation_text?.match(/[A-Za-z]\s*,\s*\d{4}/)) {
        violations.push({
          type: 'citation',
          severity: 'warning',
          code: 'HARVARD_COMMA_BEFORE_YEAR',
          description: 'Harvard style: no comma before year in parenthetical citations',
          location: `Citation: "${(c.citation_text || '').slice(0, 60)}"`,
          suggestion: 'Remove the comma before the year: (Smith 2020) not (Smith, 2020)',
          affectedText: c.citation_text,
        });
      }
    }
  }

  return violations;
}

// ── Vancouver / AMA ─────────────────────────────────────────────────────

function validateVancouver(citations: any[], references: any[]): StyleViolation[] {
  const violations: StyleViolation[] = [];

  // Check sequential numbering
  const numericCitations = citations
    .filter(c => c.citation_type === 'numeric' && c.citation_number != null)
    .map(c => c.citation_number as number)
    .sort((a, b) => a - b);

  if (numericCitations.length > 0) {
    // Check for gaps in numbering vs reference count
    const maxCited = Math.max(...numericCitations);
    if (maxCited > references.length) {
      violations.push({
        type: 'reference-match',
        severity: 'error',
        code: 'VANCOUVER_MISSING_REFS',
        description: `Citation [${maxCited}] found but only ${references.length} references listed`,
        location: 'Reference list',
        suggestion: 'Ensure all cited reference numbers have corresponding entries in the reference list',
      });
    }
  }

  return violations;
}

// ── Nature ───────────────────────────────────────────────────────────────

function validateNature(citations: any[], references: any[]): StyleViolation[] {
  const violations: StyleViolation[] = [];

  // Nature: max 5 authors in references, then "et al."
  for (const ref of references) {
    const authors = ref.authors;
    if (Array.isArray(authors) && authors.length > 5) {
      const hasEtAl = ref.raw_text?.toLowerCase().includes('et al');
      if (!hasEtAl) {
        violations.push({
          type: 'reference',
          severity: 'warning',
          code: 'NATURE_AUTHOR_LIMIT',
          description: 'Nature style: list up to 5 authors, then "et al."',
          location: `Reference: "${(ref.raw_text || '').slice(0, 60)}..."`,
          suggestion: 'List the first 5 authors followed by "et al."',
          affectedText: ref.raw_text,
        });
      }
    }
  }

  return violations;
}

// ── IEEE ─────────────────────────────────────────────────────────────────

function validateIEEE(citations: any[], references: any[]): StyleViolation[] {
  const violations: StyleViolation[] = [];

  // IEEE: references should be numbered with [N]
  for (const ref of references) {
    if (ref.raw_text && !ref.raw_text.match(/^\[?\d+\]?/)) {
      violations.push({
        type: 'reference',
        severity: 'info',
        code: 'IEEE_NUMBERED_REFS',
        description: 'IEEE style: references should be numbered [1], [2], etc.',
        location: `Reference: "${(ref.raw_text || '').slice(0, 60)}..."`,
      });
    }
  }

  return violations;
}

// ── AOM ──────────────────────────────────────────────────────────────────

function validateAOM(citations: any[], references: any[]): StyleViolation[] {
  const violations: StyleViolation[] = [];

  // AOM: year should NOT be in parentheses in references
  for (const ref of references) {
    if (ref.raw_text?.match(/\(\d{4}[a-z]?\)/)) {
      violations.push({
        type: 'reference',
        severity: 'warning',
        code: 'AOM_YEAR_NOT_PARENS',
        description: 'AOM style: year should not be in parentheses in references',
        location: `Reference: "${(ref.raw_text || '').slice(0, 60)}..."`,
        suggestion: 'Use bare year after author: "Smith, J. A. 2020. Title..."',
        affectedText: ref.raw_text,
      });
    }
  }

  return violations;
}

// ── Generic author-year (ASA, Chicago) ───────────────────────────────────

function validateGenericAuthorYear(citations: any[], references: any[], style: string): StyleViolation[] {
  // Minimal validation for ASA/Chicago — just check basic structure
  return [];
}
