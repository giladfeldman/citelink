# Pre-registered analysis plan: citation-to-reference link accuracy against PMC JATS gold

**Written and committed:** 2026-11-18, before the first full run of citelink on the gold set.
**Harness:** `scripts/jats-link-eval.mjs` (rules pinned by `tests/jatsLinkEval.test.ts`).
**Results file (written after the run):** `docs/accuracy/2026-11-18-jats-link-results.md`.

## Why

On 2026-11-17 SaneCite ran citelink 0.7.88 on 80 open-access papers whose citation-to-reference
links were known exactly, and found 7,970 of 9,948 links (80.1% recall) with 97% of the links it
made being correct. Our own accuracy checks scored author and year identity only, never the
position of a citation in the text, and our test papers were mostly APA psychology. This test
follows SaneCite's method: an outside gold with exact links, and thresholds fixed before the run.

## Gold

* **Source.** PubMed Central open-access JATS XML, fetched from Europe PMC. In this XML every
  in-text citation is an `<xref ref-type="bibr" rid="...">` that names the `<ref>` it cites.
* **Text.** The article is rendered to plain text by the gold builder, which records the exact
  character span of every xref while it writes. No alignment step is needed between gold and text.
  Rendering rules: title, abstract, body sections, then a `References` heading and one paragraph per
  reference. Tables and display formulas are dropped from text and gold alike. Superscript is
  written as plain characters (`studies1,2`), as PDF text extraction writes it. A reference is
  written from the publisher's `<mixed-citation>` text when that text reads like a printed
  reference; otherwise (names run together in the XML, or the year moved after the title, or only
  structured fields exist) it is rendered from its fields in the paper's own paradigm. Each
  reference records which rendering it got.
* **Gold links.** Every `rid` of a bibr xref is one link at that xref's span. A dash between two
  numeric xrefs (`[4–6]` marked as xref 4, dash, xref 6) expands to every label in between.
* **Paper acceptance (fixed).** At least 10 bibr xrefs and 10 references; every numeric xref's
  number equals its reference's label; at most 5% of xref ids resolve to no reference; numeric
  papers have a numbered list and author-year papers do not; at most 10% of references are plain
  strings not in the paper's printed form. Every rejected candidate is listed with its reason.
* **Sample.** Five strata, 16 papers each, open access, 2019–2024, most-cited first:
  APA author-year with comma (Frontiers in Psychology, Ecology and Evolution, eLife), Harvard
  author-year without comma (Molecular Biology and Evolution, Genome Biology and Evolution,
  Behavioral Ecology), numeric in brackets (PLoS ONE, BMC Public Health), numeric superscript
  (Nature Communications, Scientific Reports), and numeric with more than 100 references (review
  articles in International Journal of Molecular Sciences, Signal Transduction and Targeted Therapy,
  Frontiers in Immunology). A paper is analysed under the style its xrefs show, measured by rule
  (superscript, bracket or parenthesis around numeric groups; comma or none before the year).
* **Coverage.** A coverage table (style x feature x count) is published with the gold. Any shape
  the style should show but the sample does not is named as a gap, not assumed covered.

**Sample as drawn (2026-11-18, before any citelink run):** 80 papers accepted, 11 candidates
rejected. By measured style: APA comma 16, Harvard no comma 16, numeric bracket 22, numeric
parenthesis 4, numeric superscript 22; 26 papers have more than 100 references. 13,008 gold links
in 9,137 citation groups. The coverage table has no zero cell for any shape a style should show
(including `[110,111]`-type lists: 139 bracket and 327 superscript groups). Non-citation bracketed
number pairs such as `[1,100]` are rare (2 in numeric-bracket papers, 14 in superscript papers), so
the interval false-positive check rests on few cases.

The gold set is held outside this repository; papers are identified by PMCID and DOI in the
results file.

## What is scored

citelink is run as a consumer runs it: `analyze(text)` on the rendered text.

* **Predicted link.** A match result whose `reference` is set and whose `status` is anything other
  than `no_match` or `unverifiable`. This is what a consumer stores as a link (`suggested` and
  `ambiguous` included).
* **Reference mapping.** Each parsed reference is mapped to the gold reference it came from: first
  by finding the start of its raw text in the rendered reference section, else by token overlap
  (Jaccard at least 0.5). Unmapped references, gold references split across several parsed ones,
  and gold references with no parsed one are counted.
* **Pairing.** A predicted link and a gold link pair when they name the same gold reference, lie in
  the same paragraph, and are at most 300 characters apart (centre to centre). Pairing is
  one-to-one, nearest first. For numeric papers the gold link's citation span is its whole
  citation group (`[1–3]`), because citelink reports one span per group.

## Primary outcomes and thresholds (fixed)

| Outcome | Definition | Threshold |
|---|---|---|
| Link precision | paired predicted links / all predicted links | 0.95 |
| Link recall | paired gold links / all gold links | 0.85 |
| Span-position accuracy | among paired links, the predicted span covers its own gold xref and covers no other citation's xref whose references it does not claim (in a numeric group such as `[1–3]` the whole group is one citation; in an author-year `;` list each member is its own) | 0.95 |

Each is computed per style (APA comma, Harvard no comma, numeric bracket, numeric superscript, and
numeric parenthesis if any paper shows it), for the subgroup of papers with more than 100
references, and pooled.

**Uncertainty.** 95% confidence intervals by percentile bootstrap that resamples papers (citations
within a paper are not independent), 2,000 resamples, fixed seed 20261118.

**Decision rule.** PASS when the CI's lower bound is at or above the threshold; FAIL when the CI's
upper bound is below it; INCONCLUSIVE otherwise. An outcome with no data is reported as NO DATA,
never as a pass.

## Secondary outcomes (descriptive, no thresholds)

* Position overlap (predicted span overlaps the gold xref at all).
* Citation paradigm detection (numeric vs author-year) per paper.
* Reference mapping counts (exact, fuzzy, unmapped, split, missing).
* Field accuracy on references mapped one-to-one: year, first author surname, title (token
  overlap at least 0.8), volume, issue, first page, DOI (only where the DOI is in the reference
  text), list number (numeric papers). On paired author-year links: citation year and first author.
* Error classes: misses (citation not detected; detected but not linked; linked to an unmapped
  reference; linked but not to this reference) and false links (reference unmapped; no gold
  citation there; duplicate link; wrong reference).
* Numeric false positives on integer intervals such as `[1,100]` (debt d-fec056): false links of
  class "no gold citation here" in numeric papers, read against the coverage table's count of
  non-citation bracketed number pairs.

## Fields a consumer reads that this test does not score (unverified)

`DetectedCitation.type`, `citationStyle` (parenthetical or narrative), `pageNumbers`, `yearSuffix`,
`context`, `raw`, authors after the first and `isOrganization`; `MatchResult.confidence`,
`matchMethod`, `matchDetails`, `alternativeMatches`; `ParsedReference.source`, `url`, `type`,
authors after the first; the named style beyond its paradigm. A result for these fields cannot be
read from this test.

## Before / after rule (release gate)

The same harness scores an older tag and the candidate on the same gold. The candidate fails if any
primary outcome, in any style group or pooled, drops by more than 1 percentage point (point
estimates). The first application compares 0.7.88 (the version SaneCite measured) with 0.7.89.

## Known limits, stated in advance

* The text is rendered from XML, so it has none of the damage PDF extraction does (hyphenation,
  running headers, lost list numbers, broken lines). This test measures detection and linking on
  clean text; it does not measure robustness to extraction.
* Reference text is partly rendered from structured fields by the gold builder. Results are also
  reported by rendering kind where that differs.
* The journals were chosen to show each style; they are not a random sample of the literature.

## What was done before this plan was committed

The gold builder was developed on five probe papers (outside the sample unless drawn again by the
sampler) to fix rendering and acceptance rules. The harness was developed on synthetic text only.
citelink had not been run on any gold paper.
