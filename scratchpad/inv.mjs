const c=new Map(), samp=new Map();
globalThis.__inv=(k,v)=>{c.set(k,(c.get(k)||0)+1); if(!samp.has(k))samp.set(k,String(v).slice(0,60));};
process.on('exit',()=>{console.error('--- ctype-inversion gate ---');for(const [k,v] of [...c].sort((a,b)=>b[1]-a[1]))console.error(' ',String(v).padStart(4),k,'|',samp.get(k));});
await import('../scripts/prover-native-oracle.mjs');
