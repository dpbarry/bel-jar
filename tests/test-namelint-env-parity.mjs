// Gate: the undefined-application lint must produce IDENTICAL diagnostics
// whether its in-file global-name check answers from the symbol store's
// per-name index (the name-env fast lane, published per tree) or from the
// legacy tree-walk defMap (the fallback when the store hasn't seen the tree).
// If the two ever disagree, lint results would flicker with engine sync
// timing — the exact drift the unified name environment exists to prevent.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Text, ChangeSet } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSyntaxStore } from '../js/editor-src/semantic/syntax-store.mjs';
import { createSymbolStore } from '../js/editor-src/semantic/symbol-store.mjs';
import { nameEnvForTree } from '../js/editor-src/semantic/name-env.mjs';
import { collectUndefinedApplicationDiags } from '../js/editor-src/name-resolve.mjs';

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const dataRoot = join(here, '..', 'library', 'data', 'case-studies', 'classical-processes');
const DOC_ID = 'workspace://main.bel';

function diagKey(d) { return `${d.from}:${d.to}:${d.severity}:${d.message}`; }

// Two independent parses of the same text: treeA never meets a symbol store
// (fallback/defMap path); treeB gets a store snapshot published for it
// (name-env path). Same text, so the diags must match exactly.
function checkParity(text, label) {
  const doc = Text.of(text.split('\n'));

  const treeA = parser.parse(text);
  if (nameEnvForTree(treeA)) fail(`${label}: fallback tree unexpectedly has an env`);
  const fallbackDiags = collectUndefinedApplicationDiags(treeA, doc);

  const treeB = parser.parse(text);
  const syntaxStore = createSyntaxStore({ documentId: DOC_ID });
  const syntax = syntaxStore.update(treeB, doc, { documentId: DOC_ID });
  createSymbolStore().update(syntax);
  if (!nameEnvForTree(treeB)) fail(`${label}: symbol store update did not publish a name env`);
  const envDiags = collectUndefinedApplicationDiags(treeB, doc);

  const a = fallbackDiags.map(diagKey).sort();
  const b = envDiags.map(diagKey).sort();
  if (a.length !== b.length || a.some((k, i) => k !== b[i])) {
    const as = new Set(a); const bs = new Set(b);
    console.error('  fallback-only:', a.filter((k) => !bs.has(k)).slice(0, 5));
    console.error('  env-only:     ', b.filter((k) => !as.has(k)).slice(0, 5));
    fail(`${label}: env-backed lint != defMap-backed lint (${a.length} vs ${b.length} diags)`);
  }
  return a.length;
}

// Deterministic PRNG so a failure is reproducible.
function mulberry32(seed) {
  return function next() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INSERT_SNIPPETS = ['x', ' ', '\n', 'foo', 'X', ' => ', 'ctx', '(', ')', 'lam ', '?', 'undefx y'];

function randomChange(rand, doc) {
  const len = doc.length;
  const roll = rand();
  const from = Math.floor(rand() * (len + 1));
  if (roll < 0.55) {
    const s = INSERT_SNIPPETS[Math.floor(rand() * INSERT_SNIPPETS.length)];
    return { from, to: from, insert: s };
  }
  const to = Math.min(len, from + 1 + Math.floor(rand() * 6));
  return { from, to, insert: '' };
}

// Hand-built cases covering the constructs where store and defMap extraction
// could plausibly diverge: mutual LF blocks, modules, proofs, typedefs.
const SYNTHETIC = [
  ['mutual-lf', `LF tm : type =
  | app : tm → tm → tm
and tp : type =
  | arr : tp → tp → tp
and pf : tm → type =
  | ax : pf (app M N)
;
missing_head : pf (undef_family X) .
`],
  ['module-proof', `module M = struct
  LF o : type = | c : o ;
  rec f : [ ⊢ o] → [ ⊢ o] = fn x => x ;
end;
proof p : [ ⊢ o] = ?;
thm : o → type = ax : thm c .
bad : thm (nothere Y) .
`],
  ['typo-juxtaposition', `LF t p : type = | u : t p ;
q : tp .
r : t p → type .
`],
];

let total = 0;
for (const [label, text] of SYNTHETIC) {
  total += checkParity(text, `synthetic:${label}`);
}

for (const file of ['cp_thrm.bel', 'cp_base.bel']) {
  const src = readFileSync(join(dataRoot, file), 'utf8');
  total += checkParity(src, `${file}:pristine`);

  for (let seed = 1; seed <= 3; seed += 1) {
    const rand = mulberry32(seed);
    let doc = Text.of(src.split('\n'));
    for (let step = 0; step < 25; step += 1) {
      const spec = randomChange(rand, doc);
      doc = ChangeSet.of(spec, doc.length).apply(doc);
      total += checkParity(doc.toString(), `${file}:seed${seed}:step${step}`);
    }
  }
}

console.log(`OK namelint-env-parity: env-backed === defMap-backed undefined-app lint (${total} diags compared)`);
