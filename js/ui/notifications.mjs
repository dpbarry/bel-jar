// Durable notification inbox — bell panel. Separate from Toasts (ephemeral).
import {
  createNotificationStore,
  createLocalPersistAdapter,
  createMemoryAdapter,
  normalizeRecord,
  SCHEMA_VERSION,
} from './notification-store.mjs';

const global = globalThis;

let bellBtn = null;
let panelEl = null;
let listEl = null;
let emptyEl = null;
let badgeEl = null;
let clearBtn = null;
let open = false;
let unsub = null;

const store = createNotificationStore({
  adapter: typeof localStorage !== 'undefined'
    ? createLocalPersistAdapter()
    : createMemoryAdapter(),
});

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
  const n = store.unreadCount();
  if (n <= 0) {
    badgeEl.hidden = true;
    badgeEl.textContent = '';
    if (bellBtn) {
      if (store.count() > 0) bellBtn.setAttribute('data-has-notifications', '');
      else bellBtn.removeAttribute('data-has-notifications');
    }
    return;
  }
  badgeEl.hidden = false;
  badgeEl.textContent = n > 9 ? '9+' : String(n);
  if (bellBtn) bellBtn.setAttribute('data-has-notifications', '');
}

function kindClass(kind) {
  if (kind === 'error' || kind === 'warn' || kind === 'info' || kind === 'success') {
    return 'notif-item--' + kind;
  }
  return 'notif-item--system';
}

function renderList() {
  if (!listEl || !emptyEl) return;
  listEl.textContent = '';
  const sorted = store.list();
  for (const item of sorted) {
    const li = document.createElement('li');
    li.className = 'notif-item ' + kindClass(item.kind);
    if (!item.readAt) li.classList.add('is-unread');
    li.dataset.notifId = item.id;

    const main = document.createElement('div');
    main.className = 'notif-item-main';

    const title = document.createElement('p');
    title.className = 'notif-item-msg';
    title.textContent = item.title;
    main.appendChild(title);

    if (item.body && item.body !== item.title) {
      const body = document.createElement('p');
      body.className = 'notif-item-body';
      body.textContent = item.body;
      main.appendChild(body);
    }

    if (item.detail) {
      const details = document.createElement('details');
      details.className = 'notif-item-detail';
      const summary = document.createElement('summary');
      summary.textContent = 'Details';
      details.appendChild(summary);
      const pre = document.createElement('pre');
      pre.className = 'notif-item-detail-pre';
      pre.textContent = item.detail;
      details.appendChild(pre);
      main.appendChild(details);
    }

    const meta = document.createElement('span');
    meta.className = 'notif-item-time';
    const bits = [formatTime(item.createdAt)];
    if (item.category === 'teaching') bits.push('teaching');
    else if (item.origin === 'remote') bits.push('remote');
    meta.textContent = bits.filter(Boolean).join(' · ');
    main.appendChild(meta);

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

function emit(partial) {
  const rec = store.upsert(partial);
  return rec ? rec.id : null;
}

/** Legacy string push — durable ops item from a bare message. */
function push(message, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  if (typeof message === 'object' && message !== null) {
    return emit(message);
  }
  return emit({
    id: o.id,
    title: String(message || ''),
    kind: o.kind || 'info',
    category: o.category || 'ops',
    source: o.source || 'legacy',
    createdAt: o.time != null ? o.time : Date.now(),
    body: o.body || null,
    detail: o.detail || null,
    dedupeKey: o.dedupeKey || null,
    links: o.links || null,
    origin: o.origin || 'local',
  });
}

function teaching(partial) {
  const o = partial && typeof partial === 'object' ? partial : { title: String(partial || '') };
  return emit({
    kind: o.kind || 'error',
    category: 'teaching',
    origin: 'local',
    source: o.source || 'prover',
    title: o.title,
    body: o.body || null,
    detail: o.detail || null,
    dedupeKey: o.dedupeKey || null,
    links: o.links || null,
  });
}

/** Bridge from Toasts when durable/notify is explicit. */
function fromToast(message, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const kind = o.kind || 'error';
  return emit({
    kind: kind === 'default' ? 'info' : kind,
    category: o.category || 'ops',
    title: String(message || ''),
    body: o.body || null,
    detail: o.detail || null,
    source: o.source || 'toast',
    dedupeKey: o.dedupeKey || null,
    origin: 'local',
  });
}

function dismiss(id) {
  store.dismiss(id);
}

function clear() {
  store.clear();
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
  if (open) {
    positionPanel();
    store.markAllRead();
  }
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

  if (unsub) unsub();
  unsub = store.subscribe(() => renderList());

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

global.Notifications = {
  init,
  emit,
  push,
  teaching,
  fromToast,
  dismiss,
  clear,
  markRead: (id) => store.markRead(id),
  markAllRead: () => store.markAllRead(),
  toggle,
  isOpen: () => open,
  count: () => store.count(),
  unreadCount: () => store.unreadCount(),
  list: () => store.list(),
  store,
  _pure: { normalizeRecord, SCHEMA_VERSION },
};
global.BelJarNotifications = global.Notifications;
