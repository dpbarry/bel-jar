// reject-detail.mjs — resolve the generic "Type-checking error" mass.
//
// death-census.mjs collapsed 46% of all rejections into one class because its
// errClass() keeps only the FIRST line of the checker message, and Beluga puts
// the discriminating detail ("expected ... inferred ...", "found ... expecting")
// on the lines AFTER it. This re-runs a sample keeping the whole message, and
// buckets on a signature built from the WHOLE text, so the mass gets a name.
//
//   node scratchpad/reject-detail.mjs --ids <file> [--sample N] [--jobs N]
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
const jobs = Math.max(1, Number(arg('--jobs', '4')) || 4);
const outPath = path.resolve(root, arg('--out', 'scratchpad/reject-detail.jsonl'));

const clean = (s) => String(s || '')
  .replace(/\[[0-9;]*m/g, '')
  .replace(/\[[0-9;]*m/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Bucket on the WHOLE message: pick the most specific known Beluga diagnostic
// shape present anywhere in the text, not just the first line.
function detailClass(raw) {
  const s = clean(raw);
  if (!s) return '(empty)';
  if (/^(guard|pre-filter|backtracked|rejected on a prior visit|vacuous)/i.test(s)) return 'GUARD';
  const pats = [
    [/does not match expected type|expected type .* inferred type|Found:.*Expected:/i, 'TYPE MISMATCH (expected vs inferred)'],
    [/free context variable is illegal/i, 'SCOPE: free context variable'],
    [/free meta-variable is illegal/i, 'SCOPE: free meta-variable'],
    [/free substitution variable is illegal/i, 'SCOPE: free substitution variable'],
    [/is not closed/i, 'SCOPE: expression not closed'],
    [/term-level constant/i, 'UNBOUND: not a term-level constant'],
    [/is unbound/i, 'UNBOUND: identifier'],
    [/[Ii]ll-typed substitution/i, 'TYPE: ill-typed substitution'],
    [/[Ii]ll-typed expression/i, 'TYPE: ill-typed expression'],
    [/type clash/i, 'TYPE: meta-object type clash'],
    [/does not match expected context/i, 'CONTEXT: meta-object context mismatch'],
    [/too (few|many) arguments/i, 'ARITY: wrong argument count'],
    [/[Hh]igher-order meta-variables not/i, 'UNSUPPORTED: higher-order meta-variable'],
    [/provide a type annotation|meta-variables in computation-level/i, 'AMBIGUITY: needs annotation'],
    [/[Ff]ailed to parse|parse (mutual )?recursive/i, 'PARSE: malformed emission'],
    [/coverage|not covered|missing case/i, 'COVERAGE: split incomplete'],
    [/did not certify/i, 'UNCERTIFIED (no message)'],
  ];
  for (const [re, label] of pats) if (re.test(s)) return label;
  const m = /Error:?\s*(.*)$/i.exec(s);
  return 'OTHER: ' + (m ? m[1] : s).slice(0, 70);
}

function runOne(id) {
  return new Promise((resolve) => {
    execFile(process.execPath, ['scratchpad/diverge-one.mjs', '--id', id, '--max-steps', '25'],
      { encoding: 'utf8', cwd: root, timeout: 300000, maxBuffer: 128 * 1024 * 1024 },
      (err, stdout) => {
        let j = null;
        const text = String(stdout || (err && err.stdout) || '').trim();
        try { j = JSON.parse(text.split('\n').pop()); } catch { j = null; }
        resolve(j);
      });
  });
}

const tally = new Map();
let done = 0;
fs.writeFileSync(outPath, '');

async function main() {
  const queue = [...ids];
  await Promise.all(Array.from({ length: jobs }, async () => {
    while (queue.length) {
      const id = queue.shift();
      const j = await runOne(id);
      done += 1;
      process.stderr.write(`  [${done}/${ids.length}] ${id}\n`);
      if (!j || !j.allDead) continue;
      for (const d of j.allDead) {
        for (const r of (d.rows || [])) {
          if (r.verdict !== 'rejected') continue;
          const k = detailClass(r.reason);
          if (!tally.has(k)) tally.set(k, { n: 0, kinds: new Map(), examples: [] });
          const t = tally.get(k);
          t.n += 1;
          t.kinds.set(r.kind, (t.kinds.get(r.kind) || 0) + 1);
          if (t.examples.length < 4) {
            t.examples.push({ kind: r.kind, head: String(r.head || '').slice(0, 120), msg: clean(r.reason).slice(0, 220) });
          }
          fs.appendFileSync(outPath, JSON.stringify({ id, kind: r.kind, cls: k, head: r.head, msg: clean(r.reason).slice(0, 400) }) + '\n');
        }
      }
    }
  }));

  const tot = [...tally.values()].reduce((a, t) => a + t.n, 0);
  console.log(`\n=== ${done} targets · ${tot} rejected candidates, classified on the FULL message ===\n`);
  for (const [k, t] of [...tally.entries()].sort((a, b) => b[1].n - a[1].n)) {
    const kinds = [...t.kinds.entries()].sort((a, b) => b[1] - a[1]).map(([x, c]) => `${x}:${c}`).join(' ');
    console.log(`${String(t.n).padStart(5)} (${String(Math.round(100 * t.n / tot)).padStart(2)}%)  ${k}`);
    console.log(`         kinds: ${kinds}`);
    for (const e of t.examples.slice(0, 2)) {
      console.log(`         e.g. [${e.kind}] ${e.head}`);
      console.log(`              → ${e.msg}`);
    }
  }
}

main();
