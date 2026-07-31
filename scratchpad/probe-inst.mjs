import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root=process.cwd();
const src=fs.readFileSync('scratchpad/d2/029.bel','utf8');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'inst-'));
const body=(acc)=>`mlam M => mlam B => fn X => case X of
  | Acc [h] [ |- X1] [_ |- X2] X3 =>
    ${acc} (mlam M2, S => (case [h |- S] of
  | [h |- rinl X21] => ?))`;
const variants=[
 ['goal-instantiated M', 'Acc [_] [ |- _] [_ |- inl B[] X2]'],
 ['ctx + M instantiated', 'Acc [h] [ |- _] [h |- inl B[] X2]'],
 ['ctx + A + M',          'Acc [h] [ |- sum X1[] B[]] [h |- inl B[] X2]'],
 ['all underscores (current)', 'Acc [_] [ |- _] [_ |- _]'],
];
for(const [label,acc] of variants){
  const out=src.replace(/mlam M => mlam B => fn X => case X of[\s\S]*?\n;/, body(acc)+'\n;');
  fs.writeFileSync(path.join(tmp,'h.bel'),out);
  let ok=true,o='';
  try{o=execFileSync(path.resolve(root,'Beluga-W/_build/default/src/beluga/main.exe'),['h.bel'],{encoding:'utf8',cwd:tmp,timeout:120000,stdio:['ignore','pipe','pipe']});}
  catch(e){ok=false;o=String(e.stdout||'')+String(e.stderr||'');}
  const err=(o.match(/Error:[\s\S]{0,110}/)||[''])[0].replace(/\s+/g,' ');
  console.log(`${ok?'ACCEPTED':'rejected '} | ${label}${ok?'':'\n             '+err}`);
}
fs.rmSync(tmp,{recursive:true,force:true});
