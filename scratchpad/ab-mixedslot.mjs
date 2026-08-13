// ab-mixedslot.mjs — A/B the per-slot underscore (mixed) call spelling over a
// stratified bench. Runs BOTH arms sequentially in one process-per-target so the
// toggle is read fresh; never run this beside a sweep (a CANCELLED under CPU
// contention looks exactly like a regression — [[reference-prover-harness-traps]]).
//
//   node scratchpad/ab-mixedslot.mjs --ids <file> [--sample N] [--max-steps N]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
let ids = fs.readFileSync(path.resolve(root, arg('--ids', 'scratchpad/mixedslot-aonly.txt')), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean);
const sample = Number(arg('--sample', '0')) || 0;
if (sample && sample < ids.length) {          // deterministic stride, spreads developments
  const stride = ids.length / sample;
  ids = Array.from({ length: sample }, (_, i) => ids[Math.floor(i * stride)]);
}
const maxSteps = arg('--max-steps', '30');
const outPath = arg('--out', 'scratchpad/ab-mixedslot.jsonl');

function run(id, off) {
  const env = { ...process.env };
  if (off) env.NO_MIXEDSLOT = '1'; else delete env.NO_MIXEDSLOT;
  try {
    const out = execFileSync(process.execPath,
      ['scratchpad/diverge-one.mjs', '--id', id, '--max-steps', maxSteps],
      { encoding: 'utf8', cwd: root, env, timeout: 300000, maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out.trim().split('\n').pop());
  } catch (e) {
    try { return JSON.parse(String(e.stdout || '').trim().split('\n').pop()); } catch { return { verdict: 'HARNESS-ERROR' }; }
  }
}

const rows = [];
let gained = 0; let lost = 0;
fs.writeFileSync(path.resolve(root, outPath), '');
for (const id of ids) {
  const off = run(id, true);
  const on = run(id, false);
  const o = String(off.verdict || '?'); const n = String(on.verdict || '?');
  let delta = '   =';
  if (o !== 'COMPLETE' && n === 'COMPLETE') { delta = ' +++'; gained += 1; }
  else if (o === 'COMPLETE' && n !== 'COMPLETE') { delta = ' ---'; lost += 1; }
  const row = { id, off: o, on: n, offChecks: off.checks, onChecks: on.checks, offSecs: off.secs, onSecs: on.secs };
  rows.push(row);
  fs.appendFileSync(path.resolve(root, outPath), JSON.stringify(row) + '\n');
  console.log(`${delta}  ${id}\n        OFF ${o} (${off.checks}ck ${off.secs}s)   ON ${n} (${on.checks}ck ${on.secs}s)`);
}
console.log(`\n=== BENCH ${rows.length} targets ===`);
console.log(`gained (STUCK->COMPLETE): ${gained}`);
console.log(`lost   (COMPLETE->STUCK): ${lost}`);
const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
console.log(`checks OFF ${sum('offChecks')}  ON ${sum('onChecks')}`);
