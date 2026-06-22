// Suite authoring API (js/persist.js): a within-suite-dir file op keeps the .cfg
// in sync — an in-place rename rewrites the entry, a delete removes it — but a
// move to a DIFFERENT directory never touches the cfg (the dangling entry is
// surfaced by the cfg lint; the user owns cross-dir moves). Explicit
// add/remove/reorder remains the suite authoring surface.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const persistSrc = readFileSync(join(here, '..', 'js', 'persist.js'), 'utf8');

function freshPersist() {
  const storage = new Map();
  const fakeLocalStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  const ctx = vm.createContext({ globalThis: {}, clearTimeout, setTimeout, TextEncoder, localStorage: fakeLocalStorage });
  ctx.globalThis = ctx;
  vm.runInContext(persistSrc, ctx);
  return ctx.BelJarPersist;
}

function idByName(P, name) {
  const f = P.listFiles().find((x) => x.name === name);
  return f ? f.id : null;
}

// ── in-dir rename rewrites; cross-dir move leaves the entry; delete removes it ─
{
  const P = freshPersist();
  P.replaceProject([
    { name: 'grp/base.bel', text: 'LF a : type;' },
    { name: 'grp/use.bel', text: 'LF b : type;' },
    { name: 'grp/sources.cfg', text: '% load order\nbase.bel\nuse.bel\n' },
  ], { projectName: 'CfgSync' });
  const cfgId = idByName(P, 'grp/sources.cfg');

  P.renameFile(idByName(P, 'grp/base.bel'), 'grp/foundation.bel');
  const afterRename = P.getFileText(cfgId);
  expect(afterRename.includes('foundation.bel'), 'in-dir rename rewrites the cfg entry');
  expect(!afterRename.includes('base.bel'), 'old cfg entry name is gone');

  P.renameFile(idByName(P, 'grp/use.bel'), 'other/use.bel');
  const afterMove = P.getFileText(cfgId);
  expect(afterMove.includes('use.bel'), 'move to a different dir leaves the entry (cfg lint surfaces it; user owns cross-dir moves)');
  expect(afterMove.includes('foundation.bel'), 'unaffected entries remain');

  P.deleteFile(idByName(P, 'grp/foundation.bel'));
  const afterDelete = P.getFileText(cfgId);
  expect(!afterDelete.includes('foundation.bel'), 'delete removes the cfg entry');
  expect(afterDelete.includes('use.bel'), 'the moved-out (dangling) entry is left untouched');
}

// ── suite authoring: explicit add / remove entries (C2) ───────────────────────
{
  const P = freshPersist();
  P.replaceProject([
    { name: 'grp/base.bel', text: 'LF a : type;' },
    { name: 'grp/use.bel', text: 'LF b : type;' },
    { name: 'grp/extra.bel', text: 'LF c : type;' },
    { name: 'grp/sources.cfg', text: 'base.bel\nuse.bel\n' },
  ], { projectName: 'Authoring' });
  const cfgId = idByName(P, 'grp/sources.cfg');

  expect(P.addEntryToCfg('grp/sources.cfg', 'grp/extra.bel') === true, 'add a new member succeeds');
  expect(/\bextra\.bel\b/.test(P.getFileText(cfgId)), 'cfg now lists the added member');
  expect(P.addEntryToCfg('grp/sources.cfg', 'grp/extra.bel') === false, 'adding an existing member is a no-op');
  expect(P.addEntryToCfg('grp/sources.cfg', 'other/x.bel') === false, 'a file outside the cfg dir cannot be added');

  expect(P.removeEntryFromCfg('grp/sources.cfg', 'grp/use.bel') === true, 'remove a member succeeds');
  expect(!/\buse\.bel\b/.test(P.getFileText(cfgId)), 'cfg no longer lists the removed member');
  expect(P.removeEntryFromCfg('grp/sources.cfg', 'grp/use.bel') === false, 'removing an absent member is a no-op');
  // Comments and remaining order are preserved by the rewrite.
  expect(/\bbase\.bel\b/.test(P.getFileText(cfgId)), 'untouched members survive a remove');
}

// ── suite authoring: reorder entries (load order = visibility) ────────────────
{
  const P = freshPersist();
  P.replaceProject([
    { name: 'grp/a.bel', text: 'LF a : type;' },
    { name: 'grp/b.bel', text: 'LF b : type;' },
    { name: 'grp/c.bel', text: 'LF c : type;' },
    { name: 'grp/s.cfg', text: '% order\na.bel\nb.bel\nc.bel\n' },
  ], { projectName: 'Reorder' });
  const cfgId = idByName(P, 'grp/s.cfg');
  const entries = () => P.getFileText(cfgId).split('\n').map((l) => l.trim()).filter((l) => l && l[0] !== '%');

  expect(P.moveEntryInCfg('grp/s.cfg', 'grp/c.bel', -1) === true, 'move c up succeeds');
  expect(entries().join('|') === 'a.bel|c.bel|b.bel', 'c swapped above b');
  expect(P.moveEntryInCfg('grp/s.cfg', 'grp/a.bel', -1) === false, 'moving the first entry up is a no-op');
  expect(P.moveEntryInCfg('grp/s.cfg', 'grp/b.bel', 1) === false, 'moving the last entry down is a no-op');
  expect(/^% order$/m.test(P.getFileText(cfgId)), 'comment line holds its position across reorders');
}

console.log('OK cfg authoring (in-dir rename/delete sync the cfg; cross-dir move left for lint; explicit add/remove/reorder)');
