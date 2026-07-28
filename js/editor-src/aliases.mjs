import { isolateHistory } from '@codemirror/commands';
import { Annotation, ChangeSet, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

const aliasTxn = Annotation.define();

export const DEFAULT_ALIAS_MAP = {
  '\\Leftrightarrow': '⇔',
  '\\rightarrow': '→',
  '\\Rightarrow': '⇒',
  '\\tailrightarrow': '↣',
  '\\twoheadrightarrow': '↠',
  '\\lambda': 'λ',
  '\\Lambda': 'Λ',
  '\\Gamma': 'Γ',
  '\\gamma': 'γ',
  '\\Delta': 'Δ',
  '\\delta': 'δ',
  '\\theta': 'θ',
  '\\Pi': 'Π',
  '\\pi': 'π',
  '\\Sigma': 'Σ',
  '\\sigma': 'σ',
  '\\tau': 'τ',
  '\\phi': 'φ',
  '\\psi': 'ψ',
  '\\omega': 'ω',
  '\\Omega': 'Ω',
  '\\forall': '∀',
  '\\exists': '∃',
  '\\land': '∧',
  '\\lor': '∨',
  '\\vee': '∨',
  '\\wedge': '∧',
  '\\lnot': '¬',
  '\\neg': '¬',
  '\\top': '⊤',
  '\\bot': '⊥',
  '\\implies': '⊃',
  '\\supset': '⊃',
  '\\subset': '⊂',
  '\\eqsubset': '⊆',
  '\\eqsupset': '⊇',
  '\\cup': '∪',
  '\\cap': '∩',
  '\\sqcup': '⊔',
  '\\sqcap': '⊓',
  '\\equiv': '≡',
  '\\neq': '≠',
  '\\leq': '≤',
  '\\geq': '≥',
  '\\prec': '≺',
  '\\succ': '≻',
  '\\eqprec': '≼',
  '\\eqsucc': '≽',
  '\\sim': '∼',
  '\\approx': '≈',
  '\\elem': '∈',
  '\\notin': '∉',
  '\\notelem': '∉',
  '\\cdot': '·',
  '\\times': '×',
  '\\pm': '±',
  '\\emptyset': '∅',
  '\\infty': '∞',
  '\\ldots': '…',
  '\\nabla': '∇',
  '\\partial': '∂',
  '\\prod': '∏',
  '\\sum': '∑',
  '\\mid': '∣',
  '\\parallel': '∥',
  '\\models': '⊨',
  '\\vdash': '⊢',
  '\\dashv': '⊣',
  '|-': '⊢',
  '->': '→',
  '=>': '⇒',
};

export const ALIAS_PAIRS = Object.entries(DEFAULT_ALIAS_MAP)
  .sort((a, b) => b[0].length - a[0].length || a[0].localeCompare(b[0]));

const GREEDY_BLOCKED_EVENTS = new Set(['input.alias', 'rename', 'format', 'undo', 'redo']);

let cachedPairs = null;
let cachedMaxLen = 0;

export function normalizeAliasPairs(raw) {
  const seen = new Set();
  const out = [];
  const list = Array.isArray(raw) ? raw : [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    let from = '';
    let to = '';
    if (Array.isArray(item)) {
      from = String(item[0] ?? '');
      to = String(item[1] ?? '');
    } else if (item && typeof item === 'object') {
      from = String(item.from ?? item.trigger ?? '');
      to = String(item.to ?? item.replacement ?? item.glyph ?? '');
    }
    from = from.trim();
    if (!from || to === '') continue;
    if (seen.has(from)) continue;
    seen.add(from);
    out.push([from, to]);
  }
  return out.sort((a, b) => b[0].length - a[0].length || a[0].localeCompare(b[0]));
}

export function defaultAliasPairs() {
  return ALIAS_PAIRS.slice();
}

export function invalidateAliasPairs() {
  cachedPairs = null;
  cachedMaxLen = 0;
}

function loadStoredPairs() {
  const persist = typeof globalThis !== 'undefined' ? globalThis.Persist : null;
  if (!persist || typeof persist.readStoredAliasPairs !== 'function') return null;
  try {
    return persist.readStoredAliasPairs();
  } catch (_) {
    return null;
  }
}

export function getAliasPairs() {
  if (cachedPairs) return cachedPairs;
  const stored = loadStoredPairs();
  cachedPairs = stored == null ? defaultAliasPairs() : normalizeAliasPairs(stored);
  cachedMaxLen = cachedPairs.length ? cachedPairs[0][0].length : 0;
  return cachedPairs;
}

function maxAliasLen() {
  getAliasPairs();
  return cachedMaxLen;
}

export function readAliasActivationMode() {
  const persist = typeof globalThis !== 'undefined' ? globalThis.Persist : null;
  if (persist && typeof persist.readStoredAliasActivation === 'function') {
    return persist.readStoredAliasActivation();
  }
  return 'strict';
}

export function expandBelAliases(text) {
  let out = String(text ?? '');
  for (const [seq, glyph] of getAliasPairs()) {
    if (!out.includes(seq)) continue;
    out = out.split(seq).join(glyph);
  }
  return out;
}

export function maybeExpandBelAliases(text) {
  return readAliasActivationMode() === 'greedy' ? expandBelAliases(text) : String(text ?? '');
}

function isStrictTypingInsert(tr, state) {
  if (tr.annotation(Transaction.userEvent) !== 'input.type') return false;
  const head = state.selection.main.head;
  let ok = false;
  tr.changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
    if (inserted.length !== 1 || toB !== head) return;
    ok = true;
  });
  return ok;
}

function aliasScanWindow(state, fromB, toB) {
  const maxLen = maxAliasLen() || 1;
  const from = Math.max(0, fromB - maxLen + 1);
  const lineEnd = state.doc.lineAt(toB).to;
  const to = Math.max(toB, Math.min(lineEnd, toB + maxLen - 1));
  return { from, to };
}

function isGreedyTrigger(tr) {
  const ue = tr.annotation(Transaction.userEvent);
  if (GREEDY_BLOCKED_EVENTS.has(ue)) return false;
  return true;
}

function mergeIntervals(ranges) {
  if (!ranges.length) return ranges;
  const sorted = ranges.slice().sort((a, b) => a.from - b.from);
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const prev = out[out.length - 1];
    if (cur.from <= prev.to) prev.to = Math.max(prev.to, cur.to);
    else out.push(cur);
  }
  return out;
}

function collectGreedyEdits(state, changes) {
  const windows = [];
  changes.iterChanges((_fromA, _toA, fromB, toB) => {
    windows.push(aliasScanWindow(state, fromB, toB));
  });
  const edits = [];
  for (const { from, to } of mergeIntervals(windows)) {
    const chunk = state.doc.sliceString(from, to);
    const expanded = expandBelAliases(chunk);
    if (expanded !== chunk) edits.push({ from, to, insert: expanded });
  }
  return edits;
}

function expandAtCursor(view, state) {
  const { head } = state.selection.main;
  const line = state.doc.lineAt(head);
  const before = state.doc.sliceString(line.from, head);

  for (const [seq, glyph] of getAliasPairs()) {
    if (!before.endsWith(seq)) continue;
    const from = head - seq.length;
    view.dispatch({
      changes: { from, to: head, insert: glyph },
      selection: { anchor: from + glyph.length },
      annotations: [aliasTxn.of(true), isolateHistory.of('full')],
      userEvent: 'input.alias',
    });
    return true;
  }
  return false;
}

function applyGreedyEdits(view, state, changes) {
  const edits = collectGreedyEdits(state, changes);
  if (!edits.length) return false;
  const head = state.selection.main.head;
  const mapped = ChangeSet.of(edits, state.doc.length).mapPos(head, 1);
  view.dispatch({
    changes: edits,
    selection: { anchor: mapped },
    annotations: [aliasTxn.of(true), isolateHistory.of('full')],
    userEvent: 'input.alias',
  });
  return true;
}

export function aliases() {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    const view = update.view;
    if (view.composing || update.state.readOnly) return;
    if (update.transactions.some((tr) => tr.annotation(aliasTxn))) return;

    const mode = readAliasActivationMode();
    if (mode === 'strict') {
      if (!update.transactions.some((tr) => isStrictTypingInsert(tr, update.state))) return;
      expandAtCursor(view, update.state);
      return;
    }

    if (!update.transactions.some(isGreedyTrigger)) return;
    applyGreedyEdits(view, update.state, update.changes);
  });
}

if (typeof globalThis !== 'undefined' && typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('beljar:settings-changed', (e) => {
    const key = e && e.detail ? e.detail.key : '';
    if (/^alias/.test(key) || key === 'aliases-reset') invalidateAliasPairs();
  });
}
