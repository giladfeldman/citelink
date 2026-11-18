#!/usr/bin/env node
/**
 * Exact accuracy test for citation-to-reference links, scored against gold built
 * from PubMed Central JATS XML (each in-text citation is an <xref ref-type="bibr">
 * pointing at its <ref>). Analysis plan: docs/accuracy/2026-11-18-jats-link-preregistration.md
 *
 * The gold set is NOT in this repository (article text never is). Point the
 * script at it with --gold <dir> or JATS_LINK_GOLD_DIR. The directory holds
 *   manifest.json            list of papers (stem, pmcid, doi, stratum, style)
 *   text/<stem>.txt          the plain text citelink reads
 *   links/<stem>.json        gold references (with spans), xrefs, links, style
 *
 * Usage
 *   node scripts/jats-link-eval.mjs --gold <dir> [--lib dist/index.js] [--label name]
 *        [--out <dir>] [--boot 2000] [--compare <summary.json>]
 *
 * --lib lets the same harness score another build (an older tag) for a
 * before/after comparison; --compare applies the pre-registered regression rule.
 * Writes <out>/summary.json (numbers only) and <out>/errors.json (error rows
 * with short text windows; keep it with the gold, outside this repository).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ------------------------------------------------------------------ constants (pre-registered)

/** A predicted link is what a consumer stores: a reference under any verdict but these. */
export const NON_LINK_STATUSES = new Set(['no_match', 'unverifiable']);
/** Max distance (characters, centre to centre) for pairing a predicted link with a gold link. */
export const PAIR_WINDOW = 300;
export const THRESHOLDS = { linkPrecision: 0.95, linkRecall: 0.85, positionAccuracy: 0.95 };
/** Before/after rule: a candidate fails if a primary metric drops by more than this (proportion). */
export const REGRESSION_TOLERANCE = 0.01;
export const NUMERIC_STYLES = new Set(['vancouver', 'ieee', 'nature', 'ama']);

// ------------------------------------------------------------------ text helpers

/** Collapse whitespace; return the collapsed string and a map collapsed index -> original index. */
export function collapse(s) {
  let out = '';
  const map = [];
  let prevSpace = true;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/\s/.test(c)) {
      if (!prevSpace) {
        out += ' ';
        map.push(i);
      }
      prevSpace = true;
    } else {
      out += c;
      map.push(i);
      prevSpace = false;
    }
  }
  return { text: out, map };
}

export function normName(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function tokens(s) {
  return new Set(
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

// ------------------------------------------------------------------ reference mapping

/**
 * Map each parsed reference to the gold reference it came from.
 * 1) exact: the first 40 characters of its raw text (whitespace-collapsed, list
 *    label stripped) are found in the rendered reference section; the gold
 *    reference whose span holds that position is the one.
 * 2) fuzzy: token Jaccard >= 0.5 with one gold reference's rendered text.
 * Returns an array (same order as parsedRefs) of { refId|null, how }.
 */
export function mapReferences(text, goldRefs, parsedRefs) {
  const secStart = goldRefs.length ? goldRefs[0].start : 0;
  const sec = collapse(text.slice(secStart));
  const goldTok = goldRefs.map((g) => tokens(text.slice(g.start, g.end)));
  const refAt = (orig) => {
    for (const g of goldRefs) if (orig >= g.start && orig < g.end) return g.ref_id;
    // in a separator: the next reference
    for (const g of goldRefs) if (g.start >= orig) return g.ref_id;
    return null;
  };
  let cursor = 0;
  return parsedRefs.map((p) => {
    const raw = collapse(p.raw || '').text.replace(/^\s*\[?\d{1,4}[.\])]?\s+/, '');
    const probe = raw.slice(0, Math.min(40, raw.length));
    if (probe.length >= 12) {
      let at = sec.text.indexOf(probe, cursor);
      if (at < 0) at = sec.text.indexOf(probe);
      if (at >= 0) {
        cursor = at + 1;
        return { refId: refAt(secStart + sec.map[at]), how: 'exact' };
      }
    }
    const pt = tokens(p.raw);
    let best = -1;
    let bestScore = 0;
    goldTok.forEach((gt, i) => {
      const s = jaccard(pt, gt);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    if (best >= 0 && bestScore >= 0.5) return { refId: goldRefs[best].ref_id, how: 'fuzzy' };
    return { refId: null, how: 'unmapped' };
  });
}

// ------------------------------------------------------------------ scoring one paper

function blockOf(text, pos) {
  // paragraph index: number of blank-line separators before pos
  let n = 0;
  let i = text.indexOf('\n\n');
  while (i >= 0 && i < pos) {
    n++;
    i = text.indexOf('\n\n', i + 2);
  }
  return n;
}

/**
 * Score one paper. `analysis` is the result of citelink's analyze(text).
 * Returns counts plus error rows. Pure: no I/O.
 */
export function scorePaper(text, gold, analysis) {
  const refMap = mapReferences(text, gold.references, analysis.references);
  const refIndex = new Map(analysis.references.map((r, i) => [r, i]));
  const goldRefById = new Map(gold.references.map((r) => [r.ref_id, r]));

  // predicted links (consumer view)
  const pred = [];
  for (const m of analysis.matches) {
    if (!m.reference || NON_LINK_STATUSES.has(m.status)) continue;
    const idx = refIndex.get(m.reference);
    const mapped = idx === undefined ? { refId: null, how: 'unknown-object' } : refMap[idx];
    const pos = m.citation.position || { start: -1, end: -1 };
    pred.push({
      start: pos.start,
      end: pos.end,
      refId: mapped.refId,
      status: m.status,
      citation: m.citation,
      paired: null,
    });
  }
  // gold links: numeric links are compared on the citation group's span
  const numeric = gold.style.paradigm === 'numeric';
  const goldLinks = gold.links.map((l) => ({
    ...l,
    cStart: numeric ? l.group_start : l.start,
    cEnd: numeric ? l.group_end : l.end,
    paired: null,
  }));

  // greedy one-to-one pairing on same reference, same paragraph, nearest first
  const cand = [];
  const blockCache = new Map();
  const blk = (p) => {
    if (!blockCache.has(p)) blockCache.set(p, blockOf(text, p));
    return blockCache.get(p);
  };
  goldLinks.forEach((g, gi) => {
    pred.forEach((p, pi) => {
      if (p.refId === null || p.refId !== g.ref_id || p.start < 0) return;
      const d = Math.abs((p.start + p.end) / 2 - (g.cStart + g.cEnd) / 2);
      if (d > PAIR_WINDOW) return;
      if (blk(p.start) !== blk(g.cStart)) return;
      cand.push([d, gi, pi]);
    });
  });
  cand.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  for (const [, gi, pi] of cand) {
    if (goldLinks[gi].paired !== null || pred[pi].paired !== null) continue;
    goldLinks[gi].paired = pi;
    pred[pi].paired = gi;
  }

  // position: the predicted span covers its gold xref span and no foreign xref
  const predRefsAtSpan = new Map();
  for (const p of pred) {
    const k = `${p.start}-${p.end}`;
    if (!predRefsAtSpan.has(k)) predRefsAtSpan.set(k, new Set());
    predRefsAtSpan.get(k).add(p.refId);
  }
  const xrefGroup = new Map();
  (gold.groups || []).forEach((grp, gi) => grp.forEach((xi) => xrefGroup.set(xi, gi)));
  const xrefRefs = new Map();
  for (const l of gold.links) {
    if (!xrefRefs.has(l.xref)) xrefRefs.set(l.xref, new Set());
    xrefRefs.get(l.xref).add(l.ref_id);
  }
  let tp = 0;
  let posCorrect = 0;
  let posOverlap = 0;
  const errors = [];
  for (const g of goldLinks) {
    if (g.paired === null) continue;
    tp++;
    const p = pred[g.paired];
    const covers = p.start <= g.start && p.end >= g.end;
    const own = predRefsAtSpan.get(`${p.start}-${p.end}`);
    // foreign = an xref this citation's span covers whose references it does not claim.
    // In a numeric group ([1-3]) one span holds every number, so an xref of the SAME group
    // (a number the detector dropped) is a recall error, not a position error. In an
    // author-year ;-list every member is its own citation, so no exemption there.
    let foreign = false;
    for (const x of gold.xrefs) {
      if (numeric && xrefGroup.get(x.index) === g.group) continue;
      if (x.start >= p.start && x.end <= p.end) {
        const rs = xrefRefs.get(x.index) || new Set();
        if (![...rs].some((r) => own.has(r))) foreign = true;
      }
    }
    if (covers && !foreign) posCorrect++;
    else
      errors.push({
        kind: 'position',
        detail: covers ? 'covers-foreign-citation' : 'misses-own-citation',
        gold: [g.start, g.end],
        pred: [p.start, p.end],
        window: text.slice(Math.max(0, Math.min(g.start, p.start) - 20), Math.max(g.end, p.end) + 20),
      });
    if (p.start < g.end && g.start < p.end) posOverlap++;
  }

  // classify misses (recall) and false links (precision)
  const citesAt = (s, e) => analysis.citations.filter((c) => c.position && c.position.start < e && s < c.position.end);
  for (const g of goldLinks) {
    if (g.paired !== null) continue;
    const near = citesAt(g.cStart, g.cEnd);
    let cls;
    if (!near.length) cls = 'citation-not-detected';
    else {
      const linksHere = pred.filter((p) => p.start < g.cEnd && g.cStart < p.end);
      if (!linksHere.length) cls = 'detected-not-linked';
      else if (linksHere.some((p) => p.refId === null)) cls = 'linked-to-unmapped-reference';
      else cls = 'citation-linked-but-not-to-this-reference';
    }
    const gr = goldRefById.get(g.ref_id);
    errors.push({
      kind: 'miss',
      detail: cls,
      via: g.via,
      gold: [g.cStart, g.cEnd],
      goldRef: g.ref_id,
      goldRefText: gr ? text.slice(gr.start, Math.min(gr.end, gr.start + 120)) : null,
      window: text.slice(Math.max(0, g.cStart - 50), g.cEnd + 30),
    });
  }
  for (const p of pred) {
    if (p.paired !== null) continue;
    let cls;
    if (p.refId === null) cls = 'reference-unmapped';
    else {
      const goldHere = goldLinks.filter((g) => g.cStart < p.end + 2 && p.start - 2 < g.cEnd);
      if (!goldHere.length) cls = 'no-gold-citation-here';
      else if (goldHere.some((g) => g.ref_id === p.refId)) cls = 'duplicate-link';
      else cls = 'wrong-reference';
    }
    errors.push({
      kind: 'false-link',
      detail: cls,
      status: p.status,
      pred: [p.start, p.end],
      predRef: p.refId,
      window: text.slice(Math.max(0, p.start - 50), p.end + 30),
    });
  }

  // reference mapping quality
  const mappedCount = new Map();
  for (const m of refMap) if (m.refId) mappedCount.set(m.refId, (mappedCount.get(m.refId) || 0) + 1);

  // secondary: fields on 1:1 mapped references
  const fields = {};
  const field = (name, ok) => {
    if (ok === null) return;
    fields[name] = fields[name] || { n: 0, correct: 0 };
    fields[name].n++;
    if (ok) fields[name].correct++;
  };
  analysis.references.forEach((p, i) => {
    const id = refMap[i].refId;
    if (!id || mappedCount.get(id) !== 1) return;
    const g = goldRefById.get(id);
    const yr = (g.year || '').match(/\d{4}/);
    field('reference.year', yr ? (p.year || '').startsWith(yr[0]) : null);
    field(
      'reference.firstAuthorLastName',
      g.first_author_surname ? normName(p.firstAuthorLastName) === normName(g.first_author_surname) : null,
    );
    const gt = tokens(g.title);
    field('reference.title', gt.size >= 3 ? jaccard(tokens(p.title), gt) >= 0.8 : null);
    field('reference.volume', g.volume ? (p.volume || '') === g.volume : null);
    field('reference.issue', g.issue ? (p.issue || '') === g.issue : null);
    field('reference.pages(first page)', g.fpage ? (p.pages || '').split(/[-–]/)[0].trim() === g.fpage : null);
    const inText = g.doi && text.slice(g.start, g.end).toLowerCase().includes(g.doi);
    field('reference.doi', inText ? (p.doi || '').toLowerCase().replace(/[.\s]+$/, '') === g.doi : null);
    field('reference.listNumber', numeric && g.label_num != null ? p.listNumber === g.label_num : null);
  });
  for (const g of goldLinks) {
    if (g.paired === null || numeric) continue;
    const c = pred[g.paired].citation;
    const ym = (text.slice(g.start, g.end).match(/(1[6-9]\d\d|20\d\d)/) || [])[1];
    field('citation.year', ym ? c.year === ym : null);
    const gr = goldRefById.get(g.ref_id);
    field(
      'citation.authors[0]',
      gr && gr.first_author_surname && c.authors && c.authors.length
        ? normName(c.authors[0].raw) === normName(gr.first_author_surname)
        : null,
    );
  }

  const detectedParadigm = NUMERIC_STYLES.has(analysis.style.style) ? 'numeric' : 'author-year';
  return {
    gold: goldLinks.length,
    pred: pred.length,
    tp,
    posCorrect,
    posOverlap,
    refsGold: gold.references.length,
    refsParsed: analysis.references.length,
    refsExact: refMap.filter((m) => m.how === 'exact').length,
    refsFuzzy: refMap.filter((m) => m.how === 'fuzzy').length,
    refsUnmapped: refMap.filter((m) => !m.refId).length,
    refsSplit: [...mappedCount.values()].filter((v) => v > 1).length,
    refsMissing: gold.references.filter((r) => !mappedCount.has(r.ref_id)).length,
    paradigmCorrect: detectedParadigm === gold.style.paradigm ? 1 : 0,
    detectedStyle: analysis.style.style,
    fields,
    errors,
  };
}

// ------------------------------------------------------------------ aggregation + CIs

/** Seeded PRNG (mulberry32) so a run's CIs are reproducible. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ratio metric with a paper-cluster percentile bootstrap CI.
 * rows: [{num, den}] one per paper. Returns {est, lo, hi, num, den, papers}.
 */
export function clusterRatioCI(rows, boot = 2000, seed = 20261118) {
  const num = rows.reduce((s, r) => s + r.num, 0);
  const den = rows.reduce((s, r) => s + r.den, 0);
  const est = den ? num / den : null;
  if (!rows.length || !den) return { est, lo: null, hi: null, num, den, papers: rows.length };
  const rand = rng(seed);
  const stats = [];
  for (let b = 0; b < boot; b++) {
    let n = 0;
    let d = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[Math.floor(rand() * rows.length)];
      n += r.num;
      d += r.den;
    }
    if (d) stats.push(n / d);
  }
  stats.sort((a, b) => a - b);
  const q = (p) => stats[Math.min(stats.length - 1, Math.max(0, Math.floor(p * stats.length)))];
  return { est, lo: q(0.025), hi: q(0.975), num, den, papers: rows.length };
}

/** PASS: CI lower bound >= threshold; FAIL: CI upper bound < threshold; else INCONCLUSIVE. */
export function verdict(ci, threshold) {
  if (ci.est === null || ci.lo === null) return 'NO DATA';
  if (ci.lo >= threshold) return 'PASS';
  if (ci.hi < threshold) return 'FAIL';
  return 'INCONCLUSIVE';
}

export function summarize(perPaper, boot) {
  const groups = {};
  const add = (k, r) => (groups[k] = groups[k] || []).push(r);
  for (const r of perPaper) {
    add('all', r);
    add(`style:${r.style}`, r);
    if (r.refsGold > 100) add('subgroup:over-100-references', r);
  }
  const out = {};
  for (const [k, rows] of Object.entries(groups)) {
    const precision = clusterRatioCI(rows.map((r) => ({ num: r.tp, den: r.pred })), boot);
    const recall = clusterRatioCI(rows.map((r) => ({ num: r.tp, den: r.gold })), boot);
    const position = clusterRatioCI(rows.map((r) => ({ num: r.posCorrect, den: r.tp })), boot);
    const overlap = clusterRatioCI(rows.map((r) => ({ num: r.posOverlap, den: r.tp })), boot);
    const fields = {};
    for (const r of rows)
      for (const [f, v] of Object.entries(r.fields)) {
        fields[f] = fields[f] || [];
        fields[f].push({ num: v.correct, den: v.n });
      }
    const fieldCIs = Object.fromEntries(Object.entries(fields).map(([f, v]) => [f, clusterRatioCI(v, boot)]));
    const errorCounts = {};
    for (const r of rows) for (const e of r.errors) errorCounts[`${e.kind}:${e.detail}`] = (errorCounts[`${e.kind}:${e.detail}`] || 0) + 1;
    out[k] = {
      papers: rows.length,
      linkPrecision: { ...precision, verdict: verdict(precision, THRESHOLDS.linkPrecision) },
      linkRecall: { ...recall, verdict: verdict(recall, THRESHOLDS.linkRecall) },
      positionAccuracy: { ...position, verdict: verdict(position, THRESHOLDS.positionAccuracy) },
      positionOverlap: overlap,
      paradigmDetection: clusterRatioCI(rows.map((r) => ({ num: r.paradigmCorrect, den: 1 })), boot),
      references: {
        gold: rows.reduce((s, r) => s + r.refsGold, 0),
        parsed: rows.reduce((s, r) => s + r.refsParsed, 0),
        mappedExact: rows.reduce((s, r) => s + r.refsExact, 0),
        mappedFuzzy: rows.reduce((s, r) => s + r.refsFuzzy, 0),
        unmapped: rows.reduce((s, r) => s + r.refsUnmapped, 0),
        goldSplitAcrossParsed: rows.reduce((s, r) => s + r.refsSplit, 0),
        goldWithNoParsed: rows.reduce((s, r) => s + r.refsMissing, 0),
      },
      fields: fieldCIs,
      errorCounts,
    };
  }
  return out;
}

/** Pre-registered before/after rule. Returns list of regressions (empty = pass). */
export function compareSummaries(before, after) {
  const regressions = [];
  for (const [group, a] of Object.entries(after)) {
    const b = before[group];
    if (!b) continue;
    for (const m of ['linkPrecision', 'linkRecall', 'positionAccuracy']) {
      if (b[m].est === null || a[m].est === null) continue;
      const drop = b[m].est - a[m].est;
      if (drop > REGRESSION_TOLERANCE) regressions.push({ group, metric: m, before: b[m].est, after: a[m].est, drop });
    }
  }
  return regressions;
}

/** Fields a consumer reads that this test does not score (reported as unverified). */
export const UNSCORED_FIELDS = [
  'DetectedCitation.type',
  'DetectedCitation.citationStyle (parenthetical / narrative)',
  'DetectedCitation.pageNumbers',
  'DetectedCitation.yearSuffix',
  'DetectedCitation.context',
  'DetectedCitation.raw',
  'DetectedCitation.authors[1..] and isOrganization',
  'MatchResult.confidence',
  'MatchResult.matchMethod / matchDetails / alternativeMatches',
  'ParsedReference.source',
  'ParsedReference.url',
  'ParsedReference.type',
  'ParsedReference.authors[1..]',
  'StyleDetectionResult.style (named style; only the numeric / author-year paradigm is scored)',
];

// ------------------------------------------------------------------ CLI

function parseArgs(argv) {
  const a = { boot: 2000, label: 'candidate', lib: null, gold: process.env.JATS_LINK_GOLD_DIR || null };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--gold') (a.gold = v), i++;
    else if (k === '--lib') (a.lib = v), i++;
    else if (k === '--label') (a.label = v), i++;
    else if (k === '--out') (a.out = v), i++;
    else if (k === '--boot') (a.boot = Number(v)), i++;
    else if (k === '--compare') (a.compare = v), i++;
    else if (k === '--only') (a.only = v.split(',')), i++;
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

function pct(ci) {
  if (!ci || ci.est === null) return 'n/a';
  const f = (x) => (x === null ? '?' : (100 * x).toFixed(1));
  return `${f(ci.est)}% [${f(ci.lo)}, ${f(ci.hi)}] (${ci.num}/${ci.den})`;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.gold || !fs.existsSync(path.join(args.gold, 'manifest.json'))) {
    console.error('No gold set: pass --gold <dir> or set JATS_LINK_GOLD_DIR (a directory with manifest.json).');
    process.exit(2);
  }
  const libPath = path.resolve(args.lib || 'dist/index.js');
  if (!fs.existsSync(libPath)) {
    console.error(`citelink build not found at ${libPath} (run npm run build, or pass --lib).`);
    process.exit(2);
  }
  const lib = await import(pathToFileURL(libPath).href);
  const manifest = JSON.parse(fs.readFileSync(path.join(args.gold, 'manifest.json'), 'utf8'));
  let papers = manifest.papers;
  if (args.only) papers = papers.filter((p) => args.only.includes(p.stem) || args.only.includes(p.pmcid));
  if (!papers.length) {
    console.error('Manifest lists no papers: refusing to report an empty run as a result.');
    process.exit(2);
  }
  const origWarn = console.warn;
  console.warn = () => {};
  const perPaper = [];
  for (const p of papers) {
    const text = fs.readFileSync(path.join(args.gold, 'text', `${p.stem}.txt`), 'utf8');
    const gold = JSON.parse(fs.readFileSync(path.join(args.gold, 'links', `${p.stem}.json`), 'utf8'));
    const t0 = Date.now();
    const analysis = lib.analyze(text);
    const r = scorePaper(text, gold, analysis);
    perPaper.push({ stem: p.stem, pmcid: p.pmcid, doi: p.doi, stratum: p.stratum, style: gold.style.style, ms: Date.now() - t0, ...r });
  }
  console.warn = origWarn;
  const summary = summarize(perPaper, args.boot);
  const outDir = args.out || path.join(args.gold, 'runs', args.label);
  fs.mkdirSync(outDir, { recursive: true });
  const meta = {
    label: args.label,
    lib: libPath,
    libVersion: (() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(path.dirname(libPath), '..', 'package.json'), 'utf8')).version;
      } catch {
        return null;
      }
    })(),
    rendererVersion: manifest.renderer_version,
    papers: perPaper.length,
    boot: args.boot,
    thresholds: THRESHOLDS,
    unscoredFields: UNSCORED_FIELDS,
    when: new Date().toISOString(),
  };
  const perPaperSlim = perPaper.map(({ errors, ...rest }) => ({ ...rest, errors: errors.length }));
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ meta, summary, perPaper: perPaperSlim }, null, 1));
  fs.writeFileSync(
    path.join(outDir, 'errors.json'),
    JSON.stringify(perPaper.map((r) => ({ stem: r.stem, style: r.style, errors: r.errors })), null, 1),
  );
  console.log(`citelink ${meta.libVersion ?? '?'} (${args.label}) on ${perPaper.length} papers; CIs: paper-cluster bootstrap, ${args.boot} resamples`);
  for (const [k, s] of Object.entries(summary)) {
    console.log(`\n${k}  (${s.papers} papers)`);
    console.log(`  link precision   ${pct(s.linkPrecision)}  ${s.linkPrecision.verdict} (T=${THRESHOLDS.linkPrecision})`);
    console.log(`  link recall      ${pct(s.linkRecall)}  ${s.linkRecall.verdict} (T=${THRESHOLDS.linkRecall})`);
    console.log(`  position (exact) ${pct(s.positionAccuracy)}  ${s.positionAccuracy.verdict} (T=${THRESHOLDS.positionAccuracy})`);
    console.log(`  position overlap ${pct(s.positionOverlap)}`);
    console.log(`  paradigm         ${pct(s.paradigmDetection)}`);
  }
  console.log(`\nwrote ${outDir}`);
  if (args.compare) {
    const before = JSON.parse(fs.readFileSync(args.compare, 'utf8')).summary;
    const regs = compareSummaries(before, summary);
    if (regs.length) {
      console.log(`\nREGRESSION (drop > ${REGRESSION_TOLERANCE * 100} points):`);
      for (const r of regs) console.log(`  ${r.group} ${r.metric}: ${(100 * r.before).toFixed(1)}% -> ${(100 * r.after).toFixed(1)}%`);
      process.exit(1);
    }
    console.log('\nno regression against the comparison run');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => {
    console.error(e);
    process.exit(2);
  });
}
