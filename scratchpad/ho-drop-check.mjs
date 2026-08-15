// Does the engine drop constructors whose argument types are HIGHER-ORDER?
// Class B of ctor-reach: enumerator produced several constructors of the right
// family but omitted the one the reference needs. Test the hypothesis against
// the SIGNATURES: compare "has a higher-order argument" for MISSING vs PROPOSED.
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
let mHO=0,mTot=0,pHO=0,pTot=0; const rowsOut=[];
for(const r of L){
  if(!r.missing.length||!r.ENG.length) continue;   // class B only
  const code=programOf(r.id.split('#')[0]); if(!code) continue;
  let cs=[]; try{cs=enumerateConstructorsTyped(code,r.fam);}catch{continue;}
  const by=new Map(cs.map(c=>[c.name,c]));
  const mh=[],ph=[];
  for(const n of r.missing){const c=by.get(n); if(!c)continue; mTot++; const h=isHO(c); if(h)mHO++; mh.push(n+(h?'*':''));}
  for(const n of r.ENG){const c=by.get(n); if(!c)continue; pTot++; const h=isHO(c); if(h)pHO++; ph.push(n+(h?'*':''));}
  rowsOut.push(`  ${r.id.split('#')[1].padEnd(18)} fam=${r.fam.padEnd(12)} MISSING[${mh.join(',')}]  proposed[${ph.join(',')}]`);
}
const p=(a,b)=>b?(100*a/b).toFixed(1)+'%':'—';
console.log('HYPOTHESIS: constructors with a HIGHER-ORDER argument slot get dropped.');
console.log('(class B only: the enumerator worked, but omitted a needed constructor)\n');
console.log('  MISSING  constructors that are higher-order :',mHO+'/'+mTot,p(mHO,mTot));
console.log('  PROPOSED constructors that are higher-order :',pHO+'/'+pTot,p(pHO,pTot));
console.log('  lift:',((mHO/(mTot||1))/((pHO/(pTot||1))||1)).toFixed(2)+'x');
console.log('\n  (* = has a higher-order argument)');
rowsOut.slice(0,14).forEach(s=>console.log(s));

// --- class A: engine proposed NOTHING of the goal family. If those families'
// constructors are ALL higher-order, class A and class B are ONE defect.
let aTot=0,aAllHO=0,aSomeHO=0; const aRows=[];
for(const r of L){
  if(r.ENG.length) continue;                    // class A only
  const code=programOf(r.id.split('#')[0]); if(!code) continue;
  let cs=[]; try{cs=enumerateConstructorsTyped(code,r.fam);}catch{continue;}
  if(!cs.length) continue;
  aTot++;
  const hos=cs.filter(isHO);
  if(hos.length===cs.length)aAllHO++;
  if(hos.length)aSomeHO++;
  aRows.push(`  ${r.id.split('#')[1].padEnd(16)} fam=${r.fam.padEnd(14)} ctors=${cs.length} higher-order=${hos.length}  [${cs.map(c=>c.name+(isHO(c)?'*':'')).join(',')}]`);
}
console.log('\n\nCLASS A (engine proposed NO constructor of the goal family):');
console.log('  families scored              :',aTot);
console.log('  ALL constructors higher-order:',aAllHO,p(aAllHO,aTot));
console.log('  >=1 constructor higher-order :',aSomeHO,p(aSomeHO,aTot));
aRows.slice(0,12).forEach(s=>console.log(s));
