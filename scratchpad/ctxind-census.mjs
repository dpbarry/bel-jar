// ctxind-census.mjs — STRUCTURAL size of CONTEXT-STRUCTURAL INDUCTION.
//
// The shape (weak-norm-under-binders#idRedSub, #redVar, logrel `lookup`, …):
//     rec f : {g:ctx} … =  / total g (f g) /
//     mlam g => case [g] of
//       | []              => <base>
//       | [g', x:tm A[]]  => … f [g'] …
// i.e. the induction subject is the CONTEXT VARIABLE, split by its SCHEMA.
//
// Sized by the THEOREM'S OWN TYPE (what the engine would key on), not by a
// reference-proof regex — per [[feedback-size-classes-by-toggle]]:
//   A. explicit `{g:ctx}` binder whose type is a declared schema
//   B. the author's measure NAMES that binder   (`/ total g (f g) /`)
//   C. the reference proof splits it            (case [g] of)
// A+B is the engine-visible predicate; C confirms the proof really inducts there.
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
const ledgerPath = arg('--ledger', 'results/corpus/library.native-merged-20260729.jsonl');

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
  const t = String(d.text || '');
  const eq = t.indexOf('=');
  if (eq < 0) return null;
  return { code, head: t.slice(0, eq), body: t.slice(eq + 1), full: t };
}

const rows = fs.readFileSync(path.resolve(root, ledgerPath), 'utf8')
  .split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

let n = 0;
const hitA = []; const hitAB = []; const hitABC = []; const hitAC = [];
for (const r of rows) {
  if (r.outcome !== 'STUCK' && r.outcome !== 'TIMEOUT') continue;
  const id = r.id || `${r.program}#${r.name}`;
  const [prog, name] = id.split('#');
  const p = partsOf(prog, name);
  if (!p) continue;
  n += 1;
  const schemas = new Set([...p.code.matchAll(/(^|\n)\s*schema\s+([\p{L}_][\p{L}\p{N}_']*)/gu)].map((m) => m[2]));
  // A: an EXPLICIT `{g : <schema>}` binder in the signature
  const ctxBinders = [...p.head.matchAll(/\{\s*([\p{Ll}][\p{L}\p{N}_']*)\s*:\s*([\p{L}_][\p{L}\p{N}_']*)\s*\}/gu)]
    .filter((m) => schemas.has(m[2])).map((m) => m[1]);
  if (!ctxBinders.length) continue;
  hitA.push(id);
  // B: the measure NAMES one of those binders
  const tot = /\/\s*total\s+([\p{Ll}][\p{L}\p{N}_']*)\s*\(/u.exec(p.full);
  const namesIt = tot && ctxBinders.includes(tot[1]);
  // C: the reference proof splits the context variable
  const splitsIt = ctxBinders.some((g) => new RegExp(`case\\s*\\[\\s*${g}\\s*\\]\\s*of`, 'u').test(p.body));
  if (namesIt) hitAB.push(id);
  if (splitsIt) hitAC.push(id);
  if (namesIt && splitsIt) hitABC.push(id);
}
console.log(`stuck/timeout readable                              ${n}`);
console.log(`A. explicit {g:schema} binder                       ${hitA.length}`);
console.log(`A+B. ...and the measure NAMES it                    ${hitAB.length}`);
console.log(`A+C. ...and the reference splits case [g] of      ${hitAC.length}`);
console.log(`A+B+C. all three (the exact shape)                  ${hitABC.length}  <- build target`);
fs.writeFileSync(path.resolve(root, 'scratchpad/ctxind-ids.txt'), hitABC.join('\n') + '\n');
fs.writeFileSync(path.resolve(root, 'scratchpad/ctxind-ac.txt'), hitAC.join('\n') + '\n');
const dev = (l) => { const b = {}; for (const i of l) { const k = i.split('#')[0]; b[k] = (b[k] || 0) + 1; } return Object.entries(b).sort((x, y) => y[1] - x[1]); };
console.log('\nA+C by development:');
for (const [k, c] of dev(hitAC).slice(0, 15)) console.log(`${String(c).padStart(4)}  ${k}`);
