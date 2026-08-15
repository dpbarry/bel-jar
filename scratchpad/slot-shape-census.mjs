// slot-shape-census.mjs — DOES THE REFERENCE PROOF NEED A *CONSTRUCTED* SLOT?
//
// Entry 49 measured that the candidate pool is inhabited by LOOKUP: a slot gets a
// bare in-scope name, a weakened spelling, a nullary constructor, the branch
// pattern's term, or an R-pool let. Widening that pool changed 0/207 verdicts, so
// the missing terms are ones the pool cannot express. This asks the reference
// proofs which shapes they actually require, at ARGUMENT-SLOT granularity:
//
//   ATOM      bare identifier / metavar / #param / _        → lookup CAN produce it
//   APP       a nested application in a slot                → needs CONSTRUCTION
//   LAMBDA    a slot containing \x. or mlam                 → needs BINDER construction
//   CALL      a slot whose head is a declared theorem name  → needs an INLINE CALL
//
// ⚠️ LAW ([[feedback-size-classes-by-toggle]]): this is a TEXT census. It sizes what
// proofs NEED, never what the search REACHES, so it is an upper bound and cannot
// supply the stake — only a toggle A/B can. Its job is to say whether the
// reformulation is aimed at a real shape, and the CONTROL GROUP is what makes that
// meaningful: if COMPLETE proofs carry the same profile, shape is not the
// discriminator and the hypothesis is wrong.
//
//   node scratchpad/slot-shape-census.mjs [--ledger F] [--ids F]
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const ledgerPath = arg('--ledger', 'results/corpus/library.native-merged-20260729.jsonl');
const idsPath = arg('--ids', 'scratchpad/cheapdeath-ids.txt');

const rows = fs.readFileSync(path.resolve(root, ledgerPath), 'utf8')
  .trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const studyIds = new Set(fs.readFileSync(path.resolve(root, idsPath), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean));

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
    } else {
      code = fs.readFileSync(abs, 'utf8');
    }
  } catch { code = null; }
  srcCache.set(prog, code);
  return code;
}

const declNameCache = new Map();
function declaredRecNames(prog) {
  if (declNameCache.has(prog)) return declNameCache.get(prog);
  const code = programOf(prog);
  const s = new Set();
  if (code) {
    for (const d of enumerateDecls(code)) {
      if (d && d.name && /^(rec|proof)\b|\band\s+rec\b/.test(String(d.text || '').trim())) s.add(d.name);
    }
  }
  declNameCache.set(prog, s);
  return s;
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

// Every balanced `[ … ]` box in the body, inner text returned.
function boxedTerms(body) {
  const out = [];
  const s = String(body || '');
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] !== '[') continue;
    let d = 0;
    for (let j = i; j < s.length; j += 1) {
      if (s[j] === '[') d += 1;
      else if (s[j] === ']') {
        d -= 1;
        if (d === 0) { out.push(s.slice(i + 1, j)); i = j; break; }
      }
    }
  }
  return out;
}

// Top-level tokens; parenthesised/bracketed groups stay whole.
function toks(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  const out = [];
  let depth = 0; let cur = '';
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

// Classify ONE argument slot.
function slotClass(tok, recNames) {
  const raw = String(tok).trim();
  const s = stripParens(raw);
  if (!s) return 'ATOM';
  if (s === '_') return 'ATOM';
  if (/^\\|^mlam\b|\\\s*\w+\s*\./.test(s)) return 'LAMBDA';
  const parts = toks(s);
  if (parts.length <= 1) {
    // bare identifier, metavar, #param, or a subst-closed meta `X[..]`
    return 'ATOM';
  }
  const head = stripParens(parts[0]);
  if (recNames.has(head)) return 'CALL';
  return 'APP';
}

// Every application found in the body's boxed terms AND at the comp level.
function analyse(body, recNames) {
  const stat = { slots: 0, ATOM: 0, APP: 0, LAMBDA: 0, CALL: 0, apps: 0, appsWithStructured: 0 };
  const consider = (termText) => {
    const parts = toks(termText);
    if (parts.length < 2) return;
    // Skip binder/keyword-led forms — those are not applications inhabiting a goal.
    const head = stripParens(parts[0]);
    if (/^(case|let|in|of|fn|mlam|if|then|else|impossible|rec|and|proof|by|\||=>)$/.test(head)) return;
    if (/^\\/.test(head)) return;
    stat.apps += 1;
    let structured = false;
    for (const a of parts.slice(1)) {
      const c = slotClass(a, recNames);
      stat.slots += 1;
      stat[c] += 1;
      if (c !== 'ATOM') structured = true;
    }
    if (structured) stat.appsWithStructured += 1;
  };

  for (const inner of boxedTerms(body)) {
    // `[g |- term]` → the part after the turnstile is the LF term
    const cut = Math.max(inner.lastIndexOf('|-'), inner.lastIndexOf('⊢'));
    const term = cut >= 0 ? inner.slice(cut + (inner[cut] === '⊢' ? 1 : 2)) : inner;
    consider(term);
    // nested applications inside slots count too
    for (const p of toks(term)) {
      const sp = stripParens(p);
      if (sp !== p.trim() || /^\(/.test(p)) consider(sp);
    }
  }
  // comp level: tail expressions after `=>` and after `=` in lets
  for (const seg of String(body).split(/=>|\bin\b/)) {
    const t = seg.trim().split('\n')[0];
    if (t && !/^[\[(]/.test(t)) consider(t);
  }
  return stat;
}

function groupStats(ids) {
  const g = { n: 0, withStructured: 0, slots: 0, ATOM: 0, APP: 0, LAMBDA: 0, CALL: 0, apps: 0, appsWithStructured: 0, unreadable: 0 };
  for (const id of ids) {
    const [prog, name] = id.split('#');
    const body = bodyOf(prog, name);
    if (body == null) { g.unreadable += 1; continue; }
    const st = analyse(body, declaredRecNames(prog));
    g.n += 1;
    if (st.appsWithStructured > 0) g.withStructured += 1;
    for (const k of ['slots', 'ATOM', 'APP', 'LAMBDA', 'CALL', 'apps', 'appsWithStructured']) g[k] += st[k];
  }
  return g;
}

const study = [...studyIds];
const control = rows.filter((r) => r.outcome === 'COMPLETE').map((r) => r.id);

const S = groupStats(study);
const C = groupStats(control);

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '—');
function show(label, g) {
  console.log(`\n== ${label} — ${g.n} proofs read (${g.unreadable} unreadable)`);
  console.log(`   proofs containing >=1 application with a STRUCTURED slot : ${g.withStructured} (${pct(g.withStructured, g.n)})`);
  console.log(`   applications                                             : ${g.apps}  (with a structured slot: ${g.appsWithStructured}, ${pct(g.appsWithStructured, g.apps)})`);
  console.log(`   argument slots                                           : ${g.slots}`);
  console.log(`     ATOM   (lookup can produce)  : ${String(g.ATOM).padStart(5)}  ${pct(g.ATOM, g.slots)}`);
  console.log(`     APP    (nested application)  : ${String(g.APP).padStart(5)}  ${pct(g.APP, g.slots)}`);
  console.log(`     LAMBDA (under a binder)      : ${String(g.LAMBDA).padStart(5)}  ${pct(g.LAMBDA, g.slots)}`);
  console.log(`     CALL   (inline theorem call) : ${String(g.CALL).padStart(5)}  ${pct(g.CALL, g.slots)}`);
  const nonAtom = g.APP + g.LAMBDA + g.CALL;
  console.log(`     → NON-ATOM total             : ${String(nonAtom).padStart(5)}  ${pct(nonAtom, g.slots)}`);
}

console.log('SLOT-SHAPE CENSUS — what shape does the reference proof need in an ARGUMENT SLOT?');
show('STUDY: in-fragment cheap deaths (stuck)', S);
show('CONTROL: proofs the engine already COMPLETES', C);

const sNon = (S.APP + S.LAMBDA + S.CALL) / (S.slots || 1);
const cNon = (C.APP + C.LAMBDA + C.CALL) / (C.slots || 1);
console.log('\n== VERDICT');
console.log(`   non-atomic slot rate  study ${(100 * sNon).toFixed(1)}%  vs  control ${(100 * cNon).toFixed(1)}%`
  + `   (ratio ${(sNon / (cNon || 1)).toFixed(2)}x)`);
console.log(`   proofs needing >=1 structured slot  study ${pct(S.withStructured, S.n)}  vs  control ${pct(C.withStructured, C.n)}`);
console.log('\n   If these two columns are close, SHAPE IS NOT THE DISCRIMINATOR and the');
console.log('   recursive-slot-synthesis hypothesis is not supported by the corpus.');
