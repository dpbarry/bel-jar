// A full disk, end to end through Persist (docs/PERSIST.md §4): a write that
// matters and fails is reported ONCE (toast + notification) and cleared when
// writes land again; caches are evicted before anything is reported; a
// checkpoint that cannot fit fails quietly; device state reports through the
// same door.
import assert from 'node:assert/strict';
import { makeBrowserStorage, openTab } from './_persist-env.mjs';

function withUi() {
  const toasts = [];
  const notifs = [];
  const dismissed = [];
  return {
    toasts,
    notifs,
    dismissed,
    extras: {
      Toasts: { error(msg, opts) { toasts.push({ msg, opts }); } },
      Notifications: {
        emit(rec) {
          const existing = notifs.find((r) => r.dedupeKey && r.dedupeKey === rec.dedupeKey);
          if (existing) { Object.assign(existing, rec); return existing.id; }
          const id = 'n-' + (notifs.length + 1);
          notifs.push({ id, ...rec });
          return id;
        },
        list() { return notifs.slice(); },
        dismiss(id) {
          const i = notifs.findIndex((r) => r.id === id);
          if (i >= 0) { dismissed.push(notifs[i]); notifs.splice(i, 1); }
        },
      },
    },
  };
}

const used = (storage) => [...storage.map].reduce((n, [k, v]) => n + k.length + v.length, 0);

// ── the disk fills: reported once, and cleared when a save lands ────────────
{
  const ui = withUi();
  const storage = makeBrowserStorage();
  const { P } = openTab(storage, ui.extras);
  const id = P.listFiles()[0].id;
  const doc = P.createPersist({ documentId: id, debounceMs: 0 });
  assert.equal(P.isSaveBlocked(), false);

  storage.maxChars = used(storage) + 10;
  doc.scheduleEditorPersist('LF a : type. % far too long to fit in ten characters');
  doc.flushCheckpoint();
  assert.equal(P.isSaveBlocked(), true, 'a text write that does not fit blocks');
  assert.equal(ui.toasts.length, 1, 'and says so');
  assert.ok(ui.toasts[0].msg.includes('storage full'));
  assert.equal(ui.toasts[0].opts.duration, 0, 'in a toast that stays');
  assert.equal(ui.notifs.length, 1);
  assert.equal(ui.notifs[0].dedupeKey, 'persist.capacity');
  assert.equal(ui.notifs[0].category, 'ops');

  doc.flushCheckpoint();
  doc.flushCheckpoint();
  assert.equal(ui.toasts.length, 1, 'every autosave retries, and none of them stacks another toast');
  assert.equal(ui.notifs.length, 1, 'or another notification');

  storage.maxChars = null;
  doc.flushCheckpoint();
  assert.equal(P.isSaveBlocked(), false, 'the retry lands once there is room');
  assert.equal(P.getFileText(id), 'LF a : type. % far too long to fit in ten characters', 'with the text the user had');
  assert.equal(ui.notifs.length, 0, 'and the notification goes away');
  assert.equal(ui.dismissed.length, 1);
}

// ── caches go first: a text write evicts the oldest checkpoint, silently ────
{
  const ui = withUi();
  const storage = makeBrowserStorage();
  const { P } = openTab(storage, ui.extras);
  const big = { types: { v: 1, decls: [['k', 'T'.repeat(400), 'fp']], metavars: [], reconstructed: [] } };
  const ids = [P.createFile('a.bel'), P.createFile('b.bel')];
  for (const fid of ids) {
    const d = P.createPersist({ documentId: fid, debounceMs: 0 });
    d.setCheckpointProviders({ getText: () => 'LF ' + fid, getSemantic: () => big });
    d.flushCheckpoint();
  }
  const caches = () => [...storage.map.keys()].filter((k) => k.includes('/cache/'));
  assert.equal(caches().length, 2, 'two files have checkpoints');

  storage.maxChars = used(storage) + 200;
  P.setFileText(ids[1], 'x'.repeat(300));
  assert.equal(P.getFileText(ids[1]), 'x'.repeat(300), 'the text write landed');
  assert.equal(caches().length, 1, 'by evicting one checkpoint');
  assert.ok(caches()[0].endsWith(ids[1]), 'the oldest one');
  assert.equal(P.isSaveBlocked(), false, 'and nothing is reported: a cache is recomputable');
  assert.equal(ui.toasts.length, 0);
}

// ── a checkpoint that cannot fit fails quietly; the text still lands ────────
{
  const ui = withUi();
  const storage = makeBrowserStorage();
  const { P } = openTab(storage, ui.extras);
  const id = P.listFiles()[0].id;
  const doc = P.createPersist({ documentId: id, debounceMs: 0 });
  doc.setCheckpointProviders({
    getText: () => 'LF a : type.',
    getSemantic: () => ({ types: { v: 1, decls: [['k', 'T'.repeat(5000), 'fp']], metavars: [], reconstructed: [] } }),
  });
  storage.maxChars = used(storage) + 400;
  doc.flushCheckpoint();
  assert.equal(P.getFileText(id), 'LF a : type.', 'the text landed');
  assert.ok(![...storage.map.keys()].some((k) => k.includes('/cache/')), 'the checkpoint did not');
  assert.equal(P.isSaveBlocked(), false, 'and nobody was told: it is only a cache');
  assert.equal(ui.toasts.length, 0);
}

// ── device state reports through the same door ─────────────────────────────
{
  const ui = withUi();
  const storage = makeBrowserStorage();
  const { P, ctx } = openTab(storage, ui.extras);
  storage.maxChars = used(storage);
  assert.equal(ctx.Device.set('commandLineHistory', ['x'.repeat(100)]), false, 'a device write that does not fit says so');
  assert.equal(P.isSaveBlocked(), true, 'and is reported like any write that matters');
  assert.equal(ui.toasts.length, 1);
}

console.log('OK persist-capacity (report once, clear on success, caches evicted first, quiet checkpoint, device state)');
