// Read-only safety harness for a prospective JS "unbound identifier" layer.
//
// It answers ONE question before any UI wiring: if we flagged every free
// identifier that resolves to nothing visible (local binders ∪ this file ∪ the
// real editor prelude), how many FALSE POSITIVES would we produce on the whole
// known-good library? Zero on valid code = the detector is safe to surface.
// Anything else names exactly the positions/binders we must exclude first.
//
// Uses the PRODUCTION prelude computation (buildPrelude) so the visible name
// environment matches what the editor actually sees. Nothing here mutates the
// editor; it is an analysis tool, not a gated test (hence not test-*.mjs).
//
//   node tests/analyze-scope-corpus.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { walkTree } from '../editor-src/bel-walk.mjs';
import { buildPrelude, editorTextForIndexing } from '../editor-src/project-prelude.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dataRoot = join(here, '..', 'library', 'data');

function walkDir(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walkDir(p, acc);
    else if (ent.isFile()) acc.push(p);
  }
  return acc;
}

const rel = (p) => relative(dataRoot, p).replace(/\\/g, '/');
const all = walkDir(dataRoot).filter((p) => /\.(bel|elf|cfg)$/i.test(p));
const files = all.map((p) => ({ id: rel(p), name: rel(p) }));
const textById = new Map(all.map((p) => [rel(p), readFileSync(p, 'utf8')]));
const getText = (id) => textById.get(id) ?? '';
const sourceFiles = files.filter((f) => /\.(bel|elf)$/i.test(f.name));

// Free (non-bound, non-defining) identifier uses of a file + the names it
// defines. `bound` is already resolved by walkTree through every binder form it
// models (Pi/fn/mlam/context/schema-some/case/module-tail/…), so a use with
// bound=false is genuinely free w.r.t. this file.
const analyzeCache = new Map();
function analyze(src) {
  const hit = analyzeCache.get(src);
  if (hit) return hit;
  const text = editorTextForIndexing(src, 'active.bel');
  const doc = Text.of(text.split('\n'));
  const walk = walkTree(parser.parse(text), doc);
  const defPos = new Set(walk.definedNames.map((d) => `${d.from}:${d.name}`));
  const ownNames = new Set(walk.definedNames.map((d) => d.name));
  const uses = [];
  for (const u of walk.uses) {
    if (u.bound) continue;
    if (defPos.has(`${u.from}:${u.name}`)) continue;
    uses.push({ name: u.name, kind: u.kind });
  }
  const out = { uses, ownNames };
  analyzeCache.set(src, out);
  return out;
}

// Union of every name defined anywhere in the library — lets us separate a use
// that is unbound in its own suite (possible cross-suite leak / visibility-model
// gap) from one that is defined NOWHERE (a much stronger unbound signal).
const globalNames = new Set();
for (const f of sourceFiles) {
  for (const n of analyze(getText(f.id)).ownNames) globalNames.add(n);
}

let filesAnalyzed = 0;
let totalFreeUses = 0;
const unresolved = []; // { file, name, kind, nowhere }
const byName = new Map(); // name -> { kind, count, nowhere }

for (const f of sourceFiles) {
  const { uses, ownNames } = analyze(getText(f.id));
  let preludeNames;
  try {
    const prelude = buildPrelude(files, f.id, getText);
    preludeNames = prelude ? prelude.names : new Set();
  } catch {
    preludeNames = new Set();
  }
  filesAnalyzed += 1;
  totalFreeUses += uses.length;
  for (const u of uses) {
    if (ownNames.has(u.name) || preludeNames.has(u.name)) continue;
    const nowhere = !globalNames.has(u.name);
    unresolved.push({ file: f.name, name: u.name, kind: u.kind, nowhere });
    const rec = byName.get(u.name) || { kind: u.kind, count: 0, nowhere };
    rec.count += 1;
    byName.set(u.name, rec);
  }
}

const lower = unresolved.filter((u) => u.kind === 'lower');
const upper = unresolved.filter((u) => u.kind === 'upper');
const lowerNowhere = lower.filter((u) => u.nowhere);
const upperNowhere = upper.filter((u) => u.nowhere);

const byFile = new Map();
for (const u of unresolved) {
  const r = byFile.get(u.file) || { lower: 0, upper: 0 };
  r[u.kind] += 1;
  byFile.set(u.file, r);
}

function topNames(kind, nowhereOnly) {
  return [...byName.entries()]
    .filter(([, r]) => r.kind === kind && (!nowhereOnly || r.nowhere))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 25);
}

console.log('=== JS scope-check false-positive sweep over library/data ===\n');
console.log(`files analyzed:        ${filesAnalyzed}`);
console.log(`free identifier uses:  ${totalFreeUses}`);
console.log(`unresolved (suite):    ${unresolved.length}`);
console.log(`  lowercase:           ${lower.length}  (of which nowhere-in-library: ${lowerNowhere.length})`);
console.log(`  uppercase:           ${upper.length}  (of which nowhere-in-library: ${upperNowhere.length})`);

console.log('\n--- top unresolved LOWERCASE names (the safe-detector candidate) ---');
for (const [name, r] of topNames('lower', false)) {
  console.log(`  ${String(r.count).padStart(4)}  ${name}${r.nowhere ? '  [nowhere]' : ''}`);
}

console.log('\n--- top unresolved LOWERCASE names that are defined NOWHERE in library ---');
const lowNo = topNames('lower', true);
if (!lowNo.length) console.log('  (none)');
for (const [name, r] of lowNo) console.log(`  ${String(r.count).padStart(4)}  ${name}`);

console.log('\n--- top unresolved UPPERCASE names (expected: metavariables, NOT errors) ---');
for (const [name, r] of topNames('upper', false)) {
  console.log(`  ${String(r.count).padStart(4)}  ${name}${r.nowhere ? '  [nowhere]' : ''}`);
}

console.log('\n--- files with the most unresolved LOWERCASE uses ---');
const worstLower = [...byFile.entries()]
  .filter(([, r]) => r.lower > 0)
  .sort((a, b) => b[1].lower - a[1].lower)
  .slice(0, 20);
if (!worstLower.length) console.log('  (none)');
for (const [file, r] of worstLower) console.log(`  ${String(r.lower).padStart(4)}  ${file}`);

console.log('\nInterpretation:');
console.log('  A lowercase free use unresolved even suite-wide is the closest JS proxy');
console.log('  for Beluga\'s "Unbound identifier". If that count is ~0 on this known-good');
console.log('  corpus, a conservative lowercase-only detector is safe to surface. Nonzero');
console.log('  counts name the exact binder forms / positions to exclude before wiring.');
