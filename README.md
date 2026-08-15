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
  "citelink": "github:giladfeldman/citelink#v0.7.73"
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
