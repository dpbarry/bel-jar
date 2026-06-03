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

// Fallback path when batch returns use-ideTypeAtJson (parallel per-position)
const META2 = `o : type.
R : (A:o) -> (B:o) -> o -> type.
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

