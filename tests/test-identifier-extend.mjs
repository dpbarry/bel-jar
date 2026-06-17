import { parser } from '../editor-src/beluga-parser.js';

function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

function parseErrors(src) {
  const errs = [];
  parser.parse(src).iterate({
    enter(n) {
      if (n.type.isError && n.from < n.to) errs.push(src.slice(n.from, n.to));
    },
  });
  return errs;
}

// LF constructors: extended pseudo-keywords are valid identifiers
for (const w of ['left', 'right', 'none', 'datatype']) {
  expect(
    parseErrors(`LF t: type = | ${w}: t;`).length === 0,
    `LF constructor ${w} parses`,
  );
}
expect(
  parseErrors('LF t: type = | FN: t;').length === 0,
  'LF constructor FN parses',
);

// User case: path with left/right
expect(
  parseErrors(`LF path: type =
  | bind: (path -> path) -> path
  | left: path -> path
  | right: path -> path
  | done: path
;`).length === 0,
  'path datatype with left/right constructors',
);

// Pragmas still accept associativity enum
for (const src of [
  '--infix ⊃ 5 right.',
  '--assoc left.',
  '--infix app 1 none.',
]) {
  expect(parseErrors(src).length === 0, `pragma parses: ${src}`);
}

// Invalid associativity is a parse error (assoc position is closed enum)
expect(
  parseErrors('--assoc bogus.').some((e) => e.includes('bogus')),
  'invalid associativity rejected',
);

// FN mlam alias (uppercase token)
expect(
  parseErrors('let f = FN x => x;').length === 0,
  'FN mlam alias parses',
);

console.log('OK identifier @extend (LF ctors, pragmas, FN mlam, invalid assoc)');
