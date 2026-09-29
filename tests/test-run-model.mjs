// The run-time estimator learns from every run and keeps what it learned
// (repl/run-progress.mjs, the device table's `runModel` row).
//
// ⛔ It used to keep only `lines` and `ms` of what it saved, dropping the
// learned rate and the sample count, so every estimate was "the last run's
// rate, one sample": the model never accumulated anything. This pins that it
// does, and that it survives a reload.
import { makeBrowserStorage, openTab } from './_persist-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const browser = makeBrowserStorage();
globalThis.Device = openTab(browser).ctx.Device;
await import('../js/repl/run-progress.mjs');
const R = globalThis.RunProgress;

const fresh = R.estimateMs(100);
expect(fresh > 0 && globalThis.Device.get('runModel') === null, 'a new device estimates from the built-in model');

R.learn(100, 3000);
expect(globalThis.Device.get('runModel').sampleCount === 1, 'the first run is one sample');
for (let i = 0; i < 5; i++) R.learn(100, 3000);
const model = globalThis.Device.get('runModel');
expect(model.sampleCount === 6, `every run adds a sample (${model.sampleCount})`);
expect(model.msPerLine > 0 && model.baseMs >= 0, 'with a learned rate and base');
const learned = R.estimateMs(100);
expect(Math.abs(learned - 3000) < 600, `six runs of 100 lines in 3s teach it ~3s (${Math.round(learned)})`);

// A reload: a new page over the same browser storage.
globalThis.Device = openTab(browser).ctx.Device;
expect(globalThis.Device.get('runModel').sampleCount === 6, 'the model survives a reload');
expect(Math.abs(R.estimateMs(100) - learned) < 1, 'and estimates exactly as before it');

console.log(`OK run model (${n} checks: learns every run, accumulates samples, survives a reload)`);
