import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';
import { createSemanticSession } from '../editor-src/semantic/semantic-session.mjs';
import { createSemanticScheduler } from '../editor-src/semantic/semantic-scheduler.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const META = `o : type.\npf : o -> type.\nc : pf A -> pf A.\n`;
const upd = (e, src) => e.update(parser.parse(src), Text.of(src.split('\n')));

const ideCalls = [];
const belugaClient = {
  fingerprint: (code) => 'fp:' + code.length,
  loadChecker: async () => ({ ok: true }),
  ideType: async (_code, line, col) => {
    ideCalls.push({ line, col });
    return JSON.stringify({ ok: true, type: `T@${line},${col}` });
  },
  ideElaborate: async (_code, _start, _end, spec) => {
    if (spec && spec.includes('A|')) {
      const parts = spec.split('|');
      const line = parts[1];
      const col = parts[2];
      return JSON.stringify({
        ok: true,
        implicits: [{ name: 'A', line: Number(line), col: Number(col), type: `T@${line},${col}` }],
      });
    }
    return JSON.stringify({ ok: false, fallback: 'use-ideTypeAtJson' });
  },
};

const session = createSemanticSession(belugaClient);
const engine = createSemanticEngine({ session, belugaClient });
engine.setCheckerCode(() => META);
upd(engine, META);

const snap = engine.getSnapshot();
const decl = snap.symbols.globalSymbols.find((s) => s.name === 'c');
expect(decl, 'declaration c should exist');
const sites = engine.stores.symbols.implicitSitesForDeclaration(decl.id);
expect(sites.length === 1 && sites[0].name === 'A', `implicit site A expected, got ${JSON.stringify(sites)}`);

const schedEngine = {
  stores: engine.stores,
  observeMetavarAt: (pos, type) => engine.observeMetavarAt(pos, type),
  observeMetavarNamed: (id, name, type) => engine.observeMetavarNamed(id, name, type),
  elaborateDeclarationImplicits: (id) => engine.elaborateDeclarationImplicits(id),
  dirtyFrontier: () => engine.dirtyFrontier(),
  getCheckerCode: () => META,
};
const sched = createSemanticScheduler(schedEngine, session);
sched.enqueue(decl.id, decl.range);
await sched.elaborateNext();

expect(ideCalls.length === 0, `batch path should not call per-position ideType, got ${ideCalls.length}`);
const hit = engine.stores.metavar.get(decl.id, 'A');
// A in `pf A` is filled structurally (`pf : o -> type`) without calling Beluga.
expect(hit && hit.type === 'o', `metavar cache should hold structural type, got ${hit && hit.type}`);

// When the head constant IS defined, structural inference recovers the implicit
// types directly from its declared binders — no Beluga round-trip at all.
const METAdef = `o : type.
R : (A:o) -> (B:o) -> o -> type.
c : R X Y -> R X Y.
`;
let defIdeCalls = 0;
const belugaDef = {
  fingerprint: (c) => 'fp:' + c.length,
  loadChecker: async () => ({ ok: true }),
  ideType: async () => { defIdeCalls += 1; return JSON.stringify({ ok: true, type: 'should-not-run' }); },
  ideElaborate: async () => JSON.stringify({ ok: false, fallback: 'use-ideTypeAtJson' }),
};
const engineDef = createSemanticEngine({
  session: createSemanticSession(belugaDef), belugaClient: belugaDef,
});
engineDef.setCheckerCode(() => METAdef);
upd(engineDef, METAdef);
const declDef = engineDef.getSnapshot().symbols.globalSymbols.find((s) => s.name === 'c');
await engineDef.elaborateDeclarationImplicits(declDef.id);
expect(defIdeCalls === 0, `defined head: structural inference should avoid Beluga, got ${defIdeCalls} ideType calls`);
expect(engineDef.stores.metavar.get(declDef.id, 'X')?.type === '(A:o)',
  `X should be structurally inferred from R's binder, got ${engineDef.stores.metavar.get(declDef.id, 'X')?.type}`);

// Fallback path: when the head is UNDEFINED, structural inference cannot recover
// the implicit types, so the batch returns use-ideTypeAtJson and we fall back to
// per-position ideType.
const META2 = `o : type.
c : R X Y -> R X Y.
`;
const belugaFallback = {
  fingerprint: (c) => 'fp:' + c.length,
  loadChecker: async () => ({ ok: true }),
  ideType: async (_code, line, col) => JSON.stringify({ ok: true, type: `FB@${line},${col}` }),
  ideElaborate: async () => JSON.stringify({ ok: false, fallback: 'use-ideTypeAtJson' }),
};
const session2 = createSemanticSession(belugaFallback);
const engine2 = createSemanticEngine({ session: session2, belugaClient: belugaFallback });
engine2.setCheckerCode(() => META2);
upd(engine2, META2);
const decl2 = engine2.getSnapshot().symbols.globalSymbols.find((s) => s.name === 'c');
await engine2.elaborateDeclarationImplicits(decl2.id);
const hitX = engine2.stores.metavar.get(decl2.id, 'X');
const hitY = engine2.stores.metavar.get(decl2.id, 'Y');
expect(hitX && hitX.type.startsWith('FB@'), `fallback X cache, got ${hitX && hitX.type}`);
expect(hitY && hitY.type.startsWith('FB@'), `fallback Y cache, got ${hitY && hitY.type}`);

console.log('OK semantic batch-fallback v2');

