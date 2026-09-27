/**
 * Two-sided pin for scripts/check-docs-coverage.mjs (the documentation-drift gate).
 *
 * A gate that passes on the real repo proves nothing unless it is also shown to FAIL when
 * the thing it guards is broken -- otherwise an empty derived surface or a pattern that
 * matches everything would read as "fully documented". Each planted case below must be
 * caught. The quickstart execution (which builds dist/) is left to `npm run docs:check`.
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-ignore -- plain ESM script without type declarations
import * as gate from '../scripts/check-docs-coverage.mjs';

const surface: Record<string, Set<string>> = gate.collectSurface();
const code: string = gate.documentedCodeText();

describe('documentation-drift gate', () => {
  it('derives a non-empty surface from the source (known-positive control)', () => {
    expect(surface.export.has('analyze')).toBe(true);
    expect(surface.export.has('countNarrativeSignals')).toBe(true);
    expect(surface.field.has('firstAuthorLastNameNormalized')).toBe(true);
    expect(surface.field.has('authorScore')).toBe(true); // nested anonymous object type
    expect(surface.field.has('matchRate')).toBe(true); // returned object literal
    expect(surface.value.has('chicago-ad')).toBe(true);
    expect(surface.value.has('no_match')).toBe(true);
    expect(surface.parameter.has('referenceSectionStart')).toBe(true);
    expect(surface['violation code'].has('HARVARD_COMMA_BEFORE_YEAR')).toBe(true);
    expect(surface.export.size).toBeGreaterThan(40);
  });

  it('passes on the real repository', () => {
    expect(gate.findUndocumented(surface, code)).toEqual([]);
    expect(gate.checkReleaseMetadata(surface, code)).toEqual([]);
  });

  it.each([
    ['export', 'plantedUndocumentedExport'],
    ['field', 'plantedUndocumentedField'],
    ['value', 'planted-undocumented-value'],
    ['parameter', 'plantedUndocumentedParam'],
    ['violation code', 'PLANTED_UNDOCUMENTED_CODE'],
  ])('fails on a planted undocumented %s', (kind, token) => {
    const planted: Record<string, Set<string>> = {};
    for (const [k, v] of Object.entries(surface)) planted[k] = new Set(v);
    planted[kind].add(token);
    expect(gate.findUndocumented(planted, code)).toEqual([`${kind}: ${token}`]);
  });

  it('counts only code spans and fenced blocks, and whole tokens only', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citelink-docs-gate-'));
    const doc = path.join(dir, 'doc.md');
    fs.writeFileSync(doc, 'A Widget in prose.\n\n`Gadget` inline.\n\n```ts\nimport { Gizmo } from "x";\n```\n');
    const text: string = gate.documentedCodeText([doc]);
    fs.rmSync(dir, { recursive: true, force: true });
    expect(gate.isDocumented('Widget', text)).toBe(false);
    expect(gate.isDocumented('Gadget', text)).toBe(true);
    expect(gate.isDocumented('Gizmo', text)).toBe(true);
    // A prefix must not satisfy a longer name, nor a longer name a prefix.
    expect(gate.isDocumented('analyze', 'analyzeAll')).toBe(false);
    expect(gate.isDocumented('detectCitations', 'detectCitationsX detectCitation')).toBe(false);
  });

  it('refuses a quickstart with no js block', () => {
    expect(() => gate.quickstartBlocks('# x\n\n## Quickstart\n\nno code here\n\n## Next\n')).toThrow();
  });
});
