import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import {
  belugaCheckFingerprint,
  settlementTrigger,
} from '../editor-src/semantic/check-gate.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function syntaxOf(text, version) {
  const tree = parser.parse(text);
  return { tree, doc: Text.of(text.split('\n')), version };
}

const base = `LF t : type =\n  | z : t\n;\n`;
const s0 = syntaxOf(base, 1);

expect(settlementTrigger(s0, syntaxOf(base + ' ', 2)) === 'cosmetic', 'trailing space is cosmetic');
expect(settlementTrigger(s0, syntaxOf(' ' + base, 3)) === 'cosmetic', 'leading space is cosmetic');
expect(settlementTrigger(s0, syntaxOf(base.replace('\n', '\n\n'), 4)) === 'cosmetic', 'extra blank line is cosmetic');
expect(settlementTrigger(s0, syntaxOf(base.replace(': t', ':  t'), 5)) === 'cosmetic', 'inline space run is cosmetic');

const commented = `${base}% note\n`;
expect(settlementTrigger(s0, syntaxOf(commented, 6)) === 'cosmetic', 'comment-only edit is cosmetic');
expect(
  settlementTrigger(syntaxOf(commented, 6), syntaxOf(`${base}% longer note\n`, 7)) === 'cosmetic',
  'comment tweak is cosmetic',
);

const renamed = base.replace('z', 's');
expect(settlementTrigger(s0, syntaxOf(renamed, 8)) === 'semantic', 'identifier change is semantic');

const extraCtor = base.replace(';\n', '  | s : t\n;\n');
expect(settlementTrigger(s0, syntaxOf(extraCtor, 9)) === 'semantic', 'adding a constructor is semantic');

const broken = `LF t : type =\n  | z t\n;\n`;
expect(settlementTrigger(s0, syntaxOf(broken, 10)) === 'syntax-only', 'syntax-fault edit is syntax-only');

const fp0 = belugaCheckFingerprint(s0);
expect(fp0 === belugaCheckFingerprint(syntaxOf(base + ' ', 11)), 'fingerprint ignores trailing space');
expect(fp0 === belugaCheckFingerprint(syntaxOf(commented, 12)), 'fingerprint ignores comments');
expect(fp0 !== belugaCheckFingerprint(syntaxOf(renamed, 13)), 'fingerprint catches semantic edit');

console.log('OK test-check-gate');
