// PROVER DIFFERENTIAL — the post-slice falsification instrument (browserless).
//
// Law (memory: feedback-first-contact-postmortem): after ANY engine slice, run
// every COMPLETE of a reference ledger through the step-faithful native oracle
// and report RECOVERED / STILL-LOST / REGRESSED before trusting suite green.
// This is what root-caused P1–P10 in one day; it takes minutes, not hours.
//
//   node scripts/prover-differential.mjs [--ref <ledger.jsonl>] [--against <ledger.jsonl>]
//        [--only <substr>] [--limit N] [--max-steps N]
//
// Modes:
//   --ref only:            re-run the ref ledger's COMPLETEs natively (regression check).
//   --ref + --against:     re-run only the COMPLETEs the `against` ledger LOST vs ref
//                          (the recovery loop used on 2026-07-17).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; }

const refFile = arg('--ref', path.join('results', 'corpus', 'library.20260715.jsonl'));
const againstFile = arg('--against', null);
const only = arg('--only', null);
const limit = Number(arg('--limit', '0')) || 0;
const maxSteps = arg('--max-steps', '60');

function loadLedger(p) {
  const m = new Map();
  for (const l of fs.readFileSync(path.resolve(root, p), 'utf8').split('\n').filter(Boolean)) {
    try { const r = JSON.parse(l); m.set(r.id, r); } catch { /* skip malformed */ }
  }
  return m;
}

const ref = loadLedger(refFile);
const against = againstFile ? loadLedger(againstFile) : null;

let targets = [];
for (const [id, r] of ref) {
  if (r.outcome !== 'COMPLETE') continue;
  if (only && !id.includes(only)) continue;
  if (against) {
    const n = against.get(id);
    if (!n || n.outcome === 'COMPLETE') continue;
    targets.push({ id, was: `${n.outcome}${n.reason ? ':' + n.reason : ''}` });
  } else {
    targets.push({ id, was: 'COMPLETE(ref)' });
  }
}
if (limit) targets = targets.slice(0, limit);
console.log(`${targets.length} target(s) — ref ${refFile}${against ? ` vs ${againstFile}` : ''}`);

let ok = 0;
for (const { id, was } of targets) {
  const [prog, name] = id.split('#');
  const p = `library/${prog}`;
  const cliArgs = prog.endsWith('.cfg') ? ['--cfg', p] : ['--file', p];
  let out = '';
  try {
    out = execFileSync('node', ['scripts/prover-native-oracle.mjs', ...cliArgs, '--name', name, '--max-steps', maxSteps],
      { encoding: 'utf8', timeout: 180000, cwd: root });
  } catch (e) {
    out = `${String(e.stdout || '')}\n${String(e.stderr || e.message)}`;
  }
  const m = /result:\s*([^|\n]+)/.exec(out);
  const verdict = m ? m[1].trim() : 'HARNESS-ERROR';
  const good = /result:\s*COMPLETE/.test(out);
  if (good) ok += 1;
  console.log(`${good ? 'COMPLETE  ' : 'LOST      '} ${id} [${was}] -> ${verdict}`);
}
console.log(`\n${ok}/${targets.length} complete`);
process.exit(ok === targets.length ? 0 : 1);
