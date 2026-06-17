// Persistent notification inbox — bell in the header opens a panel whose top
// edge aligns with the header bottom. Separate from BelJarToasts (ephemeral).
(function (global) {
  'use strict';

  let bellBtn = null;
  let panelEl = null;
  let listEl = null;
  let emptyEl = null;
  let badgeEl = null;
  let clearBtn = null;
  let open = false;
  let seq = 0;

  const items = new Map();

  function nextId() {
    seq += 1;
    return 'notif-' + seq;
  }

  function formatTime(ts) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(ts));
    } catch (_) {
      return '';
    }
  }

  function updateBadge() {
    if (!badgeEl) return;
    const n = items.size;
    if (n <= 0) {
      badgeEl.hidden = true;
      badgeEl.textContent = '';
      if (bellBtn) bellBtn.removeAttribute('data-has-notifications');
      return;
    }
    badgeEl.hidden = false;
    badgeEl.textContent = n > 9 ? '9+' : String(n);
    if (bellBtn) bellBtn.setAttribute('data-has-notifications', '');
  }

  function renderList() {
    if (!listEl || !emptyEl) return;
    listEl.textContent = '';
    const sorted = Array.from(items.values()).sort((a, b) => b.time - a.time);
    for (const item of sorted) {
      const li = document.createElement('li');
      li.className = 'notif-item';
      li.dataset.notifId = item.id;

      const main = document.createElement('div');
      main.className = 'notif-item-main';

      const msg = document.createElement('p');
      msg.className = 'notif-item-msg';
      msg.textContent = item.message;
      main.appendChild(msg);

      const time = document.createElement('span');
      time.className = 'notif-item-time';
      time.textContent = formatTime(item.time);
      main.appendChild(time);

      const dismissBtn = document.createElement('button');
      dismissBtn.type = 'button';
      dismissBtn.className = 'icon-btn notif-item-dismiss';
      dismissBtn.setAttribute('aria-label', 'Dismiss notification');
      dismissBtn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
        '</svg>';
      dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismiss(item.id);
      });

      li.appendChild(main);
      li.appendChild(dismissBtn);
      listEl.appendChild(li);
    }
    emptyEl.hidden = sorted.length > 0;
    listEl.hidden = sorted.length === 0;
    updateBadge();
  }

  function push(message, opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const id = o.id || nextId();
    items.set(id, {
      id,
      message: String(message || ''),
      time: o.time != null ? o.time : Date.now(),
    });
    renderList();
    return id;
  }

  function dismiss(id) {
    if (!items.delete(id)) return;
    renderList();
  }

  function clear() {
    items.clear();
    renderList();
  }

  function positionPanel() {
    if (!bellBtn || !panelEl) return;
    const r = bellBtn.getBoundingClientRect();
    const right = Math.max(0, window.innerWidth - r.right);
    panelEl.style.setProperty('--notif-panel-right', right + 'px');
  }

  function setOpen(next) {
    if (!panelEl || !bellBtn) return;
    open = !!next;
    if (open) positionPanel();
    panelEl.classList.toggle('is-open', open);
    panelEl.setAttribute('aria-hidden', open ? 'false' : 'true');
    bellBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    bellBtn.classList.toggle('is-active', open);
    if (open && typeof Tooltips !== 'undefined') {
      Tooltips.hide();
      Tooltips.suppressAnchor(bellBtn);
    }
  }

  function toggle() {
    setOpen(!open);
  }

  function onDocPointerDown(e) {
    if (!open) return;
    const t = e.target;
    if (panelEl && panelEl.contains(t)) return;
    if (bellBtn && bellBtn.contains(t)) return;
    setOpen(false);
  }

  function onDocKeyDown(e) {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
      bellBtn.focus();
    }
  }

  function init() {
    bellBtn = document.getElementById('btn-notifications');
    panelEl = document.getElementById('notif-panel');
    listEl = document.getElementById('notif-panel-list');
    emptyEl = document.getElementById('notif-panel-empty');
    badgeEl = document.getElementById('notif-badge');
    clearBtn = document.getElementById('btn-notif-clear');
    if (!bellBtn || !panelEl) return;

    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clear();
      });
    }

    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onDocKeyDown, true);
    window.addEventListener('resize', () => {
      if (open) positionPanel();
    });
    positionPanel();
    renderList();
  }

  global.BelJarNotifications = {
    init,
    push,
    dismiss,
    clear,
    toggle,
    isOpen: () => open,
    count: () => items.size,
  };
})(typeof window !== 'undefined' ? window : globalThis);
