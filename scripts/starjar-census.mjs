#!/usr/bin/env node
/**
 * \*jar census — the coverage instrument.
 *
 * Enumerates every source file in the repo, classifies it, measures its
 * language coupling, and reports which files have no line yet in
 * docs/starjar/FILES.md. "Did we miss a file?" becomes a computation instead
 * of a recollection.
 *
 * Also serves as the Phase 0 purity lint: `nodeSites` per file is the number
 * that must fall to zero outside lang/ and providers/.
 *
 *   node scripts/starjar-census.mjs            # summary + gap list
 *   node scripts/starjar-census.mjs --write    # also write docs/starjar/INVENTORY.md
 *   node scripts/starjar-census.mjs --area js  # restrict to one area
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const AREA = (() => { const i = args.indexOf('--area'); return i >= 0 ? args[i + 1] : null; })();

const AREAS = ['js', 'css', 'scripts', 'tests'];
const ROOT_FILES = ['index.html', 'sw.js', 'beluga.grammar', 'package.json', 'eslint.config.mjs'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'Beluga-W', 'scratch', 'results', 'assets', 'library']);
const CODE_EXT = new Set(['.mjs', '.js', '.css', '.html', '.grammar', '.json']);

// Known build artifacts: bundles produced by scripts/build-*.mjs, and generated parsers.
const BUNDLES = new Set(['js/shell.js', 'js/editor-cm.bundle.js', 'js/harpoon/harpoon-ui.js']);
const GENERATED = new Set(['js/editor-src/beluga-parser.js', 'js/editor-src/beluga-parser.terms.js']);

// ── grammar node vocabulary ──────────────────────────────────────────────────
const grammarSrc = readFileSync(join(root, 'beluga.grammar'), 'utf8');
const NODE_NAMES = [...new Set(grammarSrc.match(/\b[A-Z][A-Za-z0-9]+\b/g) || [])];
const NODE_RE = new RegExp(`'(${NODE_NAMES.join('|')})'`, 'g');
const BELUGA_RE = /beluga/gi;

// ── walk ─────────────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (CODE_EXT.has(extname(e.name))) out.push(full);
  }
  return out;
}

const files = [];
for (const area of AREAS) {
  if (AREA && area !== AREA) continue;
  files.push(...walk(join(root, area)));
}
if (!AREA) for (const f of ROOT_FILES) { const p = join(root, f); if (existsSync(p)) files.push(p); }

// ── classify + measure ───────────────────────────────────────────────────────
function classify(rel, abs) {
  if (BUNDLES.has(rel)) return 'bundle';
  if (GENERATED.has(rel)) return 'generated';
  if (rel.endsWith('.js') && existsSync(join(root, rel.replace(/\.js$/, '.mjs')))) return 'built-duplicate';
  if (rel.endsWith('.json')) return 'data';
  return 'source';
}

// ── coverage: which files have a line in the per-file record ────────────────
const starjarDir = join(root, 'docs', 'starjar');
// A file counts as ANALYSED only when it has a line in FILES.md — the per-file
// record. Mentions elsewhere are discussion, not coverage: chunks 0–10 discussed
// the prelude machinery at length and never once named project-prelude.mjs.
const filesDoc = join(starjarDir, 'FILES.md');
const record = existsSync(filesDoc) ? readFileSync(filesDoc, 'utf8') : '';
function isCovered(rel) {
  // Lines look like:  | `settings-ui.mjs` | 2496 | surface | … |
  // Accept a bare basename, the full repo path, or an area-relative path
  // (`boot/early-boot-core.mjs`), so the record can disambiguate where it needs to.
  for (const key of [basename(rel), rel, rel.replace(/^(js|css|scripts|tests)\//, '')]) {
    if (record.includes('`' + key + '`')) return true;
  }
  return false;
}

const rows = [];
for (const abs of files) {
  const rel = relative(root, abs).replace(/\\/g, '/');
  const kind = classify(rel, abs);
  let loc = 0, nodeSites = 0, beluga = 0;
  try {
    const src = readFileSync(abs, 'utf8');
    loc = src.split('\n').length;
    if (kind === 'source') {
      nodeSites = (src.match(NODE_RE) || []).length;
      beluga = (src.match(BELUGA_RE) || []).length;
    }
  } catch { /* unreadable */ }
  rows.push({ rel, kind, loc, nodeSites, beluga, covered: isCovered(rel), area: rel.split('/')[0] });
}

rows.sort((a, b) => (a.rel < b.rel ? -1 : 1));
const source = rows.filter((r) => r.kind === 'source');
const uncovered = source.filter((r) => !r.covered);

// ── report ───────────────────────────────────────────────────────────────────
const sum = (rs, k) => rs.reduce((n, r) => n + r[k], 0);
const byArea = {};
for (const r of source) {
  const a = (byArea[r.area] ||= { files: 0, loc: 0, nodeSites: 0, uncovered: 0, uncoveredLoc: 0 });
  a.files++; a.loc += r.loc; a.nodeSites += r.nodeSites;
  if (!r.covered) { a.uncovered++; a.uncoveredLoc += r.loc; }
}

console.log('\n\x1b[1m*jar census\x1b[0m');
console.log(`grammar node vocabulary: ${NODE_NAMES.length} names\n`);

console.log('area      files     LOC   nodeSites   uncovered   uncov.LOC');
console.log('─'.repeat(64));
for (const [a, v] of Object.entries(byArea).sort()) {
  console.log(
    `${a.padEnd(9)} ${String(v.files).padStart(5)} ${String(v.loc).padStart(7)} ${String(v.nodeSites).padStart(11)} ${String(v.uncovered).padStart(11)} ${String(v.uncoveredLoc).padStart(11)}`,
  );
}
console.log('─'.repeat(64));
console.log(
  `${'TOTAL'.padEnd(9)} ${String(source.length).padStart(5)} ${String(sum(source, 'loc')).padStart(7)} ${String(sum(source, 'nodeSites')).padStart(11)} ${String(uncovered.length).padStart(11)} ${String(sum(uncovered, 'loc')).padStart(11)}`,
);

const excluded = rows.filter((r) => r.kind !== 'source');
console.log(`\nexcluded: ${excluded.length} files, ${sum(excluded, 'loc')} LOC`);
for (const k of ['bundle', 'built-duplicate', 'generated', 'data']) {
  const g = excluded.filter((r) => r.kind === k);
  if (g.length) console.log(`  ${k.padEnd(16)} ${String(g.length).padStart(3)} files  ${String(sum(g, 'loc')).padStart(6)} LOC`);
}

console.log(`\n\x1b[1mUNANALYSED — no FILES.md line for these ${uncovered.length} files\x1b[0m`);
const uncByDir = {};
for (const r of uncovered) (uncByDir[dirname(r.rel)] ||= []).push(r);
for (const [d, rs] of Object.entries(uncByDir).sort((a, b) => sum(b[1], 'loc') - sum(a[1], 'loc'))) {
  console.log(`\n  ${d}/  —  ${rs.length} files, ${sum(rs, 'loc')} LOC`);
  for (const r of rs.sort((a, b) => b.loc - a.loc)) {
    const flag = r.nodeSites ? ` \x1b[33m[${r.nodeSites} node]\x1b[0m` : '';
    const bel = r.beluga ? ` \x1b[36m[${r.beluga} beluga]\x1b[0m` : '';
    console.log(`    ${String(r.loc).padStart(5)}  ${basename(r.rel)}${flag}${bel}`);
  }
}

if (WRITE) {
  const lines = [
    '# \\*jar inventory',
    '',
    '*Generated by `node scripts/starjar-census.mjs --write`. Do not hand-edit.*',
    '',
    `Source files: **${source.length}**, **${sum(source, 'loc')} LOC**. ` +
      `Excluded as build output: ${excluded.length} files, ${sum(excluded, 'loc')} LOC.`,
    '',
    '`node` = hardcoded grammar node-name sites (the Phase 0 purity-lint number).',
    '`cov` = has a line in `FILES.md` (the per-file record), i.e. actually analysed.',
    '',
    '| file | LOC | node | beluga | cov |',
    '|---|---:|---:|---:|:--:|',
    ...source.map((r) => `| \`${r.rel}\` | ${r.loc} | ${r.nodeSites || ''} | ${r.beluga || ''} | ${r.covered ? '✓' : '**—**'} |`),
  ];
  writeFileSync(join(starjarDir, 'INVENTORY.md'), lines.join('\n') + '\n');
  console.log('\nWrote docs/starjar/INVENTORY.md');
}
