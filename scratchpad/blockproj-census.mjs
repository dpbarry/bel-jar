// blockproj-census.mjs — TEXT census: among STUCK/TIMEOUT corpus targets, how
// many reference proofs close a box with a PROJECTION OF A CONTEXT BLOCK BINDER
// (`[ψ, b : block (x:tm, u:aeq x x) |- b.2]`)?
//
// This is the fill source that hole-split's `fillCandidates` never proposes:
// path (1) reads block projections only off META-context parameters (`#p`), and
// path (1b) explicitly `continue`s on a named block entry of the goal's own
// context ("block entries fill by projection") — with no projection path behind it.
//
// TEXT ONLY: sizes what proofs NEED, never what the search REACHES. Confirm by
// TOGGLE A/B before building the rest. [[feedback-size-classes-by-toggle]]
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
const ledgerPath = arg('--ledger', 'results/corpus/library.native-merged-20260729.jsonl');
const outIds = arg('--out', 'scratchpad/blockproj-ids.txt');

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
  const d = decls.find((x) => x && x.name === name
    && /^(rec|proof)\b|\band\s+rec\b/.test(String(x.text || '').trim()))
    || decls.find((x) => x && x.name === name);
  if (!d) return null;
  const eq = String(d.text || '').indexOf('=');
  return eq < 0 ? null : String(d.text).slice(eq + 1);
}

// A box whose TERM is a projection of a binder declared `block` in that same box's
// context: `[ψ, b : block (…) |- b.2]` / `[… |- b.u]`. Also the plain form where the
// context is a schema variable and the binder came from a split arm.
const BOXES = /\[([^\[\]]*)\|-([^\[\]]*)\]/gu;

let stuck = 0; let hit = 0;
const ids = [];
const rows = fs.readFileSync(path.resolve(root, ledgerPath), 'utf8')
  .split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean);

for (const r of rows) {
  const outcome = r.outcome || '';
  if (outcome !== 'STUCK' && outcome !== 'TIMEOUT') continue;
  const id = r.id || `${r.program}#${r.name}`;
  const [prog, name] = id.split('#');
  const body = bodyOf(prog, name);
  if (body == null) continue;
  stuck += 1;
  let found = false;
  for (const m of body.matchAll(BOXES)) {
    const ctx = m[1]; const term = m[2].trim();
    const pm = /^([\p{Ll}][\p{L}\p{N}_']*)\.([\p{L}\p{N}_']+)\s*$/u.exec(term);
    if (!pm) continue;
    const binder = pm[1];
    // is that binder declared as a block in this box's own context?
    const decl = new RegExp(`(?:^|,)\\s*${binder}\\s*:\\s*block\\b`, 'u');
    if (decl.test(ctx)) { found = true; break; }
  }
  if (found) { hit += 1; ids.push(id); }
}
console.log(`stuck/timeout readable      ${stuck}`);
console.log(`close via CONTEXT-BLOCK proj ${hit}  (${(100 * hit / stuck).toFixed(1)}%)`);
fs.writeFileSync(path.resolve(root, outIds), ids.join('\n') + '\n');
console.log(`\nwrote ${ids.length} ids -> ${outIds}`);
const byDev = {};
for (const i of ids) { const d = i.split('#')[0]; byDev[d] = (byDev[d] || 0) + 1; }
for (const [d, n] of Object.entries(byDev).sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(4)}  ${d}`);
