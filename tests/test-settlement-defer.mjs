import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

async function waitSettled(engine, version, ms = 2000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (engine.isSettledFor(version)) return true;
    await new Promise((r) => setTimeout(r, 40));
  }
  return engine.isSettledFor(version);
}

const client = {
  fingerprint: (c) => `fp:${c.length}`,
  checkResult: async () => ({ ok: true, output: '' }),
};

const fixed = `LF t : type =\n  | z : t\n;\n`;
const doc = Text.of(fixed.split('\n'));
const tree = parser.parse(fixed);

{
  let settled = false;
  const engine = createSemanticEngine({
    belugaClient: client,
    onSettlement: () => { settled = true; },
  });
  engine.update(tree, doc, { deferSettlement: true });
  const ver = engine.getSnapshot().syntax.version;
  expect(!engine.isSettledFor(ver), 'deferred parse must not settle yet');
  expect(!engine.isSettlementPending(), 'deferred parse must not queue checker yet');
  engine.ensureSettled();
  expect(engine.isSettlementPending(), 'ensureSettled kicks off checker when parse is complete');
  await waitSettled(engine, ver);
  expect(engine.isSettledFor(ver),
    `deferred then ensureSettled must finish (state=${engine.settleState()})`);
}

{
  const faulted = `LF t : type =\n  | z t\n;\n`;
  const docFault = Text.of(faulted.split('\n'));
  const treeFault = parser.parse(faulted);
  let settled = false;
  const engine = createSemanticEngine({
    belugaClient: client,
    onSettlement: () => { settled = true; },
  });
  engine.update(treeFault, docFault);
  const ver0 = engine.getSnapshot().syntax.version;
  expect(await waitSettled(engine, ver0), 'baseline faulted file settles');
  const treeFixed = parser.parse(fixed);
  settled = false;
  engine.update(treeFixed, doc);
  const ver1 = engine.getSnapshot().syntax.version;
  expect(await waitSettled(engine, ver1), `syntax-only repair must re-settle (state=${engine.settleState()})`);
  expect(settled, 'syntax-only repair must fire onSettlement');
}

console.log('OK settlement-defer (parse defer + syntax-only re-settle)');
