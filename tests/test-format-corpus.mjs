import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EditorState } from '@codemirror/state';
import { indentRange, indentUnit } from '@codemirror/language';
import { parser } from '../js/editor-src/beluga-parser.js';
import { beluga } from '../js/editor-src/language.mjs';
import { formatString } from '../js/editor-src/format/document-format.mjs';
import { maybeExpandBelAliases } from '../js/editor-src/aliases.mjs';
import { prepareEditorDoc } from '../js/editor-src/editor-doc-prep.mjs';

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(bel|elf)$/.test(p) ? [p] : [];
});

const files = walk('library/data');
assert.ok(files.length > 100, 'library corpus present');
for (const f of files) {
  const src = maybeExpandBelAliases(readFileSync(f, 'utf8').replace(/\r\n?/g, '\n'));
  const refused = [];
  const once = formatString(src, parser.parse(src), { onRefuse: (r) => refused.push(src.slice(r.from, r.to).slice(0, 200)) });
  assert.deepEqual(refused, [], `${f}: printer output is not the same program`);
  assert.equal(formatString(once, parser.parse(once)), once, `${f}: formatting is not idempotent`);
  const st = EditorState.create({ doc: once, extensions: [indentUnit.of('  '), beluga()] });
  assert.ok(indentRange(st, 0, once.length).empty, `${f}: the editor's indentation disagrees with the printer`);
  assert.equal(prepareEditorDoc(once, f), once, `${f}: opening the imported file changes it`);
}

console.log(`OK format corpus (${files.length} files, .bel and .elf, as imported: same program, idempotent, indentation agrees, opens unchanged)`);
