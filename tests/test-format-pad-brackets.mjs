import assert from 'node:assert/strict';
import { parser } from '../js/editor-src/beluga-parser.js';
import { formatString } from '../js/editor-src/format/document-format.mjs';

function fmt(src, pad) {
  return formatString(src, parser.parse(src), { padBrackets: pad, printWidth: 1e9 });
}

assert.equal(
  fmt('rec f : [⊢ nat] → [⊢ nat] = fn x => x;\n', true),
  'rec f : [ ⊢ nat ] → [ ⊢ nat ] =\n  fn x => x\n;\n',
  'padding on forces spaces in boxes',
);

assert.equal(
  fmt('rec f : [ ⊢ nat ] → [ ⊢ nat ] = fn x => x;\n', true),
  'rec f : [ ⊢ nat ] → [ ⊢ nat ] =\n  fn x => x\n;\n',
  'padding on is idempotent on already-padded boxes',
);

assert.equal(
  fmt('rec f : [g ⊢ nat] → [⊢ nat] = fn x => x;\n', true),
  'rec f : [ g ⊢ nat ] → [ ⊢ nat ] =\n  fn x => x\n;\n',
  'padding on spaces a context head',
);

assert.equal(
  fmt('rec f : [⊢ nat] → [⊢ nat] =\n  case x of\n  | [] => x\n;\n', true),
  'rec f : [ ⊢ nat ] → [ ⊢ nat ] =\n  case x of\n  | [  ] => x\n;\n',
  'padding on turns an empty pattern into [  ]',
);

assert.equal(
  fmt('rec f : [⊢ nat] → [⊢ nat] = fn x => x;\n', false),
  'rec f : [⊢ nat] → [⊢ nat] =\n  fn x => x\n;\n',
  'padding off leaves a tight box tight',
);

assert.equal(
  fmt('rec f : [ ⊢ nat ] → [ ⊢ nat ] = fn x => x;\n', false),
  'rec f : [ ⊢ nat ] → [ ⊢ nat ] =\n  fn x => x\n;\n',
  'padding off keeps the author\'s spaces',
);

assert.equal(
  fmt('rec f : [⊢ nat] → [⊢ nat] =\n  case x of\n  | [  ] => x\n;\n', false),
  'rec f : [⊢ nat] → [⊢ nat] =\n  case x of\n  | [  ] => x\n;\n',
  'padding off keeps a padded empty pattern',
);

assert.equal(
  fmt('rec f : nat = M[ρ];\n', true),
  'rec f : nat =\n  M[ρ]\n;\n',
  'a substitution index is not a padded box',
);

console.log('OK format pad brackets');
