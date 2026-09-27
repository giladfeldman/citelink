# citelink

Citation detection, reference parsing, and citation↔reference matching for
academic documents. Pure `text → structured data` — no I/O, no database.

Extracted from the Scimeto platform so the community can validate and
reuse it. Accuracy iteration is ongoing — see [CHANGELOG.md](./CHANGELOG.md) and
the [release tags](https://github.com/giladfeldman/citelink/tags) for the current
version. (No version is quoted here on purpose: a hardcoded one goes stale
silently, and this line claimed "Status: 0.1.0" for 73 releases.)

## Install

**Distributed as a git-tag dependency, not via npm.** This package is
deliberately not published to the npm registry. Pin a tag directly:

```jsonc
// package.json
"dependencies": {
  "citelink": "github:giladfeldman/citelink#v0.7.81"
}
```

npm clones the repo and runs the `prepare` script, which builds `dist/` — a tag
pin installs a working build with no registry involved. The `files` field in
`package.json` is standard packaging metadata kept ready for a possible future
publish; it has no effect on the git-tag install path.

Always pin an explicit tag. A bare `github:giladfeldman/citelink` floats on the
default branch, so upstream changes land in your build silently.

## API

- `detectCitationStyle(text)` — detect the citation style and paradigm
- `detectCitations(text)` / `detectHarvardCitations(text)` / `detectNumericCitations(text)`
- `parseReferences(text, style?)` — parse the reference list
- `matchCitationsToReferences(citations, references, style?)` — link in-text citations to references
- `validateForStyle(style, citations, references)` — citation-style compliance
- `analyze(text)` — one-shot: style + citations + references + matches

## Known limits (deliberate)

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
