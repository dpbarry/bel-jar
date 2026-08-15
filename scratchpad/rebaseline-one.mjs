// rebaseline-one.mjs — ONE corpus target, native, lean. Same harness as
// diverge-one but WITHOUT collectTrace (a full trace on an 850-target sweep is
// pure memory cost), plus a wall-clock deadline enforced through the engine's own
// `shouldCancel` so a cap reads as an honest TIMEOUT rather than a killed process.
//
//   node scratchpad/rebaseline-one.mjs --id "<prog>#<name>" [--max-steps 40] [--cap 60]
//
// Emits one JSON line in the corpus-ledger schema (the status field is `outcome`).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assembleCfgProgram, maskByName } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { proveProgram, theoremUnderProof } from '../js/editor-src/prover/prover-orchestrator.mjs';

if (process.env.HOSLOT) globalThis.__proverHoSlot = true;

const root = process.cwd();
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const id = arg('--id', null);
const maxSteps = Number(arg('--max-steps', '40')) || 40;
const capMs = (Number(arg('--cap', '60')) || 60) * 1000;
const exe = path.resolve(root, 'Beluga-W/_build/default/src/beluga/main.exe');
if (!id) { console.error('need --id'); process.exit(2); }

const [prog, name] = id.split('#');
const emit = (o) => console.log(JSON.stringify({ id, name, program: prog, ...o }));

let code;
try {
  const abs = path.join(root, 'library', prog);
  if (prog.endsWith('.cfg')) {
    const dir = path.dirname(abs);
    code = assembleCfgProgram(fs.readFileSync(abs, 'utf8'), (n) => {
      const p = path.join(dir, n);
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    }).code;
  } else code = fs.readFileSync(abs, 'utf8');
} catch (e) { emit({ outcome: 'FAIL', error: 'read: ' + String(e && e.message).slice(0, 120) }); process.exit(0); }

const masked = maskByName(code, name);
if (!masked) { emit({ outcome: 'FAIL', error: 'mask-failed' }); process.exit(0); }
const thm = theoremUnderProof(masked.declText);
if (!thm || !thm.compType) { emit({ outcome: 'FAIL', error: 'parse-failed' }); process.exit(0); }

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bel-rb-'));
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
const deadline = t0 + capMs;
let r;
try {
  r = await proveProgram(masked.code, thm, oracle, {
    certifyTrim: false,
    maxSteps,
    shouldCancel: () => Date.now() > deadline,
  });
} catch (e) {
  emit({ outcome: 'FAIL', error: 'throw: ' + String(e && e.message).slice(0, 160), checks,
    secs: Number(((Date.now() - t0) / 1000).toFixed(1)) });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(0);
}
fs.rmSync(tmpDir, { recursive: true, force: true });

const secs = Number(((Date.now() - t0) / 1000).toFixed(1));
const reason = (r.stuck && (r.stuck.reason || r.stuck.kind)) || null;
// A run that hit the wall-clock deadline reports `cancelled` — that is a TIMEOUT
// in ledger terms, never a verdict about the target.
const outcome = r.complete ? 'COMPLETE' : (reason === 'cancelled' ? 'TIMEOUT' : 'STUCK');
emit({
  outcome,
  reason: outcome === 'TIMEOUT' ? null : reason,
  checks,
  steps: (r.steps || []).length,
  moveKinds: (r.steps || []).map((s) => s.move),
  secs,
  ms: Date.now() - t0,
  capMs,
  maxSteps,
  source: 'native-rebaseline-' + new Date().toISOString().slice(0, 10).replace(/-/g, ''),
});
