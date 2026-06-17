import { EditorState } from '@codemirror/state';
import {
  countCfgEntries,
  iterCfgEntries,
  resolveCfgEntryPath,
} from '../editor-src/bel-cfg-editor.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const text = '% prelude\nbase.bel\n\nuse.bel\njunk\n';
const doc = EditorState.create({ doc: text }).doc;

const entries = iterCfgEntries(doc);
expect(entries.length === 3, 'three non-comment lines');
expect(entries[0].text === 'base.bel' && entries[0].index === 0, 'first entry index');
expect(entries[1].text === 'use.bel' && entries[1].index === 1, 'second entry index');
expect(entries[2].index === -1, 'junk line is not an entry');
expect(text.slice(entries[0].from, entries[0].to) === 'base.bel', 'entry span is exact token');

expect(countCfgEntries(doc) === 2, 'counts valid entries only');
expect(resolveCfgEntryPath('grp/sources.cfg', 'base.bel') === 'grp/base.bel',
  'resolves relative to cfg directory');

console.log('OK cfg editor (entry spans, suite count)');
