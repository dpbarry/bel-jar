// measure-gap-census.mjs — TEXT census of the MEASURE-FORK BLIND SPOT.
//
// `hypotheticalMeasures` (prover-orchestrator) proposes a hypothetical
// `/ total … /` only for BOX premises and explicit object-Pi binders. A theorem
// whose only induction-eligible premise is a CTYPE gets ZERO candidates, so:
//   - `totalityBlocked` is false  -> it is labelled plain `no-move`, not
//     `no-totality-measure` (invisible in the residue audit), and
//   - the measure-synthesis fork never runs, so no IH ever exists and the
//     search cannot close a recursive proof.
//
// This counts, over the stuck ledger: recursive-by-reference theorems with NO
// author `/ total /` split by whether we propose any measure at all.
// TEXT ONLY — sizes what proofs NEED, not what the search REACHES.
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { parseCompType, parseTotality } from '../js/editor-src/prover/prover-comp-type.mjs';
import { hypotheticalMeasures } from '../js/editor-src/prover/prover-orchestrator.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
const ledgerPath = arg('--ledger', 'results/corpus/library.native-merged-20260729.jsonl');
const wantIds = arg('--ids', null);

const rows = fs.readFileSync(path.resolve(root, ledgerPath), 'utf8')
  .split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean);

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
function declOf(prog, name) {
  const code = programOf(prog);
  if (!code) return null;
  const decls = enumerateDecls(code);
  return decls.find((x) => x && x.name === name
    && /^(rec|proof)\b|\band\s+rec\b/.test(String(x.text || '').trim()))
    || decls.find((x) => x && x.name === name) || null;
}

const buckets = new Map();
function bump(k, id) { if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(id); }

let n = 0;
for (const r of rows) {
  // NB the ledger field is `outcome` (not status/result) — reading the wrong key
  // silently classifies every COMPLETE as stuck.
  const status = r.outcome || r.status || r.result || '';
  if (status !== 'STUCK' && status !== 'TIMEOUT') continue;
  const id = r.id || `${r.program}#${r.name}`;
  const [prog, name] = id.split('#');
  if (!prog || !name) continue;
  const d = declOf(prog, name);
  if (!d) continue;
  const text = String(d.text || '');
  const eq = text.indexOf('=');
  if (eq < 0) continue;
  const head = text.slice(0, eq);
  const body = text.slice(eq + 1);
  // the signature: between the first ':' after the name and the body/pragma
  const ci = head.indexOf(':');
  if (ci < 0) continue;
  let sig = head.slice(ci + 1);
  const totM = /\/\s*total\b[^/]*\//.exec(sig);
  const authorTotal = !!totM;
  sig = sig.replace(/\/\s*total\b[^/]*\//g, ' ').trim();
  const ct = parseCompType(sig);
  if (!ct) continue;
  n += 1;
  // does the reference proof call ITSELF (or a mutual sibling of the same name)?
  const selfCall = new RegExp(`(?:^|[^\\p{L}\\p{N}_'])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^\\p{L}\\p{N}_']|$)`, 'u').test(body);
  const thm = {
    name,
    compType: ct,
    totality: authorTotal ? parseTotality(totM[0]) : null,
  };
  const hm = hypotheticalMeasures(thm);
  const kinds = (ct.premises || []).map((p) => p.kind);
  const hasCtype = kinds.includes('ctype');
  const hasBox = kinds.includes('box');
  const hasPi = kinds.includes('pi');

  if (authorTotal) { bump('AUTHOR has / total /', id); continue; }
  if (!selfCall) { bump('non-recursive reference (no measure needed)', id); continue; }
  // recursive, author gave no measure -> we must SYNTHESIZE one
  if (hm.length) { bump(`fork proposes ${hm.length} (box/pi) — already covered`, id); continue; }
  if (hasCtype) bump('⭐ ZERO candidates, has CTYPE premise  <- the blind spot', id);
  else if (hasBox || hasPi) bump('ZERO candidates despite box/pi (filter rejected)', id);
  else bump('ZERO candidates, no box/pi/ctype premise', id);
}

const sorted = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
console.log(`readable stuck decls: ${n}\n`);
for (const [k, v] of sorted) console.log(`${String(v.length).padStart(4)}  ${k}`);
if (wantIds) {
  const key = sorted.find(([k]) => k.includes(wantIds));
  if (key) {
    fs.writeFileSync(path.resolve(root, 'scratchpad/measure-gap-ids.txt'), key[1].join('\n') + '\n');
    console.log(`\nwrote ${key[1].length} ids -> scratchpad/measure-gap-ids.txt`);
    for (const i of key[1].slice(0, 30)) console.log('  ' + i);
  }
}
