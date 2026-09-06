var STACK_MQ = '(max-width: 48rem)';
  var HIT_GRACE_PX = 6;

  // The live layout, so a re-init replaces rather than stacks. init() builds a
  // fresh one; dispose() runs it and forgets it.
  var liveTeardown = null;

  function dispose() {
    var run = liveTeardown;
    liveTeardown = null;
    if (!run) return;
    try { run(); } catch (_) {}
  }

  function init(opts) {
    dispose();
    opts = opts || {};
    var workspace = document.querySelector('.workspace');
    var workspacePanes = document.querySelector('.workspace-panes');
    var editorPanel = document.querySelector('.editor-panel');
    var outputPanel = document.querySelector('.output-panel');
    var sidebar = document.querySelector('.workspace .sidebar');
    var explorerPanel = document.querySelector('.explorer-panel');
    var inspectorPanel = document.querySelector('.inspector-panel');
    var libraryPanel = document.querySelector('.library-panel');
    if (!workspace || !workspacePanes || !editorPanel || !outputPanel) return null;

    var persist = globalThis.Persist;
    var ratio =
      persist && persist.readStoredEditorSplit
        ? persist.readStoredEditorSplit()
        : 0.5;
    var stackedMq = globalThis.matchMedia(STACK_MQ);
    var dragging = false;

    var hitStrip = document.createElement('div');
    hitStrip.className = 'workspace-resize-hit';
    hitStrip.setAttribute('aria-hidden', 'true');
    hitStrip.tabIndex = -1;
    workspacePanes.appendChild(hitStrip);

    function clamp(r) {
      return persist && persist.clampEditorSplit
        ? persist.clampEditorSplit(r)
        : Math.min(0.82, Math.max(0.18, r));
    }

    function isStacked() {
      return stackedMq.matches;
    }

    function seamCoord() {
      var rect = editorPanel.getBoundingClientRect();
      return isStacked() ? rect.bottom : rect.right;
    }

    function positionHitStrip() {
      var panes = workspacePanes.getBoundingClientRect();
      var er = editorPanel.getBoundingClientRect();
      var seam = seamCoord();
      var span = HIT_GRACE_PX * 2;
      if (isStacked()) {
        hitStrip.style.left = er.left - panes.left + 'px';
        hitStrip.style.width = er.width + 'px';
        hitStrip.style.top = seam - panes.top - HIT_GRACE_PX + 'px';
        hitStrip.style.height = span + 'px';
      } else {
        hitStrip.style.top = er.top - panes.top + 'px';
        hitStrip.style.height = er.height + 'px';
        hitStrip.style.left = seam - panes.left - HIT_GRACE_PX + 'px';
        hitStrip.style.width = span + 'px';
      }
    }

    function applySplitVars(r) {
      var root = document.documentElement.style;
      var a = Math.round(r * 1e6) / 1e6;
      var b = Math.round((1 - r) * 1e6) / 1e6;
      // Plain fr tracks — minmax(Nrem, Xfr) leaves unclaimed free space (black void)
      // when Xfr's share is below Nrem. Panel min sizes are enforced in CSS instead.
      if (isStacked()) {
        root.removeProperty('--workspace-split-cols');
        root.setProperty('--workspace-split-rows', a + 'fr ' + b + 'fr');
      } else {
        root.removeProperty('--workspace-split-rows');
        root.setProperty('--workspace-split-cols', a + 'fr ' + b + 'fr');
      }
    }

    function applyLayout(save) {
      ratio = clamp(ratio);
      applySplitVars(ratio);
      if (save && persist && persist.writeStoredEditorSplit) {
        persist.writeStoredEditorSplit(ratio);
      }
      if (typeof opts.onResize === 'function') opts.onResize();
      requestAnimationFrame(positionHitStrip);
    }

    function pointerRatio(ev) {
      if (isStacked()) {
        var eRect = editorPanel.getBoundingClientRect();
        var oRect = outputPanel.getBoundingClientRect();
        var span = eRect.height + oRect.height;
        if (span <= 0) return ratio;
        return (ev.clientY - eRect.top) / span;
      }
      var left;
      var sidePanel = null;
      if (workspace.classList.contains('is-explorer-open')) sidePanel = explorerPanel;
      else if (workspace.classList.contains('is-inspector-open')) sidePanel = inspectorPanel;
      else if (workspace.classList.contains('is-library-open')) sidePanel = libraryPanel;
      if (sidePanel && sidePanel.getBoundingClientRect().width > 0) {
        left = sidePanel.getBoundingClientRect().right;
      } else {
        left = sidebar ? sidebar.getBoundingClientRect().right : workspace.getBoundingClientRect().left;
      }
      var right = workspacePanes.getBoundingClientRect().right;
      var span = right - left;
      if (span <= 0) return ratio;
      return (ev.clientX - left) / span;
    }

    function setDragging(on) {
      dragging = on;
      document.body.classList.toggle('workspace-resizing', on);
    }

    function onPointerMove(ev) {
      if (!dragging) return;
      ev.preventDefault();
      ratio = pointerRatio(ev);
      applyLayout(true);
    }

    function endDrag() {
      if (!dragging) return;
      setDragging(false);
      globalThis.removeEventListener('pointermove', onPointerMove);
      globalThis.removeEventListener('pointerup', endDrag);
      globalThis.removeEventListener('pointercancel', endDrag);
    }

    function startDrag(ev) {
      if (ev.button !== 0) return;
      ev.preventDefault();
      setDragging(true);
      ratio = pointerRatio(ev);
      applyLayout(true);
      globalThis.addEventListener('pointermove', onPointerMove);
      globalThis.addEventListener('pointerup', endDrag);
      globalThis.addEventListener('pointercancel', endDrag);
    }

    hitStrip.addEventListener('pointerdown', startDrag);

    function onStackedChange() {
      applyLayout(false);
    }
    stackedMq.addEventListener('change', onStackedChange);

    globalThis.addEventListener('resize', positionHitStrip);

    var ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(function () {
        positionHitStrip();
      });
      ro.observe(workspacePanes);
      ro.observe(editorPanel);
    }

    liveTeardown = function () {
      endDrag();
      hitStrip.removeEventListener('pointerdown', startDrag);
      stackedMq.removeEventListener('change', onStackedChange);
      globalThis.removeEventListener('resize', positionHitStrip);
      if (ro) ro.disconnect();
      if (hitStrip.parentNode) hitStrip.parentNode.removeChild(hitStrip);
    };

    applyLayout(false);
    return { getRatio: function () { return ratio; }, dispose: dispose };
  }

  export const WorkspaceSplit = { init: init, dispose: dispose };

const g = typeof window !== 'undefined' ? window : globalThis;
g.WorkspaceSplit = WorkspaceSplit;
g.BelJarWorkspaceSplit = g.WorkspaceSplit
