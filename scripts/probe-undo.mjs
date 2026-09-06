// The undo/redo gate: a chain of undos and redos is EXACT and has NO side effects.
//
// ⛔ This probe exists because the unit tests were green while undo was visibly
// broken in the app. `tests/test-edit-history.mjs` drives a MOCK adapter with no
// CodeMirror behind it, so it could not see either bug the user hit:
//
//   1. Out-of-band rewrites (trim-on-save, format-on-save, reindent) mutate the
//      document with `addToHistory: false`. The recorder dropped them, the stack
//      stopped matching the document, and every later undo answered "the project
//      changed since that edit" for the rest of the session.
//   2. The caret came back one keystroke late, because the "before" viewport was
//      snapshotted from an update LISTENER, after the first character had landed.
//      Undoing a word typed at the start of an empty line put the caret on the
//      NEXT line.
//
// Both are only visible with a real document, real keystrokes and real prefs.
// Every check here compares against a snapshot taken as the edit was made, so it
// can only pass if the state actually came back.
import { openProbe } from './probe-harness.mjs';

const { page, check, wait, type, key, chord, finish } = await openProbe({
  port: 8874,
  waitFor: () => window.Commands && window.CurrentEditor && window.EditHistory,
});

// Every toast the app raises, so a silent regression cannot hide behind one.
await page.evaluate(() => {
  window.__toasts = [];
  const T = window.Toasts;
  if (!T) return;
  for (const m of ['error', 'warn', 'info', 'show']) {
    if (typeof T[m] !== 'function') continue;
    const orig = T[m].bind(T);
    T[m] = (msg, ...rest) => { window.__toasts.push(String(msg)); return orig(msg, ...rest); };
  }
});
const toasts = () => page.evaluate(() => {
  const a = window.__toasts.slice();
  window.__toasts.length = 0;
  return a;
});

const snap = () => page.evaluate(() => {
  const v = CurrentEditor.getView();
  const s = v.state.selection.main;
  const line = v.state.doc.lineAt(s.head);
  return {
    doc: v.state.doc.toString(),
    head: s.head,
    line: line.number,
    col: s.head - line.from,
    undo: EditHistory.getUndoStack().length,
    redo: EditHistory.getRedoStack().length,
  };
});
const where = (s) => `L${s.line}C${s.col}`;
const tail = (s) => JSON.stringify(s.slice(-24));
const undoOnce = async () => { await page.evaluate(() => EditHistory.undo()); await wait(90); };
const redoOnce = async () => { await page.evaluate(() => EditHistory.redo()); await wait(90); };

let crash = null;
try {
  await page.evaluate(() => {
    Persist.writeStoredTrimTrailingWs?.(false);
    Persist.writeStoredFormatOnSave?.(false);
  });
  await page.click('.cm-content');
  await wait(300);
  await toasts();

  // ── 1. one word, one undo: the text AND the caret come back exactly ────────
  //
  // Typed at column 0 of an empty line, which is where the off-by-one showed:
  // head+1 is the start of the NEXT line, so a one-character error reads as the
  // caret jumping a line.
  await type('LF nat : type =', 260);
  await key('Enter', 260);
  const atLineStart = await snap();
  await type('hello', 400);
  await undoOnce();
  const undone = await snap();
  check(undone.doc === atLineStart.doc, 'undoing a typed word restores the text exactly');
  check(undone.head === atLineStart.head,
    `and puts the caret back where typing began (${where(atLineStart)})`,
    `got ${where(undone)} head ${undone.head}, wanted head ${atLineStart.head}`);

  await redoOnce();
  const redone = await snap();
  check(redone.doc.endsWith('hello'), 'redo puts the word back');
  check(redone.head === atLineStart.head + 5, 'redo leaves the caret after the word');

  // ── 2. a long chain walks back through every state, then forward ──────────
  const states = [await snap()];
  for (const word of ['alpha', 'beta', 'gamma', 'delta']) {
    await key('Enter', 220);
    await type(word, 320);
    states.push(await snap());
  }
  const depth = (await snap()).undo;
  const back = [await snap()]; // the state we start from counts as reached
  for (let i = 0; i < depth; i += 1) {
    await undoOnce();
    back.push(await snap());
    if (back[back.length - 1].undo === 0) break;
  }
  check(back[back.length - 1].doc === '', 'a chain of undos reaches the empty document');
  check((await snap()).undo === 0, 'and empties the undo stack rather than stalling');

  // Every state the user typed must be on the way back. A chain that skips one,
  // or invents a document nobody was ever in, is the "side effects" reported.
  const reachable = new Set(back.map((s) => s.doc));
  const missed = states.filter((s) => !reachable.has(s.doc)).length;
  check(missed === 0, 'the way back passes through every state the user typed', `${missed} missed`);

  for (let i = 1; i < back.length; i += 1) await redoOnce();
  const end = await snap();
  const last = states[states.length - 1];
  check(end.doc === last.doc, 'redoing the whole chain lands on the exact final document',
    `${tail(end.doc)} vs ${tail(last.doc)}`);
  check(end.head === last.head, 'and on the exact final caret position',
    `${where(end)} vs ${where(last)}`);

  // An undo chain must be repeatable, not a one-shot that leaves the stack
  // subtly poisoned for the next pass.
  for (let i = 0; i < depth; i += 1) await undoOnce();
  for (let i = 0; i < depth; i += 1) await redoOnce();
  const twice = await snap();
  check(twice.doc === end.doc, 'a second full round trip lands on the same document');
  check(twice.head === end.head, 'and the same caret');

  // ── 3. undo survives an out-of-band rewrite (trim-on-save) ────────────────
  await page.evaluate(() => Persist.writeStoredTrimTrailingWs?.(true));
  await page.click('.cm-content');
  await key('End', 150);
  await type('   ', 300);
  await page.evaluate(() => Persist.flushCheckpoint && Persist.flushCheckpoint());
  await wait(900);
  const beforeTrimUndo = await snap();
  const ok = await page.evaluate(() => EditHistory.undo());
  await wait(200);
  check(ok, 'undo still runs after trim-on-save rewrote the document');
  check((await snap()).doc !== beforeTrimUndo.doc, 'and it actually changed something');
  check((await toasts()).length === 0, 'no "the project changed" toast');

  let stalled = 0;
  for (let i = 0; i < 60; i += 1) {
    const s = await snap();
    if (s.undo === 0) break;
    const applied = await page.evaluate(() => EditHistory.undo());
    await wait(60);
    if (!applied) { stalled = s.undo; break; }
  }
  check(stalled === 0, 'the whole stack still unwinds with trim-on-save on',
    `stalled with ${stalled} left`);
  check((await toasts()).length === 0, 'and raises no toast doing it');
  await page.evaluate(() => Persist.writeStoredTrimTrailingWs?.(false));

  // ── 4. editing after undo drops the redo branch and nothing else ──────────
  await page.click('.cm-content');
  await page.evaluate(() => {
    const v = CurrentEditor.getView();
    v.dispatch({ selection: { anchor: v.state.doc.length } });
    v.focus();
  });
  await type('one', 300);
  await type('two', 300);
  await undoOnce();
  const branchPoint = await snap();
  check(branchPoint.redo > 0, 'undo leaves something to redo');
  await type('three', 400);
  check((await snap()).redo === 0, 'typing after an undo drops the redo branch');
  await undoOnce();
  const backToBranch = await snap();
  check(backToBranch.doc === branchPoint.doc,
    'and undoing that returns to the branch point exactly',
    `${tail(backToBranch.doc)} vs ${tail(branchPoint.doc)}`);

  // ── 5. Ctrl+Z pressed mid-burst, before the typing group has closed ───────
  const preBurst = await snap();
  await page.keyboard.type('rapid', { delay: 8 });
  await chord(['Control'], 'KeyZ', 300);
  const afterBurstUndo = await snap();
  check(afterBurstUndo.doc === preBurst.doc,
    'Ctrl+Z straight after a burst undoes the whole burst',
    `${tail(afterBurstUndo.doc)} vs ${tail(preBurst.doc)}`);
  check(afterBurstUndo.head === preBurst.head, 'and restores the caret it started from');

  // ── 6. held-down Ctrl+Z: no late dispatch drags the caret back ────────────
  await type('aaa', 260);
  await type('bbb', 260);
  await type('ccc', 260);
  const settled = await snap();
  for (let i = 0; i < 3; i += 1) await chord(['Control'], 'KeyZ', 40);
  await wait(900); // long enough for any queued rAF / font-ready restore to land
  const afterRapid = await snap();
  check(afterRapid.undo === settled.undo - 3,
    'three fast Ctrl+Z presses consume exactly three steps',
    `stack ${afterRapid.undo}, wanted ${settled.undo - 3}`);
  await wait(600);
  const stillThere = await snap();
  check(stillThere.head === afterRapid.head && stillThere.doc === afterRapid.doc,
    'and nothing moves the caret or text afterwards',
    `${where(afterRapid)} -> ${where(stillThere)}`);

  // ── 7. undo a format: one step, all of it, caret intact ──────────────────
  //
  // Format rewrites the whole document at once and then schedules its own
  // scroll. It must still be exactly one Ctrl+Z, and the scroll it queues must
  // not survive the undo.
  const preFormat = await snap();
  const formatted = await page.evaluate(() => Commands.run('edit.format'));
  await wait(1200);
  const afterFormat = await snap();
  if (!formatted || afterFormat.doc === preFormat.doc) {
    console.log('  --   skipped the format leg: format left the document unchanged');
  } else {
    check(afterFormat.undo === preFormat.undo + 1, 'format is exactly one history step',
      `${preFormat.undo} -> ${afterFormat.undo}`);
    await undoOnce();
    await wait(700);
    const unformatted = await snap();
    check(unformatted.doc === preFormat.doc, 'one undo takes the whole format back',
      `${tail(unformatted.doc)} vs ${tail(preFormat.doc)}`);
    await wait(700);
    check((await snap()).doc === preFormat.doc, 'and nothing re-formats it a beat later');
  }

  // ── 8. undo across a file switch ─────────────────────────────────────────
  //
  // Two files, an edit in each, then undo twice. Undo has to reach back into a
  // file that is not on screen, and the tab has to follow — a chain that
  // silently edits the wrong buffer is the worst side effect of the lot.
  const made = await page.evaluate(() => {
    const P = window.Persist;
    if (!P?.createFile && !P?.addFile) return null;
    const mk = P.createFile ? P.createFile.bind(P) : P.addFile.bind(P);
    const f = mk('undo-probe.bel', '');
    return f && (f.id || f) ? String(f.id || f) : null;
  }).catch(() => null);

  if (!made) {
    console.log('  --   skipped the cross-file leg: no Persist.createFile/addFile on this build');
  } else {
    const first = await page.evaluate(() => Persist.getActiveFileId());
    await page.evaluate((id) => window.belJarSwitchToFileForHistory(id), made);
    await wait(1200);
    await page.click('.cm-content');
    await type('second file text', 400);
    const secondDoc = (await snap()).doc;
    check(secondDoc.includes('second file text'), 'the second file took the edit');

    await undoOnce();
    await wait(500);
    check(!(await snap()).doc.includes('second file text'), 'undo cleared the second file');

    await undoOnce();
    await wait(900);
    const landed = await page.evaluate(() => Persist.getActiveFileId());
    check(landed === first,
      'undoing past the switch brings the first file back to the front',
      `landed on ${landed}, wanted ${first}`);
    const other = await page.evaluate((id) => Persist.getFileText(id), made);
    check(other === '', 'and leaves the other file exactly as the step recorded it', JSON.stringify(other));
  }

  // ── 9. undoing an import is ATOMIC across files, folders, tabs and editor ─
  //
  // The reported failure: import a library folder, edit, undo, undo. The files
  // went away but the buffer still showed the deleted file's text while the tab
  // strip said main.bel was open, and the emptied folder stayed in the tree.
  // Deleting the file a buffer is showing — including by undoing its creation —
  // has to close that buffer, and undoing a folder import has to take the
  // folder with it.
  const workspace = () => page.evaluate(() => {
    const P = window.Persist;
    const ed = window.CurrentEditor;
    const activeId = P.getActiveFileId();
    return {
      files: P.listFiles().map((f) => f.name).sort(),
      emptyFolders: (P.listEmptyFolders ? P.listEmptyFolders() : []).slice().sort(),
      activeId,
      editorDocId: ed?.getDocumentId?.() ?? ed?.getCurrentFileId?.() ?? null,
      editorText: ed?.getValue?.() ?? '',
      persistText: P.getFileText(activeId) ?? '',
      deadTabs: P.getOpenFileIds().filter((id) => !P.getFileById(id)),
      tabNames: [...document.querySelectorAll('.editor-tab')]
        .map((e) => e.getAttribute('data-file-id')),
      explorerFiles: [...document.querySelectorAll('.explorer-file-item')]
        .map((e) => e.getAttribute('data-file-name')).sort(),
      explorerFolders: [...document.querySelectorAll('.explorer-folder-item')]
        .map((e) => e.getAttribute('data-folder-path')).sort(),
      undo: EditHistory.getUndoStack().length,
    };
  });

  const beforeImport = await workspace();
  await page.evaluate(() => {
    const P = window.Persist;
    EditHistory.transact('file-batch', () => {
      for (const e of [
        { name: 'imported/a.bel', text: 'LF a : type = ;' },
        { name: 'imported/b.bel', text: 'LF b : type = ;' },
      ]) {
        const id = P.createFile(e.name);
        P.setFileText(id, e.text);
        P.openFile(id);
      }
      const first = P.listFiles().find((f) => f.name === 'imported/a.bel');
      if (first) P.setActiveFileId(first.id);
    });
  });
  await wait(1600);
  const imported = await workspace();
  check(imported.files.includes('imported/a.bel'), 'the import landed');
  check(imported.explorerFiles.includes('imported/a.bel'),
    'and the explorer shows the imported files', JSON.stringify(imported.explorerFiles));

  await undoOnce();
  await wait(1800);
  const reverted = await workspace();
  check(!reverted.files.some((f) => f.startsWith('imported/')),
    'undoing the import removes the files', JSON.stringify(reverted.files));
  check(!reverted.emptyFolders.includes('imported'),
    'and takes the folder with them, rather than leaving it empty',
    JSON.stringify(reverted.emptyFolders));
  check(!reverted.explorerFolders.includes('imported'),
    'so the explorer has no orphan folder row', JSON.stringify(reverted.explorerFolders));
  check(reverted.editorDocId === reverted.activeId,
    'the editor is mounted on the file the workspace calls active',
    `editor ${reverted.editorDocId} vs active ${reverted.activeId}`);
  check(reverted.editorText === reverted.persistText,
    'and shows that file text, not the deleted one',
    `${tail(reverted.editorText)} vs ${tail(reverted.persistText)}`);
  check(reverted.deadTabs.length === 0,
    'no tab points at a file that no longer exists', JSON.stringify(reverted.deadTabs));
  check(reverted.files.join('|') === beforeImport.files.join('|'),
    'the file list is exactly what it was before the import');

  await redoOnce();
  await wait(1800);
  const restored = await workspace();
  check(restored.files.join('|') === imported.files.join('|'),
    'redo brings the whole import back', JSON.stringify(restored.files));
  check(restored.editorDocId === restored.activeId,
    'and leaves the editor on the active file again',
    `editor ${restored.editorDocId} vs active ${restored.activeId}`);
  check(restored.editorText === restored.persistText, 'showing that file text');
  check(restored.deadTabs.length === 0, 'with no dead tabs');
  check(restored.explorerFiles.includes('imported/a.bel'),
    'and the explorer back in step', JSON.stringify(restored.explorerFiles));

  // ── 10. deleting the file the editor is showing, and undoing it ──────────
  //
  // Same law from the other side: a buffer showing a file that no longer exists
  // is never acceptable, and redo must not refuse just because restoring the
  // files legitimately reopened a tab (that was `open-tabs-mismatch`).
  await page.evaluate(() => {
    const P = window.Persist;
    EditHistory.transact('file-batch', () => {
      for (const e of [{ n: 'pkg/x.bel', t: 'LF x : type = ;' }, { n: 'pkg/y.bel', t: 'LF y : type = ;' }]) {
        const id = P.createFile(e.n);
        P.setFileText(id, e.t);
        P.openFile(id);
      }
    });
  });
  await wait(1200);
  await page.evaluate(() => {
    const f = Persist.listFiles().find((x) => x.name === 'pkg/x.bel');
    if (f) window.belJarSwitchToFileForHistory(f.id);
  });
  await wait(1500);
  check((await workspace()).editorDocId?.endsWith('pkg/x.bel'), 'the editor is showing pkg/x.bel');

  await page.evaluate(() => {
    const P = window.Persist;
    const ids = P.listFiles().filter((x) => x.name.startsWith('pkg/')).map((x) => x.id);
    EditHistory.transact('file-delete', () => { for (const id of ids) P.deleteFile(id); });
  });
  await wait(1600);
  const deleted = await workspace();
  check(deleted.editorDocId === deleted.activeId && deleted.editorText === deleted.persistText,
    'deleting the open file moves the buffer off it at once',
    `editor ${deleted.editorDocId} vs active ${deleted.activeId}`);
  check(deleted.emptyFolders.includes('pkg'),
    'a delete the user ASKED for keeps the emptied folder', JSON.stringify(deleted.emptyFolders));

  await undoOnce();
  await wait(1800);
  const undeleted = await workspace();
  check(undeleted.files.filter((f) => f.startsWith('pkg/')).length === 2,
    'undo puts both files back', JSON.stringify(undeleted.files));
  check(!undeleted.emptyFolders.includes('pkg'),
    'and drops the empty-folder record, since the folder has files again');
  check(undeleted.editorDocId === undeleted.activeId && undeleted.deadTabs.length === 0,
    'with the editor and tabs consistent');

  const redoOk = await page.evaluate(() => EditHistory.redo());
  await wait(1800);
  const redeleted = await workspace();
  check(redoOk, 'redo is not refused because restoring the files reopened a tab');
  check(redeleted.files.filter((f) => f.startsWith('pkg/')).length === 0,
    'redo deletes them again', JSON.stringify(redeleted.files));
  check(redeleted.emptyFolders.includes('pkg'), 'and brings the empty folder back with it');
  check(redeleted.editorDocId === redeleted.activeId && redeleted.editorText === redeleted.persistText,
    'leaving the buffer on a file that exists');

  check((await toasts()).length === 0, 'the whole probe raised no toasts');
} catch (e) {
  crash = e;
}

await finish('undo/redo', crash);
