// The run-time estimator learns from every run and keeps what it learned
// (repl/run-progress.mjs, the device table's `runModel` row): one model per Beluga
// build, since the builds differ ~5x.
//
// ⛔ It used to keep only `lines` and `ms` of what it saved, dropping the
// learned rate and the sample count, so every estimate was "the last run's
// rate, one sample": the model never accumulated anything. This pins that it
// does, and that it survives a reload.
// ⛔ And until 2026-10-17 it kept one model for every build, learned on the old JS
// build, with defaults and a floor (1.5 ms a line) sized for it: a Wasm run (~0.2 ms a
// line) always looked several times longer than it was. This pins one model per build,
// defaults for each, and that a Wasm rate is not floored away.
import { readFileSync } from 'node:fs';
import { makeBrowserStorage, openTab } from './_persist-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// The estimator's defaults are one per build in the client's table.
const src = readFileSync(new URL('../js/repl/run-progress.mjs', import.meta.url), 'utf8');
const client = readFileSync(new URL('../js/beluga/beluga-client.js', import.meta.url), 'utf8');
const defaultsBlock = src.slice(src.indexOf('var BUILD_DEFAULTS = {'), src.indexOf('};', src.indexOf('var BUILD_DEFAULTS = {')));
const defaultKeys = [...defaultsBlock.matchAll(/^\s*'?([\w-]+)'?:\s*\{\s*baseMs:/gm)].map((m) => m[1]);
const buildsBlock = client.slice(client.indexOf('var BUILDS = {'), client.indexOf('};', client.indexOf('var BUILDS = {')));
const buildKeys = [...buildsBlock.matchAll(/^\s*'?([\w-]+)'?:\s*\{\s*file:/gm)].map((m) => m[1]);
expect(defaultKeys.length > 0 && defaultKeys.join() === buildKeys.join(), `a default for every build, and only those (${defaultKeys} / ${buildKeys})`);

const browser = makeBrowserStorage();
globalThis.Device = openTab(browser).ctx.Device;
// The model the old estimator left behind: one, learned on the JS build. It is read as
// Stable's (migrated, never dropped), and the Wasm builds start from their own defaults.
globalThis.Device.set('runModel', { baseMs: 650, msPerLine: 16, sampleCount: 40 });
let build = 'wasm-cps';
globalThis.BelugaClient = { getBuild: () => build };
await import('../js/repl/run-progress.mjs');
const R = globalThis.RunProgress;

const fresh = R.estimateMs(100);
expect(JSON.stringify(Object.keys(globalThis.Device.get('runModel'))) === '["stable"]' && globalThis.Device.get('runModel').stable.msPerLine === 16,
  'the old single model is read as the Stable build\'s, the one it was learned on');
expect(fresh > 0 && !globalThis.Device.get('runModel')['wasm-cps'], 'Wasm CPS, with no model yet, estimates from the built-in one');
expect(fresh < 1000, `and a Wasm CPS run of 100 lines is expected in well under a second, not by the old model (${Math.round(fresh)} ms)`);
expect(R.estimateMs(1000, 'stable') > R.estimateMs(1000, 'wasm-cps'), 'Stable is expected to take longer than Wasm CPS');

R.learn(100, 3000);
expect(globalThis.Device.get('runModel')['wasm-cps'].sampleCount === 1, 'the first run is one sample, for the build it ran on');
for (let i = 0; i < 5; i++) R.learn(100, 3000);
const model = globalThis.Device.get('runModel')['wasm-cps'];
expect(model.sampleCount === 6, `every run adds a sample (${model.sampleCount})`);
expect(model.msPerLine > 0 && model.baseMs >= 0, 'with a learned rate and base');
const learned = R.estimateMs(100);
expect(Math.abs(learned - 3000) < 600, `six runs of 100 lines in 3s teach it ~3s (${Math.round(learned)})`);

// Another build learns apart, and a fast rate is kept: 2,000 lines in 0.5 s is 0.25 ms a line.
build = 'wasm';
for (let i = 0; i < 6; i++) R.learn(2000, 560);
const wasm = globalThis.Device.get('runModel').wasm;
expect(wasm && wasm.msPerLine < 0.5, `a Wasm rate below the old 1.5 ms floor is learned and kept (${wasm && wasm.msPerLine})`);
expect(Math.abs(R.estimateMs(2000) - 560) < 200, `so a Wasm run is expected about as long as it takes (${Math.round(R.estimateMs(2000))} ms)`);
expect(Math.abs(R.estimateMs(100, 'wasm-cps') - learned) < 1, 'and Wasm CPS still estimates by its own model');
expect(globalThis.Device.get('runModel').stable.msPerLine === 16 && globalThis.Device.get('runModel').stable.sampleCount === 40,
  'and Stable\'s, migrated from the old row, is kept whole through the writes for the others');

// A reload: a new page over the same browser storage.
globalThis.Device = openTab(browser).ctx.Device;
build = 'wasm-cps';
expect(globalThis.Device.get('runModel')['wasm-cps'].sampleCount === 6, 'the models survive a reload');
expect(Math.abs(R.estimateMs(100) - learned) < 1, 'and estimate exactly as before it');

console.log(`OK run model (${n} checks: one model per build, learns every run, keeps Wasm-speed rates, survives a reload)`);
