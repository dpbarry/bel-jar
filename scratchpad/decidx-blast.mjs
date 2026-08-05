// decidx-blast.mjs — blast radius of the decreasingArgIndex fix. For every corpus
// theorem with a ctype argument premise, compare the OLD formula
//   spineIdx - #pi - implicitMetaCountOLD      (ctype heads counted, ctx binders NOT)
// against the NEW one
//   spineIdx - #pi - #ctx - implicitMetaCountNEW  (ctype heads skipped, ctx counted).
// Prints how many theorems change slot, and to what — the regression surface.
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls, maskByName } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { theoremUnderProof } from '../js/editor-src/prover/prover-orchestrator.mjs';
import { decreasingArgIndex } from '../js/editor-src/prover/prover-comp-type.mjs';

const root = process.cwd();

function oldImplicitMetaCount(compType) {
  const names = new Set();
  const scan = (t) => {
    const s = String(t == null ? '' : t);
    const re = /\p{Lu}[\p{L}\p{N}_']*/gu;
    let m;
    while ((m = re.exec(s))) {
      const prev = m.index > 0 ? s[m.index - 1] : ' ';
      const next = s[m.index + m[0].length] || ' ';
      if (/[\p{L}\p{N}_'$/]/u.test(prev)) continue;
      if (next === '/') continue;
      names.add(m[0]);
    }
  };
  const piBinders = new Set();
  for (const p of compType.premises) {
    if (p.kind === 'pi' && p.binder) piBinders.add(p.binder.replace(/^[$#]/, ''));
    scan(p.raw); // OLD: ctype head NOT skipped
  }
  scan(compType.conclusion);
  for (const b of piBinders) names.delete(b);
  return names.size;
}
function oldDecArgIndex(thm) {
  const prem = (thm && thm.compType && thm.compType.premises) || [];
  const args = prem.filter((p) => p.kind === 'box' || p.kind === 'ctype');
  if (!args.length) return -1;
  if (!args.some((p) => p.kind === 'ctype')) return null; // delegates — unchanged by the fix
  if (!thm.totality) return 0;
  const tot = thm.totality;
  if (tot.kind !== 'named' || !Array.isArray(tot.args) || !tot.args.length) return null;
  const pis = prem.filter((p) => p.kind === 'pi');
  const pos = tot.args.lastIndexOf(tot.name);
  const spineIdx = pos >= 0 ? pos : tot.args.length - 1;
  const argIdx = spineIdx - pis.length - oldImplicitMetaCount(thm.compType);
  if (argIdx >= 0 && argIdx < args.length) return argIdx;
  if (spineIdx < pis.length) return -1;
  return 0;
}

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.bel')) files.push(p);
  }
})(path.join(root, 'library'));

let scanned = 0; let changed = 0; const rows = [];
for (const f of files) {
  let code;
  try { code = fs.readFileSync(f, 'utf8'); } catch { continue; }
  let decls;
  try { decls = enumerateDecls(code); } catch { continue; }
  for (const d of decls) {
    if (!d || !d.name) continue;
    if (!/^(rec|proof)\b|\band\s+rec\b/.test(String(d.text || '').trim())) continue;
    let thm = null;
    try {
      const m = maskByName(code, d.name);
      if (!m) continue;
      thm = theoremUnderProof(m.declText);
    } catch { continue; }
    if (!thm || !thm.compType) continue;
    const prem = thm.compType.premises || [];
    if (!prem.some((p) => p.kind === 'ctype')) continue;
    const oldI = oldDecArgIndex(thm);
    if (oldI === null) continue;
    scanned += 1;
    let newI = -1;
    try { newI = decreasingArgIndex(thm); } catch { continue; }
    if (oldI !== newI) {
      changed += 1;
      rows.push(`${path.relative(root, f)}#${d.name}  ${oldI} -> ${newI}`);
    }
  }
}
console.log(`ctype-bearing named-measure theorems scanned : ${scanned}`);
console.log(`decreasing slot CHANGED                     : ${changed}\n`);
for (const r of rows) console.log('  ' + r);
