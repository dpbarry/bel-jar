// What declares a name (js/editor-src/tree-helpers.mjs `declaresName`): one
// rule for every reader of the tree. A top-level LF declaration has no
// keyword, so the parser's error recovery makes one out of any stray word,
// inventing the `:` and `.` it lacks. Before the rule had one owner, the
// symbol store took such a word for a constant (completion offered
// `afadsf… :: dfsafdfda fadsff` in a blank project), Harpoon took it for a
// constructor, suite lint for a family member, while the lint called it a
// syntax error.
import { Text, EditorState } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { beluga } from '../js/editor-src/language.mjs';
import { syntaxTree as syntaxTreeOf } from '@codemirror/language';
import { createSyntaxStore } from '../js/editor-src/semantic/syntax-store.mjs';
import { createSymbolStore } from '../js/editor-src/semantic/symbol-store.mjs';
import { classifyCompletionSite } from '../js/editor-src/ide/completion/classify.mjs';
import { contributeIdents } from '../js/editor-src/ide/completion/contributors.mjs';
import { walkTree, collectParseDiagnostics } from '../js/editor-src/tree-walk.mjs';
import { resolveHoverDoc } from '../js/editor-src/name-resolve.mjs';
import { enumerateConstructorsTyped } from '../js/editor-src/prover/hole-split.mjs';
import { fileShadowInfo } from '../js/editor-src/ide/suite-lint.mjs';
import { declaresName } from '../js/editor-src/tree-helpers.mjs';
import { prepareEditorDoc } from '../js/editor-src/editor-doc-prep.mjs';
import { enclosingTopLevelDecl, crumbSpan } from '../js/editor-src/ide/sticky-decl.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const DEAN = ['afadsfdsadafdafdafsadffsfdadfafdafafdaf', '', 'dfsafdfda', '', 'fadsff'].join('\n');

function read(src) {
  const doc = Text.of(src.split('\n'));
  const tree = parser.parse(src);
  const syntaxStore = createSyntaxStore({ documentId: 'workspace://main.bel' });
  const syntax = syntaxStore.update(tree, doc, { documentId: 'workspace://main.bel' });
  const symbols = createSymbolStore();
  symbols.update(syntax);
  const walk = walkTree(tree, doc);
  return {
    doc,
    tree,
    engine: { stores: { symbols, syntax: syntaxStore } },
    symbolNames: symbols.visibleSymbolsAt(src.length, {}).filter((s) => s.isGlobal).map((s) => s.name).sort(),
    definedNames: [...new Set(walk.definedNames.map((d) => d.name))].sort(),
    defMapNames: [...walk.defMap.keys()].sort(),
  };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** What completion offers at `pos`, as the editor asks for it. */
function offeredAt(r, src, pos) {
  const site = classifyCompletionSite(EditorState.create({ doc: src, extensions: [beluga()] }), pos, r.engine);
  return { site, labels: site ? contributeIdents(site, r.engine).map((i) => i.label) : [] };
}

// ── the report: a blank project, a few lines of nothing ──────────────────────
{
  const r = read(DEAN);
  const { site, labels } = offeredAt(r, DEAN, DEAN.length);
  expect(site && site.kind === 'ident', `typing the last word is an identifier site (${site && site.kind})`);
  expect(!labels.some((l) => l.startsWith('afadsf')), `completion offers no made-up constant (${labels.join(', ')})`);
  expect(same(r.symbolNames, []), `no stray word is a symbol (${r.symbolNames})`);
  expect(same(r.definedNames, []) && same(r.defMapNames, []), `nor a defined name in the names walk (${r.definedNames} / ${r.defMapNames})`);
  const hover = resolveHoverDoc(r.tree, r.doc, 3);
  expect(!hover || hover.kind !== 'global', `hovering the first word finds no declaration (${hover && hover.kind})`);
  expect(collectParseDiagnostics(r.tree, r.doc).length > 0, 'and the lint still calls it what it is: a syntax error');
}
{
  const r = read('abc def\n');
  expect(same(r.symbolNames, []) && same(r.defMapNames, []), `two words declare nothing (${r.symbolNames})`);
}

// ── what the author did declare, including a declaration still being typed ──
{
  const src = 'nat : type.\nz : nat.\ns : nat -> na';
  const r = read(src);
  expect(same(r.symbolNames, ['nat', 's', 'z']), `declared names are symbols, the unfinished one too (${r.symbolNames})`);
  expect(same(r.definedNames, ['nat', 's', 'z']), `and the names walk agrees: its colon is written, its period may come (${r.definedNames})`);
  const term = 'nat : type.\nz : nat.\nrec f : [|- nat] = [|- n';
  const offered = offeredAt(read(term), term, term.length).labels;
  expect(offered.includes('z'), `completion still offers what was declared (${offered.join(', ')})`);
  const hover = resolveHoverDoc(r.tree, r.doc, src.indexOf('z :'));
  expect(hover && hover.kind === 'global', 'a real declaration still hovers as one');
}

// ── Harpoon's constructors, suite lint ───────────────────────────────────────
{
  // One stray "declaration" whose recovered type ends in the family.
  const src = 'nat : type.\nz : nat.\nfoo nat -> nat';
  const ctors = enumerateConstructorsTyped(src, 'nat').map((c) => c.name);
  expect(same(ctors, ['z']), `a stray word under a family is no constructor of it (${ctors})`);
  const info = fileShadowInfo(src);
  expect(!info.memberType.has('foo') && info.memberType.get('z') === 'nat', 'nor a member of it for suite lint');
}

// ── the indenter: the editor re-indents every file it opens ─────────────────
{
  expect(prepareEditorDoc(DEAN, 'main.bel') === DEAN, 'stray words open exactly as written: no line indented as a type continuing');
  const kept = 'stray words\n    here indented\n';
  expect(prepareEditorDoc(kept, 'a.bel') === kept, 'and keep whatever indentation the author gave them');
  const real = prepareEditorDoc('plus : nat ->\nnat -> type.\n', 'b.bel');
  expect(/\n  nat/.test(real), `a real declaration's type still continues indented (${JSON.stringify(real)})`);
}

// ── the sticky header and the breadcrumbs ────────────────────────────────────
{
  const state = EditorState.create({ doc: DEAN, extensions: [beluga()] });
  expect(enclosingTopLevelDecl(state, 50) === null, 'the sticky header names no declaration inside stray words');
  let lfDecl = null;
  syntaxTreeOf(state).iterate({ enter(ref) { if (!lfDecl && ref.name === 'LFDeclaration') lfDecl = ref.node; } });
  expect(lfDecl && crumbSpan(state, lfDecl) === null, 'nor does a breadcrumb');
  const real = EditorState.create({ doc: 'nat : type.\nz : nat.\n', extensions: [beluga()] });
  const at = enclosingTopLevelDecl(real, 13);
  expect(at && at.name === 'LFDeclaration' && crumbSpan(real, at).label === 'z', 'a real declaration still heads the sticky header');
}

// ── ⛔ one rule: every reader names the same declarations ────────────────────
{
  const sources = [
    DEAN,
    'abc def\n',
    'nat : type.\nz : nat.\ns : nat -> nat.\n',
    'nat : type.\nz : nat.\ns : nat -> na',
    'nat : type.\nstray words here\nz : nat.\n',
    'LF tm : type =\n| app : tm -> tm -> tm\n| lam : (tm -> tm) -> tm;\n',
  ];
  for (const src of sources) {
    const r = read(src);
    expect(same(r.symbolNames, r.defMapNames) && same(r.symbolNames, r.definedNames),
      `symbols, the def map and the names walk agree on ${JSON.stringify(src.slice(0, 24))}: ${r.symbolNames} / ${r.defMapNames} / ${r.definedNames}`);
  }
  const tree = parser.parse('abc\nnat : type.\n');
  const decls = [];
  tree.iterate({ enter(ref) { if (ref.name === 'LFDeclaration') decls.push(declaresName(ref.node)); } });
  expect(same(decls, [false, true]), `the predicate itself: a bare word no, a written colon yes (${decls})`);
}

console.log(`OK declares name (${n} checks: the report, stray words, unfinished declarations, constructors, suite lint, the indenter, every reader agrees)`);
