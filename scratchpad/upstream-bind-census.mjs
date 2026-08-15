// upstream-bind-census.mjs — SIZE PIECES (1) AND (2) of the entry-51 composite.
//
// 51b measured piece (3) alone at 2/31: the 2 that converted need no derived fact,
// the other 29 need a body citing a metavariable bound by an UPSTREAM recursive call
// under binders. Before building (1)+(2) this asks the corpus what that binding
// actually looks like:
//   ctx shape  plain [g |- X] / simple binder [g, x:T |- X] / BLOCK [g, b:block(..) |- X]
//   RHS        a recursive SELF call / another declared rec (lemma) / neither
//   use        is the bound name later cited under a \-binder? (i.e. it feeds an HO slot)
// Text-only, seconds, no oracle.
import fs from 'node:fs'; import path from 'node:path';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';
const root=process.cwd();
const ids=fs.readFileSync('scratchpad/ho-drop-ids.txt','utf8').split('\n').map(s=>s.trim()).filter(Boolean)
  .filter(id=>!/#(conv|close1)$/.test(id));   // the 2 already explained by piece (3)
const sc=new Map();
function programOf(p){if(sc.has(p))return sc.get(p);let c=null;try{const a=path.join(root,'library',p);
if(p.endsWith('.cfg')){const d=path.dirname(a);c=assembleCfgProgram(fs.readFileSync(a,'utf8'),n=>{const q=path.join(d,n);return fs.existsSync(q)?fs.readFileSync(q,'utf8'):null;}).code;}
else c=fs.readFileSync(a,'utf8');}catch{c=null;}sc.set(p,c);return c;}
function recNames(p){const c=programOf(p);const s=new Set();if(c)for(const d of enumerateDecls(c))
 if(d&&d.name&&/^(rec|proof)\b|\band\s+rec\b/.test(String(d.text||'').trim()))s.add(d.name);return s;}
function bodyOf(p,n){const c=programOf(p);if(!c)return null;const ds=enumerateDecls(c);
const d=ds.find(x=>x&&x.name===n&&/^(rec|proof)\b|\band\s+rec\b/.test(String(x.text||'').trim()));
const t=d?d.text:(ds.find(x=>x&&x.name===n)||{}).text;if(!t)return null;const e=t.indexOf('=');return e<0?null:t.slice(e+1);}

const agg={n:0,anyExt:0,block:0,simple:0,plainOnly:0,selfCall:0,lemmaCall:0,otherRhs:0,usedUnderLam:0};
const rows=[];
for(const id of ids){
  const [prog,name]=id.split('#'); const body=bodyOf(prog,name); if(body==null) continue;
  agg.n++;
  const recs=recNames(prog);
  const flat=body.replace(/\s+/g,' ');
  let hasBlock=false,hasSimple=false,hasExt=false,self=false,lemma=false,other=false,underLam=false;
  // let <pattern> = <rhs> in     (non-greedy, one line's worth)
  for(const m of flat.matchAll(/\blet\b([^=]*?)=([^]*?)\bin\b/g)){
    const pat=m[1], rhs=m[2];
    const box=/\[([^\]]*?)\|-([^\]]*)\]/.exec(pat); if(!box) continue;
    const ctx=box[1];
    const isBlock=/\bblock\b/.test(ctx);
    const isExt=/,\s*[\w']+\s*:/.test(ctx);
    if(isBlock){hasBlock=true;hasExt=true;} else if(isExt){hasSimple=true;hasExt=true;}
    if(!isExt) continue;
    const head=(rhs.trim().match(/^[\w'\/-]+/)||[])[0];
    if(head===name)self=true; else if(head&&recs.has(head))lemma=true; else other=true;
    // is the bound metavar later cited under a \-binder?
    const mv=(box[2].match(/[A-Z][\w']*/)||[])[0];
    // NB: built with String.raw — an earlier version lost its escaping and the
    // leading \\ collapsed to \[ (a literal bracket), silently reporting 0/29.
    if (mv) {
      const esc = mv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(String.raw`\\[^.]*\.[^\n]*\b` + esc + String.raw`\b`);
      if (re.test(flat)) underLam = true;
    }
  }
  if(hasExt)agg.anyExt++; else agg.plainOnly++;
  if(hasBlock)agg.block++; if(hasSimple)agg.simple++;
  if(self)agg.selfCall++; if(lemma)agg.lemmaCall++; if(other&&!self&&!lemma)agg.otherRhs++;
  if(underLam)agg.usedUnderLam++;
  rows.push(`  ${name.padEnd(16)} ${hasBlock?'BLOCK ':hasSimple?'simple':'plain '} ${self?'self':lemma?'lemma':'—'.padEnd(5)} ${underLam?'usedUnderLam':''}`);
}
const p=a=>agg.n?(100*a/agg.n).toFixed(1)+'%':'—';
console.log('UPSTREAM BINDING SHAPE — the 29 that need pieces (1)+(2)\n');
console.log('  targets read                          :',agg.n);
console.log('  bind under an EXTENDED context        :',agg.anyExt,p(agg.anyExt));
console.log('     of which BLOCK pattern             :',agg.block,p(agg.block));
console.log('     of which simple binder             :',agg.simple,p(agg.simple));
console.log('  no extended-context binding at all    :',agg.plainOnly,p(agg.plainOnly));
console.log('  RHS is a SELF recursive call          :',agg.selfCall,p(agg.selfCall));
console.log('  RHS is another declared rec (lemma)   :',agg.lemmaCall,p(agg.lemmaCall));
console.log('  bound name later cited under a binder :',agg.usedUnderLam,p(agg.usedUnderLam));
console.log(); rows.forEach(s=>console.log(s));
