import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assembleCfgProgram, maskByName } from '../js/editor-src/prover/prover-corpus-decls.mjs';
const root=process.cwd();
const cfg=path.resolve(root,'library/data/examples/poplmark-reloaded+/sources.cfg');
const dir=path.dirname(cfg);
const code=assembleCfgProgram(fs.readFileSync(cfg,'utf8'),(n)=>{const p=path.join(dir,n);return fs.existsSync(p)?fs.readFileSync(p,'utf8'):null;}).code;
const m=maskByName(code,'app_snb');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'asb-'));
const pre=`mlam M => mlam N => fn X => case X of
  | Acc [h] [ |- X1] [_ |- X2] X3 =>
    `;
const variants=[
 ['ctor arg, all _ elsewhere', pre+`Acc [_] [ |- _] [_ |- _] (mlam X4, X5 => app_snb [_ |- _] [_ |- _] (X3 [_ |- _] [_ |- rappr X5]))`],
 ['ctor arg, goal-inst Acc',   pre+`Acc [_] [ |- _] [_ |- N] (mlam X4, X5 => app_snb [_ |- _] [_ |- _] (X3 [_ |- _] [_ |- rappr X5]))`],
 ['reference-ish spelling',    pre+`Acc [_] [_ |- _] [_ |- _] (mlam X4, X5 => app_snb [_ |- M] [_ |- X4] (X3 [_ |- app M X4] [_ |- rappr X5]))`],
 ['bare meta, no ctor',        pre+`Acc [_] [ |- _] [_ |- _] (mlam X4, X5 => app_snb [_ |- _] [_ |- _] (X3 [_ |- _] [_ |- X5]))`],
];
for(const [label,body] of variants){
  const src=m.code.replace('?', body.replace(/\$/g,'$$$$'));
  fs.writeFileSync(path.join(tmp,'h.bel'),src);
  let ok=true,o='';
  try{o=execFileSync(path.resolve(root,'Beluga-W/_build/default/src/beluga/main.exe'),['h.bel'],{encoding:'utf8',cwd:tmp,timeout:120000,stdio:['ignore','pipe','pipe']});}
  catch(e){ok=false;o=String(e.stdout||'')+String(e.stderr||'');}
  const err=(o.match(/Error:[\s\S]{0,100}/)||[''])[0].replace(/\s+/g,' ');
  console.log(`${ok?'ACCEPTED':'rejected '} | ${label}${ok?'':'\n             '+err}`);
}
fs.rmSync(tmp,{recursive:true,force:true});
