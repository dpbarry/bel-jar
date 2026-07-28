// prover-intro-audit.mjs — MODEL-vs-CORPUS falsification for the FIRST MOVE.
//
// Almost every stuck target dies at step 0, and step 0 is the intro: the binder
// sequence the theorem's type dictates. If our comp-type parse disagrees with the
// type, `buildIntroSkeleton` emits an expression of the wrong SHAPE, the checker
// rejects it, and the theorem has no first move at all — indistinguishable from a
// genuine search gap.
//
// The corpus states the right answer: the reference proof's own leading
// `mlam`/`fn` binders. This compares the two, text only, no oracle, ~1 minute.
// It is the arity audit one level up (see prover-arity-audit.mjs) and it is how
// the mid-spine-Pi intro bug and the parenthesised-measure bug were found.
//
//   node scripts/prover-intro-audit.mjs [--dir library/data] [--all]
//
// A mismatch is a real defect ONLY when the reference is in the inductive
// fragment: `fun`/copattern proofs are out of scope and are skipped, as are
// references that open with a `let`/`case` before binding anything.
import fs from 'node:fs';
import path from 'node:path';
import { enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { theoremUnderProof } from '../js/editor-src/prover/prover-hyp.mjs';
import { buildIntroSkeleton } from '../js/editor-src/prover/hole-split.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; }
const dir = path.resolve(root, arg('--dir', path.join('library', 'data')));
const showAll = args.includes('--all');

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.bel')) files.push(p);
  }
}(dir));

const strip = (s) => String(s || '').replace(/%\{[\s\S]*?\}%/g, ' ').replace(/%[^\n]*/g, ' ');

// The reference proof's leading binder KINDS, in order.
function referenceBinders(body) {
  let b = strip(body).trim().replace(/^\s*\/[^/]*\/\s*/, '').trim();
  if (/^fun\b/.test(b)) return null; // copattern — out of fragment
  const kinds = [];
  for (let i = 0; i < 32; i += 1) {
    const m = /^(mlam|fn)\s+([^=⇒]*?)(?:=>|⇒)/.exec(b);
    if (!m) break;
    const n = m[2].split(',').filter((s) => s.trim()).length || 1;
    for (let k = 0; k < n; k += 1) kinds.push(m[1]);
    b = b.slice(m[0].length).trim();
  }
  return kinds;
}

// The binder KINDS our own intro skeleton would emit.
function modelBinders(typeText) {
  const sk = buildIntroSkeleton(typeText, { usedNames: [] });
  if (!sk) return null;
  return [...String(sk).matchAll(/\b(mlam|fn)\b/g)].map((m) => m[1]);
}

let checked = 0;
const bad = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let decls = [];
  try { decls = enumerateDecls(src); } catch { decls = []; }
  for (const d of decls) {
    if (!d || !d.text || !/^\s*(rec|proof)\b/.test(String(d.text))) continue;
    let thm = null;
    try { thm = theoremUnderProof(d.text); } catch { thm = null; }
    if (!thm || !thm.compType || !thm.compType.raw) continue;
    const eq = String(d.text).indexOf('=');
    if (eq < 0) continue;
    const ref = referenceBinders(String(d.text).slice(eq + 1));
    if (!ref || !ref.length) continue; // no binders / out of fragment
    const mine = modelBinders(thm.compType.raw);
    if (!mine) continue;
    checked += 1;
    if (mine.join(',') !== ref.join(',')) {
      bad.push({
        id: `${path.relative(root, f)}#${d.name}`,
        ref: ref.join(','),
        mine: mine.join(','),
      });
    }
  }
}

console.log(`theorems compared: ${checked}   intro-shape mismatches: ${bad.length}`);
const byShape = new Map();
for (const b of bad) {
  const k = `model[${b.mine}]  vs  reference[${b.ref}]`;
  if (!byShape.has(k)) byShape.set(k, []);
  byShape.get(k).push(b.id);
}
for (const [k, list] of [...byShape].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n── ${list.length}×  ${k}`);
  for (const id of (showAll ? list : list.slice(0, 8))) console.log('   ', id);
  if (!showAll && list.length > 8) console.log(`    … ${list.length - 8} more (--all)`);
}
process.exit(bad.length ? 1 : 0);
