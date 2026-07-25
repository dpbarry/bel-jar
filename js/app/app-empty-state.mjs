/**
 * Empty-project / canvas-idle overlay helpers for the shell.
 */

  export function create(opts) {
    var getInspectorPanelEl = opts.getInspectorPanelEl;
    var getInspectorProjectEmptyEl = opts.getInspectorProjectEmptyEl;
    var getEditorEmptyEl = opts.getEditorEmptyEl;
    var getEditorMount = opts.getEditorMount;
    var projectTreeEmpty = opts.projectTreeEmpty;
    var editorCanvasIdle = opts.editorCanvasIdle;

    function setEmptyOverlayVisible(el, visible) {
      if (!el) return;
      el.hidden = !visible;
      el.setAttribute('aria-hidden', visible ? 'false' : 'true');
      if ('inert' in el) el.inert = !visible;
    }

    function updateInspectorProjectEmpty() {
      var inspectorPanelEl = getInspectorPanelEl && getInspectorPanelEl();
      if (!inspectorPanelEl) return;
      var body = inspectorPanelEl.querySelector('.inspector-body');
      var empty = projectTreeEmpty();
      setEmptyOverlayVisible(getInspectorProjectEmptyEl && getInspectorProjectEmptyEl(), empty);
      if (body) {
        body.hidden = empty;
        body.setAttribute('aria-hidden', empty ? 'true' : 'false');
      }
    }

    function updateEditorEmptyState() {
      var idle = editorCanvasIdle();
      setEmptyOverlayVisible(getEditorEmptyEl && getEditorEmptyEl(), idle);
      var mount = getEditorMount && getEditorMount();
      if (mount) mount.classList.toggle('is-inactive', idle);
      var runBtn = document.getElementById('btn-load');
      if (runBtn) runBtn.disabled = idle;
      var statusDot = document.getElementById('ide-status-dot');
      if (statusDot) statusDot.hidden = idle;
    }

    return {
      updateInspectorProjectEmpty: updateInspectorProjectEmpty,
      updateEditorEmptyState: updateEditorEmptyState,
    };
  }
