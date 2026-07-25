var STACK_MQ = '(max-width: 48rem)';
  var HIT_GRACE_PX = 6;
  var DEFAULT_W = 250;
  var DEFAULT_H = 190;

  function init(opts) {
    opts = opts || {};
    var workspace = document.querySelector('.workspace');
    if (!workspace) return null;

    var persist = globalThis.Persist;
    if (persist) {
      DEFAULT_W = persist.DEFAULT_SIDE_PANEL_WIDTH || DEFAULT_W;
      DEFAULT_H = persist.DEFAULT_SIDE_PANEL_HEIGHT || DEFAULT_H;
    }

    var stackedMq = globalThis.matchMedia(STACK_MQ);
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
        globalThis.removeEventListener('pointermove', onPointerMove);
        globalThis.removeEventListener('pointerup', endDrag);
        globalThis.removeEventListener('pointercancel', endDrag);
      }

      function startDrag(ev) {
        if (!isOpen() || ev.button !== 0) return;
        ev.preventDefault();
        setDragging(true);
        size = pointerSize(ev);
        applySize(true);
        globalThis.addEventListener('pointermove', onPointerMove);
        globalThis.addEventListener('pointerup', endDrag);
        globalThis.addEventListener('pointercancel', endDrag);
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

    var panelConfigs = [
      {
        panel: document.querySelector('.explorer-panel'),
        openClass: 'is-explorer-open',
        cssVarW: '--explorer-w',
        cssVarH: '--explorer-h',
        read: function (stacked) {
          if (!persist) return stacked ? DEFAULT_H : DEFAULT_W;
          return stacked ? persist.readStoredExplorerHeight() : persist.readStoredExplorerWidth();
        },
        write: function (px, stacked) {
          if (!persist) return;
          if (stacked) persist.writeStoredExplorerHeight(px);
          else persist.writeStoredExplorerWidth(px);
        },
      },
      {
        panel: document.querySelector('.inspector-panel'),
        openClass: 'is-inspector-open',
        cssVarW: '--inspector-w',
        cssVarH: '--inspector-h',
        read: function (stacked) {
          if (!persist) return stacked ? DEFAULT_H : DEFAULT_W;
          return stacked ? persist.readStoredInspectorHeight() : persist.readStoredInspectorWidth();
        },
        write: function (px, stacked) {
          if (!persist) return;
          if (stacked) persist.writeStoredInspectorHeight(px);
          else persist.writeStoredInspectorWidth(px);
        },
      },
      {
        panel: document.querySelector('.library-panel'),
        openClass: 'is-library-open',
        cssVarW: '--library-w',
        cssVarH: '--library-h',
        read: function (stacked) {
          if (!persist) return stacked ? DEFAULT_H : DEFAULT_W;
          return stacked ? persist.readStoredLibraryHeight() : persist.readStoredLibraryWidth();
        },
        write: function (px, stacked) {
          if (!persist) return;
          if (stacked) persist.writeStoredLibraryHeight(px);
          else persist.writeStoredLibraryWidth(px);
        },
      },
      {
        panel: document.querySelector('.harpoon-panel'),
        openClass: 'is-harpoon-open',
        cssVarW: '--harpoon-w',
        cssVarH: '--harpoon-h',
        read: function (stacked) {
          if (!persist) return stacked ? DEFAULT_H : DEFAULT_W;
          return stacked ? persist.readStoredHarpoonHeight() : persist.readStoredHarpoonWidth();
        },
        write: function (px, stacked) {
          if (!persist) return;
          if (stacked) persist.writeStoredHarpoonHeight(px);
          else persist.writeStoredHarpoonWidth(px);
        },
      },
    ];

    if (persist) {
      var root = document.documentElement.style;
      for (var i = 0; i < panelConfigs.length; i++) {
        var cfg = panelConfigs[i];
        root.setProperty(cfg.cssVarW, cfg.read(false) + 'px');
        root.setProperty(cfg.cssVarH, cfg.read(true) + 'px');
      }
    }

    for (var j = 0; j < panelConfigs.length; j++) {
      panelConfigs[j].seam = 'right';
      panelConfigs[j].seamStacked = 'bottom';
      var resizer = createResizer(panelConfigs[j]);
      if (resizer) resizers.push(resizer);
    }

    function refreshAll() {
      for (var k = 0; k < resizers.length; k++) resizers[k].refresh();
    }

    function repositionAll() {
      for (var m = 0; m < resizers.length; m++) resizers[m].reposition();
    }

    stackedMq.addEventListener('change', refreshAll);
    globalThis.addEventListener('resize', repositionAll);

    if (typeof MutationObserver !== 'undefined') {
      var mo = new MutationObserver(repositionAll);
      mo.observe(workspace, { attributes: true, attributeFilter: ['class'] });
    }

    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(repositionAll);
      for (var n = 0; n < panelConfigs.length; n++) {
        if (panelConfigs[n].panel) ro.observe(panelConfigs[n].panel);
      }
    }

    refreshAll();
    return { refresh: refreshAll };
  }

  export const SidePanelResize = { init: init };

const g = typeof window !== 'undefined' ? window : globalThis;
g.SidePanelResize = SidePanelResize;
g.BelJarSidePanelResize = g.SidePanelResize
