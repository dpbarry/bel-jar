/**
 * Double-tap a modifier to run a command — Shift Shift for "go to file", the
 * gesture people arrive from other IDEs expecting.
 *
 * The detection is the whole job. Naive versions fire while you are typing
 * capitals, or fire on a held key, or fire when you tap Shift either side of a
 * word. The rules that avoid all three:
 *
 *   · fire on the SECOND keyup of the trigger, never on keydown
 *   · only if no other key went down between the two taps
 *   · only if no other modifier was held
 *   · never on auto-repeat
 *   · never while an IME composition, a chord recorder, a modal dialog, or the
 *     command line owns the keyboard
 *
 * "No other key between" is what makes Shift-for-capitals safe: typing `A`
 * presses Shift, then `a`, which disqualifies the pair.
 *
 * Ordinary text fields are NOT blocked: the gesture is meant to work from the
 * editor and the REPL, which is the whole point. The settings search is covered
 * because it lives inside a modal dialog.
 */
const global = globalThis;

const TRIGGERS = {
  off: null,
  shift: { key: 'Shift', flag: 'shiftKey' },
  control: { key: 'Control', flag: 'ctrlKey' },
  alt: { key: 'Alt', flag: 'altKey' },
};

const SPEEDS = { fast: 250, normal: 350, relaxed: 500 };

let lastUpAt = 0;
let sawOtherKey = false;
let listening = false;

function persist() {
  return global.Persist || null;
}

function settings() {
  const p = persist();
  const read = (name, fallback) => {
    try {
      return p && typeof p[name] === 'function' ? p[name]() : fallback;
    } catch (_) {
      return fallback;
    }
  };
  return {
    trigger: read('readStoredDoubleTapTrigger', 'off'),
    target: read('readStoredDoubleTapCommand', 'tools.palette'),
    windowMs: SPEEDS[read('readStoredDoubleTapSpeed', 'normal')] || SPEEDS.normal,
  };
}

/** Pure: given the state at the second keyup, should the gesture fire? */
export function shouldFire(state) {
  const s = state || {};
  if (!s.trigger || s.trigger === 'off') return false;
  if (s.repeat) return false;
  if (s.otherKeySeen) return false;
  if (s.otherModifier) return false;
  if (!(s.gap > 0)) return false;
  return s.gap <= s.windowMs;
}

/**
 * Pure: which surface, if any, owns the keyboard right now. Separated from the
 * DOM so the list of blockers is testable rather than a claim in a comment.
 */
export function blockReason(state) {
  const s = state || {};
  if (s.composing) return 'composing';
  if (s.recordingChord) return 'chord-recorder';
  if (s.modalOpen) return 'modal';
  if (s.commandLineOpen) return 'command-line';
  return '';
}

function blocked(e) {
  const doc = typeof document !== 'undefined' ? document : null;
  const t = (e && e.target) || (doc ? doc.activeElement : null);
  const B = global.StatusStrip;
  return !!blockReason({
    composing: !!(e && (e.isComposing || e.keyCode === 229)),
    recordingChord: !!(t && t.classList
      && t.classList.contains('bj-kb__chord') && t.classList.contains('is-recording')),
    // A modal owns the screen; opening the palette behind or over it is wrong.
    // This also covers the settings search field, which lives inside one.
    modalOpen: !!(doc && doc.querySelector('dialog[open]')),
    commandLineOpen: !!(B && typeof B.isCommandLineOpen === 'function' && B.isCommandLineOpen()),
  });
}

function otherModifierHeld(e, flag) {
  const held = [];
  if (e.shiftKey) held.push('shiftKey');
  if (e.ctrlKey) held.push('ctrlKey');
  if (e.altKey) held.push('altKey');
  if (e.metaKey) held.push('metaKey');
  return held.some((f) => f !== flag);
}

function onKeyDown(e) {
  const cfg = settings();
  const trigger = TRIGGERS[cfg.trigger];
  if (!trigger || e.key !== trigger.key) {
    sawOtherKey = true;
    return;
  }
  if (e.repeat) sawOtherKey = true;
}

function onKeyUp(e) {
  const cfg = settings();
  const trigger = TRIGGERS[cfg.trigger];
  if (!trigger || e.key !== trigger.key) return;
  const now = Date.now();
  const fire = shouldFire({
    trigger: cfg.trigger,
    repeat: !!e.repeat,
    otherKeySeen: sawOtherKey,
    otherModifier: otherModifierHeld(e, trigger.flag),
    gap: lastUpAt ? now - lastUpAt : 0,
    windowMs: cfg.windowMs,
  });
  if (fire && !blocked(e)) {
    lastUpAt = 0;
    sawOtherKey = false;
    run(cfg.target);
    return;
  }
  lastUpAt = now;
  sawOtherKey = false;
}

/**
 * Commands whose whole behaviour is "open the palette". Double-tapping one of
 * these while the palette is already open is a toggle; double-tapping anything
 * else is not, and must still run.
 */
const PALETTE_OPENERS = new Set([
  'tools.palette', 'tools.commands', 'nav.anywhere', 'nav.symbol', 'edit.search-project',
]);

/** Pure: what the gesture should do given the target and the palette's state. */
export function resolveAction(id, paletteOpen) {
  if (!paletteOpen) return { close: false, run: id };
  // Toggling only makes sense when the thing you asked for is what is showing.
  if (PALETTE_OPENERS.has(id)) return { close: true, run: null };
  // Otherwise the palette is simply in the way.
  return { close: true, run: id };
}

function run(id) {
  const C = global.Commands;
  const P = global.CommandPalette;
  const paletteOpen = !!(P && typeof P.isOpen === 'function' && P.isOpen());
  const action = resolveAction(id, paletteOpen);
  if (action.close && P && typeof P.close === 'function') P.close();
  if (action.run && C && typeof C.run === 'function') C.run(action.run);
}

export function init() {
  if (listening || typeof global.addEventListener !== 'function') return false;
  listening = true;
  global.addEventListener('keydown', onKeyDown, true);
  global.addEventListener('keyup', onKeyUp, true);
  return true;
}

/**
 * What the settings picker offers as a gesture target.
 *
 * The persisted key accepts ANY command id; this is the shortlist, because a
 * dropdown of all 147 is a list, not a choice. Everything here is global-scope
 * and instant — a gesture that opens something is worth the muscle memory, a
 * gesture that edits text under a caret you were not looking at is not.
 * Editor-scope commands are excluded for the same reason: the gesture fires
 * from anywhere, including with no editor mounted, and `]h` / `]e` already
 * carry hole and problem navigation for people who want it on a key.
 * `tests/test-double-tap.mjs` checks every id against the catalogue.
 */
export const GESTURE_TARGETS = [
  'tools.palette',
  'tools.commands',
  'nav.anywhere',
  'nav.symbol',
  'edit.search-project',
  'cmdline.open',
  'run.default',
  'view.harpoon',
  'keys.macros',
];

/** Pure surface, for tests. */
export const _pure = {
  TRIGGERS, SPEEDS, shouldFire, blockReason, resolveAction, PALETTE_OPENERS, GESTURE_TARGETS,
};

global.DoubleTap = {
  init,
  shouldFire,
  targets: () => GESTURE_TARGETS.slice(),
  _pure: {
    TRIGGERS, SPEEDS, shouldFire, blockReason, resolveAction, PALETTE_OPENERS, GESTURE_TARGETS,
  },
};

if (typeof document !== 'undefined') init();
