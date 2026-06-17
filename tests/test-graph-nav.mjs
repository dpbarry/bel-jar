import {
  buildNavEntry, createNavState, navPush, navBack, navForward, navGoTo,
  navCurrent, navCanBack, navCanForward, navBreadcrumbLabel, applyNavJump,
  fuzzySearchNodes, graphKeyForEntry, navEntriesEqual,
} from '../editor-src/graph/graph-nav.mjs';
import { buildNeighborhood, buildGlobalModel } from '../editor-src/bel-graph-view.mjs';
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const SAMPLE = `LF o : type =
  | ⊃ : o → o → o
  | ⊤ : o
;
LF nd : o → type =
  | ⊃I : (nd A → nd B) → nd (A ⊃ B)
  | ⊤I : nd ⊤
;
`;

const e = createSemanticEngine();
e.update(parser.parse(SAMPLE), Text.of(SAMPLE.split('\n')));
const idOf = (name) => [...e.getSnapshot().graph.nodeMap.values()].find((n) => n.name === name)?.id;
const ndId = idOf('nd');
const oId = idOf('o');

// --- nav stack ---
let nav = createNavState(buildNavEntry({ mode: 'neighborhood', rootId: ndId, depth: 1 }));
expect(navCurrent(nav).rootId === ndId, 'initial entry root');
expect(!navCanBack(nav), 'cannot back from start');

nav = navPush(nav, buildNavEntry({ mode: 'neighborhood', rootId: oId, depth: 1 }));
expect(navCanBack(nav), 'can back after push');
expect(navCurrent(nav).rootId === oId, 'current is o');

nav = navPush(nav, buildNavEntry({ mode: 'neighborhood', rootId: oId, depth: 1 }));
expect(nav.stack.length === 2, 'dedupe consecutive identical entry');

nav = navBack(nav);
expect(navCurrent(nav).rootId === ndId, 'back returns to nd');

nav = navForward(nav);
expect(navCurrent(nav).rootId === oId, 'forward returns to o');

nav = navGoTo(nav, 0);
expect(nav.index === 0, 'go to index 0');

const model = applyNavJump(nav, e, { buildGlobalModel, buildNeighborhood });
expect(model && model.root === ndId, 'applyNavJump builds neighborhood from stack');

expect(navBreadcrumbLabel({ mode: 'global' }, () => 'x') === 'whole file', 'global crumb');
expect(navBreadcrumbLabel({ mode: 'global', focusId: ndId }, () => 'nd') === 'nd', 'global focused crumb');
expect(navBreadcrumbLabel({ mode: 'neighborhood', rootId: ndId }, () => 'nd') === 'nd', 'local crumb');

nav = navPush(nav, buildNavEntry({ mode: 'global' }));
expect(navCurrent(nav).mode === 'global' && navCurrent(nav).focusId == null, 'push global whole file');
nav = navPush(nav, buildNavEntry({ mode: 'global', focusId: oId }));
expect(navCurrent(nav).focusId === oId, 'push global focus');
nav = navPush(nav, buildNavEntry({ mode: 'global', focusId: oId }));
expect(nav.stack.length === 3, 'dedupe identical global focus');
nav = navPush(nav, buildNavEntry({ mode: 'global', focusId: ndId }));
expect(navCurrent(nav).focusId === ndId, 'push different global focus');
expect(navEntriesEqual(
  { mode: 'global', focusId: oId },
  { mode: 'global', focusId: oId },
), 'navEntriesEqual global focus');
expect(!navEntriesEqual(
  { mode: 'global', focusId: oId },
  { mode: 'global', focusId: null },
), 'navEntriesEqual distinguishes focus');

nav = navPush(nav, buildNavEntry({ mode: 'neighborhood', rootId: ndId, depth: 1 }));
nav = navPush(nav, buildNavEntry({ mode: 'global', focusId: ndId }));
expect(navCurrent(nav).mode === 'global' && navCurrent(nav).focusId === ndId,
  'local then global keeps root as global focus');

expect(graphKeyForEntry({ mode: 'global' }) === 'graph:__global__', 'global key');
expect(graphKeyForEntry({ mode: 'neighborhood', rootId: ndId }) === 'graph:' + ndId, 'local key');

// --- fuzzy search ---
const nodes = [
  { id: '1', name: 'nd' },
  { id: '2', name: '⊃I' },
  { id: '3', name: '⊤I' },
  { id: '4', name: 'o' },
];
const hits = fuzzySearchNodes(nodes, 'I');
expect(hits.length === 2, 'fuzzy finds ⊃I and ⊤I');
expect(hits[0].name === '⊃I' || hits[0].name === '⊤I', 'returns matching nodes');

const prefix = fuzzySearchNodes(nodes, 'nd');
expect(prefix.length === 1 && prefix[0].name === 'nd', 'prefix match nd');

console.log('OK graph nav (history, fuzzy search)');
