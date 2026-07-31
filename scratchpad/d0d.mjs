const c=new Map();
globalThis.__d0d=(k,v)=>{c.set(k,(c.get(k)||0)+1); if(!globalThis.__samp) globalThis.__samp=new Map(); if(!globalThis.__samp.has(k)) globalThis.__samp.set(k,String(v).slice(0,70));};
process.on('exit',()=>{console.error('--- (0d) gate census ---');
 for(const [k,v] of [...c].sort((a,b)=>b[1]-a[1])) console.error(' ',String(v).padStart(5),k,'|',globalThis.__samp.get(k));});
await import('../scripts/prover-native-oracle.mjs');
