// death-census.mjs — WHY DOES THE SEARCH STOP? (full-population, not a sample)
//
// `error-census.mjs` tallies only rows with verdict==='rejected', so it is blind to
// the death mode where candidateMoves returns NOTHING (kinds:[], nTried:0). A probe
// on 2026-08-15 hit exactly that on the first target tried, which means every
// previous rejection histogram was computed against the wrong denominator.
//
// This classifies EVERY dead end of every target into one of:
//   ZERO-CAND   nothing was generated at all      → GENERATION gap
//   ALL-REJECT  candidates generated, checker said no → TYPING/SPELLING gap
//   ALL-GUARD   our own guards refused everything  → SEARCH-CONTROL gap
//   MIXED       some rejected, some guarded
// and sub-features the ZERO-CAND goals structurally, so the gap is named, not guessed.
//
//   node scratchpad/death-census.mjs --ids <file> [--sample N] [--max-steps N]
//                                    [--out scratchpad/death-census.jsonl] [--jobs N]
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const root = process.cwd();
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

let ids = fs.readFileSync(path.resolve(root, arg('--ids', 'scratchpad/cheapdeath-ids.txt')), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean);
const sample = Number(arg('--sample', '0')) || 0;
if (sample && sample < ids.length) {
  const stride = ids.length / sample;
  ids = Array.from({ length: sample }, (_, i) => ids[Math.floor(i * stride)]);
}
const maxSteps = arg('--max-steps', '25');
const jobs = Math.max(1, Number(arg('--jobs', '4')) || 4);
const outPath = path.resolve(root, arg('--out', 'scratchpad/death-census.jsonl'));

// Normalise a checker message to an error CLASS (drop names/indices so it groups).
function errClass(reason) {
  const s = String(reason || '').replace(/\[[0-9;]*m/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return '(empty error)';
  if (/^(guard|pre-filter|backtracked|rejected on a prior visit|vacuous)/i.test(s)) {
    return `GUARD: ${s.split(':')[0]}`;
  }
  const m = /Error:?\s*(.*)$/i.exec(s);
  const body = (m ? m[1] : s).trim();
  return body
    .replace(/["'`][^"'`]*["'`]/g, 'X')
    .replace(/\b[A-Z][\w']*\b/g, 'N')
    .split(/[.\n]/)[0]
    .slice(0, 90) || '(blank)';
}

// Structural features of a hole where NOTHING was generated. Every predicate is a
// property of the SHAPE (no theorem/constructor/schema names) so a spike names a
// mechanism, not a target.
function zeroCandFeatures(d) {
  const f = [];
  const goal = String(d.goal || '');
  const metas = (d.meta || []).map(String);
  const hctx = (d.hctx || []).map(String);
  const invented = (s) => /["“]/.test(s);              // checker-invented meta name
  const extended = (s) => /\|-\s*/.test(s) && /,\s*\w+\s*:/.test(s.split('|-')[0] || '');

  if (!goal) f.push('goal:(none)');
  else if (/->/.test(goal)) f.push('goal:arrow(ctype)');
  else if (/^\s*\[/.test(goal)) f.push('goal:box');
  else f.push('goal:bare-ctype');

  if (invented(goal)) f.push('goal:cites-invented-meta');
  if (/\\\s*\w+\s*\./.test(goal)) f.push('goal:under-lambda');
  if (metas.some(invented)) f.push('meta:invented-name');
  if (metas.some(extended)) f.push('meta:extended-context');
  if (metas.some((s) => /:\s*ctx\b/.test(s))) f.push('meta:has-ctx-var');
  if (!hctx.length) f.push('hyps:none');
  else if (hctx.some(invented)) f.push('hyps:cites-invented-meta');
  if (hctx.some((s) => /\|-/.test(s) && !/^\s*\w+\s*:\s*\[/.test(s))) f.push('hyps:non-box');
  if (d.branch) f.push('site:inside-case-arm'); else f.push('site:top-level');
  return f;
}

function runOne(id) {
  return new Promise((resolve) => {
    execFile(process.execPath,
      ['scratchpad/diverge-one.mjs', '--id', id, '--max-steps', maxSteps],
      { encoding: 'utf8', cwd: root, timeout: 300000, maxBuffer: 128 * 1024 * 1024 },
      (err, stdout) => {
        let j = null;
        const text = String(stdout || (err && err.stdout) || '').trim();
        try { j = JSON.parse(text.split('\n').pop()); } catch { j = null; }
        resolve({ id, j });
      });
  });
}

const modeTally = new Map();      // death mode -> count (per DEEPEST dead end)
const anyZeroCand = { yes: 0, no: 0 };
const featTally = new Map();      // zero-cand feature -> count
const errTally = new Map();       // error class -> { n, kinds:Map, examples:[] }
const kindTally = new Map();      // move kind offered at dead ends -> count
let done = 0; let failed = 0;

function classify(d) {
  const rows = d.rows || [];
  if (!rows.length && !(d.kinds || []).length) return 'ZERO-CAND';
  const rej = rows.filter((r) => r.verdict === 'rejected').length;
  const gd = rows.filter((r) => r.verdict === 'guard').length;
  if (rej && gd) return 'MIXED';
  if (rej) return 'ALL-REJECT';
  if (gd) return 'ALL-GUARD';
  return 'ZERO-CAND';
}

fs.writeFileSync(outPath, '');

async function main() {
  const queue = [...ids];
  const workers = Array.from({ length: jobs }, async () => {
    while (queue.length) {
      const id = queue.shift();
      const { j } = await runOne(id);
      done += 1;
      if (!j || !j.allDead) { failed += 1; process.stderr.write(`  [${done}/${ids.length}] ${id} — NO DATA\n`); continue; }

      const deads = j.allDead;
      const deepest = j.deepest || deads[0];
      const dm = deepest ? classify(deepest) : 'NO-DEAD-END';
      modeTally.set(dm, (modeTally.get(dm) || 0) + 1);

      const zc = deads.filter((d) => classify(d) === 'ZERO-CAND');
      if (zc.length) anyZeroCand.yes += 1; else anyZeroCand.no += 1;
      for (const d of zc) for (const f of zeroCandFeatures(d)) featTally.set(f, (featTally.get(f) || 0) + 1);

      for (const d of deads) {
        for (const k of (d.kinds || [])) kindTally.set(k, (kindTally.get(k) || 0) + 1);
        for (const r of (d.rows || [])) {
          if (r.verdict !== 'rejected') continue;
          const k = errClass(r.reason);
          if (!errTally.has(k)) errTally.set(k, { n: 0, kinds: new Map(), examples: [] });
          const t = errTally.get(k);
          t.n += 1;
          t.kinds.set(r.kind, (t.kinds.get(r.kind) || 0) + 1);
          if (t.examples.length < 6) t.examples.push(`${r.kind}: ${String(r.head || '').slice(0, 110)}`);
        }
      }

      fs.appendFileSync(outPath, JSON.stringify({
        id, verdict: j.verdict, checks: j.checks, deadEnds: j.deadEnds,
        deepestMode: dm, zeroCandHoles: zc.length, totalDead: deads.length,
        zeroCandGoals: zc.slice(0, 3).map((d) => ({ goal: d.goal, meta: d.meta, hctx: d.hctx, branch: d.branch })),
      }) + '\n');
      process.stderr.write(`  [${done}/${ids.length}] ${id} ${j.verdict} deepest=${dm} zc=${zc.length}/${deads.length}\n`);
    }
  });
  await Promise.all(workers);

  const line = (n, tot) => `${String(n).padStart(5)} (${String(Math.round(100 * n / (tot || 1))).padStart(3)}%)`;
  const ok = done - failed;
  console.log(`\n=== DEATH CENSUS — ${ok} targets with data (${failed} no data) ===\n`);

  console.log('DEEPEST DEAD END, by mode:');
  for (const [k, n] of [...modeTally.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${line(n, ok)}  ${k}`);

  console.log(`\nTARGETS WITH >=1 ZERO-CANDIDATE HOLE ANYWHERE: ${line(anyZeroCand.yes, ok)}  (none: ${anyZeroCand.no})`);

  console.log('\nZERO-CANDIDATE HOLE FEATURES (share of zero-cand holes):');
  const featTot = [...featTally.values()].reduce((a, b) => a + b, 0);
  for (const [k, n] of [...featTally.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${line(n, featTot)}  ${k}`);

  console.log('\nMOVE KINDS OFFERED at dead ends (a kind absent here is never generated):');
  for (const [k, n] of [...kindTally.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);

  const errTot = [...errTally.values()].reduce((a, t) => a + t.n, 0);
  console.log(`\nCHECKER REJECTIONS (${errTot} rows) — the TYPING/SPELLING gap:`);
  for (const [k, t] of [...errTally.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 15)) {
    const kinds = [...t.kinds.entries()].sort((a, b) => b[1] - a[1]).map(([x, c]) => `${x}:${c}`).join(' ');
    console.log(`  ${line(t.n, errTot)}  ${k}`);
    console.log(`           kinds: ${kinds}`);
    for (const e of t.examples.slice(0, 2)) console.log(`           e.g. ${e}`);
  }
  console.log(`\nrows written to ${path.relative(root, outPath)}`);
}

main();
