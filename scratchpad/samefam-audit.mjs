// samefam-audit.mjs — TEXT-ONLY sizing of the "poisoned decreasing slot" class.
//
// `decreasingHyps` returns the INNERMOST enclosing arm's pattern metavariables
// (filtered only by family head) as the candidates for the IH's DECREASING
// argument slot. When the innermost split was on a NON-measured premise of the
// SAME family, every generated recursive call is provably rejected by the
// totality checker ("Recursive call not structurally smaller") and the CORRECT
// call — using a pattern var from an outer split on the measured premise — is
// never generated at all.
//
// Necessary condition, checkable from the signature alone: the theorem has ≥2
// argument premises whose conclusion family head equals the MEASURED premise's
// family head. Reports the stuck ledger members that satisfy it.
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { theoremUnderProof } from '../js/editor-src/prover/prover-orchestrator.mjs';
import { decreasingArgIndex } from '../js/editor-src/prover/prover-comp-type.mjs';
import { contextualHead } from '../js/editor-src/prover/prover-hyp.mjs';

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

const declCache = new Map();
function declOf(prog, name) {
  const key = `${prog}#${name}`;
  if (declCache.has(key)) return declCache.get(key);
  const code = programOf(prog);
  let d = null;
  if (code) {
    const decls = enumerateDecls(code);
    d = decls.find((x) => x && x.name === name && /^(rec|proof)\b|\band\s+rec\b/.test(String(x.text || '').trim()))
      || decls.find((x) => x && x.name === name) || null;
  }
  declCache.set(key, d);
  return d;
}

const hits = [];
const byDev = new Map();
let considered = 0;
for (const r of rows.values()) {
  if (r.outcome === 'COMPLETE' || r.outcome === 'PRECHECK_FAIL' || r.outcome === 'FAIL') continue;
  const [prog, name] = r.id.split('#');
  const d = declOf(prog, name);
  if (!d || !d.text) continue;
  let thm = null;
  try { thm = theoremUnderProof(d.text); } catch { thm = null; }
  if (!thm || !thm.compType || !thm.totality) continue;
  considered += 1;
  const argPrems = thm.compType.premises.filter((p) => p.kind === 'box' || p.kind === 'ctype');
  if (argPrems.length < 2) continue;
  const decI = decreasingArgIndex(thm);
  if (decI < 0 || !argPrems[decI]) continue;
  const headOf = (p) => contextualHead(String(p.raw || '').trim());
  const decHead = headOf(argPrems[decI]);
  if (!decHead) continue;
  const same = argPrems.filter((p, i) => i !== decI && headOf(p) === decHead);
  if (!same.length) continue;
  hits.push({ id: r.id, outcome: `${r.outcome}${r.reason ? `:${r.reason}` : ''}`, steps: r.steps || 0, decHead, nSame: same.length });
  const dev = prog.split('/').slice(-2).join('/');
  byDev.set(dev, (byDev.get(dev) || 0) + 1);
}

console.log(`stuck+totalied theorems considered: ${considered}`);
console.log(`≥2 argument premises sharing the MEASURED premise's family head: ${hits.length}\n`);
const byOutcome = new Map();
for (const h of hits) byOutcome.set(h.outcome, (byOutcome.get(h.outcome) || 0) + 1);
for (const [k, v] of [...byOutcome].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log('\nby development:');
for (const [k, v] of [...byDev].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`  ${String(v).padStart(4)}  ${k}`);
if (args.includes('--ids')) {
  console.log('\nids:');
  for (const h of hits.sort((a, b) => a.id.localeCompare(b.id))) console.log(`  ${h.outcome.padEnd(22)} ${h.id}  [${h.decHead}]`);
}
