// Hole parsing from the `## Holes ##` reconstruction report (real shim output).
import { parseHoles, hasHoleReport, parseHolesFromTree } from '../js/editor-src/prover/hole-report.mjs';
import { parser } from '../js/editor-src/beluga-parser.js';
import { Text } from '@codemirror/state';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// Verbatim shape from the browser spike (one body hole), plus a second hole to
// pin ordering + multi-hole. Note Beluga's "Hole number" is session-global.
const OUT = `## Type Reconstruction begin: input.bel ##
## Type Reconstruction done:  input.bel ##
## Holes: input.bel  ##
File "input.bel", line 7, column 17: Hole number 4, <anonymous>
  Meta-context:

  Computation context:
    n : [ |- nat]
    m : [ |- nat]
  Goal: [ |- nat]

  Variable of this type: n, m
File "input.bel", line 12, column 5: Hole number 5, ?goalH
  Meta-context:
    g : ctx
  Computation context:
    x : [g |- term]
  Goal: [g |- term]

  Variable of this type: x
`;

expect(hasHoleReport(OUT), 'hasHoleReport detects the section');
expect(!hasHoleReport('## Type Reconstruction done ##\nall good'), 'hasHoleReport false without a holes section');

const holes = parseHoles(OUT);
expect(holes.length === 2, `two holes parsed (got ${holes.length})`);

const [h0, h1] = holes;
expect(h0.line === 7 && h0.col === 17, `hole 0 at 7:17 (got ${h0.line}:${h0.col})`);
expect(h0.index === 0 && h1.index === 1, 'index renumbers 0,1 in source order');
expect(h0.name === null, 'anonymous hole has null name');
expect(h0.goal === '[ |- nat]', `hole 0 goal (got ${JSON.stringify(h0.goal)})`);
expect(h0.ctx.length === 2 && h0.ctx[0].name === 'n' && h0.ctx[0].type === '[ |- nat]',
  `hole 0 computation context (got ${JSON.stringify(h0.ctx)})`);
expect(h0.meta.length === 0, 'hole 0 has empty meta-context');

expect(h1.name === '?goalH', `named hole keeps its name (got ${h1.name})`);
expect(h1.line === 12 && h1.col === 5, `hole 1 at 12:5 (got ${h1.line}:${h1.col})`);
expect(h1.meta.length === 1 && h1.meta[0].name === 'g' && h1.meta[0].type === 'ctx',
  `hole 1 meta-context (got ${JSON.stringify(h1.meta)})`);
expect(h1.goal === '[g |- term]', `hole 1 goal (got ${JSON.stringify(h1.goal)})`);

// A clean no-hole output yields nothing.
expect(parseHoles('## Type Reconstruction done: input.bel ##').length === 0, 'no holes when none reported');

// ── parseHolesFromTree: instant SYNTACTIC holes (no checker round-trip) ──────
const src = 'rec plus : [ |- nat] -> [ |- nat] =\nfn n => fn m => ?\n;\nrec g : [ |- nat] =\n?goalH\n;';
const tree = parser.parse(src);
const doc = Text.of(src.split('\n'));
const ph = parseHolesFromTree(tree, doc);
expect(ph.length === 2, `two syntactic holes found (got ${ph.length})`);
expect(ph[0].line === 2 && ph[0].col === 17, `first hole at 2:17 (got ${ph[0].line}:${ph[0].col})`);
expect(ph[0].index === 0 && ph[1].index === 1, 'renumbered 0,1 in source order');
expect(ph[0].name === null, 'anonymous `?` has null name');
expect(ph[1].name === '?goalH', `named hole keeps its name (got ${ph[1].name})`);
expect(ph[0].from < ph[1].from && typeof ph[0].to === 'number', 'from/to offsets present');
// No goal/ctx/meta here — those come from the checker; positions are instant.
expect(ph[0].goal === undefined, 'syntactic hole carries no goal (engine merges checker data)');
// Memoized per tree (same array identity).
expect(parseHolesFromTree(tree, doc) === ph, 'memoized per Lezer tree');
expect(parseHolesFromTree(null, doc).length === 0, 'no tree → no holes');

console.log('OK  holes — parse report holes + instant syntactic holes from the tree');
