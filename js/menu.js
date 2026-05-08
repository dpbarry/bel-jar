(function (global) {
  'use strict';

  const FRP = global.FloatingRectPlacement;
  const MARGIN = FRP.DEFAULT_MARGIN;
  const GAP = FRP.DEFAULT_GAP;

  const menuRoot = document.getElementById('menu-root');
  let openMenus = [];
  let rootAnchorEl = null;
  let rootOnClose = null;
  let globalsBound = false;
  let submenuSourceRow = null;

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

  function layoutMenuEl(menuEl, anchor, side, align, isSubmenu) {
    const ar = anchorRect(anchor);
    menuEl.classList.remove('is-visible');
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

  function relayoutAll() {
    for (let i = 0; i < openMenus.length; i++) {
      const { el, anchorRef, side, align, isSubmenu } = openMenus[i];
      layoutMenuEl(el, anchorRef, side, align, isSubmenu);
    }
  }

  function detachGlobals() {
    if (!globalsBound) return;
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onDocKeydown, true);
    window.removeEventListener('resize', relayoutAll);
    window.removeEventListener('scroll', relayoutAll, true);
    globalsBound = false;
  }

  function attachGlobals() {
    if (globalsBound) return;
    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onDocKeydown, true);
    window.addEventListener('resize', relayoutAll);
    window.addEventListener('scroll', relayoutAll, true);
    globalsBound = true;
  }

  function onDocPointerDown(e) {
    if (!menuRoot) return;
    const t = e.target;
    if (menuRoot.contains(t)) return;
    if (rootAnchorEl && rootAnchorEl.contains(t)) return;
    closeAll();
  }

  function onDocKeydown(e) {
    if (e.key === 'Escape') closeAll();
  }

  function closeFromLevel(minLevel) {
    while (openMenus.length && openMenus[openMenus.length - 1].level >= minLevel) {
      const entry = openMenus.pop();
      entry.el.remove();
      if (entry.level >= 1) submenuSourceRow = null;
    }
    if (openMenus.length === 0) {
      detachGlobals();
      const cb = rootOnClose;
      rootAnchorEl = null;
      rootOnClose = null;
      if (cb) cb();
    }
  }

  function closeAll() {
    closeFromLevel(0);
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
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'm9 18 6-6-6-6');
    svg.appendChild(p);
    return svg;
  }

  function buildMenu(items, level) {
    const wrap = document.createElement('div');
    wrap.className = level > 0 ? 'menu is-submenu' : 'menu';
    wrap.setAttribute('role', 'menu');

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'menu-item';
      btn.setAttribute('role', 'menuitem');

      const label = document.createElement('span');
      label.className = 'menu-item-label';
      label.textContent = item.label;
      btn.appendChild(label);

      if (item.submenu && item.submenu.length) {
        btn.classList.add('menu-item-has-submenu');
        btn.setAttribute('aria-haspopup', 'true');
        btn.appendChild(chevronSvg());
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openSubmenu(item.submenu, btn, level);
        });
      }
      if (level === 0) {
        btn.addEventListener('mouseenter', () => {
          if (submenuSourceRow && submenuSourceRow !== btn) closeFromLevel(1);
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

    return wrap;
  }

  function openSubmenu(items, anchorRowEl, parentLevel) {
    closeFromLevel(parentLevel + 1);
    submenuSourceRow = anchorRowEl;
    const level = parentLevel + 1;
    let anchorRef = anchorRowEl;
    let align = 'start';

    const parentMenuEl = anchorRowEl.closest('.menu');
    if (parentMenuEl) {
      const rowEls = Array.from(parentMenuEl.querySelectorAll('.menu-item'));
      const rowIdx = rowEls.indexOf(anchorRowEl);
      const rowRect = anchorRowEl.getBoundingClientRect();
      const menuRect = parentMenuEl.getBoundingClientRect();

      if (rowIdx === 0) {
        anchorRef = {
          left: rowRect.left,
          right: rowRect.right,
          top: menuRect.top,
          bottom: rowRect.bottom,
        };
      } else if (rowIdx === rowEls.length - 1) {
        anchorRef = {
          left: rowRect.left,
          right: rowRect.right,
          top: rowRect.top,
          bottom: menuRect.bottom,
        };
        align = 'end';
      }
    }

    const menuEl = buildMenu(items, level);
    menuRoot.appendChild(menuEl);
    openMenus.push({
      el: menuEl,
      level,
      anchorRef,
      side: 'right',
      align,
      isSubmenu: true,
    });
    layoutMenuEl(menuEl, anchorRef, 'right', align, true);
  }

  /**
   * @param {object} opts
   * @param {Array} opts.items - { label, submenu?, onSelect? }
   * @param {Element|DOMRect} opts.anchor
   * @param {'right'|'left'|'bottom'|'top'} [opts.side] - omit for point-style context menu
   * @param {'start'|'center'|'end'} [opts.align='start']
   * @param {function} [opts.onClose]
   */
  function open(opts) {
    if (!menuRoot) return;
    closeAll();

    const items = opts.items;
    const anchor = opts.anchor;
    const side = opts.side;
    const align = opts.align ?? 'start';
    rootOnClose = opts.onClose || null;
    rootAnchorEl = anchor instanceof Element ? anchor : null;

    const menuEl = buildMenu(items, 0);
    menuRoot.appendChild(menuEl);
    openMenus.push({
      el: menuEl,
      level: 0,
      anchorRef: anchor,
      side,
      align,
      isSubmenu: false,
    });
    layoutMenuEl(menuEl, anchor, side, align, false);
    attachGlobals();
  }

  global.Menu = {
    open,
    closeAll,
    isOpen,
    rootAnchor,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
