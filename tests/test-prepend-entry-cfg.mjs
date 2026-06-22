import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const persistSrc = readFileSync(join(here, '..', 'js', 'persist.js'), 'utf8');
const storage = new Map();
const fakeLocalStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};
const ctx = vm.createContext({
  globalThis: {},
  clearTimeout,
  setTimeout,
  TextEncoder,
  localStorage: fakeLocalStorage,
});
ctx.globalThis = ctx;
vm.runInContext(persistSrc, ctx);
const Persist = ctx.BelJarPersist;

Persist.replaceProject([
  { name: 'grp/base.bel', text: 'LF a : type;' },
  { name: 'grp/use.bel', text: 'LF b : type;' },
  { name: 'grp/suite.cfg', text: '% prelude header\nbase.bel\nuse.bel\n' },
  { name: 'grp/sig.elf', text: 'LF c : type;' },
]);

const cfgId = Persist.listFiles().find((f) => f.name === 'grp/suite.cfg').id;
expect(Persist.prependEntryToCfg('grp/suite.cfg', 'grp/sig.elf') === true, 'prepend succeeds');
const body = Persist.getFileText(cfgId);
expect(body.indexOf('sig.elf') < body.indexOf('base.bel'), 'sig.elf prepended before base.bel');
expect(body.startsWith('% prelude header'), 'comment line preserved at top');

expect(Persist.prependEntryToCfg('grp/suite.cfg', 'grp/sig.elf') === false, 'duplicate prepend rejected');
expect(Persist.prependEntryToCfg('grp/suite.cfg', 'other/sig.elf') === false, 'out-of-dir entry rejected');

Persist.setFileText(cfgId, '% only comments\n');
const newElfId = Persist.createFile('grp/new.elf');
Persist.setFileText(newElfId, 'LF d : type;');
expect(Persist.prependEntryToCfg('grp/suite.cfg', 'grp/new.elf') === true, 'prepend to comment-only cfg');
expect(Persist.getFileText(cfgId).trim() === '% only comments\nnew.elf', 'first entry after comments');

console.log('OK prependEntryToCfg');
