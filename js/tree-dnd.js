// Reusable pointer-based tree drag-and-drop.
(function (global) {
  'use strict';

  var THRESHOLD = 4;
  var AUTO_EXPAND_MS = 600;

  function attach(container, opts) {
    if (!container || !opts) return function () {};

    var drag = null;
    var ghost = null;
    var expandTimer = null;
    var lastHighlightEls = [];
    var lastTarget = null;

    function clearExpandTimer() {
      if (expandTimer) {
        clearTimeout(expandTimer);
        expandTimer = null;
      }
    }

    function clearTargetHighlight() {
      for (var i = 0; i < lastHighlightEls.length; i++) {
        lastHighlightEls[i].classList.remove('is-drop-target');
      }
      lastHighlightEls = [];
      lastTarget = null;
    }

    function cleanup() {
      clearExpandTimer();
      clearTargetHighlight();
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
      if (drag && drag.dragEls) {
        for (var i = 0; i < drag.dragEls.length; i++) {
          drag.dragEls[i].classList.remove('is-dragging');
        }
      } else if (drag && drag.sourceEl) {
        drag.sourceEl.classList.remove('is-dragging');
      }
      drag = null;
      document.body.classList.remove('tree-dnd-active');
      document.body.classList.remove('tree-dnd-invalid');
    }

    function setInvalidCursor(invalid) {
      document.body.classList.toggle('tree-dnd-invalid', !!invalid);
    }

    function applyHighlight(resolved) {
      clearTargetHighlight();
      if (!drag) return null;
      if (drag.payload && drag.payload.dragBlocked) {
        setInvalidCursor(true);
        return null;
      }
      if (!resolved) {
        setInvalidCursor(false);
        return null;
      }
      var ok = typeof opts.canDrop === 'function' && opts.canDrop(drag.payload, resolved.target);
      if (!ok) {
        setInvalidCursor(false);
        return null;
      }
      setInvalidCursor(false);
      var els = resolved.highlightEls || (resolved.highlightEl ? [resolved.highlightEl] : []);
      for (var i = 0; i < els.length; i++) {
        if (els[i]) els[i].classList.add('is-drop-target');
      }
      lastHighlightEls = els.filter(Boolean);
      lastTarget = resolved.target;
      clearExpandTimer();
      if (resolved.target.kind === 'folder' && typeof opts.onAutoExpand === 'function') {
        expandTimer = setTimeout(function () {
          expandTimer = null;
          opts.onAutoExpand(resolved.target.folderPath);
        }, AUTO_EXPAND_MS);
      }
      return resolved.target;
    }

    function resolveAt(clientX, clientY) {
      if (typeof opts.resolveDrop === 'function') {
        return opts.resolveDrop(clientX, clientY, drag ? drag.payload : null);
      }
      var hit = document.elementFromPoint(clientX, clientY);
      var targetEl = hit && hit.closest ? hit.closest('[data-drop-target]') : null;
      if (!targetEl || !container.contains(targetEl)) return null;
      var target = typeof opts.getDropTarget === 'function' ? opts.getDropTarget(targetEl) : null;
      if (!target) return null;
      return { target: target, highlightEls: [targetEl] };
    }

    function updateTarget(clientX, clientY) {
      if (!drag || !drag.active) return;
      if (drag.payload && drag.payload.dragBlocked) {
        setInvalidCursor(true);
        clearTargetHighlight();
        return;
      }
      applyHighlight(resolveAt(clientX, clientY));
    }

    function onPointerMove(e) {
      if (!drag) return;
      var dx = e.clientX - drag.startX;
      var dy = e.clientY - drag.startY;
      if (!drag.active) {
        if (Math.abs(dx) + Math.abs(dy) < THRESHOLD) return;
        drag.active = true;
        drag.dragEls = (drag.payload && drag.payload.dragEls) || [drag.sourceEl];
        for (var di = 0; di < drag.dragEls.length; di++) {
          drag.dragEls[di].classList.add('is-dragging');
        }
        document.body.classList.add('tree-dnd-active');
        if (drag.payload && drag.payload.dragBlocked) setInvalidCursor(true);
        ghost = document.createElement('div');
        ghost.className = 'tree-dnd-ghost';
        ghost.textContent = drag.payload.label || '';
        document.body.appendChild(ghost);
      }
      ghost.style.transform = 'translate(' + (e.clientX + 12) + 'px,' + (e.clientY + 12) + 'px)';
      updateTarget(e.clientX, e.clientY);
    }

    function onPointerUp(e) {
      if (!drag) return;
      var payload = drag.payload;
      var sourceEl = drag.sourceEl;
      var wasActive = drag.active;
      var target = wasActive ? applyHighlight(resolveAt(e.clientX, e.clientY)) : null;
      cleanup();
      if (wasActive && target && !payload.dragBlocked && typeof opts.canDrop === 'function'
        && opts.canDrop(payload, target) && typeof opts.onDrop === 'function') {
        opts.onDrop(payload, target);
      }
      if (sourceEl && sourceEl.releasePointerCapture) {
        try { sourceEl.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
    }

    function onPointerDown(e) {
      if (e.button !== 0 || drag) return;
      if (e.target.closest('.explorer-folder-chevron')) return;
      if (e.target.closest('.explorer-default-cfg-mark--inactive')) return;
      var row = e.target.closest('[data-draggable]');
      if (!row || !container.contains(row)) return;
      if (typeof opts.getDragPayload !== 'function') return;
      var payload = opts.getDragPayload(row);
      if (!payload) return;
      e.preventDefault();
      drag = {
        sourceEl: row,
        payload: payload,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
      };
      if (row.setPointerCapture) row.setPointerCapture(e.pointerId);
    }

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);

    return function detach() {
      cleanup();
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
    };
  }

  global.BelJarTreeDnD = { attach: attach };
})(typeof window !== 'undefined' ? window : globalThis);
