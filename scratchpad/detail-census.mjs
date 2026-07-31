// Sub-classify the GENERIC `Type-checking error.` row: dump every candidate the
// engine submits for a few no-move targets, re-run the checker on each, and bucket
// the DETAIL lines (Beluga prints "Expected: … Inferred: …" under the headline).
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const root=process.cwd();
const exe=path.resolve(root,'Beluga-W/_build/default/src/beluga/main.exe');
const targets=process.argv.slice(2);
const buckets=new Map(); const samples=new Map();
for(const spec of targets){
  const [prog,name]=spec.split('#');
  const dir='scratchpad/dc_'+name.replace(/[^\w]/g,'');
  fs.rmSync(path.resolve(root,dir),{recursive:true,force:true});
  const flag = prog.endsWith('.cfg') ? '--cfg' : '--file';
  spawnSync(process.execPath,['scripts/prover-native-oracle.mjs',flag,'library/'+prog,'--name',name,'--max-steps','25','--dump-candidates',dir],
    {cwd:root,timeout:300000,stdio:'ignore'});
  const d=path.resolve(root,dir);
  if(!fs.existsSync(d)) continue;
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dc-'));
  for(const f of fs.readdirSync(d).filter(x=>x.endsWith('.bel'))){
    const src=fs.readFileSync(path.join(d,f),'utf8');
    fs.writeFileSync(path.join(tmp,'h.bel'),src);
    let out='';
    try{ execFileSync(exe,['h.bel'],{encoding:'utf8',cwd:tmp,timeout:60000,stdio:['ignore','pipe','pipe']}); continue; }
    catch(e){ out=String(e.stdout||'')+String(e.stderr||''); }
    const clean=out.replace(/\x1b\[[0-9;]*m/g,'').replace(/\[[0-9;]*m/g,'');
    const m=/Error:\s*([\s\S]{0,400})/.exec(clean);
    if(!m) continue;
    const body=m[1].replace(/\s+/g,' ').trim();
    if(!/^Type-checking error\./.test(body)) continue;   // only the generic row
    const detail=body.replace(/^Type-checking error\.\s*/,'').slice(0,90);
    const key=detail.replace(/\b[A-Z][A-Za-z0-9_']*\b/g,'V').replace(/\d+/g,'N').slice(0,72);
    buckets.set(key,(buckets.get(key)||0)+1);
    if(!samples.has(key)) samples.set(key,detail);
  }
  fs.rmSync(tmp,{recursive:true,force:true});
  fs.rmSync(d,{recursive:true,force:true});
}
console.log('GENERIC Type-checking error, sub-classified by DETAIL:\n');
for(const [k,v] of [...buckets].sort((a,b)=>b[1]-a[1]).slice(0,14)){
  console.log(`  ${String(v).padStart(4)}  ${samples.get(k)}`);
}
