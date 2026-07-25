// The settlement must surface errors in EVERY independent block, not just the
// first one Beluga halts at: divide-and-conquer re-checks with erroring blocks
// (and everything impacted by them) masked out. Pins:
//  1. N independent broken blocks → N diagnostics.
//  2. A block depending on a broken block is masked with it — no induced
//     "unbound identifier" noise — while unrelated blocks still get checked.
//  3. A checker that keeps reporting into already-masked blocks terminates.
//  4. The final snapshot records the maximal-healthy code actually loaded.
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSyntaxStore } from '../js/editor-src/semantic/syntax-store.mjs';
import { createSettlement, impactedBlocks } from '../js/editor-src/semantic/settlement.mjs';
import { createCheckerStore } from '../js/editor-src/semantic/checker-store.mjs';
import { blockDependents } from '../js/editor-src/tree-walk.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function syntaxFor(src) {
  const doc = Text.of(src.split('\n'));
  const tree = parser.parse(src);
  return createSyntaxStore().update(tree, doc);
}

// Beluga halts at the first error: report the first active marker, in line
// order, of whatever code it is given (masked lines have markers blanked).
function haltingMock(rules) {
  let calls = 0;
  const client = {
    fingerprint: (code) => `fp:${code.length}`,
    checkResult: async (code) => {
      calls += 1;
      const lines = code.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        for (const rule of rules) {
          if (typeof rule.when === 'function' && !rule.when(code)) continue;
          const col = lines[i].indexOf(rule.marker);
          if (col >= 0) {
            return {
              ok: false,
              output: `File "input.bel", line ${i + 1}, column ${col + 1}:\nError: ${rule.message}`,
            };
          }
        }
      }
      return { ok: true, output: '' };
    },
  };
  return { client, callCount: () => calls };
}

// ── 1. Three independent broken blocks → three diagnostics ─────────────────
{
  const syntax = syntaxFor(`LF a : type =
  | mkA : badA
;
LF b : type =
  | mkB : badB
;
LF c : type =
  | mkC : badC
;
`);
  const { client, callCount } = haltingMock([
    { marker: 'badA', message: 'Identifier badA is unbound' },
    { marker: 'badB', message: 'Identifier badB is unbound' },
    { marker: 'badC', message: 'Identifier badC is unbound' },
  ]);
  const store = createCheckerStore();
  const settlement = createSettlement({ belugaClient: client, checkerStore: store });
  await settlement.settleNow(syntax, 0);
  const snap = store.getSnapshot();
  expect(snap.state === 'ready', `state ready, got ${snap.state}`);
  expect(snap.belugaDiagnostics.length === 3,
    `all 3 independent errors must surface, got ${snap.belugaDiagnostics.length}`);
  const blocksHit = new Set(snap.belugaDiagnostics.map((d) => d.blockIndex));
  expect(blocksHit.size === 3, `errors must span 3 distinct blocks, got ${[...blocksHit]}`);
  expect(snap.ok === false, 'snapshot must not read ok with errors present');
  expect(callCount() <= 4, `bounded passes, got ${callCount()}`);
}

// ── 2. Impact masking: dependents of a broken block produce no induced noise ─
{
  const src = `LF bee : type =
  | mkBee : badB
;
LF cee : bee -> type =
  | mkCee : cee mkBee
;
LF dee : type =
  | mkDee : badD
;
`;
  const syntax = syntaxFor(src);

  // Sanity: the dependency relation sees cee's block leaning on bee's block.
  const deps = blockDependents(syntax.tree, syntax.doc);
  expect(deps.get(0) && deps.get(0).has(1), 'block 1 (cee) must depend on block 0 (bee)');
  const impacted = impactedBlocks(deps, [0]);
  expect(impacted.has(0) && impacted.has(1) && !impacted.has(2),
    `impact of block 0 must be {0,1}, got ${[...impacted]}`);

  const { client, callCount } = haltingMock([
    { marker: 'badB', message: 'Identifier badB is unbound' },
    // Induced error: once bee's decl is masked, any surviving use of bee/mkBee
    // would be unbound. If cee's block is (wrongly) still checked, this fires.
    { marker: 'mkCee', message: 'Identifier bee is unbound', when: (code) => !code.includes('mkBee :') },
    { marker: 'badD', message: 'Identifier badD is unbound' },
  ]);
  const store = createCheckerStore();
  const settlement = createSettlement({ belugaClient: client, checkerStore: store });
  await settlement.settleNow(syntax, 0);
  const snap = store.getSnapshot();
  const messages = snap.belugaDiagnostics.map((d) => d.message);
  expect(snap.belugaDiagnostics.length === 2,
    `exactly the 2 genuine errors (bee, dee), got ${snap.belugaDiagnostics.length}: ${messages.join(' | ')}`);
  expect(messages.some((m) => m.includes('badB')), 'bee error must surface');
  expect(messages.some((m) => m.includes('badD')), 'independent dee error must still surface');
  expect(!messages.some((m) => m.includes('bee is unbound')),
    'no induced unbound-noise from the dependent block');
  expect(!snap.belugaDiagnostics.some((d) => d.blockIndex === 1),
    'no diagnostic may land in the dependent (impact-masked) block');
  expect(callCount() <= 4, `bounded passes, got ${callCount()}`);
}

// ── 3. A checker stuck on a masked block terminates without spinning ────────
{
  const syntax = syntaxFor(`LF a : type =
  | mkA : badA
;
LF b : type =
  | mkB : b
;
`);
  let calls = 0;
  const fixed = 'File "input.bel", line 2, column 11:\nError: Identifier badA is unbound';
  const client = {
    fingerprint: (code) => `fp:${code.length}`,
    checkResult: async () => { calls += 1; return { ok: false, output: fixed }; },
  };
  const store = createCheckerStore();
  const settlement = createSettlement({ belugaClient: client, checkerStore: store });
  await settlement.settleNow(syntax, 0);
  const snap = store.getSnapshot();
  expect(calls === 2, `stuck checker must stop after the echo pass, got ${calls}`);
  expect(snap.belugaDiagnostics.length === 1, 'the one real diagnostic is kept');
  expect(snap.state === 'ready', 'still settles to ready');
}

// ── 4. checkedCode records the maximal-healthy code actually loaded ─────────
{
  const syntax = syntaxFor(`LF a : type =
  | mkA : badA
;
LF b : type =
  | mkB : b
;
`);
  const { client } = haltingMock([
    { marker: 'badA', message: 'Identifier badA is unbound' },
  ]);
  const store = createCheckerStore();
  const settlement = createSettlement({ belugaClient: client, checkerStore: store });
  await settlement.settleNow(syntax, 0);
  const snap = store.getSnapshot();
  expect(snap.checkedCode.includes('mkB'), 'healthy block must survive in checkedCode');
  expect(!snap.checkedCode.includes('badA'), 'erroring block must be masked in checkedCode');
  expect(snap.checkedFp === `fp:${snap.checkedCode.length}`, 'checkedFp matches checkedCode');
  expect(snap.checkedCode.split('\n').length === syntax.doc.lines,
    'masking must preserve line structure');
}

// ── 5. Dependents of SYNTAX-faulted blocks are pre-masked (no induced noise) ─
{
  // bee's decl is syntax-broken (unclosed paren) → line-masked from Beluga.
  // cee depends on bee: checked as-is it would open with "unbound bee".
  // dee is independent and has a genuine semantic error that must surface.
  const src = `LF bee : type =
  | mkBee : ( bee
;
LF cee : bee -> type =
  | mkCee : cee mkBee
;
LF dee : type =
  | mkDee : badD
;
`;
  const syntax = syntaxFor(src);
  const { client, callCount } = haltingMock([
    // Induced: fires only when bee's definition is gone from the code.
    { marker: 'mkCee', message: 'Identifier bee is unbound', when: (code) => !code.includes('LF bee') },
    { marker: 'badD', message: 'Identifier badD is unbound' },
  ]);
  const store = createCheckerStore();
  const settlement = createSettlement({ belugaClient: client, checkerStore: store });
  await settlement.settleNow(syntax, 0);
  const snap = store.getSnapshot();
  const messages = snap.belugaDiagnostics.map((d) => d.message);
  expect(!messages.some((m) => m.includes('bee is unbound')),
    `no induced noise from the dependent of a syntax-faulted block, got: ${messages.join(' | ')}`);
  expect(messages.some((m) => m.includes('badD')),
    'independent semantic error must still surface alongside a syntax fault elsewhere');
  expect(callCount() <= 3, `bounded passes, got ${callCount()}`);
}

// ── 6. Culprit-based suppression: induced unbound with NO dependency edge ───
{
  // The checker reports "aname is unbound" inside cee once aname's block is
  // masked — but cee never lexically references aname, so the walk has no
  // edge and impact masking can't predict it. The message itself names the
  // culprit; that diag must be suppressed yet still advance the loop to dee.
  const src = `LF aname : type =
  | mkA : badA
;
LF cee : type =
  | mkCee : cee
;
LF dee : type =
  | mkDee : badD
;
`;
  const syntax = syntaxFor(src);
  const { client } = haltingMock([
    { marker: 'badA', message: 'Identifier badA is unbound' },
    { marker: 'mkCee', message: 'Identifier aname is unbound', when: (code) => !code.includes('LF aname') },
    { marker: 'badD', message: 'Identifier badD is unbound' },
  ]);
  const store = createCheckerStore();
  const settlement = createSettlement({ belugaClient: client, checkerStore: store });
  await settlement.settleNow(syntax, 0);
  const snap = store.getSnapshot();
  const messages = snap.belugaDiagnostics.map((d) => d.message);
  expect(!messages.some((m) => m.includes('aname is unbound')),
    `lying induced unbound must be suppressed via its named culprit, got: ${messages.join(' | ')}`);
  expect(messages.some((m) => m.includes('badA')), 'the real aname-block error must surface');
  expect(messages.some((m) => m.includes('badD')),
    'the loop must advance past the suppressed diag and reach dee');
}

console.log('OK settlement multipass (all independent errors surface, impact-masked deps stay quiet)');
