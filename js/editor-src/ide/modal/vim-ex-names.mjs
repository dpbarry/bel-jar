/**
 * The ex commands VIM'S OWN dispatcher answers to — as data, so the command
 * line can stop lying about them.
 *
 * ## Why this file exists
 *
 * Under Vim the `:` line is the PACKAGE'S input, and Enter runs through the
 * package's `exCommandDispatcher`. BelJar layers its candidate list on top of
 * that field — and the list was drawn from BelJar's registry alone, so it was
 * wrong in both directions at once. Measured, in the browser:
 *
 *   `:nohlsearch`  the list said **"No matching command"**, and Enter ran it.
 *   `:sort`        offered three unrelated `set.*` rows; Enter sorted the buffer.
 *   `:occurrence`  Tab completed to `set.occurrence-highlight`, and Enter
 *                  answered `Not an editor command ":set.occurrence-highlight"`.
 *
 * That is the ⛔ *"a surface may only offer what WORKS"* law broken both ways in
 * one field: denying what runs, and offering what cannot.
 *
 * ## Why a MIRROR and not a read
 *
 * ⛔ The package publishes no accessor. `defaultExCommandMap` is a module-local
 * array and `exCommandDispatcher` — which holds the live `commandMap_` that
 * `Vim.defineEx` writes into — is a module-local closure. `Vim` exposes
 * `defineEx`, `handleEx`, `map` and `unmap`: every one of them ACTS, none of
 * them ANSWERS. There is no runtime question to ask.
 *
 * So this is the package's own table, mirrored, and `tests/test-vim-ex-names.mjs`
 * re-reads `vim.js` on every run and fails if a single entry is added, dropped
 * or renamed. The same arrangement `emacs-keys.mjs` has for the Emacs keymap,
 * and for the same reason: a list written from memory is a list that starts
 * lying at the next package bump.
 *
 * ⚠ This is the DEFAULT map. BelJar's own `Vim.defineEx` calls add to it (every
 * command with an ex alias) and override some of it (`:set`, `:undo`, `:redo`,
 * `:write`), and a user's `:map` adds more. The candidate list unions this with
 * BelJar's registry, so those are all covered; what is NOT covered is a command
 * a future package version adds, which is exactly what the test catches.
 */

/** `[name, shortName]`, verbatim from the package's `defaultExCommandMap`. */
export const VIM_EX_COMMANDS = [
  ['colorscheme', 'colo'],
  ['map', ''],
  ['imap', 'im'],
  ['nmap', 'nm'],
  ['vmap', 'vm'],
  ['omap', 'om'],
  ['noremap', 'no'],
  ['nnoremap', 'nn'],
  ['vnoremap', 'vn'],
  ['inoremap', 'ino'],
  ['onoremap', 'ono'],
  ['unmap', ''],
  ['mapclear', 'mapc'],
  ['nmapclear', 'nmapc'],
  ['vmapclear', 'vmapc'],
  ['imapclear', 'imapc'],
  ['omapclear', 'omapc'],
  ['write', 'w'],
  ['undo', 'u'],
  ['redo', 'red'],
  ['set', 'se'],
  ['setlocal', 'setl'],
  ['setglobal', 'setg'],
  ['sort', 'sor'],
  ['substitute', 's'],
  ['startinsert', 'start'],
  ['nohlsearch', 'noh'],
  ['yank', 'y'],
  ['put', 'pu'],
  ['delmarks', 'delm'],
  ['marks', ''],
  ['registers', 'reg'],
  ['vglobal', 'v'],
  ['delete', 'd'],
  ['join', 'j'],
  ['normal', 'norm'],
  ['global', 'g'],
];

/**
 * What each one does, in BelJar's voice.
 *
 * ⛔ Every entry above must carry words, and the test enforces it. A candidate
 * row with a name and no explanation is a row that sends you to `:help`, which
 * is the one place a browser IDE cannot send you.
 */
const WORDS = {
  colorscheme: 'Vim: report the colour scheme',
  map: 'Vim: map a key sequence',
  imap: 'Vim: map a key in Insert mode',
  nmap: 'Vim: map a key in Normal mode',
  vmap: 'Vim: map a key in Visual mode',
  omap: 'Vim: map a key for an operator',
  noremap: 'Vim: map a key without recursion',
  nnoremap: 'Vim: map a Normal-mode key without recursion',
  vnoremap: 'Vim: map a Visual-mode key without recursion',
  inoremap: 'Vim: map an Insert-mode key without recursion',
  onoremap: 'Vim: map an operator key without recursion',
  unmap: 'Vim: remove a mapping',
  mapclear: 'Vim: remove every mapping',
  nmapclear: 'Vim: remove every Normal-mode mapping',
  vmapclear: 'Vim: remove every Visual-mode mapping',
  imapclear: 'Vim: remove every Insert-mode mapping',
  omapclear: 'Vim: remove every operator mapping',
  write: 'Save the file',
  undo: 'Undo',
  redo: 'Redo',
  set: 'Set a preference',
  setlocal: 'Vim: set a preference for this buffer',
  setglobal: 'Vim: set a preference globally',
  sort: 'Vim: sort the lines',
  substitute: 'Vim: substitute over a range',
  startinsert: 'Vim: enter Insert mode',
  nohlsearch: 'Vim: clear the search highlight',
  yank: 'Vim: yank lines into a register',
  put: 'Vim: put a register after the line',
  delmarks: 'Vim: delete marks',
  marks: 'Vim: list the marks',
  registers: 'Vim: list the registers',
  vglobal: 'Vim: run a command on lines NOT matching',
  delete: 'Vim: delete lines into a register',
  join: 'Vim: join lines',
  normal: 'Vim: run Normal-mode keys',
  global: 'Vim: run a command on matching lines',
};

/**
 * Candidate rows for the command line, in the shape `complete()` wants.
 *
 * The short name rides along as an alias, so `:noh` finds `nohlsearch` and
 * `:sor` finds `sort` — which is how a vi user types them.
 */
export function vimExCandidates() {
  return VIM_EX_COMMANDS.map(([name, shortName]) => ({
    value: name,
    label: WORDS[name] || name,
    detail: 'Vim',
    aliases: shortName ? [shortName] : [],
    args: [],
    id: 'vim:' + name,
    vim: true,
  }));
}

/** Pure, for the test that re-reads the package. */
export const _pure = { VIM_EX_COMMANDS, WORDS };
