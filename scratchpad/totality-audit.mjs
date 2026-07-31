// MODEL-FIDELITY AUDIT: does `parseTotality` read every corpus pragma correctly?
// Wave 5 found `/ total (f) /` and `/ total (f x) /` mis-parsed (64 decls, +3 targets).
// Same instrument, whole corpus, text only: for every decl carrying a pragma, compare
// what the parser produced against the pragma's own text and flag anomalies.
import fs from 'node:fs'; import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { parseTotality } from '../js/editor-src/prover/prover-comp-type.mjs';
const root=process.cwd();
const progs=new Set();
for(const l of fs.readFileSync('results/corpus/library.native-merged-20260729.jsonl','utf8').split('\n').filter(Boolean)){
  try{progs.add(JSON.parse(l).id.split('#')[0]);}catch{}
}
const load=(p)=>{try{const a=path.join(root,'library',p);
  if(p.endsWith('.cfg')){const d=path.dirname(a);return assembleCfgProgram(fs.readFileSync(a,'utf8'),(n)=>{const q=path.join(d,n);return fs.existsSync(q)?fs.readFileSync(q,'utf8'):null;}).code;}
  return fs.readFileSync(a,'utf8');}catch{return null;}};
const seen=new Set(); const buckets=new Map(); const samples=new Map();
let withPragma=0;
for(const p of progs){
  const code=load(p); if(!code) continue;
  for(const d of enumerateDecls(code)){
    if(!d||!d.text||!d.name) continue;
    const key=p+'#'+d.name; if(seen.has(key)) continue; seen.add(key);
    const txt=String(d.text);
    // the pragma as written, comments stripped only for the LOOKUP of an active one
    const active=txt.replace(/%\{[\s\S]*?\}%/g,' ').replace(/%[^\n]*/g,' ');
    const m=/\/\s*total\b([^/]*)\//.exec(active);
    if(!m) continue;
    withPragma++;
    const body=m[1].trim();
    let t=null; try{ t=parseTotality(txt); }catch(e){ t={__err:String(e.message).slice(0,40)}; }
    let bucket=null;
    if(!t) bucket='PARSED NULL (pragma present)';
    else if(t.__err) bucket='THREW: '+t.__err;
    else if(!body) bucket='ok: bare';
    else if(/^\{/.test(body)) bucket = t.kind ? 'ok: mutual {…} -> '+t.kind : 'MUTUAL {…} -> no kind';
    else if(t.kind==='named' && !t.name) bucket='NAMED but no name';
    else if(t.kind) bucket='ok: '+t.kind;
    else bucket='NO KIND for non-empty pragma';
    buckets.set(bucket,(buckets.get(bucket)||0)+1);
    if(!samples.has(bucket)) samples.set(bucket, key.split('/').pop()+'  «/ total '+body+' /»  -> '+JSON.stringify(t).slice(0,90));
  }
}
console.log('decls carrying an ACTIVE / total / pragma:',withPragma,'\n');
for(const [k,v] of [...buckets].sort((a,b)=>b[1]-a[1])){
  console.log(`  ${String(v).padStart(4)}  ${k}`);
  if(!/^ok:/.test(k)) console.log(`        e.g. ${samples.get(k)}`);
}
