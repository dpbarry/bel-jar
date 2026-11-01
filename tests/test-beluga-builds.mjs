// The builds of the Beluga runtime, as Settings > Beluga > Build version offers
// them (docs/wasm-runtime.md): one table in js/beluga/beluga-client.js (`BUILDS`),
// and everything that names a build is a projection of it.
//
//   1. The table, the setting's values (settings-schema.mjs) and the dropdown's
//      options (settings-ui.mjs) are the same list.
//   2. The client offers a Wasm build where the engine has GC, tail calls and
//      exception handling (each probe matters); the default is Wasm CPS, and where
//      Wasm cannot run, everything runs as Stable.
//   3. The real worker loads every build through the real loader, as a browser worker
//      would (fetch, importScripts, instantiateStreaming), and answers alike: a check,
//      a load, a command; and a stack overflow, which under Wasm is thrown, is answered
//      exactly as the JS build answers it. A start that fails says so, quickly.
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEPTH_FAMILIES } from '../scripts/runtime-bench/corpus.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── 1. one list ────────────────────────────────────────────────────────────
const clientSrc = read('js/beluga/beluga-client.js');
const table = clientSrc.slice(clientSrc.indexOf('var BUILDS = {'), clientSrc.indexOf('};', clientSrc.indexOf('var BUILDS = {')));
const tableKeys = [...table.matchAll(/^\s*'?([\w-]+)'?:\s*\{\s*file:/gm)].map((m) => m[1]);
const clientDefault = (/var DEFAULT_BUILD = '([\w-]+)'/.exec(clientSrc) || [])[1];
const schema = read('js/persist/settings-schema.mjs').match(/id: 'belugaMode'[^\n]*default: '([\w-]+)'[^\n]*values: \[([^\]]*)\]/);
const schemaValues = schema ? [...schema[2].matchAll(/'([\w-]+)'/g)].map((m) => m[1]) : [];
const ui = read('js/ui/settings-ui.mjs');
const options = ui.slice(ui.indexOf('var BUILD_OPTIONS = ['), ui.indexOf('];', ui.indexOf('var BUILD_OPTIONS = [')));
const optionValues = [...options.matchAll(/value: '([\w-]+)'/g)].map((m) => m[1]);
expect(tableKeys.join() === 'wasm-cps,wasm,stable', `the client's table lists the three builds, the default first (${tableKeys})`);
expect(clientDefault === 'wasm-cps' && schema && schema[1] === clientDefault, `the default is Wasm CPS, in the client and the setting (${clientDefault}, ${schema && schema[1]})`);
expect(schemaValues.join() === tableKeys.join(), `the setting's values are the table's builds (${schemaValues})`);
expect(optionValues.join() === tableKeys.join(), `and so are the dropdown's options (${optionValues})`);
expect(/addDropdownRow\(panelBodies\.beluga, 'beluga-mode', 'Build version',/.test(ui), 'the row is called Build version');
expect(!/id: 'belugaFallbackStable'|get\('belugaFallbackStable'\)|'beluga-fallback-stable'/.test(ui + clientSrc + read('js/persist/settings-schema.mjs') + read('js/beluga/beluga-run.mjs')),
  'Fast went with its "Retry with Stable" switch: no row, no reader');

// ── 2. the client offers what works ───────────────────────────────────────
function loadClient({ base, validate } = {}) {
  const wasm = validate ? { ...WebAssembly, validate } : WebAssembly;
  const ctx = {
    document: { currentScript: { src: 'http://localhost/js/beluga/beluga-client.js' }, baseURI: 'http://localhost/edit.html' },
    URL, TextEncoder, WebAssembly: wasm, setTimeout, clearTimeout, console,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  if (base) ctx.BELJAR_RUNTIME_BASE = base;
  vm.createContext(ctx);
  vm.runInContext(clientSrc, ctx);
  return ctx.BelugaClient;
}
const local = loadClient();
expect(local.availableBuilds().join() === 'wasm-cps,wasm,stable', `here (Node ${process.versions.node}) every build works (${local.availableBuilds()})`);
expect(local.getBuild() === 'wasm-cps', `and before anything is chosen, every slot runs the default (${local.getBuild()})`);
const stamp = /var RUNTIME_VERSION = '(\d{14})'/.exec(clientSrc)[1];
const files = { stable: 'beluga_web.bc.js', wasm: 'beluga_web_wasm.bc.wasm.js', 'wasm-cps': 'beluga_web_wasm_cps.bc.wasm.js' };
for (const [b, f] of Object.entries(files)) {
  expect(local.runtimeScriptUrl(b) === `http://localhost/${f}?v=${stamp}`, `${b} loads ${f}, stamped (${local.runtimeScriptUrl(b)})`);
  expect(existsSync(join(root, f)), `${f} is in the repository (_rebuild/rebuild.ps1 builds it)`);
  expect(JSON.stringify(local.configFor(b)) === `{"build":"${b}"}`, `${b} is configured as itself`);
}
expect(!existsSync(join(root, 'beluga_web.bc.dt.js')), 'the retired Fast build is gone from the repository');
for (const old of ['fast', 'nonsense']) {
  expect(local.effectiveBuild(old) === 'wasm-cps' && local.runtimeScriptUrl(old).includes('beluga_web_wasm_cps.bc.wasm.js?'),
    `a value that is no build ("${old}", as a stored "fast" is now) runs the default`);
}

const deployed = loadClient({ base: 'https://beljar-cdn.deanbarry.com/' });
expect(deployed.availableBuilds().join() === 'wasm-cps,wasm,stable', `a deployed host offers every build: R2 carries them (${deployed.availableBuilds()})`);
expect(deployed.runtimeScriptUrl('wasm-cps') === `https://beljar-cdn.deanbarry.com/beluga_web_wasm_cps.bc.wasm.js?v=${stamp}`, 'and loads them from R2');

const probes = [...clientSrc.matchAll(/^\s*\[(0, 97, 115, 109[^\]]*)\]/gm)].map((m) => m[1].replace(/\s/g, ''));
expect(probes.length === 3, `three feature probes: GC, tail calls, exception handling (${probes.length})`);
for (const [i, feature] of ['GC', 'tail calls', 'exception handling'].entries()) {
  const without = loadClient({ validate: (bytes) => Array.from(bytes).join() !== probes[i] && WebAssembly.validate(bytes) });
  expect(without.availableBuilds().join() === 'stable', `an engine without ${feature} is offered no Wasm build`);
  expect(without.getBuild() === 'stable' && without.effectiveBuild('wasm-cps') === 'stable', 'and runs Stable, whatever was chosen');
}
expect(WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 4, 1, 2, 0, 0xff])) === false,
  'and validate does refuse bad bytes (the probes are not vacuously true)');

// ── 3. the real worker, the real loader, the real runtime ─────────────────
// A worker-shaped context: importScripts and fetch read the repository, as a page's
// server would serve it; postMessage, the worker's events and Blob URLs, emulated.
function startWorker(build, { wasmType = 'application/wasm', missingWasm = false, missingLoader = false } = {}) {
  const posted = [];
  const waiting = [];
  const listeners = { unhandledrejection: [], error: [], message: [] };
  const blobs = new Map();
  const toPath = (url) => decodeURIComponent(new URL(url).pathname).slice(1);
  class Blob { constructor(parts) { this.parts = parts; } }
  const ctx = {
    console, TextDecoder, TextEncoder, setTimeout, clearTimeout, performance, URLSearchParams,
    Blob,
    URL: Object.assign(function (...a) { return new URL(...a); }, {
      createObjectURL: (b) => { const u = 'blob:test/' + blobs.size; blobs.set(u, b); return u; },
      revokeObjectURL: (u) => blobs.delete(u),
    }),
    postMessage: (m) => { posted.push(m); waiting.splice(0).forEach((w) => w()); },
    addEventListener: (type, fn) => (listeners[type] = listeners[type] || []).push(fn),
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    importScripts: (...urls) => {
      for (const u of urls) {
        const code = u.startsWith('blob:')
          ? Buffer.concat(blobs.get(u).parts.map((p) => Buffer.from(p))).toString('utf8')
          : readFileSync(join(root, toPath(u)), 'utf8');
        vm.runInContext(code, ctx, { filename: u });
      }
    },
    fetch: async (url) => {
      const p = toPath(String(url));
      if (missingWasm && p.endsWith('.wasm')) return new Response('', { status: 404 });
      if (missingLoader && p.endsWith('.wasm.js')) return new Response('', { status: 404 });
      if (!existsSync(join(root, p))) return new Response('', { status: 404 });
      const type = p.endsWith('.wasm') ? wasmType : 'text/javascript';
      return new Response(readFileSync(join(root, p)), { status: 200, headers: { 'content-type': type } });
    },
  };
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.WebAssembly = WebAssembly;
  const script = local.runtimeScriptUrl(build);
  ctx.location = new URL(`http://localhost/js/beluga/beluga-worker.js?build=${build}&script=${encodeURIComponent(script)}`);
  vm.createContext(ctx);
  const onRejection = (reason) => {
    const event = { reason, preventDefault() {} };
    (listeners.unhandledrejection || []).forEach((fn) => fn(event));
  };
  process.on('unhandledRejection', onRejection);
  vm.runInContext(read('js/beluga/beluga-worker.js'), ctx, { filename: 'beluga-worker.js' });
  let id = 0;
  const ask = (type, payload, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const my = ++id;
    const timer = setTimeout(() => reject(new Error(`${build} ${type}: no answer in ${timeoutMs} ms`)), timeoutMs);
    const look = () => {
      const m = posted.find((x) => x.id === my);
      if (m) { clearTimeout(timer); resolve(m); } else waiting.push(look);
    };
    ctx.onmessage({ data: { id: my, type, payload } });
    look();
  });
  return { ask, stop: () => process.off('unhandledRejection', onRejection) };
}

const arith = read('library/data/examples/arith/arith.bel');
const deep = DEPTH_FAMILIES.term(1000);
const answers = {};
for (const build of ['stable', 'wasm', 'wasm-cps']) {
  const w = startWorker(build);
  try {
    const t0 = performance.now();
    const ready = await w.ask('init');
    expect(ready.type === 'ready', `${build}: the worker loads it (${ready.type}${ready.message ? ': ' + ready.message : ''})`);
    const bootMs = performance.now() - t0;
    const check = await w.ask('check', arith);
    expect(check.type === 'result' && check.result.ok === true, `${build}: arith.bel checks`);
    const load = await w.ask('load', arith);
    expect(load.result.ok === true && /^\d+:[0-9a-f]{8}$/.test(load.result.fingerprint), `${build}: and loads, committed`);
    const holes = await w.ask('run', '%:countholes');
    const deepCheck = await w.ask('check', deep, 120000);
    const deepLoad = await w.ask('load', deep, 120000);
    expect(deepCheck.type === 'result' && deepLoad.type === 'result',
      `${build}: a deep input is answered, as every build answers it, not thrown at the client (${deepCheck.type}, ${deepLoad.type})`);
    const after = await w.ask('run', '%:countholes');
    const again = await w.ask('check', arith);
    answers[build] = { check: check.result, holes: holes.result, deepCheck: deepCheck.result, deepLoad: deepLoad.result, after: after.result, again: again.result, fingerprint: load.result.fingerprint };
    // Stable is deep on term, so its own overflow comes from arrows (8192 overflows; ~4 s).
    if (build === 'stable') answers.stable.ownOverflow = (await w.ask('check', DEPTH_FAMILIES.arrows(8192), 120000)).result;
    expect(deepLoad.result.ok || deepLoad.result.fingerprint === load.result.fingerprint,
      `${build}: a load that fails leaves the committed session (${deepLoad.result.fingerprint})`);
    expect(after.result === holes.result && again.result.ok === true, `${build}: and the worker answers as before after the deep input`);
    console.log(`  ${build}: booted in ${Math.round(bootMs)} ms; term 1000 ${deepCheck.result.ok ? 'checks' : JSON.stringify(deepCheck.result.output)}`);
  } finally {
    w.stop();
  }
}
// A JS build answers its own overflow (beluga_web.ml's normalize_exn); under Wasm the
// overflow is thrown and the worker answers it: the two answers are the same bytes.
const jsOverflow = answers.stable.ownOverflow;
expect(jsOverflow.ok === false && jsOverflow.output === 'Stack overflow\n', `Stable answers its own overflow (${JSON.stringify(jsOverflow)})`);
expect(JSON.stringify(answers.wasm.deepCheck) === JSON.stringify(jsOverflow), `a thrown Wasm overflow is answered exactly as the JS build answers it (${JSON.stringify(answers.wasm.deepCheck)})`);
expect(JSON.stringify(answers.wasm.deepLoad) === JSON.stringify({ ...jsOverflow, fingerprint: answers.wasm.fingerprint }), 'a load too, with the committed fingerprint');
expect(answers.stable.deepCheck.ok === true && answers['wasm-cps'].deepCheck.ok === true, 'and the two CPS builds check it');
for (const build of ['wasm', 'wasm-cps']) {
  for (const k of ['check', 'holes', 'after', 'again']) {
    expect(JSON.stringify(answers[build][k]) === JSON.stringify(answers.stable[k]), `${build} answers ${k} as stable does`);
  }
}

// A server that sends .wasm as another type still works; a missing .wasm fails, fast.
{
  const w = startWorker('wasm', { wasmType: 'application/octet-stream' });
  try {
    const ready = await w.ask('init');
    expect(ready.type === 'ready', `a .wasm served as application/octet-stream still loads (${ready.type}${ready.message ? ': ' + ready.message : ''})`);
    expect((await w.ask('check', arith)).result.ok === true, 'and checks');
  } finally { w.stop(); }
}
{
  const w = startWorker('wasm-cps', { missingWasm: true });
  try {
    const t0 = performance.now();
    const failed = await w.ask('init', null, 10000);
    expect(failed.type === 'error' && /Could not start Beluga/.test(failed.message), `a missing .wasm is an error, not a hang (${failed.type}: ${failed.message})`);
    expect(performance.now() - t0 < 5000, 'and it says so at once');
  } finally { w.stop(); }
}

// A server that has not got the build at all (2026-10-16: a `npm run dev` started
// before the Wasm paths existed): the error names the status and the file.
{
  const w = startWorker('wasm', { missingLoader: true });
  try {
    const failed = await w.ask('init', null, 10000);
    expect(failed.type === 'error' && /HTTP 404 for http:\/\/localhost\/beluga_web_wasm\.bc\.wasm\.js\?v=/.test(failed.message),
      `a server without the build says so, with the status and the file (${failed.message})`);
  } finally { w.stop(); }
}

console.log(`OK beluga builds (${n} checks: one table, offered where they work, every build loaded by the real worker and answering alike, overflow included)`);
