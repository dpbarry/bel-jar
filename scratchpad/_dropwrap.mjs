
const seen = new Set();
globalThis.__factDropDebug = (d) => {
  const k = d.name + ':' + d.ctx;
  if (seen.has(k)) return; seen.add(k);
  console.error('FACTDROP ' + d.name + ' : ' + d.type + ' ctx=[' + d.ctx + '] goalParts=' + JSON.stringify(d.goalParts));
};
await import('./diverge-one.mjs');
