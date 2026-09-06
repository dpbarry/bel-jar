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

/** ⛔ Derived, never retyped: the panel and this tooltip say the same thing. */
import { historySummary } from './status-strip-history.mjs';

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
  'keymap', 'position', 'mode', 'command', 'selection', 'goal', 'holes', 'problems',
  'orca', 'symbols', 'spacer', 'history', 'checker',
];

export const DETAIL_LEVELS = ['compact', 'standard', 'detailed'];

const PRESETS = {
  compact: ['keymap', 'position', 'mode', 'command', 'goal', 'holes', 'problems', 'orca', 'spacer', 'history', 'checker'],
  standard: ['keymap', 'position', 'mode', 'command', 'selection', 'goal', 'holes', 'problems', 'orca', 'spacer', 'history', 'checker'],
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

  /** The whole reason this bar exists: the goal under the caret, inline. */
  goal(s) {
    if (!s.goal) return null;
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
    const rest = s.goal ? n - 1 : n;
    return {
      key: 'holes',
      text: s.goal ? (rest > 0 ? '+' + rest + ' more' : 'last hole') : plural(n, 'hole', 'holes'),
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
   * How much history you are standing on, and the way into it.
   *
   * Earns its place the same way the rest do: how far back you can go is
   * visible nowhere else in BelJar, and neither is the fact that a redo branch
   * is waiting. It stays silent until there is something to say, so an untouched
   * file carries no widget at all.
   *
   * The count is the UNDO depth. A second number for redo would be two figures
   * with no way to tell which is which at 0.68rem — the branch is carried by a
   * tone change and spelled out in the tooltip and the panel instead.
   */
  history(s) {
    const undo = s.undoDepth || 0;
    const redo = s.redoDepth || 0;
    if (!undo && !redo) return null;
    return {
      key: 'history',
      text: String(undo),
      mark: '⟲',
      title: 'Edit history\n\n' + historySummary(undo, redo),
      tone: redo ? 'branched' : 'plain',
      action: 'edit-history',
      mono: true,
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
