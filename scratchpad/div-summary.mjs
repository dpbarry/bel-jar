// div-summary.mjs — run diverge-one over several ids and print a ONE-LINE
// summary each, plus the move kinds offered at the deepest dead end. Answers
// "was a recurse candidate ever offered?" without dumping full traces.
//   node scratchpad/div-summary.mjs --ids <file> [--sample N] [--max-steps N]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
let ids = fs.readFileSync(path.resolve(root, arg('--ids', 'scratchpad/measure-gap-ids.txt')), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean);
const sample = Number(arg('--sample', '0')) || 0;
if (sample && sample < ids.length) { // deterministic stride
  const stride = ids.length / sample;
  ids = Array.from({ length: sample }, (_, i) => ids[Math.floor(i * stride)]);
}
const maxSteps = arg('--max-steps', '30');

for (const id of ids) {
  let out = '';
  const t0 = Date.now();
  try {
    out = execFileSync(process.execPath,
      ['scratchpad/diverge-one.mjs', '--id', id, '--max-steps', maxSteps],
      { encoding: 'utf8', cwd: root, timeout: 300000, maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { out = String(e.stdout || ''); }
  let j = null;
  try { j = JSON.parse(out.trim().split('\n').pop()); } catch { /* noop */ }
  if (!j) { console.log(`${id}\n    ERROR/timeout after ${((Date.now() - t0) / 1000).toFixed(0)}s`); continue; }
  const d = j.deepest;
  const allKinds = [...new Set((j.allDead || []).flatMap((e) => e.kinds || []))].sort();
  console.log(`${id}`);
  console.log(`    ${j.verdict}  steps=${j.steps} checks=${j.checks} ${j.secs}s  holes=${j.holesVisited} dead=${j.deadEnds}`);
  console.log(`    kinds@deepest: ${d ? JSON.stringify(d.kinds) : '-'}`);
  console.log(`    kinds@any-dead: ${JSON.stringify(allKinds)}   RECURSE-OFFERED=${allKinds.includes('recurse') ? 'YES' : 'NO'}`);
  if (d) console.log(`    goal: ${d.goal}`);
}
