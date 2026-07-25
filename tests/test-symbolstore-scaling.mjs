// Guard: symbolStore.update must stay ~linear in file size — no per-node
// ancestor/sibling walk (astPathFor) or per-reference O(globals) loop creeping
// back in. Those made a late-suite keystroke cost ~22 ms of main-thread work
// (referenceId's astPathFor alone was ~13 ms), i.e. the "typing lag in later
// files" bug. We assert the PER-BYTE cost of a large file is not dramatically
// worse than a small file (super-linearity signals a reintroduced O(n²)); the
// ratio is machine-independent, unlike an absolute ms budget.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSyntaxStore } from '../js/editor-src/semantic/syntax-store.mjs';
import { createSymbolStore } from '../js/editor-src/semantic/symbol-store.mjs';
import { referenceId } from '../js/editor-src/semantic/ids.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const dataRoot = join(here, '..', 'library', 'data', 'case-studies', 'classical-processes');

function mkSyntax(text) {
  const store = createSyntaxStore({ documentId: 'workspace://main.bel' });
  const doc = Text.of(text.split('\n'));
  const tree = parser.parse(text);
  return store.update(tree, doc, { documentId: 'workspace://main.bel' });
}

function perByteMs(file) {
  const src = readFileSync(join(dataRoot, file), 'utf8');
  const syntax = mkSyntax(src);
  const store = createSymbolStore();
  store.update(syntax); // prime identity registry
  for (let i = 0; i < 5; i += 1) store.update(syntax); // warm
  const N = 40;
  const t0 = performance.now();
  for (let i = 0; i < N; i += 1) store.update(syntax);
  const ms = (performance.now() - t0) / N;
  return { ms, bytes: src.length, perByte: ms / src.length };
}

const small = perByteMs('cp_base.bel');   // ~1.5 KB
const large = perByteMs('cp_thrm.bel');   // ~18 KB

console.error(`  cp_base: ${small.ms.toFixed(2)} ms (${small.bytes} B)  cp_thrm: ${large.ms.toFixed(2)} ms (${large.bytes} B)`);
console.error(`  per-byte ratio (large/small): ${(large.perByte / small.perByte).toFixed(2)}x`);

// Linear would be ~1.0x per-byte. astPathFor's O(depth·siblings) drove this well
// above 3x (whole-update ~14x wall-clock for ~12x bytes). Allow generous slack
// for JIT / small-file fixed costs, but catch a return to super-linear scaling.
expect(large.perByte / small.perByte < 3.0,
  `symbolStore.update per-byte cost scales super-linearly (${(large.perByte / small.perByte).toFixed(2)}x) — an O(n²) path (e.g. astPathFor) likely returned`);

// Absolute sanity: a coalesced late-file rebuild must fit a frame with margin on
// CI-class hardware. Loose ceiling; the ratio check above is the real guard.
expect(large.ms < 60,
  `symbolStore.update on cp_thrm took ${large.ms.toFixed(1)} ms (expected well under a coalesced frame budget)`);

// Direct guard on the specific defect: referenceId must be O(1) per node, NOT
// O(depth·siblings) (astPathFor). Compare a shallow node against a deeply-nested
// node with many preceding siblings; the astPathFor version cost grew with depth,
// the id-by-span version is flat. Build a synthetic deep/wide tree from real code.
{
  const src = readFileSync(join(dataRoot, 'cp_thrm.bel'), 'utf8');
  const tree = parser.parse(src);
  // Collect the shallowest and a deep identifier node.
  let shallow = null;
  let deep = null;
  let deepScore = -1;
  const cur = tree.cursor();
  do {
    if (!['LowerIdentifier', 'UpperIdentifier', 'Identifier'].includes(cur.name)) continue;
    const node = cur.node;
    let depth = 0;
    for (let p = node.parent; p; p = p.parent) depth += 1;
    if (shallow == null) shallow = node;
    if (depth > deepScore) { deepScore = depth; deep = node; }
  } while (cur.next());
  expect(shallow && deep, 'found ident nodes to compare');

  const timeId = (node) => {
    for (let i = 0; i < 1000; i += 1) referenceId('workspace://main.bel', node);
    const t0 = performance.now();
    for (let i = 0; i < 20000; i += 1) referenceId('workspace://main.bel', node);
    return performance.now() - t0;
  };
  const shallowMs = timeId(shallow);
  const deepMs = timeId(deep);
  console.error(`  referenceId shallow ${shallowMs.toFixed(1)}ms vs deep(${deepScore}) ${deepMs.toFixed(1)}ms`);
  expect(deepMs < shallowMs * 3 + 5,
    `referenceId cost grows with node depth (${deepMs.toFixed(1)}ms deep vs ${shallowMs.toFixed(1)}ms shallow) — astPathFor-style O(depth) path likely reintroduced`);
}

console.log('OK symbolstore-scaling: symbolStore.update ~linear; referenceId O(1) per node');
