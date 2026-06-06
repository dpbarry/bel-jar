import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';
import { createSemanticSession } from '../editor-src/semantic/semantic-session.mjs';

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
const posC = SRC.lastIndexOf('C');

// Beluga must NOT be called: A, B, C are all positional args of `R : o -> o -> o`,
// so structural inference fills every implicit in the declaration at once,
// directly from the head's signature.
let belugaCalls = 0;
const belugaClient = {
  fingerprint: (c) => 'fp:' + c.length,
  loadChecker: async () => ({ ok: true }),
  ideType: async () => { belugaCalls += 1; return JSON.stringify({ ok: true, type: 'NO' }); },
  ideElaborate: async () => { belugaCalls += 1; return JSON.stringify({ ok: false }); },
};

const session = createSemanticSession(belugaClient);
const engine = createSemanticEngine({ session, belugaClient });
engine.setCheckerCode(() => SRC);
engine.update(tree, doc);

const decl = engine.getSnapshot().symbols.globalSymbols.find((s) => s.name === 'f');
const sched = engine.scheduler;

await sched.ensureElaborated(decl.id, decl.range);
expect(belugaCalls === 0, `structural inference should fill all implicits without Beluga, got ${belugaCalls} calls`);
expect(engine.stores.metavar.get(decl.id, 'A')?.type === 'o', 'A filled structurally');
expect(engine.stores.metavar.get(decl.id, 'B')?.type === 'o', 'B filled structurally');
expect(engine.stores.metavar.get(decl.id, 'C')?.type === 'o', 'C filled structurally');

const hB = engine.hoverAt(posB, { oracle: { async declarationType() { throw new Error('no'); } } });
expect(hB.status === 'ready' && hB.type === 'o', `B instant from structural cache: ${hB.status}/${hB.type}`);
expect(belugaCalls === 0, 'hover B must not call Beluga');

const hC = engine.hoverAt(posC, { oracle: { async declarationType() { throw new Error('no'); } } });
expect(hC.status === 'ready' && hC.type === 'o', `C instant: ${hC.status}/${hC.type}`);

console.log('OK same-decl all implicits filled structurally');
