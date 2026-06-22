// Tiered Beluga runtime checks on library samples (uses beluga_web.bc.js in Node).
// Tier A must pass; tier B/C failures are reported but non-fatal (heavy suites).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBel } from './_beluga-check.mjs';
import { pathsFromSourcesCfg } from './_library-cfg.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dataRoot = join(root, 'library', 'data');

const TIER_A = [
  'builtins/nd-propositional.bel',
  'builtins/nd-first-order.bel',
  'examples/literate_beluga/0Beginner/Norm.bel',
  'examples/literate_beluga/0Beginner/Close_Terms.bel',
  'examples/literate_beluga/0Beginner/Parallel_Reduction.bel',
  'examples/literate_beluga/0Beginner/Type_Uniqueness.bel',
  'examples/poplmark/poplmark.bel',
  'examples/arith/arith.bel',
];

function pathsFromSuiteCfg(relDir) {
  return pathsFromSourcesCfg(dataRoot, relDir);
}

const OPTIONAL_SUITES = [
  'case-studies/classical-processes',
  'case-studies/harmony-lemma-formalization',
  'examples/church-rosser',
  'examples/codatatypes/bisimulation',
];

const OPTIONAL_SINGLE_FILES = [
  'examples/tapl/ch3+arith/evaluation.bel',
  'examples/logrel/weak-norm-total.bel',
  'examples/copy/copy.bel',
  'examples/literate_beluga/1Intermediate/Poplmark.bel',
];

function readRel(rel) {
  return readFileSync(join(dataRoot, rel), 'utf8');
}

function concatPaths(paths) {
  return paths.map(readRel).join('\n\n');
}

const fatal = [];
const optional = [];
const t0 = Date.now();

function runCheck(bucket, label, source) {
  const r = checkBel(source);
  if (!r.ok) {
    const out = String(r.output || '').split('\n').slice(0, 3).join(' | ');
    bucket.push({ label, out });
  }
}

for (const rel of TIER_A) {
  if (!existsSync(join(dataRoot, rel))) {
    fatal.push({ label: `A:${rel}`, out: 'missing file' });
    continue;
  }
  runCheck(fatal, `A:${rel}`, readRel(rel));
}

runCheck(fatal, 'hint-stress.bel', readFileSync(join(root, 'hint-stress.bel'), 'utf8'));

for (const relDir of OPTIONAL_SUITES) {
  const paths = pathsFromSuiteCfg(relDir);
  if (!paths || paths.some((p) => !existsSync(join(dataRoot, p)))) continue;
  runCheck(optional, `opt:${relDir}`, concatPaths(paths));
}

for (const rel of OPTIONAL_SINGLE_FILES) {
  if (!existsSync(join(dataRoot, rel))) continue;
  runCheck(optional, `opt:${rel}`, readRel(rel));
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);

if (optional.length) {
  console.error(`optional suites: ${optional.length} failed (non-fatal):`);
  for (const f of optional) console.error(`  ${f.label}: ${f.out.slice(0, 120)}`);
}

if (fatal.length) {
  console.error(`\n${fatal.length} required Beluga checks failed (${secs}s):`);
  for (const f of fatal) console.error(`  ${f.label}: ${f.out}`);
  process.exit(1);
}

console.log(`OK library beluga (tier A + hint-stress; ${optional.length} optional failures in ${secs}s)`);
