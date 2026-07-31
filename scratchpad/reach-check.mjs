// REACH CHECK before building: of the candidates the engine actually submits and the
// checker rejects, how many are COMP-LEVEL APPLICATIONS that a θ-style index check
// could even look at? A judging site is only worth building if its input exists.
import fs from 'node:fs'; import path from 'node:path';
import { spawn } from 'node:child_process';
const root=process.cwd();
const ids=fs.readFileSync('scratchpad/ids-nomove-sample.txt','utf8').split('\n').map(s=>s.trim()).filter(Boolean).slice(0,18);
let rejected=0, closingBoxFill=0, compApp=0, letCall=0, other=0;
for(const id of ids){
  const j=await new Promise((res)=>{
    const p=spawn(process.execPath,['scratchpad/diverge-one.mjs','--id',id,'--max-steps','25'],{cwd:root});
    let b=''; const t=setTimeout(()=>{try{p.kill('SIGKILL');}catch{}},90000);
    p.stdout.on('data',d=>b+=d); p.stderr.on('data',()=>{});
    p.on('close',()=>{clearTimeout(t);const l=b.split('\n').filter(x=>x.trim().startsWith('{')).pop();
      try{res(l?JSON.parse(l):null);}catch{res(null);}});
  });
  if(!j||!j.allDead) continue;
  for(const d of j.allDead){
    for(const r of (d.rows||[])){
      if(r.verdict!=='rejected') continue;
      rejected++;
      const t=String(r.head||'').trim();
      if(/^\[/.test(t) && !/\blet\b|=>/.test(t)) closingBoxFill++;
      else if(/^let\b/.test(t)) letCall++;
      else if(/^[\p{L}_][\p{L}\p{N}_']*\s+\S/u.test(t)) compApp++;
      else other++;
    }
  }
}
console.log('rejected candidates sampled:', rejected);
console.log('  closing BOXED fill  (prefilter rule-2 CAN see):', closingBoxFill);
console.log('  bare COMP application (judgeable at a new site):', compApp);
console.log('  let-bound call        (result not the goal):', letCall);
console.log('  other:', other);
