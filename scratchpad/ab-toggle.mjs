// ab-toggle.mjs — generic A/B over any engine toggle env var, reporting BOTH
// verdict changes and CHECK COUNTS (speed is product quality per the sprint
// contract, so a slice may be staked on checks with zero verdict losses).
//
//   node scratchpad/ab-toggle.mjs --env NO_CTXVARFILL --ids <file> [--sample N]
//
// The OFF arm sets the env var (disabling the mechanism); the ON arm leaves it unset.
// Never run beside a sweep — a CANCELLED under contention mimics a regression.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
const envVar = arg('--env', null);
if (!envVar) { console.error('need --env <VAR>'); process.exit(2); }
let ids = fs.readFileSync(path.resolve(root, arg('--ids', 'scratchpad/stuck-all.txt')), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean);
const sample = Number(arg('--sample', '0')) || 0;
if (sample && sample < ids.length) {
  const stride = ids.length / sample;
  ids = Array.from({ length: sample }, (_, i) => ids[Math.floor(i * stride)]);
}
const maxSteps = arg('--max-steps', '25');
const outPath = arg('--out', `scratchpad/ab-${envVar.toLowerCase()}.jsonl`);

function run(id, off) {
  const env = { ...process.env };
  if (off) env[envVar] = '1'; else delete env[envVar];
  try {
    const out = execFileSync(process.execPath,
      ['scratchpad/diverge-one.mjs', '--id', id, '--max-steps', maxSteps],
      { encoding: 'utf8', cwd: root, env, timeout: 400000, maxBuffer: 128 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out.trim().split('\n').pop());
  } catch (e) {
    try { return JSON.parse(String(e.stdout || '').trim().split('\n').pop()); } catch { return { verdict: 'HARNESS-ERROR' }; }
  }
}

fs.writeFileSync(path.resolve(root, outPath), '');
let gained = 0; let lost = 0; let offC = 0; let onC = 0;
for (const id of ids) {
  const off = run(id, true);
  const on = run(id, false);
  const o = String(off.verdict || '?'); const n = String(on.verdict || '?');
  let mark = '   =';
  if (o !== 'COMPLETE' && n === 'COMPLETE') { mark = ' +++'; gained += 1; }
  else if (o === 'COMPLETE' && n !== 'COMPLETE') { mark = ' ---'; lost += 1; }
  offC += Number(off.checks) || 0; onC += Number(on.checks) || 0;
  const row = { id, off: o, on: n, offChecks: off.checks, onChecks: on.checks };
  fs.appendFileSync(path.resolve(root, outPath), JSON.stringify(row) + '\n');
  const d = (off.checks && on.checks) ? `${(100 * (on.checks - off.checks) / off.checks).toFixed(0)}%` : '-';
  console.log(`${mark}  ${id}\n        OFF ${o} ${off.checks}ck   ON ${n} ${on.checks}ck   (${d})`);
}
console.log(`\n=== ${envVar}: ${ids.length} targets ===`);
console.log(`gained ${gained}   lost ${lost}`);
console.log(`checks OFF ${offC}  ON ${onC}   delta ${(100 * (onC - offC) / (offC || 1)).toFixed(1)}%`);
