// Gate: hover / referenceKind / bound-tint must agree whether they answer from
// the symbol-store name environment or the legacy walkTree / binder-scan path
// on the constructs the ancestor scan actually covers (synthetics, cp_base).
// Late-suite files pin store-correct answers the walk never had: a prelude
// constructor in a boxed pattern is global, not a fake local.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSyntaxStore } from '../js/editor-src/semantic/syntax-store.mjs';
import { createSymbolStore } from '../js/editor-src/semantic/symbol-store.mjs';
import { nameEnvForTree } from '../js/editor-src/semantic/name-env.mjs';
import { referenceKind, resolveHoverDoc } from '../js/editor-src/name-resolve.mjs';
import { collectBoundTintRanges } from '../js/editor-src/ide/scope-highlight.mjs';

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const dataRoot = join(here, '..', 'library', 'data', 'case-studies', 'classical-processes');
const SUITE_DIR = 'classical-processes';
const SUITE_MEMBERS = [
  'cp_base.bel',
  'cp_linear.bel',
  'cp_statics.bel',
  'cp_dyn.bel',
  'cp_lemmas.bel',
  'cp_thrm.bel',
];
const SUITE_FILES = [
  ...SUITE_MEMBERS.map((name) => ({ id: `${SUITE_DIR}/${name}`, name: `${SUITE_DIR}/${name}` })),
  { id: `${SUITE_DIR}/cp.cfg`, name: `${SUITE_DIR}/cp.cfg` },
];
const SUITE_TEXTS = Object.fromEntries([
  ...SUITE_MEMBERS.map((name) => [`${SUITE_DIR}/${name}`, readFileSync(join(dataRoot, name), 'utf8')]),
  [`${SUITE_DIR}/cp.cfg`, readFileSync(join(dataRoot, 'cp.cfg'), 'utf8')],
]);
const DOC_ID = 'workspace://main.bel';

function withSuitePersist(activeName, fn) {
  const prev = globalThis.Persist;
  globalThis.Persist = {
    listFiles: () => SUITE_FILES,
    getActiveFileId: () => `${SUITE_DIR}/${activeName}`,
    getFileText: (id) => SUITE_TEXTS[id] || '',
    getActiveCfgForDir: (dir) => (dir === SUITE_DIR ? `${SUITE_DIR}/cp.cfg` : null),
  };
  try {
    return fn();
  } finally {
    if (prev === undefined) delete globalThis.Persist;
    else globalThis.Persist = prev;
  }
}

const IDENT = new Set(['LowerIdentifier', 'UpperIdentifier']);

function identPositions(tree) {
  const out = [];
  tree.iterate({
    enter(ref) {
      if (IDENT.has(ref.name)) out.push(ref.from);
    },
  });
  return out;
}

function canonHover(h) {
  if (!h) return null;
  return JSON.stringify({
    kind: h.kind,
    name: h.name,
    displayName: h.displayName,
    label: h.label,
    sourceType: h.sourceType || null,
    sourceText: h.sourceText || null,
    message: h.message || null,
    externalFile: h.externalFile || null,
    needsElaboration: !!h.needsElaboration,
    typeUnavailable: !!h.typeUnavailable,
    owningDeclaration: h.owningDeclaration || null,
    fallback: h.fallback || null,
  });
}

function publish(tree, doc) {
  const syntax = createSyntaxStore({ documentId: DOC_ID }).update(tree, doc, { documentId: DOC_ID });
  createSymbolStore().update(syntax);
  if (!nameEnvForTree(tree)) fail('symbol store update did not publish a name env');
}

function checkFile(text, label) {
  const run = () => (SUITE_MEMBERS.includes(label) ? checkSuitePins(text, label) : checkWalkEnvParity(text, label));
  if (SUITE_MEMBERS.includes(label)) return withSuitePersist(label, run);
  return run();
}

function checkWalkEnvParity(text, label) {
  const doc = Text.of(text.split('\n'));

  const treeA = parser.parse(text);
  if (nameEnvForTree(treeA)) fail(`${label}: fallback tree unexpectedly has an env`);

  const treeB = parser.parse(text);
  publish(treeB, doc);

  const positions = identPositions(treeA);
  if (positions.length !== identPositions(treeB).length) {
    fail(`${label}: ident counts differ between parses`);
  }

  for (const pos of positions) {
    const kindA = referenceKind(treeA, doc, pos);
    const kindB = referenceKind(treeB, doc, pos);
    if (kindA !== kindB) {
      fail(`${label}: referenceKind @${pos} walk=${kindA} env=${kindB}`);
    }
    const hoverA = canonHover(resolveHoverDoc(treeA, doc, pos));
    const hoverB = canonHover(resolveHoverDoc(treeB, doc, pos));
    if (hoverA !== hoverB) {
      fail(`${label}: hover @${pos}\n  walk: ${hoverA}\n  env:  ${hoverB}`);
    }
  }

  const tintEnv = collectBoundTintRanges(treeB, doc, null);
  if (label === 'synthetic:fn-local') {
    const bodyD = text.indexOf('=> d') + 3;
    if (!tintEnv.some((r) => r.from === bodyD && r.kind === 'lower')) {
      fail(`${label}: env tint missed body 'd'`);
    }
  }

  return positions.length;
}

function identAt(text, needle) {
  const at = text.indexOf(needle);
  if (at < 0) fail(`needle not found: ${JSON.stringify(needle)}`);
  return at;
}

// Suite files: the store is the local authority (boxed LF pattern vars the
// ancestor scan never saw; prelude ctors the store used to over-bind). Walk vs
// env will disagree there on purpose — pin the store-correct answers instead.
function checkSuitePins(text, label) {
  const doc = Text.of(text.split('\n'));
  const tree = parser.parse(text);
  publish(tree, doc);

  if (label === 'cp_thrm.bel') {
    const pins = [
      ['≡comm', 'global'],
      ['lP of', 'local'],
      ['linP\')]', 'local'],
    ];
    for (const [needle, want] of pins) {
      const at = identAt(text, needle);
      const kind = referenceKind(tree, doc, at);
      if (kind !== want) fail(`${label}: ${JSON.stringify(needle)} should be ${want}, got ${kind}`);
    }
  }

  if (label === 'cp_base.bel') {
    const treeA = parser.parse(text);
    if (nameEnvForTree(treeA)) fail(`${label}: fallback tree unexpectedly has an env`);
    const positions = identPositions(treeA);
    for (const pos of positions) {
      const kindA = referenceKind(treeA, doc, pos);
      const kindB = referenceKind(tree, doc, pos);
      if (kindA !== kindB) {
        fail(`${label}: referenceKind @${pos} walk=${kindA} env=${kindB}`);
      }
    }
    return positions.length;
  }

  return identPositions(tree).length;
}

const SYNTHETIC = [
  ['fn-local', `LF o : type;
rec f : o → o = fn d => d;
`],
  ['pi-and-pattern', `LF tm : type = | app : tm → tm → tm;
rec g : {x : tm} tm → tm =
  fn x => fn y => case y of app a b => a;
`],
];

let total = 0;
for (const [label, text] of SYNTHETIC) {
  total += checkFile(text, `synthetic:${label}`);
}

for (const file of ['cp_base.bel', 'cp_thrm.bel']) {
  const src = readFileSync(join(dataRoot, file), 'utf8');
  total += checkFile(src, file);
}

console.log(`OK hover-env-parity: hover + referenceKind + bound-tint (${total} idents)`);
