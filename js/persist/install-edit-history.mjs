const global = globalThis;
var history = null;

  function toast(msg, kind) {
    var T = global.Toasts;
    if (!T) return;
    if (kind === 'error' && T.error) T.error(msg);
    else if (T.info) T.info(msg);
  }

  function projectKey() {
    var P = global.Persist;
    if (!P) return 'default';
    var pid = P.getActiveProjectId?.();
    if (pid) return String(pid);
    return P.getProjectName?.() || 'default';
  }

  /**
   * Which file the user should be looking at once this step has been applied,
   * or null to leave the editor where it is.
   *
   * ⛔ An undo that edits a file you cannot see is a side effect, not an undo.
   * A plain tab switch is not itself a history step, so an entry made before
   * the switch carries no `structural.activeFileId` to follow — undoing past a
   * switch used to rewrite the off-screen file in silence.
   */
  function fileToBringForward(entry, direction, P) {
    var cur = P.getActiveFileId();
    var target = null;
    var active = entry.structural && entry.structural.activeFileId;
    if (active) target = direction === 'undo' ? active.before : active.after;

    if (!target) {
      var ids = Object.keys(entry.files || {});
      var offScreen = [];
      for (var i = 0; i < ids.length; i++) {
        if (ids[i] !== cur && P.getFileById(ids[i])) offScreen.push(ids[i]);
      }
      // Only when NOTHING the step touched is already in front of them.
      if (offScreen.length === ids.length && offScreen.length) target = offScreen[0];
    }

    if (!target || !P.getFileById(target)) return null;
    if (target === cur) {
      // Persist already agrees; the editor may still be mounted on a file this
      // step deleted, which the app's resync handles.
      return null;
    }
    return target;
  }

  function buildAdapter() {
    var P = global.Persist;
    return {
      projectKey: projectKey(),
      sessionStorage: global.sessionStorage || null,
      getFileText: function (id) { return P.getFileText(id); },
      setFileText: function (id, text) { P.setFileText(id, text); },
      listFiles: function () { return P.listFiles(); },
      getFileById: function (id) { return P.getFileById(id); },
      restoreDeletedFile: function (id, name, text) {
        return P.restoreDeletedFile(id, name, text);
      },
      deleteFile: function (id) { P.deleteFile(id); return true; },
      getOpenFileIds: function () { return P.getOpenFileIds(); },
      setOpenFileIds: function (ids) { P.setOpenFileIds(ids); },
      listEmptyFolders: function () {
        return typeof P.listEmptyFolders === 'function' ? P.listEmptyFolders() : null;
      },
      // Diffed rather than written wholesale: add/removeEmptyFolder are what
      // notify the explorer, so going through them keeps the tree in step.
      setEmptyFolders: function (paths) {
        if (typeof P.listEmptyFolders !== 'function') return;
        var want = {};
        var i;
        for (i = 0; i < (paths || []).length; i++) want[paths[i]] = true;
        var have = P.listEmptyFolders() || [];
        for (i = 0; i < have.length; i++) {
          if (!want[have[i]] && typeof P.removeEmptyFolder === 'function') {
            P.removeEmptyFolder(have[i]);
          }
        }
        have = P.listEmptyFolders() || [];
        var present = {};
        for (i = 0; i < have.length; i++) present[have[i]] = true;
        for (i = 0; i < (paths || []).length; i++) {
          if (!present[paths[i]] && typeof P.addEmptyFolder === 'function') {
            P.addEmptyFolder(paths[i]);
          }
        }
      },
      getActiveFileId: function () { return P.getActiveFileId(); },
      setActiveFileId: function (id) { P.setActiveFileId(id); },
      getActiveEditor: function () { return global.CurrentEditor || null; },
      flushCheckpoint: function () {
        var ed = global.CurrentEditor;
        if (ed && typeof ed.flushCheckpoint === 'function') ed.flushCheckpoint();
      },
      syncActiveEditorCheckpoint: function (text) {
        var P = global.Persist;
        if (!P || text == null) return;
        if (typeof P.replaceEditorText === 'function') P.replaceEditorText(text);
        if (typeof P.flushCheckpoint === 'function') P.flushCheckpoint();
      },
      captureViewport: function () {
        var ed = global.CurrentEditor;
        if (ed && typeof ed.getViewport === 'function') return ed.getViewport();
        return null;
      },
      captureSelection: function () {
        var ed = global.CurrentEditor;
        if (ed && typeof ed.getViewport === 'function') {
          var local = ed.getViewport();
          if (local && local.selection) return local.selection;
        }
        return null;
      },
      toast: toast,
      /**
       * The strip's `⟲` widget counts what is on the stack, so it has to be told
       * when the stack moves — a widget that polls shows a stale number until
       * something unrelated happens to repaint it. This fires on every push,
       * apply, amend and project swap, which is exactly the set of moments the
       * count can change.
       */
      onStackChange: function () {
        var S = global.StatusStrip;
        if (!S || typeof S.setHistoryDepth !== 'function' || !history) return;
        S.setHistoryDepth(history.getUndoStack().length, history.getRedoStack().length);
      },
      /**
       * Show the user the file their keystroke just changed.
       *
       * ⛔ An undo that edits a file you cannot see is a side effect, not an
       * undo. A plain tab switch is not itself a history step, so an entry made
       * before the switch carries no `structural.activeFileId` to follow — and
       * undoing past a switch used to rewrite the off-screen file in silence,
       * leaving the user staring at an unchanged buffer wondering what Ctrl+Z
       * did. If the step touches no file that is on screen, bring one of the
       * files it DOES touch to the front.
       */
      onApplied: function (entry, direction) {
        // ⛔ Order matters. Move the editor to the right file FIRST, then fire
        // the event — the app's `beljar:edit-history-applied` handler reconciles
        // the editor, tabs and explorer with the workspace, and it must see the
        // finished state. Firing first made it reconcile against a workspace we
        // were about to change again, and the two switches fought.
        var P = global.Persist;
        if (P && typeof global.belJarSwitchToFileForHistory === 'function') {
          var target = fileToBringForward(entry, direction, P);
          if (target) {
            var rec = entry.files && entry.files[target];
            var local = null;
            if (rec) local = direction === 'undo' ? (rec.beforeLocal || null) : (rec.afterLocal || null);
            if (!local && entry.editorLocal && entry.editorLocal[target]) {
              local = entry.editorLocal[target];
            }
            global.belJarSwitchToFileForHistory(target, local);
          }
        }
        if (typeof global.dispatchEvent === 'function') {
          global.dispatchEvent(new CustomEvent('beljar:edit-history-applied', {
            detail: { entry: entry, direction: direction },
          }));
        }
      },
    };
  }

  function init() {
    if (typeof global.BelEditor === 'undefined' || !global.BelEditor.createEditHistory) return null;
    history = global.BelEditor.createEditHistory(buildAdapter());
    global.EditHistory = history;
    global.BelJarEditHistory = global.EditHistory
    return history;
  }

  function swapProject() {
    if (!history) init();
    if (history) history.swapProject(projectKey());
  }

  global.EditHistoryInstall = {
    init: init,
    swapProject: swapProject,
    projectKey: projectKey,
  };
  global.BelJarEditHistoryInstall = global.EditHistoryInstall;

  function onPageExit() {
    if (history) {
      history.flushTypingGroup();
      history.flushCheckpoint();
    }
  }
  global.addEventListener('pagehide', onPageExit);
  global.addEventListener('beforeunload', onPageExit);
