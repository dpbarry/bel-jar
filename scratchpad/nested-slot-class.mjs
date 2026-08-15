import fs from 'node:fs'; import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';
const root=process.cwd();
const rows=fs.readFileSync(path.resolve(root,'results/corpus/library.native-merged-20260729.jsonl'),'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const studyIds=fs.readFileSync(path.resolve(root,'scratchpad/cheapdeath-ids.txt'),'utf8').split('\n').map(s=>s.trim()).filter(Boolean);
const sc=new Map();
function programOf(p){if(sc.has(p))return sc.get(p);let c=null;try{const a=path.join(root,'library',p);
if(p.endsWith('.cfg')){const d=path.dirname(a);c=assembleCfgProgram(fs.readFileSync(a,'utf8'),n=>{const q=path.join(d,n);return fs.existsSync(q)?fs.readFileSync(q,'utf8'):null;}).code;}
else c=fs.readFileSync(a,'utf8');}catch{c=null;}sc.set(p,c);return c;}
function bodyOf(p,n){const c=programOf(p);if(!c)return null;const ds=enumerateDecls(c);
const d=ds.find(x=>x&&x.name===n&&/^(rec|proof)\b|\band\s+rec\b/.test(String(x.text||'').trim()));
const t=d?d.text:(ds.find(x=>x&&x.name===n)||{}).text;if(!t)return null;const e=t.indexOf('=');return e<0?null:t.slice(e+1);}
function boxed(b){const o=[];const s=String(b||'');for(let i=0;i<s.length;i++){if(s[i]!=='[')continue;let d=0;
for(let j=i;j<s.length;j++){if(s[j]==='[')d++;else if(s[j]===']'){d--;if(d===0){o.push(s.slice(i+1,j));i=j;break;}}}}return o;}
function toks(t){const s=String(t||'').replace(/\s+/g,' ').trim();const o=[];let d=0,c='';
for(const ch of s){if(ch==='('||ch==='['||ch==='<')d++;else if(ch===')'||ch===']'||ch==='>')d--;
if(ch===' '&&d===0){if(c){o.push(c);c='';}}else c+=ch;}if(c)o.push(c);return o;}
const sp=t=>{let s=String(t).trim();while(s.startsWith('(')&&s.endsWith(')')){let d=0,w=true;
for(let i=0;i<s.length;i++){if(s[i]==='(')d++;else if(s[i]===')'){d--;if(d===0&&i<s.length-1){w=false;break;}}}
if(!w)break;s=s.slice(1,-1).trim();}return s;};
const KW=/^(case|let|in|of|fn|mlam|if|then|else|impossible|rec|and|proof|by|\||=>)$/;
function depth(t){const s=sp(String(t||'').trim());if(!s||/^\|^mlam\b/.test(s))return 0;
const p=toks(s);if(p.length<2)return 0;if(KW.test(sp(p[0])))return 0;
let m=0;for(const a of p.slice(1)){const d=depth(a);if(d>m)m=d;}return 1+m;}
function structuredSlots(t){const s=sp(String(t||'').trim());const p=toks(s);if(p.length<2)return 0;
if(KW.test(sp(p[0])))return 0;let n=0;
for(const a of p.slice(1)){const x=sp(a);const q=toks(x);
if(/^\|^mlam\b/.test(x)||q.length>1)n++;}return n;}
// infix: a boxed term whose SECOND token is a lower-case operator-ish constructor
function hasInfix(t){const p=toks(sp(t));return p.length>=3&&/^[a-z_][\w']*$/.test(sp(p[1]))&&!KW.test(sp(p[1]));}
function scan(ids){let n=0,cls=0,inf=0,tot=0;const hit=[];
for(const id of ids){const [pr,nm]=id.split('#');const b=bodyOf(pr,nm);if(b==null)continue;n++;
let is=false,hi=false;
for(const inner of boxed(b)){const cut=Math.max(inner.lastIndexOf('|-'),inner.lastIndexOf('⊢'));
const term=(cut>=0?inner.slice(cut+(inner[cut]==='⊢'?1:2)):inner).trim();
tot++;
if(structuredSlots(term)>=2||depth(term)>=3)is=true;
if(hasInfix(term))hi=true;}
if(is){cls++;hit.push(nm);}if(hi)inf++;}
return {n,cls,inf,hit};}
const S=scan(studyIds), C=scan(rows.filter(r=>r.outcome==='COMPLETE').map(r=>r.id));
const p=(a,b)=>(100*a/b).toFixed(1)+'%';
console.log('CLASS PREDICATE: reference needs a boxed app with >=2 STRUCTURED SLOTS, or depth>=3');
console.log('  STUDY  (cheap deaths) :', S.cls+'/'+S.n, p(S.cls,S.n));
console.log('  CONTROL (completed)   :', C.cls+'/'+C.n, p(C.cls,C.n), ' <- contamination');
console.log('  lift                  :', ((S.cls/S.n)/(C.cls/C.n)).toFixed(2)+'x');
console.log('\nINFIX constructor application present in a boxed term:');
console.log('  STUDY  :', S.inf+'/'+S.n, p(S.inf,S.n));
console.log('  CONTROL:', C.inf+'/'+C.n, p(C.inf,C.n));
console.log('\nfirst 12 study members:', S.hit.slice(0,12).join(', '));
