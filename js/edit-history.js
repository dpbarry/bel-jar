(function (global) {
  'use strict';

  var history = null;

  function toast(msg, kind) {
    var T = global.BelJarToasts;
    if (!T) return;
    if (kind === 'error' && T.error) T.error(msg);
    else if (T.info) T.info(msg);
  }

  function projectKey() {
    var P = global.BelJarPersist;
    if (!P) return 'default';
    var pid = P.getActiveProjectId?.();
    if (pid) return String(pid);
    return P.getProjectName?.() || 'default';
  }

  function buildAdapter() {
    var P = global.BelJarPersist;
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
      getActiveEditor: function () { return global.BelJarCurrentEditor || null; },
      flushCheckpoint: function () {
        var ed = global.BelJarCurrentEditor;
        if (ed && typeof ed.flushCheckpoint === 'function') ed.flushCheckpoint();
      },
      syncActiveEditorCheckpoint: function (text) {
        var P = global.BelJarPersist;
        if (!P || text == null) return;
        if (typeof P.replaceEditorText === 'function') P.replaceEditorText(text);
        if (typeof P.flushCheckpoint === 'function') P.flushCheckpoint();
      },
      toast: toast,
      onApplied: function (entry, direction) {
        if (typeof global.dispatchEvent === 'function') {
          global.dispatchEvent(new CustomEvent('beljar:edit-history-applied', {
            detail: { entry: entry, direction: direction },
          }));
        }
        var active = entry.structural && entry.structural.activeFileId;
        if (active && global.BelJarPersist) {
          var target = direction === 'undo' ? active.before : active.after;
          var cur = global.BelJarPersist.getActiveFileId();
          if (target && target !== cur && typeof global.belJarSwitchToFileForHistory === 'function') {
            global.belJarSwitchToFileForHistory(target);
          }
        }
      },
    };
  }

  function init() {
    if (typeof global.BelJarEditor === 'undefined' || !global.BelJarEditor.createEditHistory) return null;
    history = global.BelJarEditor.createEditHistory(buildAdapter());
    global.BelJarEditHistory = history;
    return history;
  }

  function swapProject() {
    if (!history) init();
    if (history) history.swapProject(projectKey());
  }

  global.BelJarEditHistoryBridge = {
    init: init,
    swapProject: swapProject,
    projectKey: projectKey,
  };

  function onPageExit() {
    if (history) {
      history.flushTypingGroup();
      history.flushCheckpoint();
    }
  }
  global.addEventListener('pagehide', onPageExit);
  global.addEventListener('beforeunload', onPageExit);
})(typeof window !== 'undefined' ? window : globalThis);
