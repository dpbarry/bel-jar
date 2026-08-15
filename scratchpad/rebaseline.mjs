// rebaseline.mjs — parallel native sweep over the whole corpus, RESUMABLE.
//
// Why: every percentage quoted this session came from
// `library.native-merged-20260729.jsonl`, which predates at least two shipped
// mechanisms — 2 of its STUCK rows already complete today. A stale denominator makes
// every class share approximate. This produces a current ledger in the same schema
// (status field `outcome`) so class sizing and `prover:diff` baselines are honest again.
//
//   node scratchpad/rebaseline.mjs [--ids F] [--out F] [--jobs N] [--cap 60]
//
// Resumable: ids already present in --out are skipped, so an interrupted sweep
// continues where it stopped. One child process per target, so a wedged target can
// never poison the batch.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const root = process.cwd();
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const idsPath = arg('--ids', 'scratchpad/rebaseline-ids.txt');
const outPath = path.resolve(root, arg('--out', 'results/corpus/library.native-rebaseline-current.jsonl'));
const jobs = Math.max(1, Number(arg('--jobs', '4')) || 4);
const cap = arg('--cap', '60');
const maxSteps = arg('--max-steps', '40');

const all = fs.readFileSync(path.resolve(root, idsPath), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean);

const done = new Set();
if (fs.existsSync(outPath)) {
  for (const line of fs.readFileSync(outPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { done.add(JSON.parse(line).id); } catch { /* partial last line */ }
  }
}
const queue = all.filter((id) => !done.has(id));
process.stderr.write(`rebaseline: ${all.length} targets, ${done.size} already done, ${queue.length} to run\n`);

// A child that dies without printing (OOM, hard wedge) must still leave a row, or
// the resume logic would retry it forever.
function runOne(id) {
  return new Promise((resolve) => {
    execFile(process.execPath,
      ['scratchpad/rebaseline-one.mjs', '--id', id, '--cap', cap, '--max-steps', maxSteps],
      { encoding: 'utf8', cwd: root, timeout: (Number(cap) + 45) * 1000, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout) => {
        const text = String(stdout || (err && err.stdout) || '').trim();
        const line = text.split('\n').filter((l) => l.trim().startsWith('{')).pop();
        if (line) { try { return resolve(JSON.parse(line)); } catch { /* fall through */ } }
        resolve({ id, name: id.split('#')[1], program: id.split('#')[0], outcome: 'CANCELLED', reason: 'no-output' });
      });
  });
}

let n = 0;
const tally = new Map();
const t0 = Date.now();

await Promise.all(Array.from({ length: jobs }, async () => {
  while (queue.length) {
    const id = queue.shift();
    const row = await runOne(id);
    n += 1;
    tally.set(row.outcome, (tally.get(row.outcome) || 0) + 1);
    fs.appendFileSync(outPath, JSON.stringify(row) + '\n');
    const rate = n / ((Date.now() - t0) / 1000);
    const eta = rate > 0 ? Math.round(queue.length / rate / 60) : '?';
    process.stderr.write(`  [${n}/${queue.length + n}] ${id} ${row.outcome}${row.reason ? ':' + row.reason : ''}`
      + ` [${row.checks ?? '-'} checks, ${row.secs ?? '-'}s]  eta ~${eta}m\n`);
  }
}));

console.log(`\n=== REBASELINE COMPLETE — ${n} targets in ${((Date.now() - t0) / 60000).toFixed(1)} min ===`);
const rows = fs.readFileSync(outPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const byOutcome = new Map();
for (const r of rows) byOutcome.set(r.outcome, (byOutcome.get(r.outcome) || 0) + 1);
for (const [k, v] of [...byOutcome.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${(100 * v / rows.length).toFixed(1).padStart(5)}%  ${k}`);
}
console.log(`\n  ledger written to ${path.relative(root, outPath)}`);
