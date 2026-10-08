// The first change to the stored format, rehearsed in real Chrome (plan v6
// c12, docs/PERSIST.md §3.1). The machinery has never run on real data, so it
// runs here before the first format change ships, and stays for the next one.
//
// A browser holds a person's work in format 5. An old tab is left open; a new
// BelJar (format 6, with a step from 5 that does nothing) is loaded beside it,
// over the same storage. Then:
//   - the new tab's first paint shows the person's settings, not the defaults
//     (early boot migrates before it reads: js/boot/early-boot-core.mjs);
//   - the new tab carries every project, file and setting forward;
//   - the old tab goes read-only, says so, and what is typed in it is not saved;
//   - the old BelJar, reloaded, leaves the newer data exactly as it was.
//
// The "new BelJar" is this one with its format number raised: the five
// bundles that carry it are served to the new tab rewritten.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openProbe } from './probe-harness.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const editorReady = () => window.Persist && window.CurrentEditor && window.Frame && window.Frame.isMounted();
const port = 8876;
const { page: oldTab, browser, check, finish, wait } = await openProbe({ port, page: 'edit.html', scale: 1, settle: 800, waitFor: editorReady });
const BASE = `http://localhost:${port}`;

const NEXT = ['/js/boot/early-boot.js', '/js/boot/panel-restore.js', '/js/persist/persist.js', '/js/shell.js', '/js/home.js'];
/** A bundle as the next BelJar ships it: format 6, and a step from 5. */
function nextBundle(file) {
  let src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const schemas = src.split('SCHEMA = 5').length - 1;
  if (schemas !== 1) throw new Error(`${file}: expected one SCHEMA = 5, found ${schemas}`);
  src = src.replace('SCHEMA = 5', 'SCHEMA = 6');
  const mark = 'MIGRATIONS = {';
  if (src.includes(mark)) {
    src = src.replace(mark, mark + ' 5: function () { globalThis.__rehearsalSteps = (globalThis.__rehearsalSteps || 0) + 1; },');
  }
  return src;
}
const nexts = NEXT.map((f) => [f, nextBundle(f.slice(1))]);
check(nexts.every(([, s]) => s.includes('SCHEMA = 6')) && nexts.filter(([, s]) => s.includes('__rehearsalSteps')).length === 4,
  'the next BelJar: format 6 in all five bundles, and its step in the four that migrate');

let crash = null;
try {
  // ── a person's browser, in format 5 ──────────────────────────────────────
  await oldTab.evaluate(() => {
    Settings.set('theme', 'light');
    Settings.set('keymapStyle', 'emacs');
    Persist.setProjectName('Thesis');
    Persist.setFileText(Persist.getActiveFileId(), 'LF nat : type =\n| z : nat\n| s : nat -> nat;\n');
    Persist.createProjectWithFiles('Notes', [{ name: 'notes.bel', text: '% notes\n' }, { name: 'dir/more.bel', text: '% more\n' }]);
  });
  await wait(600);
  const snapshot = (page) => page.evaluate(() => {
    const out = {};
    for (const k of Object.keys(localStorage).sort()) {
      // The work itself: each project's name, tree and file texts, and the settings. Not
      // what a tab records of itself (open tabs, folds), which the new tab writes as it opens.
      if (!/^beljar\/p\/[^/]+\/(meta|tree|f\/[^/]+)$/.test(k) && k !== 'beljar/settings') continue;
      try { out[k] = JSON.parse(localStorage.getItem(k)).data; } catch (_) { out[k] = localStorage.getItem(k); }
    }
    return { schema: localStorage.getItem('beljar/schema'), work: out };
  });
  const before = await snapshot(oldTab);
  check(before.schema === '5' && Object.keys(before.work).length >= 7, `a profile with work in it, in format 5 (${Object.keys(before.work).length} records)`);

  // ── the next BelJar, in a new tab over the same storage ───────────────────
  const newTab = await browser.newPage();
  const errors = [];
  newTab.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  await newTab.setRequestInterception(true);
  const served = new Set();
  newTab.on('request', (req) => {
    const u = new URL(req.url());
    const next = nexts.find(([f]) => f === u.pathname);
    if (next) {
      served.add(u.pathname);
      req.respond({ status: 200, contentType: 'text/javascript', headers: { 'cache-control': 'no-store' }, body: next[1] });
    } else {
      req.continue();
    }
  });
  // What the first frame shows: recorded before anything paints.
  await newTab.evaluateOnNewDocument(() => {
    requestAnimationFrame(() => {
      const root = document.documentElement;
      window.__firstPaint = { light: root.classList.contains('light'), schema: localStorage.getItem('beljar/schema') };
    });
  });
  await newTab.goto(`${BASE}/edit.html`, { waitUntil: 'domcontentloaded' });
  await newTab.waitForFunction(editorReady, { timeout: 60000 });
  await wait(800);
  check(served.has('/js/boot/early-boot.js') && served.has('/js/shell.js'), `the new tab runs the next BelJar (${[...served].join(', ')})`);
  const first = await newTab.evaluate(() => window.__firstPaint);
  check(first && first.light === true && first.schema === '6',
    `its first paint is the person's light theme, migrated before it was read: no flash of the default (${JSON.stringify(first)})`);
  const steps = await newTab.evaluate(() => window.__rehearsalSteps || 0);
  check(steps === 1, `the step from 5 ran once, before first paint; the store found the format current (${steps})`);

  const after = await snapshot(newTab);
  check(after.schema === '6', 'the storage is stamped format 6');
  const lost = Object.keys(before.work).filter((k) => JSON.stringify(after.work[k]) !== JSON.stringify(before.work[k]));
  check(!lost.length, `every project, file and setting carried forward unchanged (${lost.join(', ') || Object.keys(before.work).length + ' records'})`);
  const seen = await newTab.evaluate(() => ({
    theme: Settings.get('theme'),
    style: Settings.get('keymapStyle'),
    projects: Persist.projects().map((p) => p.name).sort(),
    text: CurrentEditor.getValue(),
    readOnly: Persist.isReadOnly(),
  }));
  check(seen.theme === 'light' && seen.style === 'emacs' && seen.projects.join() === 'Notes,Thesis' && seen.text === '% notes\n' && !seen.readOnly,
    `the new tab works on all of it, and saves (${JSON.stringify(seen)})`);
  check(!errors.length, `no page errors in the new tab (${errors.join(' | ').slice(0, 200)})`);

  // ── the old tab, left open ────────────────────────────────────────────────
  await oldTab.bringToFront();
  const stopped = await oldTab.waitForFunction(() => Persist.isReadOnly(), { timeout: 10000 }).then(() => true, () => false);
  check(stopped, 'the old tab, hearing that a newer BelJar took the storage, goes read-only');
  const told = await oldTab.evaluate(() => document.body.innerText.includes('BelJar was updated in another tab'));
  check(told, 'and says so: reload to keep editing, nothing here is being saved');
  await oldTab.click('.cm-content');
  await oldTab.keyboard.type('% typed in the old tab\n');
  await wait(1500);
  const untouched = await snapshot(oldTab);
  check(untouched.schema === '6' && !JSON.stringify(untouched.work).includes('typed in the old tab'), 'what is typed in it is not saved over the new format');

  // ── the old BelJar, loaded again ──────────────────────────────────────────
  await oldTab.reload({ waitUntil: 'domcontentloaded' });
  await oldTab.waitForFunction(() => !!window.Persist, { timeout: 60000 });
  await wait(800);
  const older = await oldTab.evaluate(() => ({ readOnly: Persist.isReadOnly() }));
  const kept = await snapshot(oldTab);
  check(older.readOnly && kept.schema === '6' && JSON.stringify(kept.work) === JSON.stringify(after.work),
    'the old BelJar, loaded again over the newer format, opens it read-only and leaves it exactly as it was');
  await newTab.close();
} catch (e) {
  crash = e;
}
await finish('probe-migration', crash);
