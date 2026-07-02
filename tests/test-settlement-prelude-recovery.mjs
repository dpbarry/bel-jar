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
const banner = suitePreludeBannerForActive({
  doc: syntax.doc,
  members: [
    { id: 'base', name: 'base.bel', text: prelude.code },
    { id: 'active', name: 'use.bel', text: 'LF q : type =\n  | mkQ : badA\n;' },
  ],
  activeId: 'active',
  memberDiagnostics: snap.memberDiagnostics,
  getText: (id) => (id === 'active' ? syntax.doc.toString() : prelude.code),
});
expect(banner && /earlier suite file base\.bel/.test(banner.message),
  `a banner names the earlier file, got: ${banner?.message || '(none)'}`);
expect(snap.ok === false, 'a suite with a prelude error does not read ok');
// The banner must be hoverable across the WHOLE first line, not a single char —
// a start-of-file 1-char target is misery to hit. The active file's line 1 is
// `LF q : type =`, so the banner span must reach that line's end.
const line1End = syntax.doc.line(1).to;
expect(banner.from === 0 && banner.to === line1End,
  `banner should span the whole first line (0..${line1End}), got ${banner.from}..${banner.to}`);

// ── Suite-composition diagnostics surface in the ACTIVE file ─────────────────
// The cfg isn't the only place a suite problem must show; the open .bel file
// gets them too (via ctx.suiteDiagnostics), even when the file checks clean.
{
  const cleanSyntax = syntaxFor(`LF up : type =\n  | mk : up\n;`);
  const cleanClient = haltingMock([]); // active file has no Beluga error
  const store2 = createCheckerStore();
  const suiteDiag = {
    from: 0, to: 5, severity: 'error', source: 'suite',
    message: 'atom is no longer in scope: fol-handbook.bel redefines o without it (it came from fol.elf).',
  };
  const settlement2 = createSettlement({
    belugaClient: cleanClient,
    checkerStore: store2,
    getCheckContext: () => ({ doc: cleanSyntax.doc, prelude: null, suiteDiagnostics: [suiteDiag] }),
  });
  await settlement2.settleNow(cleanSyntax, 0);
  const snap2 = store2.getSnapshot();
  const m2 = snap2.belugaDiagnostics.map((d) => d.message);
  expect(m2.some((m) => /no longer in scope/.test(m)),
    `suite-composition warning surfaces in the open file even when it checks clean, got: ${m2.join(' | ')}`);
  // And it obeys the first-line rule (started on line 1 → spans line 1).
  const sd = snap2.belugaDiagnostics.find((d) => /no longer in scope/.test(d.message));
  expect(sd.from === 0 && sd.to === cleanSyntax.doc.line(1).to,
    `surfaced suite diag spans the whole first line, got ${sd.from}..${sd.to}`);
}

// ── Banner re-attribution: don't blame a correct earlier file ────────────────
// The active file's --nostrengthen breaks fol-handbook.bel IN THE PRELUDE. The
// old banner said "fix the earlier file" — but that file is clean on its own, so
// the user is stranded. When an active-file-caused suite finding names the
// erroring prelude file, the "fix earlier file" banner must be SUPPRESSED (the
// pragma-leak warning, pinned to the real cause in THIS file, explains it).
{
  // Prelude file "fol-handbook.bel" errors at line 76 — but only because the
  // active file's pragma leaked onto it.
  const handbookPrelude = {
    code: `LF nd : type =\n  | mk : badHB\n;`,
    spans: [{ id: 'hb', name: 'fol-handbook.bel', startLine: 1, endLine: 3 }],
    offsetLines: 4,
    names: new Set(['nd', 'mk']),
  };
  const activeSyntax = syntaxFor(`LF up : type =\n  | u : up\n;`);
  const client2 = haltingMock([{ marker: 'badHB', message: 'Identifier badHB is unbound' }]);
  const store3 = createCheckerStore();
  const settlement3 = createSettlement({
    belugaClient: client2,
    checkerStore: store3,
    getCheckContext: () => ({
      doc: activeSyntax.doc,
      prelude: handbookPrelude,
      // The active file caused fol-handbook.bel's error via a leaked pragma.
      suiteFindings: [{
        kind: 'pragma-leak', severity: 'warning', at: 'active', atIsActive: true,
        affectedNames: ['fol-handbook.bel'], pragma: '--nostrengthen',
      }],
      suiteDiagnostics: [{
        from: 0, to: 4, severity: 'warning', source: 'suite',
        message: '--nostrengthen also applies to every previous file in the suite.',
      }],
    }),
  });
  await settlement3.settleNow(activeSyntax, 0);
  const snap3 = store3.getSnapshot();
  const msgs3 = snap3.belugaDiagnostics.map((d) => d.message);
  const banner3 = suitePreludeBannerForActive({
    doc: activeSyntax.doc,
    members: [
      { id: 'hb', name: 'fol-handbook.bel', text: handbookPrelude.code },
      { id: 'active', name: 'use.bel', text: 'LF up : type =\n  | u : up\n;' },
    ],
    activeId: 'active',
    memberDiagnostics: snap3.memberDiagnostics,
    getText: (id) => (id === 'active' ? activeSyntax.doc.toString() : handbookPrelude.code),
    suiteFindings: [{
      kind: 'pragma-leak', severity: 'warning', at: 'active', atIsActive: true,
      affectedNames: ['fol-handbook.bel'], pragma: '--nostrengthen',
    }],
  });
  expect(!banner3, `the misleading "fix earlier file" banner must NOT appear when the active file caused it`);
  expect(msgs3.some((m) => /every previous file in the suite/.test(m)),
    'the pragma-leak warning (the true cause) is shown instead');
}

// Control: a GENUINELY independent prelude error still raises the banner.
{
  const indepPrelude = {
    code: `LF p : type =\n  | mk : badIndep\n;`,
    spans: [{ id: 'base', name: 'base.bel', startLine: 1, endLine: 3 }],
    offsetLines: 4,
    names: new Set(['p', 'mk']),
  };
  const activeSyntax = syntaxFor(`LF up : type =\n  | u : up\n;`);
  const client3 = haltingMock([{ marker: 'badIndep', message: 'Identifier badIndep is unbound' }]);
  const store4 = createCheckerStore();
  const settlement4 = createSettlement({
    belugaClient: client3,
    checkerStore: store4,
    getCheckContext: () => ({ doc: activeSyntax.doc, prelude: indepPrelude, suiteFindings: [] }),
  });
  await settlement4.settleNow(activeSyntax, 0);
  const msgs4 = store4.getSnapshot().belugaDiagnostics.map((d) => d.message);
  const banner4 = suitePreludeBannerForActive({
    doc: activeSyntax.doc,
    members: [
      { id: 'base', name: 'base.bel', text: indepPrelude.code },
      { id: 'active', name: 'use.bel', text: 'LF up : type =\n  | u : up\n;' },
    ],
    activeId: 'active',
    memberDiagnostics: store4.getSnapshot().memberDiagnostics,
    getText: (id) => (id === 'active' ? activeSyntax.doc.toString() : indepPrelude.code),
  });
  expect(banner4 && /earlier suite file/.test(banner4.message),
    `a genuinely independent prelude error STILL raises the banner, got: ${banner4?.message || '(none)'}`);
}

// Many independent prelude errors must not exhaust the pass budget before the
// active file is reached (classical-processes-scale suites).
{
  const blocks = [];
  for (let i = 0; i < 10; i += 1) {
    blocks.push(`LF p${i} : type =\n  | m${i} : bad${i}\n;`);
  }
  const preludeCode = blocks.join('\n\n');
  const prelude = {
    code: preludeCode,
    spans: [{ id: 'big', name: 'big.bel', startLine: 1, endLine: preludeCode.split('\n').length }],
    offsetLines: preludeCode.split('\n').length + 1,
    names: new Set(),
  };
  const activeSyntax = syntaxFor(`LF q : type =\n  | m : badActive\n;`);
  const rules = [];
  for (let i = 0; i < 10; i += 1) rules.push({ marker: `bad${i}`, message: `Identifier bad${i} is unbound` });
  rules.push({ marker: 'badActive', message: 'Identifier badActive is unbound' });
  const store5 = createCheckerStore();
  const settlement5 = createSettlement({
    belugaClient: haltingMock(rules),
    checkerStore: store5,
    getCheckContext: () => ({ doc: activeSyntax.doc, prelude }),
  });
  await settlement5.settleNow(activeSyntax, 0);
  const msgs5 = store5.getSnapshot().belugaDiagnostics.map((d) => d.message);
  expect(msgs5.some((m) => /badActive/.test(m)),
    `active error must survive a long broken prelude, got: ${msgs5.join(' | ')}`);
}

// Active-file errors that mention prelude-defined names must not be silently dropped.
{
  const prelude = {
    code: 'LF bad : type =\n  | t1 : badPre\n;',
    spans: [{ id: 'base', name: 'base.bel', startLine: 1, endLine: 3 }],
    offsetLines: 4,
    names: new Set(['bad', 't1', 'tp']),
  };
  const activeSyntax = syntaxFor(`LF use : type =\n  | u : tp\n;`);
  let pass = 0;
  const client5 = {
    fingerprint: (c) => `fp:${c.length}:${pass}`,
    checkResult: async (code) => {
      pass += 1;
      if (code.includes('badPre')) {
        return { ok: false, output: 'File "input.bel", line 2, column 1:\nError: Identifier badPre is unbound' };
      }
      return { ok: false, output: 'File "input.bel", line 6, column 1:\nError: Identifier tp is unbound' };
    },
  };
  const store6 = createCheckerStore();
  const settlement6 = createSettlement({
    belugaClient: client5,
    checkerStore: store6,
    getCheckContext: () => ({ doc: activeSyntax.doc, prelude }),
  });
  await settlement6.settleNow(activeSyntax, 0);
  const msgs6 = store6.getSnapshot().belugaDiagnostics.map((d) => d.message);
  expect(msgs6.some((m) => /Identifier tp is unbound/.test(m)),
    `active-file error naming a prelude symbol must surface, got: ${msgs6.join(' | ')}`);
}

console.log('OK settlement prelude recovery (earlier-file error masked, active file still linted, '
  + 'suite diags surfaced in-file, first-line span, banner re-attribution when active file is the cause)');
