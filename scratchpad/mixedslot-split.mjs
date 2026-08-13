// mixedslot-split.mjs — split the mixed-slot class into
//   (a)-only : reference closes with constructor applications over BARE names
//   (a)+(b)  : reference also needs a NESTED constructor application in an
//              argument slot (`[g |- m-step (rappl X) R]`) — depth-2 LF synthesis,
//              which synthesizeFills does not do (args come from scope only).
// Decides whether the mixed-slot repair can ship ALONE or is half of a composite.
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
const ids = fs.readFileSync(path.resolve(root, arg('--ids', 'scratchpad/mixedslot-ids.txt')), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean);

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

// A box term whose head application has a PARENTHESISED APPLICATION as an argument:
//   [g |- m-step (rappl S) MS'']      <- nested, depth 2
//   [g |- m-step X X1]                <- flat, depth 1
const BOX = /\[[^\[\]]*(?:\|-|⊢)([^\[\]]*)\]/gu;
let aOnly = 0; let aPlusB = 0;
const aOnlyIds = []; const abIds = [];
for (const id of ids) {
  const [prog, name] = id.split('#');
  const body = bodyOf(prog, name);
  if (body == null) continue;
  let nested = false;
  for (const m of body.matchAll(BOX)) {
    const term = m[1].trim();
    const toks = term.split(/\s+/);
    if (toks.length < 2) continue;               // not an application
    // an argument that is itself a parenthesised application of >=2 tokens
    if (/\(\s*[\p{L}_][\p{L}\p{N}_'-]*\s+[^)]+\)/u.test(term)) { nested = true; break; }
  }
  if (nested) { aPlusB += 1; abIds.push(id); } else { aOnly += 1; aOnlyIds.push(id); }
}
console.log(`mixed-slot class            ${ids.length}`);
console.log(`  (a) mixed-slot ONLY       ${aOnly}   <- ships alone, measurable by itself`);
console.log(`  (a)+(b) nested ctor arg   ${aPlusB}   <- composite, needs both pieces`);
fs.writeFileSync(path.resolve(root, 'scratchpad/mixedslot-aonly.txt'), aOnlyIds.join('\n') + '\n');
fs.writeFileSync(path.resolve(root, 'scratchpad/mixedslot-ab.txt'), abIds.join('\n') + '\n');
const dev = (l) => { const b = {}; for (const i of l) { const d = i.split('#')[0]; b[d] = (b[d] || 0) + 1; } return Object.entries(b).sort((x, y) => y[1] - x[1]).slice(0, 8); };
console.log('\n(a)-only by dev:'); for (const [d, n] of dev(aOnlyIds)) console.log(`${String(n).padStart(4)}  ${d}`);
console.log('\n(a)+(b) by dev:'); for (const [d, n] of dev(abIds)) console.log(`${String(n).padStart(4)}  ${d}`);
