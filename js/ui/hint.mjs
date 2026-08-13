// Lightweight coachmark balloons. One at a time; optional once-ever via id.
// Hint.show({ id, anchor, text, duration?, onClick? })
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

  function wasDismissed(id) {
    if (!id || typeof Persist === 'undefined') return false;
    if (Persist.readStoredHintDismissed && Persist.readStoredHintDismissed(id)) return true;
    // Migrate the original library flag into the generic store.
    if (id === 'library' && Persist.readStoredLibraryHintDismissed && Persist.readStoredLibraryHintDismissed()) {
      persistDismissed('library');
      return true;
    }
    return false;
  }

  function persistDismissed(id) {
    if (!id || typeof Persist === 'undefined') return;
    if (Persist.writeStoredHintDismissed) Persist.writeStoredHintDismissed(id, true);
    if (id === 'library' && Persist.writeStoredLibraryHintDismissed) {
      Persist.writeStoredLibraryHintDismissed(true);
    }
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
        if (!actionFn) return;
        if (e.target && e.target.closest && e.target.closest('.hint-close')) return;
        e.preventDefault();
        const fn = actionFn;
        dismiss();
        fn();
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
    if (cardEl) cardEl.classList.remove('is-action');
    releaseTooltip();
    anchorEl = null;
    activeId = null;
  }

  // Shrink root to the tightest width that keeps the wrap count from max-width layout.
  function fitWidth() {
    if (!rootEl) return;
    rootEl.style.removeProperty('width');

    const cs = getComputedStyle(rootEl);
    let maxW = parseFloat(cs.maxWidth);
    if (!Number.isFinite(maxW) || maxW <= 0) {
      maxW = Math.min(280, window.innerWidth - 20);
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
    const hr = rootEl.getBoundingClientRect();
    const margin = 8;
    let left = Math.round(ar.right + GAP_PX);
    let top = Math.round(ar.top + ar.height / 2 - hr.height / 2);

    const maxLeft = window.innerWidth - hr.width - margin;
    const maxTop = window.innerHeight - hr.height - margin;
    if (left > maxLeft) left = Math.max(margin, maxLeft);
    if (top < margin) top = margin;
    if (top > maxTop) top = Math.max(margin, maxTop);

    const arrowY = Math.max(12, Math.min(hr.height - 12, ar.top + ar.height / 2 - top));
    cardEl.style.setProperty('--hint-arrow-y', arrowY + 'px');
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

  function show(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const id = o.id != null ? String(o.id) : null;
    const anchor = o.anchor;
    const text = o.text != null ? String(o.text) : '';
    const duration = typeof o.duration === 'number' && o.duration > 0 ? o.duration : DEFAULT_DURATION_MS;
    const once = o.once !== false;

    if (!anchor || !text) return false;
    if (once && id && wasDismissed(id)) return false;
    if (!ensureDom()) return false;

    if (visible || dismissing) {
      clearTimers();
      finishHide();
    }

    activeId = id;
    anchorEl = anchor;
    actionFn = typeof o.onClick === 'function' ? o.onClick : null;
    if (cardEl) {
      if (actionFn) cardEl.classList.add('is-action');
      else cardEl.classList.remove('is-action');
    }
    bodyEl.textContent = text;
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

    autoTimer = setTimeout(() => {
      autoTimer = null;
      dismiss();
    }, duration);
    return true;
  }

  function onResize() {
    if (!visible || dismissing) return;
    place();
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
