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
  findProjectDefinitions,
  findGroupSignature,
  listGroupSymbols,
  groupReferencesFor,
  groupRenameEdits,
  applyTextEdits,
  groupDefinesName,
  buildPrelude,
  preludeFilesFor,
  activeCfgResolver,
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
const crRosserOpts = { activeCfgForDir: activeCfgResolver({ 'church-rosser': 'church-rosser/test.cfg' }) };

// ── defsOf ────────────────────────────────────────────────────────────────────
const defs = defsOf(LAM);
const defNames = defs.map((d) => d.name);
expect(defNames.includes('term') && defNames.includes('lam') && defNames.includes('pred'),
  `defsOf finds LF heads + constructors, got ${defNames.join(',')}`);
const termDef = defs.find((d) => d.name === 'term');
expect(LAM.slice(termDef.from, termDef.to) === 'term', 'def positions point at the name token');

// ── groupFilesFor ─────────────────────────────────────────────────────────────
const group = groupFilesFor(FILES, 'cr/equiv', getText, crRosserOpts);
expect(group.length === 2 && group[0].id === 'cr/lam' && group[1].id === 'cr/equiv',
  'group = same-directory files in order, active included');
expect(!group.some((f) => f.id === 'other/defs'), 'other directories never join the group');

// ── findProjectDefinition ─────────────────────────────────────────────────────
const hit = findProjectDefinition(FILES, 'cr/equiv', 'term', getText, crRosserOpts);
expect(hit && hit.fileId === 'cr/lam', `"term" resolves into lam.bel, got ${hit && hit.fileId}`);
expect(LAM.slice(hit.from, hit.to) === 'term', 'jump target is the defining token');

expect(findProjectDefinition(FILES, 'cr/equiv', 'nonexistent', getText, crRosserOpts) === null,
  'unknown name → null');
// The OTHER project's `term` must never win for church-rosser files.
expect(findProjectDefinition(FILES, 'cr/equiv', 'term', getText, crRosserOpts).fileId !== 'other/defs',
  'group isolation: sibling projects do not leak definitions');
// A file has no cross-file def for names it defines itself… but earlier files
// shadow: ask from lam.bel (first in group) → nothing earlier defines `term`.
expect(findProjectDefinition(FILES, 'cr/lam', 'term', getText, crRosserOpts) === null
  || findProjectDefinition(FILES, 'cr/lam', 'term', getText, crRosserOpts).fileId !== 'cr/lam',
  'a file is never its own cross-file target');

// Definition AFTER the active file still found (tooling friendliness).
const hitAfter = findProjectDefinition(FILES, 'cr/lam', 'eq1', getText, crRosserOpts);
expect(hitAfter && hitAfter.fileId === 'cr/equiv', 'post-active definitions found as fallback');

// ── findProjectDefinitions (multi-target disambiguation) ──────────────────────
// A name defined in two visible files: both candidates are returned so go-to-def
// can offer a chooser. Build a 3-file development where `dup` is defined twice.
{
  const A = 'LF dup : type = ;';
  const B = 'LF dup : type = ;';
  const C = 'rec useDup : [ |- dup ] = ?;';
  const mf = [
    { id: 'm/a', name: 'multi/a.bel' },
    { id: 'm/b', name: 'multi/b.bel' },
    { id: 'm/c', name: 'multi/c.bel' },
    { id: 'm/cfg', name: 'multi/m.cfg' },
  ];
  const mt = { 'm/a': A, 'm/b': B, 'm/c': C, 'm/cfg': 'a.bel\nb.bel\nc.bel\n' };
  const get = (id) => mt[id] || '';
  const mOpts = { activeCfgForDir: activeCfgResolver({ multi: 'multi/m.cfg' }) };
  const all = findProjectDefinitions(mf, 'm/c', 'dup', get, mOpts);
  expect(all.length === 2, `dup defined in two files → 2 candidates, got ${all.length}`);
  expect(all[0].fileId === 'm/b' && all[1].fileId === 'm/a',
    'closest-prelude candidate ordered first');
  expect(all.every((h) => get(h.fileId).slice(h.from, h.to) === 'dup'),
    'each candidate points at its defining token');
  // Single-definition names return a one-element list (parity with the singular).
  const one = findProjectDefinitions(FILES, 'cr/equiv', 'lam', getText, crRosserOpts);
  expect(one.length === 1 && one[0].fileId === 'cr/lam', 'single definition → one candidate');
  expect(findProjectDefinitions(FILES, 'cr/equiv', 'nope', getText, crRosserOpts).length === 0,
    'unknown name → no candidates');
}

// ── listGroupSymbols ──────────────────────────────────────────────────────────
const syms = listGroupSymbols(FILES, 'cr/equiv', getText, crRosserOpts);
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
const sig = findGroupSignature(FILES, 'cr/equiv', 'lam', getText, crRosserOpts);
expect(sig && sig.fileName === 'church-rosser/lam.bel', 'signature found in defining file');
expect(sig.type.includes('term'), `signature carries the type text, got "${sig && sig.type}"`);
expect(typeof sig.label === 'string' && sig.label.length > 0, 'signature carries a kind label');
expect(findGroupSignature(FILES, 'cr/equiv', 'nope', getText, crRosserOpts) === null, 'unknown name → null');

// ── groupReferencesFor ────────────────────────────────────────────────────────
// Active = lam.bel (owns `term`): references in equiv.bel listed, with lines.
let refs = groupReferencesFor(FILES, 'cr/lam', 'term', getText, crRosserOpts);
expect(refs.length > 0 && refs.every((r) => r.fileId === 'cr/equiv'), 'uses found in the other group file');
expect(refs.every((r) => r.line >= 1 && r.col >= 1 && r.lineText.includes('term')),
  'references carry line/col/lineText');
expect(refs.every((r) => !r.isDef), 'no def rows when the active file owns the definition');
expect(refs.every((r) => r.fileId !== 'other/defs'), 'sibling projects excluded from references');

// Active = equiv.bel querying `term` with defFileId = lam.bel → def rows included.
refs = groupReferencesFor(FILES, 'cr/equiv', 'term', getText, { defFileId: 'cr/lam', ...crRosserOpts });
expect(refs.some((r) => r.isDef && r.fileId === 'cr/lam'), 'definition rows marked in the def file');
// Without defFileId the defining prelude file is skipped (it defines the name locally there).
refs = groupReferencesFor(FILES, 'cr/equiv', 'term', getText, crRosserOpts);
expect(!refs.some((r) => r.fileId === 'cr/lam'),
  'defining prelude file omitted without defFileId — UI must pass defFileId on use sites');
expect(refs.length === 0,
  'cross-file scan empty when the only other file is the skipped def file');

// CRLF sources index like the editor (normalized newlines) so cross-file jumps land on the term.
{
  const crlf = EQUIV.replace(/\n/g, '\r\n');
  const uses = usesOf(crlf);
  const normalized = EQUIV;
  const sample = uses.find((u) => u.name === 'term');
  expect(sample, 'CRLF equiv still indexes term uses');
  const plain = usesOf(normalized).find((u) => u.name === 'term' && u.from === sample.from);
  expect(plain, 'CRLF and LF yields agree on term offset');
}

// CRLF storage must rename on the same normalized basis as groupRenameEdits.
{
  const { applyGroupRenameToFile } = await import('../editor-src/project-prelude.mjs');
  const crlf = EQUIV.replace(/\n/g, '\r\n');
  const crlfPlans = groupRenameEdits(FILES, 'cr/lam', 'term', (id) => (id === 'cr/equiv' ? crlf : getText(id)), crRosserOpts);
  expect(crlfPlans.length === 1 && crlfPlans[0].fileId === 'cr/equiv', 'CRLF rename plan on equiv');
  const crlfRenamed = applyGroupRenameToFile(crlf, 'church-rosser/equiv.bel', crlfPlans[0].edits, 'tm', 'term');
  expect(!/\bterm\b/.test(crlfRenamed), 'CRLF group rename rewrites free uses');
  expect(crlfRenamed.includes('block x:tm'), 'CRLF rename lands at the right spot');
}

// Renaming `term` FROM lam.bel (active owns def): only equiv.bel's free uses.
let plans = groupRenameEdits(FILES, 'cr/lam', 'term', getText, crRosserOpts);
expect(plans.length === 1 && plans[0].fileId === 'cr/equiv', 'rename plan touches only the using file');
const renamed = applyTextEdits(EQUIV, plans[0].edits, 'tm');
expect(!/\bterm\b/.test(renamed), 'all free uses rewritten');
expect(renamed.includes('block x:tm') && renamed.includes('[g |- tm]'), 'rewrites land at the right spots');
expect(renamed.includes('pred'), 'unrelated names untouched');

// Renaming `term` FROM equiv.bel (def lives in lam.bel): def file gets def+uses.
plans = groupRenameEdits(FILES, 'cr/equiv', 'term', getText, { defFileId: 'cr/lam', ...crRosserOpts });
expect(plans.length === 1 && plans[0].fileId === 'cr/lam', 'def-file plan when renaming from a use site');
const lamRenamed = applyTextEdits(LAM, plans[0].edits, 'tm');
expect(lamRenamed.includes('LF tm : type') && !/\bterm\b/.test(lamRenamed),
  'definition and its in-file uses renamed');

// A file that defines the same name itself is left alone (shadowing).
const SHADOW = OTHER; // other/defs.bel defines its own `term`
const filesWithShadow = FILES.concat([{ id: 'cr/shadow', name: 'church-rosser/shadow.bel' }]);
const textsWithShadow = { ...TEXTS, 'cr/shadow': SHADOW };
plans = groupRenameEdits(filesWithShadow, 'cr/lam', 'term', (id) => textsWithShadow[id] || '', crRosserOpts);
expect(!plans.some((p) => p.fileId === 'cr/shadow'), 'files defining the name themselves are skipped');

// ── groupDefinesName (rename conflict guard) ─────────────────────────────────
expect(groupDefinesName(FILES, 'cr/equiv', 'lam', getText, crRosserOpts) === true, 'group conflict detected');
expect(groupDefinesName(FILES, 'cr/equiv', 'eq1', getText, crRosserOpts) === false,
  'active file own names are not group conflicts');
expect(groupDefinesName(FILES, 'cr/equiv', 'k', getText, crRosserOpts) === false, 'sibling project names ignored');

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
    getActiveCfgForDir: (dir) => (dir === 'church-rosser' ? 'church-rosser/test.cfg' : null),
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

// ── rename suggestion + preview message (pure helpers) ───────────────────────
{
  const { suggestRenameName, renamePreviewMessage, renameReachTooltip } = await import('../editor-src/bel-rename.mjs');
  // Prime variant offered first when free.
  expect(suggestRenameName('term', () => false) === "term'", 'first suggestion is the primed name');
  // When the prime is taken, fall through to numbered variants.
  const taken = new Set(["term'", 'term1']);
  expect(suggestRenameName('term', (c) => taken.has(c)) === 'term2',
    'numbered variant chosen when prime and term1 are taken');
  // Everything taken within the limit → null.
  expect(suggestRenameName('x', () => true, 3) === null, 'no free name within limit → null');
  expect(suggestRenameName('', () => false) === null, 'empty base → null');

  expect(renamePreviewMessage('foo', 1, 0) === 'Renaming "foo" — 1 occurrence here.',
    'singular, no group');
  expect(renamePreviewMessage('foo', 3, 0) === 'Renaming "foo" — 3 occurrences here.',
    'plural, no group');
  expect(renamePreviewMessage('foo', 2, 5) === 'Renaming "foo" — 2 occurrences here, 5 occurrences across the suite.',
    'group reach appended when present');

  expect(renameReachTooltip(1) === '1 occurrence across the suite', 'menu tooltip singular');
  expect(renameReachTooltip(7) === '7 occurrences across the suite', 'menu tooltip plural');
  expect(renameReachTooltip(0) === '', 'menu tooltip empty when none');
}

// ── reference file section headers ───────────────────────────────────────────
{
  const {
    fileReferenceSectionLabel,
    shouldShowReferenceFileHeader,
    referenceFileHeaderLabel,
  } = await import('../editor-src/bel-refs-panel.mjs');

  expect(fileReferenceSectionLabel('church/lam.bel', 3) === 'lam.bel (3)',
    'basename + count');
  expect(fileReferenceSectionLabel('', 2, { legacyThisFile: true }) === 'this file (2)',
    'legacy single-file unresolved header preserved');

  const gathered = { multiFile: true };
  const current = { isCurrent: true, fileName: 'church/lam.bel', rows: [{}, {}] };
  const nav = { nameRange: { from: 0, to: 4 } };
  expect(shouldShowReferenceFileHeader(current, gathered, nav), 'multi-file shows current-file header');
  expect(referenceFileHeaderLabel(current, gathered, nav) === 'lam.bel (2)',
    'current file header uses basename');

  const single = { multiFile: false };
  expect(!shouldShowReferenceFileHeader(current, single, nav),
    'single-file resolved symbol has no per-file header');
  const unresolved = { isCurrent: true, rows: [{}] };
  expect(shouldShowReferenceFileHeader(unresolved, single, null),
    'single-file unresolved keeps this-file header');
}

// ── gatherReferenceGroups cfg order ───────────────────────────────────────────
{
  const { gatherReferenceGroups } = await import('../editor-src/bel-refs-panel.mjs');
  const { EditorState } = await import('@codemirror/state');
  const doc = EditorState.create({ doc: EQUIV });
  const view = { state: doc };
  const g = {
    BelJarCurrentEditor: { getDocumentId: () => 'cr/equiv' },
    BelJarPersist: {
      getActiveFileId: () => 'cr/equiv',
      listFiles: () => FILES,
      getFileText: getText,
      getActiveCfgForDir: (dir) => (dir === 'church-rosser' ? 'church-rosser/test.cfg' : null),
    },
  };
  const gathered = gatherReferenceGroups(view, g, null, 'term', 'cr/lam');
  const equivIds = gathered.groups.map((gr) => gr.fileId);
  expect(equivIds.includes('cr/equiv'), 'active file refs included');
  expect(equivIds[0] === 'cr/lam' && equivIds.indexOf('cr/equiv') > 0,
    'sections follow cfg order (lam before equiv), active file not pinned to top');

  const lamDoc = EditorState.create({ doc: LAM });
  const lamView = { state: lamDoc };
  const gLam = {
    BelJarCurrentEditor: { getDocumentId: () => 'cr/lam' },
    BelJarPersist: {
      getActiveFileId: () => 'cr/lam',
      listFiles: () => FILES,
      getFileText: getText,
      getActiveCfgForDir: (dir) => (dir === 'church-rosser' ? 'church-rosser/test.cfg' : null),
    },
  };
  const fromLam = gatherReferenceGroups(lamView, gLam, null, 'term', null);
  const lamIds = fromLam.groups.map((gr) => gr.fileId);
  expect(lamIds.includes('cr/equiv'), 'equiv refs included when browsing from lam.bel');
  expect(lamIds.indexOf('cr/equiv') > lamIds.indexOf('cr/lam'),
    'equiv section follows lam in cfg order, not pinned to top');
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

// ── cfg members get prelude; unlisted same-level files stay isolated ────────────
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
  const churchOpts = { activeCfgForDir: activeCfgResolver({ church: 'church/ord.cfg' }) };
  const preNames = (id) => preludeFilesFor(cr, id, getText, churchOpts).map((f) => f.name.split('/').pop());

  expect(preNames('re').includes('lam.elf'), '.elf cfg member gets prelude');
  expect(preNames('rb').length === 0, 'unlisted par-red.bel has no prelude');
  expect(preNames('pl').includes('lam.elf'), 'cfg member par-lemmas.bel gets prelude');
  expect(preNames('l').length === 0, 'first file (lam.elf) has no prelude');
  expect(buildPrelude(cr, cr.find((f) => f.id === 'rb').id, getText, churchOpts) == null,
    'unlisted file has no checker prelude');

  const psPre = (id) => PS.preludeFilesFor(cr, id, getText, churchOpts).map((f) => f.name.split('/').pop());
  expect(psPre('re').includes('lam.elf'), 'Run path: .elf cfg member gets prelude');
  expect(psPre('rb').length === 0, 'Run path: unlisted par-red.bel stays isolated');
}

console.log('OK cross-file nav (defs index, group isolation, project def lookup, group symbols, text scan, # mode, prelude .elf/orphan)');
