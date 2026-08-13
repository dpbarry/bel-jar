// probe-mixed-slot.mjs — test the MIXED per-slot underscore spelling for a
// recursive call, inside the ENGINE'S OWN skeleton (mlam M => mlam M' => mlam N
// => fn ms => case ms of …), not a hand-written one.
//
// Hypothesis: the engine emits only two extremes — every argument NAMED, or every
// argument `_`. The author's spelling is MIXED: `_` exactly at the slot whose
// required value is a reconstruction-invented (non-citable) name, names elsewhere.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';

const root = process.cwd();
const exe = path.resolve(root, 'Beluga-W/_build/default/src/beluga/main.exe');
const prog = 'data/examples/poplmark-reloaded/sources.cfg';
const abs = path.join(root, 'library', prog);
const dir = path.dirname(abs);
const code = assembleCfgProgram(fs.readFileSync(abs, 'utf8'), (n) => {
  const p = path.join(dir, n);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}).code;
const decls = enumerateDecls(code);
const d = decls.find((x) => x && x.name === 'mstep_appl');
const declText = String(d.text);
const eq = declText.indexOf('=');
const head = declText.slice(0, eq + 1);
const pragma = (/\/\s*total[^/]*\//.exec(declText) || [''])[0];

// The ENGINE's skeleton, with only the recursive call + closing fill varying.
const skel = (call, close) => `${head}
${pragma}
  mlam M => mlam M' => mlam N => fn ms =>
  case ms of
  | [g |- m-refl] => [g |- m-refl]
  | [g |- m-step X X1] =>
    let [g |- R] = ${call} in
    ${close}
  ;`;

const cases = [
  ['engine all-named           ', "mstep_appl [g |- M] [g |- M'] [g |- N] [g |- X1]", '[g |- m-step (rappl X) R]'],
  ['engine all-underscore      ', "mstep_appl [g |- _] [g |- _] [g |- _] [g |- X1]", '[g |- m-step (rappl X) R]'],
  ['MIXED: _ at slot 1         ', "mstep_appl _ [g |- M'] [g |- N] [g |- X1]", '[g |- m-step (rappl X) R]'],
  ['MIXED: boxed _ at slot 1   ', "mstep_appl [g |- _] [g |- M'] [g |- N] [g |- X1]", '[g |- m-step (rappl X) R]'],
  ['MIXED slot1, close w/o rappl', "mstep_appl _ [g |- M'] [g |- N] [g |- X1]", '[g |- m-step X R]'],
  // Does the underscore rule need to be PRECISE (only re-instantiated slots), or
  // is it enough to underscore every slot the dec sub-derivation touches?
  ['_ at slots 1+2 (both idx)  ', "mstep_appl _ _ [g |- N] [g |- X1]", '[g |- m-step (rappl X) R]'],
  ['boxed _ at slots 1+2       ', "mstep_appl [g |- _] [g |- _] [g |- N] [g |- X1]", '[g |- m-step (rappl X) R]'],
  ['_ at slot 2 only           ', "mstep_appl [g |- M] _ [g |- N] [g |- X1]", '[g |- m-step (rappl X) R]'],
];

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bel-mix-'));
for (const [label, call, close] of cases) {
  const src = code.slice(0, d.start) + skel(call, close) + code.slice(d.end);
  fs.writeFileSync(path.join(tmpDir, 'h.bel'), src);
  let ok = true; let out = '';
  try {
    out = execFileSync(exe, ['h.bel'], { encoding: 'utf8', cwd: tmpDir, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { ok = false; out = `${String(e.stdout || '')}\n${String(e.stderr || '')}`; }
  const clean = out.replace(/?\[[0-9;]*m/g, '');
  const err = ok ? '' : (clean.split('\n').filter((l) => /Error/.test(l))[0] || clean.slice(0, 140));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${call}`);
  if (!ok) console.log(`          ${err.trim().slice(0, 140)}`);
}
fs.rmSync(tmpDir, { recursive: true, force: true });
