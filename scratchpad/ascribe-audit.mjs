// How many stuck targets have a TYPE-ASCRIPTION let as their reference's first move?
//   `fn cr => … let (cr : T) = cr in case …`
// This re-binds a comp hypothesis with its declared type so the premise's IMPLICIT
// meta-parameters become referenceable — Beluga's idiom for the writability wall.
import fs from 'node:fs'; import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';
const root = process.cwd();
const led = process.argv[2] || 'scratchpad/library.merged.jsonl';
const rows = new Map();
for (const l of fs.readFileSync(path.resolve(root, led), 'utf8').split('\n').filter(Boolean)) {
  try { const r = JSON.parse(l); rows.set(r.id, r); } catch {}
}
const sc = new Map();
const prog = (p) => { if (sc.has(p)) return sc.get(p); let c = null;
  try { const a = path.join(root, 'library', p);
    if (p.endsWith('.cfg')) { const d = path.dirname(a);
      c = assembleCfgProgram(fs.readFileSync(a, 'utf8'), (n) => { const q = path.join(d, n); return fs.existsSync(q) ? fs.readFileSync(q, 'utf8') : null; }).code;
    } else c = fs.readFileSync(a, 'utf8');
  } catch { c = null; } sc.set(p, c); return c; };
const strip = (s) => String(s || '').replace(/%\{[\s\S]*?\}%/g, ' ').replace(/%[^\n]*/g, ' ');
const hits = []; const dev = new Map();
for (const r of rows.values()) {
  if (['COMPLETE', 'PRECHECK_FAIL', 'FAIL'].includes(r.outcome)) continue;
  const [p, n] = r.id.split('#'); const code = prog(p); if (!code) continue;
  const ds = enumerateDecls(code);
  const d = ds.find((x) => x && x.name === n && /^(rec|proof)\b|\band\s+rec\b/.test(String(x.text || '').trim())) || ds.find((x) => x && x.name === n);
  if (!d || !d.text) continue;
  const eq = String(d.text).indexOf('='); if (eq < 0) continue;
  let b = strip(String(d.text).slice(eq + 1)).replace(/^\s*\/[^/]*\/\s*/, '').trim();
  for (let i = 0; i < 24; i += 1) { const m = /^(?:mlam|fn)\s+[^=⇒]*?(?:=>|⇒)/.exec(b); if (!m) break; b = b.slice(m[0].length).trim(); }
  // `let (x : T) = x in` — same name both sides, parenthesised ascription.
  const m = /^let\s*\(\s*([\p{L}_][\p{L}\p{N}_']*)\s*:\s*[\s\S]*?\)\s*=\s*([\p{L}_][\p{L}\p{N}_']*)\s+in\b/u.exec(b);
  if (!m || m[1] !== m[2]) continue;
  hits.push(r.id);
  const k = p.split('/').slice(-2).join('/'); dev.set(k, (dev.get(k) || 0) + 1);
}
console.log('stuck targets whose reference STARTS with a type-ascription let:', hits.length, '\n');
for (const [k, v] of [...dev].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
fs.writeFileSync('scratchpad/ids-ascribe.txt', hits.sort().join('\n') + '\n');
