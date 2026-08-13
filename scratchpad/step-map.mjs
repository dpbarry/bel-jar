// step-map.mjs — WHERE DOES THE RESIDUE DIE? For a stride sample of stuck targets,
// record how many steps the search ACCEPTED before it died, plus the offered move
// kinds and the goal shape at the deepest dead end.
//
// The question this answers: is the residue "the search goes a long way and then
// runs out" (a search-control problem) or "the search never leaves the starting
// line" (a vocabulary/model problem)? Those need opposite responses, and the ROI
// law says only the second has ever paid.
//
//   node scratchpad/step-map.mjs --ids <file> [--sample N] [--max-steps N]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
let ids = fs.readFileSync(path.resolve(root, arg('--ids', 'scratchpad/stuck-all.txt')), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean);
const sample = Number(arg('--sample', '0')) || 0;
if (sample && sample < ids.length) {
  const stride = ids.length / sample;
  ids = Array.from({ length: sample }, (_, i) => ids[Math.floor(i * stride)]);
}
const maxSteps = arg('--max-steps', '20');
const outPath = arg('--out', 'scratchpad/step-map.jsonl');

fs.writeFileSync(path.resolve(root, outPath), '');
let n = 0;
for (const id of ids) {
  let j = null;
  try {
    const out = execFileSync(process.execPath,
      ['scratchpad/diverge-one.mjs', '--id', id, '--max-steps', maxSteps],
      { encoding: 'utf8', cwd: root, timeout: 300000, maxBuffer: 128 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'] });
    j = JSON.parse(out.trim().split('\n').pop());
  } catch (e) { try { j = JSON.parse(String(e.stdout || '').trim().split('\n').pop()); } catch { j = null; } }
  if (!j) continue;
  n += 1;
  const kinds = new Set();
  for (const d of (j.allDead || [])) for (const r of (d.rows || [])) kinds.add(r.kind);
  const deepest = (j.allDead || [])[0] || {};
  fs.appendFileSync(path.resolve(root, outPath), JSON.stringify({
    id, verdict: j.verdict, steps: j.steps, checks: j.checks,
    kinds: [...kinds].sort(), goal: String(deepest.goal || '').slice(0, 120),
    hasRecurse: kinds.has('recurse'), hasSplit: kinds.has('split'),
  }) + '\n');
  process.stderr.write(`  [${n}/${ids.length}] ${String(j.verdict).padEnd(22)} steps=${String(j.steps).padEnd(3)} ck=${j.checks}  ${id}\n`);
}

// ── report ────────────────────────────────────────────────────────────────────
const rows = fs.readFileSync(path.resolve(root, outPath), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));
const bucket = (s) => (s === 0 ? '0 steps (never started)'
  : s <= 2 ? '1-2 steps' : s <= 5 ? '3-5 steps' : s <= 10 ? '6-10 steps' : '11+ steps');
const b = new Map(); const ck = new Map();
for (const r of rows) {
  const k = bucket(r.steps || 0);
  b.set(k, (b.get(k) || 0) + 1);
  ck.set(k, (ck.get(k) || 0) + (r.checks || 0));
}
const totalCk = rows.reduce((a, r) => a + (r.checks || 0), 0);
console.log(`\n=== ${rows.length} targets ===`);
console.log('bucket                      n     share   checks   share-of-checks');
for (const k of ['0 steps (never started)', '1-2 steps', '3-5 steps', '6-10 steps', '11+ steps']) {
  if (!b.has(k)) continue;
  console.log(`${k.padEnd(26)} ${String(b.get(k)).padStart(3)}  ${String(Math.round(100 * b.get(k) / rows.length)).padStart(4)}%  ${String(ck.get(k)).padStart(7)}  ${String(Math.round(100 * ck.get(k) / (totalCk || 1))).padStart(6)}%`);
}
const noRec = rows.filter((r) => !r.hasRecurse).length;
console.log(`\nnever offered a RECURSE candidate: ${noRec}/${rows.length} (${Math.round(100 * noRec / rows.length)}%)`);
console.log(`cheap deaths (<30 checks):          ${rows.filter((r) => (r.checks || 0) < 30).length}/${rows.length}`);
