// The Beluga runtime benchmark in real Chrome, in workers, as the app runs it.
// `npm run bench:runtime:chrome` (docs/wasm-runtime.md); the Node half is
// node-bench.mjs, and the two share the corpus and the depth families.
//
//   node scripts/runtime-bench/chrome-bench.mjs [--builds stable,wasm,wasm-cps,name=kind:path]
//        [--passes 3] [--only boot,cold,passes,depth,pool] [--out results/runtime-bench/chrome.json]
//
// Builds are served under /__rt/<name>/ with a year's Cache-Control, so a warm
// boot can come from the HTTP cache as it would from R2; a cold boot is a fresh
// browser context, with nothing cached. One build at a time.
//
//   boot    cold (fresh context) and warm (fresh worker, cached bytes), new Worker() to ready
//   cold    a fresh worker's FIRST check, three sizes of unit
//   passes  one worker, the corpus N times (pass 1 vs the median of the rest), hashes
//   depth   the largest n of each family a worker checks before its stack gives out
//   pool    1, 3 and 7 workers booted together: time until all are ready, and memory
//           (measureUserAgentSpecificMemory); for Wasm, also with the Module
//           compiled once by the page and handed to every worker
import fs from 'node:fs';
import path from 'node:path';
import { openProbe } from '../probe-harness.mjs';
import { resolveBuild, buildFiles } from '../../tests/_beluga-runtime.mjs';
import { libraryUnits, DEPTH_FAMILIES, OVERFLOW_RE, root } from './corpus.mjs';

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : dflt; };
function parseBuildArg(s) {
  const eq = s.indexOf('=');
  if (eq < 0) return s;
  const [kind, ...rest] = s.slice(eq + 1).split(':');
  return { name: s.slice(0, eq), kind, path: rest.join(':') };
}
const builds = opt('builds', 'stable,wasm,wasm-cps').split(',').map(parseBuildArg).map(resolveBuild);
const passes = Number(opt('passes', '3'));
const only = new Set(opt('only', 'boot,cold,passes,depth,pool').split(','));
const outPath = path.join(root, opt('out', 'results/runtime-bench/chrome.json'));
const COLD_UNITS = ['examples/arith/arith.bel', 'examples/codatatypes/howes-method/howe-total.bel',
  'examples/poplmark-reloaded+ [sources.cfg]'];
const POOL_UNIT = 'examples/codatatypes/howes-method/howe-total.bel';
const DEPTH_CAP = 1 << 16;
// A check slower than this is no use interactively: past it, a depth search stops.
const TIME_BUDGET_MS = 60000;
const PROBE_TIMEOUT_MS = TIME_BUDGET_MS + 30000;
const log = (s) => process.stderr.write(s + '\n');
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const TYPES = { '.js': 'text/javascript', '.wasm': 'application/wasm' };
const byName = new Map(builds.map((b) => [b.name, b]));
// /__rt/<name>/<file>: the build's own folder, so a Wasm loader finds its .assets beside it.
function serveRuntime(req, res) {
  const m = /^\/__rt\/([^/]+)\/(.+)$/.exec(decodeURIComponent(req.url.split('?')[0]));
  if (!m || !byName.has(m[1])) return false;
  const file = path.join(path.dirname(byName.get(m[1]).path), m[2]);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
  return true;
}
const runtimeUrl = (b) => '/__rt/' + b.name + '/' + path.basename(b.path);
const wasmUrls = (b) => buildFiles(b).slice(1).map((f) => '/__rt/' + b.name + '/' + path.relative(path.dirname(b.path), f).split(path.sep).join('/'));
const pageBuild = (b) => ({ kind: b.kind, url: runtimeUrl(b), wasm: b.kind === 'wasm' ? wasmUrls(b)[0] : null });

const P = await openProbe({
  page: 'scripts/runtime-bench/bench.html',
  waitFor: () => window.bench,
  settle: 0,
  port: Number(process.env.PROBE_PORT || 8881),
  api: serveRuntime,
  scale: 1,
  args: ['--enable-blink-features=ForceEagerMeasureMemory'],
});
const { page, browser } = P;
const chromeVersion = await browser.version();

let results = {};
try { results = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch { /* first run */ }
results = { ...results, chrome: chromeVersion, date: new Date().toISOString(), builds: { ...(results.builds || {}) } };
const save = () => { fs.mkdirSync(path.dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, JSON.stringify(results, null, 1)); };

const units = libraryUnits();
const unitCode = new Map(units.map((u) => [u.name, u.code]));
let key = 0;
const boot = (pg, b, opts) => {
  const k = String(++key);
  return pg.evaluate((kk, pb, o) => window.bench.boot(kk, pb, o), k, pageBuild(b), opts || {}).then((r) => ({ key: k, ...r }));
};
const check = (k, code, timeoutMs) => page.evaluate((kk, c, t) => window.bench.check(kk, c, t), k, code, timeoutMs || 600000);
const stop = (k) => page.evaluate((kk) => window.bench.stop(kk), k);

function verdictOf(r) {
  if (r.error) return /timeout/.test(r.error) ? 'timeout' : 'crashed';
  if (r.threw) return OVERFLOW_RE.test(r.threw) ? 'overflow-thrown' : 'threw';
  if (r.ok) return 'ok';
  return OVERFLOW_RE.test(r.output) ? 'overflow-reported' : 'failed';
}

async function coldBoot(b) {
  const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
  try {
    const pg = await ctx.newPage();
    await pg.goto(page.url(), { waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => window.bench);
    return await boot(pg, b);
  } finally {
    await ctx.close();
  }
}

async function depthSearch(b, family) {
  const probes = [];
  const probe = async (n) => {
    let r;
    let k = null;
    try {
      const booted = await boot(page, b);
      k = booted.key;
      r = await check(k, DEPTH_FAMILIES[family](n), PROBE_TIMEOUT_MS);
    } catch (e) {
      r = { error: String(e && e.message || e) };
    }
    if (k) await stop(k);
    let verdict = verdictOf(r);
    if (verdict === 'ok' && r.ms > TIME_BUDGET_MS) verdict = 'slow';
    probes.push({ n, verdict, ms: r.ms, sample: verdict === 'ok' ? '' : String(r.threw || r.error || r.output || '').slice(0, 200) });
    log(`  depth ${b.name} ${family} n=${n}: ${verdict}${r.ms ? ' ' + Math.round(r.ms) + 'ms' : ''}`);
    return verdict;
  };
  // Doubling, then bisection between the last success and the first failure.
  // The clock ends a search: a check over TIME_BUDGET_MS (or killed at its
  // deadline) means this build is limited by time at n, not by its stack, and
  // bisecting further would only buy more of the same.
  let lo = 0;
  let hi = null;
  for (let n = 16; n <= DEPTH_CAP; n *= 2) {
    const v = await probe(n);
    if (v === 'ok') { lo = n; continue; }
    if (v === 'slow' || v === 'timeout') return { family, maxOk: lo, limitedByTimeAt: n, probes };
    hi = n;
    break;
  }
  if (hi == null) return { family, maxOk: lo, capped: true, probes };
  while (hi - lo > Math.max(1, Math.round(lo * 0.03))) {
    const mid = Math.round((lo + hi) / 2);
    const v = await probe(mid);
    if (v === 'ok' || v === 'slow') lo = mid; else hi = mid;
  }
  const failure = probes.find((p) => p.n === hi);
  return { family, maxOk: lo, firstFail: hi, failure: failure && failure.verdict, sample: failure && failure.sample, probes };
}

async function pool(b, k, shared) {
  await page.evaluate(() => window.bench.stopAll());
  let compileMs = null;
  if (shared) compileMs = await page.evaluate((u) => window.bench.compile(u), pageBuild(b).wasm);
  const t0 = Date.now();
  const booted = await Promise.all(Array.from({ length: k }, () => boot(page, b, { module: !!shared })));
  const allReadyMs = Date.now() - t0;
  const checks = await Promise.all(booted.map((x) => check(x.key, unitCode.get(POOL_UNIT))));
  const memory = await page.evaluate(() => window.bench.memory());
  await page.evaluate(() => window.bench.stopAll());
  return { workers: k, sharedModule: !!shared, compileMs, allReadyMs, checkMs: checks.map((c) => Math.round(c.ms)), memory };
}

let crash = null;
try {
  for (const b of builds) {
    const entry = results.builds[b.name] = { ...(results.builds[b.name] || {}), files: buildFiles(b).map((f) => path.relative(root, f)) };
    log(`== ${b.name}`);
    if (only.has('boot')) {
      entry.bootCold = [];
      for (let i = 0; i < 5; i++) entry.bootCold.push(await coldBoot(b));
      const prime = await boot(page, b);
      await stop(prime.key);
      entry.bootWarm = [];
      for (let i = 0; i < 7; i++) { const r = await boot(page, b); await stop(r.key); entry.bootWarm.push(r); }
      log(`${b.name} boot cold ${median(entry.bootCold.map((r) => r.pageNewWorkerToReadyMs)).toFixed(0)} ms, warm ${median(entry.bootWarm.map((r) => r.pageNewWorkerToReadyMs)).toFixed(0)} ms`);
      save();
    }
    if (only.has('cold')) {
      entry.cold = {};
      for (const u of COLD_UNITS) {
        entry.cold[u] = [];
        for (let i = 0; i < 3; i++) {
          const r = await boot(page, b);
          entry.cold[u].push(await check(r.key, unitCode.get(u)));
          await stop(r.key);
        }
        log(`${b.name} cold ${u}: ${entry.cold[u].map((x) => Math.round(x.ms)).join(', ')} ms`);
      }
      save();
    }
    if (only.has('passes')) {
      const r = await boot(page, b);
      const rows = units.map((u) => ({ name: u.name, bytes: u.bytes, ms: [], ok: [], hash: [] }));
      for (let p = 0; p < passes; p++) {
        for (let i = 0; i < units.length; i++) {
          const c = await check(r.key, units[i].code);
          rows[i].ms.push(c.error ? null : +c.ms.toFixed(2));
          rows[i].ok.push(!!c.ok);
          rows[i].hash.push(c.hash || c.error || c.threw);
        }
        const total = rows.reduce((n, row) => n + (row.ms[p] || 0), 0);
        log(`${b.name} pass ${p + 1}: ${(total / 1000).toFixed(1)} s`);
      }
      await stop(r.key);
      entry.passes = { rows };
      save();
    }
    if (only.has('depth')) {
      entry.depth = {};
      for (const family of Object.keys(DEPTH_FAMILIES)) { entry.depth[family] = await depthSearch(b, family); save(); }
    }
    if (only.has('pool')) {
      entry.pool = [];
      for (const k of [1, 3, 7]) {
        entry.pool.push(await pool(b, k, false));
        if (b.kind === 'wasm' && wasmUrls(b).length === 1) entry.pool.push(await pool(b, k, true));
      }
      log(`${b.name} pool: ${entry.pool.map((p) => `${p.workers}${p.sharedModule ? 's' : ''}: ${p.allReadyMs}ms ${p.memory.totalMB}MB`).join(' | ')}`);
      save();
    }
  }
} catch (e) {
  crash = e;
}
save();
log('wrote ' + outPath);
await P.finish('chrome-bench', crash);
