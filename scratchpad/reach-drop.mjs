// reach-drop.mjs — REACH census for entry 41a: how often does the search actually
// hit a hole where a contextual fact is DROPPED from the planning domain because the
// goal is a ctype (empty ambient context)? Counts targets with >=1 drop, not
// references that merely need the shape. This is the toggle-discipline instrument:
// a text census sizes NEED, this sizes REACH.
//
//   node scratchpad/reach-drop.mjs --ids scratchpad/ctorapp-inline.txt --out d.jsonl [--cap 60] [--sample 40]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
let ids = fs.readFileSync(path.resolve(root, arg('--ids', null)), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const out = arg('--out', null);
const capSecs = Number(arg('--cap', '60')) || 60;
const sample = Number(arg('--sample', '0')) || 0;
// Deterministic stride sample so the pick is reproducible and spread across devs.
if (sample && ids.length > sample) {
  const stride = ids.length / sample;
  ids = Array.from({ length: sample }, (_, i) => ids[Math.floor(i * stride)]);
}

const wrapper = path.resolve(root, 'scratchpad/_dropwrap.mjs');
fs.writeFileSync(wrapper, `
const seen = new Set();
globalThis.__factDropDebug = (d) => {
  const k = d.name + ':' + d.ctx;
  if (seen.has(k)) return; seen.add(k);
  console.error('FACTDROP ' + d.name + ' : ' + d.type + ' ctx=[' + d.ctx + '] goalParts=' + JSON.stringify(d.goalParts));
};
await import('./diverge-one.mjs');
`);

const rows = [];
for (let i = 0; i < ids.length; i += 1) {
  const id = ids[i];
  const t0 = Date.now();
  const row = await new Promise((resolve) => {
    const p = spawn(process.execPath, [wrapper, '--id', id], { cwd: root });
    let so = ''; let se = '';
    const timer = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* */ } }, capSecs * 1000);
    p.stdout.on('data', (d) => { so += d; });
    p.stderr.on('data', (d) => { se += d; });
    p.on('close', () => {
      clearTimeout(timer);
      const drops = (se.match(/FACTDROP/g) || []).length;
      // A drop at a CTYPE goal is the entry-41a case: goalParts empty, ctx non-empty.
      const ctypeDrops = (se.match(/FACTDROP [^\n]*goalParts=\[\]/g) || []).length;
      const line = so.split('\n').filter((l) => l.trim().startsWith('{')).pop();
      let v = 'CANCELLED'; let ck = null;
      if (line) { try { const j = JSON.parse(line); v = j.verdict || `ERR:${j.error}`; ck = j.checks; } catch { v = 'PARSE-ERR'; } }
      resolve({ id, verdict: v, checks: ck, drops, ctypeDrops, secs: (Date.now() - t0) / 1000 });
    });
  });
  rows.push(row);
  if (out) fs.appendFileSync(path.resolve(root, out + '.partial'), JSON.stringify(row) + '\n');
  console.log(`${String(i + 1).padStart(3)}/${ids.length} drop=${String(row.ctypeDrops).padStart(3)} ${String(row.verdict).padEnd(24)} ${id}`);
}
const withDrop = rows.filter((r) => r.ctypeDrops > 0);
console.log(`\nTARGETS WITH >=1 CTYPE-GOAL FACT DROP : ${withDrop.length}/${rows.length}`);
console.log(`total drops                           : ${rows.reduce((a, r) => a + r.ctypeDrops, 0)}`);
if (out) fs.writeFileSync(path.resolve(root, out), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
