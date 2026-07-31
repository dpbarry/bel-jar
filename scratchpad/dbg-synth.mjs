let n = 0;
globalThis.__synthDebug = (d) => { n += 1; console.error('SYNTH#' + n + ' goal=' + d.goal + ' ctors=' + d.ctors.join(',') + ' OUT=' + JSON.stringify(d.out)); };
process.on('exit', () => console.error('TOTAL synth calls: ' + n));
await import('./diverge-one.mjs');
