// Unlisted same-level files are isolated — no prelude visibility.
import { EditorState } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import { beluga } from '../js/editor-src/language.mjs';
import { prepareEditorDoc } from '../js/editor-src/editor-doc-prep.mjs';
import { expandBelAliases } from '../js/editor-src/aliases.mjs';
import { activeCfgResolver } from '../js/editor-src/semantic/development.mjs';
import { canFindReferences } from '../js/editor-src/ide/refs-panel.mjs';
import { findProjectDefinition, findGroupDefinition } from '../js/editor-src/semantic/project-prelude.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const cr = [
  { id: 'c', name: 'church/ord.cfg', text: 'lam.elf\nord-red.elf\npar-red.elf\npar-lemmas.bel' },
  { id: 'l', name: 'church/lam.elf', text: 'LF term : type = | app : term -> term -> term ;' },
  { id: 'o', name: 'church/ord-red.elf', text: 'LF step : term -> term -> type = ;' },
  { id: 're', name: 'church/par-red.elf', text: 'LF pred : term -> term -> type = ;' },
  { id: 'rb', name: 'church/par-red.bel', text: 'rec sim : (g:ctx) [g |- term] -> [g |- term] = ?;' },
];
const getText = (id) => (cr.find((f) => f.id === id) || {}).text || '';
const churchOpts = { activeCfgForDir: activeCfgResolver({ church: 'church/ord.cfg' }) };

expect(
  findGroupDefinition(cr, 'rb', 'term', getText, churchOpts) == null,
  'unlisted par-red.bel must not see suite term',
);
expect(
  findProjectDefinition(cr, 'rb', 'term', getText, churchOpts) == null,
  'module lookup must not cross into suite for unlisted file',
);

const useDoc = prepareEditorDoc(getText('rb'), 'church/par-red.bel');
// ⛔ A NORMALIZED needle for a normalized document. `prepareEditorDoc` expands
// `|-` to ⊢, so `indexOf('[g |- term]')` is -1 and `usePos` lands 5 characters
// into the file — the assertion below then reported "im :" and read as a bug in
// the definition index. Expand the needle the same way the document was, so the
// fixture stays readable here and correct there whatever the alias table says.
const useNeedle = expandBelAliases('[g |- term]');
const useAt = useDoc.indexOf(useNeedle);
expect(useAt >= 0, `fixture text is in the prepared document (looked for ${useNeedle})`);
const usePos = useAt + expandBelAliases('[g |- ').length;
expect(useDoc.slice(usePos, usePos + 4) === 'term', `fixture should land on term, got "${useDoc.slice(usePos, usePos + 4)}"`);

const state = EditorState.create({ doc: useDoc, extensions: [beluga()] });
ensureSyntaxTree(state, useDoc.length, 5000);
const view = { state };

globalThis.window = globalThis;
globalThis.Persist = {
  getActiveFileId: () => 'rb',
  listFiles: () => cr,
  getFileText: getText,
  getActiveCfgForDir: churchOpts.activeCfgForDir,
};
globalThis.CurrentEditor = { getDocumentId: () => 'rb' };

expect(
  !canFindReferences(view, usePos),
  'unlisted file must not find references for isolated prelude name',
);

console.log('OK context menu refs gate (unlisted file isolation)');
