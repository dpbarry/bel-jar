// diverge-one.mjs — run ONE corpus target through the native oracle with
// collectTrace, and emit a JSON summary of WHERE the search died:
//   - the verdict / steps / checks
//   - every DEAD-END hole (advanced:false), with its depth (branch nesting),
//     the move KINDS offered there, and the verdict/reason of each tried row.
// The no-move question is "which correct move was never proposed?" — this
// answers it at the DEEPEST hole, not the root the search backtracked to.
//
//   node scratchpad/diverge-one.mjs --id "<prog>#<name>" [--max-steps N]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assembleCfgProgram, maskByName } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { proveProgram, theoremUnderProof } from '../js/editor-src/prover/prover-orchestrator.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; }
const id = arg('--id', null);
const maxSteps = Number(arg('--max-steps', '40')) || 40;
const exe = path.resolve(root, 'Beluga-W/_build/default/src/beluga/main.exe');
if (!id) { console.error('need --id'); process.exit(2); }

const [prog, name] = id.split('#');
const abs = path.join(root, 'library', prog);
let code;
if (prog.endsWith('.cfg')) {
  const dir = path.dirname(abs);
  code = assembleCfgProgram(fs.readFileSync(abs, 'utf8'), (n) => {
    const p = path.join(dir, n);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  }).code;
} else code = fs.readFileSync(abs, 'utf8');

const masked = maskByName(code, name);
if (!masked) { console.log(JSON.stringify({ id, error: 'mask-failed' })); process.exit(0); }
const thm = theoremUnderProof(masked.declText);
if (!thm || !thm.compType) { console.log(JSON.stringify({ id, error: 'parse-failed' })); process.exit(0); }

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bel-div-'));
let checks = 0;
const oracle = async (src) => {
  checks += 1;
  fs.writeFileSync(path.join(tmpDir, 'h.bel'), src);
  let out = ''; let ok = true;
  try {
    out = execFileSync(exe, ['h.bel'], { encoding: 'utf8', cwd: tmpDir, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { ok = false; out = `${String(e.stdout || '')}\n${String(e.stderr || '')}`; }
  return { ok, output: out };
};

const t0 = Date.now();
let r;
try {
  r = await proveProgram(masked.code, thm, oracle, {
    certifyTrim: false, maxSteps, collectTrace: true,
  });
} catch (e) {
  console.log(JSON.stringify({ id, error: `throw: ${String(e && e.message).slice(0, 200)}` }));
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(0);
}

// Depth of a trace entry = nesting of its enclosing case branch pattern.
const entries = (r.trace || []).map((t, i) => ({
  i,
  advanced: !!t.advanced,
  goal: String(t.goal || '').slice(0, 120),
  branch: t.branch ? String(t.branch).slice(0, 80) : null,
  armLine: t.focus ? t.focus.armLine : null,
  kinds: [...new Set((t.tried || []).map((x) => x.kind))].sort(),
  nTried: (t.tried || []).length,
  rows: (t.tried || []).map((x) => ({
    kind: x.kind,
    verdict: x.verdict,
    head: String(x.head || '').slice(0, 90),
    reason: String(x.reason || '').replace(/\s+/g, ' ').slice(0, 160),
  })),
}));
const dead = entries.filter((e) => !e.advanced);
// The "deepest" dead end: the one that got the furthest into the proof — use
// the max trace index among dead ends whose armLine is the largest.
let deepest = null;
for (const e of dead) {
  if (!deepest) { deepest = e; continue; }
  if ((e.armLine || 0) > (deepest.armLine || 0)) deepest = e;
}
console.log(JSON.stringify({
  id,
  verdict: r.complete ? 'COMPLETE' : `STUCK:${r.stuck && r.stuck.reason}`,
  steps: r.steps.length,
  checks,
  secs: Number(((Date.now() - t0) / 1000).toFixed(1)),
  holesVisited: entries.length,
  advancedCount: entries.filter((e) => e.advanced).length,
  deadEnds: dead.length,
  deepest,
  allDead: dead.slice(0, 40),
}));
fs.rmSync(tmpDir, { recursive: true, force: true });
