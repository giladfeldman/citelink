# citelink

Citation detection, reference parsing, and citation↔reference matching for
academic documents, in TypeScript. Plain text goes in, structured data comes out:
no network, no database, no file I/O.

citelink answers four questions about the text of a paper:

1. **Which citation style does it use?** APA 7, Harvard, Academy of Management (AOM), ASA,
   Chicago author-date, Vancouver, IEEE, Nature or AMA — grouped into the `author-year` and
   `numeric` paradigms.
2. **Where are the in-text citations?** Parenthetical `(Smith, 2020)`, narrative
   `Smith (2020)`, Harvard `(Smith 2020)`, numeric `[1]`, `[1-3]` and superscripts, with
   authors, year, suffix, pages and position.
3. **What is in the reference list?** Authors, year, title, source, volume, issue, pages,
   DOI, URL and a reference type, one record per entry — including entries that the PDF
   extraction ran together on one line.
4. **Which citation points at which reference?** Every citation gets a status
   (`matched`, `suggested`, `ambiguous`, `no_match`) and a confidence.

It also ships rule-based style checks: APA 7 checks on citation and reference strings, and
lighter per-style checks for Harvard, Vancouver/AMA, Nature, IEEE and AOM.

citelink was extracted from the Scimeto manuscript-checking platform so that the
community can inspect, validate and reuse it. Accuracy work is ongoing and every release is
described, with its measurement, in [CHANGELOG.md](./CHANGELOG.md).

**Contents:** [Method](#method) · [Install](#install) · [Quickstart](#quickstart) ·
[API overview](#api-overview) · [Output format](#output-format) ·
[Style checks](#style-checks) · [Known limits](#known-limits) ·
[How to cite](#how-to-cite) · [Contributing](#contributing) · [License](#license) ·
full reference in [docs/API.md](./docs/API.md)

## Method

citelink is rule-based and deterministic: the same text always gives the same output, and
every decision can be traced to a pattern in `src/`. There is no model and no training data.

- **Style detection** counts evidence in the body text before the reference section:
  parenthetical author-year forms with and without a comma before the year, narrative
  mentions (`Smith and Jones (2004)`), bracket numbers and Unicode superscripts, and the
  shape of the reference list. The winning paradigm and style come with a confidence in
  `[0, 0.95]`.
- **Citation detection** uses one detector per paradigm: `detectCitations` for the
  comma-before-year family (APA, AOM), `detectHarvardCitations` for the no-comma family
  (Harvard, ASA, Chicago author-date) and `detectNumericCitations` for numbered styles.
- **Reference parsing** finds the reference section by its heading (`References`,
  `Bibliography`, `Works Cited`, `Literature Cited`, `Literature`, `Reference List`,
  `List of References`, markdown `#` headings, underlined and letter-spaced forms), splits
  it into entries, and parses each one.
- **Matching** scores each author-year citation against every reference as
  `0.7 × author score + 0.3 × year score`, with fuzzy (Levenshtein) surname matching,
  accent and ligature normalisation, year-suffix handling (`2020a`), and a 10% penalty when
  the citation type does not fit the reference (an `et al.` citation needs 3+ authors).
  A score of at least 0.75 is `matched`, at least 0.4 `suggested`; two candidates within
  0.1 of each other are `ambiguous`. Numeric citations match by list position.

The style rules follow the published manuals: the *Publication Manual of the American
Psychological Association*, 7th ed. (https://doi.org/10.1037/0000165-000) and the *AMA
Manual of Style*, 11th ed. (https://doi.org/10.1093/jama/9780190246556.001.0001). Harvard,
Vancouver, IEEE, Nature, AOM, ASA and Chicago author-date are handled by their common
published conventions; see [Style checks](#style-checks) for what is actually checked for
each.

## Install

citelink is distributed as a **git-tag dependency**, not through the npm registry. Pin a tag:

```jsonc
// package.json
"dependencies": {
  "citelink": "github:giladfeldman/citelink#v0.7.85"
}
```

or from the command line:

```bash
npm install github:giladfeldman/citelink#v0.7.85
```

npm clones the repository and runs the `prepare` script, which builds `dist/`, so a tag pin
installs a working build with no registry involved. Always pin an explicit tag: a bare
`github:giladfeldman/citelink` floats on the default branch, so upstream changes land in
your build silently. The `files` field in `package.json` is kept ready for a possible future
registry publish and has no effect on the git-tag install.

Requirements: Node.js with ES module support (the package is `"type": "module"` and exports
ESM only). There are no runtime dependencies. Type declarations ship in `dist/index.d.ts`.

## Quickstart

Save as `quickstart.mjs` in a project where citelink is installed, then run
`node quickstart.mjs`. The authors and titles are invented.

```js
import { analyze, getMatchStatistics } from 'citelink';

const text = `Introduction
Prior work found a strong effect (Alder & Birch, 2019), which Cedar et al. (2021)
failed to replicate. See also (Dunmore, 2020a).

References
Alder, J. K., & Birch, M. (2019). A fictional study of example effects. Journal of Examples, 12(3), 45-67. https://doi.org/10.0000/example.1
Cedar, P., Dunmore, R., & Elm, S. (2021). A fictional replication. Example Science, 4, 1-20.
Dunmore, R. (2020a). An invented monograph. Example Press.
`;

const result = analyze(text);
console.log(result.style);
for (const m of result.matches) {
  console.log(m.citation.raw, '->', m.status, m.reference?.firstAuthorLastName ?? null, m.confidence.toFixed(2));
}
console.log(getMatchStatistics(result.matches));
```

Output (v0.7.85):

```text
{ style: 'apa', paradigm: 'author-year', confidence: 0.95 }
(Alder & Birch, 2019) -> matched Alder 1.00
Cedar et al. (2021) -> matched Cedar 0.96
(Dunmore, 2020a) -> matched Dunmore 1.00
{
  total: 3,
  matched: 3,
  suggested: 0,
  ambiguous: 0,
  noMatch: 0,
  matchRate: 1
}
```

This block is executed by `npm run docs:check` against a fresh build on every run, so it
cannot silently stop working.

## API overview

Every name below is exported from the package root (`import { ... } from 'citelink'`).
Signatures, parameters and every field are in **[docs/API.md](./docs/API.md)**.

| Task | Functions |
|---|---|
| One call for everything | `analyze(text)` → `CitationAnalysis` |
| Style detection | `detectCitationStyle(text)`, `countNarrativeSignals(text)`, `isNumericStyle(style)`, `NUMERIC_STYLES` |
| In-text citations | `detectCitations(rawText)` (APA/AOM), `detectHarvardCitations(text)` (Harvard/ASA/Chicago), `detectNumericCitations(text, referenceSectionStart?)` |
| Reference list | `parseReferences(text, style?)`, `findReferenceSectionStart(text)`, `splitConcatenatedApaReferences(block)`, `splitConcatenatedHarvardReferences(block)`, `splitConcatenatedAomReferences(block)` |
| Matching | `matchCitationsToReferences(citations, references, citationStyle?)`, `matchCitationToReferences(citation, references)`, `getMatchStatistics(results)` |
| APA 7 checks | `validateCitation(citation)`, `validateReference(reference)` and the single checks they combine; `getSeverityCounts(violations)`, `groupViolationsByType(violations)` |
| Other styles' checks | `validateForStyle(style, citations, references)` |
| Text and name helpers | `normalizeText(text)`, `normalizeName(name)`, `decomposeLigatures(text)`, `maskPageRunningHeadYears(text)`, `expandNumericRange(rangeStr)`, `endsInBracketLabel(before, tail?)` |
| Organisation authors | `getOrganizationFullName(abbreviation)`, `getKnownOrganizationAbbreviations()`, `getOrganizationAbbreviations()` |

`analyze` is the recommended entry point. It detects the style, runs the matching
detector, drops author-year "citations" found inside the reference list itself (a reference
title such as "a replication of Smith (2005)" is not an in-text citation), parses the
references with the detected style and matches them.

Use the lower-level functions when you already know the style, want to run a different
detector, or want to feed your own reference records to the matcher.

## Output format

`analyze(text)` returns a `CitationAnalysis`:

```ts
interface CitationAnalysis {
  style: StyleDetectionResult;     // { style, paradigm, confidence }
  citations: DetectedCitation[];   // in-text citations, in text order
  references: ParsedReference[];   // reference-list entries, in list order
  matches: MatchResult[];          // one per author-year citation; one per cited number for numeric
}
```

The most-used fields (all fields: [docs/API.md](./docs/API.md#result-types)):

| Field | Meaning |
|---|---|
| `DetectedCitation.raw` | The citation as it appears in the text: `(Alder & Birch, 2019)` |
| `DetectedCitation.type` | `single`, `two_authors`, `et_al`, `group`, `group_full`, `secondary`, `multiple` or `numeric` |
| `DetectedCitation.citationStyle` | `parenthetical` or `narrative` |
| `DetectedCitation.authors` | `ParsedCitationAuthor[]`: `raw`, `normalized`, `isEtAl`, `isOrganization`, `abbreviation` |
| `DetectedCitation.year`, `yearSuffix`, `pageNumbers` | `"2020"`, `"a"`, `"p. 4"`; `year` is `""` for numeric citations |
| `DetectedCitation.position` | `{ start, end }` character offsets into the input |
| `ParsedReference.firstAuthorLastName` / `year` / `title` / `doi` | The parsed entry; see docs for all 23 fields |
| `ParsedReference.type` | `journal`, `book`, `chapter`, `website`, `report` or `unknown` |
| `MatchResult.status` | `matched` (≥ 0.75), `suggested` (≥ 0.4), `ambiguous` (close runner-up), `no_match` |
| `MatchResult.confidence` | `0`–`1` |
| `MatchResult.matchMethod` | Which rule matched: `single_author`, `two_authors`, `et_al`, `group_author`, `secondary_source`, `multiple`, `fallback`, `year_mismatch`, `numeric_position` |

A numeric `DetectedCitation` also carries a `citationNumbers: number[]` property
(`[2-4]` → `[2, 3, 4]`). It is not a named field of the `DetectedCitation` type (it falls
under the type's `[key: string]: any` index signature), so TypeScript types it as `any`. The
matcher uses it to match by position.

## Style checks

**APA 7** — `validateCitation` and `validateReference` take plain records, so they can check
text from any source:

```ts
validateReference({ id: 'r1', raw_text: '...', doi: '10.0000/x', parsed_data: { title: '...', url: '...' } });
validateCitation({ id: 'c1', citation_text: '(Alder 2019)' });   // -> CITATION_MISSING_COMMA
```

Each returns `APAViolation[]` (`type`, `severity` = `error` | `warning` | `info`, `code`,
`description`, `location`, `suggestion`, `affectedText`). The checks are pattern rules, not
a full APA grammar: a string can break APA 7 in ways no rule looks for. The codes are:
`CITATION_MISSING_COMMA`, `CITATION_MISSING_PARENS`, `CITATION_MISSING_PERIOD`,
`CITATION_SHOULD_USE_ET_AL`, `MISSING_AMPERSAND`, `AUTHOR_FULL_FIRST_NAME`,
`MISSING_YEAR_PARENS`, `YEAR_MISSING_PERIOD`, `TITLE_CAPITALIZATION`, `JOURNAL_SPACING`,
`JOURNAL_ABBREVIATION`, `DOI_INSECURE`, `DOI_INVALID_PREFIX`, `URL_MISSING_PROTOCOL`,
`URL_INSECURE`, `URL_TRAILING_PUNCTUATION`, `PAGE_DASH`, `PAGE_EXTRA_PERIOD`, `PAGE_FORMAT`
and `YEAR_MISMATCH` (from `validateReferenceCitationMatch`, which neither of the two runs).
What triggers each one is listed in
[docs/API.md](./docs/API.md#violation-codes).

**Other styles** — `validateForStyle(style, citations, references)` returns
`StyleViolation[]` with the same fields. It currently checks one rule per style:

| `style` | Code | Rule |
|---|---|---|
| `harvard` | `HARVARD_COMMA_BEFORE_YEAR` | no comma before the year in a parenthetical citation |
| `vancouver`, `ama` | `VANCOUVER_MISSING_REFS` | the highest cited number exceeds the number of references |
| `nature` | `NATURE_AUTHOR_LIMIT` | more than 5 authors without "et al." |
| `ieee` | `IEEE_NUMBERED_REFS` | a reference is not numbered |
| `aom` | `AOM_YEAR_NOT_PARENS` | a reference year is in parentheses |
| `asa`, `chicago-ad` | — | **no checks yet**: always returns `[]` |
| `apa` | — | returns `[]`; use `validateCitation` / `validateReference` |

`validateForStyle` reads database-row shaped records, not citelink's own result types:
citations with `citation_type` (`'parenthetical'` or `'numeric'`), `citation_text` and
`citation_number`; references with `raw_text` and `authors`. Passing `DetectedCitation`
objects straight in finds nothing, because they have none of those fields.

## Known limits

Deliberate, test-pinned behaviour:

- **A bare author-year table cell is not an in-text citation.** A line holding only
  `Slovic & Fischhoff, 1977` (a flattened table cell) is not detected. The same shape is at
  least as often a non-citation (`Poland, 2015` in a country-year table), so a line rule would
  invent citations. Pinned by `tests/tableCellBareAuthorYearLimit.test.ts`.
- **A year-elided back-reference gets an INFERRED year.** `(Slovic & Fischhoff, p. 549)` after
  `Slovic and Fischhoff (1977)` is detected with `year: "1977"`, taken from the nearest earlier
  citation of the same first author; `raw` keeps the year-less text. APA 7 requires the year in
  every parenthetical citation, so the source form is itself a style slip.
- **The narrative signal can impose author-year on a superscript-numbered paper.** Numeric
  evidence counts only bracket and superscript markers in the body, not the numbering of a plain
  "1. Author, Title" reference list. A superscript paper with at least 5 narrative mentions
  ("Smith and Jones (2004)") that are not directly followed by a marker, outnumbering its
  superscripts, is read as author-year. Constructed, not observed: none of 119 papers from
  numeric-citation journals changed classification in the release measurement.
- **The narrative author-year signal reads only the body before the reference section.** When
  `findReferenceSectionStart` accepts an early heading as the reference list (a lone body
  section titled "Literature" is returned without checking what follows), later narrative
  citations are not counted and the paper keeps its previous classification. The signal also
  collapses two different works with the same surname and year into one distinct work. Both
  can only withhold the author-year verdict, never impose it.
- **A bracket after a lowercase label noun is read as a label** ("in step [3]"), except for
  `model`, `sample`, `protocol` and `condition`, which measured corpus text showed to be
  citations ("the SIR model [13]"). A noun joins that list only with a measured example.

Failure modes to plan for:

- **No reference heading, no references.** `parseReferences` returns `[]` when it finds no
  recognised heading, and writes `No reference section found in document` to
  `console.warn` — the library's only side effect. Every citation then comes back
  `no_match`.
- **Input is plain text.** citelink does not read PDFs or Word files. Extract the text first
  (for example with docpluck); line breaks matter, because headings and reference entries are
  found by line.
- **Numeric matching trusts the list numbering.** A number above the highest reference number
  is skipped rather than reported as `no_match`, so an out-of-range `[64-102]` against a
  39-entry list does not inflate the unmatched count.
- **Scores are heuristic.** `confidence` is a rule score, not a calibrated probability.

## How to cite

If you use citelink in research, please cite the software (see [CITATION.cff](./CITATION.cff)):

> Feldman, G. (2026). *citelink: Citation detection, reference parsing, and
> citation-reference matching for academic documents* (Version 0.7.83) [Computer software].
> https://github.com/giladfeldman/citelink

## Contributing

Bug reports with a minimal text sample, and pull requests with a failing test, are welcome.
See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development setup and the checks a change
must pass (`npm test`, which includes the documentation-drift gate).

## License

MIT — see [LICENSE](./LICENSE). Copyright (c) 2026 Gilad Feldman.
