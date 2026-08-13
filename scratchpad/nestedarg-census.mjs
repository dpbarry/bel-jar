// nestedarg-census.mjs — PRECISE census of the depth-2 LF fill.
//
// The loose feature-census regex said 90%; it matched annotation parens `(x : T)`
// and parens inside TYPES. This one only counts a BOXED LF TERM that the engine
// would have to SYNTHESISE, of the form
//     [Ψ |- ctor … (ctor2 arg …) …]
// i.e. a constructor application one of whose ARGUMENTS is itself a constructor
// application. `synthesizeFills` fills argument slots from IN-SCOPE NAMES ONLY
// (no recursive term construction), so every such term is unreachable today.
//
// Reports separately the terms that sit in CLOSING position (the whole arm result,
// `=> [Ψ |- …]` or the decl's final expression) — those are the ones a fill must emit.
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
function bodyOf(prog, name) {
  const code = programOf(prog);
  if (!code) return null;
  const decls = enumerateDecls(code);
  const d = decls.find((x) => x && x.name === name
    && /^(rec|proof)\b|\band\s+rec\b/.test(String(x.text || '').trim()))
    || decls.find((x) => x && x.name === name);
  if (!d) return null;
  const t = String(d.text || '');
  const eq = t.indexOf('=');
  return eq < 0 ? null : t.slice(eq + 1);
}

// Split a term into top-level tokens, keeping parenthesised groups whole.
function topTokens(s) {
  const out = []; let depth = 0; let cur = '';
  for (const ch of String(s)) {
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth -= 1;
    if (/\s/.test(ch) && depth === 0) { if (cur) { out.push(cur); cur = ''; } } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
// Is `tok` a parenthesised CONSTRUCTOR APPLICATION (not an annotation, not a lambda)?
function isNestedApp(tok) {
  if (!/^\(.*\)$/s.test(tok)) return false;
  const inner = tok.slice(1, -1).trim();
  if (!inner || inner.includes(':')) return false;      // annotation `(x : T)`
  if (inner.startsWith('\\')) return false;             // lambda
  if (inner.includes(',')) return false;                // tuple
  const toks = topTokens(inner);
  if (toks.length < 2) return false;                    // must be an APPLICATION
  return /^[\p{L}_][\p{L}\p{N}_'-]*$/u.test(toks[0]);   // applied head is a name
}

const BOX = /\[([^\[\]]*?)(?:\|-|⊢)([^\[\]]*)\]/gu;
let n = 0; let any = 0; let closing = 0;
const anyIds = []; const closingIds = [];
const rows = fs.readFileSync(path.resolve(root, ledgerPath), 'utf8')
  .split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

for (const r of rows) {
  if (r.outcome !== 'STUCK' && r.outcome !== 'TIMEOUT') continue;
  const id = r.id || `${r.program}#${r.name}`;
  const [prog, name] = id.split('#');
  const body = bodyOf(prog, name);
  if (body == null) continue;
  n += 1;
  let hasAny = false; let hasClosing = false;
  for (const m of body.matchAll(BOX)) {
    const term = m[2].trim();
    const toks = topTokens(term);
    if (toks.length < 2) continue;
    if (!/^[\p{L}_][\p{L}\p{N}_'-]*$/u.test(toks[0])) continue;   // head must be a ctor name
    if (!toks.slice(1).some(isNestedApp)) continue;
    hasAny = true;
    // CLOSING position: the box directly follows `=>` / `=` (an arm result), i.e. the
    // whole box is what a fill would have to emit.
    const at = m.index;
    const before = body.slice(Math.max(0, at - 6), at);
    if (/(=>|⇒|=)\s*$/u.test(before)) hasClosing = true;
  }
  if (hasAny) { any += 1; anyIds.push(id); }
  if (hasClosing) { closing += 1; closingIds.push(id); }
}
console.log(`stuck/timeout readable                         ${n}`);
console.log(`ref uses a NESTED ctor app inside a box term    ${any}  (${Math.round(100 * any / n)}%)`);
console.log(`  ... in CLOSING position (a fill must emit it) ${closing}  (${Math.round(100 * closing / n)}%)`);
fs.writeFileSync(path.resolve(root, 'scratchpad/nestedarg-any.txt'), anyIds.join('\n') + '\n');
fs.writeFileSync(path.resolve(root, 'scratchpad/nestedarg-closing.txt'), closingIds.join('\n') + '\n');
const dev = (l) => { const b = {}; for (const i of l) { const k = i.split('#')[0]; b[k] = (b[k] || 0) + 1; } return Object.entries(b).sort((x, y) => y[1] - x[1]).slice(0, 12); };
console.log('\nCLOSING-position targets by development:');
for (const [k, c] of dev(closingIds)) console.log(`${String(c).padStart(4)}  ${k}`);
