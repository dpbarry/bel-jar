// THE MECHANISM'S OWN PREDICATE: at the deepest dead end, a constructor of the
// goal's family that (a) the reference proof uses, (b) the engine never proposed,
// and (c) has a HIGHER-ORDER argument slot. Distinct TARGETS, not holes.
import fs from 'node:fs'; import path from 'node:path';
import { assembleCfgProgram } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { enumerateConstructorsTyped, constructorArgDescriptor } from '../js/editor-src/prover/hole-split.mjs';
const root=process.cwd();
const L=fs.readFileSync('scratchpad/ctor-reach.jsonl','utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const sc=new Map();
function programOf(p){if(sc.has(p))return sc.get(p);let c=null;try{const a=path.join(root,'library',p);
if(p.endsWith('.cfg')){const d=path.dirname(a);c=assembleCfgProgram(fs.readFileSync(a,'utf8'),n=>{const q=path.join(d,n);return fs.existsSync(q)?fs.readFileSync(q,'utf8'):null;}).code;}
else c=fs.readFileSync(a,'utf8');}catch{c=null;}sc.set(p,c);return c;}
const isHO=(ct)=>{try{return (ct.argTypes||[]).some(at=>{const d=constructorArgDescriptor(at,[]);
return !!(d&&(d.higherOrder||(d.binderCtx&&d.binderCtx.length)));});}catch{return false;}};
const hit=new Set(), devs=new Set();
for(const r of L){
  if(!r.missing.length) continue;
  const code=programOf(r.id.split('#')[0]); if(!code) continue;
  let cs=[]; try{cs=enumerateConstructorsTyped(code,r.fam);}catch{continue;}
  const by=new Map(cs.map(c=>[c.name,c]));
  if(r.missing.some(n=>by.get(n)&&isHO(by.get(n)))){ hit.add(r.id); devs.add(r.id.split('#')[0]); }
}
console.log('CLASS: higher-order constructor never proposed at the deepest dead end');
console.log('  distinct TARGETS      :',hit.size,'of 207 scored-population ('+(100*hit.size/207).toFixed(1)+'% of cheap deaths)');
console.log('  distinct DEVELOPMENTS :',devs.size,' <- guards against one shape replicated across files');
console.log('  ids written to scratchpad/ho-drop-ids.txt');
fs.writeFileSync('scratchpad/ho-drop-ids.txt',[...hit].join('\n'));
console.log('\n  members:'); [...hit].forEach(i=>console.log('   ',i));
