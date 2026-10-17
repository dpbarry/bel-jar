// Do the runtime builds SAY the same things? A faster checker that says
// something different is a regression, so every build replays one transcript
// and each answer is compared, byte for byte, with the stable build's (the
// oracle). `npm run diff:runtime` (docs/wasm-runtime.md).
//
//   node scripts/runtime-bench/differential.mjs [--builds wasm,wasm-cps,name=kind:path]
//        [--out results/runtime-bench/differential.json]
//
// One long-lived instance per build, as the app's worker is, each in its own
// child process. The transcript:
//   A  every library unit through checkFromString
//   B  the same units in the notation the editor writes (⊢ → ⇒): multi-byte text,
//      and every location after it, through the JS boundary
//   C  the REPL session per unit: loadFromString, decl types, types at positions,
//      hole counts; then a load that FAILS (the session must roll back and still
//      answer as before), then a check (must not touch the committed session)
//   D  edge strings: empty, a lone surrogate, CRLF
//   E  after a stack overflow, does the instance still answer as it did?
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBelugaRuntime } from '../../tests/_beluga-runtime.mjs';
import { libraryUnits, DEPTH_FAMILIES, OVERFLOW_RE, root } from './corpus.mjs';

const SELF = fileURLToPath(import.meta.url);
const LIMIT = Number(process.env.BELJAR_DIFF_LIMIT || 0);
const BROKEN = '\nrec __broken__ : [ |- __nope__] = ?;\n';

function parseBuildArg(s) {
  const eq = s.indexOf('=');
  if (eq < 0) return s;
  const [kind, ...rest] = s.slice(eq + 1).split(':');
  return { name: s.slice(0, eq), kind, path: rest.join(':') };
}
const buildArg = (b) => (typeof b === 'string' ? b : `${b.name}=${b.kind}:${b.path}`);
const buildName = (b) => (typeof b === 'string' ? b : b.name);

const glyphs = (code) => code.replace(/\|-/g, '⊢').replace(/->/g, '→').replace(/=>/g, '⇒');

// Top-level names, and a position on each (1-based line, the column of the name).
function declSites(code) {
  const sites = [];
  code.split('\n').forEach((line, i) => {
    const m = /^(rec|LF|inductive|coinductive|stratified|proof|let|schema)\s+([^\s:=]+)/.exec(line);
    if (m) sites.push({ name: m[2], line: i + 1, col: line.indexOf(m[2], m[1].length) + 1 });
  });
  return sites;
}

async function transcript(build) {
  const { Beluga: B } = await loadBelugaRuntime(build);
  const rec = [];
  const say = (step, unit, what, value) => rec.push({ step, unit, what, value: String(value) });
  const guard = (fn) => {
    try { return fn(); } catch (e) { return { thrown: (e && e.name ? e.name + ': ' : '') + (e && e.message || String(e)) }; }
  };
  const show = (r) => (r && r.thrown ? 'THREW ' + r.thrown : r && typeof r === 'object'
    ? JSON.stringify({ ok: r.ok === true || r.ok === 1, output: String(r.output), ...(r.fingerprint != null ? { fingerprint: String(r.fingerprint) } : {}) })
    : String(r));
  // --limit n: the first n units only (a smoke run of the harness itself).
  const units = LIMIT ? libraryUnits().slice(0, LIMIT) : libraryUnits();

  for (const u of units) say('A', u.name, 'check', show(guard(() => B.checkFromString(u.code))));
  for (const u of units) say('B', u.name, 'check glyphs', show(guard(() => B.checkFromString(glyphs(u.code)))));

  for (const u of units) {
    const sites = declSites(u.code);
    const loaded = guard(() => B.loadFromString(u.code));
    say('C', u.name, 'load', show(loaded));
    say('C', u.name, 'fingerprint', show(guard(() => B.getCommittedFingerprint())));
    const ask = (tag) => {
      for (const s of sites.slice(0, 12)) {
        say('C', u.name, tag + ' declType ' + s.name, show(guard(() => B.ideDeclType(s.name))));
        say('C', u.name, tag + ' typeAt ' + s.line + ':' + s.col, show(guard(() => B.ideTypeAtJson(s.line, s.col))));
      }
      say('C', u.name, tag + ' countholes', show(guard(() => B.runCommand('%:countholes'))));
      say('C', u.name, tag + ' commandJson', show(guard(() => B.ideCommandJson('%:countholes'))));
    };
    ask('after load');
    say('C', u.name, 'broken load', show(guard(() => B.loadFromString(u.code + BROKEN))));
    say('C', u.name, 'fingerprint after broken', show(guard(() => B.getCommittedFingerprint())));
    ask('after broken');
    guard(() => B.checkFromString(u.code + BROKEN));
    say('C', u.name, 'fingerprint after check', show(guard(() => B.getCommittedFingerprint())));
  }

  const edges = { empty: '', 'lone surrogate': 'LF a : type.\n\uD800\n', 'crlf': units[0].code.replace(/\n/g, '\r\n'),
    'unicode names': 'LF ⊤ : type =\n| tt : ⊤\n;\nLF ∧ : ⊤ → ⊤ → type =\n;\nlet x : [ ⊢ ⊤] = [ ⊢ ff];\n' };
  for (const [name, src] of Object.entries(edges)) say('D', name, 'check', show(guard(() => B.checkFromString(src))));

  // E: overflow, then the first units again; compared with this build's own A.
  const deep = guard(() => B.checkFromString(DEPTH_FAMILIES.term(1000)));
  const overflowed = !!(deep.thrown ? OVERFLOW_RE.test(deep.thrown) : !deep.ok && OVERFLOW_RE.test(String(deep.output)));
  say('E', 'term 1000', 'overflowed (build-specific, not compared)', overflowed);
  const again = units.slice(0, 20).map((u) => show(guard(() => B.checkFromString(u.code))));
  const before = rec.filter((r) => r.step === 'A').slice(0, 20).map((r) => r.value);
  say('E', 'first 20 units', 'same answers after the overflow as before it', again.every((v, i) => v === before[i]));
  return rec;
}

function runChild(build) {
  return new Promise((resolveRun, reject) => {
    const p = spawn(process.execPath, ['--max-old-space-size=8192', SELF, '--child', buildArg(build)], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', (code) => {
      const i = out.indexOf('@@RESULT ');
      if (i < 0) return reject(new Error(buildName(build) + ' exited ' + code + ' without a transcript'));
      resolveRun(JSON.parse(out.slice(i + 9)));
    });
  });
}

function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return { at: i, oracle: JSON.stringify(a.slice(Math.max(0, i - 60), i + 120)), build: JSON.stringify(b.slice(Math.max(0, i - 60), i + 120)) };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--child') {
    const rec = await transcript(parseBuildArg(argv[1]));
    process.stdout.write('@@RESULT ' + JSON.stringify(rec) + '\n');
    return;
  }
  const opt = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : dflt; };
  const builds = opt('builds', 'wasm,wasm-cps').split(',').map(parseBuildArg);
  if (opt('limit')) process.env.BELJAR_DIFF_LIMIT = opt('limit');
  const outPath = join(root, opt('out', 'results/runtime-bench/differential.json'));
  const t0 = Date.now();
  process.stderr.write('oracle: stable ...\n');
  const oracle = await runChild('stable');
  const report = { date: new Date().toISOString(), records: oracle.length, builds: {} };
  for (const b of builds) {
    process.stderr.write(buildName(b) + ' ...\n');
    const rec = await runChild(b);
    const diffs = [];
    const byStep = {};
    rec.forEach((r, i) => {
      const o = oracle[i];
      const s = byStep[r.step] = byStep[r.step] || { same: 0, different: 0 };
      if (r.step === 'E' && /not compared/.test(r.what)) return;
      if (!o || o.unit !== r.unit || o.what !== r.what) { s.different++; diffs.push({ i, step: r.step, unit: r.unit, what: r.what, misaligned: true }); return; }
      if (o.value === r.value) s.same++;
      else { s.different++; diffs.push({ i, step: r.step, unit: r.unit, what: r.what, ...firstDiff(o.value, r.value) }); }
    });
    const overflow = rec.find((r) => r.step === 'E' && /overflowed/.test(r.what));
    report.builds[buildName(b)] = { byStep, differences: diffs.length, overflowedOnTerm1000: overflow && overflow.value,
      sample: diffs.slice(0, 25), records: rec.length };
    process.stderr.write(`  ${buildName(b)}: ${diffs.length} differences of ${rec.length} (${JSON.stringify(byStep)})\n`);
  }
  const oracleOverflow = oracle.find((r) => r.step === 'E' && /overflowed/.test(r.what));
  report.oracleOverflowedOnTerm1000 = oracleOverflow && oracleOverflow.value;
  report.seconds = Math.round((Date.now() - t0) / 1000);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 1));
  process.stderr.write('wrote ' + outPath + '\n');
  process.exit(Object.values(report.builds).some((b) => b.differences) ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack || e); process.exit(2); });
