import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const exSrc = readFileSync(join(here, '..', 'js', 'explorer', 'explorer.js'), 'utf8');
// eslint-disable-next-line no-new-func
new Function(exSrc)();
const EX = globalThis.Explorer;

const ROWS = [
  { kind: 'folder', key: 'lib' },
  { kind: 'file', key: 'a' },
  { kind: 'file', key: 'b' },
  { kind: 'folder', key: 'pkg' },
  { kind: 'file', key: 'c' },
];

const range = EX.rangeSelectVisibleRows(
  ROWS,
  { kind: 'file', key: 'a' },
  { kind: 'file', key: 'c' },
);
expect(range.fileIds.size === 3 && range.fileIds.has('a') && range.fileIds.has('b')
  && range.fileIds.has('c'), 'shift range includes files between anchor and end');
expect(range.folderPaths.size === 1 && range.folderPaths.has('pkg'),
  'shift range includes folders in span');

const rangeRev = EX.rangeSelectVisibleRows(
  ROWS,
  { kind: 'file', key: 'c' },
  { kind: 'file', key: 'a' },
);
expect(rangeRev.fileIds.size === 3, 'shift range works when end is above anchor');

const toggled = EX.toggleCtrlSelection(new Set(), new Set(), { kind: 'file', key: 'b' }, 'a');
expect(toggled.fileIds.size === 2 && toggled.fileIds.has('a') && toggled.fileIds.has('b'),
  'ctrl click seeds active file and clicked file');

const toggledOff = EX.toggleCtrlSelection(toggled.fileIds, toggled.folderPaths, { kind: 'file', key: 'b' }, 'a');
expect(toggledOff.fileIds.size === 1 && toggledOff.fileIds.has('a'), 'ctrl click toggles file off');

const FILES = [
  { id: 'a', name: 'lib/a.bel' },
  { id: 'b', name: 'lib/b.bel' },
  { id: 'c', name: 'pkg/c.bel' },
];
const capOk = EX.selectionDragCapability(['a', 'b'], [], FILES);
expect(capOk.ok && capOk.fileIds.length === 2 && capOk.folderPaths.length === 0,
  'same-parent files can multi-drag');

const capMixed = EX.selectionDragCapability(['a', 'c'], [], FILES);
expect(!capMixed.ok, 'mixed-parent files cannot multi-drag');

const ABC_FILES = [
  { id: 'b', name: 'A/B.bel' },
  { id: 'c', name: 'A/C.bel' },
];
const capABC = EX.selectionDragCapability(['b', 'c'], ['A'], ABC_FILES);
expect(capABC.ok && capABC.folderPaths.length === 1 && capABC.folderPaths[0] === 'A'
  && capABC.fileIds.length === 0, 'folder plus all direct children normalizes to folder root');

const capAB = EX.selectionDragCapability(['b'], ['A'], ABC_FILES);
expect(!capAB.ok, 'folder with only some direct children cannot multi-drag');

const NEST_FILES = [
  { id: 'd', name: 'A/B/D.bel' },
  { id: 'c', name: 'A/C.bel' },
];
const capNestPartial = EX.selectionDragCapability(['c'], ['A', 'A/B'], NEST_FILES);
expect(!capNestPartial.ok, 'selected nested folder must include all of its direct children');

const capNestFull = EX.selectionDragCapability(['d', 'c'], ['A', 'A/B'], NEST_FILES);
expect(capNestFull.ok && capNestFull.folderPaths.length === 1 && capNestFull.folderPaths[0] === 'A',
  'complete folder subtree selection normalizes to outermost folder');

const capSiblings = EX.selectionDragCapability(['a'], ['lib/sub'], [
  { id: 'a', name: 'lib/a.bel' },
]);
expect(capSiblings.ok && capSiblings.fileIds.length === 1 && capSiblings.folderPaths.length === 1,
  'sibling file and folder at same level can multi-drag');

const mixedDrag = EX.sameParentFileIdsForDrag(
  ['a', 'b', 'c'],
  { kind: 'file', key: 'a' },
  FILES,
);
expect(mixedDrag && mixedDrag.length === 2 && mixedDrag.indexOf('a') !== -1
  && mixedDrag.indexOf('b') !== -1, 'drag uses same-parent file subset when selection spans folders');

var selSet = new Set(['a', 'b']);
expect([].slice.call(selSet).length === 0, 'slice.call does not read Set contents');
expect(Array.from(selSet).length === 2, 'Array.from reads Set for drag payload');

console.log('OK explorer-selection');
