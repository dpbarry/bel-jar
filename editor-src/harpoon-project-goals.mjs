// Syntactic hole scan for Harpoon's project-wide goal list. Parses each file's
// Lezer tree for `?` tokens — no checker round-trip — so the panel can list
// goals across the workspace immediately.
import { isSignaturePath } from './bel-paths.mjs';
import { Text } from '@codemirror/state';
import { parser } from './beluga-parser.js';
import { parseHolesFromTree } from './bel-holes.mjs';

export function holeHostFile(name) {
  return isSignaturePath(name);
}

export function scanFileHoles(text) {
  const src = String(text ?? '');
  if (!src.trim()) return [];
  let tree;
  try { tree = parser.parse(src); } catch (_) { return []; }
  const doc = Text.of(src.replace(/\r\n/g, '\n').split('\n'));
  return parseHolesFromTree(tree, doc);
}

export function hitsFromHoles(holes) {
  return (holes || []).map((h) => ({
    hole: h,
    from: h.from,
    to: h.to,
  }));
}
