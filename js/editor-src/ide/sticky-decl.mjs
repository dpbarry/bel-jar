import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import { ViewPlugin, closeHoverTooltips, hasHoverTooltips } from '@codemirror/view';
import { TOP_LEVEL_FOLD_NODES, declarationHeadName } from './fold.mjs';
import { firstIdentChild } from '../tree-helpers.mjs';
import { highlightDocRange } from '../format/source-render.mjs';
import { jumpToRange } from './ide-actions.mjs';

const CRUMB_MAX = 24;

/** Nodes that contribute a breadcrumb crumb (outer → inner after reverse). */
export const BREADCRUMB_NODES = new Set([
  'ModuleDeclaration',
  'LFDatatypeDeclaration',
  'LFDeclaration',
  'LFConstructor',
  'InductiveDeclaration',
  'StratifiedDeclaration',
  'CoinductiveDeclaration',
  'InductiveBody',
  'CoinductiveBody',
  'CompConstructor',
  'CompDestructor',
  'RecDeclaration',
  'RecBody',
  'SchemaDeclaration',
  'TypedefDeclaration',
  'LetDeclaration',
  'ProofDeclaration',
  'CaseExpression',
  'CaseBranch',
  'CofunctionExpression',
  'CofunctionBranch',
  'FnExpression',
  'MLamExpression',
  'LetExpression',
]);

/** Drop wrapper when a more specific child crumb is also on the path. */
const REDUNDANT_WHEN_CHILD = {
  RecDeclaration: 'RecBody',
  InductiveDeclaration: 'InductiveBody',
  StratifiedDeclaration: 'InductiveBody',
  CoinductiveDeclaration: 'CoinductiveBody',
  CaseExpression: 'CaseBranch',
  CofunctionExpression: 'CofunctionBranch',
};

/** Enclosing top-level fold node at `pos`, or null. */
export function enclosingTopLevelDecl(state, pos) {
  ensureSyntaxTree(state, Math.min(state.doc.length, pos + 1), 50);
  let node = syntaxTree(state).resolveInner(pos, 1);
  while (node) {
    if (TOP_LEVEL_FOLD_NODES.has(node.name)) return node;
    node = node.parent;
  }
  return null;
}

/** Head name for a top-level decl node (ident child, else first line text). */
export function stickyDeclLabel(state, node) {
  if (!node) return '';
  const name = declarationHeadName(node, state.doc);
  if (name) return name;
  const line = state.doc.lineAt(node.from);
  return line.text.trim() || line.text;
}

export function truncateCrumb(s, max = CRUMB_MAX) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(1, max - 1)) + '…';
}

function rangeBefore(node, stopName) {
  let end = node.to;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === stopName) {
      end = c.from;
      break;
    }
  }
  return { from: node.from, to: end };
}

function headIdentRange(node) {
  const direct = firstIdentChild(node);
  if (direct) return { from: direct.from, to: direct.to };
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name.endsWith('Keyword')) continue;
    const nested = firstIdentChild(c);
    if (nested) return { from: nested.from, to: nested.to };
    if (c.name === 'LowerIdentifier' || c.name === 'UpperIdentifier') {
      return { from: c.from, to: c.to };
    }
  }
  return null;
}

function keywordChildRange(node, keywordName) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === keywordName) return { from: c.from, to: c.to };
  }
  return null;
}

function packSpan(from, to, raw) {
  const fullLabel = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!fullLabel) return null;
  // No eager char ellipsis — CSS overflow clips only when the bar is actually full.
  return { from, to, label: fullLabel, fullLabel };
}

/** Doc span + display label for one breadcrumb node. */
export function crumbSpan(state, node) {
  if (!node) return null;
  const doc = state.doc;
  switch (node.name) {
    case 'CaseBranch':
    case 'CofunctionBranch': {
      const range = rangeBefore(node, 'FatArrow');
      return packSpan(range.from, range.to, doc.sliceString(range.from, range.to));
    }
    case 'FnExpression':
    case 'MLamExpression': {
      const range = rangeBefore(node, 'FatArrow');
      return packSpan(range.from, range.to, doc.sliceString(range.from, range.to));
    }
    case 'LetExpression': {
      let end = node.to;
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.name === '=' || c.name === 'InKeyword') {
          end = c.from;
          break;
        }
      }
      return packSpan(node.from, end, doc.sliceString(node.from, end));
    }
    case 'CaseExpression': {
      const range = keywordChildRange(node, 'CaseKeyword');
      if (range) return packSpan(range.from, range.to, 'case');
      return packSpan(node.from, node.from + 4, 'case');
    }
    case 'CofunctionExpression': {
      const range = keywordChildRange(node, 'FunKeyword');
      if (range) return packSpan(range.from, range.to, 'fun');
      return packSpan(node.from, node.from + 3, 'fun');
    }
    case 'LFConstructor':
    case 'CompConstructor':
    case 'CompDestructor': {
      const id = firstIdentChild(node);
      if (!id) return null;
      return packSpan(id.from, id.to, doc.sliceString(id.from, id.to));
    }
    case 'RecBody':
    case 'InductiveBody':
    case 'CoinductiveBody':
    case 'ModuleDeclaration':
    case 'LFDatatypeDeclaration':
    case 'LFDeclaration':
    case 'RecDeclaration':
    case 'InductiveDeclaration':
    case 'StratifiedDeclaration':
    case 'CoinductiveDeclaration':
    case 'SchemaDeclaration':
    case 'TypedefDeclaration':
    case 'LetDeclaration':
    case 'ProofDeclaration': {
      const range = headIdentRange(node);
      if (!range) return null;
      return packSpan(range.from, range.to, doc.sliceString(range.from, range.to));
    }
    default:
      return null;
  }
}

/** Display label for one breadcrumb node. */
export function crumbLabel(state, node) {
  return crumbSpan(state, node)?.label || '';
}

function dedupeCrumbs(nodes) {
  const names = new Set(nodes.map((n) => n.name));
  return nodes.filter((n) => {
    const need = REDUNDANT_WHEN_CHILD[n.name];
    return !(need && names.has(need));
  });
}

/**
 * Innermost syntax node at `pos` — prefer the tighter of bias -1 / +1 so
 * caret-at-token-start still lands on the identifier (not its parent decl).
 */
export function resolveStructureNode(state, pos) {
  const at = Math.max(0, Math.min(state.doc.length, pos | 0));
  ensureSyntaxTree(state, Math.min(state.doc.length, at + 1), 80);
  const tree = syntaxTree(state);
  const a = tree.resolveInner(at, -1);
  const b = tree.resolveInner(at, 1);
  if (!a) return b;
  if (!b) return a;
  if (a.from <= b.from && a.to >= b.to) return b;
  if (b.from <= a.from && b.to >= a.to) return a;
  return (b.to - b.from) <= (a.to - a.from) ? b : a;
}

/**
 * Cursor-driven structure path: outer → inner crumbs
 * `{ node, label, from, to, name }[]`.
 */
export function structurePathAt(state, pos) {
  const node = resolveStructureNode(state, pos);

  const collected = [];
  for (let cur = node; cur; cur = cur.parent) {
    if (cur.name === 'Program') break;
    if (!BREADCRUMB_NODES.has(cur.name)) continue;
    collected.push(cur);
  }

  const ordered = dedupeCrumbs(collected.reverse());
  const out = [];
  for (const n of ordered) {
    const span = crumbSpan(state, n);
    if (span) out.push({ node: n, name: n.name, jumpFrom: n.from, ...span });
  }
  return out;
}

export function structurePathSignature(path) {
  return path.map((c) => `${c.from}:${c.to}:${c.label}`).join('\0');
}

/** Highlight crumb from the live doc tree (full span; bar CSS clips if needed). */
export function highlightCrumb(state, crumb) {
  const frag = document.createDocumentFragment();
  if (!crumb || crumb.to <= crumb.from) {
    if (crumb?.label) frag.appendChild(document.createTextNode(crumb.label));
    return frag;
  }
  const hl = highlightDocRange(state, crumb.from, crumb.to);
  flattenFragWhitespace(hl);
  frag.appendChild(hl);
  return frag;
}

function flattenFragWhitespace(root) {
  const walk = (node) => {
    if (node.nodeType === 3) {
      node.textContent = node.textContent.replace(/\s+/g, ' ');
      return;
    }
    for (const c of [...node.childNodes]) walk(c);
  };
  walk(root);
}

function bindCrumbOverflowTip(el, fullLabel) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  if (!g.Tooltips || !fullLabel) return;
  el.setAttribute('data-tooltip-no-track', '');
  // Tip only when the crumb is actually CSS-clipped.
  if (typeof g.Tooltips.bindOverflow === 'function') {
    g.Tooltips.bindOverflow(el, () => fullLabel);
  }
}

function jumpToCrumb(view, crumb) {
  if (!view || !crumb) return;
  const from = Math.max(0, Math.min(view.state.doc.length, crumb.jumpFrom ?? crumb.from));
  jumpToRange(view, { from });
  view.focus();
}

function renderStructureBar(bar, view, path) {
  bar.replaceChildren();
  bar.hidden = false;
  if (!path.length) return;
  path.forEach((crumb, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'beljar-structure-sep';
      sep.textContent = '>';
      bar.appendChild(sep);
    }
    const part = document.createElement('span');
    part.className = 'beljar-structure-part';
    part.setAttribute('role', 'button');
    part.tabIndex = 0;
    part.setAttribute('aria-label', `Go to ${crumb.fullLabel || crumb.label}`);
    part.appendChild(highlightCrumb(view.state, crumb));
    if (crumb.fullLabel) bindCrumbOverflowTip(part, crumb.fullLabel);
    const go = (e) => {
      e.preventDefault();
      e.stopPropagation();
      jumpToCrumb(view, crumb);
    };
    part.addEventListener('click', go);
    part.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') go(e);
    });
    bar.appendChild(part);
  });
}

function syncStructureBar(view, bar, cache) {
  const pos = view.state.selection.main.head;
  const path = structurePathAt(view.state, pos);
  const sig = structurePathSignature(path);
  if (sig === cache.sig) return;
  cache.sig = sig;
  renderStructureBar(bar, view, path);
}

export function stickyDeclHeader() {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.cache = { sig: null };
      this.bar = document.createElement('div');
      this.bar.className = 'beljar-sticky-decl beljar-structure-path';
      this.bar.setAttribute('aria-label', 'Structure path');
      this.onEnter = () => {
        if (hasHoverTooltips(view.state)) {
          view.dispatch({ effects: closeHoverTooltips });
        }
      };
      this.onMouseDown = (e) => {
        e.stopPropagation();
      };
      this.bar.addEventListener('mouseenter', this.onEnter);
      this.bar.addEventListener('mousedown', this.onMouseDown, true);
      // In-flow flex sibling above the scroller — never overlays line 1.
      view.dom.insertBefore(this.bar, view.scrollDOM);
      syncStructureBar(view, this.bar, this.cache);
    }

    update(update) {
      if (update.docChanged || update.selectionSet || update.geometryChanged) {
        syncStructureBar(update.view, this.bar, this.cache);
      }
    }

    destroy() {
      this.bar.removeEventListener('mouseenter', this.onEnter);
      this.bar.removeEventListener('mousedown', this.onMouseDown, true);
      this.bar.remove();
    }
  });
}
