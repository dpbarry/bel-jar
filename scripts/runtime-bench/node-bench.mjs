// The Beluga runtime benchmark, in Node: the JS build (stable), the Wasm builds
// (wasm, wasm-cps), and any other build named by path (an older build, a build
// still in Beluga-W/_build). `npm run bench:runtime` (docs/wasm-runtime.md).
//
//   node scripts/runtime-bench/node-bench.mjs [--builds a,b,name=kind:path] [--passes 4]
//        [--only boot,cold,passes,depth,size] [--out results/runtime-bench/node.json]
//
// Every measurement runs in its own child process, one build at a time, never
// two side by side (CPU contention fakes differences). A child that overflows,
// crashes or hangs is a result (its exit, its deadline), not a broken run.
//
//   boot    fresh process, read to a Beluga that takes calls (and memory after)
//   cold    fresh process, the FIRST check it ever runs, for three sizes of unit
//   passes  one process, the whole corpus N times: pass 1 pays the JIT, the
//           median of the rest is "warm"; every output's hash, to see each build
//           agree with itself and the others
//   depth   for each input family, the largest n each build checks before its
//           stack gives out, and what the failure looks like
//   size    bytes on disk, gzip -9, brotli at 11 and at the level that matches
//           what R2 actually sends today for the stable build
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync, constants as Z } from 'node:zlib';
import { loadBelugaRuntime, buildFiles, resolveBuild } from '../../tests/_beluga-runtime.mjs';
import { libraryUnits, DEPTH_FAMILIES, OVERFLOW_RE, root } from './corpus.mjs';

const SELF = fileURLToPath(import.meta.url);
const sha = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 12);

// Bytes R2 sent for the stable build (Content-Encoding: br), measured
// 2026-10-16 with curl from https://beljar-cdn.deanbarry.com/beluga_web.bc.js.
const R2_STABLE_WIRE_BYTES = 3866320;

// The cold-check units: small, medium, large.
const COLD_UNITS = ['examples/arith/arith.bel', 'examples/codatatypes/howes-method/howe-total.bel',
  'examples/poplmark-reloaded+ [sources.cfg]'];
const DEPTH_CAP = 1 << 16;
// A check slower than this is no use interactively: past it, a depth search stops.
const TIME_BUDGET_MS = 60000;

function parseBuildArg(s) {
  const eq = s.indexOf('=');
  if (eq < 0) return s;
  const name = s.slice(0, eq);
  const [kind, ...rest] = s.slice(eq + 1).split(':');
  return { name, kind, path: rest.join(':') };
}
const buildArg = (b) => (typeof b === 'string' ? b : `${b.name}=${b.kind}:${b.path}`);
const buildName = (b) => (typeof b === 'string' ? b : b.name);

// ── children ──────────────────────────────────────────────────────────────
function memory() {
  if (globalThis.gc) globalThis.gc();
  const m = process.memoryUsage();
  return { rssMB: +(m.rss / 1048576).toFixed(1), heapUsedMB: +(m.heapUsed / 1048576).toFixed(1),
    externalMB: +(m.external / 1048576).toFixed(1) };
}

function classify(out, threw) {
  if (threw) return OVERFLOW_RE.test(threw) ? 'overflow-thrown' : 'threw';
  if (out && out.ok) return 'ok';
  return OVERFLOW_RE.test(String(out && out.output)) ? 'overflow-reported' : 'failed';
}

async function child(task, build, arg) {
  const baseline = memory();
  const r = await loadBelugaRuntime(build);
  const B = r.Beluga;
  if (task === 'boot') return { bootMs: r.bootMs, memory: memory(), baseline };
  const units = libraryUnits();
  if (task === 'cold') {
    const u = units.find((x) => x.name === arg);
    const t = performance.now();
    const out = B.checkFromString(u.code);
    return { bootMs: r.bootMs, ms: performance.now() - t, ok: !!out.ok, hash: sha(out.output) };
  }
  if (task === 'passes') {
    const passes = Number(arg);
    const rows = units.map((u) => ({ name: u.name, bytes: u.bytes, ms: [], ok: [], hash: [] }));
    let peak = memory();
    for (let p = 0; p < passes; p++) {
      units.forEach((u, i) => {
        const t = performance.now();
        const out = B.checkFromString(u.code);
        rows[i].ms.push(+(performance.now() - t).toFixed(2));
        rows[i].ok.push(!!out.ok);
        rows[i].hash.push(sha(String(!!out.ok) + '\u0000' + out.output));
      });
      const m = memory();
      if (m.rssMB > peak.rssMB) peak = m;
    }
    return { bootMs: r.bootMs, rows, memory: { afterBoot: baseline, peak } };
  }
  if (task === 'depth') {
    const [family, n] = arg.split(':');
    const src = DEPTH_FAMILIES[family](Number(n));
    const t = performance.now();
    let out = null;
    let threw = null;
    try {
      out = B.checkFromString(src);
    } catch (e) {
      threw = (e && e.name ? e.name + ': ' : '') + (e && e.message ? e.message : String(e));
    }
    const verdict = classify(out, threw);
    return { verdict, ms: performance.now() - t, sample: verdict === 'ok' ? '' : String(threw || (out && out.output)).slice(0, 300) };
  }
  throw new Error('unknown task ' + task);
}

// ── parent ────────────────────────────────────────────────────────────────
function runChild(task, build, arg, timeoutMs = 3600000) {
  return new Promise((resolveRun) => {
    const p = spawn(process.execPath, ['--expose-gc', SELF, '--child', task, buildArg(build), String(arg ?? '')],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => p.kill(), timeoutMs);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code, signal) => {
      clearTimeout(timer);
      const line = out.split('\n').find((l) => l.startsWith('@@RESULT '));
      if (line) resolveRun(JSON.parse(line.slice(9)));
      else resolveRun({ verdict: signal ? 'timeout' : 'crashed', exit: code, signal, stderr: err.slice(-600) });
    });
  });
}

const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function sizeOf(build) {
  const files = buildFiles(build);
  const bytes = (fn) => files.reduce((n, f) => n + fn(readFileSync(f)).length, 0);
  const br = (q) => (buf) => brotliCompressSync(buf, { params: { [Z.BROTLI_PARAM_QUALITY]: q, [Z.BROTLI_PARAM_SIZE_HINT]: buf.length } });
  const out = { files: files.map((f) => f.slice(root.length + 1)), raw: bytes((b) => b), gzip9: bytes((b) => gzipSync(b, { level: 9 })) };
  for (let q = 1; q <= 11; q++) out['br' + q] = bytes(br(q));
  return out;
}

async function depthSearch(build, family, log) {
  const probes = [];
  const probe = async (n) => {
    const r = await runChild('depth', build, family + ':' + n, TIME_BUDGET_MS + 30000);
    const verdict = r.verdict === 'ok' && r.ms > TIME_BUDGET_MS ? 'slow' : r.verdict;
    probes.push({ n, verdict, ms: r.ms, sample: r.sample || r.stderr || '' });
    log(`  depth ${buildName(build)} ${family} n=${n}: ${verdict}${r.ms ? ' ' + Math.round(r.ms) + 'ms' : ''}`);
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

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--child') {
    const [, task, build, arg] = argv;
    const res = await child(task, parseBuildArg(build), arg);
    process.stdout.write('@@RESULT ' + JSON.stringify(res) + '\n');
    return;
  }
  const opt = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : dflt; };
  const builds = opt('builds', 'stable,wasm,wasm-cps').split(',').map(parseBuildArg);
  const passes = Number(opt('passes', '4'));
  const only = new Set(opt('only', 'size,boot,cold,passes,depth').split(','));
  const outPath = join(root, opt('out', 'results/runtime-bench/node.json'));
  const log = (s) => process.stderr.write(s + '\n');
  const save = (data) => { mkdirSync(dirname(outPath), { recursive: true }); writeFileSync(outPath, JSON.stringify(data, null, 1)); };

  let prev = {};
  try { prev = JSON.parse(readFileSync(outPath, 'utf8')); } catch { /* first run */ }
  const results = { ...prev, node: process.version, v8: process.versions.v8, date: new Date().toISOString(),
    builds: { ...(prev.builds || {}) } };
  for (const b of builds) {
    const name = buildName(b);
    const entry = results.builds[name] = { ...(results.builds[name] || {}), path: relative(root, resolveBuild(b).path).split('\\').join('/') };
    if (only.has('size')) { entry.size = sizeOf(b); log(`${name} size raw ${entry.size.raw}`); save(results); }
    if (only.has('boot')) {
      entry.boot = [];
      for (let i = 0; i < 9; i++) entry.boot.push(await runChild('boot', b));
      log(`${name} boot median ${median(entry.boot.map((x) => x.bootMs)).toFixed(0)} ms`);
      save(results);
    }
    if (only.has('cold')) {
      entry.cold = {};
      for (const u of COLD_UNITS) {
        entry.cold[u] = [];
        for (let i = 0; i < 3; i++) entry.cold[u].push(await runChild('cold', b, u));
        log(`${name} cold ${u}: ${entry.cold[u].map((x) => Math.round(x.ms)).join(', ')} ms`);
      }
      save(results);
    }
    if (only.has('passes')) {
      entry.passes = await runChild('passes', b, passes);
      const rows = entry.passes.rows || [];
      const first = rows.reduce((n, r) => n + r.ms[0], 0);
      const warm = rows.reduce((n, r) => n + median(r.ms.slice(1)), 0);
      log(`${name} corpus: first pass ${(first / 1000).toFixed(1)} s, warm ${(warm / 1000).toFixed(1)} s`);
      save(results);
    }
    if (only.has('depth')) {
      entry.depth = {};
      for (const family of Object.keys(DEPTH_FAMILIES)) {
        entry.depth[family] = await depthSearch(b, family, log);
        save(results);
      }
    }
  }
  results.r2StableWireBytes = R2_STABLE_WIRE_BYTES;
  save(results);
  log('wrote ' + outPath);
}

main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
