# Changelog

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
