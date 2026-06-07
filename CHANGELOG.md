# Changelog

## 0.7.12 (unreleased)

Citationguard-iterate **session 2026-06-07b, cycle 3** — plain-digit
(PDF-superscript) citation detection discarded real citations (INTEXT-DETECTION
class).

- **PLAIN_DIGIT_FP_WORD was end-anchored only**, so it matched any word ENDING in
  a false-positive token: "follow-up26" → "up" matched "pp?" (page) and "online47"
  → matched "Line", dropping the superscripts. Now anchored at BOTH ends (^…$):
  the FP word must be the WHOLE preceding word. "page"/"pp"/"Table"/"Fig" still
  match exactly and are still skipped.
- **The consecutive-uppercase acronym guard ("BRCA1", "IMpower150") also killed a
  superscript that follows a parenthetical acronym** — "(CSF)13" — because "CSF"
  precedes the digit. Exempted when the digit immediately follows a closing paren
  (a citation signal, not a name-with-embedded-number).

nat_comms_2 in-text detection misses 15 → 12 (markers 13, 26, +1 recovered);
intext F1 0.861 → 0.886; **zero precision change on every numeric paper** (plos,
ieee, nat_comms extra_pred counts unchanged — the loosening added no false
positives). Regression test: `tests/plainDigitFpGuardAnchoring.test.ts`.

## 0.7.11 (unreleased)

Citationguard-iterate **session 2026-06-07b, cycle 2** — Nature numbered
reference parsed the JOURNAL name as the title (CITATION-PARSING class).

- **A Nature reference whose title begins with an acronym / hyphenated-caps token
  (COVID-19, SARS-CoV-2, IL-12, N-methyl-…, GM-CSF) or a ligature word
  (inﬂammatory) emitted the journal name as the title.** `parseNatureReference`
  located the author/title boundary by scanning for ". " followed by a
  `[A-Z][a-z]{2,}` word; an acronym title-start is not such a word, so the scan
  skipped the real boundary and latched onto a later ". Journal" period —
  producing "Brain 144, 2696–2708 (2021)", "Brain Pathol", "Sci", "Proc", "Exp"
  as the parsed title for nat_comms_2 refs #11/16/22/33/34/45/57. The fix anchors
  the author list on the unambiguous "et al." marker (≈80% of Nature refs) and
  broadens the title-word class to accept acronym / hyphen-caps / ligature-leading
  titles. nat_comms_2 references F1 0.786 → 0.889 (against regenerated gold); no
  corpus regression. Surfaced only after the nat_comms_2 AI gold was regenerated
  — the prior gold's title_start had bled into the journal, so citelink's wrong
  parse and the wrong gold cancelled out (a blind-gate masking, the reason
  gold-first matters). Regression test: `tests/natureAcronymTitleStart.test.ts`.
- Residual (filed, not fixed here): 2 nat_comms refs differ only by a semantic
  hyphen lost to line-break dehyphenation ("cardio-respiratory" →
  "cardiorespiratory", "neutrophil-associated" → "neutrophilassociated"). The
  same document also splits "inde-pendent" → "independent" (hyphen correctly
  removed), so the two cannot be told apart without a dictionary. Filed as a
  text-normalization item; not a regression-prone heuristic.

## 0.7.10 (unreleased)

Citationguard-iterate **cycle 6** (this run) — numbered reference fabricated from
a line-split page range (HALLUCINATION class).

- **A page/year range split across a line break fabricated a reference.** On
  plos_med_1 (Vancouver) a reference ended "... 111:243–" with "248. https://..."
  on the next line; the numbered-reference splitter read "248." as a new
  reference number, fabricating reference #248 and mis-numbering the real next
  entry. `extractReferenceSection` now joins a digit range split across a line
  ("243–\n248" → "243–248"), mirroring the word-hyphenation join. Fabricated
  high-numbered references are gone (plos max listNumber 248 → 33); plos
  references F1 0.853 → 0.866; no corpus regression. For an academic-integrity
  tool a fabricated reference is the worst failure mode, so this matters beyond
  the metric. Regression test: `tests/numberedRefPageRangeSplit.test.ts`.

## 0.7.9 (unreleased)

Citationguard-iterate **cycle 4** (this run) — reference-section bleed.

- **Author-year citations were detected inside the reference list itself.** A
  replication/meta-analysis paper's reference entries cite their originals in the
  entry title (collabra_90203: "... extension of Kogut and Ritov (2005a) Study
  2 ..."), and `detectCitations` / `detectHarvardCitations` scanned the whole
  document, emitting those as spurious in-text citations. The numeric detector
  already filtered on `findReferenceSectionStart`; `analyze()` now applies the
  same boundary to the author-year paths (a no-op for numeric). collabra
  extra_pred 6 → 4 (intext F1 0.952 → 0.959), chan 9 → 5 (0.932 → 0.946); no
  recall loss; chen unaffected (its extra_pred are gold under-counts, not bleed).
  Regression test: `tests/referenceSectionBleed.test.ts`.

## 0.7.8 (unreleased)

Citationguard-iterate **cycle 3** (this run) — Latin Extended-A surnames.

- **A surname with a Latin Extended-A character (U+0100–U+017F) was truncated,
  promoting the second author to first.** The multi-author reference
  `authorPattern` LastName body class was `[A-Za-zÀ-ÿ'-]+`, stopping at U+00FF,
  so "Bartoš, F., Maier, M., …" parsed first author = "Maier" (the "š" U+0161
  truncated "Bartoš", the broken entry was skipped). 3 mis-parsed references +
  cascading matching misses on collabra_90203. The numericCitationDetector
  narrative pattern had the same gap. Both now use `ā-ž`, matching the convention
  the rest of the codebase already followed. collabra references F1 0.869 →
  0.938, matching accuracy 0.897 → 0.945; ASCII unaffected; no corpus regression.
  Regression test: `tests/latinExtendedSurname.test.ts`.

## 0.7.7 (unreleased)

Citationguard-iterate **cycle 2** (this run) — reference section truncated by a
mid-entry running header.

- **An all-caps running page header that lands INSIDE a reference truncated the
  whole rest of the list.** On chan_feldman_2025_cogemo the header
  "COGNITION AND EMOTION" + page number "1247" was injected by extraction between
  "...forgiveness. Motivation" and the continuation "and Emotion, 30(3),
  189–197." `extractReferenceSection` matched the all-caps line, looked ahead a
  single content line (Hareli's orphaned lowercase continuation, which has no
  reference-start signature) and stopped — dropping all 50 references after
  Hareli (McCullough, Hendrickson, Strelan, Worthington, … Zwaan). citelink
  parsed 40/90 refs; matching accuracy was 0.33 because the in-text cites had no
  reference to resolve to. The header look-ahead now skips continuation
  fragments (lowercase / digit / DOI-suffix / bracket) and keeps scanning the
  window for the next genuine reference start, stopping only on capitalized
  post-references prose. chan refs parsed 40 → 90; references F1 0.446 → 0.711,
  matching accuracy 0.326 → 0.949. No regression on other corpus papers.
  Regression test: `tests/referenceSectionRunningHeaderSplit.test.ts`.

## 0.7.6 (unreleased)

Citationguard-iterate **cycle 26** — institutional acronym-colon author.

- **An institutional author written "ACRONYM: Full Name" was missed.** The group
  patterns covered "(WHO, 2020)", "(World Health Organization, 2020)", and
  "(Name [WHO], 2020)", but not the acronym-colon-name form
  ("KNAW: Royal Dutch Academy of Arts and Sciences, 2018"), which also appears as
  a semicolon-bundle entry and may wrap across a line break inside the name. New
  `groupAcronymColon` pattern + a bundle-fragment handler, keyed on the acronym,
  tolerant of internal whitespace; guarded against non-acronym lead-ins
  ("Note: Smith, 2020"). Regression test: `tests/institutionalAcronymColon.test.ts`.
  Recovered the chen_2021_jesp KNAW citation (intext F1 0.923 → 0.925).

## 0.7.5 (unreleased)

Citationguard-iterate **cycle 25** — Dutch contracted-article particle ("van't").

- **A "van't Veer" / "van 't Hooft" surname was missed.** The particle whitelist
  matched "van" only when followed by whitespace, so the contracted "van't"
  (apostrophe, no space) defeated the surname pattern and
  "(van't Veer & Giner-Sorolla, 2016)" was dropped. The whitelist now includes
  the contracted forms "van't" / "van's" / bare "'t" / "'s" (straight or curly
  apostrophe). Regression test: `tests/dutchContractedParticle.test.ts` (3 cases).
  chen_2021_jesp intext F1 0.918 → 0.923.

## 0.7.4 (unreleased)

Citationguard-iterate **cycle 24 (R1)** — "see for example" signal prefix.

- **The multi-word signal prefix "see for example" (and "see, e.g.") was not
  stripped.** The fragment-prefix strip and `SIGNAL_PREFIX` recognised "see" /
  "see also" but not "see for example" / "see, e.g.", so
  "(see for example Arkes et al., 1981; Harley et al., 2004)" lost its first
  entry. Both strip sites now accept "see for example" / "see e.g." / "see, e.g."
  (comma- or space-separated). Regression test:
  `tests/signalPrefixSeeForExample.test.ts` (4 cases). Cumulative cycles 21–24:
  chen_2021_jesp intext F1 0.911 → 0.918, matching 0.915 → 0.928.

## 0.7.3 (unreleased)

Citationguard-iterate **cycle 23** — eszett (ß) in surnames.

- **A surname containing "ß" (U+00DF) was truncated.** The lowercase surname
  character class ran `à-ÿ` (U+00E0–U+00FF), which begins one code point above
  ß, so "Groß" matched only "Gro" and "(Groß & Bayen, 2015)" was missed. "ß" is
  now in the class. Regression test: `tests/eszettSurname.test.ts` (3 cases).

## 0.7.2 (unreleased)

Citationguard-iterate **cycle 22** — compound surname in two-author bundle entries.

- **A particle surname ("Van Nuland", "De Bruin", "van der Berg") as a
  two-author entry inside a semicolon bundle was missed.** The standalone
  two-author parenthetical pattern already used `COMPOUND_SURNAME`, but the
  anchored bundle-fragment two-author pattern (which scores each ';'-split
  fragment) used the particle-less `SURNAME_LASTNAME`, so
  "(…; Hom Jr & Van Nuland, 2019; …)" lost its middle entry. The bundle pattern
  now uses `COMPOUND_SURNAME` for both authors. Combined with cycle 21, recovers
  the chen_2021_jesp "Hom Jr & Van Nuland" citations (intext F1 0.911 → 0.916).
  Regression test: `tests/compoundBundleTwoAuthor.test.ts` (4 cases).

## 0.7.1 (unreleased)

Citationguard-iterate **cycle 21 (R2)** — generational suffix on surnames.

- **Generational suffix (Jr / Sr / II / III / IV) on a surname broke detection.**
  A trailing "Hom Jr" defeated every author-capture pattern that expected a
  "&", ",", or year immediately after the surname, so "(Hom Jr & Van Nuland,
  2019)" and "Hom Jr (2019)" were missed entirely. `SURNAME_LASTNAME` now
  consumes an optional generational suffix (so every pattern — anchored bundle
  fragments included — tolerates it), and `createParsedAuthor` strips the suffix
  from the normalized author so the citation key stays "hom", not "hom jr".
  Regression test: `tests/generationalSuffix.test.ts` (5 cases). (Surfaced by
  the cycle-20 gold-group-expansion gate fix on chen_2021_jesp.)

## 0.7.0 (unreleased)

Citationguard-iterate **cycle 18** — fixes driven by the 2026-05-26
Sonnet-watches-Opus canary audit (chen_2021_jesp, chan_feldman_2025_cogemo,
collabra_90203). Aggregate Sonnet findings 60 → 39 across two re-audit rounds.
Test suite 267 → 275.

- **Sentence-connector author hallucinations** — sentence-initial adverbs
  ("Also,", "Furthermore,", "Therefore,", "Recently,") were parsed as the
  first author of the narrative citation that followed (e.g. "Also, Werth and
  Strack (2003)" → author "Also"). New `SENTENCE_CONNECTORS` set +
  `isSentenceConnector()` guard applied to `multiAuthorAndNarrative`,
  `mixedListEtAlNarrative`, `mixedListEtAlParenthetical`,
  `multiAuthorParenthetical`, `etAlNarrative`, `twoAuthorNarrative`,
  `singleNarrative`. Eliminated 4 cross-paper HALLUCINATIONs.

- **Running page-footer absorbed as a reference** — "Journal of Experimental
  Social Psychology 96 (2021) — 104154" repeated on every page slipped between
  references and was parsed as a reference entry. New `RUNNING_PAGE_FOOTER`
  filter in `extractReferenceSection`. (SECTION-BOUNDARY.)

- **Download-watermark absorbed as a reference** — "Downloaded from <URL> by
  <institution> on <date>" parsed as 3 references in collabra. New
  `DOWNLOAD_WATERMARK` filter. (HALLUCINATION ×3.)

- **Same-(author,year) reference duplicates rejected as ambiguous** — two
  "Fischhoff (1975)" entries (no a/b suffix) made the matcher mark all 21
  in-text Fischhoff 1975 citations 'ambiguous' → scored as no-match. The
  matcher now treats same-`(author, year, yearSuffix)` alternatives as
  'matched' to the highest-confidence ref (alternatives preserved); genuinely
  different suffixes (2020a vs 2020b) stay 'ambiguous'. Recovered 22
  INTEXT-MATCHING instances. Regression test in `citationMatching.test.ts`.

- **Same-author multi-year parentheticals not split** — "(Bishop, 2019, 2020a,
  2020b)", "(Thaler, 1985, 1999)", "(Dickert et al., 2012, 2015)" emitted only
  the first year. The previous `sameAuthorMultipleYears` / `sameAuthorSameYear`
  patterns were defined but NEVER consumed by any loop. Replaced with
  `sameAuthorMultiYear` (2+ years, optional "et al.", optional signal prefix)
  with a real consumer loop, PLUS a fragment-level multi-year handler inside
  the `multipleCitations` semicolon-split loop (for bundle items like
  "(...; Dickert et al., 2012, 2015; ...)"). Each year gets a distinct source
  position so `addCitation`'s position-dedup keeps all siblings; the
  end-of-detection de-overlap pass is now identity-aware (keys on
  author+year+suffix) so equal-span siblings aren't collapsed. Regression
  suite `sameAuthorMultiYear.test.ts` (7 tests).

- **Bundle-connector prefixes** — semicolon-bundle items joined by prose
  connectors ("...; and Renkewitz & Keiner, 2019", "..., in Mayiwar et al.,
  2023") had the leading "and "/"in " defeat the `^`-anchored fragment
  matchers. The fragment connector-strip now also removes a leading "and "/
  "in " when followed by an uppercase surname.

Known limits documented in the audit ledger (`MetaScienceTools/CitationGuard/
tmp/iterate/cycle-canary-smoke/`): multi-citation parenthetical SECONDARY-entry
detection (Mazursky/Hom/Guilbault/KNAW inside long bundles), Maier/Bartoš
multi-same-year title-swap disambiguation, and citations embedded inside
reference-list titles remain open. Soft-hyphen / Unicode-mangling artifacts and
dropped references in chan_feldman/collabra are docpluck text-extraction
defects (filed, fixed in docpluck-iterate per CitationGuard CLAUDE.md domain
boundary).

## 0.6.0

Additional citation patterns surfaced by the cycle-6 gate diagnostics
(citationguard-iterate cycles 15-19):

- **Cycle 15 — multi-author narrative with "and"** ("Hart, Lane, and Chinn
  (2018)", "Arkes, Wortmann, Saville, and Harkness (1981)") — new
  `multiAuthorAndNarrative` pattern. Same shape as `multiAuthorParenthetical`
  but for the narrative form. Regression test:
  `multiAuthorAndNarrative.test.ts`.

- **Cycle 16 — initial-prefixed surnames** ("S. Lee & Feeley, 2018",
  "M. D. Lee & Wagenmakers, 2013, p. 105") — co-author surname
  disambiguator with leading initial(s). New `INITIAL_PREFIX` constant
  (`(?:[A-Z]\.\s*){0,3}`) inlined into `singleParenthetical`,
  `twoAuthorParenthetical`, `singleWithPage`, `twoAuthorWithPage`, and the
  multi-citation split-handler's `twoAuthorMatch` / `singleMatch`. The
  initial is consumed but the captured first author stays the surname.
  Regression test: `initialPrefixedSurname.test.ts`.

- **Cycle 17 — capitalized surname particles** ("Van Knippenberg",
  "Von Restorff", "De Bruin"). `SURNAME_PARTICLE` is now case-insensitive
  on the first letter (`[Vv]an`, `[Dd]e`, `[Vv]on`, etc.) so narrative
  reference-list style with capital-initial particles works alongside the
  lowercase canonical form. Regression test:
  `capParticleAndEtAlPage.test.ts`.

- **Cycle 18 — etAlNarrative with trailing page/note.** "Brandt et al.
  (2014, p. 218)", "Smith et al. (2020, Experiment 3)" — etAlNarrative
  now allows an optional `(?:,\s*[^)]+)?` after the year inside the same
  paren group. Same regression file.

- **Cycle 19 — multi-particle stacking.** "Wagenmakers, Wetzels, Borsboom,
  van der Maas, & Kievit, 2012" — the COMPOUND_SURNAME's leading particle
  group now allows {0,2} particles instead of {0,1}, covering "van der"
  / "de la" / "von der" as the surname's leading section.

Cumulative impact vs v0.5.0:

| Paper | intext F1 | matching acc |
|---|---|---|
| chen_2021_jesp | 0.740 → 0.760 (+0.020) | 0.719 → 0.752 (+0.033) |
| chan_feldman_2025_cogemo | 0.924 (no relevant patterns) | 0.312 (no change) |
| collabra_90203 | 0.915 → 0.927 (+0.012) | 0.788 → 0.815 (+0.027) |

Cumulative impact vs v0.3.1 (pre-iterate baseline, 14-cycle total):

| Paper | intext F1 | matching acc |
|---|---|---|
| chen | 0.673 → **0.760** (+0.087) | 0.549 → **0.752** (+0.203) |
| chan_feldman | 0.716 → **0.924** (+0.208) | 0.254 → 0.312 (+0.058) |
| collabra | 0.830 → **0.927** (+0.097) | 0.726 → **0.815** (+0.089) |

Tests: 22 suites / 267 tests pass (was 19 / 254). 3 new regression test files.

## 0.5.0

Multi-author detection extensions (citationguard-iterate cycles 12-14):

- **Cycle 12 — multi-author parenthetical with trailing et al.** APA 7
  "Author1, Author2, ..., et al., YEAR" disambiguator for same-year same-first-
  author refs. "(Bartoš, Maier, Wagenmakers, et al., 2022)" / "(Maier, Bartoš,
  et al., 2022)" now detected; added at top level + in multi-citation bundle
  split-handler. Regression test: `mixedListEtAlTrailing.test.ts`.

- **Cycle 13 — same as cycle 12, narrative form.** "Bartoš, Maier,
  Wagenmakers, et al. (2022)" — same shape, year in trailing parens. The
  `i` flag was deliberately omitted on these new patterns so the `[A-Z]`
  first-letter requirement isn't collapsed (the `\b` lookahead would otherwise
  start matches at lowercase words preceding the real author list).

- **Cycle 14 — signal-phrase prefix in single-citation parens.** Cycle 9
  stripped "e.g."/"i.e."/"cf."/"see"/"see also"/"as in"/"c.f." prefixes
  inside multi-citation `;`-bundles. Cycle 14 extends the same strip to
  single-citation parens — "(see Hoffrage & Pohl, 2003)", "(e.g., Lakens
  et al., 2018)", "(cf. Smith, 2020)" — by inlining an optional
  `SIGNAL_PREFIX` group after `\(` in `singleParenthetical`,
  `twoAuthorParenthetical`, and `etAlParenthetical`. Regression test:
  `signalPrefixSingleParen.test.ts`.

Cumulative impact vs v0.4.0 (cycles 7-11) baseline:

| Paper | intext F1 | matching acc |
|---|---|---|
| chen_2021_jesp | 0.730 → 0.740 (+0.010) | 0.693 → 0.719 (+0.026) |
| chan_feldman_2025_cogemo | 0.931 → 0.924 (-0.007 within ε) | 0.312 → 0.312 (0) |
| collabra_90203 | 0.862 → 0.915 (+0.053) | 0.767 → 0.788 (+0.021) |
| plos_med_1 / ieee_access_2 / nat_comms_2 | unchanged (no relevant patterns) | unchanged |

vs v0.3.1 (pre-iterate-cycle-7) baseline:

| Paper | intext F1 | matching acc |
|---|---|---|
| chen | 0.673 → 0.740 (+0.067) | 0.549 → 0.719 (+0.170) |
| chan_feldman | 0.716 → 0.924 (+0.208) | 0.254 → 0.312 (+0.058) |
| collabra | 0.830 → 0.915 (+0.085) | 0.726 → 0.788 (+0.062) |

Tests: 19 suites / 254 tests (was 18/250); 4 new regression test files.

## 0.4.0

This release is a cumulative hardening of `citationDetector`'s author-capture
patterns, shipped as one atomic version because the sub-fixes share constants
(`COMPOUND_SURNAME` / `SURNAME_LASTNAME` / `SURNAME_PARTICLE` /
`MONTH_NAMES`) and are not safely revertable in isolation.

Cycles shipped (citationguard-iterate cycles 7-11):

- **Cycle 7 — middle-particle prefix-leak.** Narrative + parenthetical
  patterns no longer accept arbitrary lowercase words between two capitalized
  words. Phrases like "Replication of Fischhoff (1975)", "Since the Fischhoff
  (1975)", "We chose Slovic (1977)", "We employed Diedenhofen and Musch
  (2015)" no longer mis-parse as authors. Middle is now restricted to a
  known surname-particle whitelist (van/von/de/der/del/della/di/du/la/le/da/
  dal/dei/dos/ten/ter/zu/zur/y/etc.). Regression test:
  `narrativeCitationPrefixLeak.test.ts`.

- **Cycle 8 — CamelCase surnames.** Every surname-capture in
  `citationDetector.ts` now admits one embedded uppercase letter, matching
  "McCullough" / "DeScioli" / "MacDonald" / "McKendrick" / "O'Connor". The
  reference parser got this fix in cycle 3
  (`vancouverMultiAuthorAndConnector`); cycle 8 ports it to every citation
  pattern (narrative, parenthetical, et al., Harvard no-comma, with-page,
  possessive, and/with colleagues). 25+ missed "McCullough et al. (1997)" /
  "(1998)" recovered in chan_feldman_2025_cogemo. Regression test:
  `camelCaseSurnameCitations.test.ts`.

- **Cycle 9 — multi-citation signal-prefix + CamelCase inside `()`.** The
  inline `^…$` anchored regexes in the `multipleCitations` split-handler
  also use the new SURNAME_LASTNAME / COMPOUND_SURNAME shapes (cycles 7-8
  ports), and the split now strips a leading signal phrase ("e.g.", "i.e.",
  "cf.", "see", "see also", "as in") from each citeText before matching, so
  "(e.g. Enright & Coyle, 1998; Strelan & Covic, 2006)" detects both. The
  single-citation paren with signal prefix (no `;`) is filed as a follow-up.
  Regression test: `multiCitationSignalPrefix.test.ts`.

- **Cycle 10 — multi-author parenthetical (3-6 authors).** APA 6 style
  "(Hoffrage, Hertwig, & Gigerenzer, 2000)" / "(Bosco, Aguinis, Field,
  Pierce, & Dalton, 2016)" / "(Wagenmakers, Wetzels, Borsboom, van der Maas,
  & Kievit, 2012)" now detected and classified as type='et_al'. Pattern
  added at top level AND inside the multi-citation bundle split handler.
  chen_2021_jesp matching accuracy 0.634 → 0.693 (+0.059). Regression test:
  `multiAuthorParenthetical.test.ts`.

- **Cycle 11 — month-name false positives.** "(January 2023)" / "(April
  2023)" date references (e.g. "At the time of writing (January 2023), ...")
  no longer mis-detected as `january|2023` / `april|2023` author citations.
  Filter via `isMonthName(captured-author)` on `singleParenthetical` and
  `singleParentheticalHarvardNoComma`. Regression test:
  `monthNameFalsePositive.test.ts`.

Cumulative impact (cycles 7-11 vs v0.3.1 baseline):

| Paper | intext F1 | matching acc |
|---|---|---|
| chen_2021_jesp | 0.673 → 0.730 (+0.057) | 0.549 → 0.693 (+0.144) |
| chan_feldman_2025_cogemo | 0.716 → 0.931 (+0.215) | 0.254 → 0.312 (+0.058) |
| collabra_90203 | 0.830 → 0.862 (+0.032) | 0.726 → 0.767 (+0.041) |
| plos_med_1 / ieee_access_2 / nat_comms_2 | unchanged (no relevant patterns) | unchanged |

No regression on any paper × capability (ε ≤ 0.005).

Detailed history below — kept for audit. The atomic citation-detector commit
that produced all five cycles' behavior is itself one git diff against
v0.3.1.

- citationDetector: harden author-capture across every narrative,
  parenthetical, Harvard-no-comma, with-page, possessive, and
  with/and-colleagues pattern. Two regex defects, both in the same
  `[A-Z][a-z]+(?:\s+[a-z]+\s+[A-Z]...)?` shape used for the surname:

  (i) **Middle-particle prefix-leak.** The bare `[a-z]+` middle (meant to
  support "Van der Berg" / "De la Cruz" compound surnames) accidentally
  accepted any lowercase word, so phrases like "Replication of Fischhoff
  (1975)", "Since the Fischhoff (1975) article", "We chose Slovic (1977)",
  and "We employed Diedenhofen and Musch (2015)" mis-parsed as inventive
  author names — simultaneously inventing spurious citations AND failing
  to detect the real ones. The middle is now restricted to a whitelist of
  known surname particles (van/von/de/der/del/della/di/du/la/le/da/dal/
  dei/dos/etc.). Regression test:
  `narrativeCitationPrefixLeak.test.ts`.

  (ii) **CamelCase surnames rejected.** The bare `[A-Z][a-z]+` lastname
  rejected the embedded "C" in "McCullough" / "DeScioli" / "MacDonald" /
  "McKendrick" / "O'Connor" / "von Hippel" — silently dropping 25+
  "McCullough et al. (1997)" / "(1998)" citations in
  chan_feldman_2025_cogemo, and similarly affecting any paper that cites
  a CamelCase author. The reference parser got this fix in cycle 3
  (`vancouverMultiAuthorAndConnector`); v0.4.0 ports the same
  `[A-Z][a-z]+(?:[A-Z][a-z]+)?` lastname shape to every citation-
  detector pattern. Two embedded caps still rejected so "FooBarBaz" /
  "SmithJonesBrown" cannot pass as a single surname. Regression test:
  `camelCaseSurnameCitations.test.ts`.

  Combined impact (citationguard-iterate cycles 7 & 8):
  - chan_feldman intext F1 0.716 → 0.908 (+0.192), unmatched_gold 57 → 15
  - chen intext F1 0.673 → 0.704 (+0.031); matching 0.549 → 0.595 (+0.046)
  - collabra intext F1 0.830 → 0.846 (+0.016); matching 0.726 → 0.747 (+0.021)
  - No regression elsewhere (ε ≤ 0.005 on every paper × capability).

## 0.3.1

- parseAPAReference title extraction: prefer `.` as the title terminator, falling
  back to `?`/`!` only when no period exists in the title section. Mid-title
  question marks (e.g. "Incident reporting: Science or protoscience? Ten years
  later.") no longer prematurely end the title. chen_2021_jesp references F1
  (strict) 0.921 → 0.931; collabra_90203 0.595 → 0.622; chan_feldman 0.342 →
  0.359; no regression elsewhere. citationguard-iterate cycle 5.

## 0.3.0

- citationStyleDetector: Vancouver vs AMA / Nature discriminator now requires
  Unicode-superscript dominance (the hard signal) rather than the combined
  `superscriptCount + plainDigitCount` proxy when `bracketCount >= 5`. The
  plain-digit "superscript" proxy is noisy on statistics-heavy papers, where
  decimal values, page numbers, and table-cell digits inflated past the real
  bracketed-citation count and pushed PLOS-style Vancouver papers into AMA.
  plos_med_1 now detects as vancouver (was ama); no regression on the existing
  ama/nature style-detector tests.
  citationguard-iterate cycle 4.

## 0.2.0

- Vancouver / IEEE reference parser: two-author connector ("Pommereau F and
  Gaucherel C") now splits into two authors instead of one combined lastName;
  year extraction is bounded to the plausible 1800–2099 range so IEEE
  article numbers (`no. 2233`), page numbers (`p. 8400`), and arXiv suffix
  digits (`arXiv:1209.3632`) cannot masquerade as the publication year.
  CamelCase surnames (McKendrick, MacDonald, DeScioli) are also recognised by
  `parseVancouverAuthor`. ieee_access_2 references F1 (strict) rose from
  0.676 → 0.919; no regression on covered APA / Harvard corpus papers.
  citationguard-iterate cycle 3.

## 0.1.1

- Fix APA / Harvard reference title extraction. A journal reference without an
  issue number (`Journal Name, 54, 569–579`) did not match the volume/issue
  pattern, so the title fell back to a search that returned the orphan period
  left by `(year).` — leaving the parsed title empty. A with-issue reference
  had the mirror bug: the title ran into the journal name. The title is now
  anchored on the first sentence-ending period after the year. Reference F1 on
  the citationguard-iterate seed corpus rose from 0.109 → 0.921
  (`chen_2021_jesp`) and 0.308 → 0.431 (`chan_feldman_2025_cogemo`).

## 0.1.0

- Initial extraction from the CitationGuard worker monolith.
