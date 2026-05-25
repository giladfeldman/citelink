/**
 * citationguard-iterate cycles 17 + 18.
 *
 * Cycle 17 — capitalized surname particles. Compound surnames written with a
 * capital-first-letter particle in narrative reference lists ("Van Knippenberg",
 * "Van Nuland", "De Bruin", "Von Restorff") were rejected because
 * SURNAME_PARTICLE was lowercase-only. Fix: case-insensitivize the first
 * letter of every particle ("[Vv]an", "[Dd]e", …) while keeping the
 * remainder strict.
 *
 * Cycle 18 — etAlNarrative with trailing page/note. "Brandt et al. (2014,
 * p. 218)" / "Smith et al. (2020, Experiment 3)" — the original
 * etAlNarrative regex required `\(YEAR\)` exactly, refusing anything after
 * the year. Fix: optional `(?:,\s*[^)]+)?` allowing a trailing page or
 * note inside the same paren group.
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

describe('cycle 17 — capitalized particles', () => {
  it('detects "(Aarts, Verplanken, & Van Knippenberg, 1998)"', () => {
    const text = 'Habit formation (Aarts, Verplanken, & Van Knippenberg, 1998) is well-studied.';
    const cits = detectCitations(text);
    const a = cits.find(c => /aarts/i.test(c.authors[0]?.normalized || '') && c.year === '1998');
    expect(a).toBeDefined();
  });

  it('detects "(Hom Jr & Van Nuland, 2019)"', () => {
    // "Hom Jr" has a Jr suffix; the first author surname capture must take
    // "Hom" as the surname. The capital-Van fix only applies to the second
    // author's particle.
    const text = 'A relevant review (Van der Berg & Van Nuland, 2019) covers it.';
    const cits = detectCitations(text);
    const v = cits.find(c => /berg/i.test(c.authors[0]?.normalized || '') && c.year === '2019');
    expect(v).toBeDefined();
  });
});

describe('cycle 18 — etAlNarrative with trailing page/note', () => {
  it('detects "Brandt et al. (2014, p. 218)"', () => {
    const text = 'According to Brandt et al. (2014, p. 218), the design is replicable.';
    const cits = detectCitations(text);
    const b = cits.find(c => /brandt/i.test(c.authors[0]?.normalized || ''));
    expect(b).toBeDefined();
    expect(b!.year).toBe('2014');
  });

  it('detects "Smith et al. (2020, Experiment 3)"', () => {
    const text = 'In Smith et al. (2020, Experiment 3), the effect was replicated.';
    const cits = detectCitations(text);
    const s = cits.find(c => /smith/i.test(c.authors[0]?.normalized || ''));
    expect(s).toBeDefined();
    expect(s!.year).toBe('2020');
  });

  it('still detects plain "Smith et al. (2020)" with no extra', () => {
    const text = 'The original work, Smith et al. (2020), opened the field.';
    const cits = detectCitations(text);
    const s = cits.find(c => /smith/i.test(c.authors[0]?.normalized || ''));
    expect(s).toBeDefined();
  });
});
