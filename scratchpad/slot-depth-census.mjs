// slot-depth-census.mjs — HOW DEEP is the nesting the stuck proofs need?
//
// slot-shape-census.mjs found the one discriminating shape: a NESTED APPLICATION in
// an argument slot, 11.0% of study slots vs 2.7% of control (4.1x). Binders (6.5 vs
// 7.3) and inline theorem calls (3.7 vs 5.0) are MORE common in proofs the engine
// already completes, so those are not the gap.
//
// `nestedCtorArgFills` already supplies depth-2 constructor witnesses. So the live
// question is whether the gap is DEPTH (we stop one level too shallow) or BREADTH
// (we build the wrong depth-2 terms). This measures the nesting depth of every
// application slot in both groups, and dumps examples so the number can be read
// against real text rather than trusted.
//
//   node scratchpad/slot-depth-census.mjs [--examples N]
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const nEx = Number(arg('--examples', '8')) || 8;

const rows = fs.readFileSync(path.resolve(root, 'results/corpus/library.native-merged-20260729.jsonl'), 'utf8')
  .trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const studyIds = fs.readFileSync(path.resolve(root, 'scratchpad/cheapdeath-ids.txt'), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean);

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
function bodyOf(prog, name) {
  const code = programOf(prog);
  if (!code) return null;
  const decls = enumerateDecls(code);
  const d = decls.find((x) => x && x.name === name && /^(rec|proof)\b|\band\s+rec\b/.test(String(x.text || '').trim()));
  const text = d ? d.text : (decls.find((x) => x && x.name === name) || {}).text;
  if (!text) return null;
  const eq = text.indexOf('=');
  return eq < 0 ? null : text.slice(eq + 1);
}
function boxedTerms(body) {
  const out = []; const s = String(body || '');
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] !== '[') continue;
    let d = 0;
    for (let j = i; j < s.length; j += 1) {
      if (s[j] === '[') d += 1;
      else if (s[j] === ']') { d -= 1; if (d === 0) { out.push(s.slice(i + 1, j)); i = j; break; } }
    }
  }
  return out;
}
function toks(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  const out = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '<') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '>') depth -= 1;
    if (ch === ' ' && depth === 0) { if (cur) { out.push(cur); cur = ''; } } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
const stripParens = (t) => {
  let s = String(t).trim();
  while (s.startsWith('(') && s.endsWith(')')) {
    let d = 0; let whole = true;
    for (let i = 0; i < s.length; i += 1) {
      if (s[i] === '(') d += 1;
      else if (s[i] === ')') { d -= 1; if (d === 0 && i < s.length - 1) { whole = false; break; } }
    }
    if (!whole) break;
    s = s.slice(1, -1).trim();
  }
  return s;
};

// Application nesting depth: an atom is 0, `c a b` with atomic args is 1,
// `c (d a) b` is 2, and so on. Binder forms are skipped (measured separately).
function appDepth(term) {
  const s = stripParens(String(term || '').trim());
  if (!s) return 0;
  if (/^\\|^mlam\b/.test(s)) return 0;
  const parts = toks(s);
  if (parts.length < 2) return 0;
  const head = stripParens(parts[0]);
  if (/^(case|let|in|of|fn|mlam|if|then|else|impossible|rec|and|proof|by|\||=>)$/.test(head)) return 0;
  let deepest = 0;
  for (const a of parts.slice(1)) {
    const d = appDepth(a);
    if (d > deepest) deepest = d;
  }
  return 1 + deepest;
}

function collect(ids) {
  const hist = new Map();     // depth -> count of applications
  const examples = [];
  let apps = 0; let n = 0;
  for (const id of ids) {
    const [prog, name] = id.split('#');
    const body = bodyOf(prog, name);
    if (body == null) continue;
    n += 1;
    for (const inner of boxedTerms(body)) {
      const cut = Math.max(inner.lastIndexOf('|-'), inner.lastIndexOf('⊢'));
      const term = (cut >= 0 ? inner.slice(cut + (inner[cut] === '⊢' ? 1 : 2)) : inner).trim();
      const d = appDepth(term);
      if (d < 1) continue;
      apps += 1;
      hist.set(d, (hist.get(d) || 0) + 1);
      if (d >= 2 && examples.length < 400) examples.push({ id: name, d, term: term.slice(0, 100) });
    }
  }
  return { hist, apps, n, examples };
}

const study = collect(studyIds);
const control = collect(rows.filter((r) => r.outcome === 'COMPLETE').map((r) => r.id));

function show(label, g) {
  console.log(`\n== ${label} — ${g.n} proofs, ${g.apps} boxed applications`);
  const keys = [...g.hist.keys()].sort((a, b) => a - b);
  for (const k of keys) {
    const v = g.hist.get(k);
    console.log(`   depth ${k}: ${String(v).padStart(5)}  ${(100 * v / g.apps).toFixed(1)}%`);
  }
  const deep = keys.filter((k) => k >= 2).reduce((a, k) => a + g.hist.get(k), 0);
  console.log(`   → depth >=2 : ${String(deep).padStart(5)}  ${(100 * deep / g.apps).toFixed(1)}%`);
  const deep3 = keys.filter((k) => k >= 3).reduce((a, k) => a + g.hist.get(k), 0);
  console.log(`   → depth >=3 : ${String(deep3).padStart(5)}  ${(100 * deep3 / g.apps).toFixed(1)}%`);
  return { deep, deep3 };
}

console.log('SLOT-DEPTH CENSUS — application nesting depth in boxed terms');
const S = show('STUDY: in-fragment cheap deaths', study);
const C = show('CONTROL: proofs the engine COMPLETES', control);

console.log('\n== VERDICT');
console.log(`   depth>=2 share  study ${(100 * S.deep / study.apps).toFixed(1)}%  vs  control ${(100 * C.deep / control.apps).toFixed(1)}%`
  + `  (ratio ${((S.deep / study.apps) / (C.deep / control.apps || 1)).toFixed(2)}x)`);
console.log(`   depth>=3 share  study ${(100 * S.deep3 / study.apps).toFixed(1)}%  vs  control ${(100 * C.deep3 / control.apps).toFixed(1)}%`
  + `  (ratio ${((S.deep3 / study.apps) / (C.deep3 / control.apps || 1)).toFixed(2)}x)`);

console.log(`\n== STUDY examples, depth>=2 (read these — the number is only as good as the text):`);
for (const e of study.examples.slice(0, nEx)) console.log(`   d=${e.d}  ${e.id}:  ${e.term}`);
console.log(`\n== CONTROL examples, depth>=2 (the engine ALREADY builds these):`);
for (const e of control.examples.slice(0, nEx)) console.log(`   d=${e.d}  ${e.id}:  ${e.term}`);
