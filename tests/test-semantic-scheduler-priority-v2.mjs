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

const PAD = '\n// pad\n'.repeat(80);
const SRC = `o : type.\npf : o -> type.\n${PAD}c : pf A -> pf A.\n${PAD}d : pf B -> pf B.\n`;
const upd = (e, src) => e.update(parser.parse(src), Text.of(src.split('\n')));

const belugaClient = {
  fingerprint: (c) => 'fp:' + c.length,
  loadChecker: async () => ({ ok: true }),
  ideType: async () => '{"ok":true,"type":"x"}',
  ideElaborate: async () => JSON.stringify({ ok: true, implicits: [] }),
};

const session = createSemanticSession(belugaClient);
const engine = createSemanticEngine({ session, belugaClient });
upd(engine, SRC);

const snap = engine.getSnapshot();
function declWithMetavar(name) {
  return snap.symbols.globalSymbols.find((s) =>
    engine.stores.symbols.implicitSitesForDeclaration(s.id).some((site) => site.name === name));
}
const declC = declWithMetavar('A');
const declD = declWithMetavar('B');
const dPos = SRC.indexOf('d : pf B');

const sched = createSemanticScheduler({
  stores: engine.stores,
  observeMetavarAt: () => {},
  dirtyFrontier: () => engine.dirtyFrontier(),
  getCheckerCode: () => SRC,
}, session);

sched.enqueue(declC.id, declC.range);
sched.enqueue(declD.id, declD.range);
sched.onCursorMove(dPos + 8);
sched.onViewportChange({ from: dPos, to: SRC.length });

const next = sched.getStatus().nextDeclId;
expect(next === declD.id,
  `cursor/viewport near d should prioritize decl d, got ${next} expected ${declD.id}`);

console.log('OK semantic scheduler priority v2');
