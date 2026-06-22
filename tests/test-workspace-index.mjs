// Workspace Index — the cached, development-scoped parse substrate. Confirms it
// composes a suite AND a singleton (orphan) development uniformly, exposes
// cross-file structure, and memoizes the dependency graph with content-based
// invalidation.
import {
  getDevelopment, dependencyGraph, symbolsIn, definitionOf, referencesOf,
  sourceTypeOf, renameEdits, clearWorkspaceIndexCache,
} from '../editor-src/workspace-index.mjs';
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

clearWorkspaceIndexCache();

// ── development as the unit ───────────────────────────────────────────────────
const dev = getDevelopment(FILES, 'cr/equiv', getText, opts);
expect(dev.kind === 'module' && dev.paths.length === 2, 'suite development has both members');

// ── cross-file structure ──────────────────────────────────────────────────────
const names = symbolsIn(FILES, 'cr/equiv', getText, opts).map((n) => n.name);
expect(names.includes('pred') && names.includes('eq1') && names.includes('ctx'),
  `symbolsIn spans the suite (got ${names.join(',')})`);

const graph = dependencyGraph(FILES, 'cr/equiv', getText, opts);
const eq1 = [...graph.nodes.values()].find((n) => n.name === 'eq1');
const eq1Deps = graph.dependenciesOf(eq1.id).map((d) => d.name);
expect(eq1Deps.includes('pred') && eq1Deps.includes('term'),
  `dependencyGraph has cross-file edges (got ${eq1Deps.join(',')})`);

const def = definitionOf(FILES, 'cr/equiv', 'pred', getText, opts);
expect(def && def.fileId === 'cr/lam', 'definitionOf resolves pred to the prelude file');

// `term` is defined in lam.bel and used in equiv.bel — referencesOf returns the
// OTHER files' uses (the active file's own come from the engine at render time).
const refs = referencesOf(FILES, 'cr/lam', 'term', getText, opts);
const refFiles = refs.map((r) => r.fileId);
expect(refFiles.includes('cr/equiv'), `referencesOf finds the cross-file use (got ${refFiles.join(',')})`);

const sig = sourceTypeOf(FILES, 'cr/equiv', 'pred', getText, opts);
expect(sig && typeof sig.type === 'string', 'sourceTypeOf returns the source signature');

const edits = renameEdits(FILES, 'cr/equiv', 'term', getText, { ...opts, defFileId: 'cr/lam' });
expect(edits.some((p) => p.fileId === 'cr/lam' && p.edits.length),
  'renameEdits rewrites the defining prelude file');

// ── memoization + content invalidation ───────────────────────────────────────
const g1 = dependencyGraph(FILES, 'cr/equiv', getText, opts);
const g2 = dependencyGraph(FILES, 'cr/equiv', getText, opts);
expect(g1 === g2, 'dependencyGraph is memoized for unchanged content');

TEXTS['cr/lam'] = `${LAM}\nLF extra : type = ;`;
const g3 = dependencyGraph(FILES, 'cr/equiv', getText, opts);
expect(g3 !== g1, 'editing a member invalidates the cached graph');
expect([...g3.nodes.values()].some((n) => n.name === 'extra'), 'the rebuilt graph reflects the edit');
TEXTS['cr/lam'] = LAM;

// ── singleton (orphan) development uses the same paths ────────────────────────
const soloFiles = [{ id: 'x', name: 'x.bel' }];
const soloDev = getDevelopment(soloFiles, 'x', () => LAM, {});
expect(soloDev.paths.length === 1, 'an orphan file is a singleton development');
const soloNames = symbolsIn(soloFiles, 'x', () => LAM, {}).map((n) => n.name);
expect(soloNames.includes('pred') && soloNames.includes('term'),
  'symbolsIn works for a singleton development');

console.log('ok   test-workspace-index.mjs  workspace index (suite + singleton, cross-file structure, memo invalidation)');
