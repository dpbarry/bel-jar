// error-census.mjs — INDUSTRIALISED "read the emitted text".
//
// The ROI law (master plan §0.5): every gain ever measured came from a MISSING MOVE
// or MIS-EMITTED TEXT; nothing came from pruning or ranking. Mis-emitted text is
// findable in bulk, because every rejected candidate carries the CHECKER'S OWN
// verdict. This runs a stride sample of stuck targets and tabulates
//     (move kind) x (checker error class)
// so a systematic spelling defect shows up as a spike instead of being found one
// target at a time.
//
//   node scratchpad/error-census.mjs --ids <file> [--sample N] [--max-steps N]
//
// Output: the error histogram overall and per move kind, plus example candidate
// texts for the top classes — those examples are the thing to read.
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
const maxSteps = arg('--max-steps', '25');
const outPath = arg('--out', 'scratchpad/error-census.jsonl');

// Normalise a checker message to an error CLASS (drop names/indices so it groups).
function errClass(reason) {
  const s = String(reason || '').replace(/?\[[0-9;]*m/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return '(empty)';
  if (/^(guard|pre-filter|backtracked|rejected on a prior visit|vacuous)/i.test(s)) return `GUARD: ${s.split(':')[0]}`;
  const m = /Error:?\s*(.*)$/i.exec(s);
  const body = (m ? m[1] : s).trim();
  return body
    .replace(/["'`][^"'`]*["'`]/g, 'X')
    .replace(/\b[A-Z][\w']*\b/g, 'N')
    .split(/[.\n]/)[0]
    .slice(0, 90) || '(blank)';
}

fs.writeFileSync(path.resolve(root, outPath), '');
const tally = new Map();       // errClass -> { n, kinds:Map, examples:[] }
let done = 0;
for (const id of ids) {
  let j = null;
  try {
    const out = execFileSync(process.execPath,
      ['scratchpad/diverge-one.mjs', '--id', id, '--max-steps', maxSteps],
      { encoding: 'utf8', cwd: root, timeout: 300000, maxBuffer: 128 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'] });
    j = JSON.parse(out.trim().split('\n').pop());
  } catch (e) {
    try { j = JSON.parse(String(e.stdout || '').trim().split('\n').pop()); } catch { j = null; }
  }
  if (!j || !j.allDead) continue;
  done += 1;
  for (const d of j.allDead) {
    for (const r of (d.rows || [])) {
      if (r.verdict !== 'rejected') continue;      // GUARDs are our own, not the checker's
      const k = errClass(r.reason);
      if (!tally.has(k)) tally.set(k, { n: 0, kinds: new Map(), examples: [] });
      const t = tally.get(k);
      t.n += 1;
      t.kinds.set(r.kind, (t.kinds.get(r.kind) || 0) + 1);
      if (t.examples.length < 6) t.examples.push(`${r.kind}: ${r.head}`);
    }
  }
  fs.appendFileSync(path.resolve(root, outPath), JSON.stringify({ id, verdict: j.verdict, dead: j.deadEnds }) + '\n');
  process.stderr.write(`  [${done}/${ids.length}] ${id} ${j.verdict}\n`);
}

const total = [...tally.values()].reduce((a, t) => a + t.n, 0);
console.log(`\n=== ${done} targets, ${total} REJECTED candidates ===\n`);
for (const [k, t] of [...tally.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 18)) {
  const kinds = [...t.kinds.entries()].sort((a, b) => b[1] - a[1]).map(([x, c]) => `${x}:${c}`).join(' ');
  console.log(`${String(t.n).padStart(5)} (${String(Math.round(100 * t.n / total)).padStart(2)}%)  ${k}`);
  console.log(`         kinds: ${kinds}`);
  for (const e of t.examples.slice(0, 3)) console.log(`         e.g. ${e}`);
}
