// prover-residue-audit.mjs — classify EVERY failed ledger target by what its
// REFERENCE PROOF (the original masked body, present in the corpus) actually
// requires. Pure text analysis: seconds, no oracle, no browser. This is the
// instrument that falsified the "no-move mass = lemma-depth wall" story
// (2026-07-19): 179 of 378 no-moves had reference proofs of ≤8 lines built
// from pool ingredients. Run it BEFORE choosing what to build — the corpus
// carries every answer; classification never needs a sweep.
//
//   node scripts/prover-residue-audit.mjs [--ledger results/corpus/library.jsonl]
//
// Buckets by (outcome :: reference-proof shape); prints counts descending +
// sample ids with per-proof stats (lines / cases / lets / mlams / distinct
// call heads / substitution tuples).
import fs from 'node:fs';
import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; }
const ledgerPath = arg('--ledger', path.join('results', 'corpus', 'library.jsonl'));

// Dedupe by LAST outcome per id — the harness's wedge-recovery re-appends rows.
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
    } else {
      code = fs.readFileSync(abs, 'utf8');
    }
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

const buckets = new Map();
const put = (b, id) => { if (!buckets.has(b)) buckets.set(b, []); buckets.get(b).push(id); };

for (const r of rows.values()) {
  const k = r.outcome + (r.reason ? ':' + r.reason : '');
  if (r.outcome === 'COMPLETE' || r.outcome === 'PRECHECK_FAIL' || r.outcome === 'FAIL') continue;
  const [prog, name] = r.id.split('#');
  const body = bodyOf(prog, name);
  if (body == null) { put(k + '|unreadable', r.id); continue; }
  const lines = body.split('\n').filter((l) => l.trim()).length;
  const hasFun = /(^|\s)fun\s/.test(body) || /\|\s*\([^)]*\.\s*/.test(body);
  const cases = (body.match(/\bcase\b/g) || []).length;
  const lets = (body.match(/\blet\b/g) || []).length;
  const calls = new Set((body.match(/\b([a-z][A-Za-z0-9_']*)\s+\[/g) || []).map((s) => s.split(/\s/)[0]));
  const mlams = (body.match(/\bmlam\b/g) || []).length;
  const substTuple = /<[^>]*;[^>]*>/.test(body);
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
  put(tag, `${r.id} [ln=${lines} case=${cases} let=${lets} mlam=${mlams} calls=${calls.size}${substTuple ? ' subst<>' : ''}]`);
}

const sorted = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [b, ids] of sorted) {
  console.log(`\n== ${b}  (${ids.length})`);
  for (const id of ids.slice(0, 4)) console.log('   ', id);
}
