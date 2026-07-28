// prover-arity-audit.mjs — MODEL-vs-CORPUS falsification, text only, no oracle.
//
// The engine generates every pattern and every application from ITS OWN model of
// the signature. If that model reads a constructor's arity wrong, every split and
// every fill on that family is rejected and the target bails at step 0 — silently,
// and identically to a genuine search gap. This audit falsifies the model WITHOUT
// running a search: for every constructor `enumerateConstructorsTyped` knows, it
// compares the arity we believe against the arities the corpus's OWN proofs apply
// it with. A systematic mismatch is a model bug.
//
// It is how the dropped explicit-`{Pi}` argument and the parenthesised-arrow-tail
// bug were found (2026-07-25) — neither showed up in a trace. Run it after ANY
// change to constructor enumeration or to term/pattern construction.
//
//   node scripts/prover-arity-audit.mjs [--dir library/data] [--all]
//
// Reported deltas are `used - model`. NOTE: `f \x. \u. D` is ONE argument written
// as several whitespace tokens; `\`-led tokens are merged with what they prefix,
// or every higher-order constructor reads as a false mismatch. A residue of a
// couple of multi-binder cases (e.g. `cletpack P \e.\xf.\xenv. capp xf (…)`) is
// expected and is an artifact of this counter, not a model bug.
import fs from 'node:fs';
import path from 'node:path';
import { enumerateConstructorsTyped, setConstructorScopeDecl } from '../js/editor-src/prover/hole-split.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; }
const dir = path.resolve(root, arg('--dir', path.join('library', 'data')));
const showAll = args.includes('--all');

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.bel')) files.push(p);
  }
}(dir));

const strip = (s) => String(s).replace(/%\{[\s\S]*?\}%/g, ' ').replace(/%[^\n]*/g, ' ');

// Top-level tokens of an application's argument text, with `\x.`-led tokens
// merged into the argument they bind.
function argTokens(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    if (/\s/.test(ch) && depth === 0) { if (cur) { out.push(cur); cur = ''; } } else cur += ch;
  }
  if (cur) out.push(cur);
  const merged = [];
  for (let i = 0; i < out.length; i += 1) {
    if (/^\\/.test(out[i])) {
      let j = i;
      while (j < out.length && /^\\/.test(out[j])) j += 1;
      merged.push(out.slice(i, j + 1).join(' '));
      i = j;
    } else merged.push(out[i]);
  }
  return merged;
}

setConstructorScopeDecl(null); // whole-program view: this audit is not per-proof
const mismatch = new Map();
let modelled = 0;
for (const f of files) {
  const src = strip(fs.readFileSync(f, 'utf8'));
  const fams = new Set();
  for (const m of src.matchAll(/(?:^|\n)\s*(?:LF\s+)?([\p{L}_][\p{L}\p{N}_']*)\s*:\s*[^=;.]*\btype\b/gu)) fams.add(m[1]);
  const arity = new Map();
  for (const fam of fams) {
    let cs = [];
    try { cs = enumerateConstructorsTyped(src, fam); } catch { cs = []; }
    for (const c of cs) arity.set(c.name, c.argTypes.length);
  }
  if (!arity.size) continue;
  modelled += arity.size;
  for (const [name, want] of arity) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`[[(](?:[^[\\]()]*?(?:\\|-|⊢))?\\s*${esc}((?:\\s+[^\\s[\\]()]+|\\s+\\([^()]*\\)|\\s+\\[[^\\[\\]]*\\])*)\\s*[\\])]`, 'gu');
    const used = new Set();
    let m;
    while ((m = re.exec(src))) used.add(argTokens(m[1]).length);
    if (!used.size || used.has(want)) continue; // no evidence, or the model agrees
    mismatch.set(`${path.relative(root, f)}  ${name}`, { model: want, used: [...used].sort((a, b) => a - b) });
  }
}

console.log(`constructors modelled: ${modelled}   arity mismatches: ${mismatch.size}`);
const byDelta = new Map();
for (const [k, v] of mismatch) {
  const d = v.used[0] - v.model;
  const key = `${d > 0 ? '+' : ''}${d}`;
  if (!byDelta.has(key)) byDelta.set(key, []);
  byDelta.get(key).push(`${k}  model=${v.model} used=${v.used.join('/')}`);
}
for (const [d, list] of [...byDelta].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n── delta ${d}  (${list.length})`);
  for (const l of (showAll ? list : list.slice(0, 15))) console.log('   ', l);
  if (!showAll && list.length > 15) console.log(`    … ${list.length - 15} more (--all)`);
}
process.exit(mismatch.size > 5 ? 1 : 0);
