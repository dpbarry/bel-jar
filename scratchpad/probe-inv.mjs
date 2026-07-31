import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { maskByName } from '../js/editor-src/prover/prover-corpus-decls.mjs';
const root=process.cwd();
const exe=path.resolve(root,'Beluga-W/_build/default/src/beluga/main.exe');
const code=fs.readFileSync(path.resolve(root,'library/data/examples/equal/alg-equal-datatypes.bel'),'utf8');
const m=maskByName(code,'trans');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'inv-'));
const variants=[
 ['one-arm invert in Ae_v arm',
  'fn X => fn X1 => case X of\n| Ae_v => (case X1 of | Ae_v => ?)\n| Ae_a X2 X3 => ?\n| Ae_l X4 => ?'],
 ['one-arm invert in Ae_a arm',
  'fn X => fn X1 => case X of\n| Ae_v => ?\n| Ae_a X2 X3 => (case X1 of | Ae_a X4 X5 => ?)\n| Ae_l X4 => ?'],
 ['full reference',
  'fn X => fn X1 => case X of\n| Ae_v => (case X1 of | Ae_v => Ae_v)\n| Ae_a X2 X3 => (case X1 of | Ae_a X4 X5 => Ae_a (trans X2 X4) (trans X3 X5))\n| Ae_l X6 => (case X1 of | Ae_l X7 => Ae_l (trans X6 X7))'],
];
for(const [label,body] of variants){
  fs.writeFileSync(path.join(tmp,'h.bel'), m.code.replace('?', body.replace(/\$/g,'$$$$')));
  let ok=true,o='';
  try{o=execFileSync(exe,['h.bel'],{encoding:'utf8',cwd:tmp,timeout:120000,stdio:['ignore','pipe','pipe']});}
  catch(e){ok=false;o=String(e.stdout||'')+String(e.stderr||'');}
  const err=(o.replace(/\x1b\[[0-9;]*m/g,'').replace(/\[[0-9;]*m/g,'').match(/Error:[\s\S]{0,150}/)||[''])[0].replace(/\s+/g,' ');
  console.log(`${ok?'ACCEPTED':'rejected '} | ${label}${ok?'':'\n             '+err}`);
}
fs.rmSync(tmp,{recursive:true,force:true});
