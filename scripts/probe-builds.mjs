// Settings > Beluga > Build version, in the real editor (docs/wasm-runtime.md): a
// fresh editor runs on the default, Wasm CPS; the row offers every build that works
// here; and choosing each one runs the editor on it.
//
//   npm run probe:builds
//
// For each build, chosen by clicking it in the row's dropdown: the setting and the
// client agree; the page's workers load that build's file (every slot runs it); a
// clean file checks, a broken one does not, word for word as Stable says it, and a
// deep one answers as the build should (a Wasm overflow exactly as Stable's).
import { openProbe } from './probe-harness.mjs';
import { DEPTH_FAMILIES } from './runtime-bench/corpus.mjs';
import { readFileSync } from 'node:fs';

const P = await openProbe({
  port: Number(process.env.PROBE_PORT || 8885),
  waitFor: () => window.Commands && window.StatusStrip && window.BelugaClient && window.SettingsUI && window.BelugaRun,
});
const { page, check, wait } = P;

const CLEAN = readFileSync('library/data/examples/arith/arith.bel', 'utf8');
const BROKEN = CLEAN + '\nrec broken : [ |- nat] = [ |- nonsense];\n';
const DEEP = DEPTH_FAMILIES.term(1000);
const FILES = { stable: 'beluga_web.bc.js', wasm: 'beluga_web_wasm.bc.wasm.js', 'wasm-cps': 'beluga_web_wasm_cps.bc.wasm.js' };
// The names the row shows (ids are what the device stores: `stable` is JS CPS).
const LABELS = { 'wasm-cps': 'Wasm CPS', wasm: 'Wasm direct', stable: 'JS CPS' };

// The row, as the page draws it: its trigger, and the options its panel lists.
async function openRow() {
  await page.evaluate(() => window.SettingsUI.open('beluga'));
  await wait(400);
  const trigger = await page.evaluateHandle(() => {
    const row = [...document.querySelectorAll('.jar-dialog__setting')]
      .find((r) => r.querySelector('.jar-dialog__setting-label')?.textContent === 'Build version');
    return row ? row.querySelector('.jar-dropdown__trigger') : null;
  });
  return trigger.asElement();
}
async function chooseInRow(label) {
  const trigger = await openRow();
  await trigger.click();
  await wait(200);
  const options = await page.evaluate(() => [...document.querySelectorAll('.jar-dropdown__panel .jar-dropdown__option')]
    .filter((o) => o.offsetParent !== null).map((o) => o.textContent.trim()));
  if (label) {
    const handle = await page.evaluateHandle((l) => [...document.querySelectorAll('.jar-dropdown__panel .jar-dropdown__option')]
      .find((o) => o.offsetParent !== null && o.textContent.trim() === l), label);
    await handle.asElement().click();
    await wait(300);
  }
  await page.keyboard.press('Escape');
  await wait(300);
  return options;
}

// What the page's Beluga workers were started on (their ?script=).
const workerScripts = () => [...new Set(page.workers().map((w) => w.url()).filter((u) => /beluga-worker\.js/.test(u))
  .map((u) => decodeURIComponent(new URL(u).searchParams.get('script') || '').replace(/^.*\//, '').replace(/\?.*$/, '')))];

const exercise = () => page.evaluate(async (clean, broken, deep) => {
  const C = window.BelugaClient;
  const t0 = performance.now();
  const a = await C.checkResult(clean);
  const firstMs = performance.now() - t0;
  const b = await C.checkResult(broken);
  const d = await C.checkResult(deep);
  const loaded = await C.load(clean);
  const holes = await C.run('%:countholes');
  return { clean: a, broken: b, deep: d, loaded, holes, firstMs, build: C.getBuild() };
}, CLEAN, BROKEN, DEEP);

let crash = null;
try {
  // A fresh editor, nothing chosen: the default.
  console.log('\n[default]');
  const fresh = await page.evaluate(() => ({ setting: window.Settings.get('belugaMode'), build: window.BelugaClient.getBuild() }));
  check(fresh.setting === 'wasm-cps' && fresh.build === 'wasm-cps', `a fresh editor runs Wasm CPS (${fresh.setting}, ${fresh.build})`);
  const first = await exercise();
  check(first.clean.ok === true && workerScripts().join() === FILES['wasm-cps'],
    `and its workers load ${FILES['wasm-cps']} (${workerScripts().join(', ')}; first check ${Math.round(first.firstMs)} ms)`);

  // The Run bar's estimate is the build's own (repl/run-progress.mjs): Wasm CPS is
  // not expected to take as long as the old JS build did.
  const estimate = await page.evaluate(() => ({ now: window.RunProgress.estimateMs(300), stable: window.RunProgress.estimateMs(300, 'stable') }));
  check(estimate.now < 1000 && estimate.now < estimate.stable,
    `the Run bar expects 300 lines on Wasm CPS in ${Math.round(estimate.now)} ms, on Stable in ${Math.round(estimate.stable)} ms`);

  const offered = await chooseInRow(null);
  check(offered.join('|') === 'Wasm CPS|Wasm direct|JS CPS', `the row offers every build, the default first (${offered.join(', ')})`);

  // The row's info button says what each build is, CPS included.
  await page.evaluate(() => window.SettingsUI.open('beluga'));
  await wait(400);
  const info = await page.evaluateHandle(() => {
    const row = [...document.querySelectorAll('.jar-dialog__setting')]
      .find((r) => r.querySelector('.jar-dialog__setting-label')?.textContent === 'Build version');
    return row ? row.querySelector('.jar-setting-info') : null;
  });
  check(!!info.asElement(), 'the row has an info button');
  if (info.asElement()) {
    await info.asElement().hover();
    await wait(400);
    const help = await page.evaluate(() => {
      const pop = [...document.querySelectorAll('.jar-setting-info-popover')].find((p) => !p.hidden);
      return pop ? pop.textContent : '';
    });
    check(/continuation-passing style \(CPS\)/.test(help) && /Wasm CPS/.test(help) && /Wasm direct/.test(help) && /JS CPS/.test(help) && !/Stable/.test(help),
      `and its popover explains every build offered, CPS by name (${help.length} chars)`);
    await P.shot('build-version-help');
  }
  await page.keyboard.press('Escape');
  await wait(300);
  const stableAnswer = {};

  for (const build of ['stable', 'wasm', 'wasm-cps']) {
    console.log(`\n[${build}]`);
    await chooseInRow(LABELS[build]);
    const state = await page.evaluate(() => ({ setting: window.Settings.get('belugaMode'), mode: window.BelugaRun.getBelugaMode(), build: window.BelugaClient.getBuild() }));
    check(state.setting === build && state.mode === build && state.build === build, `choosing ${LABELS[build]} sets the setting and the client (${state.setting}, ${state.build})`);

    const r = await exercise();
    const scripts = workerScripts();
    check(scripts.includes(FILES[build]), `the page's Beluga workers load ${FILES[build]} (${scripts.join(', ')})`);
    check(r.clean.ok === true, `a clean file checks (first check ${Math.round(r.firstMs)} ms, booting included)`);
    check(r.broken.ok === false && /line \d+, column \d+\nError: /.test(r.broken.output),
      `a broken one does not, and says where and why (${JSON.stringify(r.broken.output.split('\n').slice(0, 2).join(' / '))})`);
    check(typeof r.loaded === 'string' && /Type Reconstruction done/.test(r.loaded), 'a load runs on it');
    check(typeof r.holes === 'string', `and a command (${JSON.stringify(r.holes.slice(0, 40))})`);
    if (build === 'stable') stableAnswer.broken = r.broken.output;
    else check(r.broken.output === stableAnswer.broken, 'its error is word for word Stable\'s');
    if (build === 'wasm') {
      check(r.deep.ok === false && r.deep.output === 'Stack overflow\n',
        `a deep file overflows, answered exactly as Stable answers an overflow (${JSON.stringify(r.deep)})`);
    } else {
      check(r.deep.ok === true, 'a deep file checks (a CPS build)');
    }
  }
  check(await page.evaluate(() => window.Settings.get('belugaMode') === 'wasm-cps'), 'and back on the default');
} catch (e) {
  crash = e;
}
await P.finish('probe-builds', crash);
