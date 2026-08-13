// mixedslot-census.mjs — TEXT census of the MIXED PER-SLOT UNDERSCORE call.
//
// Verified on poplmark-reloaded#mstep_appl (probe-mixed-slot.mjs), inside the
// engine's own skeleton:
//   all-named       `f [g|-M] [g|-M'] [g|-N] [g|-X1]` -> Ill-typed
//   all-underscore  `f [g|-_] [g|-_] [g|-_] [g|-X1]`  -> Expression is not closed
//   MIXED           `f _ [g|-M'] [g|-N] [g|-X1]`      -> PASS
// The engine emits only the two extremes. This counts stuck targets whose own
// reference proof spells a call MIXING `_` arguments with named/boxed ones.
//
// TEXT ONLY — what proofs NEED, not what the search REACHES.
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
const ledgerPath = arg('--ledger', 'results/corpus/library.native-merged-20260729.jsonl');
const outIds = arg('--out', 'scratchpad/mixedslot-ids.txt');

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

// A call `name a1 a2 …` where at least one arg is a BARE `_` (or `[_ |- _]`) and at
// least one other is a NAMED box/identifier. Scanned per line to stay cheap.
const CALL = /([\p{L}_][\p{L}\p{N}_']*)\s+((?:(?:\[[^\[\]]*\])|_|[\p{L}_][\p{L}\p{N}_']*)(?:\s+(?:(?:\[[^\[\]]*\])|_|[\p{L}_][\p{L}\p{N}_']*))+)/gu;

let stuck = 0; let hit = 0; let hitSelf = 0;
const ids = [];
const rows = fs.readFileSync(path.resolve(root, ledgerPath), 'utf8')
  .split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean);

for (const r of rows) {
  if (r.outcome !== 'STUCK' && r.outcome !== 'TIMEOUT') continue;
  const id = r.id || `${r.program}#${r.name}`;
  const [prog, name] = id.split('#');
  const body = bodyOf(prog, name);
  if (body == null) continue;
  stuck += 1;
  let found = false; let foundSelf = false;
  for (const m of body.matchAll(CALL)) {
    const callee = m[1];
    if (/^(case|let|in|of|fn|mlam|rec|and|impossible|if|then|else)$/.test(callee)) continue;
    const argv = m[2].trim().split(/\s+(?![^\[]*\])/);
    const bare = argv.filter((a) => a === '_' || /^\[\s*_?\s*(\|-|⊢)\s*_\s*\]$/u.test(a)).length;
    const named = argv.filter((a) => a !== '_' && !/^\[\s*_?\s*(\|-|⊢)\s*_\s*\]$/u.test(a)).length;
    if (bare >= 1 && named >= 1) {
      found = true;
      if (callee === name) foundSelf = true;
    }
  }
  if (found) { hit += 1; ids.push(id); if (foundSelf) hitSelf += 1; }
}
console.log(`stuck/timeout readable        ${stuck}`);
console.log(`ref spells a MIXED-slot call  ${hit}  (${(100 * hit / stuck).toFixed(1)}%)`);
console.log(`  ... of which SELF-recursive ${hitSelf}`);
fs.writeFileSync(path.resolve(root, outIds), ids.join('\n') + '\n');
console.log(`\nwrote ${ids.length} ids -> ${outIds}`);
const byDev = {};
for (const i of ids) { const d = i.split('#')[0]; byDev[d] = (byDev[d] || 0) + 1; }
for (const [d, n] of Object.entries(byDev).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`${String(n).padStart(4)}  ${d}`);
