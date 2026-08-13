// lfconst-classify.mjs — WHAT is actually in the "Expected an LF term-level
// constant" class? It is 41% of rejected candidates, but excluding the context
// variable AND comp-context hypotheses from the fill pool recovered only 4.1% of
// checks (master plan entry 45). So most of that class is something else.
//
// For every rejected candidate carrying that error, this classifies the OFFENDING
// TOKENS of the emitted term against the hole's own binders:
//   ctxvar   — a schema-typed meta (`g : cxt`)
//   compvar  — a hole.ctx (computation-context) name
//   meta     — a hole.meta name (should be LF-valid!)
//   ctor     — a declared constructor
//   unknown  — none of the above (invented//stale name)
//
//   node scratchpad/lfconst-classify.mjs --ids <file> [--sample N]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
let ids = fs.readFileSync(path.resolve(root, arg('--ids', 'scratchpad/census-sample.txt')), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean);
const sample = Number(arg('--sample', '0')) || 0;
if (sample && sample < ids.length) {
  const stride = ids.length / sample;
  ids = Array.from({ length: sample }, (_, i) => ids[Math.floor(i * stride)]);
}
const maxSteps = arg('--max-steps', '25');

const clean = (s) => String(s || '').replace(/?\[[0-9;]*m/g, '');
const isLfConst = (r) => /term-level constant/i.test(clean(r));

// tokens of the emitted term, ignoring the box context part
function termTokens(head) {
  const t = clean(head);
  const m = /\[([^\[\]]*?)(?:\|-|⊢)([^\[\]]*)\]/u.exec(t);
  const body = m ? m[2] : t;
  return [...body.matchAll(/[#$]?[\p{L}_][\p{L}\p{N}_']*/gu)].map((x) => x[0]);
}

const tally = new Map();
const examples = new Map();
let n = 0; let rows = 0;
for (const id of ids) {
  let j = null;
  try {
    const out = execFileSync(process.execPath,
      ['scratchpad/diverge-one.mjs', '--id', id, '--max-steps', maxSteps],
      { encoding: 'utf8', cwd: root, timeout: 400000, maxBuffer: 128 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'] });
    j = JSON.parse(out.trim().split('\n').pop());
  } catch (e) { try { j = JSON.parse(String(e.stdout || '').trim().split('\n').pop()); } catch { j = null; } }
  if (!j || !j.allDead) continue;
  n += 1;
  for (const d of j.allDead) {
    const metaNames = new Set((d.meta || []).map((s) => String(s).split(':')[0].trim()));
    const ctxNames = new Set((d.hctx || []).map((s) => String(s).split(':')[0].trim()));
    // a schema-typed meta: `g:cxt` where the type has no turnstile/bracket
    const schemaMetas = new Set((d.meta || [])
      .filter((s) => { const t = String(s).split(':').slice(1).join(':').trim(); return t && !/[[\](|⊢]/u.test(t); })
      .map((s) => String(s).split(':')[0].trim()));
    for (const r of (d.rows || [])) {
      if (r.verdict !== 'rejected' || !isLfConst(r.reason)) continue;
      rows += 1;
      const toks = termTokens(r.head);
      const kinds = new Set();
      for (const tk of toks.slice(1)) {           // slice(1): skip the applied head
        if (schemaMetas.has(tk)) kinds.add('ctxvar');
        else if (ctxNames.has(tk)) kinds.add('compvar');
        else if (metaNames.has(tk)) kinds.add('meta');
      }
      if (schemaMetas.has(toks[0])) kinds.add('HEAD-is-ctxvar');
      if (ctxNames.has(toks[0])) kinds.add('HEAD-is-compvar');
      if (metaNames.has(toks[0])) kinds.add('HEAD-is-meta');
      const key = [...kinds].sort().join('+') || '(none of the above)';
      tally.set(key, (tally.get(key) || 0) + 1);
      if (!examples.has(key)) examples.set(key, []);
      if (examples.get(key).length < 4) examples.get(key).push(`${r.kind}: ${clean(r.head)}`);
    }
  }
  process.stderr.write(`  [${n}/${ids.length}] ${id}\n`);
}
console.log(`\n=== ${n} targets, ${rows} "term-level constant" rejections ===\n`);
for (const [k, c] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(c).padStart(5)} (${String(Math.round(100 * c / rows)).padStart(2)}%)  ${k}`);
  for (const e of (examples.get(k) || [])) console.log(`         ${e}`);
}
