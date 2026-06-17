import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';
import { createSyntaxStore } from '../editor-src/semantic/syntax-store.mjs';
import { createSymbolStore } from '../editor-src/semantic/symbol-store.mjs';
import { createSemanticGraph } from '../editor-src/semantic/semantic-graph.mjs';
import { createSettlement } from '../editor-src/semantic/settlement.mjs';
import { createCheckerStore } from '../editor-src/semantic/checker-store.mjs';
import { STATUS } from '../editor-src/semantic/ids.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const SAMPLE = `LF o : type =
  | ⊤ : o
;
LF good : o → type =
  | gI : good ⊤
;
`;

const doc = Text.of(SAMPLE.split('\n'));
const tree = parser.parse(SAMPLE);
const syntaxStore = createSyntaxStore();
const symbolStore = createSymbolStore();
const syntax = syntaxStore.update(tree, doc);
const symbols = symbolStore.update(syntax);

const gI = symbols.globalSymbols.find((s) => s.name === 'gI');
const oSym = symbols.globalSymbols.find((s) => s.name === 'o');
expect(gI && oSym, 'sample must have gI and o symbols');

const gILine = doc.lineAt(gI.range.from).number;
const gICol = gI.range.from - doc.line(gILine).from + 1;
const belugaOutput = `File "input.bel", line ${gILine}, column ${gICol}:\nError: mock type error on gI`;

// Mask-aware mock, like the real checker: errors on gI only while gI's decl
// is still present; once the settlement masks that block, the rest is clean.
let checkCalls = 0;
const client = {
  fingerprint: (code) => `fp:${code.length}`,
  checkResult: async (code) => {
    checkCalls += 1;
    if (code.includes('gI')) return { ok: false, output: belugaOutput };
    return { ok: true, output: '' };
  },
};

const checkerStore = createCheckerStore();
const graph = createSemanticGraph();

async function runSettlement() {
  const settlement = createSettlement({ belugaClient: client, checkerStore });
  await settlement.settleNow(syntax, 0);
  const checker = checkerStore.getSnapshot();
  return graph.update(symbols, syntax, {
    belugaDiagnostics: checker.belugaDiagnostics,
  });
}

const gSnap = await runSettlement();
// Multi-pass: pass 1 finds gI's error, pass 2 verifies the rest is clean.
expect(checkCalls === 2, `settlement should check twice (find + verify rest), got ${checkCalls}`);
expect(checkerStore.getSnapshot().belugaDiagnostics.length > 0, 'expected beluga diagnostics');

const gINode = gSnap.nodeMap.get(gI.id);
const oNode = gSnap.nodeMap.get(oSym.id);
expect(gINode.status === STATUS.ERRORING, `gI should be erroring, got ${gINode.status}`);
expect(oNode.status !== STATUS.ERRORING, `o must not inherit beluga error, got ${oNode.status}`);

// Engine integration: onSettlement applies graph update
checkCalls = 0;
let settled = false;
const engine = createSemanticEngine({
  belugaClient: client,
  onSettlement: () => { settled = true; },
});
engine.update(tree, doc);
await new Promise((r) => setTimeout(r, 450));
expect(settled, 'engine should complete settlement');
expect(checkCalls === 2, `engine settlement should check twice, got ${checkCalls}`);

const engSnap = engine.getSnapshot();
const oEng = engSnap.symbols.globalSymbols.find((s) => s.name === 'o');
const oEngNode = engSnap.graph.nodeMap.get(oEng.id);
expect(oEngNode.status !== STATUS.ERRORING, 'o must stay clean when only gI errors');

const erring = [...engSnap.graph.nodeMap.values()].filter((n) => n.status === STATUS.ERRORING);
expect(erring.length >= 1, 'at least one symbol should be ERRORING');
expect(erring.every((n) => n.name !== 'o'), 'o must not be ERRORING');

const good = engSnap.symbols.globalSymbols.find((s) => s.name === 'good');
const intel = engine.intelSyncAt(good.nameRange.from);
expect(intel && intel.userStatus.state === 'error', 'intelSyncAt should report error on affected decl');

console.log('OK settlement graph (beluga diags scoped per decl, ERRORING status)');
