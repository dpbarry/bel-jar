// reach-subst.mjs — REACH census for the weakening-substitution defect.
// Runs diverge-one per id (own process, killable) and records whether the
// search ever EMITTED a candidate the checker rejected with "Ill-typed
// substitution" / "Does not take context". That measures what the search
// REACHES, not what the reference proofs need (the census trap).
//
//   node scratchpad/reach-subst.mjs --ids scratchpad/nomove-small.txt --out r.jsonl [--cap 60]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
const ids = fs.readFileSync(path.resolve(root, arg('--ids', null)), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const out = arg('--out', null);
const capSecs = Number(arg('--cap', '60')) || 60;
const maxSteps = arg('--max-steps', '40');

const RX = /Ill-typed substitution|Does not take context/;
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
      const hit = RX.test(buf);
      const line = buf.split('\n').filter((l) => l.trim().startsWith('{')).pop();
      if (!line) return resolve({ id, verdict: 'CANCELLED', substHit: hit, secs: (Date.now() - t0) / 1000 });
      try {
        const j = JSON.parse(line);
        resolve({ id, verdict: j.verdict || `ERR:${j.error}`, substHit: hit, steps: j.steps, checks: j.checks, secs: j.secs });
      } catch { resolve({ id, verdict: 'PARSE-ERR', substHit: hit, secs: (Date.now() - t0) / 1000 }); }
    });
  });
  rows.push(row);
  if (out) fs.appendFileSync(path.resolve(root, out + '.partial'), JSON.stringify(row) + '\n');
  console.log(`${String(i + 1).padStart(3)}/${ids.length} ${row.substHit ? 'SUBST' : '     '} ${String(row.verdict).padEnd(26)} ck=${String(row.checks ?? '-').padStart(5)} ${String(row.secs ?? '-').padStart(6)}s  ${id}`);
}
const hits = rows.filter((r) => r.substHit);
console.log(`\nSUBST-REACHED ${hits.length}/${rows.length}`);
console.log(`COMPLETE      ${rows.filter((r) => r.verdict === 'COMPLETE').length}/${rows.length}`);
if (out) fs.writeFileSync(path.resolve(root, out), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
