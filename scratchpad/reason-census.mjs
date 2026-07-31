// Aggregate, across a sample of no-move targets, the checker's objection at the
// DEEPEST hole the search reached — the "which correct move was never proposed /
// why was the proposed one refused" question at scale, on the CURRENT engine.
import fs from 'node:fs'; import path from 'node:path';
import { spawn } from 'node:child_process';
const root=process.cwd();
const ids=fs.readFileSync('scratchpad/ids-nomove-sample.txt','utf8').split('\n').map(s=>s.trim()).filter(Boolean);
const reasons=new Map(); const kinds=new Map(); const guards=new Map();
let done=0;
for(const id of ids){
  const j=await new Promise((res)=>{
    const p=spawn(process.execPath,['scratchpad/diverge-one.mjs','--id',id,'--max-steps','30'],{cwd:root});
    let b=''; const t=setTimeout(()=>{try{p.kill('SIGKILL');}catch{}},90000);
    p.stdout.on('data',d=>b+=d); p.stderr.on('data',()=>{});
    p.on('close',()=>{clearTimeout(t);const l=b.split('\n').filter(x=>x.trim().startsWith('{')).pop();
      try{res(l?JSON.parse(l):null);}catch{res(null);}});
  });
  done++;
  if(!j||!j.allDead) continue;
  // deepest dead end = the one with the largest armLine
  let d=null; for(const e of j.allDead){ if(!d||(e.armLine||0)>(d.armLine||0)) d=e; }
  if(!d) continue;
  for(const k of (d.kinds||[])) kinds.set(k,(kinds.get(k)||0)+1);
  for(const r of (d.rows||[])){
    if(r.verdict==='rejected'){
      const key=String(r.reason||'').replace(/^\s*Error:\s*/,'').replace(/\s+/g,' ').slice(0,58);
      reasons.set(key,(reasons.get(key)||0)+1);
    } else if(r.verdict==='guard'){
      const key=String(r.reason||'').replace(/\s+/g,' ').slice(0,58);
      guards.set(key,(guards.get(key)||0)+1);
    }
  }
}
console.log('sampled',done,'no-move targets\n');
console.log('REJECT reasons at the deepest hole:');
for(const [k,v] of [...reasons].sort((a,b)=>b[1]-a[1]).slice(0,12)) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log('\nGUARD skips at the deepest hole:');
for(const [k,v] of [...guards].sort((a,b)=>b[1]-a[1]).slice(0,8)) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log('\nmove KINDS present at the deepest hole (targets):');
for(const [k,v] of [...kinds].sort((a,b)=>b[1]-a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
