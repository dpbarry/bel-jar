/**
 * Everything that makes Vim work in BelJar.
 *
 * The package gives us modes, motions, operators and `:`; this supplies what it
 * cannot know about — the guard that stops an unmatched key editing the document
 * in Normal mode, the caret chrome, the `:` seam into the status strip, which-key
 * over BelJar's own maps, and every command with an `ex` alias as a real `:` name.
 *
 * ⛔ The seam this rests on is `cm.state.statusbar`: it is just a DOM node, so the
 * package keeps its input, its focus and its ex parsing while the status strip
 * keeps the chrome. Do not replace Vim's `:` input — that is what makes
 * `:%s/a/b/g` work.
 */
import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { Vim, CodeMirror, getCM } from '@replit/codemirror-vim';
import { whichKeyHint, WHICH_KEY_MS } from './which-key-hint.mjs';
import { beljarUndo, beljarRedo } from './undo-route.mjs';

/**
 * Vim chrome. The caret is BelJar's ordinary one in every mode: the package's
 * block cursor is turned off here rather than styled, so Vim looks like the
 * rest of the editor instead of like a second editor.
 */
/**
 * In Normal and Visual mode, no key may edit the document.
 *
 * The vim package leaves an UNMATCHED key unhandled rather than swallowing it:
 * press `g`, then Backspace, and the key falls straight through to CodeMirror's
 * plain editing keymap and deletes a character while you are in Normal mode.
 *
 * Registered AFTER `vim()` in the same precedence block, so vim still gets first
 * refusal — this only ever sees keys vim itself declined.
 */
/**
 * `vim.status` as it was when the key ARRIVED.
 *
 * By the time a guard runs, vim has already handled the key and cleared its
 * pending sequence, so reading `status` there is a race — it reported "nothing
 * pending" on some runs and "pending" on others. This snapshot is taken by a
 * keydown handler registered ahead of vim, which never consumes anything.
 */
let pendingAtKeydown = '';

export function vimPendingSnapshot() {
  return EditorView.domEventHandlers({
    keydown(_event, view) {
      const cm = getCM(view);
      pendingAtKeydown = (cm && cm.state.vim && cm.state.vim.status) || '';
      return false;
    },
  });
}

export function vimEditGuard() {
  const commandMode = (view) => {
    const cm = getCM(view);
    return !!(cm && cm.state.vim && !cm.state.vim.insertMode);
  };
  // `<BS>` and `<CR>` are motions in Normal mode and never edit, so consuming
  // whatever vim declined is always right.
  const swallow = (view) => commandMode(view);
  // `<Del>` DOES edit in Normal mode — it is `x` — so it may only be swallowed
  // mid-sequence, where vim would have done nothing at all.
  const swallowPending = (view) => commandMode(view) && !!pendingAtKeydown;
  return keymap.of([
    { key: 'Backspace', run: swallow, shift: swallow },
    { key: 'Enter', run: swallow, shift: swallow },
    { key: 'Delete', run: swallowPending, shift: swallowPending },
  ]);
}

export function vimChromeTheme() {
  return Prec.highest(EditorView.theme({
    '.cm-vimCursorLayer': { display: 'none !important' },
    '.cm-fat-cursor': { display: 'none !important' },
    '.cm-vimMode .cm-cursorLayer:not(.cm-vimCursorLayer)': { display: 'block !important' },
    // Same rule as Emacs above: one caret, and it is the drawn one.
    '.cm-vimMode .cm-cursor, .cm-vimMode .cm-dropCursor': {
      borderLeftColor: 'var(--accent-high) !important',
    },
    '.cm-scroller:not(.cm-vimMode) .cm-cursor, .cm-scroller:not(.cm-vimMode) .cm-dropCursor': {
      borderLeftColor: 'var(--accent-high)',
    },
    // Package hides ::selection for block cursor; restore it for visual mode.
    '.cm-vimMode .cm-line ::selection, .cm-vimMode .cm-line::selection': {
      backgroundColor: 'color-mix(in srgb, var(--accent-high) 28%, transparent) !important',
    },
  }));
}

// ⛔ The vim package's own bottom PANEL is gone, not hidden. The status strip
// shows the mode full-width at the bottom of the window, and a second mode
// readout inside the editor was a relic — `probe.mjs` and `probe-keymap.mjs`
// both assert `.cm-vim-panel` count is ZERO, which is how the dead builder was
// found still sitting here. `vimModeLabel` lives in `status-strip-feed.mjs`,
// where the strip reads it.

/** Vim preferences, read once when the keymap is built. */


/**
 * Vim's pending key sequence and mode, for instruments.
 *
 * ⛔ A probe reading pending state off the STATUS STRIP measures the strip, not
 * the keymap — and the two are exactly what a keymap bug puts out of step. This
 * is the truthful read.
 */
export function vimStatus() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const view = g.CurrentEditor && g.CurrentEditor.getView ? g.CurrentEditor.getView() : null;
  const cm = view ? getCM(view) : null;
  return cm && cm.state.vim ? { status: cm.state.vim.status, insert: !!cm.state.vim.insertMode } : null;
}

export function vimOptions() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const p = g.Persist;
  const read = (name, fallback) => {
    try {
      return p && typeof p[name] === 'function' ? p[name]() : fallback;
    } catch (_) {
      return fallback;
    }
  };
  return {
    leader: read('readStoredVimLeader', String.fromCharCode(92)),
    insertEscape: read('readStoredVimInsertEscape', ''),
  };
}

function commandRegistryGlobal() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  return g.Commands && typeof g.Commands.list === 'function' ? g.Commands : null;
}

let exRegistered = false;

/**
 * Every BelJar command with an ex alias becomes a real `:` command, plus `:BJ`
 * as the catch-all so the other ~50 are reachable without inventing a name for
 * each. Vim keeps its own `:s`, `:g`, `:%s` — reimplementing those would be
 * worse than what the package already does.
 */
export function registerVimExCommands() {
  if (exRegistered) return false;
  const C = commandRegistryGlobal();
  if (!C) return false;
  exRegistered = true;
  for (const cmd of C.list({ cmdline: true })) {
    for (const name of cmd.ex || []) {
      try {
        Vim.defineEx(name, name, (cm, params) => {
          // Same context shape the status strip passes, `argText` included — a
          // command that takes an argument (`:e util.bel`, `:set ts=4`) reads
          // that one, and dropping it here made those silently argument-less.
          const args = (params && params.args) || [];
          C.run(cmd.id, {
            args,
            argText: args.join(' '),
            bang: !!(params && params.exclamationMark),
          });
        });
      } catch (_) { /* a name Vim already owns stays Vim's */ }
    }
  }
  try {
    Vim.defineEx('BJ', 'BJ', (cm, params) => {
      const args = (params && params.args) || [];
      const query = args.join(' ').trim();
      const all = C.list({ cmdline: true, runnable: true, available: true });
      const hit = all.find((c) => c.id === query)
        || all.find((c) => (c.ex || []).indexOf(query) >= 0)
        || all.find((c) => c.title.toLowerCase() === query.toLowerCase())
        || all.find((c) => c.title.toLowerCase().indexOf(query.toLowerCase()) >= 0);
      const g = typeof window !== 'undefined' ? window : globalThis;
      if (!hit) {
        if (g.StatusStrip && g.StatusStrip.setMessage) g.StatusStrip.setMessage(`No command matches "${query}".`);
        return;
      }
      if (!C.run(hit.id) && g.StatusStrip && g.StatusStrip.setMessage) {
        g.StatusStrip.setMessage(`"${hit.title}" is not available right now.`);
      }
    });
  } catch (_) { /* already defined */ }
  return true;
}

/**
 * Hand Vim's `:` and `/` inputs to the status strip. `cm.state.statusbar` is just
 * a DOM node, so the package keeps its input, focus and ex parsing while the
 * bar keeps the chrome — the seam this whole design rests on.
 */
export function attachVimStatusSlot(view) {
  const cm = getCM(view);
  if (!cm || cm.state.statusbar) return false;
  const g = typeof window !== 'undefined' ? window : globalThis;
  const B = g.StatusStrip;
  const slot = B && typeof B.vimSlot === 'function' ? B.vimSlot() : null;
  if (!slot) return false;
  cm.state.statusbar = slot;
  // A rebuilt editor starts with nothing pending; the previous instance may
  // have died mid-sequence with the bar still handed over to it.
  if (B.setVimLine) B.setVimLine(false);
  if (B.setEditorState) B.setEditorState({ pending: '' });
  // Which-key: after a pause on a prefix, say what the second key could be.
  // Delayed on purpose — someone typing `\h` fluently must never see it.
  let whichKeyTimer = 0;
  // So a message is announced once, not on every keypress that re-syncs.
  let lastVimMessage = '';
  // ⛔ The hint is STATE: it stays up for exactly as long as the prefix is
  // pending. `hold` stops the echo area fading it out from under someone who is
  // still reading it, and `clearWhichKey` takes it down the moment the sequence
  // resolves or is abandoned.
  let whichKeyShown = false;
  const clearWhichKey = () => {
    if (whichKeyTimer) clearTimeout(whichKeyTimer);
    whichKeyTimer = 0;
    if (!whichKeyShown) return;
    whichKeyShown = false;
    if (B.hideKeyHints) B.hideKeyHints();
  };
  const scheduleWhichKey = (pending) => {
    if (whichKeyTimer) clearTimeout(whichKeyTimer);
    whichKeyTimer = 0;
    if (!pending) { clearWhichKey(); return; }
    whichKeyTimer = setTimeout(() => {
      whichKeyTimer = 0;
      // Still the same pending sequence, still the editor's keyboard: anything
      // else and the hint would answer a question nobody is asking any more.
      if (((cm.state.vim && cm.state.vim.status) || '') !== pending) return;
      if (!view.hasFocus || cm.state.dialog) return;
      const rows = whichKeyHint(pending, vimOptions().leader);
      if (!rows.length || !B.showKeyHints) return;
      whichKeyShown = B.showKeyHints(rows);
    }, WHICH_KEY_MS);
  };

  const sync = () => {
    // ⛔ ONLY a real `:`/`/` input takes the strip over.
    //
    // `cm.state.dialog` is set for vim's MESSAGES too ("1 lines yanked",
    // "Pattern not found"), so keying off it hid every segment behind a red div
    // the moment you yanked. And pending keys used to take it as well, which
    // left a lone `g` sitting where the command line lives — it read as `:g`.
    const exField = slot.querySelector('input');
    const takeover = !!exField;
    if (B.setVimLine) B.setVimLine(takeover);

    const pending = (cm.state.vim && cm.state.vim.status) || '';
    // Pending keys only exist while the editor owns the keyboard. `vim.status`
    // outlives the sequence that set it, so trusting it alone left the strip
    // handed over to Vim whenever focus moved to the palette or a dialog.
    const live = !!pending && view.hasFocus && !takeover;
    if (B.setEditorState) B.setEditorState({ pending: live ? pending : '' });
    scheduleWhichKey(live ? pending : '');

    // Vim's own messages belong in the echo area with every other transient —
    // fading, right-aligned, moving nothing — not in a slot of their own.
    const msgEl = takeover ? null : slot.querySelector('.cm-vim-message');
    const text = msgEl ? (msgEl.textContent || '').trim() : '';
    if (text && text !== lastVimMessage && B.setMessage) B.setMessage(text);
    lastVimMessage = text;

    // Vim keeps its own `:` input — that seam is what makes `:%s/a/b/g` work —
    // so BelJar's suggestions are layered onto it rather than replacing it.
    if (exField && B.attachExCompletion) B.attachExCompletion(exField);
    else if (!exField && B.detachExCompletion) B.detachExCompletion();
  };
  CodeMirror.on(cm, 'dialog', sync);
  CodeMirror.on(cm, 'vim-keypress', sync);
  CodeMirror.on(cm, 'vim-mode-change', sync);
  // A finished command has no pending keys, whatever `vim.status` still holds.
  // Syncing this event off `status` like the others left the bar handed over to
  // Vim — segment row hidden — after every `:set` or operator.
  CodeMirror.on(cm, 'vim-command-done', () => {
    clearWhichKey();
    if (B.setVimLine) B.setVimLine(!!cm.state.dialog);
    if (B.setEditorState) B.setEditorState({ pending: '' });
  });
  if (cm.state.vimPlugin && cm.state.vimPlugin.updateStatus) cm.state.vimPlugin.updateStatus();
  return true;
}

/** One-shot: the CM5 shim only exists once the vim plugin has initialised. */
export function vimSlotAttacher() {
  let done = false;
  return EditorView.updateListener.of((update) => {
    if (done) return;
    if (attachVimStatusSlot(update.view)) done = true;
  });
}

/**
 * Re-apply the preference-driven half of the modal keymaps, live.
 *
 * Vim's maps are global to the package, not per-view, so changing the leader
 * needs no CodeMirror reconfigure — only a re-map. The style compartment is
 * rebuilt on a STYLE change and nothing else, so without this the leader
 * dropdown wrote a preference the keymap never read until the next reload.


/**
 * Vim's `u` and `C-r`, routed through BelJar's history.
 *
 * The package dispatches undo through its CM5 shim rather than through the
 * keymap, so this is the only place to intercept it.
 */
let vimBridged = false;

export function ensureVimUndoBridge() {
  if (vimBridged) return;
  vimBridged = true;
  CodeMirror.commands.undo = (cm) => { beljarUndo(cm.cm6); };
  CodeMirror.commands.redo = (cm) => { beljarRedo(cm.cm6); };
}
