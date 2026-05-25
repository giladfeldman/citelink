/**
 * Regression: 3+ author parenthetical citations like "(Hoffrage, Hertwig, &
 * Gigerenzer, 2000)" must be detected as an et al. citation.
 *
 * citationguard-iterate cycle 10 — the gate enhancement (cycle 6) surfaced
 * 8+ chen_2021_jesp parentheticals of this shape that citelink missed:
 *   "(Bosco, Aguinis, Field, Pierce, & Dalton, 2016)"
 *   "(Hoffrage, Hertwig, & Gigerenzer, 2000)"
 *   "(Guilbault, Bryant, Brockway, & Posavac, 2004)"
 *   "(Granhag, Strömwall, & Allwood, 2000)"
 *   "(Wagenmakers, Wetzels, Borsboom, van der Maas, & Kievit, 2012)"
 *   "(Litman, Robinson, & Abberbock, 2017)"
 *   "(Aarts, Verplanken, & Van Knippenberg, 1998)"
 *
 * APA 7 mandates "et al." for 3+ authors, but APA 6 (and many psychology
 * papers up to 2020) list all authors. citelink needs to accept the full
 * list and treat it as type='et_al' (classifyCitation collapses 3+ authors
 * automatically). The new `multiAuthorParenthetical` pattern accepts 2..N
 * comma-separated lastnames, then "& Lastname", then ", YEAR".
 */
import { describe, it, expect } from '@jest/globals';
import { detectCitations } from '../src/citationDetector.js';

describe('multi-author parenthetical (3-6 authors)', () => {
  it('detects "(Hoffrage, Hertwig, & Gigerenzer, 2000)"', () => {
    const text = 'The RAFT model (Hoffrage, Hertwig, & Gigerenzer, 2000) predicts this.';
    const cits = detectCitations(text);
    const h = cits.find(c =>
      /hoffrage/i.test(c.authors[0]?.normalized || '') && c.year === '2000',
    );
    expect(h).toBeDefined();
    expect(h!.type).toBe('et_al');
  });

  it('detects "(Bosco, Aguinis, Field, Pierce, & Dalton, 2016)" — 5 authors', () => {
    const text = 'A more recent study (Bosco, Aguinis, Field, Pierce, & Dalton, 2016) found it.';
    const cits = detectCitations(text);
    const b = cits.find(c =>
      /bosco/i.test(c.authors[0]?.normalized || '') && c.year === '2016',
    );
    expect(b).toBeDefined();
  });

  it('detects "(Litman, Robinson, & Abberbock, 2017)" — 3 authors with CamelCase second name', () => {
    const text = 'We used CloudResearch (Litman, Robinson, & Abberbock, 2017) for recruitment.';
    const cits = detectCitations(text);
    const l = cits.find(c =>
      /litman/i.test(c.authors[0]?.normalized || '') && c.year === '2017',
    );
    expect(l).toBeDefined();
  });

  it('detects multi-author inside multi-citation bundle "(Bosco, Aguinis, Field, Pierce, & Dalton, 2016; Smith, 2020)"', () => {
    const text =
      'Reviews of replication (Bosco, Aguinis, Field, Pierce, & Dalton, 2016; ' +
      'Smith, 2020) document the field.';
    const cits = detectCitations(text);
    const b = cits.find(c =>
      /bosco/i.test(c.authors[0]?.normalized || '') && c.year === '2016',
    );
    const s = cits.find(c =>
      /smith/i.test(c.authors[0]?.normalized || '') && c.year === '2020',
    );
    expect(b).toBeDefined();
    expect(s).toBeDefined();
  });
});
