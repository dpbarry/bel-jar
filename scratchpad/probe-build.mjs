import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assembleCfgProgram, maskByName } from '../js/editor-src/prover/prover-corpus-decls.mjs';
const root = process.cwd();
const cfg = path.resolve(root,'library/data/examples/poplmark-reloaded+/sources.cfg');
const dir = path.dirname(cfg);
const code = assembleCfgProgram(fs.readFileSync(cfg,'utf8'),(n)=>{const p=path.join(dir,n);return fs.existsSync(p)?fs.readFileSync(p,'utf8'):null;}).code;
const m = maskByName(code,'inl_sn');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'bld-'));
const inv = 'let Acc [_] [ |- A1] [_ |- M1] r = sn in\n  ';
const variants = [
 ['A: ctor + mlam skeleton, all _ boxes', inv+'Acc [_] [ |- _] [_ |- _] (mlam M2, S => ?)'],
 ['B: same, underscore binders',          inv+'Acc [_] [ |- _] [_ |- _] (mlam _, S => ?)'],
 ['C: no explicit Pi args',               inv+'Acc (mlam M2, S => ?)'],
 ['D: mlam skeleton, hole only',          inv+'Acc [_] [ |- _] [_ |- _] ?'],
 ['E: full reference',                    inv+'Acc [_] [ |- sum A1 B] [_ |- inl _ M1] (mlam _, S =>\n    let [_ |- rinl S\'] = [_ |- S] in\n    inl_sn [_ |- _] [ |- _] (r [_ |- _] [_ |- S\']))'],
 ['F: reference w/ hole in body',         inv+'Acc [_] [ |- sum A1 B] [_ |- inl _ M1] (mlam _, S => ?)'],
 ['G: applied HO hyp inside a hole ctx',  inv+'Acc [_] [ |- _] [_ |- _] (mlam M2, S => let X9 = r [_ |- _] [_ |- _] in ?)'],
];
for (const [label, body] of variants) {
  const src = m.code.replace('?', ('mlam M, B => fn sn =>\n  '+body).replace(/\$/g,'$$$$'));
  fs.writeFileSync(path.join(tmp,'h.bel'), src);
  let ok=true,out='';
  try{ out=execFileSync(path.resolve(root,'Beluga-W/_build/default/src/beluga/main.exe'),['h.bel'],{encoding:'utf8',cwd:tmp,timeout:120000,stdio:['ignore','pipe','pipe']}); }
  catch(e){ ok=false; out=String(e.stdout||'')+String(e.stderr||''); }
  const err=(out.match(/Error:[\s\S]{0,120}/)||[''])[0].replace(/\s+/g,' ');
  console.log(`${ok?'ACCEPTED':'rejected '} | ${label}${ok?'':'\n            '+err}`);
}
fs.rmSync(tmp,{recursive:true,force:true});
