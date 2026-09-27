# citelink API reference

Every function, constant and type exported from the package root:

```ts
import { analyze, detectCitationStyle /* , ... */ } from 'citelink';
```

All functions are synchronous and pure (text in, data out). The one side effect in the
library is a `console.warn` from `parseReferences` when no reference section is found.

This page is checked against the source by `npm run docs:check`: a new export, field,
parameter, literal value or violation code that is not named here or in the README fails
the build.

- [One-shot analysis](#one-shot-analysis)
- [Style detection](#style-detection)
- [In-text citation detection](#in-text-citation-detection)
- [Reference parsing](#reference-parsing)
- [Matching](#matching)
- [APA 7 validation](#apa-7-validation)
- [Other styles: `validateForStyle`](#other-styles-validateforstyle)
- [Text and name helpers](#text-and-name-helpers)
- [Organisation authors](#organisation-authors)
- [Result types](#result-types)
- [Violation codes](#violation-codes)

## One-shot analysis

### `analyze(text: string): CitationAnalysis`

Runs the whole pipeline on one document:

1. `detectCitationStyle(text)`.
2. Runs one detector, chosen by the detected style:
   `vancouver`, `ieee`, `nature`, `ama` → `detectNumericCitations(text, referenceSectionStart)`;
   `harvard`, `asa`, `chicago-ad` → `detectHarvardCitations(text)`;
   everything else (`apa`, `aom`) → `detectCitations(text)`.
3. Drops any citation whose `position.start` lies inside the reference section, so a
   reference title that names another work is not counted as an in-text citation.
4. `parseReferences(text, style)` and `matchCitationsToReferences(citations, references, style)`.

```ts
interface CitationAnalysis {
  style: StyleDetectionResult;
  citations: DetectedCitation[];
  references: ParsedReference[];
  matches: MatchResult[];
}
```

## Style detection

### `detectCitationStyle(text: string): StyleDetectionResult`

```ts
interface StyleDetectionResult {
  style: CitationStyleType;     // the named style
  paradigm: CitationParadigm;   // 'author-year' | 'numeric'
  confidence: number;           // rule score, at most 0.95
}
```

Counts evidence in the body before the reference section: parenthetical author-year
citations with a comma before the year (APA-like) and without one (Harvard-like), narrative
mentions (see `countNarrativeSignals`), bracket numbers not preceded by a label (see
`endsInBracketLabel`), Unicode superscripts, and the form of the reference list. The numeric
paradigm is vetoed when there are at least 5 narrative mentions, they outnumber the bracket and
superscript markers, and distinct narrative works outnumber name-then-number mentions.

### `CitationStyleType`

```ts
type CitationStyleType =
  | 'apa'         // APA 7: (Author, Year)
  | 'harvard'     // Harvard: (Author Year), no comma
  | 'aom'         // Academy of Management: Author. Year. Title.
  | 'asa'         // ASA: Author. Year. "Title."
  | 'chicago-ad'  // Chicago author-date: Author. Year. "Title."
  | 'vancouver'   // numbered [1], "Smith JA" names
  | 'ieee'        // numbered [1], "J. A. Smith" names
  | 'nature'      // numbered superscripts, year at the end
  | 'ama';        // AMA: numbered superscripts
```

### `CitationParadigm`

`'author-year' | 'numeric'`.

### `NUMERIC_STYLES: readonly CitationStyleType[]`

`['vancouver', 'ieee', 'nature', 'ama']` — the styles whose citations are matched by list
position rather than by author and year.

### `isNumericStyle(style?: CitationStyleType | null): boolean`

`true` when `style` is in `NUMERIC_STYLES`; `false` for `null` / `undefined`.

### `countNarrativeSignals(text: string): NarrativeSignals`

Narrative citation evidence in the body (before the reference section):

```ts
interface NarrativeSignals {
  mentions: number;              // narrative author-year mentions: "Jovanovic (1982)"
  distinctWorks: number;         // distinct works among them (a table naming 20 studies 200 times counts 20)
  authorNumberMentions: number;  // author mentions followed by a citation number: "Gelstein et al.2"
}
```

A mention followed directly by a numeric citation ("Treiman (1977)¹⁷") is not counted, nor is a
document label before a year ("Table (2019)").

## In-text citation detection

All three detectors return `DetectedCitation[]` in text order (see [Result types](#result-types)).

### `detectCitations(rawText: string): DetectedCitation[]`

The comma-before-year family (APA 7, AOM). Detects parenthetical `(Smith, 2020)` and
narrative `Smith (2020)` citations with one author, two authors (`&` or `and`), `et al.`,
organisation authors and their abbreviations (`(WHO, 2020)`, `(World Health Organization,
2020)`), secondary sources (`(Freud, 1923, as cited in Smith, 2020)` — `originalAuthor` and
`originalYear` hold the cited-within work, `authors` the citing one), `;`-separated bundles
(one result per member), possessives, page locators (`pageNumbers`), year suffixes
(`2020a`), `n.d.` and `in press`. Bare page running-head years inside a citation are masked
first (see `maskPageRunningHeadYears`).

### `detectHarvardCitations(text: string): DetectedCitation[]`

The no-comma family (Harvard, ASA, Chicago author-date): `(Smith 2020)`,
`(Smith & Jones 2020)`, `(Smith et al. 2020)`, plus narrative `Smith (2020)`.

### `detectNumericCitations(text: string, referenceSectionStart?: number): DetectedCitation[]`

Bracket citations `[1]`, `[1,2]`, `[1-3]`, `[1,3-5,7]`, narrative `Smith [1]`, and
superscript markers. Every result has `type: 'numeric'`, `year: ''`, `authors: []`, and a
runtime `citationNumbers: number[]` property holding the expanded numbers. That property is
not a named field of `DetectedCitation`; it is reached through the type's
`[key: string]: any` index signature.

Pass `referenceSectionStart` (from `findReferenceSectionStart`) to ignore everything from the
reference list onwards. Skipped as non-citations: a bracket after a label word (see
`endsInBracketLabel`), `[0, …]` (a mathematical interval), and a single number that looks
like a year (1800 or more) or is above 500.

## Reference parsing

### `parseReferences(text: string, style?: CitationStyleType): ParsedReference[]`

Finds the reference section with `findReferenceSectionStart`, splits it into entries and
parses each entry into a `ParsedReference`. `style` selects the splitting and parsing rules
(for example the bare-year AOM form, or numbered lists for numeric styles). An entry is kept
only if it has authors and a year, a DOI or URL, or (numeric styles) a list number.

Returns `[]` and writes `No reference section found in document` to `console.warn` when no
heading is found.

### `findReferenceSectionStart(text: string): number | null`

Character offset of the reference-section heading, or `null`. Recognised headings, at the
start of a line and optionally numbered (`7. References`): `References`, `Bibliography`,
`Works Cited`, `Literature Cited`, `Literature`, `Cited Literature`, `Reference List`,
`List of References`; markdown `# References`; underlined (`References` over `---`); and
letter-spaced `R E F E R E N C E S`. When several match, the likeliest main reference list
is chosen, so a short supplementary "References" block does not win.

### `splitConcatenatedApaReferences(block: string): string[]`
### `splitConcatenatedHarvardReferences(block: string): string[]`
### `splitConcatenatedAomReferences(block: string): string[]`

Split a block in which PDF text extraction has joined several complete references without a
line break (for example after a DOI with no final period). Each returns `[block]` unchanged
when it finds no confident boundary, so they are safe on clean input. `parseReferences` calls
them itself; they are exported for callers who split reference lists on their own.

## Matching

### `matchCitationsToReferences(citations: DetectedCitation[], references: ParsedReference[], citationStyle?: CitationStyleType): MatchResult[]`

Matches every citation. Numeric citations (or any citation when `citationStyle` is in
`NUMERIC_STYLES`) are matched by list position: one `MatchResult` per cited number, with
`matchMethod: 'numeric_position'` and confidence `1` when the numbered entry exists. A number
above the highest reference number is skipped. Author-year citations go through
`matchCitationToReferences`. With no references, every citation is returned as `no_match`.

### `matchCitationToReferences(citation: DetectedCitation, references: ParsedReference[]): MatchResult[]`

Scores one author-year citation against every reference and returns the best match (a
one-element array; `status: 'no_match'` and `reference: null` when nothing scores above 0.3).

- Year score: exact year and suffix, with a tolerance for suffix differences; a year score
  below 0.3 short-circuits to `matchMethod: 'year_mismatch'`.
- Author score, by citation `type`: first author for `single`; both authors for
  `two_authors`; first author for `et_al`; abbreviation or full name for `group` /
  `group_full`; the citing author for `secondary`.
- `confidence = 0.7 × authorScore + 0.3 × yearScore`, times 0.9 when the reference does not
  fit the citation type (an `et_al` citation against a reference with fewer than 3 authors).
- `status`: `matched` at 0.75 or above, `suggested` at 0.4 or above, `ambiguous` when another
  reference scores within 0.1 of the best one (listed in `alternativeMatches`), otherwise
  `no_match`.

### `getMatchStatistics(results: MatchResult[])`

Returns `{ total, matched, suggested, ambiguous, noMatch, matchRate }`.
`matchRate = (matched + suggested + ambiguous) / total` (0 when `total` is 0).

## APA 7 validation

The APA checks take plain records, so they work on text from any source:

```ts
interface CitationInput {
  id: string;
  citation_text: string;
}

interface ReferenceInput {
  id: string;
  raw_text: string;
  doi?: string;
  parsed_data?: ParsedReferenceDataInput;
}

interface ParsedReferenceDataInput {
  title?: string;
  url?: string;
}
```

Every check returns `APAViolation[]`:

```ts
interface APAViolation {
  type: 'citation' | 'reference' | 'reference-match';
  severity: 'error' | 'warning' | 'info';
  code: string;          // see "Violation codes"
  description: string;
  location: string;      // the record id, or the start of the text
  suggestion?: string;
  affectedText?: string;
}
```

| Function | Checks | Codes |
|---|---|---|
| `validateCitation(citation)` | runs `validateCitationFormat` | as below |
| `validateCitationFormat(citation)` | parenthetical form of `citation_text` | `CITATION_MISSING_COMMA`, `CITATION_MISSING_PARENS`, `CITATION_MISSING_PERIOD`, `CITATION_SHOULD_USE_ET_AL` |
| `validateReference(reference)` | runs every reference check below; the title check only when `parsed_data.title` is set | as below |
| `validateReferenceAuthors(reference)` | author list in `raw_text` | `AUTHOR_FULL_FIRST_NAME`, `MISSING_AMPERSAND` |
| `validateReferenceYear(reference)` | year in parentheses and followed by a period | `MISSING_YEAR_PARENS`, `YEAR_MISSING_PERIOD` |
| `validateJournalFormatting(reference)` | spacing and "Volume"/"Vol." | `JOURNAL_SPACING`, `JOURNAL_ABBREVIATION` |
| `validateDOIFormat(doi, rawText?)` | DOI prefix and scheme; no prefix complaint when `rawText` already shows the DOI as `https://doi.org/…` or `doi:…` | `DOI_INVALID_PREFIX`, `DOI_INSECURE` |
| `validateURLFormat(url)` | URL scheme and a trailing comma | `URL_MISSING_PROTOCOL`, `URL_INSECURE`, `URL_TRAILING_PUNCTUATION` |
| `validatePageFormat(reference)` | page ranges in `raw_text` | `PAGE_FORMAT`, `PAGE_EXTRA_PERIOD`, `PAGE_DASH` |
| `validateTitleCapitalization(title)` | sentence case: more than 2 capitalised words after the first, not counting short function words | `TITLE_CAPITALIZATION` |
| `validateReferenceCitationMatch(citation, reference)` | the first 4-digit year in `citation_text` against the `(YYYY)` year in `raw_text`. **Not** run by `validateReference` or `validateCitation`; call it yourself | `YEAR_MISMATCH` |

Summaries:

- `getSeverityCounts(violations)` → `{ errors, warnings, info }`.
- `groupViolationsByType(violations)` → `Record<string, APAViolation[]>`, keyed by `type`.

The checks are regular-expression rules. A string can break APA 7 in ways no rule looks for,
and an empty result means "none of these rules fired", not "APA-compliant".

## Other styles: `validateForStyle`

### `validateForStyle(style: CitationStyleType, citations: any[], references: any[]): StyleViolation[]`

`StyleViolation` has the same fields as `APAViolation` (`type`, `severity`, `code`,
`description`, `location`, `suggestion`, `affectedText`).

The inputs are database-row shaped records, **not** `DetectedCitation` / `ParsedReference`:

| Record | Fields read |
|---|---|
| citation | `citation_type` (`'parenthetical'` or `'numeric'`), `citation_text`, `citation_number` |
| reference | `raw_text`, `authors` (an array; only its length is read) |

| `style` | Code | Fires when |
|---|---|---|
| `harvard` | `HARVARD_COMMA_BEFORE_YEAR` | a `parenthetical` citation has a comma before the year |
| `vancouver`, `ama` | `VANCOUVER_MISSING_REFS` | the highest `citation_number` of the `numeric` citations exceeds the number of references |
| `nature` | `NATURE_AUTHOR_LIMIT` | a reference has more than 5 `authors` and no "et al" in `raw_text` |
| `ieee` | `IEEE_NUMBERED_REFS` | a reference's `raw_text` does not start with a number |
| `aom` | `AOM_YEAR_NOT_PARENS` | a reference's `raw_text` has a `(YYYY)` year |
| `asa`, `chicago-ad` | — | never: no rules are implemented yet, the result is always `[]` |
| `apa` | — | never: APA is checked by the functions in the previous section |

## Text and name helpers

| Function | Returns |
|---|---|
| `normalizeText(text)` | comparison form: lowercased, ligatures spelled out, accents removed, straight apostrophes unified, `.,;:` removed, whitespace collapsed |
| `normalizeName(name)` | comparison key for a surname: lowercase, no accents, hyphens, apostrophes or other punctuation (`Müller-Lüdenscheidt` → `mullerludenscheidt`) |
| `decomposeLigatures(text)` | the text with Latin ligatures U+FB00–U+FB06 spelled out (`ﬁ` → `fi`); the shared helper behind every text comparison |
| `maskPageRunningHeadYears(text)` | the text with a page running head that is a bare year, trapped inside a parenthetical citation, replaced by the same number of spaces, so the real year is detected and every offset still indexes the original string |
| `expandNumericRange(rangeStr)` | `'1,3-5,7'` → `[1, 3, 4, 5, 7]` |
| `endsInBracketLabel(before, tail?)` | `true` when the text before a `[n]` ends in a label word (`Table`, `Fig`, `Eq.`, `Supplementary-Table`, …) rather than a citing word. The label must be a whole word; lowercase `model`, `sample`, `protocol` and `condition` count as prose. `tail` overrides the label pattern |

## Organisation authors

| Function | Returns |
|---|---|
| `getOrganizationFullName(abbreviation)` | full names for a known abbreviation (`'WHO'` → `['World Health Organization']`), or `undefined` |
| `getKnownOrganizationAbbreviations()` | the abbreviation table the citation detector uses to accept `(WHO, 2020)` as a citation |
| `getOrganizationAbbreviations()` | the larger abbreviation table the reference parser and matcher use to link an abbreviation to a group-author reference |

## Result types

### `DetectedCitation`

| Field | Type | Meaning |
|---|---|---|
| `raw` | `string` | the citation as it appears: `(Smith et al., 2020)` |
| `normalized` | `string` | cleaned form of `raw` |
| `type` | `CitationType` | see below |
| `citationStyle` | `'parenthetical' \| 'narrative'` | `(Smith, 2020)` vs `Smith (2020)` |
| `authors` | `ParsedCitationAuthor[]` | cited authors; empty for numeric citations |
| `year` | `string` | `"2020"`; `""` for numeric citations; inferred for a year-elided back-reference (README, Known limits) |
| `yearSuffix` | `string?` | `"a"` for `2020a` |
| `pageNumbers` | `string?` | `"p. 4"`, `"pp. 15-20"` |
| `position` | `{ start: number; end: number }` | character offsets of `raw` in the input |
| `context` | `string` | surrounding text |
| `originalAuthor`, `originalYear` | `string?` | for a `secondary` citation, the work cited within the citing source |

`CitationType`: `single` `(Smith, 2020)`, `two_authors` `(Smith & Jones, 2020)`, `et_al`
`(Smith et al., 2020)`, `group` `(WHO, 2020)`, `group_full` `(World Health Organization,
2020)`, `secondary` `(Freud, 1923, as cited in Smith, 2020)`, `multiple`, `numeric` `[1]`.

### `ParsedCitationAuthor`

| Field | Type | Meaning |
|---|---|---|
| `raw` | `string` | `"Smith"` |
| `normalized` | `string` | lowercase, no accents: `"smith"` |
| `isEtAl` | `boolean` | the citation continued with "et al." |
| `isOrganization` | `boolean` | an organisation author |
| `abbreviation` | `string?` | `"WHO"` for an organisation |

### `ParsedReference`

| Field | Type | Meaning |
|---|---|---|
| `raw` | `string` | the entry text |
| `authors` | `ParsedReferenceAuthor[]` | parsed authors |
| `authorCount` | `number` | number of authors |
| `firstAuthorLastName`, `firstAuthorLastNameNormalized` | `string` | first surname, as written and as a `normalizeName` key |
| `secondAuthorLastName`, `secondAuthorLastNameNormalized` | `string?` | second surname |
| `allAuthorLastNames`, `allAuthorLastNamesNormalized` | `string[]` | every surname |
| `year` | `string` | `"2019"` |
| `yearSuffix` | `string?` | `"a"` for `2019a` |
| `title` | `string` | work title |
| `source` | `string?` | journal or book title |
| `volume`, `issue`, `pages` | `string?` | `"12"`, `"3"`, `"45-67"` |
| `doi` | `string?` | bare DOI, `10.xxxx/…`, without the `https://doi.org/` prefix |
| `url` | `string?` | URL |
| `isGroupAuthor` | `boolean` | an organisation is the author |
| `groupName`, `groupAbbreviation` | `string?` | the organisation's name and abbreviation |
| `listNumber` | `number?` | the entry's number in a numbered list |
| `type` | `'journal' \| 'book' \| 'chapter' \| 'website' \| 'report' \| 'unknown'` | inferred reference type |

### `ParsedReferenceAuthor`

`lastName`, `lastNameNormalized`, `firstName?`, `initials?`, `suffix?` (`Jr.`, `III`),
`isOrganization`.

### `Author`

Legacy shape kept for backward compatibility and not returned by any function:
`{ lastName; firstName?; initials? }`.

### `MatchResult`

| Field | Type | Meaning |
|---|---|---|
| `citation` | `DetectedCitation` | the citation |
| `reference` | `ParsedReference \| null` | best reference, or `null` |
| `confidence` | `number` | `0`–`1` rule score |
| `status` | `'matched' \| 'suggested' \| 'ambiguous' \| 'no_match'` | see [Matching](#matching) |
| `matchMethod` | `string?` | `single_author`, `two_authors`, `et_al`, `group_author`, `secondary_source`, `multiple`, `fallback`, `year_mismatch`, `numeric_position` |
| `matchDetails` | `{ authorScore; yearScore; typeValidation? }?` | score components; `typeValidation` is `false` when the reference does not fit the citation type |
| `alternativeMatches` | `{ reference; confidence }[]?` | close runners-up |

## Violation codes

| Code | Severity | Emitted by | Fires when |
|---|---|---|---|
| `CITATION_MISSING_COMMA` | warning | `validateCitationFormat` | `(Word 2020)`: no comma between author and year |
| `CITATION_MISSING_PARENS` | warning | `validateCitationFormat` | `Smith et al. 2020` with no parentheses |
| `CITATION_MISSING_PERIOD` | warning | `validateCitationFormat` | `(et al,` without the period |
| `CITATION_SHOULD_USE_ET_AL` | warning | `validateCitationFormat` | `(Smith, Jones & Brown, 2020)`: three names instead of "et al." |
| `AUTHOR_FULL_FIRST_NAME` | warning | `validateReferenceAuthors` | the entry starts `Surname, Firstname` instead of an initial |
| `MISSING_AMPERSAND` | warning | `validateReferenceAuthors` | the text ends in `Word, Word.` (a last author without `&`) |
| `MISSING_YEAR_PARENS` | warning | `validateReferenceYear` | no plain `(YYYY)` anywhere in the text; `(2020a)`, `(n.d.)`, `(in press)` and `(2020, March 3)` also fire it |
| `YEAR_MISSING_PERIOD` | warning | `validateReferenceYear` | `(YYYY)` not followed by a period |
| `TITLE_CAPITALIZATION` | info | `validateTitleCapitalization` | more than 2 capitalised words after the first |
| `JOURNAL_SPACING` | info | `validateJournalFormatting` | a letter directly followed by `12(` (missing space before the volume) |
| `JOURNAL_ABBREVIATION` | info | `validateJournalFormatting` | `Volume 12` or `Vol. 12` instead of the bare number |
| `DOI_INVALID_PREFIX` | warning | `validateDOIFormat` | the DOI lacks `https://doi.org/` or `doi:` (and `rawText` does not already show it that way) |
| `DOI_INSECURE` | warning | `validateDOIFormat` | the DOI uses `http://` |
| `URL_MISSING_PROTOCOL` | warning | `validateURLFormat` | the URL has no `http://` or `https://` |
| `URL_INSECURE` | warning | `validateURLFormat` | the URL uses `http://` |
| `URL_TRAILING_PUNCTUATION` | warning | `validateURLFormat` | the URL ends in a comma |
| `PAGE_FORMAT` | info | `validatePageFormat` | `page 12` / `pages 12` instead of `p.` / `pp.` |
| `PAGE_EXTRA_PERIOD` | info | `validatePageFormat` | `pp. 123-145.` |
| `PAGE_DASH` | info | `validatePageFormat` | an en dash (`–`) between two page numbers; the suggestion is a hyphen |
| `YEAR_MISMATCH` | error | `validateReferenceCitationMatch` | citation year and reference year differ |
| `HARVARD_COMMA_BEFORE_YEAR` | warning | `validateForStyle('harvard', …)` | see [Other styles](#other-styles-validateforstyle) |
| `VANCOUVER_MISSING_REFS` | error | `validateForStyle('vancouver' \| 'ama', …)` | see above |
| `NATURE_AUTHOR_LIMIT` | warning | `validateForStyle('nature', …)` | see above |
| `IEEE_NUMBERED_REFS` | info | `validateForStyle('ieee', …)` | see above |
| `AOM_YEAR_NOT_PARENS` | warning | `validateForStyle('aom', …)` | see above |
