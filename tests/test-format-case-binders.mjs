import assert from 'node:assert/strict';
import { parser } from '../js/editor-src/beluga-parser.js';
import { formatString } from '../js/editor-src/format/document-format.mjs';

const src = `rec f : tp m/u → tp m/u =
  fn m ⇒ case m of
  | {P:tp m/u} [Δ ⊢ x] ⇒ x
  | {P:[Δ, z:tm _ _ ⊢ tm K'[] _]} [Δ ⊢ msf/var/U (\\x.P)] : [Δ ⊢ msf (\\z. P)] ⇒ x
;
`;

// The binders survive formatting, with the boxes padded or not (Settings: pad
// brackets, on by default). Padded, the box gets its spaces and the empty
// substitution on K' stays tight: an index is not a box (test-format-pad-brackets.mjs).
const fmt = (padBrackets) => formatString(src, parser.parse(src), { padBrackets });

const tight = fmt(false);
assert.ok(tight.includes('{P:tp m/u}') || tight.includes('{P : tp m/u}'), 'simple QuantifiedBinder preserved');
assert.ok(
  tight.includes('{P:[Δ, z:tm _ _ ⊢ tm K\'[] _]}') || tight.includes('{P : [Δ, z:tm _ _ ⊢ tm K\'[] _]}'),
  'contextual QuantifiedBinder in case branch must be preserved',
);
assert.ok(tight.includes('msf/var/U'), 'case pattern must be preserved');

const padded = fmt(true);
assert.ok(padded.includes('{P:tp m/u}'), 'padded: simple QuantifiedBinder preserved');
assert.ok(padded.includes('{P:[ Δ, z:tm _ _ ⊢ tm K\'[] _ ]}'),
  `padded: the contextual binder is preserved, its box padded and K'[] left tight\n${padded}`);
assert.ok(padded.includes('msf/var/U'), 'padded: case pattern must be preserved');
console.log('OK format case binders (padded and not)');
