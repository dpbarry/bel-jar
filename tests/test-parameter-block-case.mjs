import { parser } from '../js/editor-src/beluga-parser.js';

function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

function parseErrors(src) {
  const errs = [];
  parser.parse(src).iterate({
    enter(node) {
      if (node.type.isError && node.from < node.to) {
        errs.push({ line: src.slice(0, node.from).split('\n').length, text: src.slice(node.from, node.to) });
      }
    },
  });
  return errs;
}

const branch = `| {#q : #[g |- block x:tm, _t: ({q:path} is_path q N[..] -> is_path q x), _u:jump N[..] x]}
  [g |- #q.2 P D] =>
  let [g |- J] = fwd [g |- D] in
  [g |- j_jump #q.3 J]`;

const src = `let fwd = fn p => case p of
${branch};`;

const errs = parseErrors(src);
expect(errs.length === 0, `parameter-block case branch should parse cleanly: ${JSON.stringify(errs)}`);

expect(
  parseErrors('rec f: {p:#[g |- tm]} [g |- tm] = p;').length === 0,
  'simple parameter type still parses',
);

console.log('OK parameter block case branch');
