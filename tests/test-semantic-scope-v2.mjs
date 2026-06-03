// Semantic Engine V2 — explicit scope frames lock-down.
// Replaces the old "binder is visible across its parent's whole range"
// heuristic with precise per-construct scope spans: a binder is visible from
// its introduction to the end of its delimiting construct (its body). Pins:
//   * a context-entry variable is visible in the turnstile term `[g, x:T |- x]`
//     (the old span ended before `|-`);
//   * a fn/mlam parameter is visible in the body and does not leak to a
//     sibling declaration;
//   * nested binders shadow correctly and resolve innermost.
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const eng = (src) => {
  const e = createSemanticEngine();
  e.update(parser.parse(src), Text.of(src.split('\n')));
  return e;
};
const refAt = (e, pos) => e.debugSnapshot().references.find((r) => r.range.from <= pos && pos <= r.range.to);

// --- Context-entry variable is visible in the turnstile term ------------
{
  const SRC = `LF tp : type =\n  | unit : tp\n;\nrec f : [g, x:tp |- x] → [ |- tp] =\n  fn y => y\n;\n`;
  const e = eng(SRC);
  const xPos = SRC.lastIndexOf('|- x') + 3;
  const rx = refAt(e, xPos);
  expect(rx && rx.name === 'x', "the x after the turnstile should be a reference");
  expect(rx.resolution === 'local', 'context-entry variable x must resolve as a local in the turnstile term');
  expect(rx.namespace === 'local-lower', `expected local-lower, got ${rx.namespace}`);
}

// --- fn parameter: visible in body, no leak into a sibling declaration ---
{
  const SRC = `LF o : type =\n  | z : o\n;\nrec g : [ |- o] =\n  fn w => w\n;\nrec h : [ |- o] =\n  w\n;\n`;
  const e = eng(SRC);
  const wBody = SRC.indexOf('=> w') + 3;
  const wSibling = SRC.lastIndexOf('  w') + 2;
  expect(refAt(e, wBody).resolution === 'local', 'fn parameter w must resolve as local in the function body');
  expect(refAt(e, wSibling).resolution === 'unresolved', 'w must not leak into the sibling declaration h');
}

// --- Nested binders shadow and resolve innermost ------------------------
{
  const SRC = `LF o : type =\n  | z : o\n;\nrec k : [ |- o] =\n  fn a => fn a => a\n;\n`;
  const e = eng(SRC);
  const locals = e.debugSnapshot().symbols.filter((s) => s.name === 'a' && !s.isGlobal);
  expect(locals.length === 2, `expected two distinct a binders, got ${locals.length}`);
  expect(new Set(locals.map((s) => s.id)).size === 2, 'the two a binders must be distinct symbols');
  const usePos = SRC.lastIndexOf('=> a') + 3;
  const use = refAt(e, usePos);
  expect(use && use.resolution === 'local', 'innermost a use resolves to a local');
  // It must resolve to the INNER binder (the one whose scope starts latest).
  const inner = locals.slice().sort((p, q) => q.range.from - p.range.from)[0];
  expect(use.symbolId === inner.id, 'a must resolve to the innermost (shadowing) binder');
}

// --- A binder is captured with a precise (not parent-wide) scope span ---
{
  const SRC = `LF nat : type =\n  | zz : nat\n;\nLF vec : {n : nat} type =\n;\n`;
  const e = eng(SRC);
  const n = e.debugSnapshot().symbols.find((s) => s.name === 'n' && !s.isGlobal);
  expect(n, 'pi binder n should be captured as a local');
  expect(n.range.from > SRC.indexOf('{n'), 'binder scope must start at/after its introduction, not before');
}

console.log('OK semantic scope v2 (context turnstile, fn body, no leak, shadowing, precise spans)');
