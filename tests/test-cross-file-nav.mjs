// Cross-file project intelligence: the definition index over a file's
// development group (project-prelude.mjs) and the project-wide text scan
// (js/project-source.js). These power Ctrl+click/F12 across files, the
// palette's "@" group symbols, and "#" project search.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  defsOf,
  usesOf,
  groupFilesFor,
  findProjectDefinition,
  findGroupSignature,
  listGroupSymbols,
  groupReferencesFor,
  groupRenameEdits,
  applyTextEdits,
  groupDefinesName,
  buildPrelude,
  preludeFilesFor,
} from '../editor-src/project-prelude.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── fixture: one two-file development + an unrelated sibling project ─────────
const LAM = `LF term : type =
  | lam : (term -> term) -> term
  | app : term -> term -> term
;
LF pred : term -> term -> type =
  | beta : pred (app (lam M) N) (M N)
;`;

const EQUIV = `schema ctx = block x:term, t:pred x x;
rec eq1 : (g:ctx) [g |- pred M N] -> [g |- term] = ?;`;

const OTHER = `LF term : type = | k : term ;`; // same name, DIFFERENT project dir

// A .cfg pins the development order (alphabetical would put equiv before lam).
const FILES = [
  { id: 'cr/lam', name: 'church-rosser/lam.bel' },
  { id: 'cr/equiv', name: 'church-rosser/equiv.bel' },
  { id: 'cr/cfg', name: 'church-rosser/test.cfg' },
  { id: 'other/defs', name: 'other/defs.bel' },
];
const TEXTS = {
  'cr/lam': LAM,
  'cr/equiv': EQUIV,
  'cr/cfg': 'lam.bel\nequiv.bel\n',
  'other/defs': OTHER,
};
const getText = (id) => TEXTS[id] || '';

// ── defsOf ────────────────────────────────────────────────────────────────────
const defs = defsOf(LAM);
const defNames = defs.map((d) => d.name);
expect(defNames.includes('term') && defNames.includes('lam') && defNames.includes('pred'),
  `defsOf finds LF heads + constructors, got ${defNames.join(',')}`);
const termDef = defs.find((d) => d.name === 'term');
expect(LAM.slice(termDef.from, termDef.to) === 'term', 'def positions point at the name token');

// ── groupFilesFor ─────────────────────────────────────────────────────────────
const group = groupFilesFor(FILES, 'cr/equiv', getText);
expect(group.length === 2 && group[0].id === 'cr/lam' && group[1].id === 'cr/equiv',
  'group = same-directory files in order, active included');
expect(!group.some((f) => f.id === 'other/defs'), 'other directories never join the group');

// ── findProjectDefinition ─────────────────────────────────────────────────────
const hit = findProjectDefinition(FILES, 'cr/equiv', 'term', getText);
expect(hit && hit.fileId === 'cr/lam', `"term" resolves into lam.bel, got ${hit && hit.fileId}`);
expect(LAM.slice(hit.from, hit.to) === 'term', 'jump target is the defining token');

expect(findProjectDefinition(FILES, 'cr/equiv', 'nonexistent', getText) === null,
  'unknown name → null');
// The OTHER project's `term` must never win for church-rosser files.
expect(findProjectDefinition(FILES, 'cr/equiv', 'term', getText).fileId !== 'other/defs',
  'group isolation: sibling projects do not leak definitions');
// A file has no cross-file def for names it defines itself… but earlier files
// shadow: ask from lam.bel (first in group) → nothing earlier defines `term`.
expect(findProjectDefinition(FILES, 'cr/lam', 'term', getText) === null
  || findProjectDefinition(FILES, 'cr/lam', 'term', getText).fileId !== 'cr/lam',
  'a file is never its own cross-file target');

// Definition AFTER the active file still found (tooling friendliness).
const hitAfter = findProjectDefinition(FILES, 'cr/lam', 'eq1', getText);
expect(hitAfter && hitAfter.fileId === 'cr/equiv', 'post-active definitions found as fallback');

// ── listGroupSymbols ──────────────────────────────────────────────────────────
const syms = listGroupSymbols(FILES, 'cr/equiv', getText);
expect(syms.every((s) => s.fileId !== 'cr/equiv'), 'active file excluded (engine owns it)');
expect(syms.some((s) => s.name === 'beta' && s.fileId === 'cr/lam'), 'group symbols carry file ids');
expect(syms.every((s) => s.fileId !== 'other/defs'), 'group symbols stay in the group');

// ── usesOf: free occurrences only ────────────────────────────────────────────
const uses = usesOf(EQUIV);
expect(uses.some((u) => u.name === 'term'), 'free use of a group name is indexed');
expect(uses.some((u) => u.name === 'pred'), 'free use inside schema/rec indexed');
const lamUses = usesOf(LAM);
// `M`/`N` in beta's signature are implicitly bound metavariables — if the walk
// marks them bound they must not appear; tolerate either, but `term` self-uses
// inside lam.bel must be there.
expect(lamUses.some((u) => u.name === 'term'), 'in-file uses of own definitions indexed');

// ── findGroupSignature ────────────────────────────────────────────────────────
const sig = findGroupSignature(FILES, 'cr/equiv', 'lam', getText);
expect(sig && sig.fileName === 'church-rosser/lam.bel', 'signature found in defining file');
expect(sig.type.includes('term'), `signature carries the type text, got "${sig && sig.type}"`);
expect(typeof sig.label === 'string' && sig.label.length > 0, 'signature carries a kind label');
expect(findGroupSignature(FILES, 'cr/equiv', 'nope', getText) === null, 'unknown name → null');

// ── groupReferencesFor ────────────────────────────────────────────────────────
// Active = lam.bel (owns `term`): references in equiv.bel listed, with lines.
let refs = groupReferencesFor(FILES, 'cr/lam', 'term', getText);
expect(refs.length > 0 && refs.every((r) => r.fileId === 'cr/equiv'), 'uses found in the other group file');
expect(refs.every((r) => r.line >= 1 && r.col >= 1 && r.lineText.includes('term')),
  'references carry line/col/lineText');
expect(refs.every((r) => !r.isDef), 'no def rows when the active file owns the definition');
expect(refs.every((r) => r.fileId !== 'other/defs'), 'sibling projects excluded from references');

// Active = equiv.bel querying `term` with defFileId = lam.bel → def rows included.
refs = groupReferencesFor(FILES, 'cr/equiv', 'term', getText, { defFileId: 'cr/lam' });
expect(refs.some((r) => r.isDef && r.fileId === 'cr/lam'), 'definition rows marked in the def file');

// ── groupRenameEdits + applyTextEdits ────────────────────────────────────────
// Renaming `term` FROM lam.bel (active owns def): only equiv.bel's free uses.
let plans = groupRenameEdits(FILES, 'cr/lam', 'term', getText, null);
expect(plans.length === 1 && plans[0].fileId === 'cr/equiv', 'rename plan touches only the using file');
const renamed = applyTextEdits(EQUIV, plans[0].edits, 'tm');
expect(!/\bterm\b/.test(renamed), 'all free uses rewritten');
expect(renamed.includes('block x:tm') && renamed.includes('[g |- tm]'), 'rewrites land at the right spots');
expect(renamed.includes('pred'), 'unrelated names untouched');

// Renaming `term` FROM equiv.bel (def lives in lam.bel): def file gets def+uses.
plans = groupRenameEdits(FILES, 'cr/equiv', 'term', getText, 'cr/lam');
expect(plans.length === 1 && plans[0].fileId === 'cr/lam', 'def-file plan when renaming from a use site');
const lamRenamed = applyTextEdits(LAM, plans[0].edits, 'tm');
expect(lamRenamed.includes('LF tm : type') && !/\bterm\b/.test(lamRenamed),
  'definition and its in-file uses renamed');

// A file that defines the same name itself is left alone (shadowing).
const SHADOW = OTHER; // other/defs.bel defines its own `term`
const filesWithShadow = FILES.concat([{ id: 'cr/shadow', name: 'church-rosser/shadow.bel' }]);
const textsWithShadow = { ...TEXTS, 'cr/shadow': SHADOW };
plans = groupRenameEdits(filesWithShadow, 'cr/lam', 'term', (id) => textsWithShadow[id] || '', null);
expect(!plans.some((p) => p.fileId === 'cr/shadow'), 'files defining the name themselves are skipped');

// ── groupDefinesName (rename conflict guard) ─────────────────────────────────
expect(groupDefinesName(FILES, 'cr/equiv', 'lam', getText) === true, 'group conflict detected');
expect(groupDefinesName(FILES, 'cr/equiv', 'eq1', getText) === false,
  'active file own names are not group conflicts');
expect(groupDefinesName(FILES, 'cr/equiv', 'k', getText) === false, 'sibling project names ignored');

// ── resolver: external classification (the "IMPLICIT BINDER atm" bug) ────────
// A name defined by an earlier project file must classify as an external
// global WITH its signature — never as an implicit-binder guess.
{
  const { Text } = await import('@codemirror/state');
  const { parser } = await import('../editor-src/beluga-parser.js');
  const { resolveHoverDoc, referenceKind } = await import('../editor-src/bel-resolve.mjs');

  globalThis.BelJarPersist = {
    listFiles: () => FILES,
    getActiveFileId: () => 'cr/equiv',
    getFileText: (id) => TEXTS[id] || '',
  };
  try {
    const tree = parser.parse(EQUIV);
    const doc = Text.of(EQUIV.split('\n'));
    const at = EQUIV.indexOf('term'); // use inside `block x:term`
    const resolved = resolveHoverDoc(tree, doc, at);
    expect(resolved && resolved.kind === 'external',
      `group-defined name classifies as external, got ${resolved && resolved.kind}`);
    expect(resolved.label !== 'Implicit Binder', 'never the implicit-binder guess');
    expect(resolved.sourceType === 'type', `carries the source type, got "${resolved.sourceType}"`);
    expect(resolved.externalFile === 'church-rosser/lam.bel', 'carries the defining file');
    expect(referenceKind(tree, doc, at) === 'global', 'referenceKind sees a global');
  } finally {
    delete globalThis.BelJarPersist;
  }
  // Without project context the old behavior stands (no false externals).
  const tree2 = parser.parse(EQUIV);
  const doc2 = Text.of(EQUIV.split('\n'));
  const r2 = resolveHoverDoc(tree2, doc2, EQUIV.indexOf('term'));
  expect(!r2 || r2.kind !== 'external', 'no BelJarPersist → no external classification');
}

// ── group-rename undo matcher ────────────────────────────────────────────────
{
  const { matchGroupRename } = await import('../editor-src/bel-rename.mjs');
  const stack = [
    { originalName: 'term', newName: 'tm', undone: false, files: [] },
    { originalName: 'pred', newName: 'rel', undone: false, files: [] },
  ];
  expect(matchGroupRename(stack, 'undo', ['pred']) === stack[1], 'undo matches the re-inserted original name');
  expect(matchGroupRename(stack, 'undo', ['tm']) === null, 'undo never matches the new name');
  expect(matchGroupRename(stack, 'redo', ['rel']) === null, 'redo only matches undone entries');
  stack[1].undone = true;
  expect(matchGroupRename(stack, 'redo', ['rel']) === stack[1], 'redo matches the undone entry by new name');
  expect(matchGroupRename(stack, 'undo', ['pred']) === null, 'an undone entry cannot be re-undone');
  expect(matchGroupRename(stack, 'undo', ['term']) === stack[0], 'LIFO falls through to older entries');
}

// ── scanProjectText (js IIFE) ────────────────────────────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
const psSrc = readFileSync(join(here, '..', 'js', 'project-source.js'), 'utf8');
const fakeWindow = {};
// eslint-disable-next-line no-new-func
new Function('window', psSrc)(fakeWindow);
const PS = fakeWindow.BelJarProjectSource;

const scanFiles = [
  { id: 'a', name: 'a.bel', text: 'LF term : type =\n  | lam : term\n;' },
  { id: 'b', name: 'sub/b.bel', text: '% term term\nrec useTerm : [ |- term ] = ?;' },
];
let m = PS.scanProjectText(scanFiles, 'term', 60);
// 2 in a.bel + 2 on b.bel line 1 + 2 on b.bel line 2 ("useTerm" matches too).
expect(m.length === 6, `6 case-insensitive matches, got ${m.length}`);
expect(m[0].id === 'a' && m[0].line === 1 && m[0].col === 4, 'first match located at a.bel:1:4');
expect(scanFiles[0].text.slice(m[0].from, m[0].to) === 'term', 'absolute offsets slice the match');
const sameLine = m.filter((x) => x.id === 'b' && x.line === 1);
expect(sameLine.length === 2, 'multiple matches on one line all reported');
expect(PS.scanProjectText(scanFiles, 'TERM', 60).length === 6, 'query is case-insensitive');
expect(PS.scanProjectText(scanFiles, 'term', 3).length === 3, 'cap respected');
expect(PS.scanProjectText(scanFiles, '', 60).length === 0, 'empty query → no results');

// ── palette '#' mode ─────────────────────────────────────────────────────────
const cpSrc = readFileSync(join(here, '..', 'js', 'command-palette.js'), 'utf8');
const cpWindow = {};
// eslint-disable-next-line no-new-func
new Function('window', cpSrc)(cpWindow);
const parseInput = cpWindow.CommandPalette._pure.parseInput;
expect(parseInput('#foo').mode === 'search' && parseInput('#foo').query === 'foo',
  '# prefix → search mode, prefix stripped');
expect(parseInput('#').mode === 'search' && parseInput('#').query === '',
  'bare # → search mode, empty query');

// ── project prelude includes .elf files and orphan same-name siblings ─────────
// church-rosser: ord.cfg lists lam.elf, ord-red.elf, par-red.elf, par-lemmas.bel.
// `term` is defined in lam.elf, so editing par-red.elf OR the orphan par-red.bel
// (not in the cfg) must see lam.elf in its prelude — no fake "term unbound".
{
  const cr = [
    { id: 'c', name: 'church/ord.cfg', text: 'lam.elf\nord-red.elf\npar-red.elf\npar-lemmas.bel' },
    { id: 'l', name: 'church/lam.elf', text: 'LF term : type = | app : term -> term -> term ;' },
    { id: 'o', name: 'church/ord-red.elf', text: 'LF step : term -> term -> type = ;' },
    { id: 're', name: 'church/par-red.elf', text: 'LF pred : term -> term -> type = ;' },
    { id: 'rb', name: 'church/par-red.bel', text: 'pred : term -> term -> type.' },
    { id: 'pl', name: 'church/par-lemmas.bel', text: 'rec f : [ |- pred M N] = ?;' },
  ];
  const getText = (id) => (cr.find((f) => f.id === id) || {}).text || '';
  const preNames = (id) => preludeFilesFor(cr, id, getText).map((f) => f.name.split('/').pop());

  expect(preNames('re').includes('lam.elf'), '.elf active file gets the .elf prelude');
  expect(preNames('rb').includes('lam.elf'), 'orphan par-red.bel borrows par-red.elf prelude position');
  expect(!preNames('rb').includes('par-red.elf'), 'orphan does not include its same-name sibling (no double def)');
  expect(preNames('l').length === 0, 'first file (lam.elf) has no prelude');
  expect(buildPrelude(cr, cr.find((f) => f.id === 'rb').id, getText).names.has('term'),
    'prelude exposes `term` so it is not reported unbound');

  // The Run path (js IIFE) must agree.
  const psPre = (id) => PS.preludeFilesFor(cr, id, getText).map((f) => f.name.split('/').pop());
  expect(psPre('re').includes('lam.elf'), 'Run path: .elf active file gets prelude');
  expect(psPre('rb').includes('lam.elf'), 'Run path: orphan .bel borrows sibling prelude');
}

console.log('OK cross-file nav (defs index, group isolation, project def lookup, group symbols, text scan, # mode, prelude .elf/orphan)');
