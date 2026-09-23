/**
 * What the editor status strip says, as data. Pure: no DOM, no globals.
 *
 * Design rule: **a bar that costs vertical space has to earn it.** So the test
 * for a segment is not "is this quiet" but "does this tell me something I cannot
 * already see". Filenames are in the tab strip and the explorer already shows
 * the tree, so neither is here. What is NOT visible anywhere else in BelJar —
 * and therefore is:
 *
 *   caret position · selection size · the GOAL at the caret · how many holes are
 *   left · problems in words · what the checker is doing · how big the file's
 *   symbol table is · whether Orca is searching
 *
 * The goal and hole count are the point. A proof assistant's status line should
 * answer "how far am I from done", and BelJar surfaces that nowhere else without
 * opening a panel.
 *
 * Verbosity is the user's call, not a hidden budget: Compact / Standard /
 * Detailed pick how much of the same model gets rendered.
 */

/** Left to right. `spacer` pushes everything after it to the right edge. */
/**
 * ⛔ The left group reads as four separate facts, in this order:
 *
 *   keymap    which keymap you are in — Standard, Vim, Emacs. Never changes
 *             under you, so it is plain text with no colour and no chip.
 *   position  where the caret is.
 *   mode      the mode WITHIN that keymap: Vim's NORMAL/INSERT/VISUAL, Emacs'
 *             MARK. Coloured, because it changes as you work.
 *   command   what you are part-way through typing — a half-finished chord, or
 *             the command line itself.
 *
 * They used to be one badge, which said `EMACS`, then `MARK` *instead of* it (as
 * though Mark were a rival keymap), then `EMACS C-x` (as though you had switched
 * to a keymap called "Emacs C-x"). Layers are not alternatives.
 */
export const SEGMENT_ORDER = [
  'keymap', 'position', 'mode', 'macro', 'command', 'selection', 'goal', 'holes', 'problems',
  'orca', 'symbols', 'spacer', 'tab', 'history', 'checker',
];

export const DETAIL_LEVELS = ['compact', 'standard', 'detailed'];

const PRESETS = {
  compact: ['keymap', 'position', 'mode', 'macro', 'command', 'goal', 'holes', 'problems', 'orca', 'spacer', 'tab', 'history', 'checker'],
  standard: ['keymap', 'position', 'mode', 'macro', 'command', 'selection', 'goal', 'holes', 'problems', 'orca', 'spacer', 'tab', 'history', 'checker'],
  detailed: SEGMENT_ORDER,
};

const GOAL_MAX = 52;

function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
}

function truncate(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function vimTone(mode) {
  const m = String(mode || '').toUpperCase();
  if (m.indexOf('INSERT') >= 0) return 'insert';
  if (m.indexOf('VISUAL') >= 0 || m.indexOf('V-') >= 0) return 'visual';
  if (m.indexOf('REPLACE') >= 0) return 'replace';
  return 'normal';
}

/**
 * Pure: how to end the recording that is running, in the style you are in.
 *
 * ⛔ The key is SENT by the engine (`s.macro.stop`), never worked out here —
 * see `macro-keys.mjs`. All this adds is the one thing the engine cannot know:
 * whether the key is reachable from the mode you are in right now. Vim's `q`
 * ends a recording in Normal mode and types the letter q anywhere else, so under
 * Insert or Visual the honest instruction has an Esc in front of it. Saying just
 * "press q" there is how a correct answer still gets someone stuck.
 */
function stopSentence(s) {
  const stop = (s.macro && s.macro.stop) || '';
  // ⛔ Standard ships no default chord, so with nothing bound there is no key to
  // name — and the click is not the only way out either. Saying so is the
  // difference between a state you can leave and one you are stuck in.
  if (!stop) return 'Click to stop, or run the command again.';
  const needsNormal = s.style === 'vim' && vimTone(s.mode) !== 'normal';
  return 'Press ' + (needsNormal ? 'Esc then ' : '') + stop + ' to stop, or click.';
}

const BUILDERS = {
  /**
   * Which keymap. Stable, so it carries no colour and no chip — and gated on a
   * file, because with no editor open there is no keymap to be in.
   */
  keymap(s) {
    if (!s.hasFile) return null;
    const name = s.style === 'vim' ? 'Vim' : (s.style === 'emacs' ? 'Emacs' : 'Standard');
    return { key: 'keymap', text: name, tone: 'plain', title: name + ' keymap' };
  },

  /** The mode WITHIN the keymap — only where there is one to be in. */
  mode(s) {
    if (s.style === 'vim') {
      const mode = s.mode || 'NORMAL';
      return { key: 'mode', text: mode, tone: vimTone(mode), title: 'Vim mode' };
    }
    // Emacs has one: the mark. Everything else is modeless, and inventing a
    // resting label for it would just repeat the keymap segment.
    if (s.style === 'emacs' && s.mark) {
      return { key: 'mode', text: 'MARK', tone: 'visual', title: 'The mark is set' };
    }
    return null;
  },

  /**
   * Recording a keyboard macro.
   *
   * ⛔ In EVERY preset, including compact. Recording is a mode you can forget
   * you are in — the one piece of state where being told costs a few pixels and
   * not being told costs you the macro. Vim names the register (`@a`); Emacs and
   * Standard have none to name, so it just says REC.
   */
  macro(s) {
    if (!s.macro || !s.macro.recording) return null;
    return {
      key: 'macro',
      text: s.macro.label ? 'REC ' + s.macro.label : 'REC',
      // ⚠ `error` for two weeks, and NOTHING WAS STYLED FOR IT: `is-error` has
      // rules under `--problems` and `--checker` only, so the one chip that must
      // not be missed rendered in the resting muted grey. A tone is a claim on a
      // stylesheet; naming one nobody honours is the same as naming none.
      tone: 'recording',
      title: 'Recording a keyboard macro. ' + stopSentence(s),
      mono: true,
      // ⛔ A way out that works from any mode. Vim's `q` is a NORMAL-mode key
      // and Emacs' `C-x )` is a chord a macro is busy swallowing; a chip that
      // reports a state you cannot leave is a trap, not a status.
      action: 'macro-stop',
    };
  },

  /** A half-typed chord. The command LINE mounts beside this, same zone. */
  command(s) {
    if (!s.pending) return null;
    return { key: 'command', text: s.pending, tone: 'pending', title: 'Waiting for the next key', mono: true };
  },

  position(s) {
    if (!s.hasFile || !Number.isFinite(s.line) || !Number.isFinite(s.col)) return null;
    return {
      key: 'position',
      text: s.line + ':' + s.col,
      title: 'Go to line',
      action: 'goto-line',
      mono: true,
    };
  },

  selection(s) {
    const chars = s.selChars || 0;
    if (chars <= 0) return null;
    const lines = s.selLines || 1;
    return {
      key: 'selection',
      text: lines > 1 ? plural(lines, 'line', 'lines') : plural(chars, 'char', 'chars'),
      title: plural(chars, 'character', 'characters') + ' selected',
    };
  },

  /**
   * The whole reason this bar exists: the goal under the caret, inline.
   *
   * ⛔ THREE states, not two. Being in a hole and knowing that hole's goal are
   * different facts (`inHole` / `goal`, split in `status-strip-feed.mjs`), and
   * folding them into one string meant a hole whose goal the checker had not
   * produced yet was reported as *no hole at all*: you stood on a fresh `?` and
   * the bar said nothing, with no way to say the honest thing.
   *
   *   not in a hole            → no chip
   *   in a hole, goal known    → the type, syntax-highlighted
   *   in a hole, goal not yet  → the same chip, holding a placeholder
   *
   * The placeholder keeps the hole wash and the turnstile so the chip does not
   * appear and jump when the real goal lands — only its text changes. It is NOT
   * a button: an action that cannot work yet is worse than no action.
   */
  goal(s) {
    if (!s.inHole) return null;
    if (!s.goal) {
      // ⛔ `Computing…` only while a goal may still ARRIVE, which is the engine's
      // settle state and not this bar's `checking` flag — see `goalMayStillArrive`
      // in `hole-goal-display.mjs`, which owns that vocabulary. Settled with no
      // goal is a real, reachable state (a hole inside a declaration that failed
      // to check never gets one) and a spinner that never resolves is a lie told
      // slowly.
      const busy = !!s.goalPending;
      return {
        key: 'goal',
        text: busy ? 'Computing…' : 'No goal',
        mark: '⊢',
        tone: 'pending',
        title: busy
          ? 'Working out this hole’s goal'
          : 'No goal for this hole. It is inside something that has not checked.',
        mono: true,
      };
    }
    return {
      key: 'goal',
      // The bare type, so it can be syntax-highlighted like everywhere else in
      // BelJar; the turnstile is a separate marker, not part of the type.
      text: truncate(s.goal, GOAL_MAX),
      mark: '⊢',
      render: 'type',
      title: 'Open in Harpoon\n\n' + s.goal,
      tone: 'goal',
      action: 'open-harpoon',
      mono: true,
      grow: true,
    };
  },

  holes(s) {
    const n = s.holes || 0;
    if (!n) return null;
    // Standing in one already? Then the goal segment is saying so; count the rest.
    // ⛔ Keyed on `inHole`, not on the goal TEXT. Standing in a hole whose goal
    // is still being computed is still standing in a hole — keyed on the text,
    // this said "2 holes" beside a chip reading `Computing…`, counting the very
    // hole the caret was in.
    const rest = s.inHole ? n - 1 : n;
    return {
      key: 'holes',
      text: s.inHole ? (rest > 0 ? '+' + rest + ' more' : 'last hole') : plural(n, 'hole', 'holes'),
      title: 'Go to the next hole',
      tone: 'holes',
      action: 'next-hole',
    };
  },

  problems(s) {
    const errors = s.errors || 0;
    const warnings = s.warnings || 0;
    if (errors + warnings <= 0) return null;
    const parts = [];
    if (errors) parts.push(errors + '×');
    if (warnings) parts.push(warnings + '⚠');
    return {
      key: 'problems',
      text: parts.join(' '),
      title: 'Go to the next problem',
      tone: errors ? 'error' : 'warning',
      action: 'next-problem',
      mono: true,
    };
  },

  /** Orca is a long search; while it runs, the bar is where you watch it. */
  orca(s) {
    if (!s.orca) return null;
    return {
      key: 'orca',
      text: s.orcaDetail ? 'Orca · ' + s.orcaDetail : 'Orca searching…',
      title: 'Open Harpoon',
      tone: 'busy',
      action: 'open-harpoon',
    };
  },

  symbols(s) {
    if (!Number.isFinite(s.symbols) || s.symbols <= 0) return null;
    return { key: 'symbols', text: plural(s.symbols, 'decl', 'decls'), title: s.symbols + ' declarations in this file' };
  },

  spacer() {
    return { key: 'spacer', spacer: true };
  },

  /**
   * A second tab has this project open. Standing condition, not an event —
   * leftmost of the right-hand group, before History, so it is the first thing
   * you read on that side. Not a notification: a notification can be cleared
   * while the other tab is still writing.
   */
  tab(s) {
    if (!s.tabConflict) return null;
    return {
      key: 'tab',
      text: 'Open in another tab',
      tone: 'warning',
      title: 'Both tabs save to the same files. The later save overwrites the other.',
    };
  },

  /**
   * The way into the edit-history panel.
   *
   * Silent until there is something to undo or redo, so an untouched file
   * carries no widget at all. A waiting redo branch is a tone change, spelled
   * out in the panel — not a second number beside the word.
   */
  history(s) {
    const undo = s.undoDepth || 0;
    const redo = s.redoDepth || 0;
    if (!undo && !redo) return null;
    return {
      key: 'history',
      text: 'History',
      // ⛔ `icon`, not `mark`. `.jar-strip__mark` is the goal segment's turnstile
      // and already carries the HOLES magenta — borrowing it painted the undo
      // arrow bright pink, which read as an error badge sitting next to the
      // checker. A widget that means something else gets its own mark.
      icon: 'history',
      title: 'Editor history',
      tone: redo ? 'branched' : 'plain',
      action: 'edit-history',
      pressed: !!s.historyOpen,
    };
  },

  /** Always speaks: silence about the checker reads as "is it even on?". */
  checker(s) {
    if (!s.hasFile) return null;
    const errors = s.errors || 0;
    const warnings = s.warnings || 0;
    let tone = 'checked';
    let text = 'Checked';
    if (s.checking) {
      tone = errors ? 'error-checking' : 'checking';
      text = Number.isFinite(s.parsePercent) && s.parsePercent < 100
        ? 'Parsing ' + s.parsePercent + '%'
        : 'Checking…';
    } else if (errors) {
      tone = 'error';
      text = plural(errors, 'error', 'errors');
    } else if (warnings) {
      tone = 'warning';
      text = plural(warnings, 'warning', 'warnings');
    }
    // Same split the topbar dot and the Run button make between them: when
    // something is wrong the status is a way to GET there; when it is clean it
    // is a way to run. `run.default` is the Run button's own resolution, so a
    // suite member runs the suite up to and including itself, not just the file.
    const broken = errors + warnings > 0;
    return {
      key: 'checker',
      text,
      title: broken ? 'Go to the next problem' : 'Run',
      tone,
      action: broken ? 'next-problem' : 'run-default',
      dot: true,
    };
  },

};

export function buildSegments(state, detail) {
  const s = state || {};
  const keys = PRESETS[detail] || PRESETS.standard;
  const out = [];
  for (const key of keys) {
    const seg = BUILDERS[key](s);
    if (seg) out.push(seg);
  }
  // A trailing spacer with nothing after it is just padding — drop it.
  while (out.length && out[out.length - 1].spacer) out.pop();
  return out;
}

/** True when nothing but chrome is showing — used only for tone, never to hide. */
export function isResting(segments) {
  return segments.filter((s) => !s.spacer).length <= 1;
}
