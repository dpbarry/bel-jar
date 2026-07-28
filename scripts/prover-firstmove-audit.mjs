// prover-firstmove-audit.mjs — CLASS SIZING for the stuck residue, text only.
//
// The ledger already answers "where is the mass?": a STUCK row with `steps === 0`
// means the search accepted NOTHING at all. Group those by the FIRST MOVE the
// target's own reference proof makes and the tractable classes rank themselves —
// no oracle, no sweep, seconds. This is what showed (2026-07-25) that the
// "leading" context-induction slice was an 18-target class while `case` on a comp
// hypothesis was 194, and that the 194 were failing on MODEL FIDELITY, not search.
//
//   node scripts/prover-firstmove-audit.mjs [--ledger results/corpus/library.jsonl]
//                                           [--class CASECOMP] [--ids]
//
// ⚠️ Beluga writes binders with BOTH `=>` and `⇒` (and `->`/`→`). An ASCII-only
// binder regex mis-buckets half the corpus into "DIRECT term" — the first run of
// this audit did exactly that.
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; }
const ledgerPath = arg('--ledger', path.join('results', 'corpus', 'library.jsonl'));
const wantClass = arg('--class', null);
const showIds = args.includes('--ids');

const rows = new Map(); // dedupe by LAST outcome per id (the harness re-appends)
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

function bodyOf(prog, name) {
  const code = programOf(prog);
  if (!code) return null;
  const decls = enumerateDecls(code);
  const d = decls.find((x) => x && x.name === name && /^(rec|proof)\b|\band\s+rec\b/.test(String(x.text || '').trim()))
    || decls.find((x) => x && x.name === name);
  if (!d || !d.text) return null;
  const eq = String(d.text).indexOf('=');
  if (eq < 0) return null;
  return String(d.text).slice(eq + 1).replace(/^\s*\/[^/]*\/\s*/, '');
}

// The move an inhabitant of this type STARTS with, after its binders.
function classify(body) {
  let b = strip(body).trim();
  if (/^fun\b/.test(b)) return 'FUN/copattern (out of fragment)';
  for (let i = 0; i < 24; i += 1) {
    const m = /^(?:mlam|fn)\s+[^=⇒]*?(?:=>|⇒)/.exec(b);
    if (!m) break;
    b = b.slice(m[0].length).trim();
  }
  if (/^case\b/.test(b)) {
    const m = /^case\s+([\s\S]*?)\s+of\b/.exec(b);
    const scrut = m ? m[1].trim() : '';
    if (/^\[\s*[\p{L}_][\p{L}\p{N}_']*\s*\]$/u.test(scrut)) return 'CASE ctx-var (context induction)';
    if (/^\(/.test(scrut) && scrut.includes(',')) return 'CASE tuple (joint/diagonal split)';
    if (/^\[/.test(scrut)) return 'CASE box (LF derivation/term split)';
    return 'CASE comp-hyp (comp/ctype variable split)';
  }
  if (/^let\b/.test(b)) return 'LET (invert / call-then-use)';
  if (/^impossible\b/.test(b)) return 'IMPOSSIBLE';
  if (/^\?/.test(b)) return 'HOLE (reference itself incomplete)';
  return 'DIRECT term (fill / composition)';
}

const buckets = new Map();
for (const r of rows.values()) {
  if (r.outcome === 'COMPLETE' || r.outcome === 'PRECHECK_FAIL' || r.outcome === 'FAIL') continue;
  const [prog, name] = r.id.split('#');
  const body = bodyOf(prog, name);
  const cls = body == null ? 'NO BODY (harness artifact)' : classify(body);
  if (!buckets.has(cls)) buckets.set(cls, { n: 0, s0: 0, ids: [], devs: new Map() });
  const e = buckets.get(cls);
  e.n += 1;
  // TIMEOUT rows carry no meaningful step count.
  const s0 = r.outcome !== 'TIMEOUT' && (r.steps || 0) === 0;
  if (s0) { e.s0 += 1; e.ids.push(r.id); }
  const dev = prog.replace(/^data\//, '');
  e.devs.set(dev, (e.devs.get(dev) || 0) + 1);
}

console.log(`residue by REFERENCE-PROOF FIRST MOVE   (ledger ${ledgerPath})`);
console.log('n = non-COMPLETE targets in the class; s0 = of those, the ones whose search accepted NOTHING\n');
for (const [k, e] of [...buckets].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${String(e.n).padStart(4)}  s0=${String(e.s0).padStart(3)}   ${k}`);
  const top = [...e.devs].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map((x) => `${x[0].split('/').slice(-2).join('/')}=${x[1]}`);
  console.log(`               ${top.join('  ')}`);
}
if (showIds && wantClass) {
  const key = [...buckets.keys()].find((k) => k.toUpperCase().startsWith(wantClass.toUpperCase()));
  if (key) console.log(`\n${key} — step-0 ids:\n${buckets.get(key).ids.join('\n')}`);
}
