// Phase 2: an error in an EARLIER suite file (the prelude) must not blind the
// file the user is editing. Beluga halts at the first error, so without masking
// the prelude block the active file is never reached and the user gets only a
// "fix prelude first" banner. The settlement now block-indexes the prelude,
// masks the erroring block, and re-checks — so the active file's own diagnostics
// (and types for everything not depending on the masked block) still surface,
// with the prelude error reported as a NON-blocking banner alongside.
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSyntaxStore } from '../editor-src/semantic/syntax-store.mjs';
import { createSettlement } from '../editor-src/semantic/settlement.mjs';
import { createCheckerStore } from '../editor-src/semantic/checker-store.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function syntaxFor(src) {
  const doc = Text.of(src.split('\n'));
  return createSyntaxStore().update(parser.parse(src), doc);
}

// Beluga halts at the first active (non-masked) marker, in line order.
function haltingMock(rules) {
  return {
    fingerprint: (code) => `fp:${code.length}`,
    checkResult: async (code) => {
      const lines = code.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        for (const rule of rules) {
          const col = lines[i].indexOf(rule.marker);
          if (col >= 0) {
            return { ok: false, output: `File "input.bel", line ${i + 1}, column ${col + 1}:\nError: ${rule.message}` };
          }
        }
      }
      return { ok: true, output: '' };
    },
  };
}

// Prelude (earlier file base.bel): a broken block (badP) AND a good definition.
const preludeCode = `LF p : type =
  | mkP : badP
;
LF good : type =
  | mkGood : good
;`;
const prelude = {
  code: preludeCode,
  spans: [{ id: 'base', name: 'base.bel', startLine: 1, endLine: 6 }],
  offsetLines: 7,
  names: new Set(['p', 'mkP', 'good', 'mkGood']),
};

// Active file the user is editing: its own independent error (badA).
const syntax = syntaxFor(`LF q : type =
  | mkQ : badA
;`);

const client = haltingMock([
  { marker: 'badP', message: 'Identifier badP is unbound' },
  { marker: 'badA', message: 'Identifier badA is unbound' },
]);
const store = createCheckerStore();
const settlement = createSettlement({
  belugaClient: client,
  checkerStore: store,
  getCheckContext: () => ({ doc: syntax.doc, prelude }),
});
await settlement.settleNow(syntax, 0);
const snap = store.getSnapshot();
const msgs = snap.belugaDiagnostics.map((d) => d.message);

expect(snap.state === 'ready', `settles ready, got ${snap.state}`);
// The active file's OWN error survives the earlier-file failure — the whole point.
expect(msgs.some((m) => m.includes('badA')),
  `active file's own error must surface despite a prelude error, got: ${msgs.join(' | ')}`);
const active = snap.belugaDiagnostics.find((d) => /badA/.test(d.message));
expect(active && active.blockIndex === 0, 'active error maps to the active file block');
// The earlier-file error is reported as a non-blocking banner.
expect(msgs.some((m) => /earlier file base\.bel/.test(m)),
  `a banner names the earlier file, got: ${msgs.join(' | ')}`);
expect(snap.ok === false, 'a suite with a prelude error does not read ok');

console.log('OK settlement prelude recovery (earlier-file error masked, active file still linted)');
