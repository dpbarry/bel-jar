// prover-native-oracle.mjs — drive the FULL proveProgram loop in node with the
// NATIVE Beluga checker (Beluga-W/_build/default/src/beluga/main.exe) as the
// oracle. No browser, step-faithful to the in-page engine (branch pruning
// included — firstErrorLoc understands the native CLI's excerpt format).
//
// The fastest way to reproduce/debug an engine miss on any corpus target:
//
//   node scripts/prover-native-oracle.mjs --cfg <sources.cfg> --name <rec>
//   node scripts/prover-native-oracle.mjs --file <one.bel>     --name <rec>
//   … [--max-steps N] [--trace] [--dump-candidates <dir>]
//
// Masks the named decl in place (shared maskByName — pragmas preserved), checks
// with main.exe per candidate, prints steps as they land, and on STUCK dumps
// the final hole state + tried list (--trace).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assembleCfgProgram, maskByName } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { proveProgram, theoremUnderProof } from '../js/editor-src/prover/prover-orchestrator.mjs';

// Slice toggles, read from the environment so the DIFFERENTIAL (which spawns this
// script per target) can measure an opt-in mechanism without a code edit.
if (process.env.INLINEARG) globalThis.__proverInlineArg = true;
if (process.env.UNIFY) globalThis.__proverUnify = true;
if (process.env.INHABIT) { globalThis.__proverInhabit = true; globalThis.__proverUnify = true; } // step 3 (needs step 2)

const root = process.cwd();
const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; }

const cfgRel = arg('--cfg', null);
const fileRel = arg('--file', null);
const name = arg('--name', null);
const maxSteps = Number(arg('--max-steps', '60')) || 60;
const wantTrace = args.includes('--trace');
const dumpDir = arg('--dump-candidates', null);
const exe = path.resolve(root, 'Beluga-W/_build/default/src/beluga/main.exe');

if ((!cfgRel && !fileRel) || !name) {
  console.error('usage: node scripts/prover-native-oracle.mjs (--cfg <sources.cfg> | --file <x.bel>) --name <rec> [--max-steps N] [--trace] [--dump-candidates <dir>]');
  process.exit(2);
}

let code;
if (cfgRel) {
  const cfgAbs = path.resolve(root, cfgRel);
  const dir = path.dirname(cfgAbs);
  code = assembleCfgProgram(fs.readFileSync(cfgAbs, 'utf8'), (n) => {
    const p = path.join(dir, n);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  }).code;
} else {
  code = fs.readFileSync(path.resolve(root, fileRel), 'utf8');
}

const masked = maskByName(code, name);
if (!masked) { console.error(`could not mask ${name}`); process.exit(1); }
const thm = theoremUnderProof(masked.declText);
if (!thm || !thm.compType) { console.error(`could not parse theorem ${name}`); process.exit(1); }

// The native CLI line-wraps long paths (breaking parseHoles' single-line File
// header) — always check via a SHORT relative filename in a temp cwd.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bel-oracle-'));
if (dumpDir) fs.mkdirSync(path.resolve(root, dumpDir), { recursive: true });
let checks = 0;
const oracle = async (src) => {
  checks += 1;
  if (dumpDir) fs.writeFileSync(path.resolve(root, dumpDir, `${String(checks).padStart(3, '0')}.bel`), src);
  fs.writeFileSync(path.join(tmpDir, 'h.bel'), src);
  let out = '';
  let ok = true;
  try {
    out = execFileSync(exe, ['h.bel'], { encoding: 'utf8', cwd: tmpDir, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    ok = false;
    out = `${String(e.stdout || '')}\n${String(e.stderr || '')}`;
  }
  return { ok, output: out };
};

const t0 = Date.now();
const r = await proveProgram(masked.code, thm, oracle, {
  // E.9 certify-trim is a browser cost transform (bytes dominate wasm checks);
  // native main.exe cost is per-CALL, which the trim's fail-open re-runs would
  // inflate. Verdicts/steps are identical either way — only checkCount differs.
  certifyTrim: false,
  maxSteps,
  // This tool masks the target body, so a COMPLETE with zero accepted moves means
  // the mask did not take — report it as `mask-ineffective`, never as a proof
  // (master plan 52b). Verified safe for the gate: the frozen `library.jsonl`
  // baseline contains 0 zero-move completions, so no existing differential moves.
  requireProgress: true,
  collectTrace: wantTrace,
  onStep: ({ last }) => console.log(`STEP ${last.move}: ${(last.text || '').replace(/\n/g, ' ').slice(0, 100)}`),
});
console.log(`\nresult: ${r.complete ? 'COMPLETE' : `STUCK ${r.stuck && r.stuck.reason}`}`
  + ` | steps ${r.steps.length} | checks ${checks} | ${((Date.now() - t0) / 1000).toFixed(1)}s`
  + (r.synthesizedMeasure ? ` | synthesized ${r.synthesizedMeasure}` : ''));
if (r.complete) {
  const i = r.code.indexOf(`rec ${name}`);
  console.log(`\n${r.code.slice(Math.max(0, i), i + 600)}`);
} else if (r.stuck) {
  if (r.stuck.measuresTried) console.log('measures tried:', r.stuck.measuresTried.join(', '));
  if (wantTrace && r.trace && r.trace.length) {
    const last = r.trace[r.trace.length - 1];
    console.log('STUCK GOAL:', (last.goal || '').slice(0, 160));
    console.log('ctx:', (last.holeCtx || []).map((c) => `${c.name}:${String(c.type).slice(0, 60)}`).join(' ; ').slice(0, 600));
    console.log('meta:', (last.holeMeta || []).map((c) => `${c.name}:${String(c.type).slice(0, 60)}`).join(' ; ').slice(0, 600));
    for (const t of (last.tried || []).slice(0, 20)) {
      console.log(`  ${t.verdict} | ${t.kind} | ${(t.head || '').slice(0, 60)} | ${(t.reason || '').replace(/\n/g, ' ').slice(0, 90)}`);
    }
  }
}
fs.rmSync(tmpDir, { recursive: true, force: true });
