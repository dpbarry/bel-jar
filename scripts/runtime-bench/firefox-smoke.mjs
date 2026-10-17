// Do the runtime builds run in Firefox, in a worker, and what does a stack
// overflow look like there? A smoke check, not a benchmark: the page and worker
// are chrome-bench.mjs's, driven over WebDriver BiDi.
//
//   node scripts/runtime-bench/firefox-smoke.mjs [--builds wasm,wasm-cps,stable]
//
// Firefox names an overflow "InternalError: too much recursion", not a RangeError:
// js/beluga/beluga-worker.js and beluga-client.js match that text too, and this
// shows which form each build produces.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { resolveBuild } from '../../tests/_beluga-runtime.mjs';
import { libraryUnits, DEPTH_FAMILIES, root } from './corpus.mjs';

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : dflt; };
function parseBuildArg(s) {
  const eq = s.indexOf('=');
  if (eq < 0) return s;
  const [kind, ...rest] = s.slice(eq + 1).split(':');
  return { name: s.slice(0, eq), kind, path: rest.join(':') };
}
const builds = opt('builds', 'wasm,wasm-cps,stable').split(',').map(parseBuildArg).map(resolveBuild);
const firefox = process.env.FIREFOX_PATH || 'C:/Program Files/Mozilla Firefox/firefox.exe';
const port = Number(process.env.PROBE_PORT || 8883);
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.wasm': 'application/wasm' };
const byName = new Map(builds.map((b) => [b.name, b]));

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const m = /^\/__rt\/([^/]+)\/(.+)$/.exec(url);
  const file = m && byName.has(m[1]) ? path.join(path.dirname(byName.get(m[1]).path), m[2]) : path.join(root, url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(port, r));

const puppeteer = (await import('../../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default;
const browser = await puppeteer.launch({ browser: 'firefox', executablePath: firefox, headless: true, protocolTimeout: 300000 });
const failures = [];
try {
  console.log('Firefox', await browser.version());
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/scripts/runtime-bench/bench.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.bench);
  const units = libraryUnits();
  const pick = ['examples/arith/arith.bel', 'examples/poplmark-reloaded+ [sources.cfg]'].map((n) => units.find((u) => u.name === n));
  let key = 0;
  for (const b of builds) {
    const pb = { kind: b.kind, url: '/__rt/' + b.name + '/' + path.basename(b.path) };
    const k = String(++key);
    let booted;
    try {
      booted = await page.evaluate((kk, p) => window.bench.boot(kk, p), k, pb);
    } catch (e) {
      failures.push(b.name + ' did not boot: ' + (e && e.message));
      console.log(`${b.name}: BOOT FAILED ${e && e.message}`);
      continue;
    }
    const line = [`${b.name}: boot ${Math.round(booted.pageNewWorkerToReadyMs)} ms`];
    for (const u of pick) {
      const r = await page.evaluate((kk, c) => window.bench.check(kk, c), k, u.code);
      line.push(`${u.name.split('/').pop()} ${r.error ? 'ERROR ' + r.error : (r.ok ? 'ok' : 'not ok') + ' ' + Math.round(r.ms) + ' ms #' + r.hash}`);
      if (r.error) failures.push(b.name + ' ' + u.name + ': ' + r.error);
    }
    const deep = await page.evaluate((kk, c) => window.bench.check(kk, c, 120000), k, DEPTH_FAMILIES.term(1000));
    line.push('term 1000: ' + (deep.error ? 'ERROR ' + deep.error : deep.threw ? 'THROWN ' + deep.threw : (deep.ok ? 'ok' : 'reported: ' + deep.output.split('\n')[0]) + ' ' + Math.round(deep.ms) + ' ms'));
    const after = await page.evaluate((kk, c) => window.bench.check(kk, c), k, pick[0].code);
    line.push('then arith ' + (after.ok ? 'ok #' + after.hash : 'NOT OK ' + (after.error || after.threw || after.output)));
    if (!after.ok) failures.push(b.name + ' is not sane after the deep check');
    console.log(line.join('\n   '));
    await page.evaluate((kk) => window.bench.stop(kk), k);
  }
} finally {
  await browser.close();
  server.close();
}
if (failures.length) { console.log('\nFAILED:\n - ' + failures.join('\n - ')); process.exit(1); }
console.log('\nfirefox-smoke: ALL OK');
