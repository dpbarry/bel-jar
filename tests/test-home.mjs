// Home (js/home/home.mjs, index.html): what a row says, how the list is
// ordered and moved through, what happens to a project the address asked for,
// and what the page may load. ⛔ Home costs a fraction of the editor and starts
// no Beluga: its bundle is walked here, module by module.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scriptsOf, mayPreload, preloadEditor } from '../js/home/preload-editor.mjs';
import {
  orderProjects, reviewWord, whenEdited, homeMode, findsByTyping, listMove, pendingStep, listArriving, OPEN_WAIT_MS, ACCOUNT_WAIT_MS,
  signInHintDue, SIGN_IN_HINT_TEXT,
} from '../js/home/home.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── 1. the order: the last one opened, then the most recently touched ───────
{
  const projects = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }, { id: 'c', name: 'Gamma' }, { id: 'd', name: 'Delta' }];
  const at = { a: 100, b: 400, c: 300, d: 300 };
  const stats = (id) => ({ editedAt: at[id] });
  expect(orderProjects(projects, 'a', stats).map((p) => p.id).join('') === 'abdc',
    'the last project opened is first, whenever it was touched; then the newest; then by name');
  expect(orderProjects(projects, null, stats).map((p) => p.id).join('') === 'bdca', 'with none opened yet, the newest first');
  expect(orderProjects(projects, 'zz', stats).map((p) => p.id).join('') === 'bdca', 'a last project that is gone changes nothing');
  expect(projects.map((p) => p.id).join('') === 'abcd', 'and the list it was given is left as it was');
}

// ── 2. what a row says ───────────────────────────────────────────────────────
expect(reviewWord(1) === '1 file to review' && reviewWord(3) === '3 files to review', 'and what needs you');
{
  const now = new Date(2026, 9, 2, 15, 0, 0).getTime(); // a Friday afternoon
  const ago = (ms) => whenEdited(now - ms, now);
  const min = 60000;
  const hour = 60 * min;
  expect(whenEdited(0, now) === '', 'never touched: nothing to say');
  expect(ago(10000) === 'Just now' && ago(60000) === '1 minute ago' && ago(25 * min) === '25 minutes ago', 'the last hour, in minutes');
  expect(ago(hour) === '1 hour ago' && ago(5 * hour) === '5 hours ago', 'today, in hours');
  expect(ago(16 * hour) === 'Yesterday' && ago(30 * hour) === 'Yesterday', 'last night and yesterday morning are both yesterday');
  expect(ago(3 * 24 * hour) === '3 days ago' && ago(6 * 24 * hour) === '6 days ago', 'this week, in days');
  const old = ago(40 * 24 * hour);
  expect(/Aug/.test(old) && !/2026/.test(old), `older, the date, without the year while it is this one (${old})`);
  expect(/2025/.test(whenEdited(new Date(2025, 5, 3).getTime(), now)), 'and with it once it is not');
  expect(ago(-5000) === 'Just now', 'a clock that runs ahead does not say "in 5 seconds"');
}

// ── 3. finding one ──────────────────────────────────────────────────────────
// What the page is, and which keys start a search.
expect(homeMode({ count: 3, arriving: false }) === 'returning' && homeMode({ count: 3, arriving: true }) === 'returning' && homeMode({ count: 1, arriving: false }) === 'returning',
  'with projects, even one: the ways to start, and the list');
expect(homeMode({ count: 0, arriving: true }) === 'arriving', 'none, and they may be on their way: the keyboard waits for them');
expect(homeMode({ count: 0, arriving: false }) === 'first', 'none, and none are coming: the list says so');
expect(findsByTyping('t') && findsByTyping('T') && findsByTyping('7') && findsByTyping('é')
  && !findsByTyping(' ') && !findsByTyping('Enter') && !findsByTyping('F2') && !findsByTyping('/') && !findsByTyping(undefined),
  'a letter or a digit pressed on a row starts a search; nothing else does');

// ── 4. moving through the list, in each editing style ───────────────────────
{
  const key = (k, mods) => Object.assign({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, mods || {});
  for (const style of ['default', 'vim', 'emacs']) {
    expect(listMove(key('ArrowDown'), style) === 1 && listMove(key('ArrowUp'), style) === -1, `${style}: the arrows move`);
    expect(listMove(key('ArrowDown', { ctrlKey: true }), style) === 0 && listMove(key('a'), style) === 0, `${style}: other keys do not`);
  }
  expect(listMove(key('j'), 'vim') === 1 && listMove(key('k'), 'vim') === -1, 'Vim: j and k');
  expect(listMove(key('j'), 'default') === 0 && listMove(key('j'), 'emacs') === 0, 'which are letters in the other two (they find a project)');
  expect(listMove(key('J', { shiftKey: true }), 'vim') === 0, 'and J is not j');
  expect(listMove(key('n', { ctrlKey: true }), 'emacs') === 1 && listMove(key('p', { ctrlKey: true }), 'emacs') === -1, 'Emacs: C-n and C-p');
  expect(listMove(key('m', { ctrlKey: true }), 'emacs') === 1, 'and C-m, which stands in for the C-n a browser keeps for itself');
  expect(listMove(key('n', { ctrlKey: true }), 'default') === 0 && listMove(key('p', { ctrlKey: true }), 'vim') === 0, 'in Emacs only');
}

// ── 5. a project the address asked for ──────────────────────────────────────
{
  const base = { here: false, accountKnown: false, signedIn: false, roundDone: false, timedOut: false };
  const step = (o) => pendingStep(Object.assign({}, base, o));
  expect(step({ here: true }) === 'open' && step({ here: true, timedOut: true }) === 'open', 'it is here: open it, however long it took');
  expect(step({}) === 'wait', 'not here, and the page does not yet know who is signed in: wait');
  expect(step({ accountKnown: true }) === 'up', 'nobody is signed in: it is not coming');
  expect(step({ accountKnown: true, signedIn: true }) === 'wait', 'signed in, and no round has finished: it may be on its way');
  expect(step({ accountKnown: true, signedIn: true, roundDone: true }) === 'up', 'a round finished without it: it is not in the account');
  expect(step({ timedOut: true }) === 'up' && step({ accountKnown: true, signedIn: true, timedOut: true }) === 'up', 'and nobody waits for ever');
  expect(OPEN_WAIT_MS >= 3000 && OPEN_WAIT_MS <= 15000, 'the wait is long enough for a round and short enough to sit through');
}

// ── 5b. an empty list that may be about to fill says nothing yet ────────────
{
  const base = { count: 0, accountKnown: true, signedIn: true, state: 'syncing', lastSync: 0, timedOut: false };
  const arriving = (o) => listArriving(Object.assign({}, base, o));
  expect(arriving({}) === true, 'signed in, nothing here, the first round not back: say nothing yet');
  expect(arriving({ accountKnown: false, signedIn: false, state: 'off' }) === true,
    'who is signed in is not known yet (the page has only just asked): say nothing yet');
  expect(arriving({ signedIn: false, state: 'off' }) === false, 'nobody is signed in: an empty list is simply empty');
  // This browser still thinks it is signed in (the summary says "syncing"), and the server says nobody is.
  expect(arriving({ signedIn: false, state: 'syncing' }) === false, 'a session that has ended: no round will run, so nothing is waited for');
  expect(arriving({ count: 2 }) === false && arriving({ count: 2, accountKnown: false }) === false, 'with projects to show there is nothing to wait for');
  expect(arriving({ lastSync: 5, state: 'synced' }) === false, 'the round is back with nothing: the account is empty, and home says so');
  expect(arriving({ state: 'offline' }) === false && arriving({ state: 'error' }) === false, 'no round is coming (offline, an error): do not wait for one');
  expect(arriving({ timedOut: true }) === false && arriving({ accountKnown: false, timedOut: true }) === false, 'and nobody looks at nothing for ever');
  expect(ACCOUNT_WAIT_MS >= 1000 && ACCOUNT_WAIT_MS < OPEN_WAIT_MS, 'learning who is signed in is given less time than a round');
}

// ── 5b. the sign-in box: once, signed out, where a server answers ───────────
{
  const yes = { accountKnown: true, available: true, signedIn: false, unreachable: false, seen: false };
  expect(signInHintDue(yes), 'signed out, a server, not seen yet: the box is due');
  expect(!signInHintDue({ ...yes, signedIn: true }), 'signed in: not due');
  expect(!signInHintDue({ ...yes, accountKnown: false }), 'still finding out who is signed in: not due');
  expect(!signInHintDue({ ...yes, available: false }), 'no server here: not due');
  expect(!signInHintDue({ ...yes, unreachable: true }), 'the server is out of reach: not due');
  expect(!signInHintDue({ ...yes, seen: true }), 'already seen: never again');
  expect(!signInHintDue(null) && !signInHintDue({}), 'nothing known: not due');
  expect(SIGN_IN_HINT_TEXT === 'Sign in with GitHub to keep your projects on every device.' && !/[<]/.test(SIGN_IN_HINT_TEXT),
    'the words are the old line, and they are not a link');
}

// ── 6. ⛔ what home's bundle may contain ─────────────────────────────────────
{
  const seen = new Set();
  (function walk(file) {
    const rel = path.relative(path.join(ROOT, 'js'), file).replace(/\\/g, '/');
    if (seen.has(rel)) return;
    seen.add(rel);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/^\s*(?:import|export)\s[^;'"]*?\bfrom\s*['"](\.[^'"]+)['"]|^\s*import\s*['"](\.[^'"]+)['"]/gm)) {
      walk(path.join(path.dirname(file), m[1] || m[2]));
    }
  })(path.join(ROOT, 'js', 'home.mjs'));
  expect(seen.has('home/home.mjs') && seen.has('persist/persist.mjs') && seen.has('account/account.mjs') && seen.size > 30,
    `the walk follows home's imports (${seen.size} modules)`);
  // Folders that are the editor. The few modules home shares with it are named:
  // how a folder of sources is ordered into a project (pure, no editor in them).
  // The command registry is both pages' (the palette is on home too); what a
  // command may DO on home is held by tests/test-page-commands.mjs.
  const FORBIDDEN = /^(editor-src|workspace|app|beluga|harpoon|explorer|library|repl|status-strip|compat)\//;
  const SHARED = new Set([
    'workspace/project-source.mjs', 'workspace/import-project.mjs', 'workspace/float-placement.mjs',
    'editor-src/project-paths.mjs', 'editor-src/semantic/development.mjs',
  ]);
  const strays = [...seen].filter((m) => FORBIDDEN.test(m) && !SHARED.has(m));
  expect(strays.length === 0, `home imports nothing of the editor: ${strays.join(', ')}`);
  expect(!seen.has('shell.mjs') && !seen.has('persist/tab-guard.mjs') && !seen.has('persist/install-edit-history.mjs'),
    'nor what only an open document needs (the tab guard, the edit history)');
  expect(seen.has('ui/command-palette.mjs') && seen.has('ui/keybindings.mjs') && seen.has('commands/shared-commands.mjs')
    && !seen.has('ui/settings-ui.mjs') && !seen.has('app/app-command-palette.mjs'),
    'the palette, its chords and the commands both pages run are here; the Settings dialog and the editor\'s commands are not');
  const homeSrc = fs.readFileSync(path.join(ROOT, 'js', 'home', 'home.mjs'), 'utf8');
  const drawFind = homeSrc.slice(homeSrc.indexOf('function drawFind'), homeSrc.indexOf('function drawSignIn'));
  expect(/labelFor\('nav\.anywhere'\)/.test(drawFind) && !/liveChord/.test(drawFind),
    'Search on home shows BelJar\'s own chord (Ctrl+K), not the editing style\'s');

  const built = fs.readFileSync(path.join(ROOT, 'js', 'home.js'), 'utf8');
  const editor = fs.statSync(path.join(ROOT, 'js', 'editor-cm.bundle.js')).size + fs.statSync(path.join(ROOT, 'js', 'shell.js')).size;
  // Held at the size it ships with. 560 KB until the sign-in coachmark joined home (2026-10-08).
  expect(built.length < 580 * 1024, `home's script is under 580 KB (${Math.round(built.length / 1024)} KB; the editor's is ${Math.round(editor / 1024)} KB)`);
  expect(built.length < editor / 5, 'and under a fifth of the editor\'s');
  expect(!/new Worker\(|beluga_web|BelugaClient\.|importScripts\(/.test(built), 'it starts no worker and names no Beluga runtime');

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  expect(scripts.join() === 'js/boot/early-boot.js,js/boot/error-hook.js,js/home.js', `home's document loads its three scripts and no more (${scripts.join(', ')})`);
  // The deployed-hosts script comes before early boot, which may send the page on and needs the address forms.
  expect(html.indexOf('window.BELJAR_DEPLOYED') > 0 && html.indexOf('window.BELJAR_DEPLOYED') < html.indexOf('js/boot/early-boot.js'),
    'home knows whether it is deployed before early boot runs');
  for (const file of ['index.html', 'edit.html']) {
    const doc = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const end = doc.slice(doc.indexOf('<div class="header-end">'), doc.indexOf('</header>'));
    const ids = [...end.matchAll(/<button id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids[ids.length - 1] === 'btn-account', `${file}: the person is at the far right of the strip (${ids.join(', ')})`);
  }
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  expect(/<h1 class="header-brand home-brand">[\s\S]*<span class="home-brand__name">BelJar<\/span>/.test(header),
    'home\'s strip carries the name beside the mark');
  expect(!/home-mark|home-wordmark/.test(html), 'the column has no wordmark of its own');
  const field = html.slice(html.indexOf('class="home-field"'), html.indexOf('class="home__column"'));
  expect(field.includes('aria-hidden="true"') && field.includes('home-stroke--x') && field.includes('home-stroke--lambda') && field.includes('A775.74') && !field.includes('home-field__light'),
    'the ground is an X and a lambda, hidden from assistive tech, with no wash');
  expect(!homeSrc.includes('pointermove') && !homeSrc.includes('--hx'), 'the lambda stays where it is drawn');
  expect(!html.includes('id="home-signin"') && !html.includes('home-head'), 'the column has no sign-in line; the account button carries that');
  for (const id of ['home', 'home-actions', 'home-links', 'home-find', 'home-list', 'home-projects-section',
    'home-projects-label', 'home-risk', 'home-waiting', 'home-news', 'btn-account', 'btn-sync', 'btn-theme', 'btn-notifications', 'menu-root', 'tooltip-root', 'toast-stack']) {
    expect(html.includes('id="' + id + '"'), `home's document has #${id}, which its script draws into`);
  }
  const edit = fs.readFileSync(path.join(ROOT, 'edit.html'), 'utf8');
  expect(/id="btn-home"[^>]*href="index\.html"/.test(edit) || /href="index\.html"[^>]*id="btn-home"/.test(edit),
    'the editor\'s brand is a link home that works before any script runs');
  expect(!/btn-github|btn-reload/.test(edit), 'and its header no longer carries the GitHub icon or a reload button');
}

// ── 7. the editor's scripts are fetched ahead, from its own document ────────
{
  const editHtml = fs.readFileSync(path.join(ROOT, 'edit.html'), 'utf8');
  const scripts = scriptsOf(editHtml);
  expect(scripts.indexOf('js/shell.js') >= 0 && scripts.some((s) => /^js\/editor-cm\.bundle\.js\?v=/.test(s)) && scripts.indexOf('js/beluga/beluga-client.js') >= 0,
    `the editor's document names its scripts, version queries and all (${scripts.join(', ')})`);
  expect(scriptsOf('<!-- <script src="old.js"></script> --><script src="a.js"></script><script>inline()</script>').join() === 'a.js',
    'a script in a comment is not one, nor is an inline one');
  expect(mayPreload({}) && mayPreload(null) && mayPreload({ connection: { saveData: false } }) && !mayPreload({ connection: { saveData: true } }),
    'asked to save data, the browser is not asked to fetch ahead');

  const made = [];
  const doc = { createElement: () => ({}), head: { appendChild: (el) => made.push(el) } };
  const asked = [];
  const fetchOk = async (url) => { asked.push(url); return { ok: true, text: async () => editHtml + '<script src="https://elsewhere.example/x.js"></script>' }; };
  const got = await preloadEditor({ document: doc, fetch: fetchOk, navigator: {}, base: 'https://beljar.test/' });
  expect(asked.join() === 'https://beljar.test/edit.html', `it reads the editor's document, at the address routes.mjs gives (${asked.join()})`);
  expect(got.length === scripts.length && made.length === scripts.length && made.every((l) => l.rel === 'prefetch' && l.as === 'script'),
    'and asks for each of its scripts with rel="prefetch": fetched for the next page, never run here');
  expect(made.map((l) => l.href).join() === scripts.map((s) => 'https://beljar.test/' + s).join(), 'at exactly the addresses that document will ask for');
  expect(!made.some((l) => /elsewhere/.test(l.href)), 'and nothing from another site');
  made.length = 0;
  expect((await preloadEditor({ document: doc, fetch: fetchOk, navigator: { connection: { saveData: true } }, base: 'https://beljar.test/' })).length === 0 && made.length === 0,
    'nothing at all when the person is saving data');
  expect((await preloadEditor({ document: doc, fetch: async () => ({ ok: false }), navigator: {}, base: 'https://beljar.test/' })).length === 0
    && (await preloadEditor({ document: doc, fetch: async () => { throw new Error('offline'); }, navigator: {}, base: 'https://beljar.test/' })).length === 0 && made.length === 0,
    'and a document that cannot be read is no error: the editor loads as it always did');
  const home = fs.readFileSync(path.join(ROOT, 'js', 'home', 'preload-editor.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  expect(!/prerender|speculationrules/i.test(home), '⛔ it never prerenders: a prerendered editor would start workers, take the sync lock and write');
}

console.log(`OK home (${n} checks: order, words, times, finding, the three styles, a pending project, and a bundle with nothing of the editor in it)`);
