// BEHAVIOURAL + VISUAL probe for case completion (docs/case-completion.md): a proof by
// induction missing cases has them filled in the background and drawn as faint arms.
//
// What Node cannot see, and this drives in real Chrome with real keys:
//   - the ghosts arrive with no interaction at all, from the real checker and the real
//     worker, while the main thread stays free (long tasks are measured);
//   - typing in the proof drops them at once, and they come back once typing settles;
//   - accepting by Tab, by the palette, by Emacs `C-c a` and by Vim `<leader>a`, each one
//     undo step;
//   - a proof with no termination measure shows nothing until a fill is forced;
//   - a forced fill that finds nothing says so; an automatic one stays silent.
// Screenshots in both themes (docs/UI.md §6) go to scripts/.shots/case-fill-*.png.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const port = Number(process.env.PROBE_PORT || 8871);
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir = path.join(root, 'scripts', '.shots');
fs.mkdirSync(outDir, { recursive: true });
execFileSync(process.execPath, ['scripts/build-editor.mjs'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/build-shell.mjs'], { cwd: root, stdio: 'inherit' });

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

const puppeteer = (await import('../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default;
const browser = await puppeteer.launch({
  executablePath: chrome, headless: 'new', protocolTimeout: 590000,
  args: ['--window-size=1200,1000'], defaultViewport: { width: 1200, height: 1000, deviceScaleFactor: 2 },
});

// The fixtures are written as the editor holds them: alias expansion is greedy by default,
// so a person's file reads `⊢`, `→`, `⇒`. Seeding them already expanded also keeps the
// expansion from adding an undo step of its own.
const uni = (t) => t.replace(/\|-/g, '⊢').replace(/->/g, '→').replace(/=>/g, '⇒');

// Type preservation with two of its three cases missing: the lookup fills `e_pred` from
// `e_succ`; Orca fills `e_pred_z`. The same fixture as tests/test-case-fill.mjs.
const SIG = `LF tm : type = | z : tm | succ : tm -> tm | pred : tm -> tm;
LF tp : type = | nat : tp;
LF oft : tm -> tp -> type =
| t_z : oft z nat
| t_succ : oft M nat -> oft (succ M) nat
| t_pred : oft M nat -> oft (pred M) nat;
LF step : tm -> tm -> type =
| e_succ : step M M' -> step (succ M) (succ M')
| e_pred : step M M' -> step (pred M) (pred M')
| e_pred_z : step (pred z) z;
`;
const PRAGMA = '/ total s (tps m n t s) /';
const TPS = uni(`${SIG}
rec tps : [ |- step M N] -> [ |- oft M T] -> [ |- oft N T] =
${PRAGMA}
fn s => fn d => case s of
| [ |- e_succ S] =>
  let [ |- t_succ D] = d in
  let [ |- D'] = tps [ |- S] [ |- D] in
  [ |- t_succ D']
;
`);
const UNTOTALIED = TPS.replace(PRAGMA, '% no termination measure');
const LAST_ARM_LINE = uni("  [ |- t_succ D']");
const IN_PROOF = TPS.indexOf('fn s ');

// A case nothing can fill: `bool` is not a nat.
const ALLNAT = uni(`LF tp : type = | nat : tp | bool : tp;
LF isnat : tp -> type = | is_nat : isnat nat;

rec allnat : {T : [ |- tp]} [ |- isnat T] =
/ total t (allnat t) /
mlam T => case [ |- T] of
| [ |- nat] => [ |- is_nat]
;
`);

const fails = [];
const ok = (cond, msg, extra) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + msg + (extra !== undefined && !cond ? `  ${JSON.stringify(extra)}` : ''));
  if (!cond) fails.push(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => { fails.push('page error: ' + e.message); console.log('  PAGEERROR ' + e.message); });
  // Long tasks from the first moment, so the window the worker runs in can be read back.
  await page.evaluateOnNewDocument(() => {
    window.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__longTasks.push({ start: e.startTime, dur: e.duration });
      }).observe({ type: 'longtask', buffered: true });
    } catch (_) { /* no long-task timing: the check below reports it */ }
  });
  await page.goto(`http://localhost:${port}/edit.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => !!(window.CurrentEditor && window.BelugaClient && window.Commands && window.Settings),
    { timeout: 40000 });
  await page.evaluate(() => { Settings.set('keymapStyle', 'default'); Settings.set('caseFill', 'auto'); BelEditor.applyEditorPrefs?.(); });

  const seed = (text, caret) => page.evaluate((t, c) => {
    const v = CurrentEditor.getView();
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t }, selection: { anchor: Math.min(c, t.length) } });
    return performance.now();
  }, text, caret);
  const ghosts = () => page.evaluate(() => [...document.querySelectorAll('.cm-case-ghost__row')].map((r) => ({
    state: r.dataset.state, key: r.dataset.key, text: r.textContent, tip: r.getAttribute('data-tooltip') || '',
  })));
  const docText = () => page.evaluate(() => CurrentEditor.getView().state.doc.toString());
  const caretTo = (offset) => page.evaluate((o) => {
    const v = CurrentEditor.getView();
    v.focus();
    v.dispatch({ selection: { anchor: o } });
  }, offset);
  const waitFilled = (n, timeout = 150000) => page.waitForFunction(
    (k) => document.querySelectorAll('.cm-case-ghost__row[data-state="filled"]').length >= k,
    { timeout, polling: 200 }, n);
  const toasts = () => page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent.trim()));
  const armsOf = (text) => text.split('\n').filter((l) => /^\| \[ ⊢ e_/.test(l)).map((l) => l.slice(0, 20));
  const lastArmEnd = (text) => text.indexOf(LAST_ARM_LINE) + LAST_ARM_LINE.length;

  // ── 1. Unasked: the missing cases arrive on their own ──────────────────────
  console.log('\n[auto] a totalied proof missing two cases');
  const t0 = await seed(TPS, 0);
  await sleep(150);
  ok((await docText()) === TPS, 'the seed is already in the notation the editor keeps');
  const started = Date.now();
  let arrived = true;
  try { await waitFilled(2); } catch (_) { arrived = false; }
  const tArrive = await page.evaluate(() => performance.now());
  const g1 = await ghosts();
  ok(arrived, `both cases are filled with no interaction (${((Date.now() - started) / 1000).toFixed(1)} s)`, g1);
  ok(g1.length === 2 && g1.every((g) => g.state === 'filled'), 'with the caret outside the proof, only filled cases show', g1);
  const pred = g1.find((g) => g.key === 'e_pred');
  const predZ = g1.find((g) => g.key === 'e_pred_z');
  ok(pred && /Filled from e_succ/.test(pred.tip), 'e_pred says where it came from', pred);
  ok(predZ && /Found by Orca/.test(predZ.tip), 'e_pred_z says Orca found it', predZ);
  ok(g1.every((g) => !/Coverage and termination/.test(g.tip)), 'a fully checked fill does not label its strength');
  ok((await toasts()).length === 0, 'nothing went right loudly: no toasts', await toasts());
  const long = await page.evaluate((a, b) => window.__longTasks.filter((t) => t.start > a + 2500 && t.start < b), t0, tArrive);
  const worst = long.reduce((m, t) => Math.max(m, t.dur), 0);
  console.log(`  long tasks while the worker ran: ${long.length}, worst ${Math.round(worst)} ms`);
  ok(worst < 200, 'the search never holds the main thread (no long task over 200 ms)', long);
  ok((await docText()) === TPS, 'nothing was written into the document');

  // Screenshots, both themes, with the caret in the proof.
  await caretTo(IN_PROOF);
  await sleep(300);
  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => {
      Settings.set('theme', t);
      window.dispatchEvent(new CustomEvent('beljar:settings-changed', { detail: { key: 'theme' } }));
    }, theme);
    await sleep(500);
    const box = await page.evaluate(() => {
      const r = document.querySelector('.cm-editor').getBoundingClientRect();
      return { x: r.x, y: r.y, width: Math.min(r.width, 900), height: Math.min(r.height, 520) };
    });
    await page.screenshot({ path: path.join(outDir, `case-fill-${theme}.png`), clip: box });
  }
  await page.evaluate(() => {
    Settings.set('theme', 'dark');
    window.dispatchEvent(new CustomEvent('beljar:settings-changed', { detail: { key: 'theme' } }));
  });

  // ── 2. Typing in the proof drops them; they come back once it settles ──────
  console.log('\n[typing] an edit inside the proof');
  await caretTo(IN_PROOF);
  await page.keyboard.type(' ');
  await sleep(50);
  ok((await ghosts()).length === 0, 'typing in the proof drops its ghosts at once');
  await page.keyboard.press('Backspace');
  let back = true;
  try { await waitFilled(2); } catch (_) { back = false; }
  ok(back, 'once typing settles, the cases are filled again');

  // ── 3. Accept: Tab, palette, Emacs, Vim; each one undo step ────────────────
  async function acceptAndUndo(label, press, undo) {
    console.log(`\n[accept] ${label}`);
    await caretTo(lastArmEnd(await docText()));
    await press();
    await sleep(250);
    const after = await docText();
    const arms = armsOf(after);
    ok(arms.length === 2 && arms.some((a) => a.startsWith('| [ ⊢ e_pred ')),
      `${label} puts e_pred into the proof, and only it`, arms);
    ok((await ghosts()).filter((g) => g.state === 'filled').length === 1, 'the other filled case is still offered');
    await undo();
    await sleep(250);
    ok((await docText()) === TPS, `one undo takes the ${label} accept back`);
    let again = true;
    try { await waitFilled(2); } catch (_) { again = false; }
    ok(again, 'and the cases are offered again');
  }

  await acceptAndUndo('Tab', () => page.keyboard.press('Tab'), async () => {
    await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
  });

  await acceptAndUndo('the palette', async () => {
    await page.evaluate(() => CommandPalette.open({ mode: 'commands' }));
    await sleep(300);
    await page.keyboard.type('Accept Filled Case');
    await sleep(300);
    await page.keyboard.press('Enter');
  }, () => page.evaluate(() => Commands.run('edit.undo')));

  // Tab elsewhere still indents: the key is only taken where a ghost hangs.
  {
    console.log('\n[tab] away from a ghost');
    await caretTo(IN_PROOF);
    await page.keyboard.press('Tab');
    await sleep(150);
    const t = await docText();
    ok(t !== TPS && armsOf(t).length === 1, 'Tab away from a ghost does what Tab does, and accepts nothing');
    await page.evaluate(() => Commands.run('edit.undo'));
    await sleep(150);
    ok((await docText()) === TPS, 'undone');
    try { await waitFilled(2); } catch (_) { /* the next step reports it */ }
  }

  await page.evaluate(() => { Settings.set('keymapStyle', 'emacs'); BelEditor.applyEditorPrefs?.(); });
  await sleep(900);
  await acceptAndUndo('Emacs C-c a', async () => {
    await page.keyboard.down('Control'); await page.keyboard.press('KeyC'); await page.keyboard.up('Control');
    await page.keyboard.press('KeyA');
  }, () => page.evaluate(() => Commands.run('edit.undo')));

  await page.evaluate(() => { Settings.set('keymapStyle', 'vim'); BelEditor.applyEditorPrefs?.(); });
  await sleep(900);
  await acceptAndUndo('Vim \\a', async () => {
    await page.keyboard.press('Escape');
    await sleep(100);
    await page.keyboard.type('\\a');
  }, () => page.evaluate(() => Commands.run('edit.undo')));
  await page.evaluate(() => { Settings.set('keymapStyle', 'default'); BelEditor.applyEditorPrefs?.(); });
  await sleep(600);

  // ── 4. No termination measure: nothing until asked ──────────────────────────
  console.log('\n[untrusted] the same proof with no termination measure');
  await seed(UNTOTALIED, IN_PROOF);
  await sleep(9000);
  ok((await ghosts()).length === 0, 'nothing shows unasked, even with the caret in the proof', await ghosts());
  await caretTo(IN_PROOF);
  ok(await page.evaluate(() => Commands.run('prover.case-fill')), 'Fill This Case runs');
  await sleep(150);
  const forcedNow = await ghosts();
  ok(forcedNow.length === 2, 'a forced fill shows its rows at once', forcedNow);
  let forcedDone = true;
  try { await waitFilled(2, 200000); } catch (_) { forcedDone = false; }
  const gf = await ghosts();
  ok(forcedDone, 'the forced fill finds both cases', gf);
  ok(gf.every((g) => !/Coverage and termination/.test(g.tip)) && gf.some((g) => /\n/.test(g.tip)),
    'and each says what was not checked', gf.map((g) => g.tip));
  ok((await docText()) === UNTOTALIED, 'still nothing written until accepted');

  // ── 5. A case nothing can fill ──────────────────────────────────────────────
  console.log('\n[decline] a case nothing can fill');
  await seed(ALLNAT, 0);
  await sleep(10000);
  ok((await ghosts()).length === 0, 'an automatic miss draws nothing outside the proof', await ghosts());
  ok((await toasts()).length === 0, 'and says nothing', await toasts());
  await caretTo(ALLNAT.indexOf('mlam T'));
  await sleep(200);
  const quiet = await ghosts();
  ok(quiet.length === 1 && quiet[0].state === 'none', 'in the proof, the unfilled case shows as one faint line', quiet);
  ok(await page.evaluate(() => Commands.run('prover.case-fill')), 'force it');
  let declined = true;
  try {
    await page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => /No case found for bool/.test(t.textContent)),
      { timeout: 200000, polling: 250 });
  } catch (_) { declined = false; }
  ok(declined, 'a forced fill that finds nothing says so, naming the case', await toasts());
  ok((await docText()) === ALLNAT, 'and writes nothing');
  await page.screenshot({ path: path.join(outDir, 'case-fill-decline.png') });
} catch (e) {
  fails.push('probe crashed: ' + (e && e.stack || e));
  console.log('  CRASH ' + (e && e.stack || e));
} finally {
  await browser.close();
  server.close();
}

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall case-fill checks passed');
process.exit(fails.length ? 1 : 0);
