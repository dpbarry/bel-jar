(function (global) {
  var STACK_MQ = '(max-width: 48rem)';
  var HIT_GRACE_PX = 6;

  function init(opts) {
    opts = opts || {};
    var workspace = document.querySelector('.workspace');
    var explorerPanel = document.querySelector('.explorer-panel');
    var inspectorPanel = document.querySelector('.inspector-panel');
    if (!workspace) return null;

    var persist = global.BelJarPersist;
    var stackedMq = global.matchMedia(STACK_MQ);
    var resizers = [];

    function isStacked() {
      return stackedMq.matches;
    }

    function createResizer(config) {
      var panel = config.panel;
      if (!panel) return null;

      var dragging = false;
      var size = config.read(isStacked());

      var hitStrip = document.createElement('div');
      hitStrip.className = 'panel-resize-hit';
      hitStrip.setAttribute('aria-hidden', 'true');
      hitStrip.tabIndex = -1;
      panel.appendChild(hitStrip);

      function isOpen() {
        return workspace.classList.contains(config.openClass);
      }

      function applySize(save) {
        if (save && config.write) config.write(Math.round(size), isStacked());
        size = config.read(isStacked());
        var root = document.documentElement.style;
        if (isStacked()) {
          root.setProperty(config.cssVarH, size + 'px');
        } else {
          root.setProperty(config.cssVarW, size + 'px');
        }
        if (typeof opts.onResize === 'function') opts.onResize();
        requestAnimationFrame(positionHitStrip);
      }

      function activeSeam() {
        return isStacked() ? config.seamStacked : config.seam;
      }

      function positionHitStrip() {
        if (!isOpen()) {
          hitStrip.style.display = 'none';
          return;
        }
        hitStrip.style.display = '';
        var span = HIT_GRACE_PX * 2;
        var seam = activeSeam();
        if (isStacked()) {
          hitStrip.style.left = '0';
          hitStrip.style.right = '0';
          hitStrip.style.width = '';
          hitStrip.style.height = span + 'px';
          if (seam === 'bottom') {
            hitStrip.style.top = '';
            hitStrip.style.bottom = -HIT_GRACE_PX + 'px';
          } else {
            hitStrip.style.top = -HIT_GRACE_PX + 'px';
            hitStrip.style.bottom = '';
          }
        } else {
          hitStrip.style.top = '0';
          hitStrip.style.bottom = '0';
          hitStrip.style.height = '';
          hitStrip.style.width = span + 'px';
          if (seam === 'right') {
            hitStrip.style.left = '';
            hitStrip.style.right = -HIT_GRACE_PX + 'px';
          } else {
            hitStrip.style.left = -HIT_GRACE_PX + 'px';
            hitStrip.style.right = '';
          }
        }
      }

      function pointerSize(ev) {
        var pr = panel.getBoundingClientRect();
        var seam = activeSeam();
        if (isStacked()) {
          if (seam === 'bottom') return ev.clientY - pr.top;
          return pr.bottom - ev.clientY;
        }
        if (seam === 'right') return ev.clientX - pr.left;
        return pr.right - ev.clientX;
      }

      function setDragging(on) {
        dragging = on;
        document.body.classList.toggle('workspace-resizing', on);
      }

      function onPointerMove(ev) {
        if (!dragging) return;
        ev.preventDefault();
        size = pointerSize(ev);
        applySize(true);
      }

      function endDrag() {
        if (!dragging) return;
        setDragging(false);
        global.removeEventListener('pointermove', onPointerMove);
        global.removeEventListener('pointerup', endDrag);
        global.removeEventListener('pointercancel', endDrag);
      }

      function startDrag(ev) {
        if (!isOpen() || ev.button !== 0) return;
        ev.preventDefault();
        setDragging(true);
        size = pointerSize(ev);
        applySize(true);
        global.addEventListener('pointermove', onPointerMove);
        global.addEventListener('pointerup', endDrag);
        global.addEventListener('pointercancel', endDrag);
      }

      hitStrip.addEventListener('pointerdown', startDrag);

      return {
        refresh: function () {
          size = config.read(isStacked());
          applySize(false);
        },
        reposition: positionHitStrip,
      };
    }

    if (persist) {
      document.documentElement.style.setProperty('--explorer-w', persist.readStoredExplorerWidth() + 'px');
      document.documentElement.style.setProperty('--inspector-w', persist.readStoredInspectorWidth() + 'px');
      document.documentElement.style.setProperty('--explorer-h', persist.readStoredExplorerHeight() + 'px');
      document.documentElement.style.setProperty('--inspector-h', persist.readStoredInspectorHeight() + 'px');
    }

    var explorerResizer = createResizer({
      panel: explorerPanel,
      openClass: 'is-explorer-open',
      cssVarW: '--explorer-w',
      cssVarH: '--explorer-h',
      seam: 'right',
      seamStacked: 'bottom',
      read: function (stacked) {
        return persist
          ? (stacked ? persist.readStoredExplorerHeight() : persist.readStoredExplorerWidth())
          : (stacked ? 160 : 224);
      },
      write: function (px, stacked) {
        if (!persist) return;
        if (stacked) persist.writeStoredExplorerHeight(px);
        else persist.writeStoredExplorerWidth(px);
      },
    });

    var inspectorResizer = createResizer({
      panel: inspectorPanel,
      openClass: 'is-inspector-open',
      cssVarW: '--inspector-w',
      cssVarH: '--inspector-h',
      seam: 'right',
      seamStacked: 'bottom',
      read: function (stacked) {
        return persist
          ? (stacked ? persist.readStoredInspectorHeight() : persist.readStoredInspectorWidth())
          : (stacked ? 192 : 256);
      },
      write: function (px, stacked) {
        if (!persist) return;
        if (stacked) persist.writeStoredInspectorHeight(px);
        else persist.writeStoredInspectorWidth(px);
      },
    });

    if (explorerResizer) resizers.push(explorerResizer);
    if (inspectorResizer) resizers.push(inspectorResizer);

    function refreshAll() {
      for (var i = 0; i < resizers.length; i++) resizers[i].refresh();
    }

    function repositionAll() {
      for (var i = 0; i < resizers.length; i++) resizers[i].reposition();
    }

    stackedMq.addEventListener('change', refreshAll);
    global.addEventListener('resize', repositionAll);

    if (typeof MutationObserver !== 'undefined') {
      var mo = new MutationObserver(repositionAll);
      mo.observe(workspace, { attributes: true, attributeFilter: ['class'] });
    }

    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(repositionAll);
      if (explorerPanel) ro.observe(explorerPanel);
      if (inspectorPanel) ro.observe(inspectorPanel);
    }

    refreshAll();
    return { refresh: refreshAll };
  }

  global.BelJarSidePanelResize = { init: init };
})(typeof window !== 'undefined' ? window : globalThis);
