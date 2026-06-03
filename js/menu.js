(function (global) {
  'use strict';

  const FRP = global.FloatingRectPlacement;
  const MARGIN = FRP.DEFAULT_MARGIN;
  const GAP = FRP.DEFAULT_GAP;

  const customRowTypes = Object.create(null);

  const allControllers = new Set();

  let sharedGlobalsBound = false;
  let activeController = null;

  function submenuHoverOpen() {
    return FRP.prefersFineHover();
  }

  function onSharedPointerDown(e) {
    const c = activeController;
    if (!c || !c.menuRoot) return;
    const t = e.target;
    if (c.menuRoot.contains(t)) return;
    const ra = typeof c.rootAnchor === 'function' ? c.rootAnchor() : null;
    if (ra && ra instanceof Node && ra.contains(t)) return;
    c.closeAll();
  }

  function onSharedKeydown(e) {
    if (e.key === 'Escape' && activeController && activeController.isOpen()) {
      activeController.closeAll();
    }
  }

  function onSharedResize() {
    if (activeController && activeController.isOpen()) activeController.relayoutAll();
  }

  function attachSharedGlobals() {
    if (sharedGlobalsBound) return;
    document.addEventListener('pointerdown', onSharedPointerDown, true);
    document.addEventListener('keydown', onSharedKeydown, true);
    window.addEventListener('resize', onSharedResize);
    window.addEventListener('scroll', onSharedResize, true);
    sharedGlobalsBound = true;
  }

  function detachSharedGlobalsIfIdle() {
    if (!sharedGlobalsBound) return;
    if (activeController && activeController.isOpen()) return;
    document.removeEventListener('pointerdown', onSharedPointerDown, true);
    document.removeEventListener('keydown', onSharedKeydown, true);
    window.removeEventListener('resize', onSharedResize);
    window.removeEventListener('scroll', onSharedResize, true);
    sharedGlobalsBound = false;
  }

  function setActiveController(c) {
    activeController = c;
    if (c && c.isOpen()) attachSharedGlobals();
    else detachSharedGlobalsIfIdle();
  }

  function registerRowType(type, fn) {
    if (typeof type !== 'string' || typeof fn !== 'function') {
      throw new TypeError('Menu.registerRowType(type, fn): type string and fn required');
    }
    customRowTypes[type] = fn;
  }

  function createMenuController(menuRoot) {
    if (!menuRoot || !(menuRoot instanceof Element)) {
      throw new TypeError('Menu.create({ root }) requires a DOM element');
    }

    let openMenus = [];
    let rootAnchorEl = null;
    let rootOnClose = null;
    let submenuSourceRow = null;

    const controller = { menuRoot };

    function isOpen() {
      return openMenus.length > 0;
    }

    function rootAnchor() {
      return rootAnchorEl;
    }

    function anchorRect(anchor) {
      if (anchor instanceof Element) return anchor.getBoundingClientRect();
      return FRP.normalizeAnchor(anchor);
    }

    function submenuPlacementAnchor(anchorRowEl) {
      const parentMenuEl = anchorRowEl.closest('.menu');
      if (!parentMenuEl) {
        return { anchorRef: anchorRect(anchorRowEl), align: 'start' };
      }

      const rowEls = Array.from(parentMenuEl.querySelectorAll('.menu-item'));
      const rowIdx = rowEls.indexOf(anchorRowEl);
      const rowRect = anchorRowEl.getBoundingClientRect();
      const menuRect = parentMenuEl.getBoundingClientRect();

      const anchorRef = {
        left: menuRect.left,
        right: menuRect.right,
        top: rowRect.top,
        bottom: rowRect.bottom,
      };
      let align = 'start';

      if (rowIdx === 0) {
        anchorRef.top = menuRect.top;
      } else if (rowIdx === rowEls.length - 1) {
        anchorRef.bottom = menuRect.bottom;
        align = 'end';
      }

      return { anchorRef, align };
    }

    function layoutMenuEl(menuEl, anchor, side, align, isSubmenu) {
      let ar;
      if (isSubmenu && anchor instanceof Element) {
        const placed = submenuPlacementAnchor(anchor);
        ar = placed.anchorRef;
        align = placed.align;
      } else {
        ar = anchorRect(anchor);
      }
      menuEl.classList.add('is-measuring');
      menuEl.style.left = '-9999px';
      menuEl.style.top = '0';

      const tw = menuEl.offsetWidth;
      const th = menuEl.offsetHeight;
      const pos = FRP.computePosition({
        mode: 'menu',
        anchor: ar,
        width: tw,
        height: th,
        margin: MARGIN,
        gap: GAP,
        side,
        align,
      });

      menuEl.classList.remove('is-measuring');
      menuEl.style.left = `${pos.x}px`;
      menuEl.style.top = `${pos.y}px`;
      menuEl.classList.add('is-visible');
    }

    function animateMenuOut(menuEl, done) {
      if (!menuEl.parentNode) {
        done();
        return;
      }
      menuEl.classList.remove('is-visible', 'is-measuring');
      menuEl.classList.add('is-leaving');
      void menuEl.offsetHeight;
      const prop = 'transform';
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        menuEl.removeEventListener('transitionend', onEnd);
        menuEl.remove();
        done();
      };
      const onEnd = (e) => {
        if (e.target !== menuEl || e.propertyName !== prop) return;
        finish();
      };
      menuEl.addEventListener('transitionend', onEnd);
      setTimeout(finish, FRP.OVERLAY_TRANSITION_FALLBACK_MS);
    }

    function relayoutAll() {
      for (let i = 0; i < openMenus.length; i++) {
        const { el, anchorRef, side, align, isSubmenu } = openMenus[i];
        layoutMenuEl(el, anchorRef, side, align, isSubmenu);
      }
    }

    function rovingTabIndexForPanel(menuEl) {
      const items = focusableMenuItems(menuEl);
      for (let i = 0; i < items.length; i++) {
        items[i].tabIndex = i === 0 ? 0 : -1;
      }
    }

    function focusableMenuItems(menuEl) {
      return Array.from(menuEl.querySelectorAll(':scope > .menu-item')).filter(
        (el) => !el.disabled && !el.hasAttribute('data-menu-skip-focus')
      );
    }

    function focusMenuItem(menuEl, index) {
      const items = focusableMenuItems(menuEl);
      if (!items.length) return;
      const i = Math.max(0, Math.min(index, items.length - 1));
      for (let j = 0; j < items.length; j++) {
        items[j].tabIndex = j === i ? 0 : -1;
      }
      items[i].focus();
    }

    function handlePanelKeydown(e, wrap, level) {
      if (e.defaultPrevented) return;
      const key = e.key;
      const items = focusableMenuItems(wrap);
      if (!items.length) return;
      let idx = items.indexOf(document.activeElement);
      if (idx < 0) idx = 0;

      if (key === 'ArrowDown') {
        e.preventDefault();
        focusMenuItem(wrap, idx + 1 >= items.length ? 0 : idx + 1);
        return;
      }
      if (key === 'ArrowUp') {
        e.preventDefault();
        focusMenuItem(wrap, idx - 1 < 0 ? items.length - 1 : idx - 1);
        return;
      }
      if (key === 'Home') {
        e.preventDefault();
        focusMenuItem(wrap, 0);
        return;
      }
      if (key === 'End') {
        e.preventDefault();
        focusMenuItem(wrap, items.length - 1);
        return;
      }
      if (key === 'ArrowRight') {
        const cur = items[idx];
        if (cur && cur.classList.contains('menu-item-has-submenu')) {
          e.preventDefault();
          const itemData = cur._menuItemData;
          if (itemData && itemData.submenu) openSubmenu(itemData.submenu, cur, level);
        }
        return;
      }
      if (key === 'ArrowLeft') {
        if (openMenus.length > 1 && openMenus[openMenus.length - 1].el === wrap) {
          const top = openMenus[openMenus.length - 1];
          const parentTrigger = top.triggerEl;
          e.preventDefault();
          closeFromLevel(top.level, () => {
            if (parentTrigger && parentTrigger.isConnected) {
              const parentMenu = parentTrigger.closest('.menu');
              if (parentMenu) {
                const pitems = focusableMenuItems(parentMenu);
                const pi = pitems.indexOf(parentTrigger);
                if (pi >= 0) focusMenuItem(parentMenu, pi);
                else parentTrigger.focus();
              }
            }
          });
        }
        return;
      }
      if (key === 'Enter' || key === ' ') {
        const cur = items[idx];
        if (!cur) return;
        e.preventDefault();
        if (cur.classList.contains('menu-item-has-submenu')) {
          const itemData = cur._menuItemData;
          if (itemData && itemData.submenu) openSubmenu(itemData.submenu, cur, level);
        } else {
          cur.click();
        }
        return;
      }
      if (key === 'Tab') {
        e.preventDefault();
        closeAll();
        if (rootAnchorEl && rootAnchorEl.isConnected) rootAnchorEl.focus();
        return;
      }
    }

    function closeFromLevel(minLevel, done) {
      const batch = [];
      while (openMenus.length && openMenus[openMenus.length - 1].level >= minLevel) {
        batch.push(openMenus.pop());
      }
      if (!batch.length) {
        if (openMenus.length === 0 && menuRoot.querySelector('.menu')) {
          menuRoot.replaceChildren();
        }
        if (openMenus.length === 0) {
          setActiveController(null);
          const cb = rootOnClose;
          rootAnchorEl = null;
          rootOnClose = null;
          if (cb) cb();
        }
        if (done) done();
        return;
      }
      for (let i = 0; i < batch.length; i++) {
        if (batch[i].level >= 1) submenuSourceRow = null;
      }
      let remaining = batch.length;
      const tick = () => {
        remaining--;
        if (remaining > 0) return;
        if (openMenus.length === 0) {
          setActiveController(null);
          const cb = rootOnClose;
          rootAnchorEl = null;
          rootOnClose = null;
          if (cb) cb();
        }
        if (done) done();
      };
      for (let i = 0; i < batch.length; i++) {
        animateMenuOut(batch[i].el, tick);
      }
    }

    function closeAll(done) {
      closeFromLevel(0, done);
    }

    function forceCloseSync() {
      while (openMenus.length) {
        const entry = openMenus.pop();
        if (entry.el && entry.el.parentNode) entry.el.remove();
      }
      submenuSourceRow = null;
      if (menuRoot) menuRoot.replaceChildren();
      if (activeController === controller) setActiveController(null);
      const cb = rootOnClose;
      rootAnchorEl = null;
      rootOnClose = null;
      if (cb) cb();
    }

    function closeOtherControllers() {
      for (const inst of allControllers) {
        if (inst !== controller && inst.isOpen()) inst.forceCloseSync();
      }
    }

    function chevronSvg() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'menu-item-chevron');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'm9 18 6-6-6-6');
      svg.appendChild(p);
      return svg;
    }

    function buildDefaultMenuItem(item, wrap, level) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'menu-item';
      btn.setAttribute('role', 'menuitem');
      btn.tabIndex = -1;
      if (item.disabled) {
        btn.disabled = true;
      }

      const label = document.createElement('span');
      label.className = 'menu-item-label';
      label.textContent = item.label ?? '';
      btn.appendChild(label);

      if (item.submenu && item.submenu.length) {
        btn.classList.add('menu-item-has-submenu');
        btn.appendChild(chevronSvg());
        btn._menuItemData = { submenu: item.submenu };
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openSubmenu(item.submenu, btn, level);
        });
      } else {
        btn._menuItemData = { submenu: null };
      }

      if (level === 0) {
        btn.addEventListener('mouseenter', () => {
          if (submenuSourceRow && submenuSourceRow !== btn) {
            if (!(item.submenu && item.submenu.length && submenuHoverOpen())) {
              closeFromLevel(1);
            }
          }
          if (item.submenu && item.submenu.length && submenuHoverOpen()) {
            openSubmenu(item.submenu, btn, level);
          }
        });
      } else if (item.submenu && item.submenu.length) {
        btn.addEventListener('mouseenter', () => {
          if (submenuHoverOpen()) openSubmenu(item.submenu, btn, level);
        });
      }

      if (!(item.submenu && item.submenu.length) && typeof item.onSelect === 'function') {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          item.onSelect();
          closeAll();
        });
      }

      wrap.appendChild(btn);
    }

    function buildMenu(items, level) {
      const wrap = document.createElement('div');
      wrap.className = level > 0 ? 'menu is-submenu' : 'menu';
      wrap.setAttribute('role', 'menu');
      wrap.addEventListener('keydown', (e) => handlePanelKeydown(e, wrap, level));

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const rowType = item.type || 'item';
        if (rowType !== 'item' && customRowTypes[rowType]) {
          const node = customRowTypes[rowType](item, wrap, level, controller);
          if (node) wrap.appendChild(node);
          continue;
        }
        if (rowType !== 'item') {
          console.warn('[Menu] unknown row type:', rowType, '— using default item row');
        }
        buildDefaultMenuItem(item, wrap, level);
      }

      return wrap;
    }

    function isSubmenuOpenForRow(anchorRowEl, parentLevel) {
      const lvl = parentLevel + 1;
      for (let i = 0; i < openMenus.length; i++) {
        const m = openMenus[i];
        if (m.level === lvl && m.triggerEl === anchorRowEl) return true;
      }
      return false;
    }

    function openSubmenu(items, anchorRowEl, parentLevel) {
      if (isSubmenuOpenForRow(anchorRowEl, parentLevel)) return;
      closeFromLevel(parentLevel + 1, () => {
        submenuSourceRow = anchorRowEl;
        const level = parentLevel + 1;
        const placed = submenuPlacementAnchor(anchorRowEl);

        const menuEl = buildMenu(items, level);
        menuRoot.appendChild(menuEl);
        openMenus.push({
          el: menuEl,
          level,
          anchorRef: anchorRowEl,
          triggerEl: anchorRowEl,
          side: 'right',
          align: placed.align,
          isSubmenu: true,
        });
        layoutMenuEl(menuEl, anchorRowEl, 'right', placed.align, true);
        rovingTabIndexForPanel(menuEl);
        focusMenuItem(menuEl, 0);
      });
    }

    function open(opts) {
      closeOtherControllers();

      const items = opts.items;
      const anchor = opts.anchor;
      const side = opts.side;
      const align = opts.align ?? 'start';

      const launch = () => {
        rootOnClose = opts.onClose || null;
        rootAnchorEl = anchor instanceof Element ? anchor : null;

        const menuEl = buildMenu(items, 0);
        menuRoot.appendChild(menuEl);
        openMenus.push({
          el: menuEl,
          level: 0,
          anchorRef: anchor,
          triggerEl: null,
          side,
          align,
          isSubmenu: false,
        });
        layoutMenuEl(menuEl, anchor, side, align, false);
        setActiveController(controller);
        rovingTabIndexForPanel(menuEl);
        focusMenuItem(menuEl, 0);
        if (typeof opts.onReady === 'function') opts.onReady();
      };

      if (openMenus.length > 0 || menuRoot.querySelector('.menu')) {
        closeFromLevel(0, launch);
      } else {
        launch();
      }
    }

    function destroy() {
      allControllers.delete(controller);
      if (activeController === controller) setActiveController(null);
      forceCloseSync();
    }

    controller.open = open;
    controller.closeAll = closeAll;
    controller.isOpen = isOpen;
    controller.rootAnchor = rootAnchor;
    controller.relayoutAll = relayoutAll;
    controller.forceCloseSync = forceCloseSync;
    controller.destroy = destroy;

    allControllers.add(controller);
    return controller;
  }

  const defaultRoot = document.getElementById('menu-root');
  const defaultMenu = defaultRoot ? createMenuController(defaultRoot) : null;

  global.Menu = {
    open(opts) {
      if (defaultMenu) defaultMenu.open(opts);
    },
    closeAll(done) {
      if (defaultMenu) defaultMenu.closeAll(done);
    },
    isOpen() {
      return defaultMenu ? defaultMenu.isOpen() : false;
    },
    rootAnchor() {
      return defaultMenu ? defaultMenu.rootAnchor() : null;
    },
    create(opts) {
      return createMenuController(opts.root);
    },
    registerRowType,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
