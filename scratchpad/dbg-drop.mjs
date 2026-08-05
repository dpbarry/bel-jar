const seen = new Set();
globalThis.__factDropDebug = (d) => {
  const k = `${d.name}:${d.type}|goalParts=${JSON.stringify(d.goalParts)}`;
  if (seen.has(k)) return; seen.add(k);
  console.error(`DROP ${d.name} : ${d.type}   ctx=[${d.ctx}] goalParts=${JSON.stringify(d.goalParts)}`);
};
await import('./diverge-one.mjs');
