import fs from 'node:fs'; import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';
const root=process.cwd();
const rows=new Map();
for(const l of fs.readFileSync('scratchpad/library.merged.jsonl','utf8').split('\n').filter(Boolean)){try{const r=JSON.parse(l);rows.set(r.id,r);}catch{}}
const sc=new Map();
const prog=(p)=>{if(sc.has(p))return sc.get(p);let c=null;
 try{const a=path.join(root,'library',p);
  if(p.endsWith('.cfg')){const d=path.dirname(a);c=assembleCfgProgram(fs.readFileSync(a,'utf8'),(n)=>{const q=path.join(d,n);return fs.existsSync(q)?fs.readFileSync(q,'utf8'):null;}).code;}
  else c=fs.readFileSync(a,'utf8');}catch{c=null}sc.set(p,c);return c;};
const hits=[];const dev=new Map();
for(const r of rows.values()){
 if(['COMPLETE','PRECHECK_FAIL','FAIL'].includes(r.outcome))continue;
 const [p,n]=r.id.split('#');const code=prog(p);if(!code)continue;
 const ds=enumerateDecls(code);
 const d=ds.find(x=>x&&x.name===n&&/^(rec|proof)\b|\band\s+rec\b/.test(String(x.text||'').trim()))||ds.find(x=>x&&x.name===n);
 if(!d||!d.text)continue;
 const eq=String(d.text).indexOf('=');if(eq<0)continue;
 const header=String(d.text).slice(0,eq);
 // A Pi-bound PARAMETER variable in the signature: `{#p : #[g |- A]}`
 if(!/\{\s*#[\p{L}_][\p{L}\p{N}_']*\s*:/u.test(header))continue;
 hits.push(r.id);
 const k=p.split('/').slice(-2).join('/');dev.set(k,(dev.get(k)||0)+1);
}
console.log('stuck targets with a Pi-bound PARAMETER variable:',hits.length,'\n');
for(const [k,v] of [...dev].sort((a,b)=>b[1]-a[1]).slice(0,14)) console.log(`  ${String(v).padStart(3)}  ${k}`);
fs.writeFileSync('scratchpad/ids-param.txt',hits.sort().join('\n')+'\n');
