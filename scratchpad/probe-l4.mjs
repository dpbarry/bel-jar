import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assembleCfgProgram, maskByName } from '../js/editor-src/prover/prover-corpus-decls.mjs';
const root=process.cwd();
const cfg=path.resolve(root,'library/data/examples/poplmark-reloaded+/sources.cfg');
const dir=path.dirname(cfg);
const code=assembleCfgProgram(fs.readFileSync(cfg,'utf8'),(n)=>{const p=path.join(dir,n);return fs.existsSync(p)?fs.readFileSync(p,'utf8'):null;}).code;
const m=maskByName(code,'inl_sn');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'l4-'));
const pre=`mlam M => mlam B => fn X => case X of
  | Acc [h] [ |- X1] [_ |- X2] X3 =>
    Acc [_] [ |- _] [_ |- inl B[] X2] (mlam X4, X5 => (case [h |- X5] of
  | [h |- rinl X21] =>
    `;
const variants=[
 ['let HO-app, then recurse on R', pre+`let R = X3 [_ |- _] [_ |- X21] in inl_sn [_ |- _] [ |- _] R))`],
 ['direct nested (reference form)', pre+`inl_sn [_ |- _] [ |- _] (X3 [_ |- _] [_ |- X21])))`],
 ['let HO-app, then hole',         pre+`let R = X3 [_ |- _] [_ |- X21] in ?))`],
 ['let HO-app all underscore args',pre+`let R = X3 [_ |- _] [_ |- _] in ?))`],
];
for(const [label,body] of variants){
  const src=m.code.replace('?', body.replace(/\$/g,'$$$$'));
  fs.writeFileSync(path.join(tmp,'h.bel'),src);
  let ok=true,o='';
  try{o=execFileSync(path.resolve(root,'Beluga-W/_build/default/src/beluga/main.exe'),['h.bel'],{encoding:'utf8',cwd:tmp,timeout:120000,stdio:['ignore','pipe','pipe']});}
  catch(e){ok=false;o=String(e.stdout||'')+String(e.stderr||'');}
  const err=(o.match(/Error:[\s\S]{0,110}/)||[''])[0].replace(/\s+/g,' ');
  console.log(`${ok?'ACCEPTED':'rejected '} | ${label}${ok?'':'\n             '+err}`);
}
fs.rmSync(tmp,{recursive:true,force:true});
