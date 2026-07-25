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
      onApplied: function (entry, direction) {
        if (typeof global.dispatchEvent === 'function') {
          global.dispatchEvent(new CustomEvent('beljar:edit-history-applied', {
            detail: { entry: entry, direction: direction },
          }));
        }
        var active = entry.structural && entry.structural.activeFileId;
        if (active && global.Persist) {
          var target = direction === 'undo' ? active.before : active.after;
          var cur = global.Persist.getActiveFileId();
          if (target && target !== cur && typeof global.belJarSwitchToFileForHistory === 'function') {
            var rec = entry.files && entry.files[target];
            var local = null;
            if (rec) {
              local = direction === 'undo' ? (rec.beforeLocal || null) : (rec.afterLocal || null);
            }
            if (!local && entry.editorLocal && entry.editorLocal[target]) {
              local = entry.editorLocal[target];
            }
            global.belJarSwitchToFileForHistory(target, local);
          }
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
