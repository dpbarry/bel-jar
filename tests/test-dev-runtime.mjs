// `npm run dev` runs Beluga checks too: the runtime's two files are not assets
// (.assetsignore keeps them out of the upload; live, they come from R2), so the
// dev Worker passes them on from the dev server's file server. Only those two
// paths, and only where the dev config sets DEV_RUNTIME_ORIGIN (production
// never does: tests/test-deploy-config.mjs).
import worker from '../server/worker.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  asked.push(String(url));
  return new Response('/* runtime */', { status: 200, headers: { 'content-type': 'text/javascript' } });
};
const assets = [];
const ASSETS = { fetch: async (req) => { assets.push(new URL(req.url).pathname); return new Response('asset', { status: 200 }); } };
const dev = { ASSETS, DEV_RUNTIME_ORIGIN: 'http://127.0.0.1:8788' };
const live = { ASSETS };
const get = (path, env) => worker.fetch(new Request('http://127.0.0.1:8787' + path), env);

try {
  let res = await get('/beluga_web.bc.js?v=abc', dev);
  expect(res.status === 200 && asked.at(-1) === 'http://127.0.0.1:8788/beluga_web.bc.js?v=abc', `the runtime is passed on from the dev file server, query and all (${asked.at(-1)})`);
  // The Wasm builds (Settings > Beluga > Build version): each loader, and the .wasm
  // in the folder beside it, which the loader fetches by itself.
  await get('/beluga_web_wasm.bc.wasm.js?v=abc', dev);
  expect(asked.at(-1) === 'http://127.0.0.1:8788/beluga_web_wasm.bc.wasm.js?v=abc', `a Wasm build's loader is passed on (${asked.at(-1)})`);
  await get('/beluga_web_wasm_cps.bc.wasm.assets/code-119fb6a9839c98b68e35.wasm', dev);
  expect(asked.at(-1) === 'http://127.0.0.1:8788/beluga_web_wasm_cps.bc.wasm.assets/code-119fb6a9839c98b68e35.wasm', 'and the .wasm it loads');
  const before = asked.length;
  await get('/index.html', dev);
  await get('/js/shell.js', dev);
  await get('/beluga_web.bc.json', dev);
  await get('/beluga_web_wasm.bc.wasm.assets/notes.txt', dev);
  expect(asked.length === before && assets.join() === '/index.html,/js/shell.js,/beluga_web.bc.json,/beluga_web_wasm.bc.wasm.assets/notes.txt',
    `nothing else is passed on, not even another file in a Wasm folder: the site is still its assets (${assets.join()})`);
  res = await get('/beluga_web.bc.js', live);
  expect(asked.length === before && assets.at(-1) === '/beluga_web.bc.js', 'without the dev switch, the runtime path is an ordinary asset request');
} finally {
  globalThis.fetch = realFetch;
}

// The other half: the file server the Worker passes them to (dev-runtime-server.mjs,
// 127.0.0.1:8788 under `npm run dev`). Every build's files come back, with the type
// its loader needs; nothing else does. A `npm run dev` started before a change to its
// list still serves the old list (2026-10-16: the Wasm loader came back 404 until a
// restart), so this half is held here, not found in the browser.
{
  const { createRuntimeServer } = await import('../scripts/dev-runtime-server.mjs');
  const { readdirSync, readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  // What must be served is what the app loads: the client's table of builds (its one
  // owner), never the server's own list.
  const client = readFileSync(join(root, 'js', 'beluga', 'beluga-client.js'), 'utf8');
  const RUNTIME = [...client.matchAll(/^\s*'?[\w-]+'?:\s*\{\s*file:\s*'([^']+)'/gm)].map((m) => '/' + m[1]);
  expect(RUNTIME.length === 3, `the client names three builds' files (${RUNTIME.join(', ')})`);
  const server = createRuntimeServer(root);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const wasmFiles = ['beluga_web_wasm', 'beluga_web_wasm_cps'].flatMap((name) =>
    readdirSync(join(root, name + '.bc.wasm.assets')).filter((f) => f.endsWith('.wasm')).map((f) => `/${name}.bc.wasm.assets/${f}`));
  try {
    for (const p of [...RUNTIME, ...wasmFiles]) {
      const res = await fetch(base + p + '?v=abc');
      const type = res.headers.get('content-type') || '';
      await res.arrayBuffer();
      const want = p.endsWith('.wasm') ? /^application\/wasm$/ : /^text\/javascript/;
      expect(res.status === 200 && want.test(type), `the file server serves ${p} (${res.status} ${type})`);
      const forwarded = asked.length;
      globalThis.fetch = async (url) => { asked.push(String(url)); return new Response('', { status: 200 }); };
      try { await get(p, dev); } finally { globalThis.fetch = realFetch; }
      expect(asked.length === forwarded + 1, `and the dev Worker passes ${p} on to it`);
    }
    expect(wasmFiles.length === 2, `both Wasm builds have their .wasm (${wasmFiles.length})`);
    for (const p of ['/index.html', '/beluga_web_wasm.bc.wasm.assets/notes.txt', '/beluga_web_wasm.bc.wasm.assets/../package.json', '/beluga_web.bc.json']) {
      const res = await fetch(base + p);
      await res.arrayBuffer();
      expect(res.status === 404, `and nothing else (${p}: ${res.status})`);
    }
  } finally {
    server.close();
  }
}

console.log(`OK dev runtime (${n} checks: npm run dev passes the Beluga runtime on, only it, only in dev)`);
