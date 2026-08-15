// ctor-reach-census.mjs — AT THE DEAD END, DID WE EVER PROPOSE THE RIGHT CONSTRUCTOR?
//
// Entry 50 left the big question open: 178 of 207 cheap deaths need only depth-1
// applications of ATOMIC slots — shapes the lookup pool CAN express — and the engine
// still fails. Two rival explanations, and they demand opposite fixes:
//   SPELLING  we propose the right constructor and get its arguments/context wrong
//             → the fix is emission (writability, context spelling, atom choice)
//   GENERATION we never propose it at all
//             → the fix is an earlier split/inversion, or the constructor enumerator
//
// The probe is FAMILY-SCOPED so it needs no hole alignment and avoids the "later
// parts of the proof" confound: at a dead-end goal of family F, compare
//   REF_F = constructors OF FAMILY F that the reference proof actually uses
//   ENG_F = constructors OF FAMILY F the engine proposed at that hole
// and ask whether REF_F is a subset of ENG_F.
//
//   node scratchpad/ctor-reach-census.mjs [--ids F] [--jobs N]
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { enumerateConstructorsTyped, decomposeContextual, headOfConclusion, typeFamilyHead } from '../js/editor-src/prover/hole-split.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const ids = fs.readFileSync(path.resolve(root, arg('--ids', 'scratchpad/cheapdeath-ids.txt')), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean);
const jobs = Math.max(1, Number(arg('--jobs', '4')) || 4);
const outPath = path.resolve(root, arg('--out', 'scratchpad/ctor-reach.jsonl'));

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

const famCache = new Map();
function ctorsOfFamily(code, fam) {
  const key = fam + '@' + code.length;
  if (famCache.has(key)) return famCache.get(key);
  let names = [];
  try { names = enumerateConstructorsTyped(code, fam).map((c) => c.name).filter(Boolean); } catch { names = []; }
  famCache.set(key, names);
  return names;
}

// Family head of a hole goal like `[g |- ex_inp_rew A B C]` or a bare ctype.
function goalFamily(goal, code) {
  const g = String(goal || '').trim();
  if (!g) return null;
  const d = decomposeContextual(g);
  const concl = (d && d.concl) ? d.concl : g.replace(/^.*?\|-\s*/, '');
  let h = null;
  try { h = typeFamilyHead(concl, code); } catch { h = null; }
  if (!h || h === 'type') h = headOfConclusion(concl);
  return h || null;
}

const wordsIn = (text) => new Set(String(text || '').match(/[A-Za-z_][A-Za-z0-9_'\/-]*/g) || []);

function runOne(id) {
  return new Promise((resolve) => {
    execFile(process.execPath, ['scratchpad/diverge-one.mjs', '--id', id, '--max-steps', '25'],
      { encoding: 'utf8', cwd: root, timeout: 300000, maxBuffer: 128 * 1024 * 1024 },
      (err, stdout) => {
        let j = null;
        const t = String(stdout || (err && err.stdout) || '').trim();
        try { j = JSON.parse(t.split('\n').pop()); } catch { j = null; }
        resolve(j);
      });
  });
}

let done = 0;
const agg = {
  holes: 0, subset: 0, notSubset: 0, noFam: 0, noRef: 0,
  missingSizes: new Map(), examples: [],
};
fs.writeFileSync(outPath, '');

async function main() {
  const queue = [...ids];
  await Promise.all(Array.from({ length: jobs }, async () => {
    while (queue.length) {
      const id = queue.shift();
      const j = await runOne(id);
      done += 1;
      process.stderr.write(`  [${done}/${ids.length}] ${id}\n`);
      if (!j || !j.allDead) continue;
      const [prog, name] = id.split('#');
      const code = programOf(prog);
      const body = bodyOf(prog, name);
      if (!code || body == null) continue;
      const refWords = wordsIn(body);

      // Use the DEEPEST dead end (the furthest the search actually got).
      const d = j.deepest || j.allDead[0];
      if (!d) continue;
      const fam = goalFamily(d.goal, code);
      if (!fam) { agg.noFam += 1; continue; }
      const famCtors = ctorsOfFamily(code, fam);
      if (!famCtors.length) { agg.noFam += 1; continue; }

      const engWords = wordsIn((d.rows || []).map((r) => r.head || '').join(' '));
      const REF = famCtors.filter((c) => refWords.has(c));
      const ENG = famCtors.filter((c) => engWords.has(c));
      if (!REF.length) { agg.noRef += 1; continue; }

      const missing = REF.filter((c) => !ENG.includes(c));
      agg.holes += 1;
      if (!missing.length) agg.subset += 1; else agg.notSubset += 1;
      agg.missingSizes.set(missing.length, (agg.missingSizes.get(missing.length) || 0) + 1);
      if (missing.length && agg.examples.length < 12) {
        agg.examples.push({ name, fam, REF, ENG, missing, goal: String(d.goal || '').slice(0, 80) });
      }
      fs.appendFileSync(outPath, JSON.stringify({
        id, fam, famCtors: famCtors.length, REF, ENG, missing, nRows: (d.rows || []).length,
      }) + '\n');
    }
  }));

  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '—');
  console.log(`\n=== CONSTRUCTOR REACH AT THE DEEPEST DEAD END — ${done} targets ===`);
  console.log(`   holes scored                       : ${agg.holes}`);
  console.log(`   (skipped: no family ${agg.noFam}, reference uses no ctor of that family ${agg.noRef})`);
  console.log(`\n   REF_F ⊆ ENG_F  — we DID propose every needed constructor : ${agg.subset}  ${pct(agg.subset, agg.holes)}`);
  console.log(`   REF_F ⊄ ENG_F  — we NEVER proposed at least one          : ${agg.notSubset}  ${pct(agg.notSubset, agg.holes)}`);
  console.log(`\n   missing-count distribution:`);
  for (const [k, v] of [...agg.missingSizes.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`     ${k} missing: ${String(v).padStart(4)}  ${pct(v, agg.holes)}`);
  }
  console.log(`\n   examples where a needed constructor was NEVER proposed:`);
  for (const e of agg.examples) {
    console.log(`     ${e.name}  family=${e.fam}`);
    console.log(`        goal    ${e.goal}`);
    console.log(`        ref uses ${e.REF.join(', ')} | engine proposed ${e.ENG.join(', ') || '(none)'} | MISSING ${e.missing.join(', ')}`);
  }
  console.log(`\n   INTERPRETATION: a high ⊆ share means the constructor is proposed and the`);
  console.log(`   failure is in ARGUMENTS/SPELLING. A high ⊄ share means generation never`);
  console.log(`   reaches it, and the fix is upstream (an earlier split/inversion).`);
}

main();
