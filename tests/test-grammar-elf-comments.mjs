import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { syntaxLintTree } from '../js/editor-src/ide/syntax-lint.mjs';

const src = '%% Twelf-style header\n% normal comment\nLF o : type = ;\n';
const diags = syntaxLintTree(parser.parse(src), Text.of(src.split('\n')));
assert.equal(diags.length, 0, `expected no syntax diags, got ${diags.length}`);

let commentSpans = 0;
parser.parse(src).iterate({
  enter(n) {
    if (n.name === 'LineComment') commentSpans++;
  },
});
assert.equal(commentSpans, 2, 'both %% and % lines should be LineComment nodes');

const fol = readFileSync(new URL('../Beluga-W/examples/fol/fol.elf', import.meta.url), 'utf8');
assert.equal(syntaxLintTree(parser.parse(fol), Text.of(fol.split('\n'))).length, 0, 'fol.elf should lint clean');

console.log('OK %% line comments and fol.elf grammar');
