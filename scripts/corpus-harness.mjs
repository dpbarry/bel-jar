// corpus-harness.mjs — LIVE driver. Reads a plan (scripts/corpus-plan.mjs),
// launches ONE headless Chrome, and for every maskable target: prechecks the
// unmasked program, masks its body to `?`, and asks BelJar's prover to
// re-derive it against the real Beluga checker. One JSONL line per target,
// appended immediately (crash-safe + resumable). Manual/nightly, like
// prover:probe — NEVER run two Chromes at once.
//
//   node scripts/corpus-harness.mjs [--plan <file>] [--corpus <root>]
//        [--only <substr>] [--limit N] [--force] [--per-target-ms N]
//
// Defaults: plan = results/corpus/<corpus>-plan.json (from --corpus, default
// tests/heldout-corpus); output JSONL alongside it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; }
function flag(name) { return args.includes(name); }

const corpusRel = arg('--corpus', 'tests/heldout-corpus');
const corpusId = corpusRel.replace(/[\\/]/g, '-').replace(/[^A-Za-z0-9._-]/g, '');
const planFile = arg('--plan', path.join('results', 'corpus', `${corpusId}-plan.json`));
const jsonlFile = arg('--out', path.join('results', 'corpus', `${corpusId}.jsonl`));
const only = arg('--only', null);
const limit = Number(arg('--limit', '0')) || 0;
const force = flag('--force');
const perTargetMs = Number(arg('--per-target-ms', '60000')) || 60000;
const port = Number(process.env.CORPUS_PORT || 8822);
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const plan = JSON.parse(fs.readFileSync(path.resolve(root, planFile), 'utf8'));

// Resumable cache: skip a target already recorded with the same engine sha,
// assembled program, and step budget.
fs.mkdirSync(path.dirname(path.resolve(root, jsonlFile)), { recursive: true });
const doneKeys = new Set();
if (fs.existsSync(path.resolve(root, jsonlFile)) && !force) {
  for (const line of fs.readFileSync(path.resolve(root, jsonlFile), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      doneKeys.add(`${r.id}|${r.assembledSha}|${r.engineGitSha}|${r.maxSteps}`);
    } catch { /* ignore malformed line */ }
  }
}
function appendResult(rec) {
  fs.appendFileSync(path.resolve(root, jsonlFile), JSON.stringify(rec) + '\n');
}

// Reassemble each program's full source once (needed to mask + precheck).
// maskByName is the SHARED masker (self-contained; unit-tested in
// tests/test-corpus-decls.mjs) — its source is injected into the page below so
// the browser runs the exact function the tests pin.
import { assembleCfgProgram, maskByName } from '../js/editor-src/prover/prover-corpus-decls.mjs';
function assembleProgram(prog) {
  const corpusRoot = path.resolve(root, plan.corpusRoot);
  if (prog.cfg) {
    const cfgAbs = path.resolve(root, prog.cfg);
    const dir = path.dirname(cfgAbs);
    const cfgText = fs.readFileSync(cfgAbs, 'utf8');
    return assembleCfgProgram(cfgText, (name) => {
      const p = path.join(dir, name);
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    }).code;
  }
  // singleton .bel
  const belAbs = path.join(corpusRoot, prog.programId);
  const name = path.basename(belAbs);
  const text = fs.readFileSync(belAbs, 'utf8');
  return assembleCfgProgram(name, (n) => (n === name ? text : null)).code;
}

// ── static COOP/COEP server (identical to prover-probes) ────────────────────
execFileSync(process.execPath, ['scripts/build-editor.mjs'], { cwd: root, stdio: 'inherit' });
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(root, p), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(port, r));

// protocolTimeout must comfortably exceed the per-target budget but stay SMALL:
// a wedged page turns every protocol call into a full protocolTimeout wait, so
// 590s converted one bad page into a multi-hour FAIL cascade (2026-07-12).
const puppeteer = (await import(pathToFileURL(path.join(root, 'node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).href)).default;
const protocolTimeout = perTargetMs + 60000;
async function launchBrowser() {
  return puppeteer.launch({
    executablePath: chrome, headless: 'new', protocolTimeout,
    args: ['--window-size=1200,800'], defaultViewport: { width: 1200, height: 800 },
  });
}
let browser = await launchBrowser();

async function freshPage() {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => !!window.BelJarCurrentEditor && !!window.BelugaClient, { timeout: 30000 });
  await page.waitForFunction(() => !!(window.BelJarEditor && window.BelJarEditor.proveProgram), { timeout: 15000 });
  await page.evaluate(async () => { if (window.BelugaClient.beginProverSession) await window.BelugaClient.beginProverSession(); });
  return page;
}

// Rebuild the page after ANY wedging outcome; if the page can't even be
// rebuilt (browser-level wedge), relaunch the whole browser. Never let one
// bad target poison the rest of the sweep. EVERY step here carries a hard
// deadline: on a crashed browser, close()/newPage() can await forever
// (protocolTimeout does not cover them) — recovery hung 25 min on exactly
// that before these races existed (2026-07-12).
function withDeadline(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label}: deadline`)), ms)),
  ]);
}
async function recoverPage(page) {
  try { await withDeadline(page.close(), 15000, 'page.close'); } catch { /* ignore */ }
  try {
    return await withDeadline(freshPage(), 120000, 'freshPage');
  } catch {
    try { await withDeadline(browser.close(), 15000, 'browser.close'); } catch { /* ignore */ }
    try { const p = browser.process(); if (p) p.kill(); } catch { /* ignore */ }
    browser = await launchBrowser();
    return freshPage();
  }
}

// Enumerate the work list.
const work = [];
for (const prog of plan.programs) {
  const assembled = assembleProgram(prog);
  const assembledSha = shaOf(assembled);
  for (const t of prog.targets) {
    if (only && !t.id.includes(only)) continue;
    const key = `${t.id}|${assembledSha}|${plan.engineGitSha}|${t.maxSteps}`;
    if (doneKeys.has(key)) continue;
    work.push({ prog, assembled, assembledSha, target: t });
    if (limit && work.length >= limit) break;
  }
  if (limit && work.length >= limit) break;
}

function shaOf(text) { let h = 5381; const s = String(text); for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16); }

console.log(`harness: ${work.length} target(s) to run (${doneKeys.size} cached)`);
let page = await freshPage();
const precheckCache = new Map(); // assembledSha -> ok

try {
  for (let w = 0; w < work.length; w += 1) {
    const { prog, assembled, assembledSha, target } = work[w];
    const base = {
      id: target.id, name: target.name, program: prog.programId, corpusId: plan.corpusId,
      engineGitSha: plan.engineGitSha, assembledSha, maxSteps: target.maxSteps,
      premiseCount: target.premiseCount, hasCtxSchema: target.hasCtxSchema,
      conclusionForm: target.conclusionForm, ts: new Date().toISOString(),
    };

    // 1) Pre-flight: the UNMASKED program must type-check clean (once per program).
    // Guarded: a protocol-level hang here (wedged page/worker) must cost one
    // page rebuild, not the whole run.
    if (!precheckCache.has(assembledSha)) {
      const runPrecheck = async () => {
        try {
          return await page.evaluate(async (src) => {
            const cl = window.BelugaClient;
            try {
              const r = await (cl.checkResultForProver ? cl.checkResultForProver(src) : cl.checkResult(src));
              return { ok: !!(r && r.ok), out: (r && r.output || '').slice(0, 400) };
            } catch (e) { return { ok: false, out: String(e && e.message || e).slice(0, 400) }; }
          }, assembled);
        } catch (e) {
          page = await recoverPage(page);
          return { ok: false, out: `precheck hang: ${String(e && e.message || e).slice(0, 200)}` };
        }
      };
      let pre = await runPrecheck();
      if (!pre.ok) {
        // A failing precheck must be CONFIRMED on a fresh page before being
        // recorded: a poisoned/desynced worker replays a stale error for every
        // subsequent check (2026-07-12: 20 programs "failed" with the SAME
        // line/col — worker poisoning, not corpus issues).
        page = await recoverPage(page);
        pre = await runPrecheck();
      }
      precheckCache.set(assembledSha, pre.ok);
      if (!pre.ok) console.log(`  precheck FAIL: ${prog.programId} (${pre.out.replace(/\n/g, ' ').slice(0, 120)})`);
    }
    if (!precheckCache.get(assembledSha)) {
      appendResult({ ...base, outcome: 'PRECHECK_FAIL' });
      console.log(`[${w + 1}/${work.length}] ${target.id}: PRECHECK_FAIL`);
      continue;
    }

    // 2) Mask + prove with a per-target timeout.
    let res;
    try {
      res = await page.evaluate(async (src, tName, from, to, maxSteps, timeoutMs, maskSrc) => {
        const ed = window.BelJarEditor, cl = window.BelugaClient;
        // The shared masker (js/editor-src/prover-corpus-decls.mjs maskByName),
        // reconstituted from source — masks IN PLACE keeping `rec` + the body's
        // leading pragmas (`/ total … /` or `/ trust /`), comment-aware.
        const maskByName = (0, eval)(`(${maskSrc})`);
        // Orchestration: keep schemas + complete siblings, strip other holed decls,
        // then mask THIS decl's body to `?` and parse the goal.
        const orchestrated = ed.proveOrchestrationCode(src, tName, from, to, 0);
        // proveOrchestrationCode may shift offsets; re-find the decl by name in
        // the orchestrated text and mask its body there.
        const masked = maskByName(orchestrated, tName);
        if (!masked) return { outcome: 'FAIL', error: 'could not mask ' + tName };
        const thm = ed.theoremUnderProof(masked.declText);
        if (!thm) return { outcome: 'FAIL', error: 'could not parse theorem ' + tName };
        let checks = 0;
        const oracle = (x) => { checks += 1; return cl.checkResultForProver ? cl.checkResultForProver(x) : cl.checkResult(x); };
        const t0 = Date.now();
        const timeout = new Promise((r) => setTimeout(() => r({ __timeout: true }), timeoutMs));
        // requireProgress: this harness masked the body, so a COMPLETE with zero
        // accepted moves means the mask did not take — a false positive, not a proof
        // (master plan 52b; the 2026-07-29 ledger carried 52 such rows).
        const run = ed.proveProgram(masked.code, thm, oracle, { maxSteps, collectTrace: true, requireProgress: true })
          .then((r) => ({ r }))
          .catch((e) => ({ __err: String(e && e.message || e) }));
        const outcome = await Promise.race([run, timeout]);
        const ms = Date.now() - t0;
        if (outcome.__timeout) return { outcome: 'TIMEOUT', ms, checks };
        if (outcome.__err) return { outcome: 'FAIL', error: outcome.__err.slice(0, 300), ms, checks };
        const r = outcome.r;
        if (r.complete) {
          return { outcome: 'COMPLETE', ms, checks, steps: (r.steps || []).length,
            moveKinds: (r.steps || []).map((s) => s.move) };
        }
        return { outcome: 'STUCK', ms, checks, steps: (r.steps || []).length,
          reason: (r.stuck && (r.stuck.reason || r.stuck.kind)) || 'no-move',
          moveKinds: (r.steps || []).map((s) => s.move) };
      }, assembled, target.name, target.from, target.to, target.maxSteps, perTargetMs, maskByName.toString());
    } catch (e) {
      res = { outcome: 'FAIL', error: String(e && e.message || e).slice(0, 300) };
    }

    appendResult({ ...base, ...res });
    const tag = res.outcome + (res.outcome === 'STUCK' ? ` (${res.reason})` : '')
      + (res.checks != null ? ` [${res.checks} checks, ${((res.ms || 0) / 1000).toFixed(1)}s]` : '');
    console.log(`[${w + 1}/${work.length}] ${target.id}: ${tag}`);

    // A timeout leaves the in-page search running and the worker dirty; a FAIL
    // usually means the page itself wedged (protocol timeout). Either way the
    // page is not trustworthy for the next target — rebuild it (and the
    // browser too if the page won't come back).
    if (res.outcome === 'TIMEOUT' || res.outcome === 'FAIL') {
      page = await recoverPage(page);
      precheckCache.clear();
    }
  }
} finally {
  try { await browser.close(); } catch { /* ignore */ }
  server.close();
}
console.log(`\nwrote ${jsonlFile}`);
