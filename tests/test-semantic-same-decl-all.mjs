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
const posA = SRC.indexOf('R A B') + 2;
const posB = SRC.indexOf('R A B') + 4;
const posC = SRC.lastIndexOf('C');

let batchCalls = 0;
const belugaClient = {
  fingerprint: (c) => 'fp:' + c.length,
  loadChecker: async () => ({ ok: true }),
  ideType: async () => JSON.stringify({ ok: true, type: 'NO' }),
  ideElaborate: async (_code, _s, _e, spec) => {
    batchCalls += 1;
    const names = spec.split(';').map((p) => p.split('|')[0]);
    return JSON.stringify({
      ok: true,
      implicits: names.map((name) => ({
        name,
        line: 3,
        col: name === 'A' ? 2 : name === 'B' ? 4 : 6,
        type: `Ty_${name}`,
      })),
    });
  },
};

const session = createSemanticSession(belugaClient);
const engine = createSemanticEngine({ session, belugaClient });
engine.setCheckerCode(() => SRC);
engine.update(tree, doc);

const decl = engine.getSnapshot().symbols.globalSymbols.find((s) => s.name === 'f');
const sched = engine.scheduler;

await sched.ensureElaborated(decl.id, decl.range);
expect(batchCalls === 1, `one batch for decl, got ${batchCalls}`);

batchCalls = 0;
const hB = engine.hoverAt(posB, { oracle: { async declarationType() { throw new Error('no'); } } });
expect(hB.status === 'ready' && hB.type === 'Ty_B', `B instant after batch: ${hB.status}/${hB.type}`);
expect(batchCalls === 0, 'hover B must not call Beluga');

const hC = engine.hoverAt(posC, { oracle: { async declarationType() { throw new Error('no'); } } });
expect(hC.status === 'ready' && hC.type === 'Ty_C', `C instant: ${hC.status}/${hC.type}`);

console.log('OK same-decl all implicits from one batch');
