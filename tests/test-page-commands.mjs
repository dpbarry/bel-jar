// A command runs on the pages it declares (docs/PERSIST.md §5.11, COMMANDS.md).
//
// The palette, its chords and the registry are on home as well as in the
// editor. ⛔ A surface may only offer what works: what home attaches must be
// exactly what the catalogue declares for home, an editor command wired there
// must not become a row or a chord that does nothing, and the account's
// preferences must not be offered where no server answers.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, createMemoryStorage } from '../js/persist/store.mjs';
import { createSettings } from '../js/persist/settings.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── 1. the registry on each page (the built leaf, a fresh one per page) ─────
function registryOn(pathname) {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'commands', 'command-registry.js'), 'utf8');
  const had = { location: globalThis.location, Routes: globalThis.Routes, Commands: globalThis.Commands };
  globalThis.location = pathname == null ? undefined : { pathname, search: '', hash: '' };
  globalThis.Routes = pathname == null ? undefined : { pageOf: (loc) => (/(?:^|\/)edit(?:\.html)?\/?$/.test(loc.pathname) ? 'edit' : 'home') };
  try {
    // eslint-disable-next-line no-new-func
    new Function(src)();
    return globalThis.Commands;
  } finally {
    globalThis.location = had.location;
    globalThis.Routes = had.Routes;
    globalThis.Commands = had.Commands;
  }
}
const withPage = (pathname, fn) => {
  const had = { location: globalThis.location, Routes: globalThis.Routes };
  globalThis.location = { pathname, search: '', hash: '' };
  globalThis.Routes = { pageOf: (loc) => (/(?:^|\/)edit(?:\.html)?\/?$/.test(loc.pathname) ? 'edit' : 'home') };
  try { return fn(); } finally { globalThis.location = had.location; globalThis.Routes = had.Routes; }
};
{
  const onHome = registryOn('/');
  withPage('/', () => {
    expect(onHome.page() === 'home', 'the registry knows it is on home');
    let ran = 0;
    expect(onHome.attach('edit.undo', { run: () => { ran += 1; } }) === true && typeof onHome.get('edit.undo').run !== 'function',
      'an editor command wired on home keeps no behaviour');
    expect(onHome.run('edit.undo') === false && ran === 0, 'so it does not run');
    expect(!onHome.list({ runnable: true }).some((c) => c.id === 'edit.undo'), 'and no surface that lists what can run will list it');
    expect(onHome.attach('project.new', { run: () => { ran += 1; } }) && onHome.run('project.new') === true && ran === 1,
      'a command of both pages runs');
    expect(onHome.runsHere('project.new') && !onHome.runsHere('edit.undo') && !onHome.runsHere('app.home'), 'runsHere says which');
    // A palette registration with no catalogue entry is the editor's unless it says otherwise.
    onHome.define({ id: 'x.made-up', title: 'Made up', palette: true, run: () => {} });
    expect(typeof onHome.get('x.made-up').run !== 'function', 'a command nobody declared for home is not home’s');
    onHome.define({ id: 'x.for-home', title: 'For home', palette: true, pages: 'home', run: () => {} });
    expect(typeof onHome.get('x.for-home').run === 'function', 'one that declares home is');
    expect(onHome.list({ page: 'home' }).every((c) => c.pages !== 'editor') && onHome.list({ page: 'editor' }).every((c) => c.pages !== 'home'),
      'list({ page }) is the page’s commands');
  });

  const inEditor = registryOn('/edit');
  withPage('/edit', () => {
    expect(inEditor.page() === 'editor', 'the registry knows it is in the editor');
    expect(inEditor.attach('edit.undo', { run: () => true }) && inEditor.run('edit.undo') === true, 'the editor runs its own');
    expect(inEditor.attach('project.new', { run: () => true }) && inEditor.run('project.new') === true, 'and what both pages run');
    inEditor.define({ id: 'x.for-home', title: 'For home', palette: true, pages: 'home', run: () => {} });
    expect(typeof inEditor.get('x.for-home').run !== 'function', 'a command for home only is not the editor’s');
  });
  withPage('/bel-jar/edit.html', () => expect(registryOn('/bel-jar/edit.html').page() === 'editor', 'served as a file, under a folder, it is still the editor'));

  const nowhere = registryOn(null);
  expect(nowhere.page() === null && nowhere.attach('edit.undo', { run: () => true }) && nowhere.run('edit.undo') === true,
    'with no page at all (a test, a worker) nothing is held back');
}

// ── 2. ⛔ what home attaches is exactly what the catalogue declares for home ──
{
  const listeners = [];
  globalThis.location = { pathname: '/', search: '', hash: '', reload() {} };
  globalThis.addEventListener = (type, fn) => listeners.push(type);
  globalThis.removeEventListener = () => {};
  globalThis.Settings = createSettings(createStore({ storage: createMemoryStorage() }));
  globalThis.Account = { available: () => true, user: () => null, signIn() {}, signOut() {} };
  globalThis.Persist = { syncSummary: () => ({ signedIn: false, state: 'off', differs: [] }), confirmSynced() {} };
  globalThis.Frame = { toggleTheme() {} };
  globalThis.SyncUI = { review() {}, reviewOffline() {} };

  await import('../js/frame/routes.mjs');
  const { Commands } = await import('../js/commands/command-registry.mjs');
  const { attachHomeCommands } = await import('../js/home/home-commands.mjs');
  expect(Commands.page() === 'home', 'this is home');

  const said = [];
  attachHomeCommands({
    newProject() {}, pickFolder() {},
    projects: () => [{ id: 'p_1', name: 'Thesis', detail: '3 files' }],
    say: (text) => said.push(text),
  });

  const declared = Commands.list().filter((c) => c.pages !== 'editor').map((c) => c.id).sort();
  const attached = Commands.list({ runnable: true }).map((c) => c.id).sort();
  // `tools.commands` ("Run Command…") and `nav.anywhere` are the palette's own
  // openers: the palette hands them to Keybindings as closures, not as attached runs.
  const openers = ['nav.anywhere', 'tools.commands'];
  const expected = declared.filter((id) => openers.indexOf(id) < 0);
  expect(attached.join(' ') === expected.join(' '),
    'home attaches exactly what the catalogue declares for it\n  declared: ' + expected.join(' ') + '\n  attached: ' + attached.join(' '));
  expect(listeners.indexOf('keydown') >= 0, 'and listens for its chords (Ctrl+K opens the palette)');

  // ⛔ And nothing is wired that the catalogue does not declare for the page. The
  // registry would drop it without a word (that is its job), so a command added
  // to home's wiring and forgotten in HOME_TOO would simply never appear: said here.
  const wired = (file) => [...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/\bon\('([a-z.-]+)'/g)].map((m) => m[1]);
  const homeWired = wired('js/home/home-commands.mjs');
  const sharedWired = wired('js/commands/shared-commands.mjs');
  expect(homeWired.length >= 3 && sharedWired.length >= 8, `the wiring was read (${homeWired.length} of home's, ${sharedWired.length} shared)`);
  for (const id of homeWired) expect(Commands.get(id) && Commands.get(id).pages !== 'editor', `home wires ${id}, so the catalogue must declare it for home (HOME_TOO)`);
  for (const id of sharedWired) expect(Commands.get(id) && Commands.get(id).pages === 'both', `the shared module wires ${id}, so the catalogue must declare it for both pages`);

  const offered = () => Commands.list({ palette: true, runnable: true, available: true }).map((c) => c.id);
  expect(offered().indexOf('set.sync-reconnect') >= 0 && offered().indexOf('account.sign-in') >= 0 && offered().indexOf('set.start-page') >= 0,
    'where a server answers, signed out: Sign In, the sync preferences and the start page are offered');
  expect(offered().indexOf('account.sign-out') < 0 && offered().indexOf('sync.now') < 0 && offered().indexOf('sync.review') < 0,
    'and not what needs someone signed in');
  expect(offered().every((id) => !/^(edit|nav|motion|select|run|prover|harpoon|tab|fold|macro|view\.(explorer|library|harpoon|settings|reveal-file|edit-history))\b/.test(id)),
    'nothing that needs an editor is offered: ' + offered().join(' '));

  // A preference run from the palette writes the setting and says what it is now.
  expect(Commands.run('set.start-page') === true && globalThis.Settings.get('startPage') === 'last' && said.join() === 'Start page: Last project',
    `Cycle start page writes it and says so (${said.join(' | ')})`);
  expect(Commands.run('set.sync-reconnect') === true && globalThis.Settings.get('syncReconnect') === 'ask', 'a sync preference too');

  // No server: the account and its preferences are not there.
  globalThis.Account = { available: () => false, user: () => null };
  expect(!offered().some((id) => /^set\.s(ync|ign)|^account\.|^sync\./.test(id)), 'with no server, nothing of the account is offered: ' + offered().join(' '));
  expect(Commands.run('set.sync-reconnect') === false && globalThis.Settings.get('syncReconnect') === 'ask', 'nor run by a chord');
  expect(offered().indexOf('set.start-page') >= 0 && offered().indexOf('project.new') >= 0 && offered().indexOf('view.theme') >= 0,
    'the rest of home’s commands are');

  // The palette on home: projects where the editor has files, and only the modes home can answer.
  const palette = globalThis.CommandPalette;
  expect(palette.modeAvailable('anywhere') && palette.modeAvailable('commands') && palette.modeAvailable('help'), 'the palette’s own modes are always there');
  for (const mode of ['symbols', 'search', 'line', 'problems', 'library']) {
    expect(palette.modeAvailable(mode) === false, `home has no ${mode} mode: nothing answers it`);
  }
}

console.log(`OK page commands (${n} checks: the registry per page, home attaches exactly what it declares, the account's only where a server answers, the palette's modes)`);
