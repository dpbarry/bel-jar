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

const V1 = `LF o : type =\n  | imp : o → o → o\n;\nLF nd : o → type =\n  | impI : nd → nd\n;\nrec f : [ |- nd] → [ |- nd] =\n  fn x => x\n;\n`;
const upd = (e, src) => e.update(parser.parse(src), Text.of(src.split('\n')));

const belugaClient = {
  fingerprint: (c) => 'fp:' + c.length,
  loadChecker: async () => ({ ok: true }),
  ideType: async () => '{"ok":true,"type":"x"}',
  ideElaborate: async () => JSON.stringify({ ok: true, implicits: [] }),
};

const session = createSemanticSession(belugaClient);
const engine = createSemanticEngine({ session, belugaClient });
const sched = createSemanticScheduler({
  stores: engine.stores,
  observeMetavarAt: () => {},
  dirtyFrontier: () => engine.dirtyFrontier(),
  getCheckerCode: () => V1,
}, session);

upd(engine, V1);
for (const sym of engine.getSnapshot().symbols.globalSymbols) {
  sched.enqueue(sym.id, sym.range);
}
while (sched.getStatus().queued > 0) {
  await sched.elaborateNext();
}

upd(engine, V1.replace('fn x => x', 'fn x => (x)'));
sched.onDocChange();

const fSym = engine.getSnapshot().symbols.globalSymbols.find((s) => s.name === 'f');
const st = sched.getStatus();
expect(st.queued === 1, `body edit should requeue one decl, got queue ${st.queued}`);
expect(st.nextDeclId === fSym.id, `only f should be next, got ${st.nextDeclId}`);

console.log('OK semantic scheduler dirty v2');
