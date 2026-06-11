// Draggable/resizable floating panel (non-modal). Global: FloatingWindow.
(function (global) {
  'use strict';

  const MARGIN = 8;
  const open = new Set();
  let zTop = 4000; // above menus/tooltips, below modal dialogs

  function clamp(v, lo, hi) {
    return Math.min(Math.max(v, lo), hi);
  }

  function viewportW() {
    return typeof global.innerWidth === 'number' ? global.innerWidth : 1024;
  }
  function viewportH() {
    return typeof global.innerHeight === 'number' ? global.innerHeight : 768;
  }

  function makeEl(tag, cls) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function openWindow(opts) {
    opts = opts || {};
    const minWidth = opts.minWidth || 220;
    const minHeight = opts.minHeight || 140;
    let width = clamp(opts.width || 320, minWidth, viewportW() - MARGIN * 2);
    let height = clamp(opts.height || 380, minHeight, viewportH() - MARGIN * 2);

    const root = makeEl('div', 'floating-window' + (opts.className ? ' ' + opts.className : ''));
    root.style.width = width + 'px';
    root.style.height = height + 'px';

    // Title bar (drag handle).
    const bar = makeEl('div', 'floating-window-bar');
    const titleEl = makeEl('span', 'floating-window-title');
    setTitleContent(titleEl, opts.title);
    const barActions = makeEl('div', 'floating-window-actions');
    const actionBtns = [];
    if (Array.isArray(opts.actions)) {
      for (const act of opts.actions) {
        const btn = makeEl('button', 'floating-window-action');
        btn.type = 'button';
        if (act.label) btn.setAttribute('aria-label', act.label);
        btn.innerHTML = act.icon || '';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof act.onClick === 'function') act.onClick();
        });
        actionBtns.push(btn);
        barActions.appendChild(btn);
      }
    }
    const closeBtn = makeEl('button', 'floating-window-close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    bar.append(titleEl, barActions, closeBtn);

    // Scrollable body.
    const body = makeEl('div', 'floating-window-body');
    if (opts.content) body.appendChild(opts.content);

    // Resize grip (bottom-right).
    const grip = makeEl('div', 'floating-window-grip');
    grip.setAttribute('aria-hidden', 'true');

    root.append(bar, body, grip);
    document.body.appendChild(root);

    // Initial placement: given coords, else centered-ish near the top.
    let x = typeof opts.x === 'number' ? opts.x : Math.round((viewportW() - width) / 2);
    let y = typeof opts.y === 'number' ? opts.y : Math.round(viewportH() * 0.18);
    x = clamp(x, MARGIN, viewportW() - width - MARGIN);
    y = clamp(y, MARGIN, viewportH() - height - MARGIN);
    root.style.left = x + 'px';
    root.style.top = y + 'px';

    function raise() {
      zTop += 1;
      root.style.zIndex = String(zTop);
    }
    raise();
    root.addEventListener('pointerdown', raise, true);

    // ---- dragging ----
    let dragP = null;
    function onDragMove(e) {
      if (!dragP) return;
      x = clamp(dragP.startX + (e.clientX - dragP.px), MARGIN, viewportW() - root.offsetWidth - MARGIN);
      y = clamp(dragP.startY + (e.clientY - dragP.py), MARGIN, viewportH() - root.offsetHeight - MARGIN);
      root.style.left = x + 'px';
      root.style.top = y + 'px';
    }
    function onDragUp() {
      if (dragP && bar.releasePointerCapture) {
        try { bar.releasePointerCapture(dragP.id); } catch (_) { /* ignore */ }
      }
      dragP = null;
      // Listeners ride the captured element (pointer capture routes events there).
      bar.removeEventListener('pointermove', onDragMove);
      bar.removeEventListener('pointerup', onDragUp);
      document.body.classList.remove('floating-window-dragging');
    }
    bar.addEventListener('pointerdown', (e) => {
      if (e.target === closeBtn || closeBtn.contains(e.target)) return;
      for (const b of actionBtns) {
        if (e.target === b || b.contains(e.target)) return;
      }
      if (e.button !== 0) return;
      dragP = { px: e.clientX, py: e.clientY, startX: x, startY: y, id: e.pointerId };
      try { bar.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      document.body.classList.add('floating-window-dragging');
      bar.addEventListener('pointermove', onDragMove);
      bar.addEventListener('pointerup', onDragUp);
      e.preventDefault();
    });

    // ---- resizing ----
    let rez = null;
    function onRezMove(e) {
      if (!rez) return;
      width = clamp(rez.startW + (e.clientX - rez.px), minWidth, viewportW() - x - MARGIN);
      height = clamp(rez.startH + (e.clientY - rez.py), minHeight, viewportH() - y - MARGIN);
      root.style.width = width + 'px';
      root.style.height = height + 'px';
    }
    function onRezUp() {
      if (rez && grip.releasePointerCapture) {
        try { grip.releasePointerCapture(rez.id); } catch (_) { /* ignore */ }
      }
      rez = null;
      grip.removeEventListener('pointermove', onRezMove);
      grip.removeEventListener('pointerup', onRezUp);
      document.body.classList.remove('floating-window-resizing');
    }
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      rez = { px: e.clientX, py: e.clientY, startW: root.offsetWidth, startH: root.offsetHeight, id: e.pointerId };
      try { grip.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      document.body.classList.add('floating-window-resizing');
      grip.addEventListener('pointermove', onRezMove);
      grip.addEventListener('pointerup', onRezUp);
      e.preventDefault();
      e.stopPropagation();
    });

    // ---- close ----
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      onDragUp();
      onRezUp();
      root.removeEventListener('pointerdown', raise, true);
      if (root.parentNode) root.parentNode.removeChild(root);
      open.delete(handle);
      if (typeof opts.onClose === 'function') {
        try { opts.onClose(); } catch (_) { /* ignore */ }
      }
    }
    closeBtn.addEventListener('click', close);

    function setTitleContent(target, title) {
      target.textContent = '';
      if (title == null) return;
      if (title instanceof Node) target.appendChild(title);
      else target.textContent = String(title);
    }

    const handle = {
      el: root,
      body,
      close,
      setContent(node) {
        body.textContent = '';
        if (node) body.appendChild(node);
      },
      setTitle(title) {
        setTitleContent(titleEl, title);
      },
      raise,
    };
    open.add(handle);
    return handle;
  }

  function closeAll() {
    for (const h of [...open]) h.close();
  }

  global.FloatingWindow = { open: openWindow, closeAll };
})(typeof window !== 'undefined' ? window : this);
