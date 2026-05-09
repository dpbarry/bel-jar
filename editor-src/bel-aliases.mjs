import { isolateHistory } from '@codemirror/commands';
import { Annotation, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/** Marks alias replacements so we do not recurse or merge oddly with upstream listeners. */
const belAliasTxn = Annotation.define();

/** Ascii / LaTeX-style triggers → Unicode accepted by beluga.grammar (tokens + unicodeIdent). */
const ALIAS_PAIRS = Object.entries({
  '\\Leftrightarrow': '⇔',
  '\\rightarrow': '→',
  '\\Rightarrow': '⇒',
  '\\rightarrowtail': '↣',
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
  '\\subseteq': '⊆',
  '\\supseteq': '⊇',
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
  '\\preceq': '≼',
  '\\succeq': '≽',
  '\\sim': '∼',
  '\\approx': '≈',
  '\\in': '∈',
  '\\notin': '∉',
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
  '\\to': '→',
  '\\mid': '∣',
  '\\parallel': '∥',
  '\\models': '⊨',
  '\\vdash': '⊢',
  '\\dashv': '⊣',
  '|-': '⊢',
  '->': '→',
}).sort((a, b) => b[0].length - a[0].length);

function shouldExpandUserEvent(tr) {
  return tr.annotation(Transaction.userEvent) === 'input.type';
}

export function belAliases() {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    const view = update.view;
    if (view.composing || update.state.readOnly) return;
    if (update.transactions.some((tr) => tr.annotation(belAliasTxn))) return;
    if (!update.transactions.some(shouldExpandUserEvent)) return;

    const state = update.state;
    const { head } = state.selection.main;
    const line = state.doc.lineAt(head);
    const before = state.doc.sliceString(line.from, head);

    for (const [seq, glyph] of ALIAS_PAIRS) {
      if (!before.endsWith(seq)) continue;
      const from = head - seq.length;
      view.dispatch({
        changes: { from, to: head, insert: glyph },
        selection: { anchor: from + glyph.length },
        annotations: [belAliasTxn.of(true), isolateHistory.of('full')],
        userEvent: 'input.alias',
      });
      break;
    }
  });
}
