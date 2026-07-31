// run-class.mjs — native batch runner over an id list (one child process per
// target so a wedge/timeout can never poison the batch). Prints one line per
// target and a summary; writes JSONL to --out for A/B differencing.
//
//   node scratchpad/run-class.mjs --ids scratchpad/ids.txt --out a.jsonl [--cap 90] [--max-steps 40]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
const idsFile = arg('--ids', null);
const out = arg('--out', null);
const capSecs = Number(arg('--cap', '90')) || 90;
const maxSteps = arg('--max-steps', '40');
const ids = fs.readFileSync(path.resolve(root, idsFile), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);

const rows = [];
for (let i = 0; i < ids.length; i += 1) {
  const id = ids[i];
  const t0 = Date.now();
  const row = await new Promise((resolve) => {
    const p = spawn(process.execPath, ['scratchpad/diverge-one.mjs', '--id', id, '--max-steps', maxSteps], { cwd: root });
    let buf = '';
    const timer = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* */ } }, capSecs * 1000);
    p.stdout.on('data', (d) => { buf += d; });
    p.stderr.on('data', () => {});
    p.on('close', () => {
      clearTimeout(timer);
      const line = buf.split('\n').filter((l) => l.trim().startsWith('{')).pop();
      if (!line) return resolve({ id, verdict: 'CANCELLED', secs: (Date.now() - t0) / 1000 });
      try {
        const j = JSON.parse(line);
        resolve({ id, verdict: j.verdict || `ERR:${j.error}`, steps: j.steps, checks: j.checks, secs: j.secs });
      } catch { resolve({ id, verdict: 'PARSE-ERR', secs: (Date.now() - t0) / 1000 }); }
    });
  });
  rows.push(row);
  // Append as we go: a long sweep that is interrupted still leaves its measurements.
  if (out) fs.appendFileSync(path.resolve(root, out + '.partial'), JSON.stringify(row) + '\n');
  const mark = row.verdict === 'COMPLETE' ? '✔' : ' ';
  console.log(`${String(i + 1).padStart(3)}/${ids.length} ${mark} ${String(row.verdict).padEnd(28)} ck=${String(row.checks ?? '-').padStart(5)} ${String(row.secs ?? '-').padStart(6)}s  ${id}`);
}
const done = rows.filter((r) => r.verdict === 'COMPLETE');
console.log(`\nCOMPLETE ${done.length}/${rows.length}`);
const byV = new Map();
for (const r of rows) byV.set(r.verdict, (byV.get(r.verdict) || 0) + 1);
for (const [k, v] of [...byV].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
if (out) fs.writeFileSync(path.resolve(root, out), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
