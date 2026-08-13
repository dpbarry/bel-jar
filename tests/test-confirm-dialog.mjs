import {
  PromptDialog,
} from '../js/ui/prompt-dialog.mjs';
import {
  ConfirmDialog,
} from '../js/ui/confirm-dialog.mjs';
import {
  Dialog,
} from '../js/ui/dialog.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

expect(typeof Dialog.createDialog === 'function', 'Dialog.createDialog exists');
expect(typeof Dialog.findSurfaceSearchInput === 'function', 'Dialog.findSurfaceSearchInput exists');
expect(typeof Dialog.focusSurfaceSearch === 'function', 'Dialog.focusSurfaceSearch exists');
expect(typeof PromptDialog.open === 'function', 'PromptDialog.open exists');
expect(typeof PromptDialog.buildActions === 'function', 'PromptDialog.buildActions exists');
expect(PromptDialog.CARD_CLASS.includes('bj-prompt-dialog__card'), 'shared card class');
expect(typeof ConfirmDialog.confirm === 'function', 'ConfirmDialog.confirm exists');

{
  let seen = '';
  const hit = { disabled: false };
  const root = {
    querySelector(sel) {
      seen = sel;
      return hit;
    },
  };
  expect(Dialog.findSurfaceSearchInput(root) === hit, 'findSurfaceSearchInput returns query hit');
  expect(seen.includes('type="search"'), 'search selector includes type=search');
  expect(seen.includes('data-surface-find'), 'search selector includes data-surface-find');
  expect(Dialog.findSurfaceSearchInput({ querySelector() { return { disabled: true }; } }) == null, 'disabled search is ignored');
  expect(Dialog.findSurfaceSearchInput(null) == null, 'null root is ignored');
}

{
  let focused = false;
  let selected = false;
  Dialog.focusSurfaceSearch({
    value: 'hello',
    classList: { contains() { return false; } },
    focus() { focused = true; },
    select() { selected = true; },
  });
  expect(focused && selected, 'focusSurfaceSearch focuses and selects');

  let range = null;
  Dialog.focusSurfaceSearch({
    value: '%foo',
    classList: { contains(c) { return c === 'bel-palette-input'; } },
    focus() {},
    setSelectionRange(a, b) { range = [a, b]; },
  });
  expect(range && range[0] === 1 && range[1] === 4, 'palette find selects after mode prefix');
}

if (typeof document === 'undefined') {
  console.log('OK confirm-dialog (ESM dialog graph API)');
} else {
  ConfirmDialog.confirm('Delete everything?').then((ok) => {
    expect(typeof ok === 'boolean', 'confirm resolves boolean');
    console.log('OK confirm-dialog (ESM dialog graph API)');
  });
}
