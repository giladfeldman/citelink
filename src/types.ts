// Citation-style types — migrated verbatim from @scimeto/shared so citelink is dependency-free.

/** All supported named citation styles */
export type CitationStyleType =
  | 'apa'         // APA 7 — (Author, Year)
  | 'harvard'     // Harvard — (Author Year) no comma
  | 'aom'         // Academy of Management — Author. Year. Title.
  | 'asa'         // ASA — Author. Year. "Title."
  | 'chicago-ad'  // Chicago Author-Date — Author. Year. "Title."
  | 'vancouver'   // Vancouver — numbered [1], Smith JA format
  | 'ieee'        // IEEE — numbered [1], J. A. Smith format
  | 'nature'      // Nature — numbered superscript, year at end
  | 'ama';        // AMA — numbered superscript, Vancouver-like

/** Citation paradigms (grouping of named styles for detection/matching) */
export type CitationParadigm = 'author-year' | 'numeric';

/** Styles where citations are numbered references (matching is positional, not fuzzy) */
export const NUMERIC_STYLES: CitationStyleType[] = ['vancouver', 'ieee', 'nature', 'ama'];

/** Check if a citation style uses numeric (positional) referencing */
export function isNumericStyle(style?: CitationStyleType | null): boolean {
  return !!style && NUMERIC_STYLES.includes(style);
}
