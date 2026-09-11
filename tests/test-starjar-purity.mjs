// *jar purity gate — the ratchet.
//
// Four measured dimensions of Beluga coupling in js/ (docs/starjar/FILES.md, F13).
// Each may only ever go DOWN. A new coupling site fails the build.
//
// ⛔ This measures STRUCTURAL coupling only (F17). It is near-blind on the prover,
// where 26,680 LOC of Beluga-specific generation carries just 73 node sites. A low
// number here does NOT mean a file is language-neutral — for code destined for
// lang/, the only correct measure is whether it lives there yet.
//
// Reporting/exploration lives in scripts/starjar-census.mjs. This file is the gate.

import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Once lang/ and providers/ exist, coupling inside them is correct by construction.
const EXEMPT = [/^js\/lang\//, /^js\/providers\//];

// ── the ratchet ──────────────────────────────────────────────────────────────
// Measured 2026-09-10 by THIS file's patterns, which are authoritative.
// ⚠ Two differ from the ad-hoc greps quoted in FILES.md, and this file is the
// stricter reading of both: `identifiers` requires a character after "Beluga" (so
// a bare mention in prose is not an identifier), and `extensions` also counts
// '.elf'. Where a doc and this gate disagree, the gate measured it.
// Lower these as delamination lands; never raise them without saying why.
const BASELINE = {
  nodeSites: 1416,   // grammar node names — the structural dimension
  identifiers: 568,  // Beluga-named identifiers, incl. public globals
  cssClasses: 0,     // `bel-` / `bj-` prefixes — migrated to `jar-` on 2026-09-11
  extensions: 100,   // .bel / .cfg / .elf file-extension logic
};

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.mjs')) out.push(full);
  }
  return out;
}

const grammar = readFileSync(join(root, 'beluga.grammar'), 'utf8');
const NODE_NAMES = [...new Set(grammar.match(/\b[A-Z][A-Za-z0-9]+\b/g) || [])];

const PATTERNS = {
  nodeSites: new RegExp("'(" + NODE_NAMES.join('|') + ")'", 'g'),
  identifiers: /\b[a-zA-Z_]*[Bb]eluga[a-zA-Z_]+\b/g,
  // Both prefixes name Beluga ("BelJar" = Beluga jar), so both are coupling and
  // the baseline is 0. The word boundary matters: without it `label-foo` would
  // match "bel-foo"; the lookahead keeps the repo name `bel-jar`.
  cssClasses: /\bbel-(?!jar\b)[a-z0-9_-]+|\bbj-[a-z0-9_-]+/g,
  extensions: /\.bel['"`)]|\.cfg['"`)]|'\.bel'|'\.cfg'|'\.elf'/g,
};

const counts = { nodeSites: 0, identifiers: 0, cssClasses: 0, extensions: 0 };
const worst = { nodeSites: [], identifiers: [], cssClasses: [], extensions: [] };

for (const abs of walk(join(root, 'js'))) {
  const rel = relative(root, abs).replace(/\\/g, '/');
  if (EXEMPT.some((re) => re.test(rel))) continue;
  const src = readFileSync(abs, 'utf8');
  for (const [k, re] of Object.entries(PATTERNS)) {
    const n = (src.match(re) || []).length;
    if (!n) continue;
    counts[k] += n;
    worst[k].push([n, rel]);
  }
}

function report(k) {
  return worst[k].sort((a, b) => b[0] - a[0]).slice(0, 3)
    .map(([n, f]) => `${n} ${f}`).join(', ');
}

let failed = 0;
for (const [k, limit] of Object.entries(BASELINE)) {
  const got = counts[k];
  if (got > limit) {
    failed += 1;
    console.error(
      `  ✗ ${k}: ${got} > baseline ${limit} (+${got - limit}). Densest: ${report(k)}`,
    );
  } else if (got < limit) {
    console.log(`  ↓ ${k}: ${got} (baseline ${limit}, −${limit - got}) — lower the baseline`);
  }
}

assert.strictEqual(
  failed, 0,
  `*jar purity ratchet broke on ${failed} dimension(s). New Beluga coupling was added `
  + 'outside js/lang/ and js/providers/. Either route it through the language pack, or — if '
  + 'it genuinely belongs — raise the baseline deliberately and say why in docs/starjar/FILES.md.',
);

console.log(
  `starjar purity: node=${counts.nodeSites} ident=${counts.identifiers} `
  + `css=${counts.cssClasses} ext=${counts.extensions} (all at or below baseline)`,
);
