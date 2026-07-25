// Evidence for the real speed lever: does Beluga's check time scale with how
// much of the program it is handed? If checking the whole file costs far more
// than checking the edited declaration's neighborhood, then the win is to let
// JS (which already knows the dependency graph) hand Beluga only what the edit
// touched — Beluga stays the authority, it just does proportionally less work.
//
// This is a MEASUREMENT, not editor code. It loads Beluga once and times
// checkFromString on growing prefixes of a real tier-A file. Prefixes are valid
// programs because Beluga is top-down (earlier decls never depend on later ones;
// mutual `and` groups parse as one top-level decl and stay intact).
//
//   node tests/measure-check-scaling.mjs [relPathUnderLibraryData]

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parser } from '../js/editor-src/beluga-parser.js';
import { pathsFromSourcesCfg } from './_library-cfg.mjs';
import { assembleCheckerCode } from '../js/editor-src/semantic/project-prelude.mjs';
import {
  compressPrelude,
  buildCompressedCheckerCode,
  keepIndicesForFrontier,
  topDeclSpans,
} from '../js/editor-src/semantic/compress-development.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dataRoot = join(root, 'library', 'data');

function loadBelugaOnce() {
  const code = readFileSync(join(root, 'beluga_web.bc.js'), 'utf8');
  const ctx = { console, TextDecoder, TextEncoder, setTimeout, clearTimeout, globalThis: {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.Beluga;
}

// End offsets of each top-level declaration (direct children of the root),
// skipping comments/whitespace, so a prefix [0, end] is a whole-decl boundary.
function topLevelDeclEnds(src) {
  const tree = parser.parse(src);
  const ends = [];
  const cur = tree.topNode.cursor();
  if (!cur.firstChild()) return ends;
  do {
    const n = cur.name;
    if (n === 'LineComment' || n === 'BlockComment' || n === '⚠') continue;
    if (cur.to > (ends[ends.length - 1] ?? -1)) ends.push(cur.to);
  } while (cur.nextSibling());
  return ends;
}

const arg = process.argv[2] || 'examples/poplmark/poplmark.bel';
const isSuite = !arg.endsWith('.bel') && !arg.endsWith('.elf');

let src;
if (isSuite) {
  const paths = pathsFromSourcesCfg(dataRoot, arg);
  if (!paths || !paths.length) { console.error(`no cfg sources for suite ${arg}`); process.exit(1); }
  src = paths.map((p) => readFileSync(join(dataRoot, p), 'utf8')).join('\n\n');
  console.log(`suite: ${arg}  (${paths.length} files)`);
} else {
  src = readFileSync(join(dataRoot, arg), 'utf8');
  console.log(`file: ${arg}`);
}
const ends = topLevelDeclEnds(src);
const totalDecls = ends.length;
console.log(`bytes: ${src.length}, top-level decls: ${totalDecls}\n`);

const Beluga = loadBelugaOnce();

function timeCheck(code) {
  const t0 = performance.now();
  const r = Beluga.checkFromString(code);
  const ms = performance.now() - t0;
  return { ms, ok: !!(r && r.ok) };
}

// Warm once (first call pays JIT / one-time setup) so comparisons are fair.
timeCheck(src.slice(0, ends[Math.min(2, totalDecls - 1)] ?? src.length));

let full;
if (!isSuite) {
  const fractions = [0.25, 0.5, 0.75, 1.0];
  const rows = [];
  for (const frac of fractions) {
    const k = Math.max(1, Math.round(totalDecls * frac));
    const code = src.slice(0, ends[k - 1]);
    const { ms, ok } = timeCheck(code);
    rows.push({ frac, k, bytes: code.length, ms, ok });
  }
  console.log('prefix   decls   bytes     ok     check ms');
  for (const r of rows) {
    console.log(
      `${String(Math.round(r.frac * 100)).padStart(4)}%  ${String(r.k).padStart(6)}  ${String(r.bytes).padStart(7)}  ${r.ok ? ' ok ' : 'FAIL'}   ${r.ms.toFixed(1).padStart(9)}`,
    );
  }
  full = rows[rows.length - 1];
  const quarter = rows[0];
  if (full && quarter && quarter.ms > 0) {
    console.log(`\nfull / quarter time ratio: ${(full.ms / quarter.ms).toFixed(1)}x\n`);
  }
} else {
  full = timeCheck(src);
  console.log(`full check: ${full.ms.toFixed(1)} ms (ok=${full.ok})\n`);
}

// --- Linchpin: stub unchanged proof/rec bodies, keep signatures ---
// Simulate "edit the LAST heavy decl; everything before it is unchanged+green".
// Replace each earlier rec/proof BODY with a hole `?` (signature preserved), so
// Beluga registers their types but does not re-verify their proofs. If this is
// both much faster AND the program still checks, then JS can drive Beluga to
// re-verify only the edited neighborhood while trusting the rest.
// [from,to) of each top-level Declaration.
function topDecls(src) {
  const tree = parser.parse(src);
  const cur = tree.topNode.cursor();
  const out = [];
  if (cur.firstChild()) {
    do { if (cur.name === 'Declaration') out.push({ from: cur.from, to: cur.to }); }
    while (cur.nextSibling());
  }
  return out;
}

// RecBody / proof body expression spans whose body ends at or before `cutoff`.
function bodySpansToStub(src, cutoff) {
  const tree = parser.parse(src);
  const spans = [];
  tree.iterate({
    enter(ref) {
      if (ref.name !== 'RecBody' && ref.name !== 'ProofDeclaration') return;
      let eq = null;
      let body = null;
      for (let c = ref.node.firstChild; c; c = c.nextSibling) {
        if (c.name === '=') eq = c;
        else if (eq && (c.name === 'Expression' || c.name === 'ProofScript')) { body = c; break; }
      }
      if (eq && body && body.to > body.from && body.to <= cutoff) {
        spans.push({ from: body.from, to: body.to });
      }
    },
  });
  return spans.sort((a, b) => a.from - b.from);
}

function applyStubs(src, spans) {
  let out = src;
  for (const s of spans.slice().sort((a, b) => b.from - a.from)) {
    out = out.slice(0, s.from) + '?' + out.slice(s.to);
  }
  return out;
}

// Simulate "edit theorem at position `frac`": check the prefix up to and
// including that declaration, with every EARLIER rec/proof body stubbed to `?`
// (signatures kept), and everything after it omitted (those stay green because
// the edited decl's signature is unchanged). This is the exact shape of what a
// JS-scoped recheck would hand Beluga.
const decls = topDecls(src);
console.log('--- scoped-recheck simulation (edit one theorem; trust the rest) ---');
console.log('edited@   prefix decls   stubbed   ok     scoped ms   vs full');
for (const frac of [0.25, 0.5, 0.75]) {
  const idx = Math.max(0, Math.min(decls.length - 1, Math.round(decls.length * frac) - 1));
  const target = decls[idx];
  const prefix = src.slice(0, target.to);
  const spans = bodySpansToStub(prefix, target.from);
  const scoped = applyStubs(prefix, spans);
  const { ms, ok } = timeCheck(scoped);
  console.log(
    `${String(Math.round(frac * 100)).padStart(5)}%   ${String(idx + 1).padStart(11)}   ${String(spans.length).padStart(7)}   ${ok ? ' ok ' : 'FAIL'}   ${ms.toFixed(1).padStart(9)}   ${(full.ms / ms).toFixed(1)}x`,
  );
}
console.log('\nok=true means earlier signatures stayed in scope while their proofs were');
console.log('skipped — a normal mid-file edit rechecks in a fraction of the 25s full pass.');

// --- Late-suite lever: full prelude+active vs signature-compressed frontier ---
// Editing the LAST file of a suite (or the last decl of a concat) currently
// hands Beluga the entire development. Compression stubs every body outside
// the dirty frontier (all of prelude + earlier active decls).
function splitSuiteAsPreludeActive(fullSrc, paths) {
  if (!paths || paths.length < 2) {
    // Single-file: treat first 75% of decls as "prelude", last 25% as active.
    const d = topDecls(fullSrc);
    if (d.length < 4) return null;
    const cut = d[Math.floor(d.length * 0.75) - 1].to;
    return {
      preludeCode: fullSrc.slice(0, cut),
      activeCode: fullSrc.slice(cut).replace(/^\n+/, ''),
      label: 'synthetic-75/25-split',
    };
  }
  const prePaths = paths.slice(0, -1);
  const activePath = paths[paths.length - 1];
  return {
    preludeCode: prePaths.map((p) => readFileSync(join(dataRoot, p), 'utf8')).join('\n\n'),
    activeCode: readFileSync(join(dataRoot, activePath), 'utf8'),
    label: `suite-last=${activePath}`,
  };
}

const suitePaths = isSuite ? pathsFromSourcesCfg(dataRoot, arg) : null;
const split = splitSuiteAsPreludeActive(src, suitePaths);
if (split) {
  const { preludeCode, activeCode, label } = split;
  const prelude = {
    code: preludeCode,
    spans: [{ id: 'pre', name: 'prelude.bel', startLine: 1, endLine: preludeCode.split('\n').length }],
    offsetLines: preludeCode.split('\n').length + 1,
    names: new Set(),
  };
  const activeTree = parser.parse(activeCode);
  const activeDecls = topDeclSpans(activeTree);
  const lastIdx = Math.max(0, activeDecls.length - 1);
  const keepIdx = keepIndicesForFrontier(activeTree, activeDecls.length
    ? [activeDecls[lastIdx]]
    : []);

  const fullAssembled = assembleCheckerCode(activeCode, prelude).code;
  const compressed = buildCompressedCheckerCode({
    fileCode: activeCode,
    prelude,
    keepIdx,
    tree: activeTree,
    activeSrc: activeCode,
  });

  console.log(`\n--- late-suite compression (${label}) ---`);
  console.log(`prelude bytes: ${preludeCode.length}  active bytes: ${activeCode.length}`);
  console.log(`full assembled bytes: ${fullAssembled.length}`);
  if (compressed) {
    console.log(`compressed bytes:    ${compressed.code.length}`);
    const fullT = timeCheck(fullAssembled);
    const compT = timeCheck(compressed.code);
    const stubPre = compressPrelude(prelude);
    console.log(`full check:       ${fullT.ms.toFixed(1)} ms  ok=${fullT.ok}`);
    console.log(`compressed check: ${compT.ms.toFixed(1)} ms  ok=${compT.ok}`);
    if (compT.ms > 0) {
      console.log(`speedup:          ${(fullT.ms / compT.ms).toFixed(1)}x`);
    }
    console.log(`prelude stubbed:  ${stubPre.code.length} bytes (was ${preludeCode.length})`);
  } else {
    console.log('compressed: (null — empty frontier)');
  }
}
