(function (global) {
  'use strict';

  const FRP = global.FloatingRectPlacement;
  const MARGIN = FRP.DEFAULT_MARGIN;

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
    let submenuOpenTimer = null;

    const SUBMENU_OPEN_DELAY_MS = 90;

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
        // Submenus sit flush against the parent's right edge (IDE style); root
        // menus sit flush against their trigger too.
        gap: 0,
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
        if (batch[i].level >= 1) {
          submenuSourceRow = null;
          const trig = batch[i].triggerEl;
          if (trig) trig.classList.remove('is-submenu-open');
        }
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
      cancelScheduledSubmenuOpen();
      while (openMenus.length) {
        const entry = openMenus.pop();
        if (entry.triggerEl) entry.triggerEl.classList.remove('is-submenu-open');
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

    function checkSvg() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2.4');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M20 6 9 17l-5-5');
      svg.appendChild(p);
      return svg;
    }

    // Build a leading icon slot from an SVG string, DOM node, or built-in check.
    function buildIconSlot(icon) {
      const slot = document.createElement('span');
      slot.className = 'menu-item-icon';
      slot.setAttribute('aria-hidden', 'true');
      if (icon === 'check') {
        slot.appendChild(checkSvg());
      } else if (icon instanceof Node) {
        slot.appendChild(icon);
      } else if (typeof icon === 'string') {
        slot.innerHTML = icon;
      }
      return slot;
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

      // Leading icon / check gutter (icon wins; check shown when item.checked)
      const iconSource = item.checked ? 'check' : item.icon;
      if (iconSource) {
        btn.classList.add('menu-item-has-icon');
        btn.appendChild(buildIconSlot(iconSource));
      }
      if (item.checked) {
        btn.classList.add('is-checked');
        btn.setAttribute('role', 'menuitemcheckbox');
        btn.setAttribute('aria-checked', 'true');
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
        // Trailing keyboard-shortcut hint (mutually exclusive with the chevron)
        if (item.shortcut) {
          btn.classList.add('menu-item-has-shortcut');
          const sc = document.createElement('span');
          sc.className = 'menu-item-shortcut';
          sc.textContent = item.shortcut;
          btn.appendChild(sc);
        }
      }

      if (level === 0) {
        btn.addEventListener('mouseenter', () => {
          if (submenuSourceRow && submenuSourceRow !== btn) {
            if (!(item.submenu && item.submenu.length && submenuHoverOpen())) {
              scheduleCloseSubmenus();
            }
          }
          if (item.submenu && item.submenu.length && submenuHoverOpen()) {
            scheduleOpenSubmenu(item.submenu, btn, level);
          }
        });
        btn.addEventListener('mouseleave', cancelScheduledSubmenuOpen);
      } else if (item.submenu && item.submenu.length) {
        btn.addEventListener('mouseenter', () => {
          if (submenuHoverOpen()) scheduleOpenSubmenu(item.submenu, btn, level);
        });
        btn.addEventListener('mouseleave', cancelScheduledSubmenuOpen);
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

    function buildSeparator() {
      const sep = document.createElement('div');
      sep.className = 'menu-separator';
      sep.setAttribute('role', 'separator');
      return sep;
    }

    function buildSection(item) {
      const sec = document.createElement('div');
      sec.className = 'menu-section';
      sec.setAttribute('role', 'presentation');
      sec.textContent = item.label ?? '';
      return sec;
    }

    function buildMenu(items, level) {
      const wrap = document.createElement('div');
      wrap.className = level > 0 ? 'menu is-submenu' : 'menu';
      wrap.setAttribute('role', 'menu');
      wrap.addEventListener('keydown', (e) => handlePanelKeydown(e, wrap, level));

      let hasIcons = false;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const rowType = item.type || 'item';
        if (rowType === 'separator') {
          wrap.appendChild(buildSeparator());
          continue;
        }
        if (rowType === 'section') {
          wrap.appendChild(buildSection(item));
          continue;
        }
        if (rowType !== 'item' && customRowTypes[rowType]) {
          const node = customRowTypes[rowType](item, wrap, level, controller);
          if (node) wrap.appendChild(node);
          continue;
        }
        if (rowType !== 'item') {
          console.warn('[Menu] unknown row type:', rowType, '— using default item row');
        }
        if (item.icon || item.checked) hasIcons = true;
        buildDefaultMenuItem(item, wrap, level);
      }

      // Reserve a consistent icon gutter only when the menu actually uses icons
      if (hasIcons) wrap.classList.add('menu--has-icons');

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

    function cancelScheduledSubmenuOpen() {
      if (submenuOpenTimer !== null) {
        clearTimeout(submenuOpenTimer);
        submenuOpenTimer = null;
      }
    }

    // Hover-intent: delay opening so skimming across submenu rows doesn't thrash.
    function scheduleOpenSubmenu(items, anchorRowEl, parentLevel) {
      cancelScheduledSubmenuOpen();
      submenuOpenTimer = setTimeout(() => {
        submenuOpenTimer = null;
        if (anchorRowEl.isConnected) openSubmenu(items, anchorRowEl, parentLevel);
      }, SUBMENU_OPEN_DELAY_MS);
    }

    // Hover-intent: delay closing the child level so the user can cross the gap
    // toward the submenu without it collapsing under the pointer.
    function scheduleCloseSubmenus() {
      cancelScheduledSubmenuOpen();
      submenuOpenTimer = setTimeout(() => {
        submenuOpenTimer = null;
        closeFromLevel(1);
      }, SUBMENU_OPEN_DELAY_MS);
    }

    function openSubmenu(items, anchorRowEl, parentLevel) {
      cancelScheduledSubmenuOpen();
      if (isSubmenuOpenForRow(anchorRowEl, parentLevel)) return;
      closeFromLevel(parentLevel + 1, () => {
        submenuSourceRow = anchorRowEl;
        anchorRowEl.classList.add('is-submenu-open');
        const level = parentLevel + 1;
        const placed = submenuPlacementAnchor(anchorRowEl);

        const menuEl = buildMenu(items, level);
        menuEl.classList.add('is-flyout');
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
        // Origin-aware pop: the panel scales out of the edge nearest its trigger.
        if (side === 'bottom') {
          menuEl.classList.add('is-drop-down');
          if (align === 'end') menuEl.classList.add('is-align-end');
        } else if (side === 'right') {
          menuEl.classList.add('is-flyout');
        }
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

    // Open a menu anchored at a viewport point (e.g. a right-click). The placement
    // engine clamps/flips at the edges, so corner-spawned menus stay on-screen.
    function openContext(opts) {
      const x = opts.x;
      const y = opts.y;
      open({
        anchor: { left: x, right: x, top: y, bottom: y },
        side: opts.side || 'bottom',
        align: opts.align || 'start',
        items: opts.items,
        onClose: opts.onClose,
        onReady: opts.onReady,
      });
    }

    // Ready-to-use primitive: turn an element into a right-click target.
    // `itemsOrFn` is either an items array or a function(event) -> items.
    function bindContextMenu(targetEl, itemsOrFn, opts) {
      if (!(targetEl instanceof Element)) {
        throw new TypeError('bindContextMenu(targetEl, items): targetEl must be an element');
      }
      const handler = (e) => {
        const items = typeof itemsOrFn === 'function' ? itemsOrFn(e) : itemsOrFn;
        if (!items || !items.length) return;
        e.preventDefault();
        openContext({
          x: e.clientX,
          y: e.clientY,
          items,
          side: opts && opts.side,
          align: opts && opts.align,
          onClose: opts && opts.onClose,
        });
      };
      targetEl.addEventListener('contextmenu', handler);
      return () => targetEl.removeEventListener('contextmenu', handler);
    }

    function destroy() {
      allControllers.delete(controller);
      if (activeController === controller) setActiveController(null);
      forceCloseSync();
    }

    controller.open = open;
    controller.openContext = openContext;
    controller.bindContextMenu = bindContextMenu;
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
    openContext(opts) {
      if (defaultMenu) defaultMenu.openContext(opts);
    },
    bindContextMenu(targetEl, itemsOrFn, opts) {
      if (defaultMenu) return defaultMenu.bindContextMenu(targetEl, itemsOrFn, opts);
      return () => {};
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
