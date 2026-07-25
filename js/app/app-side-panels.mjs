/**
 * Side-panel open/close for Explorer / Inspector / Library / Harpoon.
 */

  export function create(opts) {
    var workspaceEl = opts.workspaceEl;
    var panels = opts.panels || {};
    var onLayout = opts.onLayout || function () {};
    var scheduleWorkspaceSave = opts.scheduleWorkspaceSave || function () {};

    function getOpenSidePanelId() {
      if (!workspaceEl) return null;
      var order = ['harpoon', 'library', 'inspector', 'explorer'];
      for (var i = 0; i < order.length; i++) {
        var id = order[i];
        var cfg = panels[id];
        if (cfg && workspaceEl.classList.contains(cfg.openClass)) return id;
      }
      return null;
    }

    function setSidePanelOpen(id, open) {
      var cfg = panels[id];
      if (!workspaceEl || !cfg) return;
      workspaceEl.classList.toggle(cfg.openClass, open);
      if (cfg.btn) {
        cfg.btn.classList.toggle('is-active', open);
        cfg.btn.setAttribute('aria-pressed', open ? 'true' : 'false');
      }
      if (cfg.panel) cfg.panel.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (typeof cfg.writeOpen === 'function') cfg.writeOpen(open);
      if (typeof Persist !== 'undefined' && Persist.writeStoredActiveSidePanel) {
        if (open) Persist.writeStoredActiveSidePanel(id);
        else if (!getOpenSidePanelId()) Persist.writeStoredActiveSidePanel(null);
      }
      scheduleWorkspaceSave();
    }

    function closeOtherSidePanels(id) {
      Object.keys(panels).forEach(function (otherId) {
        if (otherId !== id) setSidePanelOpen(otherId, false);
      });
    }

    function notifySidePanelLayout() {
      onLayout();
      window.dispatchEvent(new Event('resize'));
    }

    function toggleSidePanel(id) {
      var cfg = panels[id];
      if (!workspaceEl || !cfg) return false;
      var open = !workspaceEl.classList.contains(cfg.openClass);
      if (open) closeOtherSidePanels(id);
      setSidePanelOpen(id, open);
      notifySidePanelLayout();
      return open;
    }

    function wireSidebarOpenTooltip(btn) {
      if (!btn || typeof Tooltips === 'undefined') return function () {};
      btn.addEventListener('mouseleave', function () {
        Tooltips.releaseAnchor(btn);
      });
      return function () {
        Tooltips.suppressAnchor(btn);
        Tooltips.hideImmediate();
      };
    }

    return {
      setSidePanelOpen: setSidePanelOpen,
      getOpenSidePanelId: getOpenSidePanelId,
      closeOtherSidePanels: closeOtherSidePanels,
      notifySidePanelLayout: notifySidePanelLayout,
      toggleSidePanel: toggleSidePanel,
      wireSidebarOpenTooltip: wireSidebarOpenTooltip,
    };
  }
