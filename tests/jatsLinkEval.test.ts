/**
 * Pins the scoring rules of scripts/jats-link-eval.mjs (the JATS citation-link accuracy
 * test, analysis plan in docs/accuracy/2026-11-18-jats-link-preregistration.md).
 *
 * Gold here is synthetic and built in the test: a template marks each citation as
 * {{refIds|text}} and the builder records the span exactly as the real gold builder
 * does. Each scoring rule has a case that must FAIL when the rule is broken.
 */
import { describe, it, expect } from '@jest/globals';
// @ts-ignore -- plain ESM script without type declarations
import * as ev from '../scripts/jats-link-eval.mjs';
import { analyze } from '../src/analyze';

type Ref = { id: string; text: string; label?: number };

function buildGold(template: string, refs: Ref[], paradigm: 'numeric' | 'author-year') {
  let text = '';
  const xrefs: any[] = [];
  const links: any[] = [];
  const re = /\{\{([^|}]+)\|([^}]*)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    text += template.slice(last, m.index);
    const start = text.length;
    text += m[2];
    const idx = xrefs.length;
    const rids = m[1].split(',');
    xrefs.push({ index: idx, start, end: text.length, rids, text: m[2] });
    for (const r of rids) links.push({ xref: idx, ref_id: r, via: 'xref', start, end: text.length });
    last = re.lastIndex;
  }
  text += template.slice(last);
  // groups: consecutive xrefs separated only by punctuation/space
  const groups: number[][] = [];
  xrefs.forEach((x, i) => {
    if (groups.length) {
      const prev = xrefs[groups[groups.length - 1].slice(-1)[0]];
      if (/^[\s,;–-]{0,4}$/.test(text.slice(prev.end, x.start))) {
        groups[groups.length - 1].push(i);
        return;
      }
    }
    groups.push([i]);
  });
  const gOf = new Map<number, number>();
  groups.forEach((g, gi) => g.forEach((i) => gOf.set(i, gi)));
  for (const l of links) {
    const g = groups[gOf.get(l.xref)!];
    l.group = gOf.get(l.xref);
    l.group_start = xrefs[g[0]].start;
    l.group_end = xrefs[g[g.length - 1]].end;
  }
  text += '\n\nReferences\n\n';
  const references = refs.map((r, i) => {
    text += (i ? '\n\n' : '') + (r.label ? `${r.label}. ` : '');
    const start = text.length - (r.label ? `${r.label}. `.length : 0);
    text += r.text;
    return { ref_id: r.id, start, end: text.length, label_num: r.label ?? null, year: (r.text.match(/\d{4}/) || [''])[0], first_author_surname: r.text.split(/[ ,]/)[0], title: '', volume: '', issue: '', fpage: '', doi: '' };
  });
  return { text, gold: { style: { paradigm }, references, xrefs, links, groups } };
}

const REFS: Ref[] = [
  { id: 'r1', text: 'Smith, J. (2020). A study of memory in older adults. Journal of Things, 1, 1-10.' },
  { id: 'r2', text: 'Jones, K. (2019). Another study on attention and choice. Journal of Stuff, 2, 11-20.' },
];

/** A hand-made analysis: citations at given spans linked to parsed refs. */
function fakeAnalysis(text: string, parsedRaw: string[], cites: { s: number; e: number; ref: number | null; status?: string }[]) {
  const references = parsedRaw.map((raw) => ({ raw, year: '', firstAuthorLastName: '', title: '' }));
  const citations = cites.map((c) => ({ position: { start: c.s, end: c.e }, year: '', authors: [] }));
  const matches = cites.map((c, i) => ({
    citation: citations[i],
    reference: c.ref === null ? null : references[c.ref],
    status: c.status ?? 'matched',
  }));
  return { style: { style: 'apa' }, citations, references, matches };
}

describe('JATS link scoring', () => {
  const { text, gold } = buildGold('As shown before ({{r1|Smith, 2020}}; {{r2|Jones, 2019}}).', REFS, 'author-year');
  const sp = (s: string) => [text.indexOf(s), text.indexOf(s) + s.length];

  it('maps parsed references to gold references (exact, fuzzy, unmapped)', () => {
    const m = ev.mapReferences(text, gold.references, [
      { raw: REFS[1].text },
      { raw: 'Smith J 2020 study memory older adults Journal Things' },
      { raw: 'Completely unrelated entry about volcanoes' },
    ]);
    expect(m.map((x: any) => [x.refId, x.how])).toEqual([
      ['r2', 'exact'],
      ['r1', 'fuzzy'],
      [null, 'unmapped'],
    ]);
  });

  it('a correct link at the right span is a true positive with exact position', () => {
    const [a, b] = sp('Smith, 2020');
    const [c, d] = sp('Jones, 2019');
    const r = ev.scorePaper(text, gold, fakeAnalysis(text, [REFS[0].text, REFS[1].text], [
      { s: a, e: b, ref: 0 },
      { s: c, e: d, ref: 1 },
    ]));
    expect([r.gold, r.pred, r.tp, r.posCorrect]).toEqual([2, 2, 2, 2]);
  });

  it('a link to a reference not cited there is one false link and one miss', () => {
    const one = buildGold('As shown before ({{r1|Smith, 2020}}).', REFS, 'author-year');
    const a = one.text.indexOf('Smith, 2020');
    const r = ev.scorePaper(one.text, one.gold, fakeAnalysis(one.text, [REFS[0].text, REFS[1].text], [{ s: a, e: a + 11, ref: 1 }]));
    expect(r.tp).toBe(0);
    const kinds = r.errors.map((e: any) => `${e.kind}:${e.detail}`).sort();
    expect(kinds).toEqual(['false-link:wrong-reference', 'miss:citation-linked-but-not-to-this-reference']);
  });

  it('a span shifted onto the next citation is a position error, not a correct position', () => {
    // the 0.7.88 ;-list bug: the member for Smith points at Jones' text
    const [c, d] = sp('Jones, 2019');
    const r = ev.scorePaper(text, gold, fakeAnalysis(text, [REFS[0].text, REFS[1].text], [{ s: c, e: d, ref: 0 }]));
    expect(r.tp).toBe(1); // same paragraph, same reference: the link itself is right
    expect(r.posCorrect).toBe(0);
    expect(r.errors.find((e: any) => e.kind === 'position').detail).toBe('misses-own-citation');
  });

  it('a span that swallows a neighbouring citation is a position error', () => {
    const [a] = sp('Smith, 2020');
    const [, d] = sp('Jones, 2019');
    const r = ev.scorePaper(text, gold, fakeAnalysis(text, [REFS[0].text, REFS[1].text], [{ s: a, e: d, ref: 0 }]));
    expect(r.posCorrect).toBe(0);
    expect(r.errors.find((e: any) => e.kind === 'position').detail).toBe('covers-foreign-citation');
  });

  it('no_match and unverifiable are not links (consumer view)', () => {
    const [a, b] = sp('Smith, 2020');
    const r = ev.scorePaper(text, gold, fakeAnalysis(text, [REFS[0].text], [
      { s: a, e: b, ref: 0, status: 'no_match' },
      { s: a, e: b, ref: 0, status: 'unverifiable' },
    ]));
    expect(r.pred).toBe(0);
  });

  it('a suggested link counts as a link (it is stored as one)', () => {
    const [a, b] = sp('Smith, 2020');
    const r = ev.scorePaper(text, gold, fakeAnalysis(text, [REFS[0].text], [{ s: a, e: b, ref: 0, status: 'suggested' }]));
    expect(r.tp).toBe(1);
  });

  it('a link beyond the pairing window or in another paragraph does not pair', () => {
    const far = buildGold(`{{r1|Smith, 2020}} said so.${' x'.repeat(200)}\n\nLater, Smith, 2020 again.`, REFS, 'author-year');
    const s = far.text.lastIndexOf('Smith, 2020');
    const r = ev.scorePaper(far.text, far.gold, fakeAnalysis(far.text, [REFS[0].text], [{ s, e: s + 11, ref: 0 }]));
    expect(r.tp).toBe(0);
    expect(r.errors.some((e: any) => e.detail === 'no-gold-citation-here')).toBe(true);
  });

  it('numeric: links compare on the citation group span; a dropped member is a miss, not a position error', () => {
    const nrefs: Ref[] = [
      { id: 'n1', text: 'Smith J. Memory. J Things. 2020;1:1-10.', label: 1 },
      { id: 'n2', text: 'Jones K. Attention. J Stuff. 2019;2:11-20.', label: 2 },
    ];
    const g = buildGold('Known [{{n1|1}},{{n2|2}}] already.', nrefs, 'numeric');
    const s = g.text.indexOf('[1,2]');
    const a = fakeAnalysis(g.text, ['1. ' + nrefs[0].text, '2. ' + nrefs[1].text], [{ s, e: s + 5, ref: 0 }]);
    const r = ev.scorePaper(g.text, g.gold, a);
    expect([r.gold, r.tp, r.posCorrect]).toEqual([2, 1, 1]);
    expect(r.errors.map((e: any) => `${e.kind}:${e.detail}`)).toEqual(['miss:citation-linked-but-not-to-this-reference']);
  });
});

describe('fixes from the cross-model review (2026-11-18)', () => {
  it('a reference whose text differs only by a curly apostrophe maps to its own entry, not to a look-alike', () => {
    const refs: Ref[] = [
      { id: 'a', text: 'O’Shea JJ, Plenge R. JAK and STAT signaling molecules in immunoregulation. Immunity. 2012;36:542-50.', label: 1 },
      { id: 'b', text: 'Smith J. Memory. J Things. 2020;1:1-10.', label: 2 },
      { id: 'c', text: "O'Shea JJ, Plenge R. JAK and STAT signaling molecules in immunoregulation. Immunity. 2012;36:542-50.", label: 3 },
    ];
    const g = buildGold('Text [{{a|1}}].', refs, 'numeric');
    const m = ev.mapReferences(g.text, g.gold.references, [
      { raw: "1. O'Shea JJ, Plenge R. JAK and STAT signaling molecules in immunoregulation. Immunity. 2012;36:542-50." },
      { raw: '2. Smith J. Memory. J Things. 2020;1:1-10.' },
      { raw: "3. O'Shea JJ, Plenge R. JAK and STAT signaling molecules in immunoregulation. Immunity. 2012;36:542-50." },
    ]);
    expect(m.map((x: any) => x.refId)).toEqual(['a', 'b', 'c']);
  });

  it('an xref that resolves to no reference inside a correct span is not a foreign citation', () => {
    const { text, gold } = buildGold('Shown ({{r1|Smith, 2020}}; {{orphan|Gone, 2001}}).', REFS, 'author-year');
    // the builder links every rid; an orphan rid has no reference, so no gold link
    gold.links = gold.links.filter((l: any) => l.ref_id !== 'orphan');
    const a = text.indexOf('Smith, 2020');
    const e = text.indexOf('Gone, 2001') + 10;
    const r = ev.scorePaper(text, gold, fakeAnalysis(text, [REFS[0].text], [{ s: a, e, ref: 0 }]));
    expect([r.tp, r.posCorrect]).toEqual([1, 1]);
  });

  it('the before/after rule fails a group or estimate that disappears', () => {
    const grp = (p: number | null) => ({ linkPrecision: { est: p }, linkRecall: { est: 0.9 }, positionAccuracy: { est: 0.99 } });
    expect(ev.compareSummaries({ all: grp(0.97), 'style:x': grp(0.9) }, { all: grp(0.97) }).length).toBeGreaterThan(0);
    expect(ev.compareSummaries({ all: grp(0.97) }, { all: grp(null) })).toHaveLength(1);
  });

  it('runs on different papers or gold renderings are not compared', () => {
    const m = { rendererVersion: '2', papers: 2, paperSet: ['a', 'b'] };
    expect(ev.sameRunBasis(m, { ...m })).toEqual([]);
    expect(ev.sameRunBasis(m, { ...m, rendererVersion: '1' })).toEqual(['renderer version']);
    expect(ev.sameRunBasis(m, { ...m, paperSet: ['a', 'c'] })).toEqual(['paper set']);
  });

  it('gold offsets in code points are converted to UTF-16 after an astral character', () => {
    const text = 'x\u{1D49C} (Smith, 2020).';
    const cp = Array.from(text);
    const start = cp.indexOf('S');
    const gold = { references: [], xrefs: [{ index: 0, start, end: start + 11, rids: ['r1'] }], links: [{ xref: 0, ref_id: 'r1', start, end: start + 11 }] };
    const u = ev.goldToUtf16(text, gold);
    expect(text.slice(u.xrefs[0].start, u.xrefs[0].end)).toBe('Smith, 2020');
  });

  it('reference fields are also reported by how the gold reference text was made', () => {
    const { text, gold } = buildGold('Shown ({{r1|Smith, 2020}}).', REFS, 'author-year');
    (gold.references[0] as any).render = 'fields:element-citation';
    (gold.references[1] as any).render = 'citation-string';
    const r = ev.scorePaper(text, gold, fakeAnalysis(text, [REFS[0].text, REFS[1].text], []));
    expect(Object.keys(r.fields)).toEqual(
      expect.arrayContaining(['reference.firstAuthorLastName [gold text: rendered from fields]', 'reference.firstAuthorLastName [gold text: publisher text]']),
    );
  });
});

describe('aggregation, CIs and verdicts', () => {
  it('the cluster bootstrap is reproducible and brackets the estimate', () => {
    const rows = [{ num: 9, den: 10 }, { num: 18, den: 20 }, { num: 5, den: 10 }, { num: 30, den: 30 }];
    const a = ev.clusterRatioCI(rows, 500, 7);
    const b = ev.clusterRatioCI(rows, 500, 7);
    expect(a).toEqual(b);
    expect(a.est).toBeCloseTo(62 / 70, 10);
    expect(a.lo).toBeLessThanOrEqual(a.est);
    expect(a.hi).toBeGreaterThanOrEqual(a.est);
    expect(a.hi - a.lo).toBeGreaterThan(0);
  });

  it('an empty denominator is NO DATA, never a pass', () => {
    const ci = ev.clusterRatioCI([{ num: 0, den: 0 }], 100);
    expect(ev.verdict(ci, 0.9)).toBe('NO DATA');
  });

  it('verdicts follow the CI against the threshold', () => {
    expect(ev.verdict({ est: 0.97, lo: 0.96, hi: 0.98 }, 0.95)).toBe('PASS');
    expect(ev.verdict({ est: 0.96, lo: 0.94, hi: 0.98 }, 0.95)).toBe('INCONCLUSIVE');
    expect(ev.verdict({ est: 0.9, lo: 0.88, hi: 0.94 }, 0.95)).toBe('FAIL');
  });

  it('the before/after rule flags a drop over one point and ignores a smaller one', () => {
    const s = (p: number) => ({ all: { linkPrecision: { est: p }, linkRecall: { est: 0.9 }, positionAccuracy: { est: 0.99 } } });
    expect(ev.compareSummaries(s(0.97), s(0.955))).toHaveLength(1);
    expect(ev.compareSummaries(s(0.97), s(0.965))).toHaveLength(0);
  });
});

describe('end to end on the real library', () => {
  it('scores citelink on a synthetic APA paper with perfect links', () => {
    const { text, gold } = buildGold(
      'Memory declines with age ({{r1|Smith, 2020}}). Attention does too ({{r2|Jones, 2019}}).',
      REFS,
      'author-year',
    );
    const r = ev.scorePaper(text, gold, analyze(text));
    expect([r.gold, r.pred, r.tp, r.posCorrect]).toEqual([2, 2, 2, 2]);
    expect(r.refsExact).toBe(2);
  });
});
