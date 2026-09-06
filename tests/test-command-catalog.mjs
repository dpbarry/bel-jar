// Catalogue invariants — uniqueness, completeness, and the two agreements that
// keep the UI honest: the palette's shipped order, and the style-policy tables
// the editor keymaps actually enforce (js/editor-src/ide/keymap-style.mjs).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  EMACS_OMIT_COMMAND_IDS,
  EMACS_YIELD_GLOBAL_IDS,
  VIM_ALWAYS_COMMAND_IDS,
} from '../js/editor-src/ide/keymap-style.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'commands', 'command-registry.js'), 'utf8');
// eslint-disable-next-line no-new-func
new Function(src)();
const C = globalThis.Commands;
const all = C.list();

// ── uniqueness ────────────────────────────────────────────────────────────────

const seenId = new Set();
const seenMx = new Set();
const seenEx = new Set();
for (const cmd of all) {
  expect(!seenId.has(cmd.id), `duplicate id ${cmd.id}`);
  seenId.add(cmd.id);
  expect(cmd.mx, `${cmd.id} has an M-x name`);
  expect(!seenMx.has(cmd.mx), `duplicate M-x name ${cmd.mx}`);
  seenMx.add(cmd.mx);
  for (const ex of cmd.ex) {
    expect(!seenEx.has(ex), `duplicate ex name :${ex} (${cmd.id})`);
    seenEx.add(ex);
  }
}

// ── completeness ──────────────────────────────────────────────────────────────

for (const cmd of all) {
  expect(cmd.title, `${cmd.id} has a title`);
  expect(cmd.section, `${cmd.id} has a section`);
  expect(cmd.scope === 'global' || cmd.scope === 'editor', `${cmd.id} has a real scope`);
  expect(/^[a-z][a-z0-9]*\.[a-z0-9-]+$/.test(cmd.id), `${cmd.id} is domain-first dotted`);
  // Bindable-but-unbound is the normal state for a new command. The reverse —
  // a default chord on something the sheet cannot rebind — is a trap.
  if (cmd.defaultSpec) {
    expect(cmd.keybindable, `${cmd.id} ships a chord the Keybindings sheet cannot rebind`);
  }
  // Three doors: the palette, a chord, or an ex name on the command line. A
  // command behind none of them exists only for the code that calls it.
  const onTheLine = cmd.cmdline && (cmd.ex || []).length > 0;
  expect(cmd.palette || cmd.keybindable || onTheLine, `${cmd.id} is reachable from nowhere`);
}

// ── the palette's shipped order ───────────────────────────────────────────────
// Empty-query palette rows follow catalogue order, grouped by section. This is
// the order BelJar has always shown; changing it is a UI change, not a refactor.

const EXPECTED_PALETTE_ORDER = [
  'project.new', 'file.new', 'file.upload', 'file.upload-folder', 'file.import-folder', 'file.download',
  'tab.next', 'tab.prev', 'tab.close', 'tab.close-others', 'tab.close-right',
  'file.save', 'suite.add-file', 'suite.remove-file',
  'edit.undo', 'edit.redo', 'edit.find', 'edit.search-project', 'edit.toggle-comment', 'edit.format',
  'edit.rename', 'edit.select-all',
  'edit.delete-line', 'edit.move-line-up', 'edit.move-line-down', 'edit.duplicate-line',
  'edit.duplicate-line-up', 'edit.indent', 'edit.dedent', 'edit.reindent',
  'edit.transpose-chars', 'edit.split-line', 'edit.blank-line', 'edit.trim-whitespace',
  'nav.symbol', 'nav.definition', 'nav.references', 'nav.enclosing-decl', 'nav.binder', 'nav.inspector',
  'nav.next-decl', 'nav.prev-decl', 'nav.next-case', 'nav.prev-case',
  'nav.jump-back', 'nav.jump-forward',
  'nav.next-hole', 'nav.prev-hole', 'nav.next-problem', 'nav.prev-problem',
  'prover.hole-intro', 'prover.hole-split', 'prover.hole-fill', 'prover.open-in-harpoon',
  'prover.count-holes', 'prover.goal-at-cursor',
  'harpoon.next-goal', 'harpoon.prev-goal', 'harpoon.undo-move', 'harpoon.redo-move',
  'harpoon.orca-start', 'harpoon.orca-pause', 'harpoon.orca-absorb',
  'run.default', 'run.file', 'run.here', 'run.module', 'run.project', 'run.clear-output',
  'view.theme', 'view.explorer', 'view.library', 'view.harpoon', 'view.edit-history', 'view.settings',
  'fold.all', 'fold.unfold-all',
  // Settings — generated from `js/commands/command-settings.mjs`, in table order.
  'set.word-wrap', 'set.line-numbers', 'set.line-number-style', 'set.fold-gutter', 'set.active-line',
  'set.scroll-past-end', 'set.rulers', 'set.sticky-decl', 'set.tab-size',
  'set.format-width', 'set.whitespace',
  'set.font-size', 'set.line-height', 'set.font-family', 'set.cursor-blink',
  'set.syntax-highlight', 'set.semantic-highlight', 'set.parse-highlight',
  'set.occurrence-highlight', 'set.selection-matches', 'set.bracket-match',
  'set.auto-close-brackets', 'set.reindent-paste', 'set.format-on-save', 'set.trim-whitespace',
  'set.hole-gutter', 'set.hole-emphasis', 'set.quiet-typing', 'set.hover-sticky',
  'keys.full-keyboard', 'keys.macros', 'cmdline.repeat', 'cmdline.open',
  'tools.palette', 'tools.graph', 'tools.inspector',
];
const paletteOrder = C.list({ palette: true }).map((c) => c.id);
expect(
  paletteOrder.join(' ') === EXPECTED_PALETTE_ORDER.join(' '),
  'palette order unchanged\n  want: ' + EXPECTED_PALETTE_ORDER.join(' ') + '\n  got:  ' + paletteOrder.join(' ')
);

// Sections stay contiguous, or the palette grows duplicate headers.
function sectionRun(ids) {
  const started = new Set();
  const seq = [];
  let last = null;
  for (const id of ids) {
    const section = C.get(id).section;
    if (section !== last) {
      expect(!started.has(section), `section ${section} is not contiguous`);
      started.add(section);
      seq.push(section);
      last = section;
    }
  }
  return seq;
}
const paletteSections = sectionRun(paletteOrder);

// …and the Keybindings sheet groups by the same order. The sheet emits a header
// every time `section` changes while walking `Keybindings.list()`, which sorts by
// SECTION_ORDER — so a section missing from that array sorts in with every other
// unknown one by title and the sheet grows repeated headers.
const kbSrc = readFileSync(join(here, '..', 'js', 'ui', 'keybindings.mjs'), 'utf8');
const declared = kbSrc.match(/var SECTION_ORDER = \[([^\]]*)\]/);
expect(declared, 'keybindings.mjs declares SECTION_ORDER');
const sheetOrder = declared[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
const catalogSections = [];
for (const cmd of all) if (catalogSections.indexOf(cmd.section) < 0) catalogSections.push(cmd.section);
expect(
  sheetOrder.join(',') === catalogSections.join(','),
  'SECTION_ORDER matches catalogue section order\n  sheet:     ' + sheetOrder.join(',') + '\n  catalogue: ' + catalogSections.join(',')
);
expect(
  paletteSections.every((s) => sheetOrder.indexOf(s) >= 0),
  'every palette section is ranked by SECTION_ORDER'
);

// ── style policy agrees with the editor keymaps ───────────────────────────────
// keymap-style.mjs decides which chords actually fire under Vim/Emacs. If these
// drift, the Keybindings sheet advertises bindings the editor has taken away.

// keymap-style.mjs now READS the catalogue at runtime (`policyIds`), keeping its
// arrays only as an offline fallback. So the contract is no longer equality: the
// fallback must name a subset of the catalogue's set, and must never contradict
// it. A fallback naming an id the catalogue does not agree with would flip a
// chord's behaviour whenever the registry happened to be missing.

function assertFallback(style, policy, fallback, label) {
  const declared = C.idsWithStyle(style, policy);
  for (const id of fallback) {
    expect(
      declared.indexOf(id) >= 0,
      `${label} names ${id}, but the catalogue does not declare ${style}: ${policy} for it`
    );
    expect(C.styleFor(id, style) === policy, `${id} resolves to ${policy} under ${style}`);
  }
  expect(fallback.length > 0, `${label} is a usable offline fallback`);
}

assertFallback('emacs', 'off', EMACS_OMIT_COMMAND_IDS, 'EMACS_OMIT_COMMAND_IDS');
assertFallback('emacs', 'yield', EMACS_YIELD_GLOBAL_IDS, 'EMACS_YIELD_GLOBAL_IDS');
assertFallback('vim', 'always', VIM_ALWAYS_COMMAND_IDS, 'VIM_ALWAYS_COMMAND_IDS');

// The fallback must still cover every chord that ships bound — those are the
// ones whose behaviour would visibly change if the registry were absent.
for (const cmd of all) {
  if (!cmd.defaultSpec || !cmd.styles) continue;
  if (cmd.styles.emacs === 'off') {
    expect(EMACS_OMIT_COMMAND_IDS.indexOf(cmd.id) >= 0, `${cmd.id} ships bound and emacs-off; fallback must name it`);
  }
  if (cmd.styles.vim === 'always') {
    expect(VIM_ALWAYS_COMMAND_IDS.indexOf(cmd.id) >= 0, `${cmd.id} ships bound and vim-always; fallback must name it`);
  }
}

// Every id named by the keymap policy tables must exist in the catalogue.
for (const id of [...EMACS_OMIT_COMMAND_IDS, ...EMACS_YIELD_GLOBAL_IDS, ...VIM_ALWAYS_COMMAND_IDS]) {
  expect(C.has(id), `keymap-style names ${id}, which the catalogue does not define`);
}

// ── one registry in the product bundle ────────────────────────────────────────
// keybindings, the palette and app.js each import the registry. esbuild must
// dedupe them into a single module instance inside shell.js — two copies would
// mean Keybindings projecting from a registry the palette never registers into,
// silently. The catalogue title below appears nowhere else in the shell.

const shell = readFileSync(join(here, '..', 'js', 'shell.js'), 'utf8');
const copies = (shell.match(/title: "Show Autocomplete"/g) || []).length;
expect(copies === 1, `shell.js must bundle exactly one command registry, found ${copies}`);

console.log(`OK command catalog (${all.length} commands, ${paletteOrder.length} in the palette, policy tables agree)`);
