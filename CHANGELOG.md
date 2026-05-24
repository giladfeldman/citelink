# Changelog

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
