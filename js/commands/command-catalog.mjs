/**
 * The command catalogue — static metadata for every BelJar command.
 *
 * This is DATA only: no `run`, no DOM, no deps. Behaviour is attached later by
 * whoever owns it (`Commands.attach(id, { run, when })`), which is what lets
 * `Keybindings` project its chord table at load time — long before `app.js`
 * exists — while the palette shows only commands that can actually run.
 *
 * Fields
 *   id            stable, dotted, domain-first
 *   title/section as shown in the palette and the Keybindings sheet
 *   scope         global | editor  (where the chord is dispatched)
 *   defaultSpec   default chord; `macDefaultSpec` overrides it on macOS
 *   keybindable   appears in the Keybindings sheet and the chord tables
 *   palette       appears in the command palette's `>` list
 *   bar           reachable by name from the editor status strip
 *   ex / mx       Vim ex aliases / Emacs M-x name (mx defaults from the id)
 *   styles        per-editing-style policy — see `styleFor()` in the registry
 *
 * `keybindable` without a `defaultSpec` is the normal case for a new command:
 * bindable, listed in the sheet as unbound, and reachable from the palette
 * meanwhile. We ship a default chord only where there is a real convention to
 * honour — inventing chords is how a keymap ends up fighting the user's own.
 *
 * ⚠ Order matters for one consumer: the palette lists `palette: true` entries
 * in catalogue order when the query is empty, emitting a header each time the
 * section changes. Keep sections contiguous, and keep them in the same order as
 * `SECTION_ORDER` in `js/ui/keybindings.mjs` so both surfaces read alike.
 */

import { settingEntries } from './command-settings.mjs';

export const CATALOG = [
  // ── File ───────────────────────────────────────────────────────────────────
  { id: 'project.new', title: 'New Project…', section: 'File', scope: 'global', palette: true },
  { id: 'file.new', title: 'New file…', section: 'File', scope: 'global', palette: true },
  { id: 'file.upload', title: 'Upload File', section: 'File', scope: 'global', palette: true },
  { id: 'file.upload-folder', title: 'Upload Folder', section: 'File', scope: 'global', palette: true },
  { id: 'file.import-folder', title: 'Import Folder as New Project', section: 'File', scope: 'global', palette: true },
  { id: 'file.download', title: 'Download Current File', section: 'File', scope: 'global', palette: true },
  { id: 'tab.next', title: 'Next Tab', section: 'File', scope: 'global', palette: true, keybindable: true, ex: ['bn'] },
  { id: 'tab.prev', title: 'Previous Tab', section: 'File', scope: 'global', palette: true, keybindable: true, ex: ['bp'] },
  { id: 'tab.close', title: 'Close Tab', section: 'File', scope: 'global', palette: true, keybindable: true },
  { id: 'tab.close-others', title: 'Close Other Tabs', section: 'File', scope: 'global', palette: true, keybindable: true },
  { id: 'tab.close-right', title: 'Close Tabs to the Right', section: 'File', scope: 'global', palette: true, keybindable: true },
  // `:w`. BelJar autosaves, so this is "commit it NOW" — including the
  // format-on-save and trim-trailing-whitespace transforms, which otherwise
  // wait for the debounce. `:wa` is the same act: there is one live buffer, so
  // a separate save-all would be a second name for one thing.
  {
    id: 'file.save',
    title: 'Save Now',
    section: 'File',
    scope: 'global',
    palette: true,
    keybindable: true,
    ex: ['w', 'write', 'wa', 'wall'],
    styles: { vim: 'always' },
  },
  // `:e util.bel` — open a project file by name, with completion. Opening one
  // that is already open just focuses its tab, which is what `:b` would do.
  {
    id: 'file.open',
    title: 'Open File',
    section: 'File',
    scope: 'global',
    palette: false,
    keybindable: false,
    ex: ['e', 'edit'],
    args: [{ kind: 'file', label: 'file' }],
  },
  // Suite membership for the current file. Gated on the file's directory having
  // exactly ONE active suite: with two, the answer is a question, and a command
  // that guesses would be rewriting a .cfg on the user's behalf.
  {
    id: 'suite.add-file',
    title: 'Add to Suite',
    section: 'File',
    scope: 'global',
    palette: true,
    keybindable: true,
  },
  {
    id: 'suite.remove-file',
    title: 'Remove from Suite',
    section: 'File',
    scope: 'global',
    palette: true,
    keybindable: true,
  },

  // ── Edit ───────────────────────────────────────────────────────────────────
  {
    id: 'edit.undo',
    title: 'Undo',
    section: 'Edit',
    scope: 'editor',
    defaultSpec: 'Mod+Z',
    keybindable: true,
    palette: true,
    styles: { vim: 'insert-only' },
  },
  {
    id: 'edit.redo',
    title: 'Redo',
    section: 'Edit',
    scope: 'editor',
    defaultSpec: 'Mod+Y',
    macDefaultSpec: 'Mod+Shift+Z',
    keybindable: true,
    palette: true,
    styles: { vim: 'insert-only', emacs: 'off' },
  },
  {
    id: 'edit.find',
    title: 'Find…',
    section: 'Edit',
    scope: 'editor',
    defaultSpec: 'Mod+F',
    keybindable: true,
    palette: true,
    styles: { vim: 'insert-only', emacs: 'off' },
  },
  {
    id: 'edit.search-project',
    title: 'Search in Project…',
    section: 'Edit',
    scope: 'global',
    defaultSpec: 'Mod+Shift+F',
    keybindable: true,
    palette: true,
  },
  {
    id: 'edit.toggle-comment',
    title: 'Toggle Line Comment',
    section: 'Edit',
    scope: 'editor',
    defaultSpec: 'Mod+/',
    keybindable: true,
    palette: true,
    styles: { vim: 'insert-only', emacs: 'off' },
  },
  {
    id: 'edit.format',
    title: 'Format Document',
    section: 'Edit',
    scope: 'editor',
    defaultSpec: 'Alt+Shift+F',
    keybindable: true,
    palette: true,
    ex: ['fmt', 'format'],
    styles: { vim: 'always' },
  },
  {
    id: 'edit.rename',
    title: 'Rename Symbol',
    section: 'Edit',
    scope: 'editor',
    defaultSpec: 'F2',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  {
    id: 'edit.select-all',
    title: 'Select All',
    section: 'Edit',
    scope: 'editor',
    defaultSpec: 'Mod+A',
    keybindable: true,
    palette: true,
    styles: { vim: 'insert-only', emacs: 'off' },
  },
  {
    // Chord-only: "show me completions" is meaningless from a palette you had
    // to open with the keyboard anyway.
    id: 'edit.autocomplete',
    title: 'Show Autocomplete',
    section: 'Edit',
    scope: 'editor',
    defaultSpec: 'Control+Space',
    keybindable: true,
    styles: { vim: 'insert-only', emacs: 'off' },
  },
  { id: 'edit.delete-line', title: 'Delete Line', section: 'Edit', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'insert-only' } },
  { id: 'edit.move-line-up', title: 'Move Line Up', section: 'Edit', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'insert-only' } },
  { id: 'edit.move-line-down', title: 'Move Line Down', section: 'Edit', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'insert-only' } },
  { id: 'edit.duplicate-line', title: 'Duplicate Line', section: 'Edit', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'insert-only' } },
  { id: 'edit.duplicate-line-up', title: 'Duplicate Line Up', section: 'Edit', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'insert-only' } },
  { id: 'edit.indent', title: 'Indent', section: 'Edit', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'insert-only' } },
  { id: 'edit.dedent', title: 'Dedent', section: 'Edit', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'insert-only' } },
  { id: 'edit.reindent', title: 'Reindent Selection', section: 'Edit', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'insert-only' } },
  { id: 'edit.transpose-chars', title: 'Transpose Characters', section: 'Edit', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'insert-only' } },
  { id: 'edit.split-line', title: 'Split Line', section: 'Edit', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'insert-only' } },
  { id: 'edit.blank-line', title: 'Insert Blank Line', section: 'Edit', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'insert-only' } },
  { id: 'edit.trim-whitespace', title: 'Trim Trailing Whitespace', section: 'Edit', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'insert-only' } },

  // ── Motion ─────────────────────────────────────────────────────────────────
  // Bindable, but in NEITHER the palette nor the command line: nobody searches
  // a command list for "move left", and `:motion-char-left` is not a thing
  // anyone types. They exist so "bind anything" is true — `cmdline: false` is what
  // keeps 31 of them out of the line's completion.
  //
  // ⛔ This is the only section that turns the flag off, and the reason it
  // exists. Anything else added here must earn the same argument.
  { id: 'motion.char-left', title: 'Move Left', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'motion.char-right', title: 'Move Right', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'motion.word-left', title: 'Move Word Left', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'motion.word-right', title: 'Move Word Right', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'motion.line-up', title: 'Move Up', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'motion.line-down', title: 'Move Down', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'motion.line-start', title: 'Move to Line Start', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'motion.line-end', title: 'Move to Line End', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'motion.doc-start', title: 'Move to Start of File', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'motion.doc-end', title: 'Move to End of File', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'motion.page-up', title: 'Move Page Up', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'motion.page-down', title: 'Move Page Down', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'motion.match-bracket', title: 'Move to Matching Bracket', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'motion.syntax-left', title: 'Move by Syntax Left', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'motion.syntax-right', title: 'Move by Syntax Right', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'select.char-left', title: 'Select Left', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'select.char-right', title: 'Select Right', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'select.word-left', title: 'Select Word Left', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'select.word-right', title: 'Select Word Right', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'select.line-up', title: 'Select Up', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'select.line-down', title: 'Select Down', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'select.line-start', title: 'Select to Line Start', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'select.line-end', title: 'Select to Line End', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'select.doc-start', title: 'Select to Start of File', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'select.doc-end', title: 'Select to End of File', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'select.page-up', title: 'Select Page Up', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'select.page-down', title: 'Select Page Down', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'select.match-bracket', title: 'Select to Matching Bracket', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'select.line', title: 'Select Line', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'select.parent-syntax', title: 'Select Enclosing Syntax', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },
  { id: 'select.collapse', title: 'Collapse Selection', section: 'Motion', scope: 'editor', keybindable: true, cmdline: false, styles: { vim: 'insert-only' } },

  // ── Navigate ───────────────────────────────────────────────────────────────
  {
    id: 'nav.symbol',
    title: 'Go to Symbol…',
    section: 'Navigate',
    scope: 'global',
    defaultSpec: 'Mod+Shift+O',
    keybindable: true,
    palette: true,
    ex: ['sym'],
  },
  {
    id: 'nav.anywhere',
    title: 'Go to File…',
    section: 'Navigate',
    scope: 'global',
    defaultSpec: 'Mod+K',
    keybindable: true,
    styles: { emacs: 'yield' },
  },
  {
    id: 'nav.definition',
    title: 'Go to Definition',
    section: 'Navigate',
    scope: 'editor',
    defaultSpec: 'F12',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  {
    id: 'nav.references',
    title: 'Find References',
    section: 'Navigate',
    scope: 'editor',
    defaultSpec: 'Shift+F12',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  {
    id: 'nav.enclosing-decl',
    title: 'Go to Enclosing Declaration',
    section: 'Navigate',
    scope: 'editor',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  {
    id: 'nav.binder',
    title: 'Go to Binder',
    section: 'Navigate',
    scope: 'editor',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  {
    id: 'nav.inspector',
    title: 'Reveal in Inspector',
    section: 'Navigate',
    scope: 'editor',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  // Structure motions: a Beluga file is declarations containing case branches,
  // so `]d` and `]c` are the two that matter.
  { id: 'nav.next-decl', title: 'Go to Next Declaration', section: 'Navigate', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'always' } },
  { id: 'nav.prev-decl', title: 'Go to Previous Declaration', section: 'Navigate', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'always' } },
  { id: 'nav.next-case', title: 'Go to Next Case Branch', section: 'Navigate', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'always' } },
  { id: 'nav.prev-case', title: 'Go to Previous Case Branch', section: 'Navigate', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'always' } },
  // The jump list. Everything above jumps; these are the way back.
  { id: 'nav.jump-back', title: 'Jump Back', section: 'Navigate', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'always' } },
  { id: 'nav.jump-forward', title: 'Jump Forward', section: 'Navigate', scope: 'editor', keybindable: true, palette: true, styles: { vim: 'always' } },
  {
    id: 'nav.next-hole',
    title: 'Go to Next Hole',
    section: 'Navigate',
    scope: 'editor',
    defaultSpec: 'F8',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  {
    id: 'nav.prev-hole',
    title: 'Go to Previous Hole',
    section: 'Navigate',
    scope: 'editor',
    defaultSpec: 'Shift+F8',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  {
    id: 'nav.next-problem',
    title: 'Go to Next Problem',
    section: 'Navigate',
    scope: 'editor',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  {
    id: 'nav.prev-problem',
    title: 'Go to Previous Problem',
    section: 'Navigate',
    scope: 'editor',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },

  // ── Prover ─────────────────────────────────────────────────────────────────
  // Everything here is gated on the caret standing in a hole, so the palette
  // stays quiet unless there is actually a goal under the cursor.
  {
    id: 'prover.hole-intro',
    title: 'Intro at Hole',
    section: 'Prover',
    scope: 'editor',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  {
    id: 'prover.hole-split',
    title: 'Split at Hole',
    section: 'Prover',
    scope: 'editor',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  {
    id: 'prover.hole-fill',
    title: 'Fill Hole',
    section: 'Prover',
    scope: 'editor',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  {
    id: 'prover.open-in-harpoon',
    title: 'Open Hole in Harpoon',
    section: 'Prover',
    scope: 'editor',
    keybindable: true,
    palette: true,
    ex: ['harpoon'],
    styles: { vim: 'always' },
  },
  // Reading the proof state, from the editor. Not gated on standing IN a hole:
  // "how many are left" is a question you ask from anywhere in the file.
  {
    id: 'prover.count-holes',
    title: 'Count Holes',
    section: 'Prover',
    scope: 'editor',
    keybindable: true,
    palette: true,
    ex: ['holes'],
    styles: { vim: 'always' },
  },
  {
    id: 'prover.goal-at-cursor',
    title: 'Show Goal at Cursor',
    section: 'Prover',
    scope: 'editor',
    keybindable: true,
    palette: true,
    ex: ['goal'],
    styles: { vim: 'always' },
  },
  // Driving the Harpoon lab itself. `when()` resolves the session the user is
  // looking at (`Harpoon.activeSession`), so with no lab open these vanish from
  // the palette rather than reporting a failure.
  {
    id: 'harpoon.next-goal',
    title: 'Next Goal',
    section: 'Prover',
    scope: 'global',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  {
    id: 'harpoon.prev-goal',
    title: 'Previous Goal',
    section: 'Prover',
    scope: 'global',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  {
    id: 'harpoon.undo-move',
    title: 'Undo Proof Move',
    section: 'Prover',
    scope: 'global',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  {
    id: 'harpoon.redo-move',
    title: 'Redo Proof Move',
    section: 'Prover',
    scope: 'global',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  {
    id: 'harpoon.orca-start',
    title: 'Run Orca',
    section: 'Prover',
    scope: 'global',
    keybindable: true,
    palette: true,
    ex: ['orca'],
    styles: { vim: 'always' },
  },
  {
    id: 'harpoon.orca-pause',
    title: 'Pause Orca',
    section: 'Prover',
    scope: 'global',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },
  {
    id: 'harpoon.orca-absorb',
    title: 'Take Over from Orca',
    section: 'Prover',
    scope: 'global',
    keybindable: true,
    palette: true,
    styles: { vim: 'always' },
  },

  // ── Run ────────────────────────────────────────────────────────────────────
  // What the Run button does: a suite member runs the suite up to and including
  // itself; an isolated file runs alone. The status segment uses this so it can
  // never be a weaker Run than the button beside it.
  { id: 'run.default', title: 'Run', section: 'Run', scope: 'global', palette: true, keybindable: true },
  { id: 'run.file', title: 'Run File', section: 'Run', scope: 'global', palette: true, keybindable: true, ex: ['run'] },
  { id: 'run.here', title: 'Run Suite to Here', section: 'Run', scope: 'global', palette: true, keybindable: true },
  { id: 'run.module', title: 'Run Suite', section: 'Run', scope: 'global', palette: true, keybindable: true, ex: ['runs'] },
  { id: 'run.project', title: 'Run Project', section: 'Run', scope: 'global', palette: true, keybindable: true, ex: ['runp'] },
  { id: 'run.clear-output', title: 'Clear Output', section: 'Run', scope: 'global', palette: true, keybindable: true },

  // ── View ───────────────────────────────────────────────────────────────────
  { id: 'view.theme', title: 'Toggle Theme', section: 'View', scope: 'global', palette: true, keybindable: true },
  { id: 'view.explorer', title: 'Toggle Explorer', section: 'View', scope: 'global', palette: true, keybindable: true },
  { id: 'view.library', title: 'Toggle Library', section: 'View', scope: 'global', palette: true, keybindable: true },
  { id: 'view.harpoon', title: 'Toggle Harpoon', section: 'View', scope: 'global', palette: true, keybindable: true },
  // The `⟲` widget in the status strip is the same panel; a surface you can only
  // reach by clicking is one the palette and the `:` line cannot offer.
  { id: 'view.edit-history', title: 'Toggle Edit History', section: 'View', scope: 'global', palette: true, keybindable: true, ex: ['undolist'] },
  { id: 'view.settings', title: 'Open Settings…', section: 'View', scope: 'global', palette: true, keybindable: true },
  { id: 'fold.all', title: 'Fold All', section: 'View', scope: 'editor', palette: true, keybindable: true },
  { id: 'fold.unfold-all', title: 'Unfold All', section: 'View', scope: 'editor', palette: true, keybindable: true },

  // ── Settings ───────────────────────────────────────────────────────────────
  // Generated from `command-settings.mjs`: one declaration behind the palette
  // row, the bindable chord and Vim's `:set`.
  ...settingEntries(),
  // The line's way in. Not in the palette: without an argument it does nothing,
  // and each preference already has its own palette row above.
  {
    id: 'settings.set',
    title: 'Set Option',
    section: 'Settings',
    scope: 'global',
    palette: false,
    keybindable: false,
    ex: ['set', 'se'],
    args: [{ kind: 'option', label: 'option' }],
  },

  // ── Tools ──────────────────────────────────────────────────────────────────
  // Not keybindable: `nav.anywhere` owns Mod+K. The literal `shortcut` is the
  // palette's own display fallback for an entry with no chord of its own.
  // Fullscreen + `navigator.keyboard.lock()`. Measured by hand: under lock the
  // ten reserved chords reach the page AND their browser actions do not fire.
  { id: 'keys.full-keyboard', title: 'Toggle Full Keyboard', section: 'Tools', scope: 'global', palette: true, keybindable: true, ex: ['fullkeys'] },
  // Generated from `describe()`, so it is the keymap rather than a copy of it.
  // `keys.show-chords` from the original Wave G list folded in here: one sheet
  // that answers "what can I press" beats two that answer half each.
  { id: 'keys.macros', title: 'Available Macros…', section: 'Tools', scope: 'global', palette: true, keybindable: true, ex: ['help', 'macros'] },
  { id: 'cmdline.repeat', title: 'Repeat Last Command', section: 'Tools', scope: 'global', palette: true, keybindable: true },
  { id: 'cmdline.open', title: 'Command Line', section: 'Tools', scope: 'global', palette: true, keybindable: true },
  { id: 'tools.palette', title: 'Open Command Palette', section: 'Tools', scope: 'global', palette: true, shortcut: 'Mod+K' },
  { id: 'tools.graph', title: 'Open Dependency Graph', section: 'Tools', scope: 'global', palette: true, keybindable: true, ex: ['graph'] },
  { id: 'tools.inspector', title: 'Open Inspector', section: 'Tools', scope: 'global', palette: true, keybindable: true },
  {
    id: 'tools.commands',
    title: 'Run Command…',
    section: 'Tools',
    scope: 'global',
    // ⛔ NOT `Mod+Shift+P`. That was the shipped chord until `scripts/chord-audit.html`
    // measured Chrome on Windows taking it before the page ever sees it — a
    // default that simply did nothing for half our users. `Alt+X` was measured
    // arriving, and it reads as "execute a command" to anyone who has met M-x.
    defaultSpec: 'Alt+X',
    // ⚠ Alt is Option on a Mac and composes characters — Option+X types "≈", so
    // the Windows chord cannot carry over. Cmd+Shift+P is free there (Chrome's
    // incognito chord is Cmd+Shift+N) and is what every editor uses anyway.
    macDefaultSpec: 'Mod+Shift+P',
    keybindable: true,
    // …which is exactly what Emacs binds it to, so Emacs' own M-x wins there.
    styles: { emacs: 'off' },
  },
];
