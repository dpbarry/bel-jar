// weaken-census.mjs — TEXT census: among a given id list, how many reference
// proofs spell a metavariable/parameter with the weakening substitution `[..]`
// INSIDE a box whose context is extended (`[g, x:t _ |- M[..]]`)?
// This sizes what the proofs NEED. It is NOT reach — see feedback-size-classes-by-toggle.
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
const ids = fs.readFileSync(path.resolve(root, arg('--ids', null)), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);

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

// A box whose context carries an EXTRA binder (`, x : …`) and whose term applies
// the weakening substitution to a metavar or parameter: `[g, x:tm _ |- M[..]]`.
const EXT_BOX = /\[[^\[\]]*,\s*[\p{Ll}][\p{L}\p{N}_']*\s*:[^\[\]]*\|-[^\[\]]*?[#]?[\p{L}][\p{L}\p{N}_']*\[\.\.\][^\[\]]*\]/u;
// Any `[..]` weakening at all, anywhere in the body.
const ANY_DD = /[#]?[\p{L}][\p{L}\p{N}_']*\[\.\.\]/u;

let ext = 0; let any = 0; let n = 0;
const extIds = [];
for (const id of ids) {
  const [prog, name] = id.split('#');
  const body = bodyOf(prog, name);
  if (body == null) continue;
  n += 1;
  if (EXT_BOX.test(body)) { ext += 1; extIds.push(id); }
  if (ANY_DD.test(body)) any += 1;
}
console.log(`readable            ${n}/${ids.length}`);
console.log(`ANY  X[..]          ${any}  (${(100 * any / n).toFixed(0)}%)`);
console.log(`EXTENDED-ctx box    ${ext}  (${(100 * ext / n).toFixed(0)}%)   <- the mechanism's target`);
console.log('');
for (const i of extIds) console.log('  ' + i);
