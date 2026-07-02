// Suite authoring API (js/persist.js): when auto-sync is on, active-suite .cfg
// files (including nested .cfg chains) track their listed project files —
// same-folder rename rewrites the entry, delete removes it, folder move leaves
// the entry (cfg lint surfaces dangling). Inactive .cfg files and auto-sync-off
// leave entries untouched. Explicit add/remove/reorder remains the suite
// authoring surface.
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

function activateCfg(P, dir, cfgPath) {
  P.setActiveCfgForDir(dir, cfgPath);
}

// ── active cfg: same-folder rename, folder move leaves entry, delete removes ──
{
  const P = freshPersist();
  P.replaceProject([
    { name: 'grp/base.bel', text: 'LF a : type;' },
    { name: 'grp/use.bel', text: 'LF b : type;' },
    { name: 'grp/sources.cfg', text: '% load order\nbase.bel\nuse.bel\n' },
    { name: 'grp/inactive.cfg', text: 'base.bel\nuse.bel\n' },
  ], { projectName: 'CfgSync' });
  activateCfg(P, 'grp', 'grp/sources.cfg');
  const cfgId = idByName(P, 'grp/sources.cfg');
  const inactiveId = idByName(P, 'grp/inactive.cfg');

  P.renameFile(idByName(P, 'grp/base.bel'), 'grp/foundation.bel');
  const afterRename = P.getFileText(cfgId);
  expect(afterRename.includes('foundation.bel'), 'same-folder rename rewrites the active cfg entry');
  expect(!afterRename.includes('base.bel'), 'old active cfg entry name is gone');
  expect(P.getFileText(inactiveId).includes('foundation.bel'), 'any listing cfg is updated on rename');
  expect(!P.getFileText(inactiveId).includes('base.bel'), 'old entry is gone from inactive cfg too');

  P.renameFile(idByName(P, 'grp/use.bel'), 'other/use.bel');
  const afterMove = P.getFileText(cfgId);
  expect(afterMove.includes('use.bel'), 'cross-dir move leaves the cfg entry unchanged');
  expect(!afterMove.includes('other/'), 'cfg entry is not rewritten to the new path');
  expect(afterMove.includes('foundation.bel'), 'unaffected entries remain');
  expect(P.getFileText(inactiveId).includes('use.bel'), 'inactive cfg keeps entry after cross-dir move');

  P.deleteFile(idByName(P, 'grp/foundation.bel'));
  const afterDelete = P.getFileText(cfgId);
  expect(!afterDelete.includes('foundation.bel'), 'delete removes the cfg entry');
}

// ── folder move into subfolder leaves cfg entry (no path rewrite) ─────────────
{
  const P = freshPersist();
  P.replaceProject([
    { name: 'grp/base.bel', text: 'LF a : type;' },
    { name: 'grp/sources.cfg', text: 'base.bel\n' },
  ], { projectName: 'CfgSubMove' });
  activateCfg(P, 'grp', 'grp/sources.cfg');
  const cfgId = idByName(P, 'grp/sources.cfg');

  P.renameFile(idByName(P, 'grp/base.bel'), 'grp/sub/base.bel');
  const afterSubMove = P.getFileText(cfgId);
  expect(afterSubMove.trim() === 'base.bel', 'move into subfolder leaves basename entry');
  expect(!afterSubMove.includes('sub/'), 'cfg entry is not rewritten to nested path');
}

// ── nested .cfg in active chain: rename syncs the child cfg ───────────────────
{
  const P = freshPersist();
  P.replaceProject([
    { name: 'grp/base.bel', text: 'LF a : type;' },
    { name: 'grp/inner.cfg', text: 'base.bel\n' },
    { name: 'grp/sources.cfg', text: 'inner.cfg\n' },
  ], { projectName: 'CfgNested' });
  activateCfg(P, 'grp', 'grp/sources.cfg');
  const innerId = idByName(P, 'grp/inner.cfg');

  P.renameFile(idByName(P, 'grp/base.bel'), 'grp/core.bel');
  const innerText = P.getFileText(innerId);
  expect(innerText.includes('core.bel'), 'nested cfg in active chain rewrites on rename');
  expect(!innerText.includes('base.bel'), 'old nested cfg entry is gone');
}

// ── auto-sync off: cfgs never change on file ops ─────────────────────────────
{
  const P = freshPersist();
  P.writeStoredCfgAutoSync(false);
  P.replaceProject([
    { name: 'grp/base.bel', text: 'LF a : type;' },
    { name: 'grp/sources.cfg', text: 'base.bel\n' },
  ], { projectName: 'CfgSyncOff' });
  activateCfg(P, 'grp', 'grp/sources.cfg');
  const cfgId = idByName(P, 'grp/sources.cfg');
  const before = P.getFileText(cfgId);

  P.renameFile(idByName(P, 'grp/base.bel'), 'grp/renamed.bel');
  expect(P.getFileText(cfgId) === before, 'auto-sync off leaves cfg unchanged on rename');

  P.deleteFile(idByName(P, 'grp/renamed.bel'));
  expect(P.getFileText(cfgId) === before, 'auto-sync off leaves cfg unchanged on delete');
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

console.log('OK cfg sync (active suite tracks renames/deletes; moves leave entries; nested cfg chain)');
