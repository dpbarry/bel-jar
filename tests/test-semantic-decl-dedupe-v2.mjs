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
const posC = SRC.lastIndexOf('C') + 0;

let batchCalls = 0;
const belugaClient = {
  fingerprint: (c) => 'fp:' + c.length,
  loadChecker: async () => ({ ok: true }),
  ideType: async () => JSON.stringify({ ok: true, type: 'should-not-run' }),
  ideElaborate: async (_code, _s, _e, spec) => {
    batchCalls += 1;
    const names = spec.split(';').map((p) => p.split('|')[0]);
    expect(names.includes('A') && names.includes('B') && names.includes('C'),
      `batch spec should list all implicits: ${spec}`);
    return JSON.stringify({
      ok: true,
      implicits: names.map((name) => {
        const site = name === 'A' ? { line: 3, col: posA - doc.line(3).from }
          : name === 'B' ? { line: 3, col: posB - doc.line(3).from }
            : { line: 3, col: posC - doc.line(3).from };
        return { name, ...site, type: `Ty_${name}` };
      }),
    });
  },
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
expect(batchCalls === 1, `one batch per decl, got ${batchCalls}`);
expect(engine.stores.metavar.get(decl.id, 'A')?.type === 'Ty_A', 'A cached');
expect(engine.stores.metavar.get(decl.id, 'B')?.type === 'Ty_B', 'B cached');
expect(engine.stores.metavar.get(decl.id, 'C')?.type === 'Ty_C', 'C cached');

batchCalls = 0;
const h1 = engine.hoverAt(posB, { oracle: { async declarationType() { throw new Error('no'); } } });
expect(h1.status === 'ready' && h1.type === 'Ty_B', `hover B ready from cache: ${h1.status}/${h1.type}`);
expect(batchCalls === 0, `hover must not call Beluga again, batchCalls=${batchCalls}`);

console.log('OK semantic decl batch dedupe');
