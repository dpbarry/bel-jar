import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';
import { buildInspectorModel, groupByKind } from '../editor-src/bel-inspector.mjs';

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

const doc = Text.of(SAMPLE.split('\n'));
const e = createSemanticEngine();
e.update(parser.parse(SAMPLE), doc);
const sym = (n) => e.debugSnapshot().symbols.find((s) => s.name === n && s.isGlobal);

function offsetOf(needle, nth = 0) {
  const s = SAMPLE;
  let idx = -1;
  for (let i = 0; i <= nth; i++) idx = s.indexOf(needle, idx + 1);
  return idx;
}

const ndPos = sym('nd').nameRange.from;
const intel = e.intelSyncAt(ndPos);
expect(intel, 'intelSyncAt resolves on the nd declaration');
for (const key of ['name', 'label', 'definition', 'references', 'dependencies',
  'dependents', 'impact', 'status', 'userStatus', 'type', 'typePending']) {
  expect(key in intel, `intelSyncAt result has "${key}"`);
}

expect(intel.userStatus && typeof intel.userStatus.state === 'string',
  'userStatus has a state string');
expect(['settled', 'recalculating', 'error'].includes(intel.userStatus.state),
  `userStatus.state is one of settled/recalculating/error (got ${intel.userStatus.state})`);
expect(intel.userStatus.state === 'settled',
  'a decl with a source signature and no session reads "settled" (not blocked/stale)');

expect(intel.userStatus.state !== 'error',
  'free implicit binders do not make nd read as an error');
expect(intel.name === 'nd', 'intelSyncAt.name is nd');
expect(Array.isArray(intel.references), 'references is an array');
expect(Array.isArray(intel.dependencies), 'dependencies is an array');
expect(Array.isArray(intel.dependents), 'dependents is an array');
expect(Array.isArray(intel.impact), 'impact is an array');

const none = e.intelSyncAt(0);
expect(none === null || typeof none === 'object',
  'intelSyncAt returns null or a record at a non-identifier position');

const fresh = createSemanticEngine();
expect(fresh.intelSyncAt(0) === null, 'intelSyncAt is null before first update()');

const ndDependents = e.dependentsOf(sym('nd').id).map((d) => d.name);
expect(ndDependents.includes('⊃I'), 'nd is used by ⊃I');
expect(ndDependents.includes('⊤I'), 'nd is used by ⊤I');

const impIDeps = e.dependenciesOf(sym('⊃I').id).map((d) => d.name);
expect(impIDeps.includes('nd'), '⊃I depends on nd');
expect(impIDeps.includes('⊃'), '⊃I depends on ⊃');

const oImpactRaw = e.impactOf(sym('o').id);
expect(oImpactRaw.every((d) => d.kind === 'cascade' || d.kind === 'uses'),
  'engine impact entries are tagged cascade|uses (two-tier blast radius)');
const oImpact = oImpactRaw.map((d) => d.name).sort();
expect(oImpact.includes('nd'), `changing o should impact nd transitively, got ${oImpact}`);
expect(oImpact.includes('⊃') || oImpact.includes('⊤'), 'o impacts its own constructors');
const oDirect = e.dependentsOf(sym('o').id).map((d) => d.name);
expect(oDirect.every((n) => oImpact.includes(n)),
  'direct dependents of o are within its impact set');

const ndRange = e.symbolRangeById(sym('nd').id);
expect(ndRange && ndRange.from === sym('nd').nameRange.from,
  'symbolRangeById returns the decl name range');
expect(e.symbolRangeById('no-such-id') == null, 'symbolRangeById is null for unknown ids');

const grouped = groupByKind([
  { id: 'a', name: 'A', kind: 'signature' },
  { id: 'a', name: 'A', kind: 'signature' },
  { id: 'b', name: 'B', kind: 'body' },
]);
const sigGroup = grouped.find((g) => g.kind === 'signature');
const bodyGroup = grouped.find((g) => g.kind === 'body');
expect(sigGroup && sigGroup.items.length === 1, 'groupByKind dedupes duplicate ids within a kind');
expect(bodyGroup && bodyGroup.items.length === 1, 'groupByKind keeps the body bucket');
expect(grouped.indexOf(sigGroup) < grouped.indexOf(bodyGroup),
  'groupByKind orders signature before body');

const model = buildInspectorModel(e, ndPos);
expect(model && model.name === 'nd', 'buildInspectorModel resolves nd');
expect(model.statusState === 'settled', 'inspector model carries the honest status state');
expect(typeof model.statusDetail === 'string', 'inspector model carries a status detail string');
expect(Array.isArray(model.usedBy), 'model.usedBy is grouped (array)');
expect(Array.isArray(model.dependsOn), 'model.dependsOn is grouped (array)');
const usedByNames = model.usedBy.flatMap((g) => g.items.map((i) => i.name));
expect(usedByNames.includes('⊃I') && usedByNames.includes('⊤I'),
  'inspector model "used by" lists both constructors');
expect(buildInspectorModel(e, 0) === null,
  'buildInspectorModel is null at a non-identifier position');

const aPos = SAMPLE.indexOf('nd A') + 3;
const aIntel = e.intelSyncAt(aPos);
const aHover = e.hoverAt(aPos);
expect(aIntel && aIntel.type != null, 'intelSyncAt resolves a type for a local/implicit binder (was null/spinning)');
expect(aHover.status === 'ready' && aHover.type != null, 'hoverAt also resolves it (sanity)');
expect(aIntel.type === aHover.type,
  `inspector type must equal tooltip type for the same position (got ${JSON.stringify(aIntel.type)} vs ${JSON.stringify(aHover.type)})`);
expect(aIntel.userStatus.state === 'settled',
  'a binder with a known type reads "settled", never spinning "recalculating"');

const oPos2 = SAMPLE.indexOf('LF o') + 3;
expect(e.intelSyncAt(oPos2).type === e.hoverAt(oPos2).type,
  'inspector type == tooltip type on a global decl name too');

for (const probe of [aPos, oPos2, ndPos]) {
  const st = e.intelSyncAt(probe).userStatus.state;
  expect(st === 'settled' || st === 'error',
    `no-session engine never reports "recalculating" (pos ${probe} -> ${st})`);
}

console.log('OK semantic intel (intelSyncAt shape, deps/dependents/impact, groupByKind, inspector model, tooltip==inspector single-source-of-truth)');
