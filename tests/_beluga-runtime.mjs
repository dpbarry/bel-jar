import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// Load any build of the Beluga runtime into Node, each in its own vm context:
// the js_of_ocaml build (stable) and the two wasm_of_ocaml builds (wasm,
// wasm-cps), or any other build by path. The test suite's oracle stays the stable
// JS build (_beluga-check.mjs); this is for the runtime benchmark and the
// differential, which need every build behind one shape.
//
// A JS build is one script and defines `Beluga` as it runs. A Wasm build is a
// loader plus `<name>.assets/code-<hash>.wasm`: the loader instantiates
// asynchronously, and its start promise is the script's completion value, so
// runInContext hands it back and a failed start rejects here, never hangs.
//
// The loader finds its assets from `require.main.filename` in Node, and hooks
// `process.on('uncaughtException')`: the context gets a `require` whose main is
// the loader itself, and a `process` whose `on` and `exit` touch nothing real.

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const BUILDS = {
  stable: { kind: 'js', file: 'beluga_web.bc.js' },
  wasm: { kind: 'wasm', file: 'beluga_web_wasm.bc.wasm.js' },
  'wasm-cps': { kind: 'wasm', file: 'beluga_web_wasm_cps.bc.wasm.js' },
};

// A build by name, or { kind, path } for one outside the repo root (a release-
// profile JS build, a build still in Beluga-W/_build).
export function resolveBuild(build) {
  if (build && typeof build === 'object') {
    return { name: build.name || build.path, kind: build.kind, path: resolve(build.path) };
  }
  const known = BUILDS[build];
  if (!known) throw new Error('Unknown Beluga build: ' + build);
  return { name: build, kind: known.kind, path: join(root, known.file) };
}

// Every file a build fetches: the script, and for Wasm each .wasm it loads.
export function buildFiles(build) {
  const b = resolveBuild(build);
  if (b.kind !== 'wasm') return [b.path];
  const assets = b.path.replace(/\.js$/, '.assets');
  return [b.path].concat(readdirSync(assets).filter((f) => f.endsWith('.wasm')).map((f) => join(assets, f)));
}

export function buildBytes(build) {
  return buildFiles(build).reduce((n, f) => n + statSync(f).size, 0);
}

function baseContext() {
  const ctx = {
    console,
    TextDecoder,
    TextEncoder,
    setTimeout,
    clearTimeout,
    performance,
    globalThis: {},
  };
  ctx.globalThis = ctx;
  return ctx;
}

function wasmContext(loaderPath) {
  const ctx = baseContext();
  const req = createRequire(loaderPath);
  Object.defineProperty(req, 'main', { value: { filename: loaderPath } });
  ctx.require = req;
  ctx.process = {
    versions: process.versions,
    platform: process.platform,
    env: {},
    argv: ['node', loaderPath],
    cwd: () => dirname(loaderPath),
    on: () => {},
    exit: (n) => { throw new Error('Beluga runtime called exit(' + n + ')'); },
  };
  return ctx;
}

// Resolves { Beluga, build, kind, bootMs }. bootMs runs from reading the script
// to a `Beluga` that takes calls: parse + run for JS; for Wasm, the loader plus
// reading, compiling and instantiating the .wasm and OCaml's own start.
export async function loadBelugaRuntime(build, { timeoutMs = 120000 } = {}) {
  const b = resolveBuild(build);
  const t0 = performance.now();
  const code = readFileSync(b.path, 'utf8');
  if (b.kind === 'js') {
    const ctx = baseContext();
    vm.createContext(ctx);
    vm.runInContext(code, ctx, { filename: b.path });
    if (!ctx.Beluga) throw new Error('Beluga global missing after ' + b.name);
    return { Beluga: ctx.Beluga, build: b.name, kind: b.kind, bootMs: performance.now() - t0 };
  }
  const ctx = wasmContext(b.path);
  vm.createContext(ctx);
  const started = vm.runInContext(code, ctx, { filename: b.path });
  if (!started || typeof started.then !== 'function') {
    throw new Error('The Wasm loader for ' + b.name + ' did not hand back its start promise');
  }
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(b.name + ' did not start within ' + timeoutMs + ' ms')), timeoutMs);
  });
  try {
    await Promise.race([started, deadline]);
  } finally {
    clearTimeout(timer);
  }
  if (!ctx.Beluga) throw new Error('Beluga global missing after ' + b.name + ' started');
  return { Beluga: ctx.Beluga, build: b.name, kind: b.kind, bootMs: performance.now() - t0 };
}
