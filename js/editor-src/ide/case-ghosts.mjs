// case-ghosts.mjs — the missing cases of a proof, drawn where they belong.
//
// Inline only (Dean, 2026-10-03): each missing case is a faint arm in the proof itself,
// and its state and actions live on it. Silent by default (docs/UI.md §3):
//   - a FILLED case is drawn as the arm it would be, always;
//   - a case not filled (yet, or at all) is one faint line, and only while the caret
//     is inside that proof, where it is the place to force a search;
//   - a FORCED search shimmers; an automatic one draws nothing;
//   - no toasts for anything that went right.
//
// The ghosts read the case-fill store and nothing else. An edit inside a proof drops
// its ghosts at once and tells the scheduler; an accept is the ghost layer's own edit,
// marked so it is not mistaken for one.

import { StateField, StateEffect, Annotation, Prec } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, keymap } from '@codemirror/view';
import { splitArm } from '../prover/case-pieces.mjs';
import { keyOfPattern } from '../prover/case-fill.mjs';
import { STRENGTH } from '../prover/case-assignment.mjs';
import { proofsOfText } from '../prover/case-fill-scheduler.mjs';
import * as store from '../prover/case-fill-store.mjs';
import { createRecalcShimmer } from '../prover/hole-goal-pending-ui.mjs';
import { dispatchEdit } from '../edit-history.mjs';
import { vimAllowsRemap } from './modal/style-policy.mjs';
import { maybeExpandBelAliases } from '../aliases.mjs';

/** Marks an accept: the ghost layer's own edit, not an edit to the proof. */
export const caseAccept = Annotation.define();
const refreshGhosts = StateEffect.define();

// What the layer needs from the editor that hosts it; bound once by the mount.
let host = { fileId: () => null, scheduler: null };
export function bindCaseGhosts(h) { host = { ...host, ...h }; }

// The proofs of a document, parsed once per document: `Text` is immutable, so the
// commands' `when`, the field and the context menu share one read per edit.
const proofsMemo = new WeakMap();
function proofsOf(state) {
  let p = proofsMemo.get(state.doc);
  if (!p) { p = proofsOfText(state.doc.toString()); proofsMemo.set(state.doc, p); }
  return p;
}

// A filled arm arrives in ASCII (`|-`, `=>`); the file may read in glyphs. Shown and
// inserted in the file's own notation, so a ghost reads as the line it becomes and an
// accept leaves greedy alias expansion nothing to rewrite: a rewrite would be a second
// undo step, and an edit to the proof that drops the other ghosts.
const notation = (text) => maybeExpandBelAliases(text);

// The column of a proof's bars, as spaces.
function barIndent(state, p) {
  const line = state.doc.lineAt(p.arms[0].from);
  const bar = line.text.indexOf('|');
  return (bar >= 0 ? line.text.slice(0, bar) : line.text.match(/^\s*/)[0]).replace(/\S/g, ' ');
}

// The column the author's arms put their bodies at: the second line of the first arm that
// has one, else two in from the bars.
function bodyColumn(p, indent) {
  for (const a of p.arms) {
    const second = String(a.text).split('\n').slice(1).find((l) => l.trim());
    if (second) return second.match(/^[ \t]*/)[0];
  }
  return `${indent}  `;
}

/**
 * A filled arm as it will be written, and so as its ghost shows it: in the file's
 * notation, with its body moved AS A BLOCK to the author's column, its own nesting kept.
 * Orca lays its output out at columns of its own; an accepted arm should read like the
 * author's arms beside it. Nothing else re-indents it (see `acceptRows`).
 */
function asWritten(text, body) {
  const lines = notation(text).split('\n');
  const rest = lines.slice(1).filter((l) => l.trim());
  if (!rest.length) return lines.join('\n');
  const min = Math.min(...rest.map((l) => l.match(/^[ \t]*/)[0].length));
  return [lines[0], ...lines.slice(1).map((l) => (l.trim() ? body + l.slice(min) : ''))].join('\n');
}

const keyOfArm = (arm) => { const sp = splitArm(arm.text); return sp ? keyOfPattern(sp.pattern) : null; };
const g = () => (typeof window !== 'undefined' ? window : globalThis);

// The words a row says on hover. House voice: sentence case, terse, no em dashes.
function rowTip(entry, row) {
  const lines = [];
  if (row.state === 'filled') {
    lines.push(row.source === 'lookup' && row.donor ? `Filled from ${row.donor}` : 'Found by Orca');
    const strength = entry.eligibility && entry.eligibility.strength;
    if (strength && strength.key !== STRENGTH.total.key) lines.push(strength.label);
    if (entry.eligibility && entry.eligibility.specification === 'data') {
      lines.push('A function: checked, not necessarily the case you meant');
    }
  } else if (row.state === 'searching') {
    lines.push('Searching');
  } else if (row.state === 'none') {
    lines.push('No case found. Click to search longer');
  } else {
    lines.push('Not filled yet. Click to search now');
  }
  return lines.join('\n');
}

// The row is a full-width block, so a tip anchored to it opens at the far side of
// the editor. This mark is a point the tip sits to the left of. When that point
// is too close to the window edge for the tip to fit, it slides right until the
// tip can stay on screen and still point at the case.
function ghostTipAnchor(line, mark) {
  const root = document.querySelector('.tooltip-root');
  const tw = root && root.offsetWidth ? root.offsetWidth : 0;
  const row = line.getBoundingClientRect();
  const minLeft = 8 + 8 + tw;
  mark.style.left = `${Math.max(0, minLeft - row.left)}px`;
  return mark;
}

class GhostWidget extends WidgetType {
  constructor(recKey, rows, indent, sig) {
    super();
    this.recKey = recKey; this.rows = rows; this.indent = indent; this.sig = sig;
  }
  eq(other) { return other.sig === this.sig; }
  toDOM(view) {
    const box = document.createElement('div');
    box.className = 'cm-case-ghost';
    box.setAttribute('aria-hidden', 'true');
    const entry = store.entry(host.fileId(), this.recKey);
    for (const row of this.rows) {
      const line = document.createElement('div');
      line.className = 'cm-case-ghost__row';
      line.dataset.state = row.state;
      line.dataset.key = row.key;
      // A filled row's text is already as it will be written (`asWritten`).
      const text = row.state === 'filled'
        ? `${this.indent}| ${row.text}`
        : `${this.indent}| ${notation(`${row.pattern} =>`)} …`;
      const mark = document.createElement('span');
      mark.className = 'cm-case-ghost__tip-anchor';
      line.appendChild(mark);
      if (row.state === 'searching') {
        line.appendChild(document.createTextNode(`${this.indent}| ${notation(`${row.pattern} =>`)} `));
        line.appendChild(createRecalcShimmer('Searching'));
      } else {
        line.appendChild(document.createTextNode(text));
      }
      const tip = rowTip(entry || {}, row);
      const tips = g().Tooltips;
      if (tips && typeof tips.set === 'function') {
        tips.set(line, tip);
        if (typeof tips.setRectEl === 'function') tips.setRectEl(line, () => ghostTipAnchor(line, mark));
        line.setAttribute('data-tooltip-placement', 'left');
      } else {
        line.setAttribute('data-tooltip', tip);
        line.setAttribute('data-tooltip-placement', 'left');
      }
      line.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        if (row.state === 'filled') acceptRows(view, this.recKey, [row.key]);
        else if (row.state !== 'searching') forceRow(view, this.recKey, row.key);
      });
      box.appendChild(line);
    }
    return box;
  }
  ignoreEvent() { return true; }
}

// ── what is drawn ────────────────────────────────────────────────────────────
// The field holds the decorations and, per proof with ghosts, its range: an edit is
// tested against those ranges without reparsing the document on every keystroke.
function computeGhosts(state) {
  const fileId = host.fileId();
  const entries = fileId != null ? store.entries(fileId) : [];
  if (!entries.length) return { deco: Decoration.none, proofs: [], hangs: [] };
  const proofs = proofsOf(state);
  const caret = state.selection.main.head;
  const widgets = [];
  const ranges = [];
  const hangs = [];
  for (const entry of entries) {
    const p = proofs.find((x) => x.recKey === entry.recKey);
    if (!p || p.fingerprint !== entry.fingerprint || !p.arms.length) continue;
    ranges.push({ recKey: entry.recKey, from: p.from, to: p.to });
    const caretIn = caret >= p.from && caret <= p.to;
    const visible = [...entry.rows.values()].filter((r) => {
      if (r.state === 'dismissed') return false;
      if (r.state === 'filled') return true;
      if (r.state === 'searching') return r.forced;
      return caretIn || r.forced;
    });
    if (!visible.length) continue;
    const firstBarLine = barIndent(state, p);
    const body = bodyColumn(p, firstBarLine);
    // Group rows by where they go: before their anchor arm's line, or after the last arm.
    const groups = new Map();
    for (const shown of visible) {
      const row = shown.state === 'filled' ? { ...shown, text: asWritten(shown.text, body) } : shown;
      const anchor = row.anchor ? p.arms.find((a) => keyOfArm(a) === row.anchor) : null;
      const at = anchor ? state.doc.lineAt(anchor.from).from : state.doc.lineAt(p.arms[p.arms.length - 1].to).to;
      const side = anchor ? -1 : 1;
      const k = `${at}:${side}`;
      if (!groups.has(k)) groups.set(k, { at, side, rows: [] });
      groups.get(k).rows.push(row);
    }
    for (const grp of groups.values()) {
      const sig = JSON.stringify(grp.rows.map((r) => [r.key, r.state, r.text]));
      widgets.push(Decoration.widget({
        widget: new GhostWidget(entry.recKey, grp.rows, firstBarLine, sig),
        block: true,
        side: grp.side,
      }).range(grp.at));
      // The line a ghost hangs from (Tab there accepts it), held as a position so an
      // edit elsewhere maps it: the end of the line above the anchor arm, or the last arm's.
      const hangPos = grp.side < 0 ? Math.max(0, grp.at - 1) : grp.at;
      for (const row of grp.rows) {
        hangs.push({ recKey: entry.recKey, key: row.key, pos: hangPos, filled: row.state === 'filled' });
      }
    }
  }
  widgets.sort((a, b) => a.from - b.from);
  return { deco: Decoration.set(widgets, true), proofs: ranges, hangs };
}

const ghostField = StateField.define({
  create: (state) => computeGhosts(state),
  update(value, tr) {
    if (tr.effects.some((e) => e.is(refreshGhosts))) return computeGhosts(tr.state);
    if (tr.docChanged) {
      if (!value.proofs.length) return value;
      if (tr.annotation(caseAccept)) return computeGhosts(tr.state);
      const touched = value.proofs.filter((p) => tr.changes.touchesRange(p.from, p.to));
      if (touched.length) {
        // The proof changed under its ghosts: they go now, and so does its job. The
        // store is told after this update finishes (no dispatch inside an update).
        const fileId = host.fileId();
        queueMicrotask(() => { for (const p of touched) host.scheduler?.proofTouched(fileId, p.recKey); });
      }
      const keep = (from) => !touched.some((p) => from >= p.from && from <= p.to);
      const proofs = value.proofs
        .filter((p) => !touched.includes(p))
        .map((p) => ({ ...p, from: tr.changes.mapPos(p.from, -1), to: tr.changes.mapPos(p.to, 1) }));
      const deco = value.deco.update({ filter: (from) => keep(from) }).map(tr.changes);
      const hangs = value.hangs
        .filter((h) => !touched.some((p) => p.recKey === h.recKey))
        .map((h) => ({ ...h, pos: tr.changes.mapPos(h.pos, -1) }));
      return { deco, proofs, hangs };
    }
    if (tr.selection) {
      // Entering or leaving a proof shows or hides its unfilled rows.
      const was = tr.startState.selection.main.head;
      const now = tr.state.selection.main.head;
      const inside = (pos) => value.proofs.findIndex((p) => pos >= p.from && pos <= p.to);
      if (inside(was) !== inside(now)) return computeGhosts(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});

// ── accept, force, dismiss ───────────────────────────────────────────────────
function liveProof(state, recKey) {
  return proofsOf(state).find((p) => p.recKey === recKey) || null;
}

/**
 * Put filled rows into the document as ONE undo step. Positions are found again in the
 * live document (an anchor arm by its key, else after the last arm), and the result is
 * parsed before anything is dispatched: it must have exactly one more arm per row.
 */
export function acceptRows(view, recKey, keys) {
  const fileId = host.fileId();
  const entry = store.entry(fileId, recKey);
  const p = liveProof(view.state, recKey);
  if (!entry || !p || p.fingerprint !== entry.fingerprint) return false;
  const doc = view.state.doc;
  const indent = barIndent(view.state, p);
  const body = bodyColumn(p, indent);
  const rows = keys.map((k) => entry.rows.get(k)).filter((r) => r && r.state === 'filled')
    .map((r) => ({ ...r, text: asWritten(r.text, body) }));
  if (!rows.length) return false;
  const last = p.arms[p.arms.length - 1];
  const inserts = new Map();
  for (const row of rows) {
    const anchor = row.anchor ? p.arms.find((a) => keyOfArm(a) === row.anchor) : null;
    let at; let text;
    if (anchor) {
      let i = anchor.from - 1;
      const s = doc.toString();
      while (i >= 0 && /\s/.test(s[i])) i -= 1;
      at = s[i] === '|' ? i : anchor.from;
      text = s[i] === '|' ? `| ${row.text}\n${indent}` : `${row.text}\n${indent}| `;
    } else {
      at = last.to;
      text = `\n${indent}| ${row.text}`;
    }
    inserts.set(at, (inserts.get(at) || '') + text);
  }
  const changes = [...inserts].sort((a, b) => a[0] - b[0]).map(([from, insert]) => ({ from, insert }));
  // Parse the result before touching the document.
  let after = doc.toString();
  for (const c of [...changes].reverse()) after = after.slice(0, c.from) + c.insert + after.slice(c.from);
  const proofAfter = proofsOfText(after).find((x) => x.recKey === recKey);
  const armsOk = proofAfter && proofAfter.arms.length === p.arms.length + rows.length
    && rows.every((r) => proofAfter.arms.some((a) => a.text.replace(/\s+/g, ' ') === r.text.replace(/\s+/g, ' ')));
  if (!armsOk) {
    const T = g().Toasts;
    if (T && T.error) T.error('Couldn’t place the filled case here');
    return true; // ran and declined
  }
  // ⛔ Written exactly as the ghost shows it, and nothing else touched. The arm's text is
  // already in the proof's columns (a lookup copies an authored arm; a parked hole sits at
  // the proof's indent). Running the language's indenter over it pushed the new arm in
  // and re-indented the author's last line above it, outside the arm and outside undo.
  dispatchEdit(view, {
    changes,
    annotations: [caseAccept.of(true)],
    userEvent: 'input.complete',
  }, { fileId, kind: 'case-arm' });
  const now = liveProof(view.state, recKey);
  store.acceptRows(fileId, recKey, rows.map((r) => r.key), now ? now.fingerprint : null);
  return true;
}

function forceRow(view, recKey, key) {
  const p = liveProof(view.state, recKey);
  if (!p || !host.scheduler) return false;
  return host.scheduler.force(p.from, key ? [key] : null);
}

/** The rows whose ghosts hang from the line of `pos`. */
function hangsAt(state, pos) {
  const v = state.field(ghostField, false);
  if (!v) return [];
  const line = state.doc.lineAt(pos).number;
  return v.hangs.filter((h) => state.doc.lineAt(h.pos).number === line);
}

/** The filled row whose ghost hangs from the line of `pos` (the caret's), if any. */
function rowAtCaret(state, pos = state.selection.main.head) {
  return hangsAt(state, pos).find((h) => h.filled) || null;
}

/** The proof under `pos` with its entry, when case completion knows it. */
function proofAt(state, pos) {
  const p = proofsOf(state).find((x) => x.outerCase && pos >= x.from && pos <= x.to);
  if (!p) return null;
  const entry = store.entry(host.fileId(), p.recKey);
  return { proof: p, entry: entry && entry.fingerprint === p.fingerprint ? entry : null };
}

const filledKeys = (entry) => (entry ? [...entry.rows.values()].filter((r) => r.state === 'filled').map((r) => r.key) : []);

/** Editor API: accept the ghost on the caret's line, else every filled one of the proof. */
export function acceptFilledCase(view, pos = view.state.selection.main.head) {
  const at = rowAtCaret(view.state, pos);
  if (at) return acceptRows(view, at.recKey, [at.key]);
  const hit = proofAt(view.state, pos);
  if (!hit || !filledKeys(hit.entry).length) return false;
  return acceptRows(view, hit.proof.recKey, filledKeys(hit.entry));
}

/** Editor API: search now, with the forced budget, for the row on the caret's line or the whole proof. */
export function fillCaseNow(view, pos = view.state.selection.main.head) {
  const hit = proofAt(view.state, pos);
  if (!hit || !host.scheduler) return false;
  // The unfilled rows hanging from that line, else every row of the proof.
  const keys = hangsAt(view.state, pos).filter((h) => !h.filled && h.recKey === hit.proof.recKey).map((h) => h.key);
  return host.scheduler.force(hit.proof.from, keys.length ? keys : null);
}

/** Editor API: hide the ghost on the caret's line, else every filled one of the proof. */
export function dismissFilledCase(view, pos = view.state.selection.main.head) {
  const at = rowAtCaret(view.state, pos);
  const fileId = host.fileId();
  if (at) return store.dismiss(fileId, at.recKey, at.key);
  const hit = proofAt(view.state, pos);
  const keys = filledKeys(hit && hit.entry);
  if (!keys.length) return false;
  for (const k of keys) store.dismiss(fileId, hit.proof.recKey, k);
  return true;
}

/** For `when`: is there something for each command to act on at `pos`? */
export function caseCommandState(state, pos = state.selection.main.head) {
  const hit = proofAt(state, pos);
  return {
    inProof: !!hit,
    hasFilled: !!(hit && filledKeys(hit.entry).length) || !!rowAtCaret(state, pos),
  };
}

// Tab accepts a filled ghost hanging from the caret's line, with the caret at the end
// of that line and nothing selected: the inline-suggestion convention. Anything else
// falls through to indentation. Under Vim, only in Insert mode.
function tabAccept(view) {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  if (sel.head !== view.state.doc.lineAt(sel.head).to) return false;
  if (!vimAllowsRemap(view, '')) return false;
  const at = rowAtCaret(view.state);
  if (!at) return false;
  return acceptRows(view, at.recKey, [at.key]);
}

/** The extension: the field and the Tab key. The store drives refreshes from outside. */
export function caseGhosts() {
  return [
    ghostField,
    Prec.high(keymap.of([{ key: 'Tab', run: tabAccept }])),
  ];
}

/**
 * The case-completion worker's URL: beside the editor bundle, the way the moves worker
 * finds its own (prover-moves-async.mjs), so a deployed site and a local one both work.
 */
export function caseFillWorkerUrl() {
  if (typeof document === 'undefined') return '';
  for (const s of document.getElementsByTagName('script')) {
    const src = s.src || '';
    if (/editor-cm\.bundle\.js/.test(src)) return src.replace(/editor-cm\.bundle\.js[^/]*$/, 'case-fill.worker.js');
  }
  return new URL('js/case-fill.worker.js', document.baseURI).href;
}

// Why a forced fill found nothing, in the person's words.
const DECLINE_WHY = {
  'no-move': 'Orca found no next step',
  cancelled: 'The search ran out of time',
  'time-budget': 'The search ran out of time',
  'step-bound': 'The search ran out of steps',
  'search-bound': 'The search ran out of room',
  'cases-not-built': 'Couldn’t build the missing cases of this proof',
  'some-cases-not-built': 'Couldn’t build every missing case of this proof',
  'checker-unavailable': 'The checker isn’t available',
  'proof-not-found': 'The proof changed while it was being searched',
};

/**
 * A FORCED fill came back empty: the person asked, so they hear back (beljar-architecture
 * cascade step 3, the hole actions' decline). Automatic misses never come here.
 */
export function declineCaseFill({ rule, why }) {
  const reason = DECLINE_WHY[why] || 'No case found';
  const title = rule ? `No case found for ${rule}` : 'No case found';
  const T = g().Toasts;
  if (T && typeof T.error === 'function') T.error(`${title}. ${reason}`);
  const N = g().Notifications;
  if (N && typeof N.teaching === 'function') N.teaching({ title, body: reason, source: 'prover' });
}

/** Redraw from the store (the store changed). Safe to call at any time. */
export function refreshCaseGhosts(view) {
  if (!view || !view.dom || !view.dom.isConnected) return;
  queueMicrotask(() => { if (view.dom.isConnected) view.dispatch({ effects: refreshGhosts.of(null) }); });
}

/** For tests: the field and its refresh, to drive the layer from a bare EditorState. */
export const _forTests = { ghostField, refreshGhosts };
