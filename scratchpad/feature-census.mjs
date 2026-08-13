// feature-census.mjs — the PRIORITISATION instrument. Over every STUCK/TIMEOUT
// corpus target, count which SYNTACTIC FEATURES its own reference proof uses.
// Text-only (seconds, no oracle), so it answers "what does the residue NEED?"
// across the whole map instead of one class at a time.
//
// ⚠️ This sizes what proofs NEED, never what the search REACHES — the mixed-slot
// slice measured 214 here and 38 structurally. Use it to RANK candidates for a
// toggle A/B, never as a payoff estimate. [[feedback-size-classes-by-toggle]]
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
const ledgerPath = arg('--ledger', 'results/corpus/library.native-merged-20260729.jsonl');
const dumpFeature = arg('--dump', null);

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
function partsOf(prog, name) {
  const code = programOf(prog);
  if (!code) return null;
  const decls = enumerateDecls(code);
  const d = decls.find((x) => x && x.name === name
    && /^(rec|proof)\b|\band\s+rec\b/.test(String(x.text || '').trim()))
    || decls.find((x) => x && x.name === name);
  if (!d) return null;
  const text = String(d.text || '');
  const eq = text.indexOf('=');
  if (eq < 0) return null;
  return { head: text.slice(0, eq), body: text.slice(eq + 1) };
}

// Each feature: does the reference proof use it? Ordered roughly by suspected cost.
const FEATURES = [
  ['ctx-split  `case [g] of`  (context-structural induction)',
    (b) => /case\s*\[\s*[\p{Ll}][\p{L}\p{N}_']*\s*\]\s*of/u.test(b)],
  ['ctx-measure `/ total g (f g) /` on a schema binder',
    (b, h) => /\/\s*total\s+([\p{Ll}][\p{L}\p{N}_']*)\s*\(/u.test(h)
      && /\{\s*[\p{Ll}][\p{L}\p{N}_']*\s*:\s*[\p{Ll}][\p{L}\p{N}_']*\s*\}/u.test(h)],
  ['param-var Pi binder `{#p : #[…]}`',
    (b, h) => /\{\s*#[\p{L}_][\p{L}\p{N}_']*\s*:/u.test(h)],
  ['subst-var Pi binder `{$S : $[…]}`',
    (b, h) => /\{\s*\$[\p{L}_][\p{L}\p{N}_']*\s*:/u.test(h)],
  ['nested ctor application in an argument slot',
    (b) => /\(\s*[\p{L}_][\p{L}\p{N}_'-]*\s+[^)]+\)/u.test(b)],
  ['block projection of a CONTEXT binder `[… b : block … |- b.2]`',
    (b) => {
      for (const m of b.matchAll(/\[([^\[\]]*)(?:\|-|⊢)([^\[\]]*)\]/gu)) {
        const t = m[2].trim();
        const pm = /^([\p{Ll}][\p{L}\p{N}_']*)\.[\p{L}\p{N}_']+$/u.exec(t);
        if (pm && new RegExp(`(?:^|,)\\s*${pm[1]}\\s*:\\s*block\\b`, 'u').test(m[1])) return true;
      }
      return false;
    }],
  ['ctype pattern let `let (Ctor a b) = x in`',
    (b) => /let\s*\(?\s*\p{Lu}[\p{L}\p{N}_']*\s+[\p{L}_]/u.test(b)],
  ['impossible on a parameter `impossible [ |- #p…]`',
    (b) => /impossible\s*\[[^\]]*#/u.test(b)],
  ['tuple / pair `(a , b)` construction',
    (b) => /\(\s*[^()]*,[^()]*\)\s*(?:$|;|in\b)/u.test(b)],
  ['substitution applied to a meta `X[$S]`',
    (b) => /[\p{L}_][\p{L}\p{N}_']*\[\s*\$[\p{L}_]/u.test(b)],
  ['weakening `X[..]`',
    (b) => /[#$]?[\p{L}][\p{L}\p{N}_']*\[\.\.\]/u.test(b)],
  ['nested case (case inside a case arm)',
    (b) => (b.match(/\bcase\b/g) || []).length >= 2],
];

const rows = fs.readFileSync(path.resolve(root, ledgerPath), 'utf8')
  .split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const counts = FEATURES.map(() => []);
let n = 0;
for (const r of rows) {
  if (r.outcome !== 'STUCK' && r.outcome !== 'TIMEOUT') continue;
  const id = r.id || `${r.program}#${r.name}`;
  const [prog, name] = id.split('#');
  const p = partsOf(prog, name);
  if (!p) continue;
  n += 1;
  FEATURES.forEach(([, fn], i) => { try { if (fn(p.body, p.head)) counts[i].push(id); } catch { /* noop */ } });
}
console.log(`stuck/timeout readable: ${n}\n`);
const order = FEATURES.map((f, i) => ({ label: f[0], ids: counts[i] })).sort((a, b) => b.ids.length - a.ids.length);
for (const o of order) {
  console.log(`${String(o.ids.length).padStart(4)}  (${String(Math.round(100 * o.ids.length / n)).padStart(2)}%)  ${o.label}`);
}
if (dumpFeature) {
  const f = order.find((o) => o.label.toLowerCase().includes(dumpFeature.toLowerCase()));
  if (f) {
    fs.writeFileSync(path.resolve(root, 'scratchpad/feature-ids.txt'), f.ids.join('\n') + '\n');
    console.log(`\nwrote ${f.ids.length} ids for "${f.label}" -> scratchpad/feature-ids.txt`);
    const byDev = {};
    for (const i of f.ids) { const d = i.split('#')[0]; byDev[d] = (byDev[d] || 0) + 1; }
    for (const [d, c] of Object.entries(byDev).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`${String(c).padStart(4)}  ${d}`);
  }
}
