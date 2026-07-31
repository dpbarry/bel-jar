import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { maskByName } from '../js/editor-src/prover/prover-corpus-decls.mjs';
const root=process.cwd();
const exe=path.resolve(root,'Beluga-W/_build/default/src/beluga/main.exe');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'asc-'));
const cases=[
 ['equal/alg-equal-ctxrel.bel','exTRelV',
   ['no ascription (engine today)','mlam #p => fn cr => case [l |- #p] of\n| [l, x:term |- x] => ?\n| [l, x:term |- #p[..]] => ?'],
   ['ascription then hole','mlam #p => fn cr => let (cr : Crel [l] [h]) = cr in ?'],
   ['ascription then split','mlam #p => fn cr => let (cr : Crel [l] [h]) = cr in case [l |- #p] of\n| [l, x:term |- x] => ?\n| [l, x:term |- #p[..]] => ?']],
];
for (const [file,name,...variants] of cases){
  const code=fs.readFileSync(path.resolve(root,'library/data/examples/'+file),'utf8');
  const m=maskByName(code,name);
  if(!m){console.log('mask failed',name);continue;}
  console.log('###',file+'#'+name);
  for(const [label,body] of variants){
    const src=m.code.replace('?', body.replace(/\$/g,'$$$$'));
    fs.writeFileSync(path.join(tmp,'h.bel'),src);
    let ok=true,o='';
    try{o=execFileSync(exe,['h.bel'],{encoding:'utf8',cwd:tmp,timeout:120000,stdio:['ignore','pipe','pipe']});}
    catch(e){ok=false;o=String(e.stdout||'')+String(e.stderr||'');}
    const err=(o.match(/Error:[\s\S]{0,110}/)||[''])[0].replace(/\s+/g,' ');
    console.log(`  ${ok?'ACCEPTED':'rejected '} | ${label}${ok?'':'\n               '+err}`);
  }
}
fs.rmSync(tmp,{recursive:true,force:true});
