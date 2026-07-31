// Which stuck targets have a goal family whose constructor takes a HIGHER-ORDER
// argument — i.e. the shape rule (3b) can construct at all?
import fs from 'node:fs'; import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { theoremUnderProof } from '../js/editor-src/prover/prover-orchestrator.mjs';
import { enumerateConstructorsTyped, isCTypeFamily } from '../js/editor-src/prover/hole-split.mjs';
import { headOfConclusion } from '../js/editor-src/prover/hole-split.mjs';
const root = process.cwd();
const led = path.join('results','corpus','library.jsonl');
const rows=new Map();
for(const l of fs.readFileSync(path.resolve(root,led),'utf8').split('\n').filter(Boolean)){try{const r=JSON.parse(l);rows.set(r.id,r);}catch{}}
const sc=new Map();
const prog=(p)=>{if(sc.has(p))return sc.get(p);let c=null;try{const a=path.join(root,'library',p);
 if(p.endsWith('.cfg')){const d=path.dirname(a);c=assembleCfgProgram(fs.readFileSync(a,'utf8'),(n)=>{const q=path.join(d,n);return fs.existsSync(q)?fs.readFileSync(q,'utf8'):null;}).code;}
 else c=fs.readFileSync(a,'utf8');}catch{c=null}sc.set(p,c);return c;};
const hoCount=(raw)=>{let s=String(raw).trim();if(s[0]!=='(')return 0;let d=0,end=-1;
 for(let i=0;i<s.length;i++){if(s[i]==='(')d++;else if(s[i]===')'){d--;if(d===0){end=i;break;}}}
 if(end!==s.length-1)return 0;s=s.slice(1,end).trim();let n=0;
 while(/^\{/.test(s)){let bd=0,j=0;for(;j<s.length;j++){if(s[j]==='{')bd++;else if(s[j]==='}'){bd--;if(bd===0)break;}}if(j>=s.length)return 0;n++;s=s.slice(j+1).trim();}
 return n;};
const hits=[];const dev=new Map();
for(const r of rows.values()){
 if(['COMPLETE','PRECHECK_FAIL','FAIL'].includes(r.outcome))continue;
 const [p,n]=r.id.split('#');const code=prog(p);if(!code)continue;
 const ds=enumerateDecls(code);
 const d=ds.find(x=>x&&x.name===n&&/^(rec|proof)\b|\band\s+rec\b/.test(String(x.text||'').trim()))||ds.find(x=>x&&x.name===n);
 if(!d||!d.text)continue;let thm=null;try{thm=theoremUnderProof(d.text);}catch{}
 if(!thm||!thm.compType)continue;
 const concl=String(thm.compType.conclusion||'').trim();
 if(concl[0]==='[')continue; // boxed conclusion — not a ctype goal
 const head=headOfConclusion(concl);
 if(!head||!isCTypeFamily(code,head))continue;
 let ho=false;
 for(const c of enumerateConstructorsTyped(code,head)) for(const at of (c.argTypes||[])) if(hoCount(at)>0) ho=true;
 if(!ho)continue;
 hits.push(r.id);
 const k=p.split('/').slice(-2).join('/');dev.set(k,(dev.get(k)||0)+1);
}
console.log('stuck targets whose CTYPE goal family has a higher-order constructor argument:',hits.length,'\n');
for(const [k,v] of [...dev].sort((a,b)=>b[1]-a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
fs.writeFileSync('scratchpad/ids-ho.txt',hits.sort().join('\n')+'\n');
