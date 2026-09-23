// The post-deploy probe: the REAL site, the real R2 bucket, real work on BOTH
// Beluga consumers. Run it after every deploy:  npm run probe:live
//
// What it proves that no local probe can: the runtime loads cross-origin from
// R2, every worker that needs it is pointed there (the checker's slots AND
// Harpoon's dedicated proof worker), each runtime URL carries the build stamp,
// and the service worker caches it. HarpoonEngine once kept its own copy of
// the runtime URL and its worker 404'd on the deployed site while the checker
// looked fine. Nothing in the product starts that worker today, which is
// exactly why only a probe that starts it could see it.
//
// ⛔ Hits the network, so it is NOT part of `npm run probe`. Point it at another
// deployment with BELJAR_LIVE_URL=https://... npm run probe:live
import { openProbe } from './probe-harness.mjs';

const LIVE = process.env.BELJAR_LIVE_URL || 'https://beljar.deanbarry.com/';
const CDN_HOST = 'beljar-cdn.deanbarry.com';
const NL = String.fromCharCode(10);

// The harness always opens the local app first; nothing here depends on it.
const { page, check, finish } = await openProbe({ port: 8863, waitFor: () => true, settle: 0 });

let crash = null;
const consoleErrs = [];
const failed = [];
try {
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  page.on('requestfailed', (r) => failed.push(r.url() + ' :: ' + (r.failure() && r.failure().errorText)));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });

  const t0 = Date.now();
  console.log('  live:', LIVE);
  await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.BelugaClient && window.HarpoonEngine && window.App, { timeout: 60000 });

  const cfg = await page.evaluate(() => ({ base: window.BELJAR_RUNTIME_BASE || null, host: location.hostname }));
  console.log('  config:', JSON.stringify(cfg));
  check(cfg.base === `https://${CDN_HOST}/`, 'the deployed host routes the runtime to R2');

  // 1. The checker: a small signature through the live BelugaClient.
  const sig = ['LF nat : type =', '| z : nat', '| s : nat -> nat;', '',
    'LF le : nat -> nat -> type =', '| le_z : le z N', '| le_s : le N M -> le (s N) (s M);', ''].join(NL);
  const run = await page.evaluate(async (src) => {
    const t = performance.now();
    try {
      await window.BelugaClient.warm();
      const warmMs = Math.round(performance.now() - t);
      const t2 = performance.now();
      const out = await window.BelugaClient.load(src, { pinned: true });
      return { ok: true, warmMs, checkMs: Math.round(performance.now() - t2), out: String(out).slice(0, 160) };
    } catch (e) {
      return { ok: false, why: String((e && e.message) || e).slice(0, 300) };
    }
  }, sig);
  console.log('  checker:', JSON.stringify(run));
  check(run.ok, `the checker boots from R2 and type-checks (${run.why || 'ok'})`);

  // 2. Harpoon's dedicated proof worker (HarpoonEngine). The question is only
  //    whether the runtime LOADED in that worker: its ideProof* shim was never
  //    built into the runtime, so even a healthy worker answers start() with
  //    "ideProofStart is not a function". Only the worker's own runtime-load
  //    failure ("Could not load Beluga ...") counts as not booting.
  const proof = ['LF nat : type =', '| z : nat', '| s : nat -> nat;', '',
    'rec id : [|- nat] -> [|- nat] =', 'fn n => ?;', ''].join(NL);
  const harpoon = await page.evaluate(async (src) => {
    const scripts = () => performance.getEntriesByType('resource')
      .filter((r) => /\/beluga-worker\.js$/.test(new URL(r.name).pathname))
      .map((r) => new URL(r.name).searchParams.get('script'));
    const before = scripts().length;
    try {
      const out = await Promise.race([
        window.HarpoonEngine.start(src, 6, 9),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 30s')), 30000)),
      ]);
      return { booted: true, ok: !!(out && out.ok), keys: Object.keys(out || {}).slice(0, 6), script: scripts().slice(before)[0] || null };
    } catch (e) {
      return { booted: false, why: String((e && e.message) || e).slice(0, 200), script: scripts().slice(before)[0] || null };
    }
  }, proof);
  console.log('  harpoon:', JSON.stringify(harpoon));
  const harpoonLoaded = harpoon.booted || !/Could not load Beluga/.test(harpoon.why || '');
  check(harpoonLoaded, `the runtime loads in Harpoon's worker on the live site (${harpoon.why || 'ok'})`);
  check(!!harpoon.script && new URL(harpoon.script).host === CDN_HOST,
    `Harpoon's worker was handed the R2 runtime (got ${harpoon.script})`);

  // 3. Where every runtime byte came from, and the URL each worker was given.
  //    Matched by path: the worker shim's query string carries the encoded
  //    runtime URL, so a full-URL match would count the shim as a runtime fetch.
  const net = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource');
    return {
      runtime: res.map((r) => r.name).filter((n) => /^\/beluga_web\.bc(\.dt)?\.js$/.test(new URL(n).pathname)),
      workers: res.filter((r) => /\/beluga-worker\.js$/.test(new URL(r.name).pathname))
        .map((r) => new URL(r.name).searchParams.get('script')),
    };
  });
  console.log('  network:', JSON.stringify(net));
  check(net.runtime.length > 0 && net.runtime.every((u) => new URL(u).host === CDN_HOST),
    'every runtime fetch came from R2');
  check(net.workers.length > 0 && net.workers.every((s) => s && new URL(s).host === CDN_HOST),
    `every worker was handed the R2 runtime (${net.workers.length} workers)`);
  check(net.workers.length > 0 && net.workers.every((s) => s && new URL(s).searchParams.get('v')),
    'every runtime URL carries the build stamp, so a rebuild is a URL no cache has seen');

  const cors = consoleErrs.filter((e) => /CORS|Access-Control|importScripts|NetworkError/i.test(e));
  check(cors.length === 0, `no CORS or importScripts errors (${cors.join(' | ')})`);

  // 4. Second visit: the service worker should own the runtime now.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.BelugaClient, { timeout: 60000 });
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    let cached = [];
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      cached = cached.concat((await c.keys()).map((r) => r.url));
    }
    return { registered: !!reg, controlled: !!navigator.serviceWorker.controller, cached };
  });
  console.log('  service worker:', JSON.stringify(sw));
  check(sw.registered, 'the service worker registered on the live origin');
  check(sw.cached.some((u) => new URL(u).host === CDN_HOST && new URL(u).pathname === '/beluga_web.bc.js'),
    'and it cached the R2 runtime, so repeat visits skip the 24 MB');

  console.log('  total wall:', Date.now() - t0, 'ms');
  if (consoleErrs.length) console.log('  console errors:', JSON.stringify(consoleErrs));
  if (failed.length) console.log('  failed requests:', JSON.stringify(failed));
} catch (e) {
  crash = e;
}
await finish(crash);
