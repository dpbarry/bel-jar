// B1 (scoped): a name defined in an EARLIER suite file is a genuine cross-file
// reference, even when no syntactic signature can be extracted for it (e.g. a
// `let`-bound name). Such a use must be classified `external` — NOT guessed at
// as an implicit binder — and flagged needsElaboration so the checker (which
// has the assembled prelude+active code loaded) supplies the real type. The
// fast syntactic path is unchanged for names that DO have a signature.
import assert from 'node:assert';
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { resolveHoverDoc } from '../js/editor-src/name-resolve.mjs';

function withProject(files, activeId, fn) {
  globalThis.Persist = {
    listFiles: () => files.list,
    getActiveFileId: () => activeId,
    getFileText: (id) => files.tx[id] || '',
    getActiveCfgForDir: (dir) => files.activeCfg?.[dir] || null,
  };
  try { return fn(); } finally { delete globalThis.Persist; }
}

function resolveAt(src, pos, files, activeId) {
  return withProject(files, activeId, () => resolveHoverDoc(parser.parse(src), Text.of(src.split('\n')), pos));
}

const list = [
  { id: 'a', name: 'p/a.bel' },
  { id: 'b', name: 'p/b.bel' },
  { id: 'c', name: 'p/t.cfg' },
];

// ── no-signature prelude name → external + needsElaboration (not implicit) ────
{
  const F1 = 'let x = [ |- z];';   // `x` is defined but has no extractable ": T"
  const F2 = 'let use = x;';
  const files = { list, tx: { a: F1, b: F2, c: 'a.bel\nb.bel\n' }, activeCfg: { p: 'p/t.cfg' } };
  const r = resolveAt(F2, F2.indexOf('x;'), files, 'b');
  assert.equal(r.kind, 'external', 'a prelude let-binding is a cross-file reference, not an implicit binder');
  assert.equal(r.needsElaboration, true, 'no syntactic signature → defer to the checker');
  assert.equal(r.sourceType, null, 'no fabricated source type for a no-signature external');
}

// ── signature DOES exist → unchanged fast syntactic path (no elaboration) ─────
{
  const F1 = 'LF tp : type = ;';
  const F2 = 'LF d2 : type =\n  | foo : tp -> d2\n;';
  const files = { list, tx: { a: F1, b: F2, c: 'a.bel\nb.bel\n' }, activeCfg: { p: 'p/t.cfg' } };
  const r = resolveAt(F2, F2.indexOf('tp ->'), files, 'b');
  assert.equal(r.kind, 'external', 'tp resolves cross-file');
  assert.equal(r.sourceType, 'type', 'syntactic signature still served instantly');
  assert.ok(!r.needsElaboration, 'no elaboration needed when a signature exists');
}

// ── isolation: a non-member file sees no prelude → no external classification ─
{
  const F1 = 'let x = [ |- z];';
  const F2 = 'let use = x;';
  // b.bel is NOT listed in the cfg → standalone → must not see a.bel's `x`.
  const files = { list, tx: { a: F1, b: F2, c: 'a.bel\n' }, activeCfg: { p: 'p/t.cfg' } };
  const r = resolveAt(F2, F2.indexOf('x;'), files, 'b');
  assert.ok(!(r && r.kind === 'external'), 'standalone file does not treat a sibling def as cross-file');
}

console.log('OK cross-file external elaborate (no-sig prelude name → external+needsElaboration, isolation kept)');
