// Stage 2 — Tier-2 attribution. The settlement already discovers errors in
// EARLIER suite members (the prelude) and, until now, collapsed them into one
// "fix earlier file" banner. It now ALSO publishes them as a structured
// per-member diagnostic map (file name → file-relative findings), so cross-file
// consumers (the inspector, the dependency graph) can show a member's real
// health instead of "parsed, not checked here". The recovery loop is untouched:
// this is a pure additional output of data it already computed.
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSyntaxStore } from '../editor-src/semantic/syntax-store.mjs';
import { createSettlement } from '../editor-src/semantic/settlement.mjs';
import { createCheckerStore } from '../editor-src/semantic/checker-store.mjs';
import { suitePreludeBannerForActive } from '../editor-src/suite-prelude-banner.mjs';

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

// ── A broken EARLIER member is attributed to that member ──────────────────────
{
  // Prelude member base.bel: an error (badP) on line 2 and a clean def.
  const prelude = {
    code: `LF p : type =\n  | mkP : badP\n;\nLF good : type =\n  | mkGood : good\n;`,
    spans: [{ id: 'base', name: 'base.bel', startLine: 1, endLine: 6 }],
    offsetLines: 7,
    names: new Set(['p', 'mkP', 'good', 'mkGood']),
  };
  // Active file the user is editing: its own independent error (badA).
  const syntax = syntaxFor(`LF q : type =\n  | mkQ : badA\n;`);
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

  expect(snap.state === 'ready', `settles ready, got ${snap.state}`);

  // The new channel: a per-member map keyed by file NAME.
  const member = snap.memberDiagnostics;
  expect(member && typeof member === 'object', 'snapshot carries a memberDiagnostics map');
  const base = member['base.bel'];
  expect(Array.isArray(base) && base.length === 1,
    `base.bel gets exactly its own finding, got ${JSON.stringify(base)}`);
  expect(base[0].line === 2, `the finding is file-relative (line 2 of base.bel), got ${base[0].line}`);
  expect(/badP/.test(base[0].message), `the finding carries the real message, got "${base[0].message}"`);
  expect(base[0].severity === 'error', `a halting prelude error is an error, got ${base[0].severity}`);

  // The active file is NOT in the member map — its diagnostics flow through the
  // live channel (belugaDiagnostics, with real from/to), not this cross-file one.
  expect(!('input.bel' in member) && !member[Object.keys(member).find((k) => /badA/.test(JSON.stringify(member[k])))],
    'the active file is not duplicated into the cross-file member map');

  // The recovery loop is intact: the active file's own error still surfaces, and
  // the genuine earlier-file fault still raises the banner alongside.
  const msgs = snap.belugaDiagnostics.map((d) => d.message);
  expect(msgs.some((m) => /badA/.test(m)), `active file's own error still surfaces, got: ${msgs.join(' | ')}`);
  const banner = suitePreludeBannerForActive({
    doc: syntax.doc,
    members: [
      { id: 'base', name: 'base.bel', text: prelude.code },
      { id: 'active', name: 'use.bel', text: 'LF q : type =\n  | mkQ : badA\n;' },
    ],
    activeId: 'active',
    memberDiagnostics: member,
    getText: (id) => (id === 'active' ? syntax.doc.toString() : prelude.code),
  });
  expect(banner && /earlier suite file base\.bel/.test(banner.message),
    `the earlier-file banner comes from the suite overlay, got: ${banner?.message || '(none)'}`);
}

// ── A clean prelude attributes nothing (no false health reports) ──────────────
{
  const prelude = {
    code: `LF p : type =\n  | mkP : p\n;`,
    spans: [{ id: 'base', name: 'base.bel', startLine: 1, endLine: 3 }],
    offsetLines: 4,
    names: new Set(['p', 'mkP']),
  };
  const syntax = syntaxFor(`LF q : type =\n  | mkQ : q\n;`);
  const client = haltingMock([]); // nothing errors anywhere
  const store = createCheckerStore();
  const settlement = createSettlement({
    belugaClient: client,
    checkerStore: store,
    getCheckContext: () => ({ doc: syntax.doc, prelude }),
  });
  await settlement.settleNow(syntax, 0);
  const snap = store.getSnapshot();
  expect(snap.ok === true, 'an all-clean development reads ok');
  expect(snap.memberDiagnostics && Object.keys(snap.memberDiagnostics).length === 0,
    `a clean prelude attributes no member diagnostics, got ${JSON.stringify(snap.memberDiagnostics)}`);
}

// ── Two distinct earlier members each get their own findings ──────────────────
{
  // a.bel (lines 1-3) and b.bel (lines 5-7) each carry an independent error.
  const prelude = {
    code: `LF a : type =\n  | ma : badA1\n;\n\nLF b : type =\n  | mb : badB1\n;`,
    spans: [
      { id: 'a', name: 'a.bel', startLine: 1, endLine: 3 },
      { id: 'b', name: 'b.bel', startLine: 5, endLine: 7 },
    ],
    offsetLines: 8,
    names: new Set(['a', 'ma', 'b', 'mb']),
  };
  const syntax = syntaxFor(`LF q : type =\n  | mkQ : q\n;`);
  const client = haltingMock([
    { marker: 'badA1', message: 'Identifier badA1 is unbound' },
    { marker: 'badB1', message: 'Identifier badB1 is unbound' },
  ]);
  const store = createCheckerStore();
  const settlement = createSettlement({
    belugaClient: client,
    checkerStore: store,
    getCheckContext: () => ({ doc: syntax.doc, prelude }),
  });
  await settlement.settleNow(syntax, 0);
  const member = store.getSnapshot().memberDiagnostics;
  expect(member['a.bel']?.length === 1 && /badA1/.test(member['a.bel'][0].message),
    `a.bel keeps its own finding, got ${JSON.stringify(member['a.bel'])}`);
  expect(member['b.bel']?.length === 1 && /badB1/.test(member['b.bel'][0].message),
    `b.bel keeps its own finding, got ${JSON.stringify(member['b.bel'])}`);
  expect(member['a.bel'][0].line === 2 && member['b.bel'][0].line === 2,
    'both findings are file-relative to their own member');
}

console.log('ok   test-development-diagnostics.mjs  per-member diagnostics (earlier members attributed by '
  + 'file + file-relative line; active file not duplicated; clean prelude = none; multiple members distinct)');
