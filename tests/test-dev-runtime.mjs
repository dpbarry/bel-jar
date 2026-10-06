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
  await get('/beluga_web.bc.dt.js', dev);
  expect(asked.at(-1) === 'http://127.0.0.1:8788/beluga_web.bc.dt.js', 'and its other build');
  const before = asked.length;
  await get('/index.html', dev);
  await get('/js/shell.js', dev);
  await get('/beluga_web.bc.json', dev);
  expect(asked.length === before && assets.join() === '/index.html,/js/shell.js,/beluga_web.bc.json', `nothing else is passed on: the site is still its assets (${assets.join()})`);
  res = await get('/beluga_web.bc.js', live);
  expect(asked.length === before && assets.at(-1) === '/beluga_web.bc.js', 'without the dev switch, the runtime path is an ordinary asset request');
} finally {
  globalThis.fetch = realFetch;
}

console.log(`OK dev runtime (${n} checks: npm run dev passes the Beluga runtime on, only it, only in dev)`);
