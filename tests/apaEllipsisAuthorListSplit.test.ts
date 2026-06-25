import { describe, it, expect } from '@jest/globals';
import {
  parseReferences,
  splitConcatenatedApaReferences,
} from '../src/referenceParser';

/**
 * Regression: APA-7 ellipsis author list ("…, Last, I.") defeated the
 * concatenated-reference splitter (citationguard-iterate 2026-06-25, chen — TC-6).
 *
 * APA 7 truncates a 21+ author reference as "first 19 authors, …, final author":
 * "Munafò, M. R., Nosek, B. A., …, Ioannidis, J. P. (2017).". The concatenation
 * splitter's `personalList` was a comma-joined run of "Surname, Initials" with no
 * ellipsis connector, so it stopped at the "…", the opener never reached "(2017)",
 * and the whole entry was swallowed into the previous reference (chen: the Munafò
 * 2017 manifesto reference was lost into the preceding Müller 2007 entry, so a
 * "(Munafò et al., 2017)" in-text citation had no reference to match).
 *
 * Fix: allow "…" / "..." (optionally comma-flanked) as an author-list connector
 * before the final author. The splitter now reaches "(2017)" and splits the entry.
 */

// Real chen_2021_jesp reference section fragment (Müller 2007 + the 21-author
// Munafò 2017 manifesto, concatenated on one line by docpluck).
const CONCAT =
  'Müller, P. A., & Stahlberg, D. (2007). The role of surprise in hindsight bias: ' +
  'A metacognitive model of reduced and reversed hindsight bias. Social Cognition, 25, 165-184. ' +
  'Munafò, M. R., Nosek, B. A., Bishop, D. V., Button, K. S., Chambers, C. D., ' +
  'Du Sert, N. P., … Ioannidis, J. P. (2017). A manifesto for reproducible science. ' +
  'Nature Human Behaviour, 1, 1-9.';

describe('APA-7 ellipsis author-list concatenation split (chen TC-6)', () => {
  it('splits a Müller…Munafò block where the second entry has an ellipsis author list', () => {
    const parts = splitConcatenatedApaReferences(CONCAT);
    expect(parts.length).toBe(2);
    expect(parts[0]).toMatch(/^Müller/);
    expect(parts[1]).toMatch(/^Munafò/);
  });

  it('parseReferences recovers Munafò 2017 as its own reference', () => {
    const doc = `Body text with a citation.\n\nReferences\n${CONCAT}\n`;
    const refs = parseReferences(doc, 'apa');
    const munafo = refs.find((r) => /^Munafò/.test((r.raw || '').trim()));
    expect(munafo).toBeDefined();
    expect(munafo!.year).toBe('2017');
    // And Müller survives as its own entry.
    const muller = refs.find((r) => /^Müller/.test((r.raw || '').trim()));
    expect(muller).toBeDefined();
    expect(muller!.year).toBe('2007');
  });

  it('does not over-split a normal comma-joined APA author list (no ellipsis)', () => {
    const normal =
      'Smith, A. B., Jones, C. D., & Brown, E. F. (2020). A reasonably long title here ' +
      'about something interesting in psychology research. Journal of Things, 10, 1-20.';
    const parts = splitConcatenatedApaReferences(normal);
    expect(parts).toEqual([normal]);
  });
});
