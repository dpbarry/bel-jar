#!/usr/bin/env node
/**
 * Shell differential — the Phase 0 gate for the \*jar delamination.
 *
 * Runs the language-neutral half of the pipeline over the whole bundled corpus
 * and digests each stage per file:
 *
 *     parse  →  blocks  →  definitions  →  uses  →  local diagnostics
 *
 * A refactor that preserves behaviour leaves every digest identical. One that
 * does not says exactly which file and which STAGE moved — which is the point:
 * a single "N tests failed" tells you nothing about where a 1,416-site
 * conversion went wrong.
 *
 * ⛔ Unlike `prover:diff` this needs NO native oracle (docs/starjar/FILES.md F29).
 * It is pure JS over the lezer tree, so it runs today.
 * ⭐ Per F27 this is THE gate for the generalization: 194 of 257 unit tests are
 * written in Beluga and protect BelJar, not the refactor.
 *
 *   node scripts/shell-differential.mjs --record    # write the golden file
 *   node scripts/shell-differential.mjs             # check; exit 1 on drift
 *   node scripts/shell-differential.mjs --file f.bel  # dump one file's record
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { walkTree } from '../js/editor-src/tree-walk.mjs';
import { editorTextForIndexing } from '../js/editor-src/semantic/project-prelude.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const RECORD = args.includes('--record');
const ONE = (() => { const i = args.indexOf('--file'); return i >= 0 ? args[i + 1] : null; })();
const corpusArg = (() => { const i = args.indexOf('--corpus'); return i >= 0 ? args[i + 1] : null; })();

// library/data is in-repo and stable. Beluga-W is a submodule whose pin moves,
// which would invalidate the golden on every repin.
const corpusRoot = join(root, corpusArg || join('library', 'data'));
const goldenFile = join(root, 'tests', 'golden', 'shell-differential.json');

const STAGES = ['parse', 'blocks', 'defs', 'uses', 'diags'];
const h = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

function walkDir(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkDir(p, acc);
    else if (e.isFile() && /\.(bel|elf)$/i.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Deterministic per-stage digest of the language-neutral pipeline. */
function digest(src, name) {
  const text = editorTextForIndexing(src, name);
  const doc = Text.of(text.split('\n'));
  const tree = parser.parse(text);

  // parse — node-type histogram plus error count, so a grammar or role change
  // that reshapes the tree shows up even when downstream output survives.
  const types = new Map();
  let nodes = 0;
  let errors = 0;
  const cur = tree.cursor();
  do {
    nodes += 1;
    if (cur.type.isError) errors += 1;
    types.set(cur.name, (types.get(cur.name) || 0) + 1);
  } while (cur.next());
  const parse = h(`${nodes}|${errors}|${[...types].sort().map(([k, v]) => `${k}:${v}`).join(',')}`);

  const walk = walkTree(tree, doc);
  const blocks = h(`${walk.blocks.length}|${walk.blocks.map((b) => `${b.from}-${b.to}`).join(',')}`);
  const defs = h(walk.definedNames
    .map((d) => `${d.from}:${d.name}:${d.blockIndex}`).sort().join(','));
  const uses = h(walk.uses
    .map((u) => `${u.from}:${u.name}:${u.bound ? 1 : 0}:${u.kind ?? ''}`).sort().join(','));
  const diags = h((walk.parseDiags || [])
    .map((d) => `${d.from}-${d.to}:${d.severity}:${d.message}`).sort().join(','));

  return {
    parse, blocks, defs, uses, diags,
    counts: { nodes, errors, blocks: walk.blocks.length, defs: walk.definedNames.length, uses: walk.uses.length },
  };
}

// ── run ──────────────────────────────────────────────────────────────────────
if (!existsSync(corpusRoot)) {
  console.error(`corpus not found: ${relative(root, corpusRoot)}`);
  process.exit(2);
}

const files = walkDir(corpusRoot).sort();
const rel = (p) => relative(corpusRoot, p).replace(/\\/g, '/');

if (ONE) {
  const hit = files.find((p) => rel(p).includes(ONE));
  if (!hit) { console.error(`no corpus file matching "${ONE}"`); process.exit(2); }
  console.log(rel(hit));
  console.log(JSON.stringify(digest(readFileSync(hit, 'utf8'), rel(hit)), null, 2));
  process.exit(0);
}

const t0 = Date.now();
const current = {};
const failed = [];
for (const p of files) {
  const id = rel(p);
  try {
    current[id] = digest(readFileSync(p, 'utf8'), id);
  } catch (e) {
    failed.push([id, e.message]);
  }
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);

if (failed.length) {
  console.error(`\n${failed.length} file(s) threw during digest — the pipeline crashed, not drifted:`);
  for (const [id, msg] of failed.slice(0, 10)) console.error(`  ${id}: ${msg}`);
  process.exit(1);
}

if (RECORD) {
  mkdirSync(dirname(goldenFile), { recursive: true });
  writeFileSync(goldenFile, JSON.stringify(current, null, 1) + '\n');
  const totals = Object.values(current).reduce((a, r) => ({
    nodes: a.nodes + r.counts.nodes, blocks: a.blocks + r.counts.blocks,
    defs: a.defs + r.counts.defs, uses: a.uses + r.counts.uses, errors: a.errors + r.counts.errors,
  }), { nodes: 0, blocks: 0, defs: 0, uses: 0, errors: 0 });
  console.log(`recorded ${files.length} files in ${secs}s → ${relative(root, goldenFile)}`);
  console.log(`  nodes ${totals.nodes}  blocks ${totals.blocks}  defs ${totals.defs} `
    + ` uses ${totals.uses}  parse-errors ${totals.errors}`);
  process.exit(0);
}

if (!existsSync(goldenFile)) {
  console.error('no golden file — run with --record first');
  process.exit(2);
}
const golden = JSON.parse(readFileSync(goldenFile, 'utf8'));

const drift = [];
const added = [];
const removed = [];
for (const id of Object.keys(current)) {
  if (!golden[id]) { added.push(id); continue; }
  const moved = STAGES.filter((s) => golden[id][s] !== current[id][s]);
  if (moved.length) drift.push([id, moved]);
}
for (const id of Object.keys(golden)) if (!current[id]) removed.push(id);

if (!drift.length && !added.length && !removed.length) {
  console.log(`shell differential: ${files.length} files identical (${secs}s)`);
  process.exit(0);
}

console.error(`\nshell differential DRIFTED (${secs}s)`);
if (drift.length) {
  // Which stage moved matters more than which file: the earliest moved stage is
  // where the regression is, everything after it is downstream noise.
  const byStage = {};
  for (const [, moved] of drift) for (const s of moved) byStage[s] = (byStage[s] || 0) + 1;
  console.error(`\n  ${drift.length} file(s) drifted. By stage:`);
  for (const s of STAGES) if (byStage[s]) console.error(`    ${s.padEnd(7)} ${byStage[s]}`);
  console.error('\n  first 15:');
  for (const [id, moved] of drift.slice(0, 15)) {
    const c = current[id].counts; const g = golden[id].counts;
    const delta = STAGES.filter((s) => moved.includes(s)).join(',');
    console.error(`    ${id}  [${delta}]  nodes ${g.nodes}→${c.nodes} defs ${g.defs}→${c.defs} uses ${g.uses}→${c.uses}`);
  }
  console.error('\n  inspect one with: node scripts/shell-differential.mjs --file <name>');
}
if (added.length) console.error(`\n  ${added.length} new file(s): ${added.slice(0, 5).join(', ')}`);
if (removed.length) console.error(`\n  ${removed.length} missing file(s): ${removed.slice(0, 5).join(', ')}`);
process.exit(1);
