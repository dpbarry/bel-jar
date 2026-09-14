// Vim bindings that make BelJar feel built for Vim rather than wearing it.
//
// Everything here goes through the package's public API — `defineAction`,
// `mapCommand`, `map`, `defineEx` — and every action is a COMMAND id, so a
// binding here can never do something the palette and the Keybindings sheet do
// not also know about.
//
// Vim keeps what Vim is good at: `:s`, `:g`, `/`, text motions. We add what only
// BelJar knows: where the holes are, where the problems are, where a name is
// defined, and how to reach the prover.
import { Vim } from '@replit/codemirror-vim';
import { startRecording, stopRecording, replayMacro, isRecording } from '../macro-engine.mjs';
import { VIM_MACRO_KEYS } from './macro-keys.mjs';
import { writeSystemClipboard } from '../clipboard-bridge.mjs';

const global = globalThis;

/** `\` by default — the least-typed key that is not already a vi motion. */
export const DEFAULT_LEADER = '\\';

function commands() {
  return global.Commands && typeof global.Commands.run === 'function' ? global.Commands : null;
}

function say(text) {
  if (global.StatusStrip && global.StatusStrip.setMessage) global.StatusStrip.setMessage(text);
}

function runId(id) {
  const C = commands();
  if (!C) return;
  if (!C.run(id)) {
    const cmd = C.get ? C.get(id) : null;
    say(cmd ? `"${cmd.title}" is not available right now.` : `Unknown command "${id}".`);
  }
}

/** `keys` in Normal mode → a BelJar command. */
const NORMAL_MAP = [
  // Go to…
  ['gd', 'nav.definition'],
  ['gr', 'nav.references'],
  ['gD', 'nav.enclosing-decl'],
  ['gh', 'nav.binder'],
  ['gi', 'nav.inspector'],
  ['K', 'nav.inspector'],
  // Bracket motions: the two things a Beluga file is full of.
  [']h', 'nav.next-hole'],
  ['[h', 'nav.prev-hole'],
  [']e', 'nav.next-problem'],
  ['[e', 'nav.prev-problem'],
  [']d', 'nav.next-decl'],
  ['[d', 'nav.prev-decl'],
  [']c', 'nav.next-case'],
  ['[c', 'nav.prev-case'],
  // The jump list, where a vi user reaches for it.
  ['<C-o>', 'nav.jump-back'],
  ['<C-i>', 'nav.jump-forward'],
];

/** Leader sequences. Only ids that are actually wired — no dead keys. */
const LEADER_MAP = [
  ['f', 'tools.palette'],
  ['p', 'cmdline.open'],
  ['/', 'edit.search-project'],
  ['s', 'nav.symbol'],
  ['h', 'prover.hole-intro'],
  ['H', 'prover.open-in-harpoon'],
  ['r', 'run.default'],
  ['g', 'tools.graph'],
  ['e', 'view.explorer'],
  ['d', 'nav.next-problem'],
];

/**
 * `:set` onto real BelJar preferences.
 *
 * The option table lives shell-side in `command-settings.mjs`, where the palette
 * rows and the bar's completion come from too, so this is a shim: parse and
 * apply happen once, in one place, and a preference added there is `:set`-able
 * here the same day. `Commands.settings` is how it crosses the bundle seam.
 */
/**
 * Vim's own five options, for the names BelJar's table does not own.
 *
 * ⛔ BelJar's `:set` REPLACES Vim's — `Vim.defineEx('set', …)` overwrites the
 * package's entry outright — so `pcre`, `langmap`, `insertModeEscKeysTimeout`,
 * `filetype` and `textwidth` were answered "Unknown option" and quietly lost. A
 * style that takes a chord and gives nothing back is the same failure as a
 * surface advertising a dead key; a style that takes a whole COMMAND and gives
 * nothing back is a larger one.
 *
 * ⛔ The line is parsed ONCE, by `Commands.settings.parse` — the same grammar the
 * palette and the command line use. Re-deriving `no…` / `…!` / `…=v` here would
 * be a second spelling of one rule, and the two would drift.
 *
 * `Vim.setOption` / `Vim.getOption` are the package's public API; `getOption`
 * throwing IS the "vim does not know this either" answer, which is when BelJar's
 * own "Unknown option" message is the right one after all.
 */
function vimOptionCandidates(parsed) {
  const out = [];
  for (const n of [parsed.typed, parsed.name]) {
    if (!n) continue;
    out.push({ name: n, negated: !!parsed.negated });
    // ⛔ `parseSet` only strips `no` when BELJAR owns the remainder, so `:set
    // nopcre` arrives whole. Vim's own `no` prefix has to be undone here or the
    // one spelling that turns a vim option OFF would be the one that fails.
    if (/^no./.test(n)) out.push({ name: n.slice(2), negated: true });
  }
  return out;
}

/**
 * ⛔ `getOption`/`setOption` RETURN an `Error`; they do not throw it. A `try`
 * around them catches nothing, so an unknown name came back as a truthy object,
 * fell into the "bare non-boolean is a get" branch, and echoed
 * `nopcre=Error: Unknown option: nopcre` — which the probe's control then
 * accepted, because it was looking for the words "unknown option" and those were
 * in our own echo. A false green sitting on top of a dead fall-through.
 */
function vimKnows(result) {
  return !(result instanceof Error);
}

function setVimOption(parsed, cm) {
  for (const { name, negated } of vimOptionCandidates(parsed)) {
    const current = tryVimGet(name, cm);
    if (!vimKnows(current)) continue; // vim does not know it either — next spelling
    let value = parsed.value;
    if (value == null || value === '') {
      if (negated) value = false;
      else if (parsed.toggle) value = !current;
      else if (typeof current === 'boolean') value = true;
      // A bare non-boolean is a GET in vim, not a set. Report and stop.
      else { say(`${name}=${current}`); return true; }
    }
    if (!vimKnows(trySetOption(name, value, cm))) return false;
    const now = tryVimGet(name, cm);
    say(`${name}=${vimKnows(now) ? String(now) : String(value)}`);
    return true;
  }
  return false;
}

function tryVimGet(name, cm) {
  try {
    return Vim.getOption(name, cm);
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

function trySetOption(name, value, cm) {
  try {
    return Vim.setOption(name, value, cm);
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

/** What Vim's OWN option table holds right now, or undefined. For instruments. */
export function vimOption(name) {
  const v = tryVimGet(name, null);
  return vimKnows(v) ? v : undefined;
}

export function runSet(arg, cm) {
  const C = commands();
  if (!C) return false;
  const text = String(arg || '');
  const parse = C.settings && typeof C.settings.parse === 'function' ? C.settings.parse : null;
  if (parse) {
    const parsed = parse(text);
    if (parsed && parsed.error === 'unknown' && setVimOption(parsed, cm)) return true;
  }
  if (typeof C.runSet === 'function') return C.runSet(text);
  // The shell attaches `settings.set` a tick after the registry exists; going
  // through the id covers the window before `runSet` is published.
  return C.run('settings.set', { argText: text });
}

/**
 * `id` / `ad`: the declaration under the caret as a Vim text object, so `dad`
 * deletes exactly one Beluga declaration and `yad` yanks one.
 *
 * The package has no hook for a new object character — `textObjectManipulation`
 * is a hardcoded switch — so this rides `defineMotion` + `mapCommand`, which
 * unshifts onto `defaultKeymap` and therefore outranks the built-in
 * `a<register>` / `i<register>` wildcards. (Spike S3; verified by driving `dad`
 * in a real editor, not by reading the source.)
 */
function declObject(cm, head, motionArgs) {
  const ed = global.CurrentEditor;
  const view = ed && typeof ed.getView === 'function' ? ed.getView() : null;
  if (!ed || !view || typeof ed.getDeclSpan !== 'function') return null;
  let span = null;
  try {
    span = ed.getDeclSpan(cm.indexFromPos(head));
  } catch (_) {
    return null;
  }
  if (!span || !(span.to > span.from)) return null;
  let { from, to } = span;
  if (motionArgs && motionArgs.textObjectInner) {
    // `i`nner: the declaration without the whitespace around it.
    const text = view.state.doc.sliceString(from, to);
    from += text.length - text.replace(/^\s+/, '').length;
    to -= text.length - text.replace(/\s+$/, '').length;
    if (to <= from) return null;
  }
  if (motionArgs) motionArgs.inclusive = false;
  return [cm.posFromIndex(from), cm.posFromIndex(to)];
}

/**
 * `ic` / `ac`: the `case` branch under the caret.
 *
 * `a`c is the whole branch as the tree gives it; `i`c is the body after the
 * `=>`, so `cic` rewrites one branch's answer and `dac` removes the branch
 * entirely. Whitespace is trimmed off the inner object — a branch body runs to
 * the next `|`, and taking that whitespace with it is never what was meant.
 */
function caseObject(cm, head, motionArgs) {
  const ed = global.CurrentEditor;
  const view = ed && typeof ed.getView === 'function' ? ed.getView() : null;
  if (!ed || !view || typeof ed.getCaseBranchSpan !== 'function') return null;
  const inner = !!(motionArgs && motionArgs.textObjectInner);
  let span = null;
  try {
    span = ed.getCaseBranchSpan(cm.indexFromPos(head), { inner });
  } catch (_) {
    return null;
  }
  if (!span || !(span.to > span.from)) return null;
  let { from, to } = span;
  if (inner) {
    const text = view.state.doc.sliceString(from, to);
    from += text.length - text.replace(/^\s+/, '').length;
    to -= text.length - text.replace(/\s+$/, '').length;
    if (to <= from) return null;
  }
  if (motionArgs) motionArgs.inclusive = false;
  return [cm.posFromIndex(from), cm.posFromIndex(to)];
}

/**
 * Vim's `q` and `@`, re-pointed at BelJar's one macro engine.
 *
 * ⛔ The same move `ensureVimUndoBridge` makes for `u` and `:undo`, and for the
 * same reason: a facility that spans the styles has ONE owner, and the style's
 * own keys reach it. Before this, macros existed only in Vim because only Vim's
 * package shipped them — Emacs' `C-x (` did nothing at all — and building a
 * second implementation for the other two would have left the app with two
 * macro systems that behaved differently.
 *
 * ⚠ What the package's version had and this does not: replay of the SEARCH
 * QUERIES issued inside a macro. Ours re-runs the keystrokes of the search
 * instead, which is the same thing unless the query was typed with vim's own
 * history recall. Everything else — registers, counts, `@@` — is carried.
 *
 * The package's own mappings are DRAINED first (`unmap` removes one match and
 * reports whether it found any), or its `enterMacroRecordMode` would still be
 * sitting on `q` alongside ours.
 */
let macroBindingReport = { unmapped: 0, bound: false, error: '' };
let vimStopArmed = false;

/** `q` is a stop only while there is something to stop. */
function syncVimStopKey() {
  const want = isRecording();
  if (want === vimStopArmed) return;
  try {
    if (want) Vim.mapCommand(VIM_MACRO_KEYS.stop, 'action', 'belMacroStop', {}, { context: 'normal' });
    else while (unmap(VIM_MACRO_KEYS.stop, 'normal')) { /* drain */ }
    vimStopArmed = want;
  } catch (_) { /* leave it as it was rather than half-armed */ }
}

/** ⛔ A silent catch here is how a re-point "succeeds" while doing nothing. */
export function vimMacroBindingReport() {
  return { ...macroBindingReport };
}

function installMacroBindings() {
  let unmapped = 0;
  for (const keys of [VIM_MACRO_KEYS.record, VIM_MACRO_KEYS.replay]) {
    while (unmap(keys, undefined)) { unmapped += 1; }
  }
  macroBindingReport = { unmapped, bound: false, error: '' };
  try {
    Vim.defineAction('belMacroRecord', (cm, actionArgs) => {
      // Only ever STARTS: while recording, the armed bare `q` below wins,
      // because a full match beats a partial one in `matchCommand`.
      startRecording((actionArgs && actionArgs.selectedCharacter) || '');
      syncVimStopKey();
    });
    // ⛔ `q` alone ends a recording, and it has to be a REAL mapping.
    //
    // The package does this inside its own `handleKey` — a bare `q` while
    // `macroModeState.isRecording` exits macro mode before command matching
    // runs. Our engine never enters ITS macro mode, so that interception is
    // gone, and `q<register>` is only a partial match: pressing `q` just sat
    // there waiting for a register that would never come. Arming a full `q`
    // while recording restores vi's behaviour using the package's own
    // precedence, with no DOM interception to get wrong.
    //
    // `stopRecording(1)` because the recorder sits on capture and has already
    // seen this very `q`.
    Vim.defineAction('belMacroStop', () => {
      stopRecording(1);
      syncVimStopKey();
    });
    Vim.defineAction('belMacroReplay', (cm, actionArgs) => {
      const ed = global.CurrentEditor;
      const view = ed && typeof ed.getView === 'function' ? ed.getView() : null;
      if (!view) return;
      replayMacro(view, (actionArgs && actionArgs.selectedCharacter) || '',
        (actionArgs && actionArgs.repeat) || 1);
    });
    Vim.mapCommand(VIM_MACRO_KEYS.record, 'action', 'belMacroRecord', {}, { context: 'normal' });
    Vim.mapCommand(VIM_MACRO_KEYS.replay, 'action', 'belMacroReplay', {}, { context: 'normal' });
    macroBindingReport.bound = true;
    syncVimStopKey();
  } catch (e) {
    macroBindingReport.error = (e && e.message) || String(e);
  }
  return macroBindingReport.bound;
}

function installTextObjects() {
  try {
    Vim.defineMotion('belDeclObject', declObject);
    Vim.defineMotion('belCaseObject', caseObject);
  } catch (_) {
    return false;
  }
  for (const context of ['operatorPending', 'visual']) {
    try {
      Vim.mapCommand('ad', 'motion', 'belDeclObject', {}, { context });
      Vim.mapCommand('id', 'motion', 'belDeclObject', { textObjectInner: true }, { context });
      Vim.mapCommand('ac', 'motion', 'belCaseObject', {}, { context });
      Vim.mapCommand('ic', 'motion', 'belCaseObject', { textObjectInner: true }, { context });
    } catch (_) { /* a context the package refuses stays as it was */ }
  }
  return true;
}

/**
 * Every Vim yank reaches the system clipboard. This is deliberately
 * unconditional: a copy action must have one clipboard meaning in every style.
 *
 * `getRegisterController()` is a public, typed part of the package's API, so
 * this wraps a documented method rather than reaching into internals.
 */
let clipboardBridged = false;

export function installYankClipboard() {
  if (clipboardBridged) return false;
  let controller = null;
  try {
    controller = Vim.getRegisterController ? Vim.getRegisterController() : null;
  } catch (_) {
    return false;
  }
  if (!controller || typeof controller.pushText !== 'function') return false;
  clipboardBridged = true;
  const original = controller.pushText;
  controller.pushText = function beljarPushText(registerName, operator, text) {
    const out = original.apply(this, arguments);
    // Deletes fill the unnamed register too; mirroring those as well would let
    // `dd` quietly clobber whatever you had copied.
    if (operator === 'yank' && text) writeSystemClipboard(text);
    return out;
  };
  return true;
}

let installed = false;
/**
 * The leader and the escape sequence currently MAPPED, so a settings change can
 * take the old ones down.
 *
 * ⛔ These are not the stored preferences — they are what Vim is actually
 * holding. The two used to be assumed identical because `installVimBindings`
 * ran once and never again, which made the leader dropdown a lie: picking `,`
 * wrote the preference, changed the which-key hints to say `,f`, and left the
 * only working leader at `\` until the page was reloaded. Nothing on screen
 * said so.
 */
let mappedLeader = null;
let mappedEscape = null;

function unmap(keys, context) {
  try { return Vim.unmap(keys, context) === true; }
  catch (_) { return false; }
}

/**
 * How vim SPELLS a leader inside a key sequence.
 *
 * A literal space is `<Space>` in every vim keymap, so mapping `' f'` produced a
 * sequence no keypress could ever match. Every surface that shows or matches a
 * leader sequence goes through this.
 */
export function leaderKeys(leader) {
  return leader === ' ' ? '<Space>' : String(leader || DEFAULT_LEADER);
}

/** Readable form for a list — `<Space>f` is right for vim, wrong for a reader. */
export function leaderLabel(leader) {
  return leader === ' ' ? 'Space ' : String(leader || DEFAULT_LEADER);
}

/**
 * Leaders the vim package already owns, and how to give each one back.
 *
 * ⛔ A FULL match beats a PARTIAL one outright — `matchCommand` takes
 * `matches.full[0]` and never waits — so a leader that is itself a complete vim
 * command can never be a prefix: press it, vim runs it, and the second key
 * arrives to a cleared buffer. `,` is `repeatLastCharacterSearch` and `<Space>`
 * is `keyToKey`→`l`. Both were offered in the settings dropdown and NEITHER had
 * ever worked — not slowly, not after a reload, never.
 *
 * Real vim has the identical collision and resolves it the identical way: the
 * leader wins and the builtin is gone, which is why `,` and `<Space>` are the
 * two most common real-world leaders. So BelJar takes the key too — and puts it
 * back the moment the leader moves off it, which real vim cannot do.
 */
const LEADER_TAKES = {
  '<Space>': () => { Vim.map('<Space>', 'l'); },
  ',': () => {
    Vim.mapCommand(',', 'motion', 'repeatLastCharacterSearch', { forward: false }, {});
  },
};

/** Take the current leader map down and put `leader`'s up in its place. */
function applyLeader(leader) {
  const keys = leaderKeys(leader);
  if (keys === mappedLeader) return;
  if (mappedLeader != null) {
    for (const [tail] of LEADER_MAP) unmap(mappedLeader + tail, 'normal');
    // Hand the key back to vim if we had taken it.
    const restore = LEADER_TAKES[mappedLeader];
    if (restore) { try { restore(); } catch (_) { /* the package moved on */ } }
  }
  mappedLeader = keys;
  // ⛔ `undefined` context on purpose: a builtin carries no `context`, and
  // `unmap` matches on `command.context === ctx`. Passing 'normal' here silently
  // matched nothing, which is how this stayed broken while looking handled.
  // Drain rather than unmap once: `unmap` removes the FIRST match and returns
  // whether it found one, so a key with two entries would keep one alive.
  if (LEADER_TAKES[keys]) { while (unmap(keys, undefined)) { /* keep going */ } }
  for (const [tail, id] of LEADER_MAP) defineKey(keys + tail, id);
}

/** `jk` / `jj` out of Insert — the single most-asked-for vi convenience. */
function applyInsertEscape(seq) {
  const next = seq || null;
  if (next === mappedEscape) return;
  if (mappedEscape) unmap(mappedEscape, 'insert');
  mappedEscape = next;
  if (!next) return;
  try { Vim.map(next, '<Esc>', 'insert'); } catch (_) { /* bad sequence */ }
}

/**
 * Idempotent, and safe to call again when a preference changes.
 *
 * The one-time half (text objects, the clipboard bridge, the fixed Normal-mode
 * map, `:set`) installs once; the preference-driven half re-applies every call,
 * so the leader and the insert-escape sequence follow the settings panel
 * immediately rather than on the next reload.
 */
export function installVimBindings(options) {
  const leader = (options && options.leader) || DEFAULT_LEADER;
  const escapeSeq = (options && options.insertEscape) || '';

  if (!installed) {
    installed = true;
    installTextObjects();
    installMacroBindings();
    installYankClipboard();
    for (const [keys, id] of NORMAL_MAP) defineKey(keys, id);
    try {
      Vim.defineEx('set', 'se', (cm, params) => {
        // `cm` is threaded so a vim-owned option can be set on this editor.
        runSet(((params && params.args) || []).join(' '), cm);
      });
    } catch (_) { /* already defined */ }
  }

  applyLeader(leader);
  applyInsertEscape(escapeSeq);
  return true;
}

/** What is mapped right now, for tests and for the settings panel's own truth. */
/**
 * What is MAPPED right now, in vim's own spelling — not what is stored.
 *
 * The two can differ for exactly one tick, and telling them apart is the whole
 * reason the leader bug was invisible: the settings panel, which-key and the
 * macro list all read the stored value and agreed with each other while the
 * keymap held something else.
 */
export function activeVimOptions() {
  return { leader: mappedLeader, insertEscape: mappedEscape };
}

function defineKey(keys, id) {
  const name = 'belCmd_' + id.replace(/[^a-zA-Z0-9]/g, '_');
  try {
    Vim.defineAction(name, () => runId(id));
    Vim.mapCommand(keys, 'action', name, {}, { context: 'normal' });
  } catch (_) { /* a mapping Vim refuses stays Vim's */ }
}

/** Pure, for tests. */
export const _pure = { NORMAL_MAP, LEADER_MAP, LEADER_TAKES };
