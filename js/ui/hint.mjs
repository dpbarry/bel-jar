// Lightweight coachmark balloons. One at a time; optional once-ever via id.
// Hint.show({ id, anchor, text, duration?, onClick?, side?, align?, hold?, wait? })
// side 'right' (the default) sits beside the anchor; 'below' sits under it
// (align 'end' keeps a top-right anchor's box on the screen). The countdown
// runs unless hold (no countdown, no close, until dismiss). A once-ever id is
// remembered the moment the box is shown, so a refresh does not show it again.
// wait: false shows without waiting for a sync round (a tip for someone signed
// out has no account answer to wait for).
// Once-ever follows the account: a tip seen on one computer is seen on all of
// them (hint-seen.mjs).
import { seenSetting, wasSeen, carryForward, settingsKnown } from './hint-seen.mjs';

const global = globalThis;
const DEFAULT_DURATION_MS = 10000;
  const GAP_PX = 10;
  const LEAVE_MS = 160;
  const CLOSE_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
    '</svg>';

  let rootEl = null;
  let cardEl = null;
  let bodyEl = null;
  let closeBtn = null;
  let anchorEl = null;
  let activeId = null;
  let autoTimer = null;
  let leaveTimer = null;
  let visible = false;
  let dismissing = false;
  let resizeBound = false;
  let actionFn = null;
  let placeSide = 'right';
  let placeAlign = 'end';

  function setting(row) {
    return typeof Settings !== 'undefined' && Settings.get ? Settings.get(row) : undefined;
  }

  function wasDismissed(id) {
    if (!id) return false;
    return wasSeen(id, { setting: setting, deviceList: typeof Device !== 'undefined' ? Device.get('dismissedHints') : [] });
  }

  function persistDismissed(id) {
    if (!id) return;
    var row = seenSetting(id);
    if (row && typeof Settings !== 'undefined') {
      if (Settings.get(row) !== true) Settings.set(row, true);
      return;
    }
    if (typeof Device === 'undefined') return;
    var list = Device.get('dismissedHints');
    if (list.indexOf(id) !== -1) return;
    list.push(id);
    Device.set('dismissedHints', list);
  }

  function clearTimers() {
    if (autoTimer != null) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
    if (leaveTimer != null) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
  }

  function releaseTooltip() {
    if (anchorEl && global.Tooltips && Tooltips.releaseAnchor) Tooltips.releaseAnchor(anchorEl);
  }

  function suppressTooltip() {
    if (anchorEl && global.Tooltips && Tooltips.suppressAnchor) Tooltips.suppressAnchor(anchorEl);
    if (anchorEl && global.Tooltips && Tooltips.hideImmediate) Tooltips.hideImmediate();
  }

  function progressBar() {
    return rootEl && rootEl.querySelector('.hint-progress-bar');
  }

  function freezeProgressBar() {
    const bar = progressBar();
    if (!bar) return;
    const t = getComputedStyle(bar).transform;
    bar.style.animation = 'none';
    bar.style.transition = 'none';
    bar.style.transform = t && t !== 'none' ? t : 'scaleX(0)';
  }

  function clearProgressBarFreeze() {
    const bar = progressBar();
    if (!bar) return;
    bar.style.removeProperty('animation');
    bar.style.removeProperty('transition');
    bar.style.removeProperty('transform');
  }

  function ensureDom() {
    if (rootEl) return true;
    rootEl = document.getElementById('hint-root');
    if (!rootEl) {
      rootEl = document.createElement('div');
      rootEl.id = 'hint-root';
      rootEl.className = 'hint-root';
      rootEl.setAttribute('role', 'status');
      rootEl.setAttribute('aria-live', 'polite');
      rootEl.setAttribute('aria-hidden', 'true');
      rootEl.hidden = true;
      rootEl.innerHTML =
        '<div class="hint-card">' +
          '<div class="hint-top">' +
            '<div class="hint-body"></div>' +
            '<button type="button" class="icon-btn hint-close" aria-label="Dismiss">' + CLOSE_SVG + '</button>' +
          '</div>' +
          '<div class="hint-progress" aria-hidden="true"><span class="hint-progress-bar"></span></div>' +
        '</div>';
      document.body.appendChild(rootEl);
    }
    cardEl = rootEl.querySelector('.hint-card');
    bodyEl = rootEl.querySelector('.hint-body');
    closeBtn = rootEl.querySelector('.hint-close');
    if (closeBtn && !closeBtn._belHintBound) {
      closeBtn._belHintBound = true;
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
      });
    }
    if (cardEl && !cardEl._belHintActionBound) {
      cardEl._belHintActionBound = true;
      cardEl.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('.hint-close')) return;
        if (!actionFn) return;
        e.preventDefault();
        e.stopPropagation();
        runAction();
      });
      cardEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.repeat || !actionFn) return;
        e.preventDefault();
        e.stopPropagation();
        runAction();
      });
    }
    if (!resizeBound) {
      resizeBound = true;
      window.addEventListener('resize', onResize);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onResize);
      }
    }
    return true;
  }

  function finishHide() {
    if (!rootEl) return;
    rootEl.classList.remove('is-visible', 'is-leaving');
    clearProgressBarFreeze();
    rootEl.style.removeProperty('width');
    rootEl.hidden = true;
    rootEl.setAttribute('aria-hidden', 'true');
    visible = false;
    dismissing = false;
    actionFn = null;
    rootEl.classList.remove('is-hold');
    delete rootEl.dataset.side;
    rootEl.style.removeProperty('--hint-arrow-x');
    if (cardEl) {
      cardEl.classList.remove('is-action');
      cardEl.removeAttribute('role');
      cardEl.removeAttribute('tabindex');
    }
    releaseTooltip();
    anchorEl = null;
    activeId = null;
  }

  // Shrink root to the tightest width that keeps the wrap count from max-width layout.
  // Must run after webfonts settle — a wider fallback face wraps more lines, and the
  // binary search then locks a too-narrow box for the real face.
  function fitWidth() {
    if (!rootEl) return;
    rootEl.style.removeProperty('width');

    const cs = getComputedStyle(rootEl);
    let maxW = parseFloat(cs.maxWidth);
    if (!Number.isFinite(maxW) || maxW <= 0) {
      maxW = Math.min(352, window.innerWidth - 20);
    }
    maxW = Math.min(Math.floor(maxW), window.innerWidth - 16);
    if (maxW < 48) maxW = 48;

    rootEl.style.width = maxW + 'px';
    const targetH = rootEl.offsetHeight;

    let lo = 48;
    let hi = maxW;
    let best = maxW;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      rootEl.style.width = mid + 'px';
      if (rootEl.offsetHeight > targetH) {
        lo = mid + 1;
      } else {
        best = mid;
        hi = mid - 1;
      }
    }
    rootEl.style.width = best + 'px';
  }

  /** How far below a header bar a box dropped from it sits: `--header-menu-gap`, in px. */
  function headerDrop(anchor) {
    const header = anchor.closest && anchor.closest('header');
    if (!header) return null;
    const v = getComputedStyle(header).getPropertyValue('--header-menu-gap').trim();
    const n = parseFloat(v);
    let gap = GAP_PX;
    if (Number.isFinite(n)) {
      gap = /rem$/.test(v) ? n * parseFloat(getComputedStyle(document.documentElement).fontSize) : n;
    }
    return { bottom: header.getBoundingClientRect().bottom, gap };
  }

  function runAction() {
    if (!actionFn || dismissing) return;
    const fn = actionFn;
    actionFn = null;
    dismiss();
    fn();
  }

  function place() {
    if (!rootEl || !cardEl || !anchorEl) return;
    rootEl.hidden = false;
    rootEl.style.left = '0px';
    rootEl.style.top = '0px';
    rootEl.style.visibility = 'hidden';
    rootEl.style.opacity = '0';
    rootEl.style.pointerEvents = 'none';

    fitWidth();

    const ar = anchorEl.getBoundingClientRect();
    // Layout size, not the scaled box: placement runs before the balloon is
    // shown, while it is still scaled down, and a scaled measurement sits it short.
    const width = rootEl.offsetWidth;
    const height = rootEl.offsetHeight;
    const margin = 8;
    let left;
    let top;
    if (placeSide === 'below') {
      const drop = headerDrop(anchorEl);
      const anchorBottom = drop ? drop.bottom : ar.bottom;
      const gap = drop ? drop.gap : GAP_PX;
      if (placeAlign === 'start') left = Math.round(ar.left);
      else if (placeAlign === 'center') left = Math.round(ar.left + ar.width / 2 - width / 2);
      else left = Math.round(ar.right - width);
      top = Math.round(anchorBottom + gap);
      rootEl.dataset.side = 'below';
      cardEl.style.removeProperty('--hint-arrow-y');
    } else {
      left = Math.round(ar.right + GAP_PX);
      top = Math.round(ar.top + ar.height / 2 - height / 2);
      rootEl.dataset.side = 'right';
      rootEl.style.removeProperty('--hint-arrow-x');
    }

    const maxLeft = window.innerWidth - width - margin;
    const maxTop = window.innerHeight - height - margin;
    if (left < margin) left = margin;
    if (left > maxLeft) left = Math.max(margin, maxLeft);
    if (top < margin) top = margin;
    if (top > maxTop) top = Math.max(margin, maxTop);

    if (placeSide === 'below') {
      const arrowX = Math.max(12, Math.min(width - 12, ar.left + ar.width / 2 - left));
      rootEl.style.setProperty('--hint-arrow-x', arrowX + 'px');
    } else {
      const arrowY = Math.max(12, Math.min(height - 12, ar.top + ar.height / 2 - top));
      cardEl.style.setProperty('--hint-arrow-y', arrowY + 'px');
    }
    rootEl.style.left = left + 'px';
    rootEl.style.top = top + 'px';
    rootEl.style.removeProperty('visibility');
    rootEl.style.removeProperty('opacity');
    rootEl.style.removeProperty('pointer-events');
  }

  function dismiss(id) {
    if (id != null && activeId != null && id !== activeId) {
      persistDismissed(id);
      return;
    }
    const dismissId = activeId || id;
    if (!visible || dismissing) {
      if (dismissId) persistDismissed(dismissId);
      return;
    }
    dismissing = true;
    if (dismissId) persistDismissed(dismissId);
    clearTimers();
    freezeProgressBar();
    rootEl.classList.remove('is-visible');
    rootEl.classList.add('is-leaving');
    const finish = () => {
      rootEl.removeEventListener('transitionend', onEnd);
      finishHide();
    };
    const onEnd = (e) => {
      if (e.target !== rootEl) return;
      finish();
    };
    rootEl.addEventListener('transitionend', onEnd);
    leaveTimer = setTimeout(finish, LEAVE_MS + 40);
  }

  /** Whether the account has answered what it has seen (hint-seen.mjs settingsKnown). */
  function accountAnswered() {
    var P = global.Persist;
    var summary = P && typeof P.syncSummary === 'function' ? P.syncSummary() : null;
    return settingsKnown(summary, setting('syncSettings') !== false);
  }

  // Tips waiting for the first round on this device, by id; the first whose
  // anchor is still on screen shows when the round lands.
  var waiting = new Map();
  var waitUnsub = null;

  function release() {
    if (waitUnsub) { waitUnsub(); waitUnsub = null; }
    var queued = Array.from(waiting.values());
    waiting.clear();
    for (var i = 0; i < queued.length; i++) {
      var a = queued[i].anchor;
      var box = a && a.isConnected ? a.getBoundingClientRect() : null;
      if (box && box.width > 0 && box.height > 0 && show(Object.assign({}, queued[i], { waited: true }))) return;
    }
  }

  function waitForAccount(o) {
    waiting.set(String(o.id), o);
    if (waitUnsub) return;
    var P = global.Persist;
    if (P && typeof P.onSyncSummary === 'function') {
      waitUnsub = P.onSyncSummary(function () { if (accountAnswered()) release(); });
    }
  }

  function show(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const id = o.id != null ? String(o.id) : null;
    const anchor = o.anchor;
    const text = o.text != null ? String(o.text) : '';
    const duration = typeof o.duration === 'number' && o.duration > 0 ? o.duration : DEFAULT_DURATION_MS;
    const once = o.once !== false;

    if (!anchor || !text) return false;
    if (once && id && wasDismissed(id)) return false;
    if (once && id && seenSetting(id) && o.wait !== false && !o.waited && !accountAnswered()) {
      waitForAccount(o);
      return false;
    }
    if (!ensureDom()) return false;

    if (visible || dismissing) {
      clearTimers();
      finishHide();
    }

    activeId = id;
    anchorEl = anchor;
    placeSide = o.side === 'below' ? 'below' : 'right';
    placeAlign = o.align === 'start' || o.align === 'center' ? o.align : 'end';
    actionFn = typeof o.onClick === 'function' ? o.onClick : null;
    if (cardEl) {
      if (actionFn) {
        cardEl.classList.add('is-action');
        cardEl.setAttribute('role', 'button');
        cardEl.tabIndex = 0;
      } else {
        cardEl.classList.remove('is-action');
        cardEl.removeAttribute('role');
        cardEl.removeAttribute('tabindex');
      }
    }
    bodyEl.textContent = text;
    rootEl.classList.toggle('is-hold', !!o.hold);
    rootEl.style.setProperty('--hint-duration', duration / 1000 + 's');
    clearProgressBarFreeze();

    place();
    suppressTooltip();
    rootEl.setAttribute('aria-hidden', 'false');
    void rootEl.offsetWidth;
    rootEl.classList.remove('is-leaving');
    rootEl.classList.add('is-visible');
    visible = true;
    dismissing = false;

    const placeId = activeId;
    const fonts = document.fonts;
    if (fonts && fonts.status !== 'loaded' && fonts.ready) {
      fonts.ready.then(() => {
        if (!visible || dismissing || activeId !== placeId) return;
        place();
      });
    }

    // Seen as it appears. Waiting for the countdown or a click would show it
    // again on a refresh in between.
    if (once && id) persistDismissed(id);
    if (!o.hold) {
      autoTimer = setTimeout(() => {
        autoTimer = null;
        dismiss();
      }, duration);
    }
    return true;
  }

  function onResize() {
    if (!visible || dismissing) return;
    place();
  }

  // Seen on another computer while this one shows it: the round that brings
  // the news closes it.
  if (typeof Settings !== 'undefined' && typeof Settings.subscribe === 'function') {
    Settings.subscribe(function (e) {
      // A value this page just stored is not news from another computer.
      if (!visible || dismissing || !activeId || !e || e.origin === 'local') return;
      var row = seenSetting(activeId);
      if (row && e && Array.isArray(e.ids) && e.ids.indexOf(row) !== -1 && setting(row) === true) dismiss();
    });
  }
  // What this device saw before the rows existed reaches the cloud.
  if (typeof Settings !== 'undefined' && typeof Device !== 'undefined') {
    carryForward(Device.get('dismissedHints'), setting).forEach(function (row) { Settings.set(row, true); });
  }

  global.Hint = {
    show: show,
    dismiss: dismiss,
    wasDismissed: wasDismissed,
    isVisible: function (id) {
      if (!visible || dismissing) return false;
      if (id == null) return true;
      return activeId === String(id);
    },
  };
  global.BelJarHint = global.Hint;
