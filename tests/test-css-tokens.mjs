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
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
for (const m of readFileSync(join(root, 'index.html'), 'utf8').matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) {
  defined.add(m[1]);
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

console.log(`OK css tokens (${defined.size} defined, every var() in ${cssFiles.length} files resolves)`);
