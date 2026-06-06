import { detectCitationStyle } from './citationStyleDetector.js';
import { detectCitations } from './citationDetector.js';
import { detectHarvardCitations } from './harvardCitationDetector.js';
import { detectNumericCitations } from './numericCitationDetector.js';
import { parseReferences, findReferenceSectionStart } from './referenceParser.js';
import { matchCitationsToReferences } from './citationMatcher.js';
import type { StyleDetectionResult } from './citationStyleDetector.js';
import type { DetectedCitation } from './citationDetector.js';
import type { ParsedReference } from './referenceParser.js';
import type { MatchResult } from './citationMatcher.js';

export interface CitationAnalysis {
  style: StyleDetectionResult;
  citations: DetectedCitation[];
  references: ParsedReference[];
  matches: MatchResult[];
}

/**
 * One-shot citation analysis. Detects the style, dispatches to the
 * style-appropriate citation detector, parses references, and matches.
 * Pure: text in, structured data out. The detector dispatch mirrors the
 * CitationGuard worker's coreProcessors.ts (the `isNumeric` / `isHarvardLike`
 * branch around lines 144-155).
 */
export function analyze(text: string): CitationAnalysis {
  const style = detectCitationStyle(text);

  // Detector dispatch — faithful to coreProcessors.ts:
  //   const isNumeric = citationStyle === 'vancouver' || 'ieee' || 'nature' || 'ama'
  //   const isHarvardLike = citationStyle === 'harvard' || 'asa' || 'chicago-ad'
  const isNumeric =
    style.style === 'vancouver' ||
    style.style === 'ieee' ||
    style.style === 'nature' ||
    style.style === 'ama';
  const isHarvardLike =
    style.style === 'harvard' ||
    style.style === 'asa' ||
    style.style === 'chicago-ad';

  const referenceSectionStart = findReferenceSectionStart(text) ?? undefined;
  let citations: DetectedCitation[];
  if (isNumeric) {
    citations = detectNumericCitations(text, referenceSectionStart);
  } else if (isHarvardLike) {
    citations = detectHarvardCitations(text);
  } else {
    // APA, AOM, Chicago — all use the comma-before-year parenthetical pattern
    citations = detectCitations(text);
  }

  // Drop any author-year citation detected INSIDE the reference section
  // (reference-list bleed): a replication/meta-analysis paper's reference titles
  // routinely cite their originals (e.g. a reference entry "... a replication of
  // Kogut and Ritov (2005) ...") which the author-year detectors would otherwise
  // emit as spurious in-text citations. The numeric detector already filters
  // internally on the same boundary; this makes the author-year paths consistent
  // and is a no-op for numeric. Citations with no position are kept (start ?? 0).
  if (referenceSectionStart !== undefined) {
    citations = citations.filter((c) => (c.position?.start ?? 0) < referenceSectionStart);
  }

  const references = parseReferences(text, style.style);
  const matches = matchCitationsToReferences(citations, references, style.style);
  return { style, citations, references, matches };
}
