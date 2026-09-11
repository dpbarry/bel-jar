/**
 * The status strip — full-width status strip across the bottom of the window.
 * Published as `window.StatusStrip`.
 *
 * Shell-owned, NOT a CodeMirror panel: the editor view is destroyed and rebuilt
 * on every document switch, so a CM panel would flicker on every tab click and
 * its DOM writes would join CM's measure cycle. As the last in-flow child of
 * <body> it outlives every editor instance, reserves its height exactly once,
 * and can report on the whole session — checker, Orca, problems — rather than
 * on one pane.
 *
 * Everything it shows is pushed to it — diagnostics ride the existing
 * `beljar:file-lint` event, cursor and mode come from the editor's own
 * update listener. The bar owns no analysis and never reads the document.
 */
import { buildSegments, isResting } from './status-strip-segments.mjs';
import {
  build as buildLine, openLine, openSearch, close as closeLine, isOpen as lineOpen,
  repeatLast, lastEntry, attachExCompletion, detachExCompletion,
  showKeyHints, hideKeyHints, forceList,
} from './status-strip-line-ui.mjs';
import {
  toggle as toggleHistory, close as closeHistory, refresh as refreshHistory,
  isOpen as historyOpen,
} from './status-strip-history-ui.mjs';

const global = globalThis;

let root = null;
let segmentHost = null;
let vimSlotEl = null;
let commandHost = null;
let messageTimer = 0;
let messageEl = null;
// Long enough to read a chord, short enough not to linger.
const MESSAGE_HOLD_MS = 3200;
const MESSAGE_FADE_MS = 200;
let mounted = false;
let frame = 0;
let inited = false;

// Everything the bar knows, written by the feeds and read only when painting.
const state = {
  style: 'default',
  mode: '',
  pending: '',
  mark: false,
  /** `{ recording, label, stop }` while a keyboard macro is being recorded. */
  macro: null,
  hasFile: false,
  line: NaN,
  col: NaN,
  selChars: 0,
  selLines: 0,
  errors: 0,
  warnings: 0,
  checking: false,
  parsePercent: NaN,
  /**
   * The caret is inside a hole. ⛔ SEPARATE from `goal`: a hole whose goal has
   * not been computed yet is still a hole, and folding the two into one string
   * is what made a fresh `?` look like ordinary code.
   */
  inHole: false,
  /** A goal may still arrive for the hole at the caret (the engine's own say). */
  goalPending: false,
  goal: '',
  holes: 0,
  symbols: NaN,
  orca: false,
  orcaDetail: '',
  undoDepth: 0,
  redoDepth: 0,
  historyOpen: false,
};

let detail = 'standard';
let rendered = '';

function persist() {
  return global.Persist || null;
}

export function storedMode() {
  const p = persist();
  try {
    const v = p && typeof p.readStoredStatusStrip === 'function' ? p.readStoredStatusStrip() : null;
    if (v === 'off' || v === 'compact' || v === 'standard' || v === 'detailed') return v;
  } catch (_) { /* fall through to the default */ }
  // On by default. A bar reporting the goal at the caret, the holes left and
  // what the checker is doing earns its row for every style — it is not a
  // modal-editing accessory, and a bar that shows almost nothing would be worse
  // than no bar at all.
  return 'standard';
}

// Full width, under everything: the bar reports on the whole session (checker,
// Orca, problems), not on one pane. It is the last child of <body>, which is a
// column flex, so its height is reserved once and nothing above it reflows.
function hostPane() {
  return document.body || null;
}

function ensureRoot() {
  if (root && root.isConnected) return root;
  const pane = hostPane();
  if (!pane) return null;
  root = document.createElement('div');
  root.className = 'jar-strip';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'off');
  segmentHost = document.createElement('div');
  segmentHost.className = 'jar-strip__segments';
  root.appendChild(segmentHost);
  // ⛔ The command line lives IN the row, in the command zone, not over it.
  // Opening `:` used to wipe the strip and show a bare prompt; the strip is the
  // strip, and typing a command is one more thing happening in it.
  commandHost = document.createElement('div');
  commandHost.className = 'jar-strip__command';
  vimSlotEl = document.createElement('div');
  vimSlotEl.className = 'jar-strip__vim';
  commandHost.appendChild(vimSlotEl);
  // commandHost joins the segment row on every paint; it is not a child of the
  // strip directly, so nothing here appends it.
  buildLine(commandHost, root);
  pane.appendChild(root);
  return root;
}

function ownStatusDot(owned) {
  const root_ = typeof document !== 'undefined' ? document.documentElement : null;
  if (root_) root_.classList.toggle('jar-strip-owns-status', !!owned);
}

function unmount() {
  closeLine({ restore: false });
  closeHistory();
  if (root && root.parentNode) root.parentNode.removeChild(root);
  root = null;
  segmentHost = null;
  commandHost = null;
  messageEl = null;
  mounted = false;
  rendered = '';
}

/**
 * One persistent `.ide-status-dot`, reused across repaints.
 *
 * It carries the topbar dot's class on purpose: `data-live-state` styling, the
 * conic checking shimmer, and the rich lint tooltip all come from the existing
 * rules, and `editor.mjs` drives EVERY `.ide-status-dot` on the page from one
 * place. Re-creating it per repaint would drop its state between settlement
 * ticks and kill the spinner mid-spin, so the node outlives the render.
 */
let dotEl = null;

function statusDot() {
  if (!dotEl) {
    dotEl = document.createElement('span');
    dotEl.className = 'ide-status-dot jar-strip__statusdot';
    dotEl.setAttribute('data-status-silent', '');
    dotEl.setAttribute('role', 'status');
  }
  return dotEl;
}

/**
 * A goal is a Beluga type, so it gets the same syntax colours the inspector,
 * hover and Harpoon give it — a flat accent colour throws away the structure
 * that makes a type readable at a glance.
 *
 * `normalizeType` runs here as well as in the editor's feed: the bar must not
 * depend on every future producer remembering, or Beluga's raw `|-` leaks
 * straight to the screen.
 */
function renderType(host, text) {
  const ed = global.BelEditor;
  const norm = ed && typeof ed.normalizeType === 'function'
    ? ed.normalizeType(text)
    : String(text == null ? '' : text);
  host.textContent = '';
  if (!norm) return;
  if (ed && typeof ed.renderTypeInto === 'function') {
    try {
      ed.renderTypeInto(host, norm, 'comp');
      // The same guard Harpoon keeps: if the renderer bails and echoes source,
      // at least show the normalized spelling rather than raw ASCII.
      if (host.textContent.indexOf('|-') < 0) return;
    } catch (_) { /* fall through to plain text */ }
  }
  host.textContent = norm;
}

/**
 * The strip's own glyphs, drawn rather than typed.
 *
 * ⛔ Not a font character. `⟲` renders at whatever weight and proportion the UI
 * font happens to give it — in Inter it arrives as a near-closed ring whose head
 * all but touches its tail, so the one deliberate feature of the shape reads as
 * a rendering fault. Drawn here it keeps the strip's stroke weight, inherits the
 * segment's colour through `currentColor`, and the gap is a decision.
 *
 * The undo arrow, on a 16 grid about (8,8) with r 5.3:
 *
 *   arc   302° counter-clockwise, from 190° round the bottom to 132°.
 *   head  a FILLED triangle whose base straddles the arc's end and whose tip
 *         carries on along the tangent.
 *
 * ⛔ The head is filled, not a stroked chevron. A chevron's trailing barb lies
 * along the arc it is attached to, so at 13px the two merge into one thick hook
 * and the arrow stops reading as an arrow. Filling it also keeps the visual gap
 * honest: the tip reaches ~155°, leaving a clean ~35° opening rather than the
 * hairline the glyph had.
 *
 * ⛔ Sized generously on purpose. A head scaled to "proportionate" against the
 * ring reads as a thickened tip at 13px, not as an arrowhead — the triangle has
 * to be big enough that its silhouette is legible on its own, before the ring
 * around it helps. It is built by scaling the base triangle 1.6× outward from
 * the arc's own end point, so the head still meets the ring at the same seam.
 */
const ICONS = {
  history: [
    { d: 'M2.78 8.92A5.3 5.3 0 1 0 4.45 4.06', stroke: true },
    { d: 'M1.36 6.84 2.85 2.28 6.05 5.84Z', fill: true },
  ],
};

function iconEl(name) {
  const parts = ICONS[name];
  if (!parts) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'jar-strip__icon');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const part of parts) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', part.d);
    p.setAttribute('fill', part.fill ? 'currentColor' : 'none');
    if (part.stroke) {
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '1.5');
      p.setAttribute('stroke-linecap', 'round');
    }
    svg.appendChild(p);
  }
  return svg;
}

function segmentEl(seg) {
  if (seg.spacer) {
    const gap = document.createElement('span');
    gap.className = 'jar-strip__spacer';
    return gap;
  }
  const el = document.createElement(seg.action ? 'button' : 'span');
  el.className = 'jar-strip__seg jar-strip__seg--' + seg.key
    + (seg.tone ? ' is-' + seg.tone : '')
    + (seg.mono ? ' is-mono' : '')
    + (seg.dot ? ' is-dot' : '')
    + (seg.grow ? ' is-grow' : '')
    + (seg.hint ? ' is-hint' : '');
  if (seg.action) {
    el.type = 'button';
    el.dataset.action = seg.action;
  }
  if (seg.title) {
    el.setAttribute('data-tooltip', seg.title);
    el.setAttribute('aria-label', seg.title);
    // ⛔ `bindTooltips()` sweeps `[data-tooltip]` ONCE at boot and is not
    // delegated. Every segment here is built after that sweep and rebuilt on
    // each repaint, so none of these tooltips had ever appeared — including the
    // goal's, which is the only place the untruncated type is shown, and the
    // checker's, which is the only place the problem count is spelled out.
    global.Tooltips?.bind?.(el);
  }
  if (seg.pressed != null) el.setAttribute('aria-expanded', seg.pressed ? 'true' : 'false');
  if (seg.pressed) el.classList.add('is-open');
  if (seg.dot) el.appendChild(statusDot());
  if (seg.icon) {
    const glyph = iconEl(seg.icon);
    if (glyph) el.appendChild(glyph);
  }
  if (seg.mark) {
    const mark = document.createElement('span');
    mark.className = 'jar-strip__mark';
    mark.textContent = seg.mark;
    el.appendChild(mark);
  }
  const label = document.createElement('span');
  label.className = 'jar-strip__label';
  if (seg.render === 'type') renderType(label, seg.text);
  else label.textContent = seg.text || '';
  el.appendChild(label);
  return el;
}

const ACTIONS = {
  'focus-editor': () => global.CurrentEditor?.focus?.(),
  'goto-line': () => global.CommandPalette?.open({ mode: 'line' }),
  'commands': () => global.CommandPalette?.open({ mode: 'commands' }),
  'next-problem': () => global.Commands?.run('nav.next-problem'),
  'run-default': () => global.Commands?.run('run.default') || global.Commands?.run('run.file'),
  'next-hole': () => global.Commands?.run('nav.next-hole'),
  'open-harpoon': () => global.Commands?.run('prover.open-in-harpoon')
    || global.Commands?.run('view.harpoon'),
  'run': () => global.Commands?.run('run.file'),
  'edit-history': () => openHistory(),
  /**
   * Stop the recording, then hand the keyboard straight back.
   *
   * ⛔ `dropTrailing: 0`. The number is how many KEYSTROKES asked for the stop,
   * because the recorder sits on capture and has already seen them — a click is
   * none, and the default of 1 would eat the last key of the macro.
   */
  'macro-stop': () => {
    global.Commands?.run('macro.record', { dropTrailing: 0 });
    global.CurrentEditor?.focus?.();
  },
};

function runAction(action) {
  const fn = ACTIONS[action];
  if (fn) fn();
}

/**
 * Open or close the history panel, and keep the segment's pressed state honest.
 *
 * The panel calls back on every change so the count in the strip and the rows in
 * the panel can never disagree — one stack, read in two places, never two
 * copies kept in step by hand.
 */
function openHistory() {
  toggleHistory(syncHistory);
  syncHistory();
}

function syncHistory() {
  const H = global.EditHistory;
  setEditorState({
    undoDepth: H && H.getUndoStack ? H.getUndoStack().length : 0,
    redoDepth: H && H.getRedoStack ? H.getRedoStack().length : 0,
    historyOpen: historyOpen(),
  });
}

function paint() {
  frame = 0;
  if (!mounted) return;
  const host = ensureRoot();
  if (!host) return;
  const segments = buildSegments(state, detail);
  // Cheap identity check: a repaint that would change nothing is skipped, so a
  // caret sweeping within one line never touches the DOM.
  // ⚠ The TITLE is part of the identity. A tooltip is content: REC's names the
  // key that ends the recording, and that sentence changes with the vim mode
  // while its chip reads `REC` throughout. Left out, the repaint that follows a
  // mode change kept the stale instruction.
  const signature = segments.map((s) => s.key + ':' + s.text + ':' + s.tone + ':' + (s.pressed ? '1' : '') + ':' + (s.title || '')).join('|');
  if (signature === rendered) return;
  rendered = signature;
  const els = segments.map(segmentEl);
  // ⛔ The command zone is the LAST thing in the left group — everything else
  // comes before it, always.
  //
  // It used to sit after the last of a NAMED list of left-hand facts, and a
  // segment outside that list therefore landed to its RIGHT. The line grows
  // (`flex: 1 1 auto`), so that segment was shoved to the far edge of the bar:
  // start a macro with no chord half-typed and REC — the one piece of state you
  // must not lose track of — flew across the window and docked next to the
  // checker. Anchoring to the spacer states the rule the eye already reads:
  // facts on the left, the line you are typing at the end of them.
  const spacerAt = segments.findIndex((seg) => seg.spacer);
  placeSegments(els, spacerAt < 0 ? els.length : spacerAt);
  // A repaint drops the message node, so put it back in the gap.
  placeMessage();
  host.classList.toggle('is-resting', isResting(segments));
  const modeSeg = segments.find((x) => x.key === 'mode');
  if (modeSeg) host.dataset.mode = modeSeg.tone;
  else delete host.dataset.mode;
}

function messageNode() {
  if (!messageEl) {
    messageEl = document.createElement('span');
    messageEl.className = 'jar-strip__message';
    messageEl.setAttribute('role', 'status');
    messageEl.setAttribute('aria-live', 'polite');
  }
  return messageEl;
}

/**
 * The message lives in the GAP — immediately after the spacer, i.e. leftmost of
 * the right-hand group. Appending it to the end of the bar instead pushed the
 * checker leftwards every time something spoke; here the spacer simply gives up
 * the width, so neither group moves and a message costs zero layout shift.
 */
/**
 * Rebuild the segment row AROUND the command host.
 *
 * ⛔ Never `replaceChildren` here. The command host holds the line's `<input>`,
 * and re-parenting a focused input fires `blur` — which closes the line. The
 * strip repaints on every caret move, so `:` would shut itself the moment you
 * moved. Segments are inserted before and after a host that never moves.
 */
function placeSegments(els, at) {
  if (commandHost.parentNode !== segmentHost) segmentHost.appendChild(commandHost);
  for (const node of Array.from(segmentHost.childNodes)) {
    if (node !== commandHost && node !== messageEl) segmentHost.removeChild(node);
  }
  for (let i = 0; i < at; i += 1) segmentHost.insertBefore(els[i], commandHost);
  for (let i = at; i < els.length; i += 1) segmentHost.appendChild(els[i]);
}

function placeMessage() {
  if (!segmentHost) return;
  const node = messageNode();
  const spacer = segmentHost.querySelector('.jar-strip__spacer');
  if (spacer) {
    if (node.previousSibling !== spacer) spacer.after(node);
  } else if (node.parentNode !== segmentHost) {
    segmentHost.appendChild(node);
  }
}

/**
 * Transient one-liner on the RIGHT of the bar — an echo area, not a takeover.
 * The segments keep saying where you are while it speaks, and it fades rather
 * than snapping, because something that appears and vanishes without motion
 * reads as a glitch.
 */
/**
 * The echo area.
 *
 * `opts.hold` keeps it up until something clears it. ⛔ Which-key is STATE, not a
 * transient: it answers "what can follow the key you are holding", and that
 * question is live for exactly as long as the prefix is pending. Fading it out
 * on a timer meant the answer vanished while you were still reading it and the
 * prefix was still waiting.
 */
function setMessage(text, opts) {
  const next = String(text || '');
  const node = messageNode();
  placeMessage();
  if (messageTimer) clearTimeout(messageTimer);
  messageTimer = 0;
  if (!next) {
    node.classList.remove('is-visible');
    // Let the fade finish before the text goes, or it blinks empty.
    messageTimer = setTimeout(() => { messageTimer = 0; node.textContent = ''; }, MESSAGE_FADE_MS);
    return;
  }
  node.textContent = next;
  // A frame between mount and class so the transition actually runs.
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => node.classList.add('is-visible'));
  else node.classList.add('is-visible');
  if (opts && opts.hold) return;
  messageTimer = setTimeout(() => { messageTimer = 0; setMessage(''); }, MESSAGE_HOLD_MS);
}

function openCommandLine(prefix, opts) {
  if (!mounted) {
    // The command line needs a bar to live in; give it one for this session.
    detail = 'standard';
    mounted = true;
    if (!ensureRoot()) { mounted = false; return false; }
    ownStatusDot(true);
    paint();
  }
  return openLine(prefix || '', () => { rendered = ''; paint(); }, opts);
}

function schedule() {
  if (!mounted || frame) return;
  frame = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(paint)
    : setTimeout(paint, 16);
}

/** Cursor, selection and editing mode, pushed by the editor's update listener. */
function setEditorState(next) {
  if (!next) return;
  let changed = false;
  // Leaving a keymap leaves its state behind with it: a half-typed chord and a
  // set mark both belong to the keymap that was active when they happened.
  if (next.style && next.style !== state.style) next = { ...next, pending: '', mark: false };
  // ⚠ An ALLOWLIST, and it fails silent: a field not named here is dropped
  // without a word, which is exactly what happened to `inHole` — the feed sent
  // it, the builder read it, and the bar never showed a goal. A new piece of
  // editor state has to be added in BOTH places, here and in `state` above.
  for (const key of ['style', 'mode', 'pending', 'mark', 'macro', 'hasFile', 'line', 'col', 'selChars', 'selLines',
    'inHole', 'goalPending', 'goal', 'holes', 'symbols', 'orca', 'orcaDetail', 'undoDepth', 'redoDepth', 'historyOpen']) {
    if (!(key in next) || state[key] === next[key]) continue;
    state[key] = next[key];
    changed = true;
  }
  if (changed) schedule();
}

function setDiagnostics(next) {
  if (!next) return;
  const errors = Number(next.errors) || 0;
  const warnings = Number(next.warnings) || 0;
  const checking = !!next.checking;
  const parsePercent = 'parsePercent' in next ? next.parsePercent : state.parsePercent;
  if (errors === state.errors && warnings === state.warnings && checking === state.checking
    && parsePercent === state.parsePercent) return;
  state.errors = errors;
  state.warnings = warnings;
  state.checking = checking;
  state.parsePercent = parsePercent;
  schedule();
}

/**
 * Goal under the caret — same cheap `holeAtCursor` path as the editor feed.
 * Duplicated here so the shell bar never imports the editor bundle.
 */
function goalAtCaret() {
  const ed = global.CurrentEditor;
  if (!ed || typeof ed.holeAtCursor !== 'function') return '';
  try {
    const hit = ed.holeAtCursor();
    const goal = hit && hit.hole ? hit.hole.goal : null;
    if (!goal) return '';
    const norm = global.BelEditor && typeof global.BelEditor.normalizeType === 'function'
      ? global.BelEditor.normalizeType(String(goal))
      : String(goal);
    return norm;
  } catch (_) {
    return '';
  }
}

/**
 * One-off read of the live editor so the bar is populated the moment it mounts,
 * rather than staying blank until the user happens to move the caret.
 */
function seedFromEditor() {
  const ed = global.CurrentEditor;
  const view = ed && typeof ed.getView === 'function' ? ed.getView() : null;
  if (!view) {
    setEditorState({ hasFile: false, line: NaN, col: NaN, selChars: 0, selLines: 0, goal: '' });
    return;
  }
  const sel = view.state.selection.main;
  const doc = view.state.doc;
  const head = doc.lineAt(sel.head);
  const selChars = Math.abs(sel.to - sel.from);
  const p = persist();
  setEditorState({
    style: p && typeof p.readStoredKeymapStyle === 'function' ? p.readStoredKeymapStyle() : 'default',
    hasFile: true,
    line: head.number,
    col: sel.head - head.from + 1,
    selChars,
    selLines: selChars ? doc.lineAt(sel.to).number - doc.lineAt(sel.from).number + 1 : 0,
    goal: goalAtCaret(),
  });
}

/**
 * Orca's search state, pushed by the Harpoon lab from `nativeAuto.phase` — its
 * own authority on whether a search is live. Never inferred from silence: a
 * search that goes quiet while still running would make the bar lie.
 */
function setOrca(running, detailText) {
  setEditorState({ orca: !!running, orcaDetail: running ? (detailText || '') : '' });
}

function apply() {
  const mode = storedMode();
  detail = mode === 'off' ? 'standard' : mode;
  if (mode === 'off') {
    unmount();
    ownStatusDot(false);
    return;
  }
  mounted = true;
  if (!ensureRoot()) {
    mounted = false;
    ownStatusDot(false);
    return;
  }
  // Exactly one status dot on screen: while the bar is up it owns it, so the
  // topbar keeps the Run button and nothing else.
  ownStatusDot(true);
  rendered = '';
  // Neither takeover is active on a fresh apply. Without this, a pending vim
  // sequence or an ex line interrupted by an editor rebuild leaves the segment
  // row display:none with nothing left to turn it back on.
  root.classList.remove('is-vim-line', 'is-line-open');
  root.dataset.detail = detail;
  seedFromEditor();
  refreshProofState();
  syncHistory();
  paint();
}

/**
 * Proof state. Read only on settlement ticks (`beljar:file-lint`,
 * `beljar:hole-goals-updated`), never on the typing path: `getIdeStatus` walks
 * diagnostics and the hole list is a store read.
 */
function refreshProofState() {
  const ed = global.CurrentEditor;
  if (!ed) {
    setEditorState({ holes: 0, symbols: NaN, goal: '', inHole: false, goalPending: false });
    return;
  }
  let holes = 0;
  let symbols = NaN;
  // ⛔ The goal is read HERE too, not only when the caret moves.
  //
  // This runs on `beljar:hole-goals-updated` — the moment the goals exist — and
  // it used to set holes and symbols while leaving `goal` alone. So a hole you
  // were already standing in when its goal arrived stayed blank until you moved
  // off it and back: the one case where the bar has something new to say was
  // the one case it stayed silent for.
  let goalState = { inHole: false, goal: '', goalPending: false };
  try {
    goalState = global.BelEditor?.goalAtCaret?.() || goalState;
  } catch (_) { /* leave it unknown rather than wrong */ }
  let checking = state.checking;
  let parsePercent = NaN;
  try {
    const eng = ed.getSemanticEngine?.();
    const list = eng && typeof eng.getHoles === 'function' ? eng.getHoles() : null;
    holes = list ? list.length : 0;
  } catch (_) { holes = 0; }
  try {
    const st = ed.getIdeStatus?.();
    if (st) {
      symbols = Number.isFinite(st.symbolCount) ? st.symbolCount : NaN;
      checking = !!st.belugaChecking || !(st.parse?.complete ?? true);
      parsePercent = st.parse && !st.parse.complete ? st.parse.percent : NaN;
    }
  } catch (_) { /* leave what we had */ }
  setEditorState({
    holes,
    symbols,
    goal: goalState.goal,
    inHole: goalState.inHole,
    goalPending: !!goalState.goalPending,
  });
  setDiagnostics({ errors: state.errors, warnings: state.warnings, checking, parsePercent });
}

function onLint(e) {
  const d = (e && e.detail) || {};
  setDiagnostics({ errors: d.errors, warnings: d.warnings, checking: state.checking });
  refreshProofState();
}

function onClick(e) {
  const btn = e.target && e.target.closest ? e.target.closest('.jar-strip__seg[data-action]') : null;
  if (!btn) return;
  e.preventDefault();
  runAction(btn.dataset.action);
}

function init() {
  if (inited || typeof document === 'undefined') return;
  inited = true;
  global.addEventListener('beljar:hole-goals-updated', refreshProofState);
  global.addEventListener('beljar:file-lint', onLint);
  global.addEventListener('beljar:keybindings-changed', apply);
  document.addEventListener('click', onClick, true);
  apply();
}

global.StatusStrip = {
  init,
  apply,
  setEditorState,
  setDiagnostics,
  storedMode,
  refreshProofState,
  /**
   * The node Vim's own `:` and `/` inputs are mounted into. We keep the chrome;
   * the package keeps its input, its focus handling and its ex parsing — which
   * is the whole point of Vim mode being Vim.
   */
  vimSlot: () => (ensureRoot() ? vimSlotEl : null),
  setVimLine: (on) => {
    if (!root) return;
    root.classList.toggle('is-vim-line', !!on);
  },
  setMessage,
  openCommandLine,
  openSearchLine: (forward) => {
    if (!mounted) { detail = storedMode() === 'off' ? 'standard' : storedMode(); mounted = true; if (!ensureRoot()) { mounted = false; return false; } ownStatusDot(true); paint(); }
    return openSearch(forward, () => { rendered = ''; paint(); });
  },
  isCommandLineOpen: lineOpen,
  repeatLastCommand: repeatLast,
  attachExCompletion,
  detachExCompletion,
  showKeyHints,
  hideKeyHints,
  forceList,
  lastCommandLine: lastEntry,
  closeCommandLine: closeLine,
  setOrca,
  /**
   * Pushed by `install-edit-history.mjs` whenever the stack moves. ⛔ The strip
   * never polls the history: a widget that counts something has to be told when
   * the count changes, or it shows a stale number until the caret happens to
   * move.
   */
  setHistoryDepth: (undoDepth, redoDepth) => {
    setEditorState({ undoDepth: undoDepth || 0, redoDepth: redoDepth || 0 });
    refreshHistory();
  },
  openHistory,
  closeHistory,
  isHistoryOpen: historyOpen,
  isMounted: () => mounted,
  element: () => root,
  _pure: { buildSegments, isResting },
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
