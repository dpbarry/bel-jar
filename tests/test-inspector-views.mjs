// Inspector non-symbol views: built-in token explainer resolver, the global
// overview model assembly, and the engine outline accessor that backs it.
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';
import { builtinTooltipAt } from '../editor-src/bel-builtins.mjs';
import { assembleGlobalModel, isGlobalOverviewModel, crossFileSymbolDiagnostics } from '../editor-src/bel-inspector.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const SAMPLE = `LF o : type =
  | imp : o → o → o
  | top : o
;
LF nd : o → type =
  | impI : (nd A → nd B) → nd (imp A B)
  | topI : nd top
;
`;

const doc = Text.of(SAMPLE.split('\n'));
const tree = parser.parse(SAMPLE);
const e = createSemanticEngine();
e.update(tree, doc);

// ── builtinTooltipAt ────────────────────────────────────────────────────────
const typeHit = builtinTooltipAt(tree, doc, SAMPLE.indexOf('type') + 1);
expect(typeHit, 'builtinTooltipAt resolves on the `type` keyword');
expect(typeHit.label === 'LF KIND', `type keyword label is LF KIND (got ${typeHit && typeHit.label})`);
expect(/type/.test(typeHit.desc), 'type keyword carries a description');

const arrowHit = builtinTooltipAt(tree, doc, SAMPLE.indexOf('→') + 1);
expect(arrowHit, 'builtinTooltipAt resolves on the → operator');
expect(arrowHit.label === 'FUNCTION ARROW', `→ resolves to FUNCTION ARROW (got ${arrowHit && arrowHit.label})`);

const userHit = builtinTooltipAt(tree, doc, SAMPLE.indexOf('nd') + 1);
expect(!userHit, 'builtinTooltipAt returns null on a user identifier (nd)');

// ── engine.outlineSymbols ───────────────────────────────────────────────────
const outline = e.outlineSymbols();
const names = outline.map((s) => s.name);
expect(names.includes('o') && names.includes('nd'), 'outline includes the LF type families o and nd');
expect(!names.includes('impI') && !names.includes('imp'),
  'outline excludes constructors (impI, imp)');
expect(names.indexOf('o') < names.indexOf('nd'), 'outline is in source order (o before nd)');
expect(outline.every((s) => s.nameRange && typeof s.nameRange.from === 'number'),
  'every outline row carries a jump range');

// ── assembleGlobalModel ─────────────────────────────────────────────────────
const gm = assembleGlobalModel({
  fileName: 'main.bel',
  outline: [{ name: 'nat' }, { name: 'list' }],
  diagnostics: [{ severity: 'error' }, { severity: 'warning' }, { severity: 'warning' }],
  settle: 'checking',
  development: { kind: 'module', cfg: 'proj/lists.cfg', paths: ['prelude.bel', 'main.bel'], activeIndex: 1 },
  projectFileCount: 3,
});
expect(gm.errors === 1, `assembleGlobalModel counts 1 error (got ${gm.errors})`);
expect(gm.warnings === 2, `assembleGlobalModel counts 2 warnings (got ${gm.warnings})`);
expect(gm.diagnostics.length === 3, `diagnostics list passes through (got ${gm.diagnostics.length})`);
expect(gm.diagnostics[0].severity === 'error', 'errors sort ahead of warnings in the diagnostics list');
expect(gm.checking === true, 'settle "checking" sets checking flag');
expect(gm.fileName === 'main.bel', 'file name passes through');
expect(gm.outline.length === 2, 'outline passes through');
expect(gm.projectFileCount === 3, 'project file count passes through');
expect(gm.suite && gm.suite.name === 'lists', `suite name derives from cfg base (got ${gm.suite && gm.suite.name})`);
expect(gm.suite && gm.suite.activeIndex === 1, 'suite active index passes through');
expect(gm.suite && gm.suite.paths.length === 2, 'suite carries the full load order');
expect(gm.suite.entries.length === 2 && gm.suite.entries[1].isActive === true,
  'suite entries built with the active file flagged');

const gmFiles = assembleGlobalModel({
  development: { kind: 'module', cfg: 'proj/lists.cfg', paths: ['prelude.bel', 'main.bel'], activeIndex: 1 },
  files: [{ id: 'f1', name: 'prelude.bel' }, { id: 'f2', name: 'main.bel' }],
});
expect(gmFiles.suite.entries[0].fileId === 'f1' && gmFiles.suite.entries[1].fileId === 'f2',
  'suite entries resolve path → fileId for click-to-jump');

const orphan = assembleGlobalModel({ development: { kind: 'standalone', paths: [] } });
expect(orphan.suite === null, 'standalone development yields no suite');
expect(orphan.errors === 0 && orphan.warnings === 0, 'empty diagnostics yield zero counts');
expect(isGlobalOverviewModel(gm), 'assembleGlobalModel product is a global overview');
expect(!isGlobalOverviewModel({ name: 'nat', namespace: 'lf-type-family' }),
  'symbol models are not global overviews');

// ── crossFileSymbolDiagnostics (Stage 3 attribution) ─────────────────────────
// An in-development cross-file symbol owns the member findings whose line falls
// within its declaration span; each row gets a jump position for that line.
{
  const fileText = 'LF a : type =\n  | ma : bad\n;\nLF b : type =\n  | mb : b\n;';
  const fdoc = Text.of(fileText.split('\n'));
  const aNode = { range: { from: fdoc.line(1).from, to: fdoc.line(3).to } }; // decl a: lines 1-3
  const findings = [
    { line: 2, message: 'bad is unbound', severity: 'error' }, // inside a's span
    { line: 5, message: 'elsewhere', severity: 'error' }, // inside b's span — excluded
  ];
  const got = crossFileSymbolDiagnostics(findings, aNode, fileText);
  expect(got.length === 1, `only the symbol-span finding is attributed (got ${got.length})`);
  expect(got[0].line === 2 && /bad is unbound/.test(got[0].message), 'the right finding is kept');
  expect(got[0].from === fdoc.line(2).from && got[0].to === fdoc.line(2).to,
    'the row carries a jump position spanning the finding line');
  expect(crossFileSymbolDiagnostics([], aNode, fileText).length === 0, 'no findings → empty');
  expect(crossFileSymbolDiagnostics(findings, null, fileText).length === 0, 'no node → empty');
}

console.log('ok   test-inspector-views.mjs  inspector non-symbol views (builtin explainer, outline, global model, '
  + 'cross-file diagnostic attribution)');
