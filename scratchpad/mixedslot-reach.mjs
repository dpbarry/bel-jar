// mixedslot-reach.mjs — STRUCTURAL REACH census for the per-slot underscore rule.
//
// Not a text census of reference proofs (that overstated reach: 150 candidates,
// 0/5 conversions on a stride sample). This computes, from each stuck theorem's
// OWN TYPE, whether the mechanism CHANGES THE EMITTED CALL AT ALL — i.e. whether
// any explicit object-Pi binder occurs in the decreasing premise's indices.
//
//   changed  = >=1 object-Pi binder occurs in the decreasing premise  -> text differs
//   useful   = ALSO >=1 object-Pi binder that does NOT occur          -> the mixed
//              spelling is strictly between all-named and all-underscore, which is
//              the configuration verified to be the only well-typed one on mstep_appl
//
// Mirrors decIndexNames + piPrefixCore in prover-moves.mjs. [[feedback-size-classes-by-toggle]]
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { parseCompType, parseTotality, decreasingBoxIndex } from '../js/editor-src/prover/prover-comp-type.mjs';

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
function declOf(prog, name) {
  const code = programOf(prog);
  if (!code) return null;
  const decls = enumerateDecls(code);
  return decls.find((x) => x && x.name === name
    && /^(rec|proof)\b|\band\s+rec\b/.test(String(x.text || '').trim()))
    || decls.find((x) => x && x.name === name) || null;
}
// The index names of a boxed premise `[g |- fam I1 I2]` (family head dropped).
function indexNames(raw) {
  let s = String(raw || '').trim();
  if (s && !s.startsWith('[')) s = `[${s}]`;
  const m = /^\[\s*([\s\S]*?)\s*(?:\|-|⊢)\s*([\s\S]*)\]$/.exec(s);
  const inner = m ? m[2].trim() : s;
  const idx = inner.replace(/^[\p{L}_][\p{L}\p{N}_'-]*/u, '');
  const out = new Set();
  for (const t of idx.matchAll(/[\p{L}_][\p{L}\p{N}_']*/gu)) out.add(t[0]);
  return out;
}

const changedIds = []; const usefulIds = [];
let stuck = 0; let hasPi = 0;
const rows = fs.readFileSync(path.resolve(root, ledgerPath), 'utf8')
  .split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

for (const r of rows) {
  if (r.outcome !== 'STUCK' && r.outcome !== 'TIMEOUT') continue;
  const id = r.id || `${r.program}#${r.name}`;
  const [prog, name] = id.split('#');
  const d = declOf(prog, name);
  if (!d) continue;
  const text = String(d.text || '');
  const eq = text.indexOf('=');
  if (eq < 0) continue;
  const ci = text.slice(0, eq).indexOf(':');
  if (ci < 0) continue;
  let sig = text.slice(ci + 1, eq);
  const totM = /\/\s*total\b[^/]*\//.exec(text);
  sig = sig.replace(/\/\s*total\b[^/]*\//g, ' ').trim();
  const ct = parseCompType(sig);
  if (!ct) continue;
  stuck += 1;
  const prem = ct.premises || [];
  const boxes = prem.filter((p) => p.kind === 'box');
  if (!boxes.length) continue;
  // OBJECT Pi binders only (box-typed), matching piPrefixCore's pass-through branch.
  const objPis = prem.filter((p) => p.kind === 'pi'
    && /\[|\|-|⊢/.test(String(p.raw || '')))
    .map((p) => {
      const m = /^\{\s*([$#]?[\p{L}_][\p{L}\p{N}_']*)\s*:/u.exec(String(p.raw).trim());
      return m ? m[1] : null;
    }).filter(Boolean).filter((n) => !n.startsWith('$') && !n.startsWith('#'));
  if (!objPis.length) continue;
  hasPi += 1;
  const thm = { name, compType: ct, totality: totM ? parseTotality(totM[0]) : null };
  let di = 0;
  try { di = Math.max(0, decreasingBoxIndex(thm)); } catch { di = 0; }
  const dec = indexNames((boxes[di] || boxes[0]).raw);
  const occurring = objPis.filter((n) => dec.has(n));
  const absent = objPis.filter((n) => !dec.has(n));
  if (occurring.length) {
    changedIds.push(id);
    if (absent.length) usefulIds.push(id);
  }
}
console.log(`stuck/timeout parsed                       ${stuck}`);
console.log(`  with >=1 object-Pi binder + box premise  ${hasPi}`);
console.log(`  TEXT CHANGES (a Pi occurs in dec premise) ${changedIds.length}`);
console.log(`  STRICTLY MIXED (also a Pi that does not)  ${usefulIds.length}  <- the verified configuration`);
fs.writeFileSync(path.resolve(root, 'scratchpad/mixedslot-reach-changed.txt'), changedIds.join('\n') + '\n');
fs.writeFileSync(path.resolve(root, 'scratchpad/mixedslot-reach-useful.txt'), usefulIds.join('\n') + '\n');
const dev = (l) => { const b = {}; for (const i of l) { const k = i.split('#')[0]; b[k] = (b[k] || 0) + 1; } return Object.entries(b).sort((x, y) => y[1] - x[1]).slice(0, 12); };
console.log('\nSTRICTLY MIXED by development:');
for (const [k, n] of dev(usefulIds)) console.log(`${String(n).padStart(4)}  ${k}`);
