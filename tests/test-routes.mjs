// BelJar's two addresses (js/frame/routes.mjs, docs/PERSIST.md §5.11): one
// module builds them, both forms are read, and the editor's address names its
// project. A page opened on ?p=ID works on that project or leaves for home; it
// never opens another one under that address, and never makes one on the way.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Routes } from '../js/frame/routes.mjs';
import { makeBrowserStorage, openTab } from './_persist-env.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = 'p_01m3xq1ph808nx8xjd4jj1rhcx';
const at = (pathname, search = '') => ({ pathname, search, hash: '' });

/** Run `fn` as if the page were on `loc` (and deployed, or not). */
function on(loc, deployed, fn) {
  const had = { location: globalThis.location, deployed: globalThis.BELJAR_DEPLOYED };
  globalThis.location = loc;
  globalThis.BELJAR_DEPLOYED = deployed;
  try { return fn(); } finally {
    globalThis.location = had.location;
    globalThis.BELJAR_DEPLOYED = had.deployed;
  }
}

// ── 1. the two forms ─────────────────────────────────────────────────────────
on(at('/'), true, () => {
  expect(Routes.editUrl(A) === '/edit?p=' + A && Routes.homeUrl() === '/', 'the deployed site uses the short forms');
  expect(Routes.editUrl() === '/edit', 'the editor with no project named: the last one opened');
  expect(Routes.homeUrl({ open: A }) === '/?open=' + A, 'home can be asked to go on to a project once it is here');
});
on(at('/index.html'), false, () => {
  expect(Routes.editUrl(A) === 'edit.html?p=' + A && Routes.homeUrl() === 'index.html',
    'a plain static server has only the files: the links name them, beside each other');
});
on(at('/edit'), false, () => {
  expect(Routes.editUrl(A) === '/edit?p=' + A && Routes.homeUrl() === '/',
    'a page that is itself served at /edit is on a server that answers it (npm run dev)');
});
on(at('/sub/edit.html'), false, () => {
  expect(Routes.editUrl(A) === 'edit.html?p=' + A, 'served as a file, it links to files');
});

// With "Start page: Last project", a bare home address means "start" (early
// boot goes on to the last project), so every link to home says home.
{
  const had = globalThis.Settings;
  globalThis.Settings = { get: (id) => (id === 'startPage' ? 'last' : undefined) };
  try {
    on(at('/'), true, () => {
      expect(Routes.homeUrl() === '/?home', 'the start page is the last project: the way home says so');
      expect(Routes.homeUrl({ open: A }) === '/?open=' + A, 'home asked to go on to a project already says what it is for');
      expect(Routes.pageOf(at('/')) === 'home' && Routes.pendingOf(at('/', '?home')) === null, 'and ?home is read as home, waiting for nothing');
    });
    on(at('/index.html'), false, () => {
      expect(Routes.homeUrl() === 'index.html?home', 'on a static server too');
    });
    globalThis.Settings = { get: () => 'home' };
    on(at('/'), true, () => { expect(Routes.homeUrl() === '/', 'the default start page: the plain address'); });
    globalThis.Settings = { get: () => { throw new Error('not ready'); } };
    on(at('/'), true, () => { expect(Routes.homeUrl() === '/', 'settings that cannot be read change nothing'); });
  } finally {
    globalThis.Settings = had;
  }
}

// ── 2. both forms are read, and only a project id names a project ───────────
for (const p of ['/edit', '/edit.html', '/edit/', '/bel-jar/edit.html']) {
  expect(Routes.pageOf(at(p)) === 'edit' && Routes.projectOf(at(p, '?p=' + A)) === A, `${p} is the editor, and names its project`);
}
for (const p of ['/', '/index.html', '', '/editor', '/reedit', '/edit.htmlx']) {
  expect(Routes.pageOf(at(p)) === 'home' && Routes.projectOf(at(p, '?p=' + A)) === null, `${p || '(empty)'} is home: a ?p= there names nothing`);
}
for (const bad of ['?p=', '?p=main', '?p=p_short', '?p=' + A + 'x', '?q=' + A, '?p=' + A.toUpperCase(), '?p=../' + A]) {
  expect(Routes.projectOf(at('/edit', bad)) === null, `${bad} names no project`);
}
expect(Routes.pendingOf(at('/', '?open=' + A)) === A && Routes.pendingOf(at('/edit', '?open=' + A)) === null
  && Routes.pendingOf(at('/', '?open=nonsense')) === null, 'home reads the project it is waiting for; the editor has none');

// ── 3. the address is made to say where the page is ─────────────────────────
{
  const calls = [];
  const had = globalThis.history;
  globalThis.history = { state: { kept: 1 }, replaceState: (state, title, url) => calls.push({ state, url }) };
  on(Object.assign(at('/edit'), { hash: '#L10' }), true, () => {
    expect(Routes.nameProject(A) === true && calls.length === 1 && calls[0].url === '/edit?p=' + A + '#L10' && calls[0].state.kept === 1,
      `opened on a bare /edit, the address is made to name the project, in place (${JSON.stringify(calls)})`);
  });
  on(at('/edit', '?p=' + A), true, () => {
    expect(Routes.nameProject(A) === false && calls.length === 1, 'an address that already names it is left alone');
  });
  on(at('/'), true, () => {
    expect(Routes.nameProject(A) === false && calls.length === 1, 'and home is never renamed into an editor address');
  });
  globalThis.history = had;
}
on(at('/edit', '?p=' + A), true, () => {
  expect(Routes.signInUrl() === '/api/auth/github/start?return=' + encodeURIComponent('/edit?p=' + A),
    'sign-in starts with where to come back to');
});

// ── 4. ⛔ everything that navigates asks routes.mjs ──────────────────────────
{
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.mjs')) files.push(p);
    }
  })(path.join(ROOT, 'js'));
  const NAVIGATES = /\blocation\s*\.\s*(?:assign|replace)\s*\(|\blocation(?:\s*\.\s*href)?\s*=(?!=)|\bwindow\s*\.\s*open\s*\(/g;
  const own = path.join('js', 'frame', 'routes.mjs');
  const stray = [];
  let seen = 0;
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const text = fs.readFileSync(f, 'utf8');
    text.split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      NAVIGATES.lastIndex = 0;
      if (!NAVIGATES.test(line)) return;
      seen += 1;
      if (rel !== own) stray.push(rel + ':' + (i + 1));
    });
  }
  expect(seen >= 1, 'the scan finds navigations at all (routes.mjs has two)');
  expect(stray.length === 0, `no module navigates by itself: ${stray.join(', ')} (use Routes.go with Routes.editUrl, homeUrl or signInUrl)`);
}

// ── 5. the editor is pinned to the project its address names ────────────────
const fakeLocation = (pathname, search) => {
  const loc = { pathname, search, hash: '', went: [] };
  loc.replace = (url) => loc.went.push(['replace', url]);
  loc.assign = (url) => loc.went.push(['assign', url]);
  return loc;
};
const keysOf = (storage) => [...storage.map.keys()].sort().join('\n');
{
  const storage = makeBrowserStorage();
  const first = openTab(storage).P;
  const a = first.getActiveProjectId();
  first.setFileText(first.getActiveFileId(), 'in A\n');
  const b = first.createProject('Second');
  expect(first.lastProjectId() === a, 'the last project opened is A');

  const locB = fakeLocation('/edit.html', '?p=' + b);
  const onB = openTab(storage, { location: locB }).P;
  expect(onB.getActiveProjectId() === b && onB.leaving() === null && locB.went.length === 0,
    'a page opened on ?p=B is on B, though A was the last one opened');
  expect(onB.lastProjectId() === b, 'and B is now the last one opened: what home lists first');

  // Another tab opens A meanwhile. A reload of the tab on B stays on B.
  const onA = openTab(storage, { location: fakeLocation('/edit.html', '?p=' + a) }).P;
  expect(onA.getActiveProjectId() === a && onA.lastProjectId() === a, 'another tab opens A');
  const reloaded = openTab(storage, { location: fakeLocation('/edit.html', '?p=' + b) }).P;
  expect(reloaded.getActiveProjectId() === b, 'reloaded, the tab on B is still on B: the address decides, not what another tab did last');
  expect(onB.getActiveProjectId() === b && onA.getActiveProjectId() === a, 'and neither running page moved');

  // Looked at again (its tab came to the front): the tab on A makes A the last one opened.
  onA.projectInUse();
  expect(onA.lastProjectId() === a, 'the project of the tab last looked at is the last one opened');
  onB.projectInUse();
  const bare = openTab(storage, { location: fakeLocation('/edit', '') }).P;
  expect(bare.getActiveProjectId() === b, 'a bare /edit opens the last one opened');
  const junk = openTab(storage, { location: fakeLocation('/edit', '?p=not-an-id') }).P;
  expect(junk.getActiveProjectId() === b && junk.leaving() === null, 'a ?p= that is no project id names nothing: the last one opened');
  const home = openTab(storage, { location: fakeLocation('/index.html', '?p=' + a) }).P;
  expect(home.leaving() === null && home.lastProjectId() === b, 'on home a ?p= pins nothing');
}

// ── 6. ⛔ a project this browser cannot show: leave for home, touch nothing ──
{
  const storage = makeBrowserStorage();
  const first = openTab(storage).P;
  const a = first.getActiveProjectId();
  first.setFileText(first.getActiveFileId(), 'in A\n');
  const gone = 'p_01m3xq1ph808nx8xjd4jj1zzzz';
  const before = keysOf(storage);
  const loc = fakeLocation('/edit', '?p=' + gone);
  const tab = openTab(storage, { location: loc, BELJAR_DEPLOYED: true }).P;
  expect(tab.leaving() === gone, 'the address names a project that is not here: the page is leaving');
  expect(loc.went.length === 1 && loc.went[0][0] === 'replace' && loc.went[0][1] === '/?open=' + gone,
    `for home, in place of this address, naming what it wanted (${JSON.stringify(loc.went)})`);
  expect(tab.getActiveProjectId() !== a && tab.listProjects().length === 1,
    'until the browser has left, the page runs on a project of its own, never on another real one');
  tab.setFileText(tab.getActiveFileId(), 'typed on the way out');
  expect(keysOf(storage) === before, 'and none of that is in storage: no project made, nothing written');

  // The same when nothing at all is here (signed out after the account's projects left).
  const empty = makeBrowserStorage();
  const loc2 = fakeLocation('/edit.html', '?p=' + gone);
  const t2 = openTab(empty, { location: loc2 }).P;
  t2.listProjects();
  expect(t2.leaving() === gone && loc2.went[0][1] === 'index.html?open=' + gone
    && ![...empty.map.keys()].some((k) => k.startsWith('beljar/p/')),
    'with no project here at all, leaving makes none (a blank one would wait on home for nobody)');
}
{
  // Another account's project is not this page's to open.
  const storage = makeBrowserStorage();
  const mine = openTab(storage).P;
  const pid = mine.getActiveProjectId();
  mine.setAccount('u_ana');
  mine.claimProject(pid);
  mine.setAccount(null);
  const loc = fakeLocation('/edit', '?p=' + pid);
  const out = openTab(storage, { location: loc }).P;
  expect(out.leaving() === pid, 'signed out, a project that belongs to an account is not opened by its address');
  mine.setAccount('u_ana');
  const back = openTab(storage, { location: fakeLocation('/edit', '?p=' + pid) }).P;
  expect(back.leaving() === null && back.getActiveProjectId() === pid, 'signed in as its owner, it opens');
}

// ── 7. home: what there is, without making one; the last may be deleted ─────
{
  const storage = makeBrowserStorage();
  const home = openTab(storage, { location: fakeLocation('/', '') }).P;
  expect(home.projects().length === 0 && home.lastProjectId() === null && ![...storage.map.keys()].some((k) => k.startsWith('beljar/p/')),
    'on a new browser home lists nothing, and makes nothing to fill itself');
  const pid = home.createProject('First');
  expect(home.projects().length === 1 && home.projects()[0].name === 'First', 'a project made from home is listed');
  expect(home.removeProject(pid) === true && home.projects().length === 0 && ![...storage.map.keys()].some((k) => k.startsWith('beljar/p/')),
    'home may delete the last project: the list is empty again, and nothing of it is left');
  expect(home.removeProject(pid) === false, 'deleting what is not there says so');
  const one = home.createProject('One');
  const two = home.createProject('Two');
  openTab(storage, { location: fakeLocation('/edit', '?p=' + two) });
  expect(home.lastProjectId() === two && home.removeProject(two) === true && home.lastProjectId() === one,
    'deleting the last one opened leaves the one before it as the last');

  // What home's row says about a project comes from here: when it was last
  // touched (its date, and the order), with how much is in it beside.
  const made = home.createProjectWithFiles('Stats', [{ name: 'a.bel', text: 'one' }, { name: 'dir/b.bel', text: 'two\n' }]);
  const stats = home.projectStats(made.projectId);
  expect(stats.files === 2 && stats.size === 7 && stats.editedAt > 0, `a project's stats count its files and their text, and when it was written (${JSON.stringify(stats)})`);
}

// ── 8. ⛔ signing out: the projects leave as the NEXT page loads ─────────────
// The page that signs out is live until the browser has left it. Removing the
// account's projects under it left a blank project behind (anything that reads
// the list while none is visible makes one), and home then listed it.
const projectKeys = (storage) => [...storage.map.keys()].filter((k) => k.startsWith('beljar/p/'));
const metas = (storage) => projectKeys(storage).filter((k) => /\/meta$/.test(k)).length;
{
  const storage = makeBrowserStorage();
  const setUp = openTab(storage, { location: fakeLocation('/', '') }).P;
  setUp.setAccount('u_ana');
  const theirs = setUp.createProject('Theirs');
  const also = setUp.createProject('Also theirs');
  expect(metas(storage) === 2 && setUp.projects().every((p) => p.owner === 'u_ana'), 'two projects, both the account’s, and none of this browser’s own');

  const ed = openTab(storage, { location: fakeLocation('/edit', '?p=' + theirs) }).P;
  const other = openTab(storage, { location: fakeLocation('/edit', '?p=' + also) }).P;
  const late = openTab(storage, { location: fakeLocation('/edit', '?p=' + also) }).P;
  const heard = [];
  other.onAccountElsewhere((a) => heard.push(a));
  ed.onAccountElsewhere((a) => heard.push('own tab: ' + a));

  // What account.mjs does to sign out, removing.
  ed.setAccount(null);
  ed.leaveAccount('u_ana');
  expect(metas(storage) === 2, 'signing out removes nothing under the page that signed out');
  expect(ed.listProjects().length === 0 && ed.getActiveProjectId() === theirs && metas(storage) === 2,
    'and that page, with no project left to show, makes none: it is leaving');
  expect(heard.length === 1 && heard[0] === null, 'another tab hears the sign-out, once; the tab that did it does not hear itself');
  expect(other.ownerLeft() === true && other.listProjects().length === 0 && metas(storage) === 2,
    'an editor on one of the account’s projects is told to go home with it, and makes no project either');

  // The next page to load: home.
  const home = openTab(storage, { location: fakeLocation('/', '') }).P;
  expect(projectKeys(storage).length === 0 && home.projects().length === 0,
    'the next page to load removes them: nothing of the account is left, and nothing was made in its place');
  expect(late.ownerLeft() === true, 'a tab that only notices after they have gone still knows whose its project was');
  home.setAccount('u_ana');
  const resume = home.resumeFor('u_ana');
  expect(!!resume && resume.project === also, 'and the project last opened is remembered for when the account signs in again');
  home.setAccount(null);
  const again = openTab(storage, { location: fakeLocation('/', '') }).P;
  again.setAccount('u_ana');
  const kept = again.createProject('Back again');
  // ⛔ Signed out again, this time keeping its projects (Settings > Account): a
  // removal still noted from the first sign-out would take them at the next load.
  again.keepAccountProjects('u_ana');
  again.setAccount(null);
  const later = openTab(storage, { location: fakeLocation('/', '') }).P;
  expect(metas(storage) === 1 && later.projects().length === 1 && later.projects()[0].id === kept,
    'the removal happens once: a later page load does not take what the account has kept here since');
}
{
  // Signed out and straight back in as the same account before any page loaded: nothing goes.
  const storage = makeBrowserStorage();
  const tab = openTab(storage, { location: fakeLocation('/', '') }).P;
  tab.setAccount('u_ana');
  const pid = tab.createProject('Stays');
  tab.setAccount(null);
  tab.leaveAccount('u_ana');
  tab.setAccount('u_ana');
  const next = openTab(storage, { location: fakeLocation('/edit', '?p=' + pid) }).P;
  expect(next.leaving() === null && next.getActiveProjectId() === pid, 'signed in again as the same account before a page loaded, its projects stay');
}
{
  // Kept on sign-out (Settings > Account), and a project of this browser's own: nobody is sent anywhere.
  const storage = makeBrowserStorage();
  const tab = openTab(storage, { location: fakeLocation('/', '') }).P;
  const own = tab.createProject('This browser’s');
  tab.setAccount('u_ana');
  const theirs = tab.createProject('Theirs');
  const onTheirs = openTab(storage, { location: fakeLocation('/edit', '?p=' + theirs) }).P;
  const onOwn = openTab(storage, { location: fakeLocation('/edit', '?p=' + own) }).P;
  tab.keepAccountProjects('u_ana');
  tab.setAccount(null);
  expect(onTheirs.ownerLeft() === false && onOwn.ownerLeft() === false, 'kept projects, and this browser’s own, stay open where they are');
  const next = openTab(storage, { location: fakeLocation('/', '') }).P;
  expect(next.projects().length === 2, 'and both are still listed');
}
{
  // The project disappearing under an editor because its account signed out is not "deleted".
  const storage = makeBrowserStorage();
  const tab = openTab(storage, { location: fakeLocation('/', '') }).P;
  tab.setAccount('u_ana');
  const pid = tab.createProject('Theirs');
  const loc = fakeLocation('/edit', '?p=' + pid);
  const asked = [];
  openTab(storage, { location: loc, ConfirmDialog: { confirm: (o) => { asked.push(o.message); return Promise.resolve(false); } } });
  tab.setAccount(null);
  tab.leaveAccount('u_ana');
  openTab(storage, { location: fakeLocation('/', '') });
  expect(loc.went.length === 1 && loc.went[0][0] === 'replace' && loc.went[0][1] === '/' && asked.length === 0,
    'the editor follows the sign-out home, and says nothing about a deleted project');
}

console.log(`OK routes (${n} checks: two forms, both read, one owner of every navigation, the editor pinned by its address, leaving touches nothing, home makes nothing, signing out removes at the next load)`);
