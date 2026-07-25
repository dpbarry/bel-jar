import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadReplOutput() {
  const g = {
    document: {
      getElementById() {
        return {
          appendChild() {},
          replaceChildren() {},
          scrollTop: 0,
          scrollHeight: 0,
        };
      },
      createElement() {
        return {
          className: '',
          classList: { add() {}, remove() {} },
          textContent: '',
          appendChild() {},
          append() {},
          setAttribute() {},
          replaceChildren() {},
        };
      },
    },
    BelugaText: undefined,
    Persist: undefined,
    BelugaRun: undefined,
    ProjectSource: undefined,
    console,
  };
  g.window = g;
  g.globalThis = g;
  const code = readFileSync(path.join(root, 'js/repl/repl-output.js'), 'utf8');
  vm.runInNewContext(code, g, { filename: 'repl-output.js' });
  return g.ReplOutput;
}

const R = loadReplOutput();
assert.equal(
  R.classifyRunOtherKind('Identifier & is unbound.'),
  'error',
  'bare unbound message is a run error, not grey',
);
assert.equal(
  R.classifyRunOtherKind('## Type Reconstruction begin: a.bel ##\n## Type Reconstruction done:  a.bel ##'),
  'success',
);
assert.equal(
  R.classifyRunOtherKind('## Holes: a.bel ##\n?0'),
  'holes',
);
assert.equal(
  R.classifyRunOtherKind('File "a.bel", line 1, column 1:\nError: boom'),
  'error',
);

console.log('OK repl-run-classify (run output never grey for failures)');
