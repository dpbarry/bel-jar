import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSemanticEngine } from '../js/editor-src/semantic/semantic-engine.mjs';
import { createSemanticSession } from '../js/editor-src/semantic/semantic-session.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const SRC = `o : type.
R : o -> o -> o -> type.
f : R A B C -> R A B C.
`;
const doc = Text.of(SRC.split('\n'));
const tree = parser.parse(SRC);
const posB = SRC.indexOf('R A B') + 4;

// A, B, C are positional args of `R : o -> o -> o`, so structural inference fills
// every implicit in one pass from the head signature — no Beluga round-trip — and
// hover thereafter serves from cache without re-calling.
let belugaCalls = 0;
const belugaClient = {
  fingerprint: (c) => 'fp:' + c.length,
  loadChecker: async () => ({ ok: true }),
  ideType: async () => { belugaCalls += 1; return JSON.stringify({ ok: true, type: 'should-not-run' }); },
  ideElaborate: async () => { belugaCalls += 1; return JSON.stringify({ ok: false }); },
};

const session = createSemanticSession(belugaClient);
const engine = createSemanticEngine({ session, belugaClient });
engine.setCheckerCode(() => SRC);
engine.update(tree, doc);

const sched = engine.scheduler;
expect(sched, 'scheduler should exist');

const decl = engine.getSnapshot().symbols.globalSymbols.find((s) => s.name === 'f');
expect(decl, 'decl f');

await sched.ensureElaborated(decl.id, decl.range);
expect(belugaCalls === 0, `structural inference should fill implicits without Beluga, got ${belugaCalls}`);
expect(engine.stores.metavar.get(decl.id, 'A')?.type === 'o', 'A cached');
expect(engine.stores.metavar.get(decl.id, 'B')?.type === 'o', 'B cached');
expect(engine.stores.metavar.get(decl.id, 'C')?.type === 'o', 'C cached');

const h1 = engine.hoverAt(posB, { oracle: { async declarationType() { throw new Error('no'); } } });
expect(h1.status === 'ready' && h1.type === 'o', `hover B ready from cache: ${h1.status}/${h1.type}`);
expect(belugaCalls === 0, `hover must not call Beluga, belugaCalls=${belugaCalls}`);

console.log('OK semantic decl dedupe (structural fill, cached hover)');
