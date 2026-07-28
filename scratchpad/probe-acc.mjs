// Checker-arbitrated spelling probe: how must an OBJECT-Pi constructor argument
// be written in a ctype split PATTERN? Splice each variant into inl_sn's hole
// and ask Beluga.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assembleCfgProgram, maskByName } from '../js/editor-src/prover/prover-corpus-decls.mjs';
const root = process.cwd();
const cfg = path.resolve(root, 'library/data/examples/poplmark-reloaded+/sources.cfg');
const dir = path.dirname(cfg);
const code = assembleCfgProgram(fs.readFileSync(cfg,'utf8'), (n)=>{const p=path.join(dir,n);return fs.existsSync(p)?fs.readFileSync(p,'utf8'):null;}).code;
const m = maskByName(code, 'inl_sn');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'acc-'));
const variants = [
  ['reference first move (let)',      'mlam M, B => fn sn =>\n  let Acc [_] [ |- A1] [_ |- M1] r = sn in ?'],
  ['one-arm case, ctx-box + boxes',   'mlam M, B => fn sn =>\n  case sn of\n  | Acc [_] [ |- A1] [_ |- M1] R => ?'],
  ['one-arm case, all bare',          'mlam M, B => fn sn =>\n  case sn of\n  | Acc G A1 M1 R => ?'],
  ['one-arm case, declared ctx var',  'mlam M, B => fn sn =>\n  case sn of\n  | Acc [_] [ |- A1] [Γ |- M1] R => ?'],
  ['one-arm case, underscore boxes',  'mlam M, B => fn sn =>\n  case sn of\n  | Acc [_] [ |- _] [_ |- _] R => ?'],
];
for (const [label, body] of variants) {
  const src = m.code.replace('?', body.replace(/\$/g,'$$$$'));
  fs.writeFileSync(path.join(tmp,'h.bel'), src);
  let ok = true, out = '';
  try { out = execFileSync(path.resolve(root,'Beluga-W/_build/default/src/beluga/main.exe'), ['h.bel'], {encoding:'utf8', cwd:tmp, timeout:120000, stdio:['ignore','pipe','pipe']}); }
  catch(e){ ok=false; out = String(e.stdout||'')+String(e.stderr||''); }
  const err = (out.match(/Error:[\s\S]{0,140}/)||[''])[0].replace(/\s+/g,' ');
  console.log(`${ok?'ACCEPTED':'rejected'} | ${label}\n           ${ok?'':err}`);
}
fs.rmSync(tmp,{recursive:true,force:true});
