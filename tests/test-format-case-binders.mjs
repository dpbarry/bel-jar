import assert from 'node:assert/strict';
import { parser } from '../js/editor-src/beluga-parser.js';
import { formatString } from '../js/editor-src/format/document-format.mjs';

const src = `rec f : tp m/u → tp m/u =
  fn m ⇒ case m of
  | {P:tp m/u} [Δ ⊢ x] ⇒ x
  | {P:[Δ, z:tm _ _ ⊢ tm K'[] _]} [Δ ⊢ msf/var/U (\\x.P)] : [Δ ⊢ msf (\\z. P)] ⇒ x
;
`;

const out = formatString(src, parser.parse(src));
assert.ok(out.includes('{P:tp m/u}') || out.includes('{P : tp m/u}'), 'simple QuantifiedBinder preserved');
assert.ok(
  out.includes('{P:[Δ, z:tm _ _ ⊢ tm K') || out.includes('{P : [Δ, z:tm _ _ ⊢ tm K'),
  'contextual QuantifiedBinder in case branch must be preserved',
);
assert.ok(out.includes('msf/var/U'), 'case pattern must be preserved');

console.log('OK format case binders');
