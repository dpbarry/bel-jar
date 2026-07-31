// class-dump.mjs — like prover-residue-audit, but dumps the FULL member list of
// one bucket (--match a substring of the bucket tag), grouped by development,
// so a "mass" class can be checked for being one shape replicated across files.
//
//   node scratchpad/class-dump.mjs --match "no-move :: SMALL" [--ledger ...] [--ids out.txt]
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
const ledgerPath = arg('--ledger', path.join('results', 'corpus', 'library.native-merged-20260729.jsonl'));
const match = arg('--match', null);
const idsOut = arg('--ids', null);

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

const hits = [];
for (const r of rows.values()) {
  const k = r.outcome + (r.reason ? ':' + r.reason : '');
  if (r.outcome === 'COMPLETE' || r.outcome === 'PRECHECK_FAIL' || r.outcome === 'FAIL') continue;
  const [prog, name] = r.id.split('#');
  const body = bodyOf(prog, name);
  if (body == null) continue;
  const lines = body.split('\n').filter((l) => l.trim()).length;
  const hasFun = /(^|\s)fun\s/.test(body) || /\|\s*\([^)]*\.\s*/.test(body);
  const cases = (body.match(/\bcase\b/g) || []).length;
  const lets = (body.match(/\blet\b/g) || []).length;
  const calls = new Set((body.match(/\b([a-z][A-Za-z0-9_']*)\s+\[/g) || []).map((s) => s.split(/\s/)[0]));
  const mlams = (body.match(/\bmlam\b/g) || []).length;
  const holes = /\?/.test(body);
  let cls;
  if (r.reason === 'coinductive-out-of-fragment') cls = 'coinductive(by-design)';
  else if (hasFun) cls = 'ref-uses-fun/copattern(out-of-fragment)';
  else if (holes) cls = 'ref-itself-incomplete';
  else if (lines <= 3 && cases === 0) cls = 'TINY-noncase(<=3 lines, direct term)';
  else if (lines <= 8) cls = 'SMALL(<=8 lines)';
  else if (lines <= 25) cls = 'MEDIUM(9-25 lines)';
  else cls = 'LARGE(>25 lines)';
  const tag = `${k} :: ${cls}`;
  if (match && !tag.includes(match)) continue;
  hits.push({ id: r.id, prog, name, tag, lines, cases, lets, mlams, calls: calls.size });
}

const byDev = new Map();
for (const h of hits) {
  if (!byDev.has(h.prog)) byDev.set(h.prog, []);
  byDev.get(h.prog).push(h);
}
console.log(`TOTAL ${hits.length} in buckets matching "${match}"\n`);
for (const [prog, hs] of [...byDev].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${String(hs.length).padStart(3)}  ${prog}`);
  for (const h of hs) console.log(`        ${h.name}  [ln=${h.lines} case=${h.cases} let=${h.lets} mlam=${h.mlams} calls=${h.calls}]`);
}
if (idsOut) fs.writeFileSync(path.resolve(root, idsOut), hits.map((h) => h.id).join('\n') + '\n');
