// Cross-file (suite-wide) dependency graph — edges that span files, which the
// single-document semantic-graph cannot see.
import { buildGroupGraph } from '../editor-src/group-graph.mjs';
import { activeCfgResolver } from '../editor-src/project-prelude.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const LAM = `LF term : type =
  | lam : (term -> term) -> term
  | app : term -> term -> term
;
LF pred : term -> term -> type =
  | beta : pred (app (lam M) N) (M N)
;`;

const EQUIV = `schema ctx = block x:term, t:pred x x;
rec eq1 : (g:ctx) [g |- pred M N] -> [g |- term] = ?;`;

const FILES = [
  { id: 'cr/lam', name: 'church-rosser/lam.bel' },
  { id: 'cr/equiv', name: 'church-rosser/equiv.bel' },
  { id: 'cr/cfg', name: 'church-rosser/test.cfg' },
];
const TEXTS = { 'cr/lam': LAM, 'cr/equiv': EQUIV, 'cr/cfg': 'lam.bel\nequiv.bel\n' };
const getText = (id) => TEXTS[id] || '';
const opts = { activeCfgForDir: activeCfgResolver({ 'church-rosser': 'church-rosser/test.cfg' }) };

const graph = buildGroupGraph(FILES, 'cr/equiv', getText, opts);
const nodeByName = (name) => [...graph.nodes.values()].find((n) => n.name === name);

const pred = nodeByName('pred');
const term = nodeByName('term');
const eq1 = nodeByName('eq1');
const ctx = nodeByName('ctx');
expect(pred && pred.fileId === 'cr/lam', 'pred node comes from the prelude file');
expect(eq1 && eq1.fileId === 'cr/equiv', 'eq1 node comes from the active file');
expect(term && ctx, 'term and ctx nodes present');

// The whole point: cross-file edges exist.
const crossEdge = graph.edges.some(
  (e) => graph.nodes.get(e.from)?.fileId !== graph.nodes.get(e.to)?.fileId,
);
expect(crossEdge, 'graph contains at least one cross-file edge');

const eq1Deps = graph.dependenciesOf(eq1.id).map((d) => d.name);
expect(eq1Deps.includes('pred') && eq1Deps.includes('term'),
  `eq1 depends on prelude pred + term (got ${eq1Deps.join(',')})`);

const predDependents = graph.dependentsOf(pred.id).map((d) => d.name);
expect(predDependents.includes('eq1'),
  `pred is used by eq1 across files (got ${predDependents.join(',')})`);
expect(predDependents.includes('beta'),
  `pred still gets its intra-file dependent beta (got ${predDependents.join(',')})`);

expect(graph.nodeForName('pred')?.fileId === 'cr/lam',
  'nodeForName resolves a name to its closest-prelude definition');

// Impact is transitive over signature edges: term → (pred, ctx, eq1…).
const termImpact = graph.impactOf(term.id).map((d) => d.name);
expect(termImpact.includes('pred'), `term impacts pred (got ${termImpact.join(',')})`);

// Standalone (no cfg) → only the active file, still a valid graph.
const solo = buildGroupGraph(
  [{ id: 'x', name: 'x.bel' }],
  'x',
  () => LAM,
  {},
);
expect(solo.nodes.size > 0, 'standalone file still yields nodes');
const soloPred = [...solo.nodes.values()].find((n) => n.name === 'pred');
expect(solo.dependentsOf(soloPred.id).some((d) => d.name === 'beta'),
  'standalone intra-file edges still work');

// ── View-independence: the graph is DEVELOPMENT-wide, not active-relative ─────
// Regression for the "used by 3 here, 5 there" bug: a symbol in an EARLY file is
// used by LATER files; its dependents must read identically whether you ask from
// the earliest or the latest member. (Before the fix the graph was scoped to the
// active file's prelude prefix, so an early active file couldn't see later uses.)
{
  const P1 = 'LF tm : type =\n  | u : tm\n;';
  const P2 = 'LF wa : tm -> type =\n  | wb : wa u\n;'; // uses tm + u
  const P3 = 'LF xa : tm -> type =\n  | xb : xa u\n;'; // uses tm + u
  const F = [
    { id: 'd/p1', name: 'dev/p1.bel' },
    { id: 'd/p2', name: 'dev/p2.bel' },
    { id: 'd/p3', name: 'dev/p3.bel' },
    { id: 'd/cfg', name: 'dev/d.cfg' },
  ];
  const T = { 'd/p1': P1, 'd/p2': P2, 'd/p3': P3, 'd/cfg': 'p1.bel\np2.bel\np3.bel\n' };
  const gt = (id) => T[id] || '';
  const o = { activeCfgForDir: activeCfgResolver({ dev: 'dev/d.cfg' }) };

  const fromFirst = buildGroupGraph(F, 'd/p1', gt, o); // earliest active
  const fromLast = buildGroupGraph(F, 'd/p3', gt, o); // latest active

  const depNames = (graph) => {
    const u = graph.nodeForName('u');
    return graph.dependentsOf(u.id).map((d) => d.name).sort();
  };
  const a = depNames(fromFirst);
  const b = depNames(fromLast);
  expect(JSON.stringify(a) === JSON.stringify(b),
    `u's dependents must be identical from the earliest vs latest active file (got ${a} vs ${b})`);
  expect(a.includes('wb') && a.includes('xb'),
    `u's dependents span BOTH later files regardless of active file (got ${a})`);
}

console.log('ok   test-group-graph.mjs  cross-file dependency graph (edges span files, impact, standalone, '
  + 'development-wide view-independence)');
