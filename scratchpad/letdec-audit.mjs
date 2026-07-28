// letdec-audit.mjs — TEXT-ONLY: where does the reference proof's RECURSIVE call
// get its DECREASING argument from?
//
// `decSubderivNames` (the engine's totality criterion, gating synth's decOk
// facts AND now the greedy recurse pool) walks `openCasesAt` only — so a
// sub-derivation bound by a `let`-INVERSION (`let [g |- ctor S] = d in`) is
// invisible to it, even though Beluga treats a one-branch let exactly like a
// case. This audit measures how much of the stuck residue depends on that.
//
// For each stuck+totalied target: parse its own reference body, find the
// self-recursive calls, take the name in the DECREASING argument slot, and
// classify where that name is bound: a `case` arm pattern, a `let` pattern, an
// original fn binder (no descent — a non-structural/mutual call), or unknown.
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { theoremUnderProof } from '../js/editor-src/prover/prover-orchestrator.mjs';
import { decreasingArgIndex } from '../js/editor-src/prover/prover-comp-type.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
const ledgerPath = arg('--ledger', path.join('results', 'corpus', 'library.jsonl'));

const rows = new Map();
for (const l of fs.readFileSync(path.resolve(root, ledgerPath), 'utf8').split('\n').filter(Boolean)) {
  try { const r = JSON.parse(l); rows.set(r.id, r); } catch { /* skip */ }
}

const srcCache = new Map();
function programOf(prog) {
  if (srcCache.has(prog)) return srcCache.get(prog);
  let code = null;
  try {
    const abs = path.join(root, 'library', prog);
    if (prog.endsWith('.cfg')) {
      const dir = path.dirname(abs);
      code = assembleCfgProgram(fs.readFileSync(abs, 'utf8'), (n) => {
        const p = path.join(dir, n);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
      }).code;
    } else code = fs.readFileSync(abs, 'utf8');
  } catch { code = null; }
  srcCache.set(prog, code);
  return code;
}

const strip = (s) => String(s || '').replace(/%\{[\s\S]*?\}%/g, ' ').replace(/%[^\n]*/g, ' ');

// Split a call's argument list at TOP-LEVEL: `[g |- X]` / `(f y)` / `bare`.
function topArgs(s) {
  const outA = [];
  let cur = '';
  let d = 0;
  for (const ch of s) {
    if (ch === '[' || ch === '(') d += 1;
    if (ch === ']' || ch === ')') d -= 1;
    if (d === 0 && /\s/.test(ch)) { if (cur.trim()) outA.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) outA.push(cur.trim());
  return outA;
}
const nameIn = (a) => {
  // A boxed sub-derivation is routinely spelled with an explicit substitution
  // (`[g |- X[..]]`, `[g, x:tm |- X[.., x]]`) — strip it before reading the name,
  // or every under-binder recursion reads as an unanalysable "complex term".
  const s = String(a).replace(/\[\s*\.\.[^\]]*\]\s*(?=\]|$)/g, '');
  const m = /(?:\|-|⊢)\s*([\p{L}_][\p{L}\p{N}_']*)\s*\]$/u.exec(s) || /^([\p{L}_][\p{L}\p{N}_']*)$/u.exec(s);
  return m ? m[1] : null;
};

const buckets = new Map();
const ids = new Map();
for (const r of rows.values()) {
  if (r.outcome === 'COMPLETE' || r.outcome === 'PRECHECK_FAIL' || r.outcome === 'FAIL') continue;
  const [prog, name] = r.id.split('#');
  const code = programOf(prog);
  if (!code) continue;
  const decls = enumerateDecls(code);
  const d = decls.find((x) => x && x.name === name && /^(rec|proof)\b|\band\s+rec\b/.test(String(x.text || '').trim()))
    || decls.find((x) => x && x.name === name);
  if (!d || !d.text) continue;
  let thm = null;
  try { thm = theoremUnderProof(d.text); } catch { thm = null; }
  if (!thm || !thm.compType || !thm.totality) continue;
  const decI = decreasingArgIndex(thm);
  if (decI < 0) continue;
  const eq = String(d.text).indexOf('=');
  const body = strip(String(d.text).slice(eq + 1)).replace(/^\s*\/[^/]*\/\s*/, '');
  // Self-recursive calls in the reference body.
  const callRe = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s+([^\\n;]*)`, 'g');
  let m;
  let bucket = null;
  while ((m = callRe.exec(body))) {
    const as = topArgs(m[1]);
    // Skip implicit-looking leading `[_]`/`[ ]` context args when counting slots.
    const slots = as.filter((a) => !/^\[\s*\]$/.test(a) && !/^\[\s*_\s*\]$/.test(a));
    const a = slots[decI];
    if (!a) continue;
    const n = nameIn(a);
    if (!n) { bucket = bucket || 'complex-term'; continue; }
    // Where is `n` bound in the body?
    const caseBound = new RegExp(`\\|[^\\n]*\\b${n}\\b[^\\n]*(?:=>|⇒)`).test(body);
    const letBound = new RegExp(`\\blet\\b[^=\\n]*\\b${n}\\b[^=\\n]*=`).test(body);
    const fnBound = new RegExp(`\\b(?:fn|mlam)\\s+${n}\\b`).test(body);
    const b = caseBound ? 'case-arm (covered today)'
      : letBound ? 'LET-inversion (INVISIBLE to decSubderivNames)'
        : fnBound ? 'original binder (non-structural / mutual)'
          : 'unknown';
    // Rank: a target counts as LET if ANY of its recursive calls needs it.
    if (b.startsWith('LET')) { bucket = b; break; }
    bucket = bucket || b;
  }
  if (!bucket) continue;
  buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  if (!ids.has(bucket)) ids.set(bucket, []);
  ids.get(bucket).push(r.id);
}

console.log('stuck+totalied targets whose REFERENCE proof recurses, by where the DECREASING argument is bound:\n');
for (const [k, v] of [...buckets].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
const key = [...buckets.keys()].find((k) => k.startsWith('LET'));
if (key && args.includes('--ids')) {
  console.log(`\n${key}:`);
  for (const i of ids.get(key).sort()) console.log(`  ${i}`);
}
