// Every `var(--token)` in css/ must name a token that exists.
//
// ⛔ A CSS custom property that is not defined does not fail loudly — it makes
// the whole declaration invalid and the browser drops it, so the element keeps
// whatever it inherited and the page looks nearly right. That is how
// `--font-mono` came to be used fifteen times, in five files, beside `--mono`
// in the same files: the explorer, the library preview and the alias inputs
// were all rendering in the OS monospace instead of the editor's face, and
// nothing anywhere said so. `--chrome-bg` was worse — inside a `color-mix()` it
// invalidated the whole `background`, so a Harpoon split pane had none.
//
// A fallback that names an undefined token is the same lie with a safety net
// painted on: `var(--muted-mid, var(--muted))` reads as "and if that is ever
// removed, this" — and `--muted` does not exist either.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function walk(dir, test, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, test, out);
    else if (test(name)) out.push(full);
  }
  return out;
}

const cssFiles = walk(join(root, 'css'), (n) => n.endsWith('.css'));
const jsFiles = walk(join(root, 'js'), (n) => (n.endsWith('.mjs') || n.endsWith('.js')) && n !== 'editor-cm.bundle.js');

const defined = new Set();
const cssText = new Map();
for (const f of cssFiles) {
  const s = readFileSync(f, 'utf8');
  cssText.set(f, s);
  for (const m of s.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) defined.add(m[1]);
}
// Tokens the runtime writes: `style.setProperty('--x', …)`, and anything
// declared in an inline style block.
for (const f of jsFiles) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/setProperty\(\s*['"`](--[A-Za-z0-9_-]+)/g)) defined.add(m[1]);
  for (const m of s.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) defined.add(m[1]);
}
for (const doc of ['index.html', 'edit.html']) {
  for (const m of readFileSync(join(root, doc), 'utf8').matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) defined.add(m[1]);
}

const problems = [];
for (const [f, s] of cssText) {
  const rel = relative(root, f).replace(/\\/g, '/');
  const lineOf = (i) => s.slice(0, i).split('\n').length;
  // A bare `var(--x)` with no fallback: the token has to exist.
  for (const m of s.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)) {
    if (!defined.has(m[1])) problems.push(`${rel}:${lineOf(m.index)}  var(${m[1]}) — no such token`);
  }
  // A fallback that is itself a token: that one has to exist too.
  for (const m of s.matchAll(/var\(\s*--[A-Za-z0-9_-]+\s*,\s*var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)) {
    if (!defined.has(m[1])) problems.push(`${rel}:${lineOf(m.index)}  fallback var(${m[1]}) — no such token`);
  }
}

if (problems.length) {
  console.error('FAIL: CSS references tokens that do not exist:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}

// ── Values retyped instead of taken from tokens.css (plan v6 phase 02, u3) ──
// Per file, the colours, radii and spacing written as literals, and the
// uppercase styling the voice forbids spreading (u4, docs/UI.md §5: no small
// capitals shouting). The count may only go down: a new file starts at none,
// and a value with no token gets one in tokens.css. Comments are not counted.
// `node tests/test-css-tokens.mjs --write` records a lower count, and refuses
// a higher one.
const KINDS = {
  colour: /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g,
  radius: /border(?:-[a-z]+)*-radius\s*:[^;{}]*?\d(?:\.\d+)?(?:px|rem|em)\b/g,
  spacing: /(?:^|[;{\s])(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z]+)*\s*:[^;{}]*?\d(?:\.\d+)?(?:px|rem|em)\b/g,
  uppercase: /text-transform\s*:\s*uppercase|small-caps|font-variant-caps\s*:\s*(?:all-)?(?:small|petite)/g,
};
const baselinePath = join(here, 'css-literals.json');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const counted = {};
for (const [f, s] of cssText) {
  const rel = relative(root, f).replace(/\\/g, '/');
  if (rel === 'css/tokens.css') continue;
  const bare = s.replace(/\/\*[\s\S]*?\*\//g, '');
  counted[rel] = Object.fromEntries(Object.entries(KINDS).map(([k, re]) => [k, (bare.match(re) || []).length]));
}
const rose = [];
const fell = [];
for (const [rel, c] of Object.entries(counted)) {
  const was = baseline[rel] || {};
  for (const k of Object.keys(KINDS)) {
    if (c[k] > (was[k] || 0)) rose.push(`${rel}: ${c[k]} ${k} literals, held at ${was[k] || 0}`);
    else if (c[k] < (was[k] || 0)) fell.push(`${rel}: ${k} ${was[k]} → ${c[k]}`);
  }
}
const total = (o) => Object.values(o).reduce((t, c) => t + Object.values(c).reduce((a, b) => a + b, 0), 0);
if (rose.length) {
  console.error('FAIL: values retyped in CSS where tokens.css should supply them (use a token, or add one):');
  for (const r of rose) console.error('  ' + r);
  process.exit(1);
}
if (process.argv.includes('--write')) {
  const sorted = Object.fromEntries(Object.keys(counted).sort().map((k) => [k, counted[k]]));
  writeFileSync(baselinePath, JSON.stringify(sorted, null, 1) + '\n');
  console.log(`wrote ${relative(root, baselinePath)}: ${total(baseline)} → ${total(counted)} literals`);
} else if (fell.length) {
  console.error('FAIL: fewer literals than recorded, which is the point: record it with `node tests/test-css-tokens.mjs --write`');
  for (const r of fell) console.error('  ' + r);
  process.exit(1);
}

console.log(`OK css tokens (${defined.size} defined, every var() in ${cssFiles.length} files resolves; ${total(counted)} retyped values, none added)`);
