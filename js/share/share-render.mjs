/**
 * What the reading page of a link draws from a file's text (docs/PERSIST.md
 * §5.12): its highlighting, and its outline, both from one parse. The outline
 * is worked out here, from the text shown, so it can never disagree with it.
 *
 * Only the parser and the editor's own tags (highlight-tags.mjs): nothing of
 * CodeMirror, so the page stays small. Pure: no DOM (share-page.mjs draws).
 */
import { highlightTree } from '@lezer/highlight';
import { parser } from '../editor-src/beluga-parser.js';
import { belugaHighlight, SOURCE_HIGHLIGHTER } from '../editor-src/highlight-tags.mjs';

const beluga = parser.configure({ props: [belugaHighlight] });

/** Files the page highlights as Beluga; anything else is shown as it is. */
export function isBeluga(path) {
  return /\.(bel|lf)$/i.test(String(path || ''));
}

/** A parse of `text`, or null when the parser gives up (the text is then shown plain). */
export function parse(text) {
  try {
    return beluga.parse(String(text));
  } catch (_) {
    return null;
  }
}

/** Where each line starts, for turning a position into a line number (1-based). */
export function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

export function lineAt(starts, pos) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * The text as runs, each plain or with its jar-hl-* classes: [{ text, cls }],
 * `cls` '' for plain. Every character is in exactly one run.
 */
export function highlightRuns(text, tree) {
  const src = String(text);
  if (!tree) return src ? [{ text: src, cls: '' }] : [];
  const out = [];
  let at = 0;
  highlightTree(tree, SOURCE_HIGHLIGHTER, (from, to, cls) => {
    if (to <= from || from < at) return;
    if (from > at) out.push({ text: src.slice(at, from), cls: '' });
    out.push({ text: src.slice(from, to), cls });
    at = to;
  });
  if (at < src.length) out.push({ text: src.slice(at), cls: '' });
  return out;
}

/** The runs split at line ends: one array of runs per line. */
export function runsByLine(runs) {
  const lines = [[]];
  for (const r of runs) {
    const parts = r.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, cls: r.cls });
    });
  }
  return lines;
}

function childText(text, node, names) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (names.includes(c.name)) return text.slice(c.from, c.to);
    if (c.name === 'datatypeName' || c.name === 'DatatypeName') {
      const inner = childText(text, c, names);
      if (inner) return inner;
    }
  }
  return null;
}

function hasChild(node, name) {
  for (let c = node.firstChild; c; c = c.nextSibling) if (c.name === name) return true;
  return false;
}

/**
 * The file's theorems and its open holes:
 *   { items: [{ kind: 'rec' | 'proof', name, line, total, holes }], holes: [{ name, line }] }
 * `total`: the author wrote a totality declaration on it. `holes`: the `?`s
 * inside it. Every hole in the file is in `holes`, whatever it is inside.
 */
export function outline(text, tree) {
  const src = String(text);
  const items = [];
  const holes = [];
  if (!tree) return { items, holes };
  const starts = lineStarts(src);
  const open = [];
  tree.iterate({
    enter(n) {
      if (n.name === 'RecBody' || n.name === 'ProofDeclaration') {
        const node = n.node;
        const name = childText(src, node, ['LowerIdentifier', 'UpperIdentifier']);
        if (name) {
          const item = {
            kind: n.name === 'RecBody' ? 'rec' : 'proof',
            name,
            line: lineAt(starts, n.from),
            total: n.name === 'RecBody' && hasChild(node, 'TotalityAnnotation'),
            holes: 0,
            to: n.to,
          };
          items.push(item);
          open.push(item);
        }
      } else if (n.name === 'Hole') {
        holes.push({ name: src.slice(n.from, n.to), line: lineAt(starts, n.from) });
        for (const item of open) if (n.from < item.to) item.holes += 1;
      } else if (n.name === 'ProofScript') {
        // A Harpoon proof's script is one opaque token to the parser: its `?`s are read here.
        const script = src.slice(n.from, n.to);
        for (const m of script.matchAll(/(^|[^\w'?])(\?[A-Za-z0-9_']*)/g)) {
          const at = n.from + m.index + m[1].length;
          holes.push({ name: m[2], line: lineAt(starts, at) });
          for (const item of open) if (at < item.to) item.holes += 1;
        }
      }
    },
    leave(n) {
      if (open.length && open[open.length - 1].to === n.to && (n.name === 'RecBody' || n.name === 'ProofDeclaration')) open.pop();
    },
  });
  return { items: items.map(({ to, ...rest }) => rest), holes };
}

/** What the outline says beside an item: its open holes, or nothing. */
export function holesWords(n) {
  if (!n) return '';
  return n === 1 ? '1 hole' : n + ' holes';
}
