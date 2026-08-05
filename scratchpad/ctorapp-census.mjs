// ctorapp-census.mjs — size the "ctype-constructor application with an INLINE call
// argument" family: the `M_dot (weaken σ') [h, x:target _ |- M[..]]` shape that
// entry 41 localized. A member's reference proof applies a CTYPE constructor whose
// argument list contains BOTH a parenthesised application (an inline recursive/lemma
// call) AND/OR an extended-context weakened box.
//
// Reports three nested populations so the stake is honest:
//   INLINE-CALL-ARG : ctor applied to a parenthesised call        (the hard part)
//   + WEAKENED-BOX  : ...and an extended-context box with [..]    (the full shape)
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';

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
function bodyOf(prog, name) {
  const code = programOf(prog);
  if (!code) return null;
  const decls = enumerateDecls(code);
  const d = decls.find((x) => x && x.name === name && /^(rec|proof)\b|\band\s+rec\b/.test(String(x.text || '').trim()));
  const text = d ? d.text : (decls.find((x) => x && x.name === name) || {}).text;
  if (!text) return null;
  const eq = text.indexOf('=');
  return eq < 0 ? null : text.slice(eq + 1);
}

// An UPPERCASE-headed application (a ctype constructor) whose argument list holds a
// parenthesised application of a LOWERCASE head (a recursive/lemma call).
const INLINE_CALL = /\p{Lu}[\p{L}\p{N}_']*(?:\s+[^\s()|;]+)*\s+\(\s*\p{Ll}[\p{L}\p{N}_']*\s+[^)]*\)/u;
// An extended-context box carrying a weakening substitution.
const WEAK_BOX = /\[[^\[\]]*,\s*\p{Ll}[\p{L}\p{N}_']*\s*:[^\[\]]*\|-[^\[\]]*?[#]?[\p{L}][\p{L}\p{N}_']*\[\.\.\][^\[\]]*\]/u;

let stuck = 0; const inline = []; const full = [];
for (const r of rows.values()) {
  if (r.outcome === 'COMPLETE') continue;
  if (r.reason === 'coinductive-out-of-fragment') continue;
  const [prog, name] = r.id.split('#');
  const body = bodyOf(prog, name);
  if (body == null) continue;
  stuck += 1;
  const hasInline = INLINE_CALL.test(body);
  const hasWeak = WEAK_BOX.test(body);
  if (hasInline) inline.push(r.id);
  if (hasInline && hasWeak) full.push(r.id);
}
console.log(`stuck, readable references          : ${stuck}`);
console.log(`INLINE-CALL-ARG (ctor + (call …))   : ${inline.length}`);
console.log(`  ...AND a weakened extended box    : ${full.length}   <- the full M_dot shape\n`);
const byDev = new Map();
for (const id of full) { const p = id.split('#')[0]; if (!byDev.has(p)) byDev.set(p, []); byDev.get(p).push(id.split('#')[1]); }
for (const [p, ns] of [...byDev].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${String(ns.length).padStart(3)}  ${p}`);
  console.log(`        ${ns.join(', ')}`);
}
fs.writeFileSync(path.resolve(root, 'scratchpad/ctorapp-full.txt'), full.join('\n') + '\n');
fs.writeFileSync(path.resolve(root, 'scratchpad/ctorapp-inline.txt'), inline.join('\n') + '\n');
