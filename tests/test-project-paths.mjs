import {
  isBelPath,
  isCfgEntryToken,
  isCfgPath,
  isCfgSourceEntry,
  isElfPath,
  isExtensionless,
  isProjectSourcePath,
  isSignaturePath,
} from '../js/editor-src/project-paths.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

expect(isExtensionless('foo'), 'basename without dot');
expect(!isExtensionless('foo.bel'), 'explicit .bel');
expect(isBelPath('grp/lemma'), 'extensionless path is implicit .bel');
expect(isBelPath('grp/lemma.bel'), 'explicit .bel');
expect(!isBelPath('grp/lemma.elf'), 'elf is not bel');
expect(!isBelPath('grp/sources.cfg'), 'cfg stays distinct');
expect(isSignaturePath('grp/lemma'), 'extensionless is signature');
expect(isElfPath('x.elf'), 'elf');
expect(isCfgPath('x.cfg'), 'cfg');
expect(isProjectSourcePath('lemma'), 'extensionless is project source');
expect(!isProjectSourcePath('readme.md'), 'other extensions excluded');

expect(isCfgEntryToken('name'), 'extensionless cfg entry');
expect(isCfgEntryToken('base.bel'), 'bel cfg entry');
expect(isCfgEntryToken('extra.cfg'), 'nested cfg entry');
expect(!isCfgEntryToken('foo.bar'), 'unknown extension not an entry');
expect(!isCfgEntryToken('use.'), 'trailing dot not an entry');
expect(isCfgSourceEntry('name'), 'extensionless is source entry');
expect(!isCfgSourceEntry('nested.cfg'), 'cfg include is not source entry');

console.log('OK bel-paths');
