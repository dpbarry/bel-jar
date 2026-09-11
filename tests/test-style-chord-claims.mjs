// A style policy is a CLAIM ABOUT SOMEBODY ELSE'S KEYMAP. Read theirs.
//
// `styles: { vim: 'always' }` says "this chord still fires in Normal mode".
// `styles: { emacs: 'off' }` says "Emacs took this chord". Both are statements
// about the vim and emacs packages, and until this test existed both were made
// from memory — which is how Cut, Copy and Paste shipped declared `vim: 'always'`
// beside a comment asserting that "neither this vim package nor real vim binds
// Ctrl+X/Ctrl+V to anything". The package's own keymap says `<C-x>` decrements
// the number under the caret, `<C-v>` is blockwise visual mode and `<C-c>` is
// `<Esc>`. Vim sits at `Prec.highest` and preventDefaults whatever it matched, so
// none of the three chords ever reached BelJar: the Keybindings sheet offered
// Cut on Ctrl+X, Available Keys printed it as pressable, and pressing it edited
// the document instead.
//
// So the tables are checked against the packages, not against each other:
//   1. an `always` chord must be one vim does not bind in Normal or Visual
//   2. an `off` chord must be named by `STYLE_TAKES` or answered by a substitute,
//      or no surface can say what became of it
//   3. an editor chord the Emacs package binds must be declared `off`
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { emacsKeys } from '@replit/codemirror-emacs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
// eslint-disable-next-line no-new-func
new Function(readFileSync(join(root, 'js', 'commands', 'command-registry.js'), 'utf8'))();
const C = globalThis.Commands;
const { STYLE_TAKES, STYLE_CHORDS } = C._pure;

// ── the vim package's keymap, read from its source ───────────────────────────
// The keymap is a literal array of `{ keys: '<C-x>', ..., context: 'insert' }`
// entries. An entry with NO context matches every context except insert, which is
// `commandMatches`' own rule: the first thing it skips on is
// `context == 'insert' && command.context != 'insert'`.
const vimSrc = readFileSync(join(root, 'node_modules', '@replit', 'codemirror-vim-core', 'vim.js'), 'utf8');
const vimBound = new Map();
for (const m of vimSrc.matchAll(/\{\s*keys:\s*'(<[^']+>)'\s*,([^\n]*)\}/g)) {
  const ctx = /context:\s*'(\w+)'/.exec(m[2]);
  if (!vimBound.has(m[1])) vimBound.set(m[1], []);
  vimBound.get(m[1]).push(ctx ? ctx[1] : 'any');
}
expect(vimBound.size > 20, `the vim keymap parsed (${vimBound.size} control chords)`);
expect(vimBound.has('<C-v>'), 'the vim keymap parse found <C-v> — the regex still matches the source');

/** A one-modifier spec in vim's spelling, or null. */
function vimKeyForSpec(spec) {
  const parts = String(spec).split('+');
  const key = parts.pop();
  if (parts.length !== 1) return null;
  const pre = parts[0] === 'Mod' || parts[0] === 'Control' ? 'C' : (parts[0] === 'Alt' ? 'M' : null);
  if (!pre) return null;
  return `<${pre}-${key.length === 1 ? key.toLowerCase() : key}>`;
}

// ── the emacs package's keymap, read from the package ────────────────────────
const emacsBound = new Set();
for (const spec of Object.keys(emacsKeys)) {
  if (!emacsKeys[spec]) continue; // a null command is deliberately unbound
  for (const alt of spec.split('|')) emacsBound.add(alt);
}
// ⛔ `C-x` and `C-c` are not in the key table — they are CHAIN HEADS, and a chain
// head takes the chord every bit as surely as a command does. A check that read
// only `emacsKeys` would have cleared Cut and Copy.
for (const head of ['C-x', 'C-c']) emacsBound.add(head);
expect(emacsBound.size > 50, `the emacs key table parsed (${emacsBound.size} chords)`);

function emacsKeyForSpec(spec) {
  const parts = String(spec).split('+');
  const key = parts.pop();
  const mods = new Set(parts);
  const out = [];
  if (mods.has('Shift')) out.push('S');
  if (mods.has('Mod') || mods.has('Control')) out.push('C');
  if (mods.has('Alt')) out.push('M');
  return out.join('-') + (out.length ? '-' : '') + (key.length === 1 ? key.toLowerCase() : key);
}

const shipped = C.list({ keybindable: true }).filter((c) => c.defaultSpec);
expect(shipped.length > 10, `commands ship with chords (${shipped.length})`);

// ── 1. `vim: 'always'` must name a chord vim leaves alone ────────────────────
let alwaysChecked = 0;
for (const cmd of shipped) {
  if (C.styleFor(cmd.id, 'vim') !== 'always') continue;
  alwaysChecked += 1;
  const vk = vimKeyForSpec(cmd.defaultSpec);
  if (!vk) continue;
  const ctxs = vimBound.get(vk) || [];
  const takenInNormal = ctxs.some((c) => c === 'any' || c === 'normal' || c === 'visual');
  expect(!takenInNormal,
    `${cmd.id} declares vim: 'always' on ${cmd.defaultSpec}, but the vim package binds ${vk} `
    + `(${ctxs.join(', ')}) and runs at Prec.highest — the chord never reaches BelJar, so every `
    + `surface that prints it is lying. Declare 'insert-only'.`);
}
expect(alwaysChecked > 0, "some command declares vim: 'always' — the check has something to hold");

// ── 2. an `off` chord must be explainable ────────────────────────────────────
// A surface has exactly two honest things to say about a chord the style took:
// what the style does with it (`STYLE_TAKES`), or what to press instead
// (`STYLE_CHORDS`). With neither, `describe()` returns no tag and no substitute,
// so the sheet shows the chord bare and Available Keys prints it as pressable.
for (const style of ['emacs', 'vim']) {
  for (const cmd of shipped) {
    if (C.styleFor(cmd.id, style) !== 'off') continue;
    const named = (STYLE_TAKES[style] || []).some((e) => e.spec === cmd.defaultSpec);
    const substitute = !!(STYLE_CHORDS[style] || {})[cmd.id];
    expect(named || substitute,
      `${cmd.id} is ${style}: 'off' on ${cmd.defaultSpec}, but no STYLE_TAKES row says what `
      + `${style} does with that chord and no STYLE_CHORDS entry says what to press instead. `
      + `Both surfaces then show a chord that does nothing.`);
  }
}

// ── 3. an editor chord Emacs binds must be declared off ──────────────────────
// Editor scope goes through the CodeMirror keymap, and the Emacs plugin sits above
// it at Prec.highest: whatever Emacs binds, Emacs gets. A `global` command is a
// different case — its listener is on `window` in the CAPTURE phase, so it runs
// before CodeMirror sees the key at all and legitimately wins.
for (const cmd of shipped) {
  if (cmd.scope !== 'editor') continue;
  if (!emacsBound.has(emacsKeyForSpec(cmd.defaultSpec))) continue;
  // …unless BelJar has re-bound that very spec to the same command. `C-z` is
  // Emacs' undo and `ensureEmacsUndoBridge` points it at BelJar's history, so
  // Ctrl+Z under Emacs is still Undo — reached through Emacs' own key rather than
  // ours. `sameCommand` is how the table says "nothing was lost here".
  const same = (STYLE_TAKES.emacs || [])
    .some((e) => e.spec === cmd.defaultSpec && e.sameCommand === cmd.id);
  if (same) continue;
  const policy = C.styleFor(cmd.id, 'emacs');
  expect(policy === 'off',
    `${cmd.id} ships ${cmd.defaultSpec} (${emacsKeyForSpec(cmd.defaultSpec)} to Emacs), which the `
    + `Emacs handler binds and wins at Prec.highest — so the chord is a dead key under Emacs. `
    + `It is declared '${policy}'; declare 'off' and give it a substitute, or add a STYLE_TAKES `
    + `row with sameCommand if Emacs reaches the same command through it.`);
}

// ── every STYLE_TAKES row must be a chord the package really takes ───────────
// The other direction: a row claiming Emacs takes a chord it does not would put a
// "shadowed" tag on a key that works perfectly.
for (const entry of STYLE_TAKES.emacs || []) {
  expect(emacsBound.has(entry.key),
    `STYLE_TAKES says Emacs uses ${entry.key} for ${entry.runs}, but the package binds no such key`);
}

console.log(`OK style chord claims (${shipped.length} shipped chords checked against both packages)`);
