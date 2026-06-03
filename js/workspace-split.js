(function (global) {
  var STACK_MQ = '(max-width: 48rem)';
  var HIT_GRACE_PX = 6;

  function init(opts) {
    opts = opts || {};
    var workspace = document.querySelector('.workspace');
    var workspacePanes = document.querySelector('.workspace-panes');
    var editorPanel = document.querySelector('.editor-panel');
    var outputPanel = document.querySelector('.output-panel');
    var sidebar = document.querySelector('.workspace .sidebar');
    var explorerPanel = document.querySelector('.explorer-panel');
    if (!workspace || !workspacePanes || !editorPanel || !outputPanel) return null;

    var persist = global.BelJarPersist;
    var ratio =
      persist && persist.readStoredEditorSplit
        ? persist.readStoredEditorSplit()
        : 0.5;
    var stackedMq = global.matchMedia(STACK_MQ);
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
      var rest = 1 - r;
      if (isStacked()) {
        root.removeProperty('--workspace-split-cols');
        root.setProperty(
          '--workspace-split-rows',
          'minmax(8rem, ' + r + 'fr) minmax(8rem, ' + rest + 'fr)'
        );
      } else {
        root.removeProperty('--workspace-split-rows');
        root.setProperty(
          '--workspace-split-cols',
          'minmax(12rem, ' + r + 'fr) minmax(12rem, ' + rest + 'fr)'
        );
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
      if (
        explorerPanel &&
        workspace.classList.contains('is-explorer-open') &&
        explorerPanel.getBoundingClientRect().width > 0
      ) {
        left = explorerPanel.getBoundingClientRect().right;
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
      global.removeEventListener('pointermove', onPointerMove);
      global.removeEventListener('pointerup', endDrag);
      global.removeEventListener('pointercancel', endDrag);
    }

    function startDrag(ev) {
      if (ev.button !== 0) return;
      ev.preventDefault();
      setDragging(true);
      ratio = pointerRatio(ev);
      applyLayout(true);
      global.addEventListener('pointermove', onPointerMove);
      global.addEventListener('pointerup', endDrag);
      global.addEventListener('pointercancel', endDrag);
    }

    hitStrip.addEventListener('pointerdown', startDrag);

    stackedMq.addEventListener('change', function () {
      applyLayout(false);
    });

    global.addEventListener('resize', positionHitStrip);

    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () {
        positionHitStrip();
      });
      ro.observe(workspacePanes);
      ro.observe(editorPanel);
    }

    applyLayout(false);
    return { getRatio: function () { return ratio; } };
  }

  global.BelJarWorkspaceSplit = { init: init };
})(typeof window !== 'undefined' ? window : globalThis);
