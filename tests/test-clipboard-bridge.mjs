import assert from 'node:assert/strict';
import { writeSystemClipboard, pasteSystemClipboard } from '../js/editor-src/ide/clipboard-bridge.mjs';

const setNavigator = (value) => Object.defineProperty(globalThis, 'navigator', { configurable: true, value });
const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeView({ readOnly = false, connected = true } = {}) {
  const dispatched = [];
  return {
    dispatched,
    dom: { isConnected: connected },
    state: { readOnly, replaceSelection: (text) => ({ insert: text }) },
    dispatch: (tr, spec) => dispatched.push({ tr, spec }),
  };
}

// No clipboard API: both directions decline, so callers can fall back.
setNavigator({});
assert.equal(writeSystemClipboard('x'), false);
assert.equal(pasteSystemClipboard(fakeView()), false);

// Writing: a rejection is swallowed, a throw declines.
let written = null;
setNavigator({ clipboard: { writeText: (t) => { written = t; return Promise.reject(new Error('denied')); } } });
assert.equal(writeSystemClipboard(42), true);
assert.equal(written, '42');
setNavigator({ clipboard: { writeText: () => { throw new Error('no'); } } });
assert.equal(writeSystemClipboard('x'), false);

// Pasting: sanitized text at the selection, as a paste.
setNavigator({ clipboard: { readText: () => Promise.resolve('a\r\nb​') } });
{
  const view = fakeView();
  assert.equal(pasteSystemClipboard(view), true);
  await tick();
  assert.equal(view.dispatched.length, 1);
  assert.deepEqual(view.dispatched[0].tr, { insert: 'a\nb' });
  assert.equal(view.dispatched[0].spec.userEvent, 'input.paste');
}
// Nothing lands in a read-only or detached editor.
for (const opts of [{ readOnly: true }, { connected: false }]) {
  const view = fakeView(opts);
  pasteSystemClipboard(view);
  await tick();
  assert.equal(view.dispatched.length, 0, JSON.stringify(opts));
}
// A refused read pastes nothing and throws nothing.
setNavigator({ clipboard: { readText: () => Promise.reject(new Error('denied')) } });
{
  const view = fakeView();
  assert.equal(pasteSystemClipboard(view), true);
  await tick();
  assert.equal(view.dispatched.length, 0);
}

console.log('OK clipboard bridge (write, sanitized paste, read-only, detached, refused)');
