import assert from 'node:assert/strict';
import { formatJsErrorLine, reportJsError } from '../js/boot/error-hook.mjs';

assert.equal(formatJsErrorLine('boom', 12), 'boom (line 12)');

let toastMsg = '';
reportJsError('x', 3, {
  Toasts: { error(m) { toastMsg = m; } },
});
assert.equal(toastMsg, '[JS ERROR] x (line 3)');

let replMsg = '';
reportJsError('y', 4, {
  Repl: { appendBuffered(m) { replMsg = m; } },
});
assert.equal(replMsg, '[JS ERROR] y (line 4)');

let outputText = 'prev';
const outputEl = {
  get textContent() { return outputText; },
  set textContent(v) { outputText = v; },
};
reportJsError('z', 5, {
  document: {
    getElementById(id) {
      return id === 'output' ? outputEl : null;
    },
  },
});
assert.equal(outputText, 'prev\n[JS ERROR] z (line 5)');

console.log('OK test-error-hook.mjs');
