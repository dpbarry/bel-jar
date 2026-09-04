// Edit cost = dirty frontier: a last-declaration body edit must not re-fingerprint
// the prelude, and undefined-app lint of earlier decls must survive by remap.
import { Text, ChangeSet } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSyntaxStore } from '../js/editor-src/semantic/syntax-store.mjs';
import { createSymbolStore } from '../js/editor-src/semantic/symbol-store.mjs';
import { createSemanticGraph } from '../js/editor-src/semantic/semantic-graph.mjs';
import { settlementTrigger } from '../js/editor-src/semantic/check-gate.mjs';
import { collectUndefinedApplicationDiags } from '../js/editor-src/name-resolve.mjs';
import { collectParseDiagnostics } from '../js/editor-src/tree-walk.mjs';

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

const SRC = `--inhfix bogus.
LF tp : type =
  | z : tp
;
q : t p → tp.
rec f : tp =
  z
;
`;

function snap(store, text, changes = null) {
  const doc = Text.of(text.split('\n'));
  const tree = parser.parse(text);
  return store.update(tree, doc, { changes });
}

{
  const store = createSyntaxStore();
  const s0 = snap(store, SRC);
  void s0.syntaxDiagnostics;

  const at = SRC.lastIndexOf('z');
  const commented = `${SRC.slice(0, at + 1)} % note${SRC.slice(at + 1)}`;
  const changes = ChangeSet.of([{ from: at + 1, to: at + 1, insert: ' % note' }], SRC.length);
  const s1 = snap(store, commented, changes);
  if (settlementTrigger(s0, s1, { changes }) !== 'cosmetic') {
    fail('comment in the last declaration must be cosmetic (block spine, no whole-doc fingerprint)');
  }

  const renamed = `${SRC.slice(0, at)}s${SRC.slice(at + 1)}`;
  const store2 = createSyntaxStore();
  const a0 = snap(store2, SRC);
  const ch2 = ChangeSet.of([{ from: at, to: at + 1, insert: 's' }], SRC.length);
  const a1 = snap(store2, renamed, ch2);
  if (settlementTrigger(a0, a1, { changes: ch2 }) !== 'semantic') {
    fail('identifier change in the last declaration must be semantic');
  }
}

{
  const store = createSyntaxStore();
  const s0 = snap(store, SRC);
  const before = s0.syntaxDiagnostics.filter((d) => /not defined/.test(d.message));
  if (before.length < 1) fail('fixture must flag the undefined application in the earlier decl');

  const at = SRC.lastIndexOf('z');
  const edited = `${SRC.slice(0, at)}s${SRC.slice(at + 1)}`;
  const changes = ChangeSet.of([{ from: at, to: at + 1, insert: 's' }], SRC.length);
  const s1 = snap(store, edited, changes);
  const after = s1.syntaxDiagnostics.filter((d) => /not defined/.test(d.message));
  const full = collectUndefinedApplicationDiags(s1.tree, s1.doc);
  if (after.length !== full.length) {
    fail(`last-block lint dropped earlier undef-app diags (${after.length} vs full ${full.length})`);
  }
  for (const d of after) {
    const hit = full.find((f) => f.from === d.from && f.to === d.to && f.message === d.message);
    if (!hit) fail(`remapped undef-app @${d.from} missing from a full pass`);
  }

  const parseAfter = s1.parseDiags.filter((d) => d.message === 'Unknown pragma');
  const parseFull = collectParseDiagnostics(s1.tree, s1.doc).filter((d) => d.message === 'Unknown pragma');
  if (parseAfter.length !== parseFull.length) {
    fail(`last-block parse remap dropped earlier pragma diags (${parseAfter.length} vs full ${parseFull.length})`);
  }
}

{
  const syntaxStore = createSyntaxStore();
  const symbolStore = createSymbolStore();
  const graph = createSemanticGraph();
  const s0 = snap(syntaxStore, SRC);
  void s0.syntaxDiagnostics;
  const g0 = graph.update(symbolStore.update(s0), s0);
  if (g0._updateKind !== 'full') fail(`bootstrap graph must be full, got ${g0._updateKind}`);

  const at = SRC.lastIndexOf('z');
  const edited = `${SRC.slice(0, at)}s${SRC.slice(at + 1)}`;
  const changes = ChangeSet.of([{ from: at, to: at + 1, insert: 's' }], SRC.length);
  const s1 = snap(syntaxStore, edited, changes);
  void s1.syntaxDiagnostics;
  const g1 = graph.update(symbolStore.update(s1, { changes }), s1);
  if (g1._updateKind !== 'incremental') {
    fail(`last-decl body edit must reuse the graph, got ${g1._updateKind}`);
  }
}

console.log('OK edit-cost-frontier (last-decl comment cosmetic, body semantic, earlier lint remaps, graph incremental)');
