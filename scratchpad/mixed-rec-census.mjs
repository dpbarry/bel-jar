// mixed-rec-census.mjs — how many STUCK targets have the MIXED recursion shape:
// totalied, decreasing argument is a CTYPE premise, and the theorem ALSO carries
// box premises? That combination matches neither recurseTexts path (the all-ctype
// branch is gated on `!boxes.length`), so the theorem gets NO induction hypothesis.
// Structural census — sizes the population, NOT the reach (size by toggle before building).
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, maskByName } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { theoremUnderProof } from '../js/editor-src/prover/prover-orchestrator.mjs';
import { decreasingArgIndex } from '../js/editor-src/prover/prover-comp-type.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
const ledgerPath = arg('--ledger', path.join('results', 'corpus', 'library.native-merged-20260729.jsonl'));

const rows = new Map();
for (const line of fs.readFileSync(path.resolve(root, ledgerPath), 'utf8').split('\n').filter(Boolean)) {
  const r = JSON.parse(line);
  rows.set(r.id, r);
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

const hits = []; const allCtype = []; let scanned = 0;
for (const r of rows.values()) {
  if (r.outcome === 'COMPLETE') continue;
  if (r.reason === 'coinductive-out-of-fragment') continue;
  const [prog, name] = r.id.split('#');
  const code = programOf(prog);
  if (!code) continue;
  let thm = null;
  try {
    const masked = maskByName(code, name);
    if (!masked) continue;
    thm = theoremUnderProof(masked.declText);
  } catch { continue; }
  if (!thm || !thm.compType || !thm.totality) continue;
  scanned += 1;
  const prems = thm.compType.premises || [];
  const boxes = prems.filter((p) => p.kind === 'box');
  const ctypes = prems.filter((p) => p.kind === 'ctype');
  if (!ctypes.length) continue;
  let decI = -1;
  try { decI = decreasingArgIndex(thm); } catch { decI = -1; }
  // Which premise does the decreasing index name? recurseTexts' all-ctype branch
  // indexes into the CTYPE-only list, so a ctype-decreasing theorem with boxes
  // reaches neither emitter.
  const rec = { id: r.id, outcome: r.outcome + (r.reason ? ':' + r.reason : ''), nBox: boxes.length, nCtype: ctypes.length, decI };
  if (!boxes.length) allCtype.push(rec);
  else if (decI >= 0 && decI < ctypes.length) hits.push(rec);
}
console.log(`scanned (stuck, totalied, parseable) : ${scanned}`);
console.log(`ALL-ctype  (already handled)         : ${allCtype.length}`);
console.log(`MIXED ctype+box, dec -> ctype slot   : ${hits.length}   <- the gap\n`);
const byDev = new Map();
for (const h of hits) { const p = h.id.split('#')[0]; if (!byDev.has(p)) byDev.set(p, []); byDev.get(p).push(h); }
for (const [p, hs] of [...byDev].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${String(hs.length).padStart(3)}  ${p}`);
  for (const h of hs) console.log(`        ${h.id.split('#')[1]}  box=${h.nBox} ctype=${h.nCtype} dec=${h.decI}  ${h.outcome}`);
}
fs.writeFileSync(path.resolve(root, 'scratchpad/mixed-rec.txt'), hits.map((h) => h.id).join('\n') + '\n');
