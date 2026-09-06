// Durable notification inbox — bell panel. Separate from Toasts (ephemeral).
// What a card shows is decided in notification-view.mjs; this file only draws
// that decision, so the panel cannot quietly disagree with what we test.
import {
  createNotificationStore,
  createLocalPersistAdapter,
  createMemoryAdapter,
  linkTarget,
  normalizeRecord,
  SCHEMA_VERSION,
} from './notification-store.mjs';
import {
  KIND_META,
  formatStamp,
  formatStampFull,
  inlineSegments,
  itemView,
  kindMeta,
  labelTitle,
  panelView,
} from './notification-view.mjs';

const global = globalThis;

let bellBtn = null;
let panelEl = null;
let listEl = null;
let emptyEl = null;
let clearBtn = null;
let countEl = null;
let open = false;
let unsub = null;
let fade = null;
let diagSeq = 0;

// Everything init() registers, so dispose() can take it off again. Without this
// a second init() double-binds every handler and the first set leaks.
const teardown = [];

function track(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  teardown.push(() => target.removeEventListener(type, fn, opts));
}

function onBellClick(e) {
  e.stopPropagation();
  toggle();
}

function onClearClick(e) {
  e.stopPropagation();
  clear();
}

function onWindowResize() {
  if (open) positionPanel();
}

const store = createNotificationStore({
  adapter: typeof localStorage !== 'undefined'
    ? createLocalPersistAdapter()
    : createMemoryAdapter(),
});

function svgMarkup(paths, cls) {
  return '<svg' + (cls ? ' class="' + cls + '"' : '')
    + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
}

function bindTooltip(el, text) {
  if (!el || !text) return;
  el.setAttribute('data-tooltip', text);
  try {
    if (typeof Tooltips !== 'undefined' && typeof Tooltips.bind === 'function') Tooltips.bind(el);
  } catch (_) {}
}

function updateBellState() {
  if (!bellBtn) return;
  const total = store.count();
  const unread = store.unreadCount();
  if (total > 0) bellBtn.setAttribute('data-has-notifications', '');
  else bellBtn.removeAttribute('data-has-notifications');
  if (unread > 0) bellBtn.setAttribute('data-has-unread', '');
  else bellBtn.removeAttribute('data-has-unread');
  bellBtn.setAttribute(
    'aria-label',
    unread > 0 ? 'Notifications, ' + unread + ' unread' : 'Notifications',
  );
}

function kindClass(kind) {
  return 'notif-item--' + (KIND_META[kind] ? kind : 'system');
}

function buildDiagToggle(pre) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'notif-item-more';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', pre.id);
  btn.innerHTML = svgMarkup('<path d="m9 6 6 6-6 6"/>', 'notif-item-chevron')
    + '<span>Diagnostic</span>';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const show = pre.hidden;
    pre.hidden = !show;
    btn.setAttribute('aria-expanded', show ? 'true' : 'false');
    btn.classList.toggle('is-open', show);
    if (fade) fade.update();
  });
  return btn;
}

// One left-aligned run under the body: when, then where, then the raw output.
// Nothing is pushed to the far edge, so a short foot has no gap to explain.
function buildFoot(view) {
  const foot = document.createElement('div');
  foot.className = 'notif-item-foot';

  if (view.unread) {
    const dot = document.createElement('span');
    dot.className = 'notif-item-dot';
    dot.setAttribute('role', 'img');
    dot.setAttribute('aria-label', 'Unread');
    foot.appendChild(dot);
  }

  const stamp = document.createElement('span');
  stamp.className = 'notif-item-stamp';
  stamp.textContent = view.stamp;
  bindTooltip(stamp, view.stampFull);
  foot.appendChild(stamp);

  if (view.target) {
    const jump = document.createElement('button');
    jump.type = 'button';
    jump.className = 'notif-item-link';
    jump.textContent = view.target.label;
    jump.setAttribute('aria-label', 'Open ' + view.target.label);
    jump.addEventListener('click', (e) => {
      e.stopPropagation();
      openTarget(view.id, view.target);
    });
    foot.appendChild(jump);
  }

  if (view.teaching || view.remote) {
    const tag = document.createElement('span');
    tag.className = 'notif-item-tag';
    tag.textContent = view.teaching ? 'teaching' : 'remote';
    foot.appendChild(tag);
  }

  return foot;
}

function buildItem(view) {
  const li = document.createElement('li');
  li.className = 'notif-item ' + kindClass(view.kind);
  if (view.unread) li.classList.add('is-unread');
  li.dataset.notifId = view.id;
  li.dataset.notifKind = view.kind;

  // On screen the wash says "error"; a screen reader needs the word, and this
  // is the only place it is carried.
  const title = document.createElement('p');
  title.className = 'notif-item-title';
  const kindWord = document.createElement('span');
  kindWord.className = 'notif-item-kind';
  kindWord.textContent = view.meta.label + ': ';
  title.appendChild(kindWord);
  title.appendChild(document.createTextNode(view.title));

  li.appendChild(title);

  if (view.body) {
    const body = document.createElement('p');
    body.className = 'notif-item-body';
    if (view.promotedDetail) body.classList.add('is-diagnostic');
    for (const seg of view.bodySegments) {
      if (!seg.code) {
        body.appendChild(document.createTextNode(seg.text));
        continue;
      }
      const code = document.createElement('code');
      code.className = 'notif-item-code';
      code.textContent = seg.text;
      body.appendChild(code);
    }
    li.appendChild(body);
  }

  let toggleBtn = null;
  let pre = null;
  if (view.detail) {
    diagSeq += 1;
    pre = document.createElement('pre');
    pre.className = 'notif-item-diag';
    pre.id = 'notif-diag-' + diagSeq;
    pre.textContent = view.detail;
    pre.hidden = true;
    toggleBtn = buildDiagToggle(pre);
  }

  const foot = buildFoot(view);
  if (toggleBtn) foot.appendChild(toggleBtn);
  li.appendChild(foot);
  if (pre) li.appendChild(pre);

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'icon-btn notif-item-dismiss';
  dismissBtn.setAttribute('aria-label', 'Dismiss notification');
  dismissBtn.innerHTML = svgMarkup('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
  dismissBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss(view.id);
  });
  li.appendChild(dismissBtn);

  return li;
}

function renderList() {
  if (!listEl || !emptyEl) return;
  const records = store.list();
  const view = panelView(records, Date.now());

  listEl.textContent = '';
  for (const item of view.items) listEl.appendChild(buildItem(item));

  emptyEl.hidden = !view.empty;
  listEl.hidden = view.empty;
  if (clearBtn) clearBtn.hidden = view.empty;
  if (countEl) {
    countEl.textContent = view.total ? String(view.total) : '';
    countEl.hidden = !view.total;
  }
  if (fade) fade.update();
  updateBellState();
}

// Navigation belongs to the shell, so a target goes out as an event rather than
// reaching across the seam. Same channel cross-file go-to-definition uses.
function openTarget(id, target) {
  if (!target) return;
  store.markRead(id);
  try {
    window.dispatchEvent(new CustomEvent('beljar:open-file-at', {
      detail: {
        fileId: target.fileId,
        from: target.from,
        to: target.to,
        line: target.line,
        source: 'notification',
      },
    }));
  } catch (_) {}
  setOpen(false);
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
    links: o.links || null,
    origin: 'local',
  });
}

function dismiss(id) {
  store.dismiss(id);
}

function clear() {
  store.clear();
}

// Flush with the end of the header chrome, not with the bell — a panel that
// stops mid-cluster leaves the buttons past it looking stranded.
function positionPanel() {
  if (!bellBtn || !panelEl) return;
  const anchor = bellBtn.closest('.header-end') || bellBtn;
  const r = anchor.getBoundingClientRect();
  const right = Math.max(0, window.innerWidth - r.right);
  panelEl.style.setProperty('--notif-panel-right', right + 'px');
}

function setOpen(next) {
  if (!panelEl || !bellBtn) return;
  open = !!next;
  if (open) {
    positionPanel();
    // Re-render before the panel lands: markAllRead only republishes when
    // something was actually unread, so the read state can go undrawn.
    renderList();
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
  dispose();
  bellBtn = document.getElementById('btn-notifications');
  panelEl = document.getElementById('notif-panel');
  listEl = document.getElementById('notif-panel-list');
  emptyEl = document.getElementById('notif-panel-empty');
  clearBtn = document.getElementById('btn-notif-clear');
  countEl = document.getElementById('notif-panel-count');
  if (!bellBtn || !panelEl) return;

  unsub = store.subscribe(() => renderList());

  track(bellBtn, 'click', onBellClick);
  if (clearBtn) track(clearBtn, 'click', onClearClick);
  track(document, 'pointerdown', onDocPointerDown, true);
  track(document, 'keydown', onDocKeyDown, true);
  track(window, 'resize', onWindowResize);
  if (listEl && global.ScrollFade && typeof global.ScrollFade.attach === 'function') {
    fade = global.ScrollFade.attach(listEl, { axis: 'y', size: 14 });
  }
  positionPanel();
  renderList();
}

// Release the panel: the store subscription, every handler init() bound, and
// the element references. Safe to call when init() never ran.
function dispose() {
  if (unsub) {
    unsub();
    unsub = null;
  }
  while (teardown.length) {
    const off = teardown.pop();
    try { off(); } catch (_) {}
  }
  if (fade) {
    try { fade.destroy(); } catch (_) {}
    fade = null;
  }
  setOpen(false);
  bellBtn = null;
  panelEl = null;
  listEl = null;
  emptyEl = null;
  clearBtn = null;
  countEl = null;
}

global.Notifications = {
  init,
  dispose,
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
  _pure: {
    normalizeRecord,
    linkTarget,
    itemView,
    panelView,
    kindMeta,
    labelTitle,
    inlineSegments,
    formatStamp,
    formatStampFull,
    SCHEMA_VERSION,
  },
};
global.BelJarNotifications = global.Notifications;
