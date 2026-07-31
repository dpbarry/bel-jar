import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { maskByName } from '../js/editor-src/prover/prover-corpus-decls.mjs';
const root=process.cwd();
const exe=path.resolve(root,'Beluga-W/_build/default/src/beluga/main.exe');
const code=fs.readFileSync(path.resolve(root,'library/data/examples/equal/alg-equal-ctxrel.bel'),'utf8');
const m=maskByName(code,'exTRelV');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'prm-'));
const pre='mlam #p => fn X => let (X : Crel [l] [h]) = X in\n';
const variants=[
 ['reference arms (reuse l, #p)', pre+'case [l |- #p] of\n| [l, x:term |- x] => ?\n| [l, x:term |- #p[..]] => ?'],
 ['fresh elem var name',          pre+'case [l |- #p] of\n| [l, x1:term |- x1] => ?\n| [l, x1:term |- #p[..]] => ?'],
 ['fresh ctx var in arms',        pre+'case [l |- #p] of\n| [l1, x1:term |- x1] => ?\n| [l1, x1:term |- #p[..]] => ?'],
 ['underscore elem type',         pre+'case [l |- #p] of\n| [l, x1:_ |- x1] => ?\n| [l, x1:_ |- #p[..]] => ?'],
];
for(const [label,body] of variants){
  const src=m.code.replace('?', body.replace(/\$/g,'$$$$'));
  fs.writeFileSync(path.join(tmp,'h.bel'),src);
  let ok=true,o='';
  try{o=execFileSync(exe,['h.bel'],{encoding:'utf8',cwd:tmp,timeout:120000,stdio:['ignore','pipe','pipe']});}
  catch(e){ok=false;o=String(e.stdout||'')+String(e.stderr||'');}
  const err=(o.match(/Error:[\s\S]{0,100}/)||[''])[0].replace(/\s+/g,' ');
  console.log(`${ok?'ACCEPTED':'rejected '} | ${label}${ok?'':'\n             '+err}`);
}
fs.rmSync(tmp,{recursive:true,force:true});
