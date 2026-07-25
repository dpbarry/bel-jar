import {
  renamePreviewState,
  renameDraftIsInvalid,
  resolveRenameOk,
} from '../js/editor-src/ide/rename.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function viewWithDoc(text) {
  return {
    state: {
      doc: {
        sliceString(from, to) { return text.slice(from, to); },
        toString() { return text; },
      },
    },
  };
}

const session = {
  symbolId: 'sym:foo',
  originalName: 'foo',
  sites: [{ from: 4, to: 4 }],
  anchorSite: 0,
  propagate: false,
};

const empty = renamePreviewState(viewWithDoc('let  = 1'), session);
expect(!empty.ok && empty.trimmed === '', 'empty draft is not committable');
expect(!renameDraftIsInvalid(viewWithDoc('let  = 1'), session, empty), 'empty draft is not styled invalid');

const restored = renamePreviewState(viewWithDoc('let foo = 1'), {
  ...session,
  sites: [{ from: 4, to: 7 }],
});
expect(restored.trimmed === 'foo' && restored.ok, 'restored original name is committable (cancel)');
expect(
  !renameDraftIsInvalid(viewWithDoc('let foo = 1'), { ...session, sites: [{ from: 4, to: 7 }] }, restored),
  'restored original name is not styled invalid',
);

const typing = renamePreviewState(
  viewWithDoc('let bar = 1'),
  {
    ...session,
    sites: [{ from: 4, to: 7 }],
    crossFile: { defFileId: 'other' },
    symbolId: null,
  },
);
expect(typing.trimmed === 'bar' && typing.ok, 'draft reads typed name (cross-file path)');

expect(
  resolveRenameOk(session, 'bar', { ok: false, reason: 'unknown-symbol' }, false),
  'valid name ok when engine lost symbol mid-rename',
);
expect(
  !resolveRenameOk(session, 'bar', { ok: false, reason: 'name-conflict' }, false),
  'engine name-conflict still blocks',
);
expect(
  !resolveRenameOk({ ...session, propagate: true }, 'bar', { ok: true }, true),
  'group conflict still blocks global rename',
);

console.log('OK bel-rename preview (empty draft + engine-lost symbol)');
