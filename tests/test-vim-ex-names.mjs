// ⛔ The mirror of Vim's own ex table, checked against the package on every run.
//
// `vim-ex-names.mjs` exists because the package publishes NO accessor: its
// `defaultExCommandMap` is a module-local array and `exCommandDispatcher` is a
// module-local closure, so there is no runtime question to ask about whether a
// name is one of vim's. The list is therefore a copy — and a copy is a lie
// waiting for the next package bump unless something re-reads the source. This
// is that something.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIM_EX_COMMANDS, vimExCandidates, _pure } from '../js/editor-src/ide/modal/vim-ex-names.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ⚠ By PATH, not by `require.resolve`: the package's `exports` map does not
// expose `vim.js`, and this is reading its source, not importing it.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vimSrc = readFileSync(join(root, 'node_modules', '@replit', 'codemirror-vim-core', 'vim.js'), 'utf8');
const start = vimSrc.indexOf('var defaultExCommandMap = [');
expect(start > 0, 'found the package\'s own ex table (it moved or was renamed)');
const block = vimSrc.slice(start, vimSrc.indexOf('];', start));
const fromPackage = [...block.matchAll(/\{\s*name:\s*'([^']+)'(?:\s*,\s*shortName:\s*'([^']+)')?[^}]*\}/g)]
  .map((m) => [m[1], m[2] || '']);

expect(fromPackage.length > 20, `the table parsed (${fromPackage.length} entries)`);
const mine = VIM_EX_COMMANDS.map(([n, s]) => n + '|' + s).join(',');
const theirs = fromPackage.map(([n, s]) => n + '|' + s).join(',');
expect(mine === theirs,
  'the mirror matches the package EXACTLY\n  package: ' + theirs + '\n  mirror:  ' + mine);

// ⛔ Every name carries words. A candidate row with a name and no explanation
// sends the reader to `:help`, which is the one place a browser IDE cannot go.
for (const [name] of VIM_EX_COMMANDS) {
  expect(_pure.WORDS[name], `"${name}" has no description`);
}
expect(Object.keys(_pure.WORDS).length === VIM_EX_COMMANDS.length,
  'and there are no descriptions left over for names the package dropped');

// The short name rides as an alias, because that is how a vi user types it.
const rows = vimExCandidates();
const noh = rows.find((r) => r.value === 'nohlsearch');
expect(noh && noh.aliases.indexOf('noh') >= 0, '`:noh` finds `nohlsearch`');
expect(rows.every((r) => r.id.startsWith('vim:')),
  'every row is marked as vim\'s, so nothing tries to run it through BelJar');
expect(rows.every((r) => r.detail === 'Vim'), 'and reads as vim\'s in the list');

console.log(`OK vim ex names (${VIM_EX_COMMANDS.length} mirrored from the package, all described)`);
