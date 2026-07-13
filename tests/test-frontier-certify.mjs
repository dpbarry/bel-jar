// Dirty single-decl edit uses compressed frontier certify — not full
// uncompressed prelude+file checkResult (when getScopedFrontier is wired).
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSyntaxStore } from '../editor-src/semantic/syntax-store.mjs';
import { createSettlement } from '../editor-src/semantic/settlement.mjs';
import { createCheckerStore } from '../editor-src/semantic/checker-store.mjs';
import { topDeclSpans } from '../editor-src/semantic/scoped-check.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function syntaxFor(src) {
  const doc = Text.of(src.split('\n'));
  return createSyntaxStore().update(parser.parse(src), doc);
}

const preludeCode = `LF a : type =
  | mkA : a
;
rec longProof : [⊢ a] =
  fn x ⇒ x
;
`;

const activeSrc = `LF b : type =
  | mkB : b
;
LF c : type =
  | mkC : badC
;
`;

const prelude = {
  code: preludeCode,
  spans: [{ id: 'base', name: 'base.bel', startLine: 1, endLine: 6 }],
  offsetLines: 7,
  names: new Set(['a', 'mkA', 'longProof']),
};

const syntax = syntaxFor(activeSrc);
const decls = topDeclSpans(syntax.tree);
const dirtyDecl = decls[decls.length - 1];

const codes = [];
const client = {
  fingerprint: (code) => `fp:${String(code).length}:${(String(code).match(/badC/g) || []).length}`,
  checkResult: async (code) => {
    codes.push(code);
    if (String(code).includes('badC')) {
      const lines = code.split('\n');
      let line = 1;
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].includes('badC')) { line = i + 1; break; }
      }
      return {
        ok: false,
        output: `File "input.bel", line ${line}, column 10:\nError: Identifier badC is unbound`,
      };
    }
    return { ok: true, output: '' };
  },
};

const store = createCheckerStore();
const settlement = createSettlement({
  belugaClient: client,
  checkerStore: store,
  getCheckContext: () => ({ doc: syntax.doc, prelude }),
  getScopedFrontier: () => [dirtyDecl],
});

// First settle must already be compressed (never force full just because
// preludeFp was unseen — that made typing cancel/restart O(suite) forever).
await settlement.settleNow(syntax, 0);
expect(codes.length >= 1, 'frontier settle runs Beluga');
expect(codes.every((c) => !/fn x ⇒ x/.test(c)),
  `first settle must stub prelude proof bodies, got: ${codes[0]?.slice(0, 120)}`);
expect(codes.some((c) => c.includes('badC')), 'dirty decl still checked');
const snap = store.getSnapshot();
expect(snap.state === 'ready', `ready, got ${snap.state}`);
expect(snap.belugaDiagnostics.some((d) => /badC/.test(d.message)),
  `active error surfaces, got: ${snap.belugaDiagnostics.map((d) => d.message).join(' | ')}`);
expect(snap.settleMode === 'frontier', `settleMode frontier, got ${snap.settleMode}`);

// Sibling prelude change forces one full pass.
{
  const fullCodes = [];
  const fullClient = {
    fingerprint: (code) => `fp:${code.length}`,
    checkResult: async (code) => {
      fullCodes.push(code);
      if (String(code).includes('badC')) {
        return { ok: false, output: 'File "input.bel", line 1, column 1:\nError: Identifier badC is unbound' };
      }
      return { ok: true, output: '' };
    },
  };
  const store2 = createCheckerStore();
  const s2 = createSettlement({
    belugaClient: fullClient,
    checkerStore: store2,
    getCheckContext: () => ({ doc: syntax.doc, prelude }),
    getScopedFrontier: () => [dirtyDecl],
  });
  await s2.settleNow(syntax, 0);
  expect(fullCodes.every((c) => !/fn x ⇒ x/.test(c)), 'initial still compressed');
  const changedPrelude = {
    ...prelude,
    code: preludeCode + '\nLF extra : type.\n',
  };
  const s3 = createSettlement({
    belugaClient: fullClient,
    checkerStore: store2,
    getCheckContext: () => ({ doc: syntax.doc, prelude: changedPrelude }),
    getScopedFrontier: () => [dirtyDecl],
  });
  // New settlement instance has null lastFullPreludeFp — still compressed.
  // To test prelude-change full path, reuse the same settlement and mutate context.
}
{
  const seen = [];
  let livePrelude = prelude;
  const client2 = {
    fingerprint: (code) => `fp:${code.length}`,
    checkResult: async (code) => {
      seen.push(code);
      return { ok: true, output: '' };
    },
  };
  const st = createCheckerStore();
  const settle = createSettlement({
    belugaClient: client2,
    checkerStore: st,
    getCheckContext: () => ({ doc: syntax.doc, prelude: livePrelude }),
    getScopedFrontier: () => [dirtyDecl],
  });
  await settle.settleNow(syntax, 0);
  expect(seen.every((c) => !/fn x ⇒ x/.test(c)), 'settle 1 compressed');
  seen.length = 0;
  livePrelude = {
    ...prelude,
    code: `LF a : type =\n  | mkA : a\n;\nrec longProof : [⊢ a] =\n  fn x ⇒ x\n;\nLF zzz : type.\n`,
  };
  await settle.settleNow(syntax, 0);
  expect(seen.some((c) => /fn x ⇒ x/.test(c)),
    'prelude content change must force full (bodies present)');
}

// Without getScopedFrontier, full multipass still used (regression for unit tests).
{
  const fullCodes = [];
  const fullClient = {
    fingerprint: (code) => `fp:${code.length}`,
    checkResult: async (code) => {
      fullCodes.push(code);
      return { ok: true, output: '' };
    },
  };
  const s2 = createSettlement({
    belugaClient: fullClient,
    checkerStore: createCheckerStore(),
    getCheckContext: () => ({ doc: syntax.doc, prelude }),
  });
  await s2.settleNow(syntax, 0);
  expect(fullCodes.some((c) => /fn x ⇒ x/.test(c)),
    'no-frontier path still sends full prelude bodies');
}

console.log('OK frontier-certify');
