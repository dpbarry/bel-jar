// Is the MISSING higher-order constructor needed as a case PATTERN (produced by
// SPLIT) or as a TERM (produced by FILL)? The fix lives in a different generator
// for each, so this decides the slice. Text-only.
import fs from 'node:fs'; import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { enumerateConstructorsTyped, constructorArgDescriptor } from '../js/editor-src/prover/hole-split.mjs';
const root=process.cwd();
const L=fs.readFileSync('scratchpad/ctor-reach.jsonl','utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const sc=new Map();
function programOf(p){if(sc.has(p))return sc.get(p);let c=null;try{const a=path.join(root,'library',p);
if(p.endsWith('.cfg')){const d=path.dirname(a);c=assembleCfgProgram(fs.readFileSync(a,'utf8'),n=>{const q=path.join(d,n);return fs.existsSync(q)?fs.readFileSync(q,'utf8'):null;}).code;}
else c=fs.readFileSync(a,'utf8');}catch{c=null;}sc.set(p,c);return c;}
function bodyOf(p,n){const c=programOf(p);if(!c)return null;const ds=enumerateDecls(c);
const d=ds.find(x=>x&&x.name===n&&/^(rec|proof)\b|\band\s+rec\b/.test(String(x.text||'').trim()));
const t=d?d.text:(ds.find(x=>x&&x.name===n)||{}).text;if(!t)return null;const e=t.indexOf('=');return e<0?null:t.slice(e+1);}
const isHO=(ct)=>{try{return (ct.argTypes||[]).some(at=>{const d=constructorArgDescriptor(at,[]);
return !!(d&&(d.higherOrder||(d.binderCtx&&d.binderCtx.length)));});}catch{return false;}};

// Split the body into (pattern text, term text). Patterns: after `|` up to `=>`,
// and between `let` and `=`. Everything else is term position.
function regions(body){
  const pat=[],term=[];
  for(const line of String(body).split('\n')){
    let rest=line;
    const arm=/^\s*\|([^]*?)=>([^]*)$/.exec(rest);
    if(arm){pat.push(arm[1]);term.push(arm[2]);continue;}
    const lt=/\blet\b([^]*?)=(?!=)([^]*)$/.exec(rest);
    if(lt){pat.push(lt[1]);term.push(lt[2]);continue;}
    const c=/\bcase\b([^]*?)\bof\b/.exec(rest);
    if(c){term.push(c[1]);continue;}      // the scrutinee is a term
    term.push(rest);
  }
  return {pat:pat.join('\n'),term:term.join('\n')};
}
const has=(txt,n)=>new RegExp('(^|[^A-Za-z0-9_\'-])'+n.replace(/[.*+?^${}()|[\]\-]/g,'\$&')+'([^A-Za-z0-9_\'-]|$)').test(txt);

let pOnly=0,tOnly=0,both=0,neither=0; const ex=[];
for(const r of L){
  if(!r.missing.length) continue;
  const [prog,nm]=r.id.split('#'); const code=programOf(prog); const body=bodyOf(prog,nm);
  if(!code||body==null) continue;
  let cs=[]; try{cs=enumerateConstructorsTyped(code,r.fam);}catch{continue;}
  const by=new Map(cs.map(c=>[c.name,c]));
  const {pat,term}=regions(body);
  for(const n of r.missing){
    const c=by.get(n); if(!c||!isHO(c)) continue;      // the HO class only
    const ip=has(pat,n), it=has(term,n);
    if(ip&&it)both++; else if(ip)pOnly++; else if(it)tOnly++; else neither++;
    if(ex.length<14)ex.push(`  ${nm.padEnd(16)} ${n.padEnd(12)} ${ip?'PATTERN':'       '} ${it?'TERM':''}`);
  }
}
const tot=pOnly+tOnly+both+neither; const p=(a)=>tot?(100*a/tot).toFixed(1)+'%':'—';
console.log('WHERE IS THE MISSING HIGHER-ORDER CONSTRUCTOR NEEDED? (',tot,'occurrences )');
console.log('  PATTERN only  -> the fix is in SPLIT generation :',pOnly,p(pOnly));
console.log('  TERM only     -> the fix is in FILL generation  :',tOnly,p(tOnly));
console.log('  BOTH                                            :',both,p(both));
console.log('  neither (parse miss)                            :',neither,p(neither));
console.log(); ex.forEach(s=>console.log(s));
