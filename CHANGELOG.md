# Changelog

## 0.7.53

A phantom reference was created from an ORPHANED EDITOR LIST — citationguard-iterate
cycle 7 (2026-06-30), amp_1, surfaced by the R-0177 Sonnet re-audit.

When docpluck injects a running-header page number mid reference-list, an edited-book
chapter can split into two entries: the real chapter ("Feldman, D. C. 2008. Building and
maintaining a strong editorial board. In Y. Baruch, … (Eds.), Opening the black box of
editorship: 68-74. London: Palgrave Macmillan.") and an orphaned tail that BEGINS with
the editor list and ends in the injected page-footer year ("Baruch, A. M. Konrad, …
(Eds.), Opening the black box of editorship: 68-74. London: Palgrave Macmillan. 2024").
citelink keyed the orphan as a phantom "Baruch (2024)" reference with an empty title.

Fix: `looksLikeOrphanedEditorList` rejects an entry with an empty title whose author
segment runs into "(Eds.)," with NO 4-digit publication year ahead of the editor list. A
real chapter always carries its year before the editors; a "." inside author initials
("A. M.") is not a sentence break, so the year — not a period scan — is the reliable
signal. Net on amp_1: references F1 (strict) 0.963 → 0.969 (the spurious Baruch reference
removed). Zero regression on the 10 other canary papers (byte-identical); no real
edited-book chapter was rejected.

## 0.7.52

A capitalized two-word particle surname ("Van Iddekinge") was truncated to its particle
("Van") in bare-year (AOM/ASA/Chicago) references — citationguard-iterate cycle 7
(2026-06-30), annals_2, surfaced by the R-0177 Sonnet audit.

`parseBareYearReference` chose its author sub-parser from `hasCommaInFirstAuthor` /
`hasNoCommaFullNames`, both of which tested `^[A-Z][a-z]+,` against the FIRST WORD. For
"Van Iddekinge, C. H., …" the first word "Van" is followed by a space (not a comma), so it
concluded "no comma in first author" and routed to the no-comma full-name parser — which
read "Van Iddekinge" as lastName="Van", firstName="Iddekinge", dropping the real surname.
The lowercase tussenvoegsel "van Aken" already parsed correctly (its first word starts
lowercase and never matched `^[A-Z]`); the capitalized "Van X" was the gap.

Fix: allow an optional capitalized-particle prefix (Van/Von/De/Della/Di/La/Mac/Mc/St/…) in
the comma-format detectors, so "[Particle] Surname, Initials" routes to the parser that
keeps the full surname. Net on annals_2: references F1 (strict) 0.936 → 0.947, matching
0.919 → 0.931 (the surname now keys correctly and its in-text mentions match). Zero
regression on the 9 other canary papers (byte-identical; only annals_2 carries a
capitalized particle surname).

## 0.7.51

AOM references concatenated on one line and separated by a literal `*` bullet marker
were not split — citelink lost every entry after the first (citationguard-iterate cycle 7,
2026-06-30, annals_2, surfaced by the R-0177 Sonnet audit).

docpluck's two-column AOM extraction preserves each entry's leading bullet as a literal
`*` BETWEEN concatenated references on the same line (`…13: 623-639. *Aguinis, H., &
Vandenberg, R. J. 2014. An ounce of prevention… *Aguinis, H., Werner, S., … 2010b. …`).
The `*` sits between the previous entry's terminal period and the next author, so
`splitConcatenatedAomReferences`' bare-year opener — whose lookahead expects an author
capital right after the whitespace — never fired, and the whole run stayed one block.

Fix: the `*` never occurs mid-word anywhere in the corpus (0 inline `\w\*\w` across every
fixture), so it is unambiguously a boundary artifact — drop a ` *` marker to a plain space
at the start of the splitter so the existing bare-year opener sees the real `Author Year.
Title` boundary. Net on annals_2: references F1 (strict) **0.684 → 0.936** (matched
160/172, was ~109), citation→reference matching **0.630 → 0.919** — ~50 references
recovered. Zero regression on the 9 other canary papers (byte-identical; only annals_2
carries `*` markers). The residual annals_2 field-mismatches are runner same-author-year
pairing artifacts (4 Aguinis 2014 siblings) + filed gold/docpluck issues, not citelink.

## 0.7.50

APA-path reference TITLE came out EMPTY when the year was resolved via a fallback
rather than the parenthesized `(YYYY)` — citationguard-iterate cycle 7 (2026-06-30),
amp_1 Diamond + annals_2 Grand, surfaced by the R-0177 Sonnet audit.

`parseAPAReference` gates BOTH author and title extraction on `yearMatch.index`, where
`yearMatch` is the parenthesized-year match. Two real reference shapes resolve the year
only through a fallback, leaving `yearMatch` null and the title empty:
- **comma-before-year (Jr. suffix):** `Diamond, A. M., Jr., 1986. What is a citation
  worth? …` — the bare-year fallback set `ref.year` but not `yearMatch`.
- **"in press":** `Grand, … in press. A systems-based approach to fostering robust
  science…` — the in-press fallback set `ref.year='in press'` but not `yearMatch`.

Fix: when the year is resolved through either fallback, synthesize a `yearMatch` anchored
at the END of the year / "in press" token so `afterYear` (the title section) and the
author section resolve. Net: amp_1 references F1 (strict) 0.951 → 0.963 (field_mismatches
3 → 2), annals_2 0.676 → 0.684 (6), zero corpus regression, in-text + matching
byte-identical. (A title that genuinely ends in `?` followed by a journal still runs into
the journal — the documented `.`-first terminator trade-off in
`apaTitleQuestionMarkBoundary`, which protects interior-`?` titles like "Science or
protoscience? Ten years later." — so Diamond's title is asserted by prefix.)

## 0.7.49

AOM bare-year reference TITLE truncation on amp_1 + annals_2, surfaced by the R-0177
Sonnet canary audit (citationguard-iterate cycle 7, 2026-06-30). The bare-year parser
(`parseBareYearReference`, used for AOM / ASA / Chicago author-date) had a primitive
title extractor that the APA path had already outgrown, truncating real titles in two
shapes:

**Quoted-phrase + subtitle drop.** `"An A is an A": The new bottom line for valuing
academic research.` — AOM/ASA titles are not fully quoted; only a phrase may be quoted.
The old `^"(.+?)"` rule grabbed only the quoted span `An A is an A` and discarded the
post-colon subtitle. (amp_1: Aguinis 2020, Rasheed 2020.)

**Single-word / Retraction-prefix truncation.** `Retraction. Externally commercializing
technology assets: An examination of different process stages.` — the old `indexOf('.')`
stopped at the first period, truncating the title to the lone word `Retraction`. (annals_2:
Hunton, Lichtenthaler, Min, Stapel, Walumbwa retraction notices.)

Fix: `extractTitleFromAfterYear` ports the APA-path title logic (first sentence-ending
period anchor + single-word / roman-numeral / volume-prefix re-anchors, with the
≥3-lowercase-word continuation guard) to the bare-year path, and only treats a leading
quote as the whole title when the closing quote is immediately followed by a sentence
boundary. Net: amp_1 references F1 (strict) 0.926 → 0.951 (field_mismatches 5 → 3),
annals_2 0.633 → 0.676 (field_mismatches 13 → 7), zero corpus regression on the 9 other
canary papers (byte-identical), in-text detection + matching byte-identical. The APA path
is untouched (the fix is a scoped addition to the bare-year parser only).

## 0.7.48

Two IEEE reference-parsing defects on ieee_access_2, surfaced by the R-0177 Sonnet
canary audit run against the CURRENT docpluck v2.4.98 fixture (citationguard-iterate
cycle 6, 2026-06-29). Both were hidden until the fixture was regenerated to the
installed docpluck — the older fixture carried a pymupdf-order author string that
masked them; production feeds docpluck/pdftotext, which exposes them.

**Single-initial IEEE authors mis-detected the style as Vancouver.** `hasIEEEAuthors`
required at least TWO initials (`J. A. Smith`), so a bracketed single-initial author
`[1] W. Yang` produced zero IEEE signal and the numeric-paradigm branch fell through to
`vancouver`. The surname-first Vancouver parser then kept the initials-first author whole
(`firstAuthorLastName = "W. Yang"` instead of `"Yang"`), so every reference keyed on
`w yang` and failed to pair with the gold's `Yang`. Fix: make the additional initials
optional (`[A-Z]\.\s*(?:[A-Z]\.\s*)*[A-Z][a-z]`), so a `[N] Initial. Surname` opener with
one OR more initials reads as IEEE — which routes `parseIEEEReference`, extracting `Yang`.
Net: references F1 (strict) 0.000 → 0.706, style false → true (ieee), matching 0.000 →
0.453, zero corpus regression.

**A bracket-numbered reference was truncated at an internal journal-name period,
dropping its year.** The Kermack & McKendrick reference [22], whose journal is
"Proceedings of the royal society of london. Series A, …", carries a period inside the
journal name. Step 1c's inline concatenation-splitter read "london. Series" as a sentence
end and "Series A, …" as a "Surname A," reference start (with a year within 300 chars),
so it FALSE-split the single entry at its journal name — orphaning "…Series A, … pp.
700-721, 1927." and leaving `ref.year` empty. Fix: for a block that carries a `[N]`
bracket marker, only split where a real `[N]` marker begins — an internal sentence period
is never a numeric-reference boundary. (Bare-numbered Vancouver run-ons with no brackets
still split on the author pattern, unchanged.) Net: Kermack [22] year `""` → `1927`.

+5 regression tests against real ieee_access_2 extraction text. Full suite 484 green.
Sonnet re-audit of ieee_access_2 returned PASS (0 citelink defects remain); the residual
sub-1.0 scores are filed gold defects (book-ref `title_start` = publisher; 4 wrong years)
and upstream docpluck losses (3 refs absent from the extracted text), not citelink.

## 0.7.47

Harvard reference orphan-split at a title phrase, surfaced by the R-0177 Sonnet
canary audit of bjps_1 (citationguard-iterate 2026-06-26).

**A Harvard title whose leading words read as "Surname, Firstname" was mistaken
for a new reference start (bjps_1 Baccini/Sattler + Foster/Frieden).** The
APA-oriented step-1c inline splitter validated "Austerity, Economic Vulnerability,
and Populism;" / "Compensation, Austerity, and Populism;" (the entries' TITLES) as
"Surname, Firstname" openers — a year sat later in the entry (the SSRN URL) and
satisfied the "year within 300 chars" guard — so it FALSE-split each single
reference at its title, orphaning "Baccini (2021)" / "Foster (2019)" with an empty
title plus a phantom author-less "Austerity ()" / "Compensation (2019)". Fix: for
Harvard-family styles, require a parenthetical "(year)" near the candidate start
(the Harvard author→year shape) — a title phrase lacks it, every real Harvard
opener has it.

Net (bjps_1): refs F1 0.927 → 0.945 (2 phantom orphan refs removed, N 111→109).
+5 regression tests (real docpluck-v2.4.98 text). Zero corpus regression (479
tests green). Remaining bjps title-drift is two gold transcription errors (SSRN
abstract number, GLO publisher word order — filed to article-finder, not citelink).

## 0.7.46

URL-as-title on an organizational website reference, surfaced by the R-0177 Sonnet
canary audit of nat_comms_2 (citationguard-iterate 2026-06-26).

**A website reference's URL was parsed into the `title` field (nat_comms_2 #47).**
"ISARIC4C Comprehensive Clinical Characterisation Collaboration Website.
https://isaric4c.net." has no separate work title, so the title extractor latched
the URL ("https://isaric4c") into `title` — title-drift against the gold (whose
title is the org-name "…Website." text before the URL). Fix: a `repairUrlOnlyTitle`
post-parse pass detects a URL/DOI-only title and reconstructs it from the raw
reference text up to the URL (dropping a leading list number), leaving the URL in
`ref.url`. No-op unless the title is URL-only.

Net (nat_comms_2): refs F1 0.966 → 0.983 (1 title-drift cleared). +5 regression
tests (real docpluck-v2.4.98 text). Zero corpus regression (474 tests green).

## 0.7.45

Organizational-author reference defects surfaced by the R-0177 Sonnet canary audit
of xiao_2021_crsp (citationguard-iterate 2026-06-26) — hidden behind a 0.980 refs
F1 the gate read as clean. Two org entries were concatenated mid-line onto the
PREVIOUS reference (docpluck academic flows them after the prior entry's
publisher/DOI with only a space):

**Org name with a non-whitelisted head word dropped its head ("Open Science
Collaboration" → "Science Collaboration").** The `organizationAuthor` extractor only
recognized orgs STARTING with a fixed institutional word (World/American/Royal/…),
so "Open Science Collaboration. (2015)." keyed the author on the tail and dropped
"Open" (and the concat splitter produced a spurious "Science Collaboration" entry
because the multi-word org yields a nested opener at every internal suffix word —
both pointing at the same "(year)"). Fix: (a) a suffix-keyword branch in
`organizationAuthor` captures an arbitrary capitalized leading run ending in an
org-suffix word (Collaboration/Research/Consortium/…); (b) the concat splitter
rejects a nested opener that opens the SAME "(year)" as the previous boundary, so
only the leftmost full-name opener splits.

**Org name ending in a parenthetical acronym was swallowed whole ("Collaborative
Open-science REsearch (CORE). (2020)").** The name ends in "(CORE)." rather than a
suffix word, so the splitter's suffix-anchored opener missed it and the entry was
lost into the previous Cohen (1988) reference — 73 refs vs 74 gold. Fix: a
parenthetical-acronym org opener ("<Capitalized run> (ACRONYM). (year)"), whose
leading run does not cross a ". " sentence boundary so it starts at the org head
word, not the previous reference's publisher.

Net (xiao_2021_crsp): refs F1 0.980 → 1.000 (CORE recovered, "Open" kept), matching
accuracy 0.969 → 0.988 (openscie|2015 wrong-target cleared). +5 regression tests
(real docpluck-v2.4.98 extraction text). Zero corpus regression (469 tests green).

## 0.7.44

Two more reference-parsing defects surfaced by the R-0177 Sonnet canary audits of
ieee_access_2 and chan_feldman (citationguard-iterate 2026-06-25) — both hidden
behind high F1 (0.986 / 0.983) the gate read as clean.

**PMC running-header parsed as a fabricated reference (ieee_access_2).** PMC-hosted
PDFs stamp "<Journal>. Author manuscript; available in PMC <date>." on every page;
docpluck preserves it. The parser took "<Journal>" as an org author and the PMC
year as the year, emitting a reference that does not exist — ieee_access_2 parsed
37 references vs the gold's 36 (the extra: "IEEE Access. Author manuscript;
available in PMC 2026 February 25."). Fix: reject any candidate matching the PMC
boilerplate signature ("author manuscript … available in PMC"), alongside the
existing author-bio rejection.

**Concatenated ORG reference with no period after the year was mis-split
(chan_feldman).** "…Improving experimental design and statistical analysis. Open
Science Collaboration. (2015) Estimating the reproducibility…" — the OSC entry,
glued onto an Olkin book chapter with no period after "(2015)" (docpluck dropped
it), did not fire the concat opener (which required the year-paren to be followed
by "." / ","), so the splitter split at the Olkin chapter's editor and keyed the
second entry's author as "In J. C. Stanley (Ed.)" — Open Science Collaboration was
lost. Fix: the narrow ORG / acronym-org concat openers may also open when the
year-paren is followed by a space + capital; the high-frequency personal opener
keeps the strict "." / "," closer.

- **ieee_access_2: references F1 0.986 → 1.000** (PMC phantom removed).
  **chan_feldman: references F1 0.983 → 0.995, matching 0.973 → 0.980** (OSC
  recovered and its citation now matches). Zero regression across the full 13-paper
  corpus. +5 regression tests (`tests/pmcManuscriptHeaderRejection.test.ts`,
  `tests/apaOrgConcatNoPeriodAfterYear.test.ts`).

## 0.7.43

Concatenated acronym-colon ORG reference not split, surfaced by the R-0177 Sonnet
RE-audit of chen (citationguard-iterate 2026-06-25) after the v0.7.41/42 fixes.
chen: "Sowden, W. (2018). … 1(4), 443-490. KNAW: Royal Dutch Academy of Arts and
Sciences. (2018). Replication studies: …" parsed as ONE reference (Sowden) —
the KNAW 2018 entry was swallowed. `splitConcatenatedApaReferences` recognized
personal-author openers and "…Team/Society/Collaboration" org openers, but not an
acronym-colon org author ("KNAW: <Org Name>."), whose spelled-out name does not
end in an org-suffix word.

Fix: add an `acronymOrgAuthor` opener alternative ("[A-Z]{2,}: <CapName>.") to the
splitter, mirroring how `parseAPAReference`'s acronymOrg branch already keys such
an author on the acronym. The boundary's existing endsClean / URL guards decide
whether to split, so clean references are unaffected.

- **chen: references F1 → 1.000** (KNAW 2018 recovered as its own entry). Zero
  regression across the full 13-paper corpus (every other paper byte-identical).
  +2 regression tests (`tests/apaAcronymOrgConcatSplit.test.ts`).

## 0.7.42

In-text detection miss surfaced by the R-0177 Sonnet canary audit of chen
(citationguard-iterate 2026-06-25). A "(also) see <prose> in <Citation>" lead-in
on a member of a ";"-bundle defeated detection: chen
"(Fischhoff, 2007, p. 11; also see interview in Klein, Hegarty, & Fischhoff,
2017)" detected only Fischhoff 2007. The bundle splitter splits on ";" and the
2nd fragment began "also see interview in Klein…"; the existing signal-prefix
strip handled "see (also)" but not the "interview in" tail, so the $-anchored
fragment matchers never reached "Klein" and the 3-author citation was an
INTEXT-DETECTION-MISS (and a downstream matching miss).

Fix: add a "(also )?see <short prose ≤30ch> in" alternative to BOTH the
module-level `SIGNAL_PREFIX` and the independent bundle-fragment strip inside the
`multipleCitations` loop (the two copies must stay in sync). Bounded to keep the
false-positive surface small.

- **chen: in-text F1 0.981 → 0.983** (Klein, Hegarty, & Fischhoff 2017 recovered).
  Zero regression across the full 13-paper corpus (every other paper
  byte-identical). +3 regression tests (`tests/bundleSeeProseInLeadIn.test.ts`).

## 0.7.41

Two APA reference-parsing defects surfaced by the R-0177 Sonnet canary audit of
chen (citationguard-iterate 2026-06-25) — the F1 gate scored chen PASS (refs.f1
0.966) while these sat in the `field_mismatches` / `wrong_target` diagnostic
arrays unread. Both are general, structural fixes; neither is keyed on a paper.

**Title truncated to a lone first word.** The title terminator anchors on the
first "period + space", so a title that legitimately begins with a one-word
fragment ending in a period — a product/site name with an internal period
("TurkPrime. Com: …", "Prolific. Ac--…"), an editorial prefix ("Retraction.
Effects of…"), or an odd leading clause ("Psychology. Estimating the
reproducibility…") — was cut to just "TurkPrime." / "Psychology." / "Retraction.".
Fix: when the first sentence is a single word ending in a period, re-anchor to the
NEXT sentence period, but ONLY when the continuation is genuine title prose (≥3
lowercase words) — so a real one-word title followed by a journal or a
Place: Publisher ("Leadership. New York: Harper & Row.", "Forgiveness. Annual
Review…") is left intact and the source/publisher is never absorbed into the
title. Mirrors the existing roman-numeral / "Pt./Vol." prefix guard.

**Dutch contracted particle "van't" dropped from the surname.** "van't Veer, A. E.,
& Giner-Sorolla, R. (2016)." keyed first_author = "Veer" — the surname-extraction
particle alternation matched only "[Vv]an" then required whitespace, which the
apostrophe broke. Both in-text "(van't Veer & Giner-Sorolla, 2016)" citations then
matched the WRONG reference. Fix: admit `[Vv]an(?:'[ts])?` and a bare "'t"/"'s" in
the particle alternation + NAME_PARTICLES, so "van't" / "van's" / "'t Hart" are
kept with the surname. Plain particles ("van Raan", "von …") are unaffected.

- **chen: references F1 0.966 → 0.995, matching 0.942 → 0.950** (both van't Veer
  citations now resolve correctly). Zero regression across the full 13-paper
  corpus (every other paper byte-identical). +7 regression tests
  (`tests/apaSingleWordTitleSentenceExtend.test.ts`,
  `tests/dutchContractedParticleVant.test.ts`).

## 0.7.40

APA-7 ellipsis author list defeated the concatenated-reference splitter
(citationguard-iterate 2026-06-25, chen — TC-6). APA 7 truncates a 21+ author
reference as "first 19, …, final author": "Munafò, M. R., Nosek, B. A., …,
Ioannidis, J. P. (2017).". The concatenation splitter's `personalList` was a
comma-joined run of "Surname, Initials" with no ellipsis connector, so it stopped
at the "…", the opener never reached "(2017)", and the entry was swallowed into
the previous reference (chen: Munafò 2017 lost into Müller 2007, so a
"(Munafò et al., 2017)" citation had no reference to match).

Fix: allow the "…" glyph (optionally comma-flanked) as an author-list connector
before the final author. Matched as the U+2026 glyph only — docpluck emits the
real glyph for APA-7 truncation (verified across the corpus); a literal "..."
three-dot form is ambiguous with sentence punctuation and would over-split.

- **chen: references F1 0.961 → 0.966.** Zero regression on all 11 other corpus
  papers (every APA-heavy paper that relies on the splitter is byte-identical).
  +3 regression tests (`tests/apaEllipsisAuthorListSplit.test.ts`).

## 0.7.39

et-al in-text citations failed to match an et-al REFERENCE (citationguard-iterate
2026-06-25, bjps_1 — TC-5). Harvard / Vancouver / AOM reference lists frequently
abbreviate a 3+ author entry as "Sides J et al. (2019)", so `parseReferences`
reports authorCount=1 for it. The et-al matcher required
`reference.authorCount >= 3` and otherwise returned a 0.2 author score; combined
with an exact year that landed at confidence 0.396 — BELOW the 0.4 suggested-match
threshold — so a CORRECT match ("Sides et al. 2019" → "Sides J et al. (2019)")
was dropped as no_match. On bjps_1, 49 of 102 citations were rejected this way.

Fix: a reference whose raw text contains "et al." is itself a truncated 3+ author
list (never abbreviated for 1-2 authors), so the <3 penalty must not apply to it.
Keyed on "et al." in the reference raw — a genuine solo-author reference (no "et
al.") still correctly rejects an et-al citation, so no false matches are added.

- **bjps_1: matching 0.622 → 0.945.** Zero regression on all 11 other corpus
  papers (no false matches introduced anywhere). +2 regression tests
  (`tests/etAlReferenceMatching.test.ts`), incl. a solo-author no-over-match guard.

## 0.7.38

AOM / Chicago **colon page-locator** dropped the first citation of a
multi-citation parenthetical (citationguard-iterate 2026-06-25, amp_1 — TC-4).
AOM and Chicago note-style write a page locator after the year as ": page"
("Bedeian, Van Fleet & Hyman, 2009a: 211"), not the APA ", p. page". The
multi-citation bundle handler splits on ";" then runs $-anchored fragment
matchers that expect the year at the END of the fragment; the existing strip
removed only the APA ", p. 211" form, so the colon-form "2009a: 211" suffix
survived and the FIRST citation was dropped:

- "(Bedeian, Van Fleet & Hyman, 2009a: 211; Honig et al. 2014)" detected only
  Honig 2014, losing Bedeian 2009a.

Fix: strip a trailing colon page locator ("year: page" / "year: 88-90") from a
bundle fragment, guarded to fire only when a 4-digit year (optional letter
suffix) immediately precedes the colon — so "ACRONYM: Name" / "Author: Title"
openers are untouched.

- **amp_1: matching 0.900 → 0.909, in-text F1 0.921 → 0.926.** Zero regression on
  all 11 other corpus papers. +5 regression tests
  (`tests/aomColonPageLocatorBundle.test.ts`), incl. an institutional
  "KNAW: …, 2018" no-false-collapse guard.

## 0.7.37

AOM (Academy of Management) bare-year run-on references swallowed concatenated
entries (citationguard-iterate 2026-06-25, amp_1 — TC-1 / TC-2). AOM writes the
author list with a comma + period-initials exactly like APA ("Egghe, L. 2006.")
but the year is a **bare** "2006." — never the parenthesized "(2006)." that BOTH
the APA and Harvard concatenation splitters require. So when docpluck flows two
AOM entries onto one line ("Egghe, L. 2006. … 131-152. Elsevier. 2016. CiteScore
… Elsevier. 2021. …"), neither splitter fired and the 2nd+ entries were swallowed
into the first:

- amp_1 → the two `Elsevier. 2016/2021.` org-authored references (TC-1) and the
  `van Raan, A. F. 2006.` particle-surname reference (TC-2) were lost.

Fix: `splitConcatenatedAomReferences`, an **AOM-only** bare-year sibling of the
APA/Harvard splitters, with the identical boundary guards (only split where the
previous reference ends clean `.`/`)`/digit or in a trailing URL, never inside an
author list) plus a particle-orphan guard so a split after a URL-terminated entry
keeps `van Raan` intact (it was being mis-keyed to `Raan`). Blast radius is zero
on every other style — the multi-entry-per-line pattern occurs only in AOM
fixtures (measured across the full citationguard corpus).

- **amp_1: references F1 0.906 → 0.926, matching 0.873 → 0.900.** Zero regression
  on all 12 other corpus papers (non-AOM byte-identical). +5 regression tests on
  real amp_1 text (`tests/aomConcatenatedReferences.test.ts`).

## 0.7.36

Author-bio lines parsed as fabricated references (citationguard-iterate cycle 6, AOM
journals, 2026-06-21). Journals print an "About the authors" block after the reference
list; when a bio line carries a year, `parseReferences` harvested the author name + the
stray year and emitted a reference that does not exist — an academic-integrity defect.
citelink already stripped bios in `extractReferenceSection` end-patterns, but only in the
INITIALS form (`"Herman A. (email) is…"`); the FULL-surname form slipped through:

- annals_2 → `"Herman Aguinis (haguinis@gwu.edu) is the Avram Tucker Distinguished
  Scholar…"` (parsed as ref #102); amp_1 → `"Jose R. Beltran (https://…) is an assistant
  professor…"` (ref #79).
- `referenceParser.ts`: new `looksLikeAuthorBio()` rejects any parsed reference whose raw
  reads as a bio — keyed on the structural signature (a contact paren `(@/URL)` + a
  biographical verb, or `"<Name> is a/an/the <role>"` with no comma after the surname),
  never on paper identity. Wired into the primary AND fallback validation filters.
- Effect: annals_2 102→101 refs, amp_1 79→78 (exactly the 2 bios removed); a whole-corpus
  before/after diff over 14 fixtures shows all 12 other papers byte-identical (zero
  false-positive surface).
- Regression test `tests/authorBioReferenceRejection.test.ts` (real annals_2/amp_1 bio
  text, email + URL forms; fail-before/pass-after; a "role word in a title" negative
  control asserts no over-rejection).

## 0.7.35

Numeric parenthetical-`(N)` enumeration false-positives (citationguard-iterate cycle 5,
sci_rep_3 `10.1038/s41598-023-50401-z`, 2026-06-20). The parenthetical-numeric branch
(active when a paper has <3 bracket citations) treated body **list enumerations** as
in-text citations — a Nature/superscript paper's inclusion/exclusion-criteria items
`"…as follows: (1) survival … ; (2) unknown race … ; (4) unknown site …"` were emitted
as 7 spurious citations (in-text F1 0.885).

- `detectNumericCitations`: skip a parenthetical `(N)` whose immediately-preceding
  non-space char is a list-introducer (`:` or `;`) AND which is followed by a lowercase
  clause. A real numeric citation is never introduced by `:`/`;` + a lowercase word.
  Keyed on the structural enumeration signature, not on any paper.
- Effect: sci_rep_3 in-text F1 0.885 → 0.948 (7 spurious → 0); no change on the other
  numeric corpus papers (nat_comms_2, plos_med_1, ieee_access_2 byte-identical).
- Regression test `tests/numericEnumerationFpGuard.test.ts` (real sci_rep_3 enumeration
  text; positive controls assert no over-skip of genuine parenthetical citations).

## 0.7.34

APA bundle member with a multi-word `for <prose> see` lead-in (citationguard-iterate
APA-ORG-AUTHOR cycle 6, xiao_2021, 2026-06-17). The signal-prefix strip handled only
the narrow `for [a] review(s) see` form, so a bundle whose first member was prefixed
by arbitrary review/criticism prose — `(for criticisms of the challenge, see Huber et
al., 2014; …)`, `(for recent reviews, see Gaudeul & Crosetto, 2019; …)` — dropped the
first cited work (Huber / Gaudeul).

- Generalized the `for <prose> see` lead-in in both `SIGNAL_PREFIX` (standalone
  patterns) and the `;`-bundle fragment strip to `for [^,;()]{0,40}? ,? see` — bounded
  to 40 non-comma/semicolon/paren chars so the false-positive surface stays small. A
  trailing `for <prose>` after an already-detected citation is untouched.
- Verified against a freshly-regenerated xiao_2021 gold (article-finder, intext 110→163,
  reference-list and year errors corrected): xiao intext.f1 0.958→0.964, Huber/Gaudeul
  lead-in cites recovered. Zero regression on the 8 other canary papers; tay_2020 stays
  at a perfect 1.000. New real-text tests in `apaBundleTrailingProse.test.ts`.

## 0.7.33

APA `;`-bundle member with a trailing prose note (citationguard-iterate
APA-ORG-AUTHOR cycle 5, xiao_2021, 2026-06-17). The semicolon-bundle splitter owns
`;`-delimited parentheticals and its per-fragment matchers are `$`-anchored right after
the year, so a bundle whose LAST member trails into prose —
`(...; Król & Król, 2019 for attempts to explain the replication failures)` — failed
every fragment matcher and the citation was dropped (the prose-bundled fallback pass
skips `;`-bundles, so it could not recover it either).

- Strip a trailing prose note that follows the year on a bundle fragment, but ONLY when
  the year is followed by whitespace + a LOWERCASE word — a real following citation starts
  with an uppercase surname (same heuristic as the existing leading `and`/`in` strip), and
  a year suffix (`2020a`) has no space so it is untouched.
- xiao_2021 `krol|2019` recovered (intext.f1 0.9496 → 0.9527). Zero regression on all 8
  other canary papers (clean-rebuild detection-set baseline diff byte-identical). New
  real-text tests in `apaBundleTrailingProse.test.ts`.

## 0.7.32

APA organizational / multi-word in-text author detection (citationguard-iterate
APA-ORG-AUTHOR cycle 4, tay_2020 + xiao_2021, 2026-06-17). The APA citation detector
captured authors via `COMPOUND_SURNAME` (a single surname optionally extended by a
WHITELISTED particle), so a run of 2+ plain capitalized tokens fell through: standalone
`(R Core Team, 2019)` mis-keyed to `team`, `(Open Science Collaboration, 2015)` to
`collaboration`, and inside a `;`-bundle the org member was dropped entirely. A hyphenated
group-with-abbrev `(Collaborative Open-science REsearch [CORE], 2020)` was missed because
`groupWithAbbrev`'s name class excluded the hyphen.

- Added an `ORG_AUTHOR` fragment (2-6 whitespace-joined capitalized tokens, NO lowercase
  connective) consumed by a new standalone `orgMultiWordParenthetical` pattern and a
  bundle-fragment fallback, keyed on the FULL organization name. An `orgLeadAllowed`
  leading-token prose guard keeps `(See Smith, 2020)` and a lowercase-`and` two-author
  form from being swallowed.
- Widened `groupWithAbbrev`'s name class to admit hyphen / apostrophe / period, and added
  a `bracketAbbrevFrag` handler so a `Name [ABBR], year` org parses as a `;`-bundle member.
- tay_2020 intext.f1 0.957 → 0.989, matching 0.957 → 1.000 (`team` mis-key removed,
  `r core team` + `open science collaboration` recovered). The fix generalized: chan +1,
  xiao +4 real org detections, both f1 gains. Zero over-capture, zero regression on the 6
  other canary papers (clean-rebuild detection-set baseline diff byte-identical). New
  real-text tests in `apaOrgMultiWordAuthor.test.ts`.

## 0.7.31

Harvard in-text possessive narrative + capitalized lead-in (citationguard-iterate H2-D
cycle 3, bjps_1, 2026-06-15) — `According to Barr's (2009, 44)` was detected as NOTHING:
the surname infix matched ANY lowercase word, so `According to Barr's` was captured as one
span starting at the capitalized lead-in `According`, which `COMMON_WORDS` then dropped —
losing the real citation. (The same absorption mis-keyed `According to Smith and Jones
(2020)` onto `According to Smith` in `narrativeTwo`, which has no such guard.) And even in
isolation `Barr's (2009)` keyed on `barr's` (possessive kept), matching neither the gold
key `barr` nor the reference.

- Restricted the lowercase surname infix from `[a-z]+` to a nobiliary-particle WHITELIST
  (`LC_PARTICLE` = van/von/de/del/…), so a lead-in connector (`to`/`of`) is no longer a
  valid infix and the matcher re-anchors on the real surname.
- `createAuthor` strips a trailing possessive (`Barr's` / `Jones'`, straight or curly
  apostrophe) so the in-text surname keys on the bare name.
- bjps_1 intext.f1 0.870 → 0.874, matching.accuracy 0.703 → 0.711; `barr|2009` recovered,
  **unmatched_gold 1 → 0** (every in-text citation the gold contains is now detected and
  matched). Zero new extra_pred. Zero regression on the 6 APA/numeric canary papers
  (clean-rebuild detection-set baseline diff byte-identical). 4 new real-text tests in
  `tests/harvardPossessiveNarrative.test.ts`; full suite 411 passed. npm republish +
  monorepo repin are a separate user-gated Tier-3 step.

## 0.7.30

Harvard in-text surname left-boundary under-capture (citationguard-iterate H2 cycle 2,
bjps_1, 2026-06-15) — the shared surname sub-pattern only spanned a multi-token surname
joined by a *lowercase* particle (`Smith van Berg`), so three real surname shapes fell
through to the LAST token and keyed the citation on the wrong author (matching neither the
gold nor its reference): a capitalized particle (`El Soufi`, `Van Staalduinen`), a bare
double surname (`Santos Silva`), and a hyphen-cap compound (`Rhodes-Purdy`).

- Factored the matchers onto shared, composed regex fragments (`CORE` / `CAP_PARTICLE` /
  `SURNAME` / `NAME_RUN` / `SEP` / `YEAR` / `PAGE`) built with `new RegExp` (DRY — the
  surname fragment previously repeated ~11×). `CORE` adds a hyphen-cap compound group
  (`Rhodes-Purdy`); `SURNAME` admits an optional *whitelisted* capitalized particle
  (`El`/`Van`/`Santos`/`De`…) so a leading capitalized sentence word is NOT absorbed
  (`As Smith and Jones` keeps first author `Smith`, not `As Smith`).
- `SEP` restricts inter-token whitespace to a single line break, so a multi-token surname
  no longer crosses a blank line. This anchors the span at the flattened-table boundary and
  resolves the H2-C **table-heading over-capture** as a coupled side-effect: column
  headings (`Import exposure` / `Regression discontinuity` / `Survey experiment`) stacked a
  blank line above a citation no longer glue onto it.
- `NAME_RUN` joins author runs on `and`/`&` only, so the single-author matcher swallows a
  two-/three-author span and position-dedupes the contained second surname (no spurious
  `Silva` single beside `Barros and Santos Silva`).
- bjps_1 intext.f1 0.838 → 0.870, matching.accuracy 0.672 → 0.703; 4 recovered
  (`El Soufi`/`Barros`/`Rhodes-Purdy`/`Kurer`), unmatched_gold 5 → 1 (only the H2-D
  possessive `Barr's` remains), all table-heading glues gone, extra_pred 38 → 36. Zero
  regression on the 6 APA/numeric canary papers (full clean-rebuild detection-set baseline
  diff byte-identical). 6 new real-text tests in `tests/harvardSurnameLeftBoundary.test.ts`;
  full suite 407 passed / 0 failed. The npm republish + monorepo repin are a separate
  user-gated Tier-3 step.

## 0.7.29

Harvard in-text page-locator detection (citationguard-iterate H2 cycle 1, bjps_1,
2026-06-15) — every Harvard parenthetical + narrative pattern anchored the year as
`(\d{4})\)` (closing paren immediately after the year), and the one page-aware pattern
(`singleWithPage`) required a `p.`/`pp.` prefix AND was single-author only. So any Harvard
citation carrying a *bare* page locator was missed entirely (DETECTION): `(Hacker et al.
2014, S5)`, `(Western et al. 2012, 342)`, `(Stanley and Doucouliagos 2012, 43-5)`,
`Mughan and Lacy (2002, 513)`, `Berman (2021, 75-6)`.

- Added an optional, non-capturing trailing-page-locator fragment
  (`, [p.|pp.] [S]NNN[-NN]`) to the parenthetical, narrative, and `;`-bundle matchers in
  `harvardCitationDetector.ts` (one structural signature, applied consistently).
- Added `according` to `COMMON_WORDS` to guard the narrative prefix-leak the page
  tolerance exposes (`According to Barr's (2009, 44)` mis-keying to `according`).
- bjps_1 intext.f1 0.774 → 0.838, matching.accuracy 0.594 → 0.672 (16 of 22 detection
  misses recovered; wrong_target 0). Zero regression on the 6 APA/numeric canary papers
  (full clean-rebuild detection-set baseline diff identical). 7 new real-text tests in
  `tests/harvardPageLocatorCitations.test.ts`; full suite 401 passed / 0 failed. The npm
  republish + monorepo repin are a separate user-gated Tier-3 step.

## 0.7.28

Cross-project lesson transfer **R-0001** (docpluck => citelink, 2026-06-15) — fold the full
Latin typographic ligature block U+FB00–U+FB06 (ﬀﬁﬂﬃﬄﬅﬆ) in the citation-matching gates
(NORMALIZATION). pdftotext preserves these presentation-form glyphs verbatim, so a reference
printed "conﬁdent" / "inﬂuence" failed to match its citation. `normalizeText`
(citationDetector.ts) and `normalizeName` (referenceParser.ts) used NFD, which does NOT
decompose these compatibility ligatures; an NFKC pass would yield "ſt" (non-ASCII LONG S) for
U+FB05, so an explicit ASCII map is used instead.

- New shared `decomposeLigatures()` helper (exported from `citationDetector.ts`) with an
  explicit ASCII map ported from docpluck's `normalize.py::decompose_ligatures`; used by BOTH
  matching gates (single-shared-helper design). Full suite 394 passed / 0 failed; 5 new tests
  in `tests/ligatureNormalization.test.ts`. Version bump + npm republish are a separate
  release step (not done in this change).

## 0.7.27

Citationguard-iterate **2026-06-12** — Harvard run-on reference-list support (REFERENCE-PARSING).
Onboarding the Harvard canary `bjps_1` (DOI 10.1017/S0007123424000024, "The Populist Backlash
Against Globalization") surfaced a complete failure to parse Harvard reference lists from the
production substrate: refs.f1 **0.051 → 0.972**, references parsed **9 → 109 of 109**, matching
0.023 → 0.594; **zero regression** on all six APA/numeric canary papers (the changes are gated to
Harvard-family author-year styles).

- **Concatenated-Harvard reference splitter (`splitConcatenatedHarvardReferences`).** docpluck's
  academic normalization flows the reference section of Harvard papers into ONE paragraph (it
  keeps per-entry newlines for APA but joins Harvard's tighter line spacing), so citelink received
  all 109 entries on one line. The APA splitter and the comma-anchored step-1c opener both require
  `Surname, A.` (comma + period initials), which Harvard's `Adler D and Ansell B (2020)` /
  `Algan Y et al. (2017)` never have — so the list collapsed into ~9 mega-references. The new
  splitter opens on a Harvard author list (`Surname Initials`, no comma/period, "and"/"&"-joined or
  "et al."-terminated) immediately followed by `(year)`, with the APA splitter's exact boundary
  guards (split only at a clean reference end or a trailing URL; never inside an author list, so a
  two-author `Amengay A and Stockemer D (2019)` is not split at its second author). Applied for
  `harvard`/`asa`/`chicago-ad`/`aom` styles only.
- **`et al.` author strip in `parseAuthorsFromSection`.** A truncated Harvard author form is written
  without a comma (`Algan Y et al.`), so the whole string collapsed into one bogus surname
  ("Algan Y et al.") that never matched the reference's real first author (25 of bjps_1's refs).
  A trailing `et al.` is now stripped before parsing, recovering the leading author. Also covers
  Vancouver `Smith JA, et al.` and APA `Smith, J., et al.`.
- **Run-on Harvard short-circuit (`splitIntoReferences`).** The generic author-year / inline
  splitters built for newline-separated lists FRAGMENT a run-on Harvard list at the `(year)`
  between author and title ("Caprettini B et al. (2021)" | "Redistribution, …Caselli M et al.
  (2020)…"), which then defeats the per-block splitter. When the section is Harvard-family AND
  clearly run-on (few newlines per `(year)` marker), the whole section is now split with the
  purpose-built Harvard splitter up front, bypassing the fragmenting pipeline. This recovered the
  last globbed pairs (refs.f1 0.912 → 0.972, 109/109 parsed).
- **Hyphenated initials (`parseAuthor`).** `Betz H-G`, `Jin Z-C` collapsed into the surname
  ("Betz H-G"); the no-comma initials matcher now admits an internal hyphen so the surname and
  initials separate correctly.
- **Multi-word second surname + non-letter title start (opener).** The splitter opener now admits
  a multi-word surname in a co-author (`Barros L and Santos Silva M (2019)`) and a title that
  begins with a digit/quote/hashtag (`#EleNão: …`), both of which previously aborted the boundary
  match and globbed the entry.

Residual (filed to the citationguard-iterate TRIAGE, refs.f1 0.972 floor): a single idiosyncratic
glob (Whelan/Maître), a dataset self-citation year-format ("Replication Data for: …"), and two
grey-literature title-bleeds past `;` ("…Populism; Unpublished Manuscript"). In-text Harvard
detection/matching (intext.f1 0.774, match 0.594) is a separate subsystem for a future cycle.

Test: `tests/harvardRunOnReferences.test.ts` (9 cases on the real bjps_1 run-on extraction).
citelink 389 tests pass.

## 0.7.26

Citationguard-iterate **2026-06-10 (cycle 1)** — REFERENCE-PARSING over-split class on
numbered (IEEE/Vancouver) reference lists. Two distinct triggers false-split a single
numbered reference into two, spawning a phantom author-less reference and shifting every
later numeric index (so numeric citations resolved to the wrong reference). Surfaced on
`ieee_access_2`: refs.f1 0.907→0.986, matching 0.906→0.981, matching.wrong_target 4→0;
zero regression on the other five canary papers.

- **Month+date inside a venue must not trigger an inline split.** Step 1c's inline
  splitter read the conference name "…Int. Conf. Netw., Sens. Control, Apr. 2015…"
  (ref [5]) as a new "Surname=Control, Firstname=Apr … year=2015" reference start,
  splitting Wang's reference in two and losing its year. Pass-2 validation now rejects a
  candidate whose word after the comma is a month (full or abbreviated) followed by a
  digit — a publication date, never a real "Surname, Firstname" start. "Maybury, June A."
  (a first name that is a month, followed by an initial not a digit) still splits.
- **Bare volume number in a bracket-numbered list must not split an entry.** Step 1's
  numberedSplitPattern split book ref [17] "…The Petri Net Approach, vol.\n16. Cham,
  Switzerland: Springer, 2010." at the line-wrapped volume "16. Cham", spawning a phantom
  "Cham…Springer" reference with a DUPLICATE listNumber=16. When bracket markers clearly
  dominate the section (≥3 and ≥ bare markers), the list now splits ONLY on "[N]" markers.
  Bare-numbered lists (plos_med_1: 4 brackets vs 33 bare markers) keep the full splitter.

Tests: `numberedRefMonthDateSplit.test.ts`, `numberedRefBracketVolumeSplit.test.ts`.
citelink 375 tests pass.

## 0.7.25

Citationguard-iterate **focused sub-cycle 2026-06-08d (cycle 1)** — in-text DETECTION
miss class "D3/D6": a single parenthetical that bundles 2+ citations separated by
**prose** rather than a semicolon, or carries a trailing prose note.

- **Prose-bundled parenthetical detection.** `(Hong & Reed, 2021, reanalysis with RoBMA
  in Bartoš, Maier, Wagenmakers, et al., 2022)` detected NEITHER citation: the
  semicolon-bundle splitter never fires (no `;`), and the `(...)`-anchored
  single/two-author/et-al/mixed-list patterns all fail because non-citation prose sits
  between the year and the closing `)`. A new pass scans the interior of each
  `;`-free parenthetical for `<Surname-list>[ et al.], YYYY` groups and emits each at its
  true position. It is **overlap-aware** — a candidate overlapping a citation an earlier
  pattern already detected is dropped, so cleanly-handled parens (`(Smith, 2020)`,
  `(Thaler, 1985, 1999)`) are never re-emitted (no occurrence-count inflation). No `i`
  flag — the `[A-ZÀ-Ÿ]` surname anchor must hold so lowercase prose
  ("reanalysis with robma in") can't masquerade as an author; the sentence-connector /
  month / common-word guards drop the residual false positives.
- **Oxford-comma + ampersand author lists key on the FIRST author.** The interior author
  list handles the `, & Surname` / `, and Surname` form, so `(…, see Fritz, Morris, &
  Richler, 2012)` and `(e.g., Harley, Carlsen, & Loftus, 2004)` key on Fritz / Harley —
  not the trailing Richler / Loftus (a wrong-first-author mis-keying).

Impact (full canary sweep): collabra_90203 matching 0.979→**0.993**, in-text F1
0.976→**0.983** (Hong 2021 + Bartoš 2022 recovered); chen_2021_jesp matching
0.961→**0.980** (Fritz 2012, Harley 2004, Ofir 1997, Fay 2018, Cohen 1988 recovered);
chan_feldman_2025_cogemo matching 0.957→**0.978** (Batson 1982, McCullough 1998
recovered). 9 real gold citations recovered across 3 papers; 4 newly-surfaced detections
(Fischhoff 1975, Slovic & Fischhoff 1977, Dietvorst & Simonsohn 2019, Wade 1989) are real
in-text citations the AI gold undercounts (filed). Zero regressions on plos_med_1 /
ieee_access_2 / nat_comms_2; zero hallucinations. Tests in
`proseBundledParenthetical.test.ts` (9: the L94 case, no-inflation, 5 FP guards, 2
Oxford-comma first-author cases).

## 0.7.24

Citationguard-iterate **focused cycle 2026-06-08c (cycle 2)** — complex-parenthetical
in-text DETECTION misses (the "O2" class) on collabra_90203. Two bundle-fragment
robustness fixes:

- **Review / recency lead-in phrases inside parentheticals are now stripped.**
  `(most recently, in Mayiwar et al., 2023)` detected nothing and
  `(for reviews see Carter et al., 2019; …)` dropped its first item — the lead-ins
  "most recently, in" and "for reviews see" were not in the signal-prefix set (used by
  both the single-parenthetical patterns and the multi-citation bundle splitter). Added
  both (multi-word, anchored immediately before an "Author, year" inside parens → small
  FP surface). collabra in-text F1 0.966→0.973, matching 0.959→0.973.

- **A bundle fragment carrying a trailing page locator is no longer dropped.**
  The middle item of `(e.g., Jeffreys, 1939; M. D. Lee & Wagenmakers, 2013, p. 105;
  Wasserman, 2000)` was missed: the multi-citation fragment matchers are `$`-anchored
  right after the year, so a trailing ", p. 105" / ", pp. 12-15" failed them (the
  standalone single-paren patterns already tolerated a page suffix). Strip a trailing
  page locator from each bundle fragment before matching. collabra matching 0.973→0.979.
  Side effect (citelink becoming MORE correct): chen_2021_jesp now also detects a 2nd,
  real "(Fischhoff, 2007, p. 11; …)" citation that the AI gold counts only once — a gold
  undercount (filed), surfacing as a −0.002 in-text F1 against the undercounting gold.

Tests in `multiCitationSignalPrefix.test.ts` (5 new: Mayiwar lead-in, Carter "for
reviews see", Lee page-locator, pp.-range, + an FP guard that the lead-ins don't invent
citations from ordinary prose). No corpus paper's spurious-detection count rose except
the chen gold-undercount above; no metric regressed > ε.

## 0.7.23 (unreleased)

Citationguard-iterate **focused cycle 2026-06-08c** — URL-terminated reference
swallowed the next reference (REFERENCE-SEGMENTATION). Surfaced on collabra_90203 as
the root of "O1" (3 "Bartoš, F., Maier, M., … (2022)" refs + McKenzie 2018 missing).

- **A reference whose trailing field is a URL / DOI no longer swallows the following
  reference when they are concatenated without a clean separator.**
  `splitConcatenatedApaReferences` previously only split a concatenation when the
  PREVIOUS reference ended in `)` `.` or a digit (`(?<=[).\d])`). Modern APA entries
  end in a URL/DOI that docpluck extracts verbatim WITHOUT a trailing period (often
  with injected spaces: "package=RoBMA", ".../osf.io/75bqn", ".../osf.io/tkm pc",
  ".../OSF.IO/A2TGB"), so the character before the next reference is a LETTER and the
  boundary was missed — the next entry merged into the URL-ending one and only its
  first author/year/title survived. Now a split is also accepted when the reference
  being closed ENDS with a URL/DOI (anchored at the boundary, allowing docpluck's
  space-broken URL tokens), provided the whitespace is not inside an author list
  (`,` `&` / `and` / initial connector — which would orphan the real first author).
  The `endsClean` path is byte-for-byte the prior behavior, so clean references are
  unaffected. collabra_90203 references.key_only.f1 0.972→1.000 (every gold reference
  now detected), matching.accuracy 0.904→0.959; no other corpus paper changed
  (splitter isolated under a fixed gate). Test `urlTerminatedReferenceSplit.test.ts`
  (5 cases; fails-before/passes-after verified, incl. a guard that a long multi-author
  entry whose start can't be split off is not FRAGMENTED at an interior particle
  surname when an earlier reference carried a URL).

## 0.7.22 (unreleased)

Citationguard-iterate **session 2026-06-08** — APA reference title with a leading
part-number prefix truncated to the prefix (REFERENCE-PARSING). Surfaced on
chan_feldman_2025_cogemo (Pearson & Filon 1898).

- **A reference title beginning with a part-number / volume prefix that ends in a
  period — a roman numeral ("VII."), or "Pt. 1.", "No. 3.", "Vol. 2.", "Ch. 4." —
  is no longer truncated to just that prefix.** The title is extracted as "the
  first sentence after the year", anchored on the first period-then-space; a
  leading "VII." ends in exactly that, so the whole title collapsed to "VII."
  (Pearson 1898: "VII. Mathematical contributions to the theory of evolution…").
  When the candidate first sentence is only such a prefix, it is skipped and the
  terminator re-anchors on the next sentence period; slicing still starts at 0, so
  the prefix stays in the title and a rare false match only extends the title,
  never truncates it. chan_feldman_2025_cogemo refs.f1 0.916→0.927; no other
  corpus paper changed. Test `titlePartNumberPrefix.test.ts`
  (fails-before/passes-after + ordinary-title no-regression guard).

## 0.7.21 (unreleased)

Citationguard-iterate **session 2026-06-08** — plain-digit superscript recovery
fabricated citations from math variables in bracket-paradigm papers
(INTEXT-DETECTION false positive). Surfaced on ieee_access_2 + plos_med_1.

- **The plain-digit "superscript" recovery in `detectNumericCitations` no longer
  fires in bracket-paradigm papers (IEEE / Vancouver).** That branch un-flattens
  Nature/AMA superscript citations that PDF extraction glued onto the preceding
  word ("integrity1" = integrity¹); it ran unconditionally, so in a bracket paper
  (citations written "[n]") it read a digit glued to a word as a citation — the
  IEEE Access ODE-modelling paper's math variables "beta1"/"beta2" became
  citations "a1"/"a2" (10 fabricated in-text citations), and plos_med_1 produced
  "s1"/"i2". An academic-integrity tool must never invent a citation from a
  variable. The branch is now gated on bracket scarcity (suppressed when ≥3 "[n]"
  citations are present), mirroring the parenthetical-numeric and standalone-number
  branches that already self-suppress the same way. Superscript-paradigm papers
  (nat_comms_2: 0 brackets, 581 glued superscripts) are untouched. ieee_access_2
  in-text F1 0.904→0.990, plos_med_1 0.841→**1.000**; no other corpus paper
  changed. Test `plainDigitSuppressedInBracketParadigm.test.ts`
  (fails-before/passes-after + superscript-paradigm no-regression guard).

## 0.7.20 (unreleased)

Citationguard-iterate **session 2026-06-07e** — two-word compound surname
(REFERENCE-PARSING). Surfaced on nat_comms_2 (O3).

- **A two-word compound surname in "Surname, Initials" form ("Ross Russell, A. L.")
  no longer parses as just the last word ("Russell").** The `parseAuthorsFromSection`
  surname-continuation group only accepted a lowercase particle ("van der Berg"),
  so the capitalized 2nd word was dropped and the regex re-anchored at "Russell".
  Added an alternative for one capitalized 2nd surname word, kept safe by the
  required trailing ", Initials" and by the 2nd word needing lowercase letters
  (so an initial like "A" in "Smith A," is never eaten). nat_comms_2 refs.f1
  0.872→0.889, matching 0.851→0.865; no other corpus paper changed. Test
  `compoundSurnameTwoWord.test.ts` (fails-before/passes-after + over-merge guards).

## 0.7.19 (unreleased)

Citationguard-iterate **session 2026-06-07e** — Vancouver journal-abbreviation
false split (REFERENCE-PARSING). Surfaced on plos_med_1 (O1-residual).

- **A Vancouver reference whose title is followed by a multi-word journal
  abbreviation beginning "<Word> J <Word>…" ("Eur J Obstet Gynecol Reprod Biol",
  "Int J Gynaecol Obstet" — J = "Journal") is no longer false-split at the
  title→journal period.** Step-1c inline splitting validated the journal fragment
  as a new reference because its `refStartPattern` Vancouver alternative accepted
  "Surname Initials" followed by a BARE SPACE, so "Eur J Obstet…" matched
  "Surname=Eur, initial=J". The yearless author+title half was then dropped,
  leaving the journal as an author-less reference (Cornelissen #9, Munro #25 had
  empty authors). The initials must now be followed by a comma (next author) or
  period (end of authors), not a space. plos_med_1 refs.f1 0.848→0.909, matching
  0.919→**1.000**; no other corpus paper changed. Test
  `vancouverJournalAbbrevFalseSplit.test.ts` (fails-before/passes-after proven).

## 0.7.18 (unreleased)

Citationguard-iterate **session 2026-06-07e** — organizational-author reference
run-on split (REFERENCE-PARSING). Surfaced on collabra_90203 (O4).

- **An org author ending in an org-suffix word ("JASP Team. (2023).") concatenated
  onto the previous reference (after its DOI, no line break) is now split out.**
  `splitConcatenatedApaReferences` only recognised a "Surname, Initials. (year)"
  opener, so the JASP Team entry was swallowed into the Isager reference and the
  work had no entry. Added an org-author boundary alternative (a capitalized name
  ending in Team|Group|Collaboration|Consortium|Network|Initiative|Project|
  Foundation|Association|Society immediately before "(year)"), guarded by the
  existing `(?<=[).\d])` reference-end lookbehind. `isOrganizationName` also now
  recognises these suffixes (long ones by substring; "team"/"group" word-bounded
  so a surname containing them isn't misclassified). collabra refs.f1
  0.922→0.930; no other corpus paper changed. Test `orgSuffixAuthorRunOnSplit.test.ts`
  (fails-before/passes-after proven).

## 0.7.17 (unreleased)

Citationguard-iterate **session 2026-06-07e** — numeric-citation precision
(INTEXT-DETECTION false-positive). For an academic-integrity tool, fabricating a
citation is worse than missing one; this closes a fabrication path.

- **No longer fabricates a numeric citation from a digit inside a bare URL/domain
  token.** The plain-digit superscript detector matched "c4" inside
  "isaric4c.net" (nat_comms_2 methods) and emitted a bogus `[4]`. The pre-existing
  guard only caught `http://`-prefixed URLs; bare domains (`isaric4c.net`,
  `osf.io/dbn92`) now also suppress detection. Verified no over-skip: genuine
  glued superscripts on normal words (`severity43`, `(CSF)13`) still detected.
  nat_comms_2 intext.f1 0.919→0.925; no other corpus paper changed.
  Test `numericUrlDomainFpGuard.test.ts` (fails-before/passes-after proven).

NOTE: the remaining nat_comms_2 numeric misses (markers 28/30/41/46) are an
irreducible **extraction floor** — pdftotext flattens those superscripts to
baseline and relocates them away from their word (they survive only as
author-affiliation numbers). Per the triage boundary and the anti-hallucination
policy they are NOT recoverable in citelink without fabricating a marker; docpluck
confirmed won't-fix (no pdftotext flag; splitting would regress detection).

## 0.7.16 (unreleased)

Citationguard-iterate **session 2026-06-07c** — run-on reference splitting
(REFERENCE-PARSING class). Surfaced only against the docpluck-academic (pdftotext)
extraction substrate — the production input — after the iterate fixtures were
regenerated from raw-pymupdf to docpluck `--level academic`.

- **Multiple complete APA references concatenated on one line are now each parsed.**
  pdftotext joins reference entries (sometimes across a DOI with no trailing
  period, e.g. "…75.6.1586 McCullough, M. E., & Rachal, K. C. (1997)…"), so one
  line held Maio (2008) + McCullough (2013) + McCullough (1998) + McCullough (1997).
  splitIntoReferences' step-1c inline splitter skips blocks that are mostly
  newline-separated, so only the first entry parsed and the rest were swallowed.
  New `splitConcatenatedApaReferences` post-pass splits on the unambiguous APA
  opener (author list ending in a parenthetical year + '.'/',' preceded by a
  reference-end signal), guarded against mid-title false splits; the existing
  continuation-merge repairs any over-split.
- Impact (chan_feldman_2025_cogemo, the replication target McCullough et al. cited
  64× in-text): **matching accuracy 0.645 → 0.957**, references.f1 0.849 → 0.883.
  chen 0.484 → 0.536, collabra +0.014. No change on numeric-style papers (no-op).
- Test: `tests/runOnReferenceSplit.test.ts` (real chan extracted text, plus
  guard assertions for clean refs + mid-title author mentions).

## 0.7.15 (unreleased)

Citationguard-iterate **session 2026-06-07b, N1** — hyphenated compound split
across a line break with a numeric tail truncated a reference (HALLUCINATION /
CITATION-PARSING class).

- **"COVID-\n19", "SARS-CoV-\n2", "IL-\n6" fabricated a fragment + truncated the
  real entry.** "Xu … Long-term neurologic outcomes of COVID-\n19. Nat. Med. …
  (2022)." left the orphaned "19." on its own line; the numbered-reference
  splitter read it as reference #19, cut the Xu entry at "COVID-" (its year +
  journal lost), and fabricated a fragment. The fix rejoins the compound KEEPING
  the semantic hyphen ("COVID-19") — same family as the v0.7.10 digit-range split,
  but for letter-hyphen-digit. nat_comms_2 references F1 0.889 → 0.914; matching
  0.865 → 0.878; no corpus regression. Regression test:
  `tests/compoundHyphenLineSplit.test.ts`.

## 0.7.14 (unreleased)

Citationguard-iterate **session 2026-06-07b, cycle 5** — acronym-colon
organisation reference lost / mis-keyed (CITATION-PARSING class).

- **"KNAW: Royal Dutch Academy of Arts and Sciences. (2018). …" was merged into
  the previous reference** (the year is not adjacent to the acronym — it follows
  the spelled-out name — so the WHO-style "ACRONYM. (year)" new-ref opener missed
  it). splitIntoReferences now also opens a reference at "ACRONYM: Capitalized".
- **Once split, the author carried the whole spelled-out name** as its surname, so
  the reference key matched nothing. parseAPAReference now parses the author as the
  ACRONYM ("KNAW") — how the work is cited in-text ("(KNAW, 2018)") and how the key
  must read.

chen_2021_jesp references F1 0.955 → 0.960; matching 0.928 → 0.935 (the KNAW
citation now resolves); no corpus regression. Regression test:
`tests/acronymColonOrgReference.test.ts`.

## 0.7.13 (unreleased)

Citationguard-iterate **session 2026-06-07b, cycle 4** — superscript citation
list glued to a disease-name compound was never detected (INTEXT-DETECTION class).

- **"COVID-1914,27" (i.e. "COVID-19" + superscript "14,27") detected nothing.**
  The compound's own 2-digit number and the citation digits fuse into one run, so
  the plain-digit pattern (which needs a `[a-z.)"]` separator before the digits)
  never matched, and the preceding-digit guard would have rejected it anyway. New
  pattern: a 2+-member comma/range list glued to a `[A-Za-z]{3,}-\d\d` token is a
  citation (a real number is never written "1914,27"). Restricted to a 2-digit
  compound suffix so a 1-digit compound (IL-6) can't mis-split, and the mandatory
  list keeps a lone year-like suffix out.

nat_comms_2 in-text detection misses 12 → 6 (markers 14/21/22/27/40/41/52
recovered); intext F1 0.886 → 0.932; matching 0.784 → 0.865; zero precision
change on every numeric paper. The remaining 6 nat_comms misses are docpluck
text-extraction losses (superscripts 28/30/41/46 dropped during PDF extraction)
— filed, not a citelink defect. Regression test:
`tests/compoundSuperscriptCitation.test.ts`.

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
