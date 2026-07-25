// Tooltip coverage for user-defined constructs that carry no ":"-declared type:
//   - schemas      → "type" row is the schema body (the blocks after "=")
//   - modules      → "type" row is a summary of exported member names
//   - pattern vars → bare lowercase atoms of case/let/fun patterns are LOCAL
//                    bindings ("Pattern Variable"), NOT reconstruction implicits
// Regression guard for the "IMPLICIT BINDER ctx / s3" misclassification.
import assert from 'node:assert';
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { resolveHoverDoc, referenceKind } from '../js/editor-src/name-resolve.mjs';
import { findGroupSignature, defsOf } from '../js/editor-src/semantic/project-prelude.mjs';

const at = (src, needle, occ = 1) => {
  let i = -1;
  for (let k = 0; k < occ; k++) i = src.indexOf(needle, i + 1);
  return i;
};
const resolve = (src, pos) => resolveHoverDoc(parser.parse(src), Text.of(src.split('\n')), pos);

// ── schemas ──────────────────────────────────────────────────────────────────
{
  const SRC = `schema ctx = block (x:tm, u:eq x x) + n;
inductive Pt : (g:ctx) [g |- p] -> ctype = | P : Pt [ |- b] ;`;

  const decl = resolve(SRC, at(SRC, 'ctx', 1));
  assert.equal(decl.kind, 'global');
  assert.equal(decl.label, 'Schema');
  assert.equal(decl.sourceType, 'block (x:tm, u:eq x x) + n',
    'schema decl-site shows its body as the type row');

  const use = resolve(SRC, at(SRC, 'ctx', 2)); // (g:ctx) annotation
  assert.equal(use.kind, 'global', 'same-file schema use is a global reference, not implicit');
  assert.equal(use.label, 'Schema');
  assert.equal(use.sourceType, 'block (x:tm, u:eq x x) + n');
  assert.notEqual(use.label, 'Implicit Binder', 'schema use is never an implicit-binder guess');
  assert.equal(referenceKind(parser.parse(SRC), Text.of(SRC.split('\n')), at(SRC, 'ctx', 2)), 'global');
}

// ── modules ──────────────────────────────────────────────────────────────────
{
  const SRC = `module Nats = struct
nat : type.
z : nat.
rec suc : [ |- nat] -> [ |- nat] = ?;
let two = [ |- z];
end;`;
  const m = resolve(SRC, at(SRC, 'Nats'));
  assert.equal(m.kind, 'global');
  assert.equal(m.label, 'Module');
  assert.equal(m.sourceType, '{ nat, z, suc, two }',
    'module shows a summary of exported member names (incl. nested rec/let heads)');
}

// ── pattern variables ────────────────────────────────────────────────────────
{
  const SRC = `rec sim_trans : (g:ctx) T =
fun s1 s2 .Simf t =>
let MakeTransSimf t1 s3 = s1 .Simf t in
MakeTransSimf t2 (sim_trans s3 s4)
;`;
  const isPatVar = (pos) => {
    const r = resolve(SRC, pos);
    return r && r.kind === 'local' && r.label === 'Pattern Variable';
  };
  assert.ok(isPatVar(at(SRC, 's3', 1)), 'let-pattern var binding → Pattern Variable');
  assert.ok(isPatVar(at(SRC, 's3', 2)), 'let-pattern var use → resolves to its binding');
  assert.ok(isPatVar(at(SRC, 's1', 1)), 'fun copattern var binding → Pattern Variable');
  assert.ok(isPatVar(at(SRC, '.Simf t', 1) + 6), 'single-letter copattern var t → Pattern Variable');

  // The uppercase constructor head of a pattern is NOT a pattern variable.
  const ctor = resolve(SRC, at(SRC, 'MakeTransSimf', 1));
  assert.notEqual(ctor && ctor.label, 'Pattern Variable',
    'an uppercase pattern constructor head is never reclassified as a binder');
}

// ── tuple + constructor-arg patterns ─────────────────────────────────────────
{
  const SRC = `rec f : T =
fn x => case x of
| (a, b) => foo a b
| C m => m
;`;
  const lbl = (pos) => { const r = resolve(SRC, pos); return r && r.label; };
  assert.equal(lbl(at(SRC, '(a, b)') + 1), 'Pattern Variable', 'tuple-pattern var bind');
  assert.equal(lbl(at(SRC, 'foo a b') + 4), 'Pattern Variable', 'tuple-pattern var use');
  assert.equal(lbl(at(SRC, 'C m') + 2), 'Pattern Variable', 'constructor-arg pattern var bind');
  assert.equal(lbl(at(SRC, '=> m') + 3), 'Pattern Variable', 'constructor-arg pattern var use');
}

// ── cross-file schema reference ──────────────────────────────────────────────
{
  const F1 = `schema ctx = n;`;
  const F2 = `inductive Pt : (g:ctx) [g |- p] -> ctype = | P : Pt [ |- b] ;`;
  const FILES = [
    { id: 'a', name: 'm/a.bel' },
    { id: 'b', name: 'm/b.bel' },
    { id: 'c', name: 'm/t.cfg' },
  ];
  const TX = { a: F1, b: F2, c: 'a.bel\nb.bel\n' };
  const getText = (id) => TX[id] || '';

  // The signature index (powers hover) must now carry the schema, matching the
  // defs index (powers Ctrl+click) — the two diverged before this fix.
  assert.ok(defsOf(F1).some((d) => d.name === 'ctx'), 'schema is in the defs index');
  const sig = findGroupSignature(FILES, 'b', 'ctx', getText, { activeCfgForDir: () => 'm/t.cfg' });
  assert.ok(sig && sig.type === 'n' && sig.label === 'schema',
    `schema is in the signature index too, got ${JSON.stringify(sig)}`);

  globalThis.Persist = {
    listFiles: () => FILES,
    getActiveFileId: () => 'b',
    getFileText: getText,
    getActiveCfgForDir: (dir) => (dir === 'm' ? 'm/t.cfg' : null),
  };
  try {
    const r = resolve(F2, at(F2, 'ctx'));
    assert.equal(r.kind, 'external', 'cross-file schema use classifies as external, not implicit');
    assert.equal(r.sourceType, 'n');
    assert.equal(r.externalFile, 'm/a.bel');
    assert.notEqual(r.label, 'Implicit Binder');
  } finally {
    delete globalThis.Persist;
  }
}

console.log('OK hover typeless coverage (schema body, module summary, pattern vars, cross-file schema)');
