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

  // ── 11. the ⟲ widget and the history panel ───────────────────────────────
  //
  // The widget counts the live stack, and the panel travels through the REAL
  // undo/redo rather than reconstructing a state — every guarantee the history
  // makes lives in those two calls.
  const widget = () => page.evaluate(() => {
    const el = document.querySelector('.jar-strip__seg--history');
    if (!el) return null;
    const segs = [...document.querySelectorAll('.jar-strip__seg')].map((e) => e.className);
    const h = segs.findIndex((c) => c.includes('--history'));
    return {
      text: el.querySelector('.jar-strip__label')?.textContent || '',
      hasIcon: !!el.querySelector('.jar-strip__icon'),
      // ⛔ `.jar-strip__mark` is the goal's turnstile and carries the holes
      // magenta; borrowing it painted this widget bright pink.
      borrowsGoalMark: !!el.querySelector('.jar-strip__mark'),
      colour: getComputedStyle(el).color,
      branched: el.classList.contains('is-branched'),
      leftOfChecker: h >= 0 && (segs[h + 1] || '').includes('--checker'),
      expanded: el.getAttribute('aria-expanded'),
    };
  });

  await page.evaluate(() => { while (EditHistory.redo()) { /* back to the tip */ } });
  await wait(400);
  // A recognisable typed step, so the panel has something to preview.
  await page.click('.cm-content');
  await page.evaluate(() => {
    const v = CurrentEditor.getView();
    v.dispatch({ selection: { anchor: v.state.doc.length } });
    v.focus();
  });
  await type('rec zebra', 500);
  const w0 = await widget();
  check(w0, 'the strip carries a history widget');
  check(w0.leftOfChecker, 'directly left of the checker segment');
  check(w0.hasIcon && !w0.borrowsGoalMark,
    'it draws its own icon rather than borrowing the goal turnstile');
  check(w0.text === String((await snap()).undo),
    `it counts the live undo stack (says ${w0.text})`);
  check(!w0.branched, 'and is not flagged as branched at the tip of history');

  await page.click('.jar-strip__seg--history');
  await wait(700);
  const panel = await page.evaluate(() => {
    const el = document.querySelector('.jar-hist');
    if (!el) return null;
    const p = el.getBoundingClientRect();
    const b = document.querySelector('.jar-strip').getBoundingClientRect();
    const seg = document.querySelector('.jar-strip__seg--history').getBoundingClientRect();
    return {
      rows: document.querySelectorAll('.jar-hist__row').length,
      nowRows: document.querySelectorAll('.jar-hist__now').length,
      caption: document.querySelector('.jar-hist__count')?.textContent || '',
      keys: [...document.querySelectorAll('.jar-hist__key')].map((k) => k.textContent),
      // Shares the strip's top border as its bottom edge, right-aligned to the
      // widget it belongs to.
      gapToStrip: Math.round(b.top - p.bottom),
      rightAligned: Math.abs(p.right - seg.right) <= 1,
      previews: [...document.querySelectorAll('.jar-hist__label.is-preview')].length,
      // The row directly under the marker is the most recent step.
      topPreview: (() => {
        const rows = [...document.querySelectorAll('.jar-hist__row')];
        const first = rows.find((r) => !r.classList.contains('is-ahead'));
        return first ? first.textContent : '';
      })(),
    };
  });
  check(panel, 'clicking the widget opens the panel');
  check(panel.gapToStrip === 0, 'it sits flush on the strip, not floating above it',
    `gap ${panel.gapToStrip}px`);
  check(panel.rightAligned, 'and right-aligns to the widget it grew out of');
  check(panel.nowRows === 1, 'exactly one current-position marker');
  check(panel.rows === (await snap()).undo, 'one row per step on the stack',
    `${panel.rows} rows vs ${(await snap()).undo} steps`);
  check(panel.previews > 0, 'typed steps show the text they typed, not the word "Typing"');
  check(panel.topPreview.indexOf('zebra') >= 0,
    'and the newest row shows the text just typed', JSON.stringify(panel.topPreview));
  check(panel.keys.length === 2 && panel.keys.every(Boolean),
    'the footer names real chords for undo and redo', JSON.stringify(panel.keys));
  check((await widget()).expanded === 'true', 'the widget reports itself expanded');

  // ⛔ `bindTooltips()` sweeps `[data-tooltip]` once at boot and is not
  // delegated, so everything the strip builds later has to bind itself. Nothing
  // did: no strip segment tooltip had ever appeared, including the goal's, which
  // is the only place the untruncated type is shown.
  const tipShows = async (sel) => {
    await page.mouse.move(400, 300);
    await wait(300);
    const el = await page.$(sel);
    if (!el) return '';
    await el.hover();
    await wait(900);
    return page.evaluate(() => {
      const t = document.querySelector('.jar-tooltip, [class*=tooltip]');
      return t && getComputedStyle(t).display !== 'none' ? (t.textContent || '').trim() : '';
    });
  };
  check((await tipShows('.jar-hist__row')).length > 0,
    'a panel row binds its own tooltip rather than relying on the boot sweep');
  check((await tipShows('.jar-strip__seg--checker')).length > 0,
    'and so does every strip segment');

  // Travelling: clicking the third step back must apply three real undos.
  const before = await snap();
  await page.evaluate(() => {
    const r = [...document.querySelectorAll('.jar-hist__row')].filter((x) => !x.classList.contains('is-ahead'))[2];
    if (r) r.click();
  });
  await wait(900);
  const after = await snap();
  check(after.undo === before.undo - 3, 'clicking the third row back undoes exactly three steps',
    `${before.undo} -> ${after.undo}`);
  check(after.redo === before.redo + 3, 'and the three land on the redo stack');
  const w1 = await widget();
  check(w1.branched, 'the widget flags the waiting redo branch');
  check(w1.text === String(after.undo), 'and re-counts without waiting for a caret move');
  const aheadRows = await page.evaluate(() =>
    document.querySelectorAll('.jar-hist__row.is-ahead').length);
  check(aheadRows === 3, 'the panel shows three steps ahead of the marker', String(aheadRows));

  // Escape closes; the widget stops claiming to be open.
  await page.keyboard.press('Escape');
  await wait(400);
  check(!(await page.evaluate(() => !!document.querySelector('.jar-hist'))), 'Escape closes the panel');
  check((await widget()).expanded === 'false', 'and the widget stops reporting itself expanded');

  // The command layer reaches the same panel.
  await page.evaluate(() => Commands.run('view.edit-history'));
  await wait(600);
  check(await page.evaluate(() => !!document.querySelector('.jar-hist')),
    'view.edit-history opens the same panel');
  await page.keyboard.press('Escape');
  await wait(300);

  // ── 12. undoing back to a clean file leaves NO phantom diagnostic ────────
  //
  // ⛔ Reported as "phantom errors like this should be patently impossible".
  // Settlement's frontier-empty fast path carried the previous findings forward
  // whenever the dirty frontier was empty — and an undo replaces the whole
  // document at once, which can leave nothing marked dirty. The error from
  // before the undo was stamped as a fresh `ready` verdict on a file that no
  // longer contained it, and nothing re-checked, so it survived until the file
  // was closed and reopened.
  //
  // The check is on the CHECKER's own snapshot, not just the error count: a
  // snapshot reporting `ok` while still holding a diagnostic is the shape of the
  // bug, and counting alone would miss it.
  await page.evaluate(() => {
    const v = CurrentEditor.getView();
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: ['LF nat : type =', '| z : nat', ';', ''].join(String.fromCharCode(10)) } });
    v.focus();
    EditHistory.swapProject('probe-phantom-' + Math.random().toString(36).slice(2));
  });
  await wait(4000);
  const clean = await page.evaluate(() => CurrentEditor.getIdeStatus().errors);
  check(clean === 0, 'the base file checks clean', String(clean));

  await page.click('.cm-content');
  await page.evaluate(() => {
    const v = CurrentEditor.getView();
    v.dispatch({ selection: { anchor: v.state.doc.length } });
  });
  await type('LF bad : type = | q : nosuchtype;', 600);
  await wait(6000);
  check((await page.evaluate(() => CurrentEditor.getIdeStatus().errors)) > 0,
    'the broken edit reports an error');

  await page.evaluate(() => { let n = 0; while (EditHistory.undo() && n++ < 200) { /* to the start */ } });
  await wait(6000);
  const afterUndoAll = await page.evaluate(() => {
    const snap = CurrentEditor.getSemanticEngine?.()?.getSnapshot?.() || null;
    return {
      errors: CurrentEditor.getIdeStatus().errors,
      ok: snap ? snap.checker.ok : null,
      diags: snap ? (snap.checker.belugaDiagnostics || []).length : -1,
      stale: snap ? (snap.checker.belugaDiagnostics || []).filter((d) => d.stale).length : -1,
      state: snap ? snap.checker.state : null,
    };
  });
  check(afterUndoAll.errors === 0, 'undoing every edit leaves no phantom error',
    JSON.stringify(afterUndoAll));
  check(afterUndoAll.diags === 0, 'and the checker holds no leftover diagnostic',
    JSON.stringify(afterUndoAll));
  check(!(afterUndoAll.state === 'ready' && afterUndoAll.stale > 0),
    'a ready verdict never carries an unverified finding', JSON.stringify(afterUndoAll));
  check(!(afterUndoAll.ok === true && afterUndoAll.diags > 0),
    'the checker never reports ok while holding diagnostics', JSON.stringify(afterUndoAll));

  // ── 13. renaming a file is a STEP, through the real explorer UI ──────────
  //
  // ⛔ The worst shape a missing step can take. A rename keeps the id and
  // changes the name, so nothing in an entry could see it and `diffWorkspace`
  // recorded NOTHING — the Ctrl+Z a user presses to take a rename back reached
  // past it and silently reverted their last EDIT, while the rename stood. A
  // step that cannot be represented is worse than one that is refused: it makes
  // the key next to it lie.
  //
  // Driven through the context menu, not through `Persist.renameFile` — the
  // engine could record renames for a week while the call site stayed unwrapped.
  await page.evaluate(() => {
    const v = CurrentEditor.getView();
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: '' } });
    EditHistory.swapProject('probe-rename-' + Math.random().toString(36).slice(2));
  });
  await wait(1500);
  await page.click('.cm-content');
  await type('RENAME PROBE TEXT', 500);
  await wait(700);
  const beforeRename = await page.evaluate(() => ({
    name: Persist.getFileById(Persist.getActiveFileId()).name,
    undo: EditHistory.getUndoStack().length,
    doc: CurrentEditor.getValue(),
  }));
  check(beforeRename.undo >= 1, 'the typing that precedes the rename is on the stack',
    JSON.stringify(beforeRename));

  await page.evaluate(() => Commands.run('view.explorer'));
  await wait(900);
  // ⚠ The row for the file the EDITOR is on, by id — not `querySelector`'s
  // first row. Earlier phases leave several files in the project, and renaming
  // whichever happened to sort first measures nothing about the file under test.
  const rowBox = await page.evaluate(() => {
    const want = Persist.getActiveFileId();
    const el = [...document.querySelectorAll('.explorer-file-item')]
      .find((n) => n.getAttribute('data-file-id') === want);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: want };
  });
  check(!!rowBox, 'the explorer shows the file the editor is on');
  if (rowBox) {
    await page.mouse.click(rowBox.x, rowBox.y, { button: 'right' });
    await wait(450);
    const opened = await page.evaluate(() => {
      const items = [...document.querySelectorAll('[role="menuitem"], .menu-item, .jar-menu-item')];
      const hit = items.find((e) => /rename/i.test(e.textContent || ''));
      if (!hit) return false;
      hit.click();
      return true;
    });
    check(opened, 'and its context menu offers Rename');
    await wait(500);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.type('renamed-by-probe.bel');
    await page.keyboard.press('Enter');
    await wait(1000);

    const renamed = await page.evaluate((id) => ({
      name: Persist.getFileById(id).name,
      undo: EditHistory.getUndoStack().length,
      top: EditHistory.getUndoStack().slice(-1).map((e) => ({
        kind: e.kind,
        renamed: (e.structural && e.structural.renamed) || [],
      }))[0] || null,
      doc: CurrentEditor.getValue(),
    }), rowBox.id);
    check(/renamed-by-probe\.bel$/.test(renamed.name), 'the rename landed', renamed.name);
    check(renamed.undo === beforeRename.undo + 1,
      'and it pushed exactly ONE step', JSON.stringify({ was: beforeRename.undo, now: renamed.undo }));
    check(renamed.top && renamed.top.renamed.length === 1,
      'the step carries the rename itself, not a delete plus a create',
      JSON.stringify(renamed.top));

    await page.click('.cm-content');
    await undoOnce();
    await wait(900);
    const back = await page.evaluate((id) => ({
      name: Persist.getFileById(id).name,
      doc: CurrentEditor.getValue(),
    }), rowBox.id);
    check(back.name === beforeRename.name, 'undo puts the NAME back', JSON.stringify(back));
    // ⛔ The half that was actually broken: the text must be untouched.
    check(back.doc === beforeRename.doc,
      'and leaves the text alone — it used to revert the previous edit instead',
      JSON.stringify({ want: beforeRename.doc, got: back.doc }));

    await redoOnce();
    await wait(900);
    const again = await page.evaluate((id) => Persist.getFileById(id).name, rowBox.id);
    check(/renamed-by-probe\.bel$/.test(again), 'redo renames it again', again);
    await undoOnce();
    await wait(700);
  }

  check((await toasts()).length === 0, 'the whole probe raised no toasts');
} catch (e) {
  crash = e;
}

await finish('undo/redo', crash);
