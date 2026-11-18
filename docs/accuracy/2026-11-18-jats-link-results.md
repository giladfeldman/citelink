# Results: citation-to-reference link accuracy against PMC JATS gold

**Run:** 2026-11-18. **Plan:** `docs/accuracy/2026-11-18-jats-link-preregistration.md` (committed
before the first run). **Harness:** `scripts/jats-link-eval.mjs`. **Versions:** 0.7.88 (the version
SaneCite measured) and 0.7.89. **Gold:** 80 PubMed Central open-access papers, 13,008 gold links in
9,137 citation groups, 9,238 references; held outside this repository (papers listed by PMCID and
DOI at the end).

All numbers below are produced by the harness; none is hand-computed. 95% confidence intervals are
paper-cluster percentile bootstrap, 2,000 resamples, seed 20261118. Verdicts follow the plan: PASS
when the lower bound is at or above the threshold, FAIL when the upper bound is below it, otherwise
INCONCLUSIVE. Thresholds: link precision 0.95, link recall 0.85, span-position accuracy 0.95.

## Deviation from the plan (disclosed)

The first full run used gold text from renderer version 1. Reading its errors showed a defect in
the gold, not in citelink: in 46 of the 80 papers the Europe PMC XML wraps the reference list in a
body section titled "References", and the renderer wrote that section's heading with nothing under
it, so the text carried a second, empty "References" heading before the real list. citelink then
found no reference list in many of those papers (recall 56.9% pooled for 0.7.89 in that run). The
renderer was corrected to drop any section that renders no text (version 2), the gold was rebuilt,
and the gold links, groups and references were unchanged (13,008 / 9,137 / 9,238). No scoring rule,
threshold or sample change was made. The results below are from renderer version 2; the version 1
runs are kept beside them in the gold folder.

## Primary outcomes, v0.7.89

| Group | Papers | Link precision | Link recall | Span position |
|---|---|---|---|---|
| APA author-year (comma) | 16 | 99.8% [99.5, 100.0] PASS | 94.8% [92.9, 96.9] PASS | 99.4% [98.7, 100.0] PASS |
| Harvard author-year (no comma) | 16 | 99.2% [98.7, 99.7] PASS | 85.5% [78.3, 91.2] INCONCLUSIVE | 97.7% [96.4, 98.6] PASS |
| Numeric, brackets | 22 | 100.0% [100.0, 100.0] PASS | 96.5% [89.9, 99.8] PASS | 100.0% [100.0, 100.0] PASS |
| Numeric, superscript | 22 | 75.2% [63.1, 86.6] FAIL | 45.9% [31.4, 68.3] FAIL | 99.9% [99.7, 100.0] PASS |
| Numeric, parentheses | 4 | 74.5% [41.0, 94.7] FAIL | 73.2% [67.6, 77.9] FAIL | 100.0% [100.0, 100.0] PASS |
| More than 100 references | 26 | 89.7% [82.2, 96.6] INCONCLUSIVE | 65.1% [50.4, 83.0] FAIL | 99.5% [99.1, 99.9] PASS |
| All papers | 80 | 90.0% [83.8, 95.4] INCONCLUSIVE | 72.7% [61.2, 84.9] FAIL | 99.5% [99.2, 99.7] PASS |

Counts (pooled): 9,462 correct links of 10,519 made, of 13,008 gold links; 9,414 of the 9,462
correct links have the exact span. Paradigm (numeric vs author-year) detected correctly in 75 of 80
papers.

## Before / after: v0.7.88 vs v0.7.89

| Group | Precision 0.7.88 → 0.7.89 | Recall 0.7.88 → 0.7.89 | Position 0.7.88 → 0.7.89 |
|---|---|---|---|
| APA | 99.8 → 99.8 | 90.4 → 94.8 | 96.9 → 99.4 |
| Harvard | 99.2 → 99.2 | 85.4 → 85.5 | 97.7 → 97.7 |
| Numeric, brackets | 100.0 → 100.0 | 86.0 → 96.5 | 100.0 → 100.0 |
| Numeric, superscript | 70.8 → 75.2 | 41.0 → 45.9 | 99.9 → 99.9 |
| Numeric, parentheses | 74.5 → 74.5 | 73.2 → 73.2 | 100.0 → 100.0 |
| More than 100 references | 87.1 → 89.7 | 57.7 → 65.1 | 99.4 → 99.5 |
| All papers | 88.4 → 90.0 | 67.6 → 72.7 | 99.1 → 99.5 |

No primary outcome fell in any group, so 0.7.89 passes the before/after rule. Pooled 0.7.88 recall
here (67.6%) is lower than SaneCite's 80.1% on its own 80 papers; the two samples differ (this one
is weighted toward numeric and superscript papers by design).

**Numeric comma fix and integer intervals.** In bracket papers, 0.7.89 added 352 correct links and
made no false link in either version (0 links where no gold citation was). The gold has 2
non-citation bracketed number pairs such as `[1,100]` in bracket papers, 14 in superscript papers
and 3 in APA papers, so the interval check rests on few cases: in bracket papers neither
version made any false link. Whether the 14 superscript pairs were linked is not measured separately;
superscript false links are classified below.

## Failure classes (v0.7.89)

Misses (gold links not found, 3,546 in all) and false links (1,057 in all), grouped by cause. Each
is logged for fixing.

| Class | Where | Count |
|---|---|---|
| A date such as "(April 2020)", or a single "(WHO, 2020)", makes a numeric paper read as author-year, so the paper gets no links | 2 bracket, 3 superscript papers | 709 gold links |
| Superscript after sentence punctuation not detected ("cells.96 However", "tumor,13") | superscript | 1,856 misses |
| Digits glued to a word: gene and protein names read as citations ("Tgfb1", "Bowtie2"), and real glued citations missed | superscript | 699 false links, ~290 misses |
| Parenthesis-numeric papers detected as a superscript style: "(4, 5)" groups missed, glued gene digits linked | parentheses | 275 misses, 255 false links |
| Enumerated list markers "(1) Since …" read as citations | superscript, parentheses | 74 false links |
| Author-year citation after a prefix inside the parentheses, or outside parentheses ("e.g., MAPLE: Takami, 2019") | APA, Harvard | 278 misses |
| Same-author year list ("Parker 1978, 1983"): one span covers both years, second work linked wrongly | Harvard, APA | 31 position errors, 43 misses |

## Secondary outcomes (descriptive)

**Reference mapping.** 9,226 references parsed for 9,238 gold references: 9,152 mapped exactly,
74 by token overlap, 0 unmapped; 11 gold references split across two parsed ones, 23 with no parsed
reference.

**Field accuracy, references mapped one-to-one** (pooled; papers in brackets): year 99.96%
(2,779/2,780; 30), first author 95.2% (2,554/2,683; 28), title 89.0% (2,418/2,716; 30), DOI 86.9%
(6,378/7,336; 72), list number 99.96% (6,813/6,816; 48), issue 62.3% (198/318; 13), volume 7.5%
(198/2,646; 30), first page 7.7% (198/2,581; 30). Volume and pages are empty in citelink's output
for most references (APA 0 of 388); this is a parsing gap, logged. On correct author-year links:
citation year 100% (3,091/3,091), first author 99.3% (839/845).

**Position overlap** (predicted span overlaps the gold citation at all): 100.0% pooled.

## Fields this test does not score (unverified)

`DetectedCitation.type`, `citationStyle` (parenthetical or narrative), `pageNumbers`, `yearSuffix`,
`context`, `raw`, authors after the first and `isOrganization`; `MatchResult.confidence`,
`matchMethod`, `matchDetails`, `alternativeMatches`; `ParsedReference.source`, `url`, `type`,
authors after the first; the named style beyond its paradigm. No result for these can be read from
this test.

## Limits

The text is rendered from XML, so it has no PDF extraction damage; superscripts are written as
plain digits glued to the preceding text, as PDF extraction writes them. Journals were chosen to
show each style and are not a random sample. Per-style intervals are wide where papers differ
sharply (one misdetected paper removes all of its links).

## Papers

| PMCID | DOI | Style |
|---|---|---|
| PMC10834882 | 10.1002/ece3.10873 | apa-comma |
| PMC6362447 | 10.1002/ece3.4823 | apa-comma |
| PMC6424886 | 10.3389/fpsyg.2019.00284 | apa-comma |
| PMC6467853 | 10.1002/ece3.5015 | apa-comma |
| PMC6533084 | 10.7554/elife.46323 | apa-comma |
| PMC6691128 | 10.3389/fpsyg.2019.01713 | apa-comma |
| PMC6745666 | 10.1002/ece3.5440 | apa-comma |
| PMC6787792 | 10.1002/ece3.5555 | apa-comma |
| PMC6822047 | 10.1002/ece3.5670 | apa-comma |
| PMC6914840 | 10.3389/fpsyg.2019.02767 | apa-comma |
| PMC6994238 | 10.7554/elife.52760 | apa-comma |
| PMC7325630 | 10.3389/fpsyg.2020.01540 | apa-comma |
| PMC7350926 | 10.3389/fpsyg.2020.01713 | apa-comma |
| PMC7677301 | 10.3389/fpsyg.2020.579038 | apa-comma |
| PMC7723407 | 10.7554/elife.61312 | apa-comma |
| PMC8853656 | 10.7554/elife.73420 | apa-comma |
| PMC6328365 | 10.1093/gbe/evy259 | harvard-nocomma |
| PMC6330053 | 10.1093/gbe/evy252 | harvard-nocomma |
| PMC6765380 | 10.1093/beheco/arz095 | harvard-nocomma |
| PMC6838653 | 10.1093/beheco/arz114 | harvard-nocomma |
| PMC6893154 | 10.1093/gbe/evz193 | harvard-nocomma |
| PMC6984357 | 10.1093/molbev/msz189 | harvard-nocomma |
| PMC7182206 | 10.1093/molbev/msaa015 | harvard-nocomma |
| PMC7268786 | 10.1093/gbe/evaa081 | harvard-nocomma |
| PMC7348690 | 10.1093/gbe/evaa096 | harvard-nocomma |
| PMC8233496 | 10.1093/molbev/msab120 | harvard-nocomma |
| PMC8476166 | 10.1093/molbev/msab199 | harvard-nocomma |
| PMC8528540 | 10.1093/beheco/arab055 | harvard-nocomma |
| PMC8662613 | 10.1093/molbev/msab293 | harvard-nocomma |
| PMC8882382 | 10.1093/gbe/evac018 | harvard-nocomma |
| PMC9262166 | 10.1093/beheco/arac045 | harvard-nocomma |
| PMC9400175 | 10.1093/molbev/msac174 | harvard-nocomma |
| PMC10635526 | 10.1371/journal.pone.0294236 | numeric-bracket |
| PMC6471628 | 10.3390/ijms20061475 | numeric-bracket |
| PMC6651423 | 10.3390/ijms20133328 | numeric-bracket |
| PMC6769923 | 10.3390/ijms20184331 | numeric-bracket |
| PMC6822756 | 10.1371/journal.pone.0223994 | numeric-bracket |
| PMC6837442 | 10.1371/journal.pone.0224365 | numeric-bracket |
| PMC7020371 | 10.1186/s12889-020-8251-6 | numeric-bracket |
| PMC7162477 | 10.1371/journal.pone.0231924 | numeric-bracket |
| PMC7187482 | 10.1186/s12889-020-08498-8 | numeric-bracket |
| PMC7200005 | 10.1371/journal.pone.0232076 | numeric-bracket |
| PMC7329528 | 10.1186/s12889-020-08749-8 | numeric-bracket |
| PMC7369905 | 10.3390/ijms21134777 | numeric-bracket |
| PMC7377438 | 10.1371/journal.pone.0236337 | numeric-bracket |
| PMC7386569 | 10.1371/journal.pone.0232565 | numeric-bracket |
| PMC7395209 | 10.1186/s12889-020-09301-4 | numeric-bracket |
| PMC7472405 | 10.1186/s12889-020-09429-3 | numeric-bracket |
| PMC7503727 | 10.3390/ijms21176275 | numeric-bracket |
| PMC7652254 | 10.1371/journal.pone.0240784 | numeric-bracket |
| PMC7794640 | 10.1186/s12889-020-10070-3 | numeric-bracket |
| PMC7905904 | 10.1186/s12889-021-10429-0 | numeric-bracket |
| PMC8268869 | 10.3390/ijms22136995 | numeric-bracket |
| PMC8369710 | 10.1186/s12889-021-11623-w | numeric-bracket |
| PMC6421268 | 10.3389/fimmu.2019.00277 | numeric-paren |
| PMC6543837 | 10.3389/fimmu.2019.01084 | numeric-paren |
| PMC6618143 | 10.3389/fimmu.2019.01462 | numeric-paren |
| PMC7986854 | 10.3389/fimmu.2021.636568 | numeric-paren |
| PMC10200802 | 10.1038/s41392-023-01452-1 | numeric-superscript |
| PMC6327027 | 10.1038/s41598-018-37186-2 | numeric-superscript |
| PMC6395752 | 10.1038/s41598-019-40055-1 | numeric-superscript |
| PMC6435756 | 10.1038/s41598-019-41695-z | numeric-superscript |
| PMC6447622 | 10.1038/s41467-019-09234-6 | numeric-superscript |
| PMC6488672 | 10.1038/s41467-019-09982-5 | numeric-superscript |
| PMC6522516 | 10.1038/s41467-019-10210-3 | numeric-superscript |
| PMC6597582 | 10.1038/s41598-019-45839-z | numeric-superscript |
| PMC6941980 | 10.1038/s41467-019-13668-3 | numeric-superscript |
| PMC7080791 | 10.1038/s41467-020-14998-3 | numeric-superscript |
| PMC7100515 | 10.1038/s41467-020-15562-9 | numeric-superscript |
| PMC7478957 | 10.1038/s41598-020-71908-9 | numeric-superscript |
| PMC7547708 | 10.1038/s41467-020-18794-x | numeric-superscript |
| PMC7658227 | 10.1038/s41598-020-76550-z | numeric-superscript |
| PMC7889871 | 10.1038/s41467-021-21246-9 | numeric-superscript |
| PMC7897327 | 10.1038/s41392-020-00450-x | numeric-superscript |
| PMC8208984 | 10.1038/s41598-021-91456-0 | numeric-superscript |
| PMC8273155 | 10.1038/s41392-021-00658-5 | numeric-superscript |
| PMC8352980 | 10.1038/s41598-021-95565-8 | numeric-superscript |
| PMC8617206 | 10.1038/s41392-021-00791-1 | numeric-superscript |
| PMC8724284 | 10.1038/s41392-021-00762-6 | numeric-superscript |
| PMC9034083 | 10.1038/s41392-022-00974-4 | numeric-superscript |
