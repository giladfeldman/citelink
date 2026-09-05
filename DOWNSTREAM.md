# Downstream — who consumes this library

**This library is not standalone infrastructure. It is part of a product.**

## Consumer: Scimeto

- **Consumer:** the Scimeto platform (closed source)
- **Pinned in:** `apps/worker/package.json` and `packages/shared/package.json`, by **git tag** (`github:giladfeldman/citelink#vX.Y.Z`)
- **Uses:** citation ↔ reference matching and in-text citation detection
- **Reaches users through:** the citation-detection and citation-matching processors, and the reference-parsing path in the shared package, whose output is shown to researchers
  as findings about their manuscript and exported into reports they act on.

Scimeto's side of this relationship is documented on the consumer side, and the two
are checked against each other mechanically by a sync check there, which fails if this
file goes missing or stops naming Scimeto.

## What that means for a change here

Scimeto is a **scientific-integrity platform**. Its failure mode is not a crash — it is
a plausible, confident, wrong answer that no test catches: a green badge on a manuscript
with real findings, a count that is silently zero, an all-clear over a check that never
ran. A defect in this library becomes exactly that, and it reaches a researcher.

So:

1. **A test watched failing against the defect first.** Break the fix and see it go red
   before trusting it. A test written after the fix that re-asserts current behaviour
   proves nothing.
2. **A failure mode the return type cannot express is a bug in the type.** If a caller
   cannot distinguish "checked, clean" from "could not check", it will report the
   former — and it will be wrong in the direction that matters.
3. **Offline tests for failure modes.** Suites that hit live APIs cannot express
   "and now the upstream rate-limits you". Mock the transport.

### This one is pinned TWICE

Scimeto declares `citelink` in **two** manifests — the worker and the shared package.
They must always carry the same ref. If they drift, the two halves run different
citation logic and **no test fails**, because each half is internally consistent.
Scimeto's `check-dep-pins` rule A1 enforces the agreement, but only after someone bumps
both. Bump both in the same commit.

## Releasing

The pin downstream resolves a **TAG**. A commit on `main` with no tag changes nothing
for Scimeto, and Railway installs from the tag, so a local path or branch override will
pass locally and fail on deploy.

1. test → `npm run build` → `npm test`
2. bump `package.json`, add a **CHANGELOG** entry naming the defect, the evidence, and
   what a consumer must now do differently
3. commit, `git tag vX.Y.Z`, **push the tag**
4. in Scimeto: bump the pin in *every* manifest that declares it, `npm install` (so the
   lockfile records it), update the consumer to actually use what the release added,
   then `npm run verify`
5. deploy Scimeto — a released fix nobody deployed is a fix nobody has

Step 4's "actually use it" is not optional bookkeeping: a capability no call site
invokes is not shipped, and the library's own tests pass either way.
