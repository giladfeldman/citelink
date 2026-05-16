# citelink

Citation detection, reference parsing, and citation↔reference matching for
academic documents. Pure `text → structured data` — no I/O, no database.

Extracted from the CitationGuard platform so the community can validate and
reuse it. Status: 0.1.0, behavior-preserving extraction; accuracy iteration
is ongoing.

## API

- `detectCitationStyle(text)` — detect the citation style and paradigm
- `detectCitations(text)` / `detectHarvardCitations(text)` / `detectNumericCitations(text)`
- `parseReferences(text, style?)` — parse the reference list
- `matchCitationsToReferences(citations, references, style?)` — link in-text citations to references
- `validateForStyle(style, citations, references)` — citation-style compliance
- `analyze(text)` — one-shot: style + citations + references + matches
