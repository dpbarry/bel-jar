// probe-mstep.mjs — decisive spelling experiment for the mstep_* recursion text.
// Rebuild mstep_appl's body with several spellings of the RECURSIVE CALL and ask
// the native checker which ones certify. Distinguishes:
//   (H1) name capture — engine cites signature names (M, M') not the hole's metas
//   (H2) argument spelling — `[g |- _]` vs bare `_` for a Pi-bound arg
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
if (!d) { console.error('mstep_appl not found'); process.exit(2); }
const declText = String(d.text);
console.log('--- ORIGINAL DECL ---\n' + declText + '\n');

const eq = declText.indexOf('=');
const head = declText.slice(0, eq + 1);
// keep the author's / total / pragma, which sits after `=` on its own line
const pragma = /\/\s*total[^/]*\//.exec(declText);

// Each variant supplies only the RECURSIVE CALL text; the surrounding skeleton is
// the author's, so the only thing under test is the call spelling.
const variants = {
  'author (bare _ first arg, meta names)': 'mstep_appl _ [_ |- M\'] [_ |- N] [_ |- MS\']',
  'engine v1 (signature names M, M\')': 'mstep_appl [g |- M] [g |- M\'] [g |- N] [g |- MS\']',
  'engine v2 (all underscores, boxed)': 'mstep_appl [g |- _] [g |- _] [g |- _] [g |- MS\']',
  'boxed underscores, ctx underscore': 'mstep_appl [_ |- _] [_ |- _] [_ |- _] [_ |- MS\']',
  'bare underscores for pi args': 'mstep_appl _ _ _ [_ |- MS\']',
  'hole metas correctly named': 'mstep_appl [_ |- N1] [_ |- M\'] [_ |- N] [_ |- MS\']',
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bel-mstep-'));
for (const [label, call] of Object.entries(variants)) {
  const body = `
    mlam M, M', N => fn ms =>
  case ms of
  | [_ |- m-refl] => [_ |- m-refl]
  | [_ |- m-step S MS'] =>
    let [_ |- MS''] = ${call} in
    [_ |- m-step (rappl S) MS'']
  `;
  const newDecl = `${head}\n${pragma ? pragma[0] : ''}\n${body};`;
  const src = code.slice(0, d.start) + newDecl + code.slice(d.end);
  fs.writeFileSync(path.join(tmpDir, 'h.bel'), src);
  let ok = true; let out = '';
  try {
    out = execFileSync(exe, ['h.bel'], { encoding: 'utf8', cwd: tmpDir, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { ok = false; out = `${String(e.stdout || '')}\n${String(e.stderr || '')}`; }
  const err = ok ? '' : (out.replace(/\[[0-9;]*m/g, '').split('\n').filter((l) => /Error|error/.test(l))[0] || out.slice(0, 120));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        ${call}${ok ? '' : '\n        ' + err.trim().slice(0, 150)}`);
}
fs.rmSync(tmpDir, { recursive: true, force: true });
