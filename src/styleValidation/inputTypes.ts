/**
 * Structural input interfaces for the style validators.
 *
 * The style validators were extracted from CitationGuard's worker, where they
 * imported the database entity types `Citation` and `Reference` from the
 * private `@scimeto/shared` package. citelink must NOT depend on that package,
 * so the validators instead depend on these minimal structural subsets.
 *
 * Each interface contains EXACTLY the fields the validators read, with the same
 * TypeScript types (including optionality and `null` unions) those fields have
 * in `@scimeto/shared`'s `Citation` / `Reference` definitions. Any worker DB row
 * satisfies these interfaces structurally, so depending on them instead of the
 * full entity types is behavior-preserving.
 */

/** Structural subset of `@scimeto/shared`'s `ParsedReferenceData`. */
export interface ParsedReferenceDataInput {
  title?: string;
  url?: string;
}

/** Structural subset of `@scimeto/shared`'s `Citation` — only the fields the style validators read. */
export interface CitationInput {
  id: string;
  citation_text: string;
}

/** Structural subset of `@scimeto/shared`'s `Reference` — only the fields the style validators read. */
export interface ReferenceInput {
  id: string;
  raw_text: string;
  doi?: string;
  parsed_data?: ParsedReferenceDataInput;
}
