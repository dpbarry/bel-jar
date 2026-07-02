// Parity gate for scoped rechecking. Before any of this touches settlement, we
// must prove two things against ground-truth Beluga (headless, in Node):
//
//   P1  no false positives: on the known-good corpus, a SCOPED check of a decl
//       (prefix truncation, and prefix + stubbed earlier bodies) reports that
//       decl exactly as green as the FULL check does. This is the "phantom
//       certification error" class that must never resurface.
//
//   P2  no hidden errors: inject a real fault into a decl; the FULL check and
//       the SCOPED check must BOTH flag it, at the same line(s) within the decl.
//
// Scoping = prefix truncation (byte/line-exact for the edited decl) plus
// line-count-preserving body stubs, so diagnostics compare directly by line.
//
//   node tests/scope-parity.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parser } from '../editor-src/beluga-parser.js';
import { buildScopedSource, declIndicesForRanges, topDeclSpans } from '../editor-src/semantic/scoped-check.mjs';
import { pathsFromSourcesCfg } from './_library-cfg.mjs';

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
const Beluga = loadBelugaOnce();

function check(code) {
  const r = Beluga.checkFromString(code);
  return { ok: !!(r && r.ok), out: String((r && r.output) || '') };
}

// Same location patterns the production parser (bel-beluga-diag.mjs) uses.
function errorLines(raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n').replace(/\u001b?\[[0-9;]*m/g, '');
  const lines = new Set();
  let m;
  for (const re of [
    /[^\s:"]+\.bel:(\d+)\.\d+/g,
    /File\s+"[^"]*"\s*,\s*line\s+(\d+)/gi,
    /at line\s+(\d+),\s*characters?/gi,
  ]) {
    while ((m = re.exec(text)) !== null) lines.add(+m[1]);
  }
  return lines;
}

const lineOf = (src, off) => src.slice(0, off).split('\n').length;
const within = (set, a, b) => [...set].filter((l) => l >= a && l <= b).sort((x, y) => x - y);

const topDecls = (src) => topDeclSpans(parser.parse(src));

// Body expression span of a single rec/proof declaration (null if none found).
function declBodySpan(src, decl) {
  const tree = parser.parse(src);
  let span = null;
  tree.iterate({
    from: decl.from,
    to: decl.to,
    enter(ref) {
      if (span) return false;
      if (ref.name !== 'RecBody' && ref.name !== 'ProofDeclaration') return;
      let eq = null;
      for (let c = ref.node.firstChild; c; c = c.nextSibling) {
        if (c.name === '=') eq = c;
        else if (eq && (c.name === 'Expression' || c.name === 'ProofScript')) {
          span = { from: c.from, to: c.to };
          return false;
        }
      }
    },
  });
  return span;
}

// The SCOPED program is built by the shared production function so this gate
// guards exactly what settlement will run.
const scope = (src, keepIdx) => buildScopedSource(src, new Set(keepIdx), parser.parse(src));

// Evenly sample up to n indices from [0, len).
function sample(len, n) {
  if (len <= n) return [...Array(len).keys()];
  const step = len / n;
  return Array.from({ length: n }, (_, i) => Math.min(len - 1, Math.round(i * step)));
}

let failures = 0;
const note = (ok, msg) => { if (!ok) failures += 1; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

function runCorpusItem(label, src, { p1Samples, injectSamples }) {
  const decls = topDecls(src);
  console.log(`\n=== ${label}  (${decls.length} decls, ${src.length} bytes) ===`);

  // P1 — no false positives: a scoped check of a single dirty decl must be as
  // green as the full check, with no error inside the kept declaration.
  console.log('P1 no-false-positive (single dirty decl):');
  for (const k of sample(decls.length, p1Samples)) {
    const d = decls[k];
    const a = lineOf(src, d.from);
    const b = lineOf(src, d.to);
    const s = check(scope(src, [k]));
    note(s.ok && within(errorLines(s.out), a, b).length === 0, `decl#${k + 1} scoped green`);
  }

  // P1b — a multi-declaration dirty frontier (a signature change dirties
  // dependents too) must also stay green.
  if (decls.length >= 3) {
    console.log('P1b no-false-positive (multi-decl frontier):');
    for (const k of sample(decls.length - 2, Math.min(3, p1Samples))) {
      const keep = [k, k + 2];
      const s = check(scope(src, keep));
      const bad = keep.some((i) => within(errorLines(s.out), lineOf(src, decls[i].from), lineOf(src, decls[i].to)).length);
      note(s.ok && !bad, `frontier {${k + 1},${k + 3}} scoped green`);
    }
  }

  // P2 — no hidden errors: inject an unbound reference into a decl body; the
  // full check and the scoped check must both flag the same line(s) in that decl.
  console.log('P2 no-hidden-error (injected fault caught identically):');
  const withBodies = decls.map((d, k) => ({ d, k, span: declBodySpan(src, d) })).filter((x) => x.span);
  for (const s of sample(withBodies.length, injectSamples)) {
    const { d, span } = withBodies[s];
    const mutated = src.slice(0, span.from) + ' Z9_unbound_Z9 ' + src.slice(span.to);
    const keepIdx = declIndicesForRanges(parser.parse(mutated), [{ from: d.from, to: span.to }]);
    const mDecls = topDecls(mutated);
    const md = [...keepIdx].map((i) => mDecls[i]).find(Boolean) || d;
    const a = lineOf(mutated, md.from);
    const b = lineOf(mutated, md.to);
    const full = check(mutated);
    const scoped = check(buildScopedSource(mutated, keepIdx, parser.parse(mutated)));
    const fLines = within(errorLines(full.out), a, b);
    const sLines = within(errorLines(scoped.out), a, b);
    note(!full.ok, `decl body#${s + 1} full flags fault`);
    note(!scoped.ok, `decl body#${s + 1} scoped flags fault`);
    note(JSON.stringify(fLines) === JSON.stringify(sLines),
      `decl body#${s + 1} same lines in decl (full ${JSON.stringify(fLines)} vs scoped ${JSON.stringify(sLines)})`);
  }
}

const SELF = [
  'examples/poplmark/poplmark.bel',
  'examples/literate_beluga/0Beginner/Type_Uniqueness.bel',
  'examples/arith/arith.bel',
  'examples/literate_beluga/0Beginner/Parallel_Reduction.bel',
];
for (const rel of SELF) {
  runCorpusItem(rel, readFileSync(join(dataRoot, rel), 'utf8'), { p1Samples: 6, injectSamples: 3 });
}

// One heavy suite: full checks are ~20s, so keep samples small.
const suite = 'case-studies/classical-processes';
const paths = pathsFromSourcesCfg(dataRoot, suite);
if (paths && paths.length) {
  const src = paths.map((p) => readFileSync(join(dataRoot, p), 'utf8')).join('\n\n');
  runCorpusItem(`suite:${suite}`, src, { p1Samples: 5, injectSamples: 1 });
}

console.log(`\n${failures ? `PARITY FAILED: ${failures} check(s)` : 'PARITY OK'}`);
process.exit(failures ? 1 : 0);
