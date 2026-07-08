'use strict';

// BelJarHarpoon — the Harpoon UI (Architecture II).
(function (global) {
  function E() { return global.BelJarEditor || null; }
  function P() { return global.BelJarHarpoonEngine || null; }
  function FW() { return global.FloatingWindow || null; }

  function toast(msg, kind) {
    var T = global.BelJarToasts;
    if (!T) return;
    if (kind === 'error' && T.error) T.error(msg);
    else if (kind === 'success' && T.success) T.success(msg);
    else if (T.info) T.info(msg);
  }

  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  var ICON_UNDO =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'
    + '</svg>';
  var ICON_REDO =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'
    + '</svg>';
  var ICON_CHECK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M20 6 9 17l-5-5"/>'
    + '</svg>';
  var ICON_ARROW_RIGHT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'
    + '</svg>';
  var ICON_ALERT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01"/>'
    + '</svg>';
  // A calm "stopped" glyph (a horizontal bar in a circle) — an honest halt, NOT an
  // error cross. Auto-solve declining is a valid outcome, not a failure.
  var ICON_STOP =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>'
    + '</svg>';
  var ICON_PAUSE =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
    + '<rect x="6" y="5" width="4" height="14" rx="1"/>'
    + '<rect x="14" y="5" width="4" height="14" rx="1"/>'
    + '</svg>';
  // A "pop out to its own window" glyph (expand arrows) — mirrors the inspector's ⤢.
  var ICON_POPOUT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M15 3h6v6"/><path d="M10 14 21 3"/>'
    + '<path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>'
    + '</svg>';
  var ICON_PLAY =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
    + '<path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l10.2-6.2a1 1 0 0 0 0-1.7L9.6 4.9A1 1 0 0 0 8 5.8Z"/>'
    + '</svg>';
  // A four-point spark — the auto-solve identity (search/insight), not a lightning
  // bolt (too "power/danger"). Small central glint + a larger cross-star.
  var ICON_SPARK =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
    + '<path d="M12 2.5c.3 3.1 1.4 4.2 4.5 4.5-3.1.3-4.2 1.4-4.5 4.5-.3-3.1-1.4-4.2-4.5-4.5 3.1-.3 4.2-1.4 4.5-4.5Z"/>'
    + '<path d="M18.5 12.5c.2 2 .9 2.7 2.9 2.9-2 .2-2.7.9-2.9 2.9-.2-2-.9-2.7-2.9-2.9 2-.2 2.7-.9 2.9-2.9Z"/>'
    + '</svg>';
  function setTip(el, text, opts) {
    if (!el) return;
    if (global.Tooltips && global.Tooltips.set) {
      global.Tooltips.set(el, text, opts);
    } else {
      el.removeAttribute('title');
      var tip = text != null ? String(text).trim() : '';
      if (tip) el.setAttribute('data-tooltip', tip);
      else el.removeAttribute('data-tooltip');
    }
  }

  function stepGoalTip(goal) {
    if (!goal) return '';
    return 'Goal at this step: ' + displayType(goal);
  }

  function bindStepGoalTip(host, goal) {
    if (!host) return;
    var tip = stepGoalTip(goal);
    if (!tip) {
      setTip(host, '', { ariaLabel: false });
      host.removeAttribute('data-tooltip-placement');
      return;
    }
    host.setAttribute('data-tooltip-placement', 'below');
    setTip(host, tip, { ariaLabel: false });
  }

  function iconBtn(className, svg, label, tip, onClick, disabled) {
    var b = el('button', className);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    if (tip) setTip(b, tip);
    if (disabled) b.disabled = true;
    b.innerHTML = svg;
    b.addEventListener('click', function (e) { e.preventDefault(); if (!b.disabled) onClick(); });
    return b;
  }

  var probeSessions = [];
  var probeTimer = null;

  function scheduleAnchorProbeAll() {
    if (probeTimer) clearTimeout(probeTimer);
    probeTimer = setTimeout(function () {
      probeTimer = null;
      for (var i = 0; i < probeSessions.length; i += 1) {
        var s = probeSessions[i];
        if (s && typeof s.probeAnchor === 'function') s.probeAnchor();
      }
    }, 300);
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('beljar:doc-changed', scheduleAnchorProbeAll);
    global.addEventListener('beljar:file-lint', scheduleAnchorProbeAll);
    global.addEventListener('beljar:development-checked', scheduleAnchorProbeAll);
    global.addEventListener('beljar:active-editor-view', scheduleAnchorProbeAll);
  }

  function liveFileText(fileId) {
    var P = global.BelJarPersist;
    if (!P || !fileId) return '';
    var activeId = P.getActiveFileId ? P.getActiveFileId() : null;
    var api = global.BelJarCurrentEditor;
    if (fileId === activeId && api && typeof api.getValue === 'function') {
      return api.getValue();
    }
    return typeof P.getFileText === 'function' ? (P.getFileText(fileId) || '') : '';
  }

  // 1-based line/col -> character offset against a plain text snapshot (not a
  // live CodeMirror doc) so this works whether or not the target file's view
  // is currently mounted.
  function lineColToOffset(text, line, col) {
    var lines = text.split('\n');
    var offset = 0;
    for (var i = 0; i < line - 1 && i < lines.length; i += 1) {
      offset += lines[i].length + 1;
    }
    var lineText = lines[line - 1] || '';
    var c = Math.max(0, (col || 1) - 1);
    return offset + Math.min(c, lineText.length);
  }

  function findHoleHitInText(docText, anchor, ed) {
    if (!anchor || !docText || !ed || typeof ed.parseDecl !== 'function') return null;
    var re = new RegExp(
      '\\b(rec|proof)\\s+' + String(anchor.declName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:',
    );
    var m = re.exec(docText);
    if (!m) return null;
    var from = m.index;
    var semi = docText.indexOf(';', from);
    var to = semi < 0 ? docText.length : semi + 1;
    var lines = docText.slice(0, from).split('\n');
    var declStartLine = lines.length;
    var declSlice = docText.slice(from, to);
    var decl = ed.parseDecl(declSlice);
    if (!decl || (anchor.declKey && (decl.kw + ':' + decl.name) !== anchor.declKey)) return null;
    var bodyStart = from + (decl.bodyStart != null ? decl.bodyStart : declSlice.indexOf('=') + 1);
    var body = docText.slice(bodyStart, to);
    var qIdx = body.indexOf('?');
    if (qIdx < 0) return null;
    var before = docText.slice(0, bodyStart + qIdx);
    var line = before.split('\n').length;
    var lastNl = before.lastIndexOf('\n');
    var col = before.length - (lastNl < 0 ? 0 : lastNl + 1) + 1;
    if (anchor.holeKey) {
      var want = anchor.holeKey;
      var got = line + ':' + col + ':';
      if (want.indexOf(got) !== 0 && got !== want.split(':').slice(0, 2).join(':') + ':') {
        // allow line/col drift if still same decl and ? exists
      }
    }
    var off = bodyStart + qIdx;
    return { hole: { line: line, col: col, name: null }, from: off, to: off + 1 };
  }

  function normalizeGlyphs(text) {
    return String(text == null ? '' : text)
      .replace(/\|-#/g, '⊢#')
      .replace(/\|-/g, '⊢')
      .replace(/=>/g, '⇒')
      .replace(/->/g, '→');
  }

  function displayType(typeStr) {
    var ed = E();
    if (ed && typeof ed.normalizeType === 'function') return ed.normalizeType(typeStr);
    return normalizeGlyphs(typeStr);
  }

  function displaySource(text) {
    var ed = E();
    var s = String(text || '');
    if (ed && typeof ed.normalizeType === 'function') return ed.normalizeType(s);
    if (ed && typeof ed.expandBelAliases === 'function') s = ed.expandBelAliases(s);
    return normalizeGlyphs(s);
  }

  function renderType(host, typeStr) {
    var norm = displayType(typeStr);
    host.textContent = '';
    if (!norm) return;
    var ed = E();
    if (ed && typeof ed.renderTypeInto === 'function') {
      try {
        ed.renderTypeInto(host, norm, 'comp');
        if (host.textContent.indexOf('|-') !== -1) host.textContent = norm;
        return;
      } catch (e) { /* fall through */ }
    }
    host.textContent = norm;
  }

  function renderSource(host, text) {
    var shown = displaySource(text);
    host.textContent = '';
    if (!shown) return;
    var ed = E();
    if (ed && typeof ed.renderSourceInto === 'function') {
      try {
        ed.renderSourceInto(host, shown, 'bel');
        if (host.textContent.indexOf('|-') !== -1) host.textContent = shown;
        return;
      } catch (e) { /* fall through */ }
    }
    host.textContent = shown;
  }

  function resolveNativeAutoGoalDisplay(session, na) {
    if (!na || !na.goalType) return { goalType: null, goalState: 'live' };
    if (na.complete || na.phase === 'solved') {
      return { goalType: na.goalType, goalState: 'live' };
    }
    var ed = E();
    var prep = session.prep;
    if (!ed || !prep || typeof ed.resolveHoleGoalForHit !== 'function') {
      return { goalType: na.goalType, goalState: na.goalState || 'live' };
    }
    var api = global.BelJarCurrentEditor;
    var eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
    var hit = ed.resolveHoleGoalForHit(session.view, eng, prep.hit);
    if (!hit || !hit.goal) {
      return { goalType: na.goalType, goalState: na.goalState || 'live' };
    }
    var st = hit.state || 'live';
    if (st === 'pending' || st === 'approximate' || st === 'rechecking') {
      return { goalType: hit.goal, goalState: st };
    }
    return { goalType: hit.goal, goalState: 'live' };
  }

  function appendAutoGoalHero(parent, goalType, declName, goalState) {
    var wrap = el('div', 'harpoon-lab-auto-goal harpoon-lab-strip tone-goal');
    var glabel = el('div', 'harpoon-lab-goal-label');
    glabel.appendChild(el('span', 'harpoon-lab-goal-label-text harpoon-lab-section-label is-goal', 'Goal'));
    if (declName) glabel.appendChild(el('span', 'harpoon-lab-auto-goal-name', declName));
    wrap.appendChild(glabel);
    var goal = el('div', 'harpoon-hole-goal');
    var ed = E();
    if (ed && typeof ed.mountHoleGoalTier === 'function') {
      ed.mountHoleGoalTier(goal, { surface: 'lab', goalState: goalState || 'live', goal: goalType });
    } else {
      renderType(goal, goalType);
    }
    wrap.appendChild(goal);
    parent.appendChild(wrap);
    return wrap;
  }

  function appendAutoSolution(parent, body) {
    var wrap = el('div', 'harpoon-lab-auto-solution harpoon-lab-auto-panel');
    wrap.appendChild(el('span', 'harpoon-lab-auto-solution-label harpoon-lab-section-label is-solution', 'Solution'));
    var bodyEl = el('div', 'harpoon-lab-auto-solution-body');
    // Show EXACTLY what commit will place: the canonically-glyphed, re-laid-out
    // proof body (same formatter commitProof uses), so the panel is a faithful
    // preview rather than the search's raw sprawl.
    renderSource(bodyEl, formatSolutionBody(body));
    wrap.appendChild(bodyEl);
    parent.appendChild(wrap);
    return wrap;
  }

  function formatSolutionBody(body) {
    var ed = E();
    if (ed && typeof ed.formatProofBody === 'function') {
      try { return ed.formatProofBody(body); } catch (e) { /* fall through */ }
    }
    return body;
  }

  function autoVerdictTone(na) {
    if (na.complete) return 'success';
    if (na.stuck && na.stuck.reason === 'file-errors') return 'error';
    return 'warn';
  }

  function renderManualSolvedSummary(parent) {
    var banner = buildBannerShell({
      className: 'harpoon-lab-manual-head harpoon-lab-strip harpoon-lab-banner',
      tone: 'success',
      icon: ICON_CHECK,
      badgeClass: 'harpoon-lab-auto-badge is-solved',
      copyClass: 'harpoon-lab-auto-head-copy',
      titleClass: 'harpoon-lab-auto-title',
      subClass: 'harpoon-lab-auto-sub',
      title: 'Proof complete',
      sub: 'Ready to place in the file',
    });
    parent.appendChild(banner);
    return banner;
  }

  function Session(view, declFrom, declTo, host) {
    this.view = view;
    this.declFrom = declFrom;
    this.declTo = declTo;
    this.host = host || { kind: 'float' };
    this.win = null;
    this.bodyEl = null;
    this.barEl = null;
    this.model = null;
    this.focusedId = null;
    this.fileId = null;
    this.anchor = null;
    this.compromise = { level: 'none', reason: '', detail: '' };
    this.userCancelled = false;
    this.pendingCommitSource = null;
    this._compromiseBanner = null;
    this._commitPlacedFadeTimer = null;
    this._commitPlacedHideTimer = null;
    this.commitState = defaultCommitState();
  }

  Session.prototype.getCommitState = function () {
    if (this.nativeAuto) {
      if (!this.nativeAuto.commit) this.nativeAuto.commit = defaultCommitState();
      return this.nativeAuto.commit;
    }
    if (!this.commitState) this.commitState = defaultCommitState();
    return this.commitState;
  };

  Session.prototype.beginCommitUi = function (phase) {
    var st = this.getCommitState();
    this.clearCommitSuccessDismiss();
    st.status = 'checking';
    st.phase = phase || 'verify';
    st.detail = '';
    st.dismissed = false;
    if (phase !== 'verify' || !st.usedFullCheck) st.usedFullCheck = false;
    this.updateCommitPlace();
  };

  Session.prototype.updateCommitPlace = function () {
    var place = this.bodyEl && this.bodyEl.querySelector('.harpoon-lab-place');
    if (!place) return;
    var st = this.getCommitState();
    if (st.status !== 'checking') {
      place.classList.remove('is-committing');
      var oldTrack = place.querySelector('.harpoon-lab-place-track');
      if (oldTrack) oldTrack.remove();
      var titleIdle = place.querySelector('.harpoon-lab-place-title');
      if (titleIdle) titleIdle.classList.remove('beljar-tip-shimmer');
      return;
    }
    place.disabled = true;
    place.classList.add('is-committing');
    var title = place.querySelector('.harpoon-lab-place-title');
    var sub = place.querySelector('.harpoon-lab-place-sub');
    if (st.phase === 'translate') {
      if (title) title.textContent = 'Translating…';
      if (sub) sub.textContent = 'Preparing proof for insert';
    } else if (st.usedFullCheck) {
      if (title) title.textContent = 'Checking…';
      if (sub) sub.textContent = 'Full development check';
    } else {
      if (title) title.textContent = 'Checking…';
      if (sub) sub.textContent = 'Verifying before insert';
    }
    if (title) title.classList.add('beljar-tip-shimmer');
    if (!place.querySelector('.harpoon-lab-place-track')) {
      var track = el('div', 'harpoon-lab-place-track');
      track.appendChild(el('div', 'harpoon-loadbar'));
      place.insertBefore(track, place.firstChild);
    }
  };

  Session.prototype.isFrozenRetrospective = function () {
    return this.getCommitState().status === 'placed';
  };

  Session.prototype.clearCommitSuccessDismiss = function () {
    if (this._commitPlacedFadeTimer != null) {
      global.clearTimeout(this._commitPlacedFadeTimer);
      this._commitPlacedFadeTimer = null;
    }
    if (this._commitPlacedHideTimer != null) {
      global.clearTimeout(this._commitPlacedHideTimer);
      this._commitPlacedHideTimer = null;
    }
  };

  Session.prototype.queueCommitSuccessDismiss = function () {
    var self = this;
    var st = this.getCommitState();
    this.clearCommitSuccessDismiss();
    if (!st || st.status !== 'placed' || st.dismissed) return;
    this._commitPlacedFadeTimer = global.setTimeout(function () {
      self._commitPlacedFadeTimer = null;
      var live = self.getCommitState();
      if (!live || live.status !== 'placed' || live.dismissed) return;
      var banner = self.bodyEl && self.bodyEl.querySelector('.harpoon-lab-auto-commit.is-placed');
      if (banner) banner.classList.add('is-dismissing');
      self._commitPlacedHideTimer = global.setTimeout(function () {
        self._commitPlacedHideTimer = null;
        var cur = self.getCommitState();
        if (!cur || cur.status !== 'placed') return;
        cur.dismissed = true;
        self.render();
      }, 260);
    }, 900);
  };

  Session.prototype.finishCommitSuccess = function () {
    var st = this.getCommitState();
    this.clearCommitSuccessDismiss();
    st.status = 'placed';
    st.phase = null;
    st.detail = '';
    st.dismissed = false;
    this.unbindProbe();
    this.compromise = { level: 'none', reason: '', detail: '' };
    this.render();
    this.queueCommitSuccessDismiss();
  };

  Session.prototype.finishCommitFailure = function (detail, canRetry) {
    var st = this.getCommitState();
    this.clearCommitSuccessDismiss();
    st.status = 'failed';
    st.phase = null;
    st.detail = String(detail || 'The proof did not re-check.');
    st.canRetry = !!canRetry;
    st.dismissed = false;
    this.render();
  };

  Session.prototype.resetCommitForRetry = function () {
    var st = this.getCommitState();
    this.clearCommitSuccessDismiss();
    st.status = 'idle';
    st.phase = null;
    st.detail = '';
    st.usedFullCheck = false;
    st.canRetry = false;
    st.dismissed = false;
    this.render();
  };

  Session.prototype.bindProbe = function () {
    if (probeSessions.indexOf(this) === -1) probeSessions.push(this);
  };

  Session.prototype.unbindProbe = function () {
    var idx = probeSessions.indexOf(this);
    if (idx !== -1) probeSessions.splice(idx, 1);
  };

  Session.prototype.resolveView = function () {
    var api = global.BelJarCurrentEditor;
    var P = global.BelJarPersist;
    if (!api || !P || !this.fileId) return this.view;
    if (P.getActiveFileId && P.getActiveFileId() === this.fileId && typeof api.getView === 'function') {
      var v = api.getView();
      if (v) this.view = v;
    }
    return this.view;
  };

  Session.prototype.captureAnchor = function (view, prep) {
    var ed = E();
    if (!ed || typeof ed.captureHarpoonAnchor !== 'function' || !prep) return;
    var api = global.BelJarCurrentEditor;
    var P = global.BelJarPersist;
    var fileId = this.fileId || (P && P.getActiveFileId ? P.getActiveFileId() : null);
    var declSlice = view && prep.span
      ? view.state.doc.sliceString(prep.span.from, prep.span.to)
      : '';
    this.anchor = ed.captureHarpoonAnchor(prep, {
      fileId: fileId,
      fileText: view ? view.state.doc.toString() : liveFileText(fileId),
      declSlice: declSlice,
      memberFingerprints: api && api.harpoonSuiteFingerprints
        ? api.harpoonSuiteFingerprints(fileId) : {},
    });
  };

  Session.prototype.findLiveHit = function (view, engine) {
    if (!this.anchor) return null;
    var anchor = { declKey: this.anchor.declKey, holeKey: this.anchor.holeKey };
    if (view && engine) {
      var hit = findHoleHit(view, engine, anchor);
      if (hit) return hit;
    }
    var ed = E();
    var fileId = this.fileId || this.anchor.fileId;
    var text = view && this.resolveView() === view
      ? view.state.doc.toString()
      : liveFileText(fileId);
    return findHoleHitInText(text, this.anchor, ed);
  };

  Session.prototype.probeAnchor = function () {
    if (this.isFrozenRetrospective()) return;
    var ed = E();
    if (!ed || typeof ed.assessHarpoonAnchor !== 'function' || !this.anchor || !this.nativeAuto) return;
    var fileId = this.fileId || this.anchor.fileId;
    if (!fileId) return;
    var api = global.BelJarCurrentEditor;
    var P = global.BelJarPersist;
    var active = P && P.getActiveFileId && P.getActiveFileId() === fileId;
    this.resolveView();
    var view = active ? this.view : null;
    var fileText = liveFileText(fileId);
    var eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
    var liveHit = this.findLiveHit(view, eng);
    var memberFp = api && typeof api.harpoonSuiteFingerprints === 'function'
      ? api.harpoonSuiteFingerprints(fileId) : {};
    var next = ed.assessHarpoonAnchor(this.anchor, {
      fileAvailable: fileText != null,
      fileText: fileText,
      fileTextFingerprint: ed.textFingerprint(fileText),
      memberFingerprints: memberFp,
      liveHit: liveHit,
      parseDecl: ed.parseDecl,
    });
    if (next.level === 'warn' && next.reason === 'suite-changed'
        && this.anchor.fileTextFingerprint === ed.textFingerprint(fileText)
        && liveHit) {
      this.anchor.memberFingerprints = memberFp;
      next = { level: 'none', reason: '', detail: '', liveHit: liveHit };
    }
    var prev = this.compromise;
    this.compromise = next;
    if (!prev || prev.level !== next.level || prev.reason !== next.reason) {
      this.updateCompromiseBanner();
      if (this.nativeAuto && this.nativeAuto.phase !== 'searching') this.render();
    } else if (this._compromiseBanner) {
      this.updateCompromiseBanner();
    }
  };

  Session.prototype.stopNativeAuto = function () {
    this.userCancelled = true;
    if (this.nativeAuto && this.nativeAuto.phase === 'searching') {
      this.nativeAuto.searchLabel = 'Stopping…';
      this.updateNativeAutoSearch();
    }
  };

  Session.prototype.restartNativeAuto = function () {
    var self = this;
    if (this.nativeAuto && this.nativeAuto.phase === 'searching') {
      this.userCancelled = true;
      var waitDone = function () {
        if (self.nativeAuto && self.nativeAuto.phase === 'searching') {
          setTimeout(waitDone, 40);
          return;
        }
        self.userCancelled = false;
        self.restartNativeAuto();
      };
      waitDone();
      return;
    }
    this.userCancelled = false;
    var view = this.resolveView();
    var api = global.BelJarCurrentEditor;
    var eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
    if (!view) {
      toast('Open the file to restart the search.', 'error');
      return;
    }
    var hit = this.findLiveHit(view, eng);
    if (!hit) {
      toast('The proof hole is no longer there.', 'error');
      return;
    }
    var prep = prepareForHole(view, hit);
    if (!prep) return;
    this.prep = prep;
    this.declFrom = prep.span.from;
    this.declTo = prep.span.to;
    this.captureAnchor(view, prep);
    this.compromise = { level: 'none', reason: '', detail: '' };
    this.nativeAuto = null;
    this.clearNativeAutoShell();
    this.runNativeAuto();
  };

  Session.prototype.updateCompromiseBanner = function () {
    var banner = this._compromiseBanner;
    if (!banner || !banner.parentNode) return;
    if (this.isFrozenRetrospective()) {
      banner.hidden = true;
      return;
    }
    var na = this.nativeAuto;
    var c = this.compromise || { level: 'none' };
    banner.className = 'harpoon-lab-auto-compromise harpoon-lab-strip harpoon-lab-banner is-' + c.level
      + (na && na.phase === 'searching' ? ' is-searching' : '');
    if (c.level === 'none') {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    var titleEl = banner.querySelector('.harpoon-lab-compromise-title');
    if (titleEl) titleEl.textContent = compromiseBannerTitle(c);
    var subEl = banner.querySelector('.harpoon-lab-compromise-sub');
    if (subEl) subEl.textContent = compromiseBannerSub(c);
    var place = this.bodyEl && this.bodyEl.querySelector('.harpoon-lab-auto-place');
    if (place) {
      var commit = this.getCommitState();
      if (commit.status === 'placed' || commit.status === 'failed') return;
      var blocked = c.level === 'block';
      place.disabled = blocked;
      place.classList.toggle('is-blocked', blocked);
      var sub = place.querySelector('.harpoon-lab-place-sub');
      if (sub && na && na.complete && commit.status !== 'checking') {
        sub.textContent = blocked
          ? 'The hole changed — restart to insert'
          : (c.level === 'warn' ? 'Re-checks before insert' : 'Insert into the file');
      }
    }
  };

  Session.prototype.renderCompromiseBanner = function (parent) {
    if (this.isFrozenRetrospective()) return;
    var self = this;
    var c = this.compromise || { level: 'none' };
    var na = this.nativeAuto;
    var banner = buildBannerShell({
      tag: 'button',
      className: 'harpoon-lab-auto-compromise harpoon-lab-strip harpoon-lab-banner is-' + c.level
        + (na && na.phase === 'searching' ? ' is-searching' : ''),
      tone: c.level === 'block' ? 'error' : 'warn',
      icon: c.level === 'warn' ? '!' : ICON_ALERT,
      badgeClass: 'harpoon-lab-compromise-badge',
      copyClass: 'harpoon-lab-compromise-copy',
      titleClass: 'harpoon-lab-compromise-title',
      subClass: 'harpoon-lab-compromise-sub',
      title: compromiseBannerTitle(c),
      sub: compromiseBannerSub(c),
      onClick: function () { self.restartNativeAuto(); },
    });
    if (c.level === 'none') banner.hidden = true;
    parent.insertBefore(banner, parent.firstChild);
    this._compromiseBanner = banner;
    this.updateCompromiseBanner();
  };

  Session.prototype.normalize = function (raw) {
    var ed = E();
    if (ed && typeof ed.normalizeProofModel === 'function') return ed.normalizeProofModel(raw);
    return raw || { ok: false, subgoals: [] };
  };

  Session.prototype.applyResult = function (raw) {
    var m = this.normalize(raw);
    if (!m.ok) {
      if (m.error && m.error !== 'incomplete') toast('Harpoon: ' + m.error, 'error');
      if (!this.model) this.model = m;
    } else {
      this.model = m;
      if (m.subgoals.length && !this.findSubgoal(this.focusedId)) {
        this.focusedId = m.subgoals[0].id;
      }
    }
    this.render();
    return m;
  };

  Session.prototype.findSubgoal = function (id) {
    if (!this.model || !this.model.subgoals) return null;
    for (var i = 0; i < this.model.subgoals.length; i++) {
      if (this.model.subgoals[i].id === id) return this.model.subgoals[i];
    }
    return null;
  };

  Session.prototype.runTactic = function (tactic) {
    var self = this;
    if (tactic && tactic.kind === 'auto') return this.runNativeAuto();
    return P().tactic(this.focusedId, tactic).then(function (r) { return self.applyResult(r); });
  };

  Session.prototype.upgradeNativeAutoGoal = function (output, prep) {
    var ed = E();
    if (!ed || !output || !prep || !prep.hit || !this.nativeAuto) return;
    var holes = typeof ed.parseHoles === 'function' ? ed.parseHoles(output) : [];
    var line = prep.hit.hole.line;
    var col = prep.hit.hole.col || 1;
    var match = null;
    for (var i = 0; i < holes.length; i++) {
      var h = holes[i];
      if (h.line === line && (h.col || 1) === col && h.goal) { match = h; break; }
    }
    if (!match || !match.goal) return;
    this.nativeAuto.goalType = match.goal;
    this.nativeAuto.goalState = 'live';
    if (this._autoGoalWrap) {
      var goalHost = this._autoGoalWrap.querySelector('.harpoon-hole-goal');
      var ed = typeof global.BelJarEditor !== 'undefined' ? global.BelJarEditor : null;
      if (goalHost && ed && typeof ed.mountHoleGoalTier === 'function') {
        ed.mountHoleGoalTier(goalHost, { surface: 'lab', goalState: 'live', goal: match.goal });
      } else if (goalHost) {
        renderType(goalHost, match.goal);
      }
    }
  };

  Session.prototype.runNativeAuto = function () {
    var ed = E();
    var client = global.BelugaClient;
    var prep = this.prep;
    var self = this;
    if (!ed || !client || !prep || typeof ed.proveProgram !== 'function'
        || typeof ed.theoremUnderProof !== 'function') {
      toast('BelJar auto-solve is unavailable.', 'error');
      return Promise.resolve(false);
    }
    var declText = prep.assembledCode.slice(prep.assembledDeclFrom, prep.assembledDeclTo);
    var thm = ed.theoremUnderProof(declText);
    if (!thm) {
      toast('BelJar auto-solve could not read this theorem.', 'error');
      return Promise.resolve(false);
    }
    var proveCode = prep.proveCode || prep.assembledCode;
    var api = global.BelJarCurrentEditor;
    var eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
    var goalHit = typeof ed.resolveHoleGoalForHit === 'function'
      ? ed.resolveHoleGoalForHit(this.view, eng, prep.hit)
      : { goal: thm.compType && thm.compType.raw ? thm.compType.raw : '', state: 'approximate', loadingLive: true };
    this.userCancelled = false;
    this.captureAnchor(this.view, prep);
    this.bindProbe();
    this.clearNativeAutoShell();
    this.nativeAuto = {
      phase: 'searching',
      steps: [],
      trace: [],
      stuck: null,
      complete: false,
      paused: false,
      goalType: goalHit.goal || (thm.compType && thm.compType.raw ? thm.compType.raw : ''),
      goalState: goalHit.state || 'approximate',
      declName: thm.name || (this.prep && this.prep.name) || '',
      theoremSnapshot: {
        premiseCount: (thm.compType && thm.compType.premises && thm.compType.premises.length) || 0,
        totality: thm.totality || null,
        conclusion: (thm.compType && thm.compType.conclusion) || '',
      },
      searchLabel: 'Checking…',
      // The live "solve reel": candidate moves currently being tried. Each entry is
      // { kind, head, status: 'trying'|'rejected'|'won' }. The reel renderer streams
      // these; on accept, onStep promotes the move into the committed record above.
      reel: [],
      checks: 0,
      startedAt: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    };
    this.render();
    if (!this._goalTierListener) {
      this._goalTierListener = function () {
        if (self.nativeAuto && self.nativeAuto.phase === 'searching') {
          self.refreshNativeAutoGoalDisplay();
        }
      };
      window.addEventListener('beljar:hole-goals-updated', this._goalTierListener);
      window.addEventListener('beljar:development-checked', this._goalTierListener);
    }
    var proverReady = client.beginProverSession ? client.beginProverSession() : Promise.resolve();
    var warm = client.loadProverChecker && proveCode
      ? client.loadProverChecker(proveCode)
      : Promise.resolve();
    return proverReady.then(function () { return warm; }).then(function () {
      if (client.checkResultForProver) {
        return client.checkResultForProver(proveCode).then(function (base) {
          if (base && base.output) self.upgradeNativeAutoGoal(base.output, prep);
        });
      }
    }).then(function () {
      return ed.proveProgram(proveCode, thm, function (code) {
        return client.checkResultForProver
          ? client.checkResultForProver(code)
          : client.checkResult(code);
      }, {
        maxSteps: 120,
        collectTrace: true,
        shouldPause: function () { return !!(self.nativeAuto && self.nativeAuto.paused); },
        shouldCancel: function () { return !!self.userCancelled; },
        onPulse: function (pulse) {
          if (!self.nativeAuto || self.nativeAuto.paused) return;
          var na = self.nativeAuto;
          if (pulse.goal) na.searchGoal = pulse.goal;
          if (pulse.branch !== undefined) na.searchBranch = pulse.branch;
          // Each candidate the search tries is fed onto the CONVEYOR of the current
          // working row (the in-place reel for the active hole). Wave = a batch of
          // candidate terms about to be checked; verdict = one candidate resolving.
          if (pulse.wave && pulse.wave.length) {
            na.searchLabel = 'Trying ' + (pulse.trying || pulse.wave[0].kind) + '…';
            self.feedConveyor(pulse.wave);
          } else if (pulse.verdict) {
            var v = pulse.verdict;
            if (v.verdict === 'accepted') na.searchLabel = 'Found ' + v.kind;
            self.markConveyor(v);
          } else if (pulse.trying) {
            na.searchLabel = 'Trying ' + pulse.trying + '…';
          } else if (pulse.label) {
            na.searchLabel = pulse.label;
          }
          self.syncReelStatus();
        },
        onTraceEntry: function (entry) {
          if (!self.nativeAuto) return;
          if (!self.nativeAuto.trace) self.nativeAuto.trace = [];
          self.nativeAuto.trace.push(entry);
          self.refreshTreeExplorer();
        },
        onStep: function (info) {
          if (!self.nativeAuto) return;
          var na = self.nativeAuto;
          var prevLen = (na.steps || []).length;
          na.steps = info.steps || [];
          na.checks = na.steps.reduce(function (t, s) { return t + (s.checks || 0); }, 0);
          if (!na.paused) {
            na.searchLabel = 'Step ' + na.steps.length
              + (info.last && info.last.move ? (' · ' + info.last.move) : '');
          }
          // A step was accepted: MORPH the current working row IN PLACE into the
          // committed record row, then open a fresh working row for the next hole.
          if (na.steps.length > prevLen) {
            for (var k = prevLen; k < na.steps.length; k += 1) {
              self.settleWorkingRow(na.steps[k], k);
            }
          }
          self.syncReelStatus();
        },
      });
    }).then(function (r) {
      self.probeAnchor();
      var stuck = (r && r.stuck) || null;
      if (stuck && stuck.reason === 'cancelled' && self.userCancelled) {
        stuck = { reason: 'stopped' };
      }
      var priorCommit = self.nativeAuto && self.nativeAuto.commit;
      self.nativeAuto = {
        phase: r && r.complete ? 'solved' : 'stuck',
        steps: (r && r.steps) || [],
        trace: (r && r.trace) || null,
        stuck: stuck,
        complete: !!(r && r.complete),
        code: r && r.code,
        goalType: self.nativeAuto && self.nativeAuto.goalType,
        goalState: (r && r.complete) ? 'live' : (self.nativeAuto && self.nativeAuto.goalState),
        declName: self.nativeAuto && self.nativeAuto.declName,
        theoremSnapshot: self.nativeAuto && self.nativeAuto.theoremSnapshot,
        hadLiveTrail: !!(self.nativeAuto && self.nativeAuto.steps && self.nativeAuto.steps.length),
        commit: priorCommit || defaultCommitState(),
      };
      self.render();
      // Final state (trace + stuck/complete): grow the pop-out tree to it if open.
      self.refreshTreeExplorer();
      return !!(r && r.complete);
    }).catch(function (err) {
      var cancelled = client.isCancelledError && client.isCancelledError(err);
      if (cancelled && self.nativeAuto && self.nativeAuto.paused) return false;
      self.nativeAuto = {
        phase: 'stuck',
        steps: (self.nativeAuto && self.nativeAuto.steps) || [],
        complete: false,
        goalType: self.nativeAuto && self.nativeAuto.goalType,
        goalState: self.nativeAuto && self.nativeAuto.goalState,
        declName: self.nativeAuto && self.nativeAuto.declName,
        stuck: (cancelled && self.userCancelled)
          ? { reason: 'stopped' }
          : (cancelled ? { reason: 'cancelled' } : { reason: err && err.message ? err.message : String(err) }),
      };
      self.render();
      self.refreshTreeExplorer();
      return false;
    }).finally(function () {
      if (self._goalTierListener) {
        window.removeEventListener('beljar:hole-goals-updated', self._goalTierListener);
        window.removeEventListener('beljar:development-checked', self._goalTierListener);
        self._goalTierListener = null;
      }
    });
  };

  // Place the auto-solved body into the file (the deferred commit from Act II).
  Session.prototype.commitNativeAuto = function () {
    var na = this.nativeAuto;
    var st = this.getCommitState();
    if (!na || !na.complete || !na.code || st.status === 'checking' || st.status === 'placed') {
      return Promise.resolve(false);
    }
    var body = solvedBodyOf(na.code, this.prep && this.prep.name);
    if (!body) { toast('BelJar auto-solve lost the solution.', 'error'); return Promise.resolve(false); }
    this.beginCommitUi('verify');
    return this.verifyAndCommit(body, { skipBeginUi: true });
  };

  Session.prototype.undo = function () {
    var self = this;
    return P().undo().then(function (r) { return self.applyResult(r); });
  };

  Session.prototype.redo = function () {
    var self = this;
    return P().redo().then(function (r) { return self.applyResult(r); });
  };

  Session.prototype.commit = function () {
    var self = this;
    var st = this.getCommitState();
    if (st.status === 'checking' || st.status === 'placed') return Promise.resolve(false);
    this.beginCommitUi('translate');
    return P().translate().then(function (tr) {
      if (!tr || !tr.ok) {
        self.finishCommitFailure(tr && tr.error === 'incomplete'
          ? 'The proof still has open subgoals.'
          : 'Could not translate the proof.', true);
        return false;
      }
      self.getCommitState().phase = 'verify';
      self.updateCommitPlace();
      return self.verifyAndCommit(tr.source, { skipBeginUi: true });
    }).catch(function (err) {
      self.finishCommitFailure(err && err.message ? err.message : 'Translate failed.', true);
      return false;
    });
  };

  function defaultCommitState() {
    return { status: 'idle', phase: null, detail: '', usedFullCheck: false, canRetry: false, dismissed: false };
  }

  function firstCheckerErrorLine(output) {
    var s = String(output || '');
    var m = /File[^\n]*line\s+\d+[^\n]*:\s*([^\n]+)/i.exec(s);
    if (m) return m[1].trim();
    var lines = s.split('\n');
    for (var i = 0; i < lines.length; i += 1) {
      var t = lines[i].trim();
      if (t && /error/i.test(t)) return t;
    }
    for (var j = 0; j < lines.length; j += 1) {
      var u = lines[j].trim();
      if (u) return u.length > 120 ? u.slice(0, 117) + '…' : u;
    }
    return 'The proof did not re-check.';
  }

  function compromiseBannerTitle(c) {
    if (c && c.level === 'warn') return 'Restart proof';
    if (c && c.detail) return c.detail;
    if (c && c.level === 'block') return 'This hole changed — the result can\u2019t be inserted safely.';
    return 'A related file in this development changed.';
  }

  function compromiseBannerSub(c) {
    if (c && c.level === 'warn') return 'Code related to this goal has changed';
    return 'Restart from the current file state';
  }

  function stageNode(node, index) {
    if (!node || !node.style || index == null) return node;
    node.classList.add('harpoon-lab-stage');
    node.style.setProperty('--stage-index', String(index));
    return node;
  }

  function buildBannerShell(opts) {
    opts = opts || {};
    var tag = opts.tag || 'div';
    var className = opts.className || '';
    if (opts.tone) className += ' tone-' + opts.tone;
    var root = el(tag, className);
    if (tag === 'button') root.type = 'button';
    if (opts.disabled) root.disabled = true;
    var badge = el('span', 'harpoon-lab-banner-badge' + (opts.badgeClass ? ' ' + opts.badgeClass : ''));
    if (opts.icon) badge.innerHTML = opts.icon;
    root.appendChild(badge);
    var copy = el('span', 'harpoon-lab-banner-copy' + (opts.copyClass ? ' ' + opts.copyClass : ''));
    if (opts.title != null) {
      copy.appendChild(el('span', 'harpoon-lab-banner-title' + (opts.titleClass ? ' ' + opts.titleClass : ''), opts.title));
    }
    if (opts.sub) {
      copy.appendChild(el('span', 'harpoon-lab-banner-sub' + (opts.subClass ? ' ' + opts.subClass : ''), opts.sub));
    }
    root.appendChild(copy);
    if (typeof opts.onClick === 'function') {
      root.addEventListener('click', function (e) {
        e.preventDefault();
        if (root.disabled || root.classList.contains('is-committing')) return;
        opts.onClick();
      });
    }
    return root;
  }

  function buildPlaceStrip(self, opts) {
    opts = opts || {};
    var blocked = !!opts.blocked;
    var warned = !!opts.warned;
    var title = opts.title || 'Place the proof';
    var sub = opts.sub || (blocked
      ? 'The hole changed — restart to insert'
      : (warned ? 'Re-checks before insert' : 'Insert into the file'));
    var extraCls = opts.extraCls || '';
    return buildBannerShell({
      tag: 'button',
      className: 'harpoon-lab-place harpoon-lab-strip harpoon-lab-banner'
        + extraCls + (warned && !blocked ? ' is-warned' : '') + (blocked ? ' is-blocked' : ''),
      disabled: blocked,
      tone: blocked ? 'error' : 'action',
      icon: ICON_ARROW_RIGHT,
      badgeClass: 'harpoon-lab-place-arrow',
      copyClass: 'harpoon-lab-place-copy',
      titleClass: 'harpoon-lab-place-title beljar-tip-shimmer-target',
      subClass: 'harpoon-lab-place-sub',
      title: title,
      sub: sub,
      onClick: opts.onClick,
    });
  }

  function renderCommitOutcome(parent, commit, declName, onRetry) {
    if (!commit || commit.status === 'idle' || commit.status === 'checking') return null;
    var placed = commit.status === 'placed';
    if (placed && commit.dismissed) return null;
    var banner = buildBannerShell({
      className: 'harpoon-lab-auto-commit harpoon-lab-strip harpoon-lab-banner is-' + (placed ? 'placed' : 'fail'),
      tone: placed ? 'success' : 'error',
      icon: placed ? ICON_CHECK : ICON_ALERT,
      badgeClass: 'harpoon-lab-commit-badge',
      titleClass: 'harpoon-lab-commit-text',
      subClass: 'harpoon-lab-commit-sub',
      title: placed ? 'Placed in file' : 'Could not place',
      sub: placed ? (declName || '') : (commit.detail || 'The proof did not re-check.'),
    });
    if (!placed && typeof onRetry === 'function') {
      var actions = el('div', 'harpoon-lab-commit-actions');
      var retryBtn = el('button', 'harpoon-lab-commit-retry');
      retryBtn.type = 'button';
      retryBtn.textContent = 'Try again';
      retryBtn.addEventListener('click', function (e) {
        e.preventDefault();
        onRetry();
      });
      actions.appendChild(retryBtn);
      banner.appendChild(actions);
    }
    parent.appendChild(banner);
    return banner;
  }

  function totalityPrefixFromDecl(declText) {
    var m = /=\s*(\/\s*total[^/]*\/\s*)/.exec(String(declText || ''));
    return m ? m[1].trim() : '';
  }

  Session.prototype.pendingCommitAfterNav = function (source) {
    var self = this;
    var fileId = this.fileId || (this.anchor && this.anchor.fileId);
    var hit = this.compromise && this.compromise.liveHit;
    if (!fileId || !hit) {
      toast('Open the file to place the proof.', 'error');
      return Promise.resolve(false);
    }
    this.pendingCommitSource = source;
    global.dispatchEvent(new CustomEvent('beljar:open-file-at', {
      detail: {
        fileId: fileId,
        from: hit.from,
        to: hit.to,
        line: hit.hole && hit.hole.line,
        col: hit.hole && hit.hole.col,
      },
    }));
    var onActive = function () {
      global.removeEventListener('beljar:active-editor-view', onActive);
      if (!self.pendingCommitSource) return;
      var src = self.pendingCommitSource;
      self.pendingCommitSource = null;
      self.verifyAndCommit(src);
    };
    global.addEventListener('beljar:active-editor-view', onActive);
    return Promise.resolve(false);
  };

  Session.prototype.verifyAndCommit = function (source, opts) {
    opts = opts || {};
    var ed = E();
    var self = this;
    var client = global.BelugaClient;
    var P = global.BelJarPersist;
    if (!ed) return Promise.resolve(false);
    if (!opts.skipBeginUi) this.beginCommitUi('verify');

    this.probeAnchor();
    if (this.compromise && this.compromise.level === 'block') {
      this.finishCommitFailure(this.compromise.detail || 'The hole changed — restart to continue.', false);
      return Promise.resolve(false);
    }

    var fileId = this.fileId || (this.anchor && this.anchor.fileId);
    if (P && fileId && P.getActiveFileId && P.getActiveFileId() !== fileId) {
      return this.pendingCommitAfterNav(source);
    }

    var view = this.resolveView();
    if (!view) {
      this.finishCommitFailure('Open the file to place the proof.', false);
      return Promise.resolve(false);
    }

    var api = global.BelJarCurrentEditor;
    var eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
    var hit = this.findLiveHit(view, eng);
    if (!hit) {
      this.finishCommitFailure('The proof hole is no longer there.', false);
      return Promise.resolve(false);
    }

    var prep = prepareForHole(view, hit);
    if (!prep) return Promise.resolve(false);
    this.prep = prep;
    this.declFrom = prep.span.from;
    this.declTo = prep.span.to;

    var range = ed.declRangeWithSemicolon
      ? ed.declRangeWithSemicolon(view.state.doc, prep.span.from, prep.span.to)
      : { from: prep.span.from, to: prep.span.to };
    var declFrom = range.from;
    var declTo = range.to;
    var docText = view.state.doc.toString();
    var declSlice = view.state.doc.sliceString(declFrom, declTo);
    var decl = ed.parseDecl(declSlice);
    if (!decl) {
      this.finishCommitFailure('Lost the declaration to commit into.', false);
      return Promise.resolve(false);
    }
    var body = String(source).replace(/;\s*$/, '').trimEnd();
    var tot = totalityPrefixFromDecl(declSlice);
    if (tot && !/\/\s*total\b/.test(body)) body = tot + '\n' + body;
    var newDecl = 'rec ' + decl.name + ' : ' + decl.type + ' =\n' + body + '\n;';

    var codes = ed.buildCommitCheckCodes
      ? ed.buildCommitCheckCodes(prep.assembledCode, prep, newDecl)
      : {
        patched: prep.assembledCode != null
          ? prep.assembledCode.slice(0, prep.assembledDeclFrom) + newDecl + prep.assembledCode.slice(prep.assembledDeclTo)
          : docText.slice(0, declFrom) + newDecl + docText.slice(declTo),
        orchestration: prep.assembledCode != null
          ? prep.assembledCode.slice(0, prep.assembledDeclFrom) + newDecl + prep.assembledCode.slice(prep.assembledDeclTo)
          : docText.slice(0, declFrom) + newDecl + docText.slice(declTo),
      };
    var needsFull = ed.needsFullCommitCheck
      ? ed.needsFullCommitCheck({ compromise: self.compromise, docText: docText, declName: decl.name })
      : true;

    function endProver() {
      if (client && client.endProverSession) client.endProverSession();
    }

    function runTieredCheck() {
      var chain = client && client.beginProverSession
        ? client.beginProverSession()
        : Promise.resolve();
      return chain.then(function () {
        if (client.loadProverChecker && codes.orchestration) {
          return client.loadProverChecker(codes.orchestration);
        }
      }).then(function () {
        if (client.checkResultForProver) {
          return client.checkResultForProver(codes.orchestration);
        }
        return client.checkResult(codes.orchestration);
      }).then(function (res) {
        if (!res || !res.ok) {
          return { ok: false, output: res && res.output, stage: 'orchestration' };
        }
        if (!needsFull) return { ok: true };
        self.getCommitState().usedFullCheck = true;
        self.updateCommitPlace();
        return client.checkResult(codes.patched).then(function (fullRes) {
          return {
            ok: !!(fullRes && fullRes.ok),
            output: fullRes && fullRes.output,
            stage: 'full',
          };
        });
      });
    }

    if (!client || (typeof client.checkResult !== 'function' && typeof client.checkResultForProver !== 'function')) {
      ed.commitProof(view, declFrom, declTo, source);
      self.finishCommitSuccess();
      return Promise.resolve(true);
    }

    return runTieredCheck().then(function (result) {
      endProver();
      if (result && result.ok) {
        ed.commitProof(view, declFrom, declTo, source);
        self.finishCommitSuccess();
        return true;
      }
      self.finishCommitFailure(firstCheckerErrorLine(result && result.output), true);
      return false;
    }).catch(function (err) {
      endProver();
      if (client.isCancelledError && client.isCancelledError(err)) {
        self.resetCommitForRetry();
        return false;
      }
      self.finishCommitFailure(err && err.message ? err.message : 'Checker error.', true);
      return false;
    });
  };

  Session.prototype.disposeSession = function () {
    this.clearCommitSuccessDismiss();
    this.unbindProbe();
    if (this.stopReelClock) this.stopReelClock();
    this.pendingCommitSource = null;
    var client = global.BelugaClient;
    if (client && client.endProverSession) client.endProverSession();
    if (this._treeWin && this._treeWin.close) this._treeWin.close();
    this._treeWin = null;
    this._treeRedraw = null;
    if (this.win && this.win.close) this.win.close();
    this.win = null;
    var proof = P();
    if (proof && proof.dispose) proof.dispose();
    if (this.host && this.host.kind === 'panel' && typeof this.host.onDone === 'function') {
      this.host.onDone();
    }
  };

  Session.prototype.close = function () {
    this.disposeSession();
  };

  Session.prototype.renderBar = function (m) {
    var self = this;
    var body = this.bodyEl;
    if (!body) return;

    var open = (m.subgoals && m.subgoals.length) || 0;
    var bar = el('div', 'harpoon-lab-bar');

    // Progress: the proof's live state. The dot carries it (green = proven), with
    // the open-goal count as the label. Tooltip lives on the dot.
    var status = el('div', 'harpoon-lab-status');
    var dot = el('span', 'harpoon-lab-status-dot' + (m.complete ? ' is-done' : ''));
    dot.setAttribute('data-tooltip', m.complete ? 'Proven' : 'Unproven');
    dot.setAttribute('aria-label', m.complete ? 'Proven' : 'Unproven');
    if (global.Tooltips && global.Tooltips.bind) global.Tooltips.bind(dot);
    status.appendChild(dot);
    var label = el('span', 'harpoon-lab-status-text');
    if (m.complete) {
      label.textContent = 'Proven';
    } else if (open === 1) {
      label.textContent = '1 goal';
    } else {
      label.textContent = open + ' goals';
    }
    status.appendChild(label);
    bar.appendChild(status);

    var actions = el('div', 'harpoon-lab-bar-actions');
    actions.appendChild(iconBtn('icon-btn', ICON_UNDO, 'Undo', 'Undo', function () { self.undo(); }));
    actions.appendChild(iconBtn('icon-btn', ICON_REDO, 'Redo', 'Redo', function () { self.redo(); }));
    bar.appendChild(actions);
    body.insertBefore(bar, body.firstChild);
  };

  Session.prototype.renderCtx = function (parent, label, binders) {
    if (!binders || !binders.length) return;
    var sec = el('div', 'harpoon-lab-ctx');
    sec.appendChild(el('span', 'harpoon-lab-ctx-label', label));
    var rows = el('div', 'harpoon-lab-binders');
    binders.forEach(function (b) {
      var row = el('div', 'harpoon-lab-binder');
      row.appendChild(el('span', 'harpoon-lab-binder-name', b.name));
      row.appendChild(el('span', 'harpoon-lab-binder-sep', ':'));
      var t = el('span', 'harpoon-lab-binder-type');
      renderType(t, b.type);
      row.appendChild(t);
      rows.appendChild(row);
    });
    sec.appendChild(rows);
    parent.appendChild(sec);
  };

  // The tactic action bar. The first applicable tactic reads as the suggested
  // next move (accented); the rest are quiet secondary actions. Split/solve carry
  // the variable they act on so the move is self-describing.
  Session.prototype.renderTactics = function (parent, sg) {
    var self = this;
    var ed = E();
    var applicable = (ed && ed.applicableTactics) ? ed.applicableTactics : null;
    var tac = applicable ? applicable(sg) : { intros: true, split: [], solve: [], auto: true };

    var moves = [];
    if (tac.intros) moves.push({ label: 'intros', tip: 'Introduce binders', t: { kind: 'intros' } });
    (tac.split || []).forEach(function (v) {
      // v is { name, where } — `where` ('meta'|'comp') tells the shim which
      // context to elaborate the scrutinee from (cD vs cG).
      var name = (v && v.name != null) ? v.name : v;
      var where = (v && v.where) ? v.where : 'meta';
      moves.push({ label: 'split', arg: name, tip: 'Case-split on ' + name,
        t: { kind: 'split', var: name, where: where } });
    });
    (tac.solve || []).forEach(function (v) {
      var name = (v && v.name != null) ? v.name : v;
      moves.push({ label: 'solve', arg: name, tip: 'Solve with ' + name,
        t: { kind: 'solve', var: name } });
    });
    if (!moves.length && !tac.auto) return;

    // Auto-solve is the headline move — a full-width accented action that leads the
    // bar, reading "Auto-solve" with a spark glyph. The step tactics sit beneath it
    // as the manual escape hatch (the first is the suggested next move).
    var wrap = el('div', 'harpoon-lab-moves');
    if (tac.auto) {
      var autoBtn = el('button', 'harpoon-lab-auto-btn');
      autoBtn.type = 'button';
      var spark = el('span', 'harpoon-lab-auto-btn-glyph');
      spark.innerHTML = ICON_SPARK;
      autoBtn.appendChild(spark);
      autoBtn.appendChild(el('span', 'harpoon-lab-auto-btn-label', 'Auto-solve'));
      autoBtn.setAttribute('data-tooltip', 'Let BelJar search for the whole proof');
      if (global.Tooltips && global.Tooltips.bind) global.Tooltips.bind(autoBtn);
      autoBtn.addEventListener('click', function (e) { e.preventDefault(); self.runTactic({ kind: 'auto' }); });
      wrap.appendChild(autoBtn);
    }

    if (moves.length) {
      var row = el('div', 'harpoon-lab-tacs');
      moves.forEach(function (mv, i) {
        var primary = i === 0;
        var b = el('button', 'harpoon-lab-tac' + (primary ? ' is-primary' : ''));
        b.type = 'button';
        b.appendChild(el('span', 'harpoon-lab-tac-verb', mv.label));
        if (mv.arg) b.appendChild(el('span', 'harpoon-lab-tac-arg', mv.arg));
        if (mv.tip) {
          b.setAttribute('data-tooltip', mv.tip);
          if (global.Tooltips && global.Tooltips.bind) global.Tooltips.bind(b);
        }
        b.addEventListener('click', function (e) {
          e.preventDefault();
          self.runTactic(mv.t);
        });
        row.appendChild(b);
      });
      wrap.appendChild(row);
    }
    parent.appendChild(wrap);
  };

  Session.prototype.renderGoalCard = function (sg, idx, total) {
    var card = el('article', 'harpoon-lab-goal-card');

    // Hero: the goal type the user must inhabit. Labelled, set large, given room.
    var goalWrap = el('div', 'harpoon-lab-goal harpoon-lab-strip tone-goal');
    var glabel = el('div', 'harpoon-lab-goal-label');
    glabel.appendChild(el('span', 'harpoon-lab-goal-label-text harpoon-lab-section-label is-goal', 'Goal'));
    if (total > 1) {
      glabel.appendChild(el('span', 'harpoon-lab-goal-idx', (idx + 1) + ' / ' + total));
    }
    goalWrap.appendChild(glabel);
    var goal = el('div', 'harpoon-hole-goal harpoon-lab-goal-type');
    renderType(goal, sg.goal);
    goalWrap.appendChild(goal);
    card.appendChild(goalWrap);

    // Supporting context — the assumptions in scope, recessive beneath the goal.
    var hasCtx = (sg.meta && sg.meta.length) || (sg.ctx && sg.ctx.length);
    if (hasCtx) {
      var ctxWrap = el('div', 'harpoon-lab-context');
      this.renderCtx(ctxWrap, 'meta', sg.meta);
      this.renderCtx(ctxWrap, 'ctx', sg.ctx);
      card.appendChild(ctxWrap);
    }

    this.renderTactics(card, sg);
    return card;
  };

  // Brief lead line for a committed move — structured detail lives in the facet row.
  var MOVE_GLOSS = {
    intro: "opened the goal's binders",
    split: 'case on the scrutinee',
    recurse: 'induction hypothesis',
    invert: 'inverted a hypothesis',
    fill: 'closed the goal',
    lemma: 'applied a lemma',
    synth: 'synthesized the goal',
    impossible: 'refuted a hypothesis',
  };
  function goalHeadFromGoal(goal) {
    if (!goal) return null;
    var g = String(goal).trim();
    if ((g[0] === '[' && g[g.length - 1] === ']') || (g[0] === '(' && g[g.length - 1] === ')')) {
      g = g.slice(1, -1).trim();
    }
    var m = g.match(/(?:\|-|⊢|\|)\s*([\s\S]*)$/);
    var concl = (m ? m[1] : g).trim();
    var head = concl.split(/\s+/)[0];
    return head || null;
  }

  function introducedFromText(text) {
    var names = [];
    var re = /\b(?:fn|mlam)\s+([A-Za-z_][A-Za-z0-9_']*)/g;
    var m;
    while ((m = re.exec(String(text || '')))) names.push(m[1]);
    return names;
  }

  // Mirror stepLead in the bridge — list UI must not show stale rationale strings.
  function deriveMoveLead(step) {
    if (!step) return '';
    var meta = step.meta || {};
    var move = step.move;
    var goalHead = meta.goalHead || goalHeadFromGoal(step.goal) || 'the goal';
    switch (move) {
      case 'synth': {
        var links = (meta.chain || []).filter(function (c) { return c !== 'impossible'; });
        var n = links.length || (meta.chain || []).length;
        if (!n) return '';
        return meta.refutation
          ? 'refutation closing ' + goalHead
          : n + '-step chain closing ' + goalHead;
      }
      case 'split':
        return 'case on ' + (meta.scrutinee || 'the scrutinee');
      case 'recurse':
        return 'induction hypothesis';
      case 'invert':
        return 'inverted ' + ((meta.uses && meta.uses[0]) || 'a hypothesis');
      case 'lemma':
        return 'applied ' + (meta.callee || 'lemma');
      case 'impossible':
        return 'refuted ' + (meta.refuted || 'the hypothesis');
      case 'fill':
        return 'closed ' + goalHead;
      case 'intro':
        return "opened the goal's binders";
      default:
        return '';
    }
  }

  function moveLead(s) {
    if (s && s.lead) return s.lead;
    var ed = global.BelJarEditor;
    if (ed && typeof ed.stepLead === 'function' && s && s.meta) {
      var fromEd = ed.stepLead({ kind: s.move }, s.meta, { goal: s.goal });
      if (fromEd) return fromEd;
    }
    var derived = deriveMoveLead(s);
    if (derived) return derived;
    return (s && MOVE_GLOSS[s.move]) || 'made a move';
  }

  function facetChip(text, extraClass) {
    var chip = el('span', 'hpt-move-facet-chip' + (extraClass ? ' ' + extraClass : ''));
    var code = el('code', 'hpt-move-facet-code');
    code.textContent = text;
    chip.appendChild(code);
    return chip;
  }

  // Structured inline detail for a move — complements the lead, never duplicates it.
  function renderMoveFacet(step, variant) {
    var meta = step.meta || {};
    var move = step.move;
    if (move === 'synth') {
      return renderSynthChain(meta, variant === 'detail' ? 'full' : 'inline');
    }
    var wrap = el('div', 'hpt-move-facet'
      + (variant === 'inline' ? ' is-inline' : '')
      + (move ? ' is-move-' + move : ''));
    var has = false;
    if (move === 'intro') {
      var introNames = (meta.introduced && meta.introduced.length)
        ? meta.introduced : introducedFromText(step.text);
      introNames.forEach(function (n) {
        wrap.appendChild(facetChip(n));
        has = true;
      });
    } else if (move === 'split') {
      if (meta.arms) {
        wrap.appendChild(facetChip(meta.arms + ' arm' + (meta.arms === 1 ? '' : 's')));
        has = true;
      }
      if (meta.annotated) {
        wrap.appendChild(facetChip('typed', 'is-muted'));
        has = true;
      }
    } else if (move === 'fill') {
      var filler = meta.filler
        || (step.text && String(step.text).split('\n')[0].replace(/\s+/g, ' ').trim());
      if (filler) {
        wrap.appendChild(facetChip(filler));
        has = true;
      }
    } else if (move === 'recurse' || move === 'lemma') {
      (meta.uses || []).forEach(function (u) {
        wrap.appendChild(facetChip(u));
        has = true;
      });
      (meta.binds || []).forEach(function (b) {
        wrap.appendChild(facetChip(b, 'is-binds'));
        has = true;
      });
    } else if (move === 'invert') {
      if (meta.uses && meta.uses[0]) {
        var arrow = el('span', 'hpt-move-facet-arrow');
        arrow.textContent = meta.uses[0] + ' → ' + ((meta.binds || []).join(', ') || '…');
        wrap.appendChild(arrow);
        has = true;
      }
    } else if (move === 'impossible' && meta.refuted) {
      wrap.appendChild(facetChip(meta.refuted));
      has = true;
    }
    return has ? wrap : null;
  }

  function appendMoveFacet(host, step) {
    var facet = renderMoveFacet(step, 'inline');
    if (facet) host.appendChild(facet);
  }

  function autoVerdictTitle(na) {
    if (na.complete) {
      var n = (na.steps || []).length;
      return 'Proven in ' + n + (n === 1 ? ' step' : ' steps');
    }
    return 'Search stopped';
  }

  function autoSubtext(na) {
    if (na.complete) return '';
    if (na.stuck && na.stuck.reason === 'stopped') return 'Stopped';
    if (na.stuck && na.stuck.reason === 'cancelled') return 'Cancelled';
    if (na.stuck && na.stuck.reason === 'file-errors') return 'The file has errors';
    if (na.stuck && na.stuck.goal) return 'No tactic for this goal';
    if (na.stuck && na.stuck.reason === 'step-bound') return 'Step limit reached';
    return 'No tactic available';
  }

  function nativeAutoSearchLabel(na) {
    if (na.paused) return 'Paused';
    if (na.searchLabel) return na.searchLabel;
    if (na.steps && na.steps.length) return 'Step ' + na.steps.length;
    return 'Searching…';
  }

  function appendAutoStepRow(trail, s, i) {
    var item = el('li', 'harpoon-lab-auto-step');
    item.style.setProperty('--i', String(i));
    item.appendChild(el('span', 'harpoon-lab-auto-node'));
    var body = el('div', 'harpoon-lab-auto-step-body');
    var rowCopy = el('div', 'harpoon-lab-auto-step-copy');
    var verb = el('span', 'harpoon-lab-auto-move move-' + (s.move || 'move'));
    verb.textContent = s.move || 'move';
    rowCopy.appendChild(verb);
    rowCopy.appendChild(el('span', 'harpoon-lab-auto-why', moveLead(s)));
    body.appendChild(rowCopy);
    appendMoveFacet(body, s);
    item.appendChild(body);
    bindStepGoalTip(verb, s.goal);
    trail.appendChild(item);
    return item;
  }

  // The live-record stat line ("N checks · Xs") — tooltip on the searching label/spinner.
  function reelStatText(na) {
    var checks = na && na.checks ? na.checks : 0;
    var secs = 0;
    if (na && na.startedAt != null) {
      var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      secs = Math.max(0, (now - na.startedAt) / 1000);
    }
    var t = secs < 10 ? secs.toFixed(1) : Math.round(secs);
    return checks + (checks === 1 ? ' check · ' : ' checks · ') + t + 's';
  }

  function syncReelStatTips(session, na) {
    if (!na) return;
    var tip = reelStatText(na);
    var targets = [session._autoSearchText, session._autoSearchSpinner];
    for (var i = 0; i < targets.length; i++) {
      var node = targets[i];
      if (!node) continue;
      if (node.getAttribute('data-tooltip') === tip) continue;
      if (global.Tooltips && global.Tooltips.set) {
        global.Tooltips.set(node, tip, { ariaLabel: false });
      } else if (tip) {
        node.setAttribute('data-tooltip', tip);
      }
    }
  }

  var REEL_TICK_MS = 320;
  var REEL_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  var REEL_CLICK_EASE = 'cubic-bezier(0.34, 1.22, 0.64, 1)';
  var REEL_OUT_MS = 150;
  var COMMIT_IN_MS = 280;

  function buildStepCopy(step) {
    var rowCopy = el('div', 'harpoon-lab-auto-step-copy');
    var verb = el('span', 'harpoon-lab-auto-move move-' + (step.move || 'move'));
    verb.textContent = step.move || 'move';
    rowCopy.appendChild(verb);
    rowCopy.appendChild(el('span', 'harpoon-lab-auto-why', moveLead(step)));
    return rowCopy;
  }

  function installCommittedRow(row, step, animate) {
    row.classList.remove('is-working', 'is-committing', 'is-selected', 'is-settling', 'is-fresh');

    var conveyor = row.querySelector('.harpoon-conveyor');
    if (conveyor) conveyor.parentNode.removeChild(conveyor);

    var spine = row.querySelector('.harpoon-lab-auto-node');
    if (spine) spine.classList.remove('is-live');
    else row.insertBefore(el('span', 'harpoon-lab-auto-node'), row.firstChild);

    var priorBody = row.querySelector('.harpoon-lab-auto-step-body');
    if (priorBody) priorBody.parentNode.removeChild(priorBody);
    var priorCopy = row.querySelector(':scope > .harpoon-lab-auto-step-copy');
    if (priorCopy) priorCopy.parentNode.removeChild(priorCopy);
    var priorFacet = row.querySelector(':scope > .hpt-move-facet, :scope > .hpt-chain');
    if (priorFacet) priorFacet.parentNode.removeChild(priorFacet);

    var body = el('div', 'harpoon-lab-auto-step-body');
    var copy = buildStepCopy(step);
    if (animate) copy.classList.add('is-reveal');
    body.appendChild(copy);
    appendMoveFacet(body, step);
    row.appendChild(body);
    bindStepGoalTip(copy.querySelector('.harpoon-lab-auto-move'), step.goal);
  }

  function reelMotionOk() {
    return !(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function reelClearMotion(el) {
    if (!el) return;
    el.style.transition = '';
    el.style.transform = '';
  }

  // FLIP tick: new chip spawns fully off the right edge; the trail shifts left at
  // the same rate so the belt reads as one physical unit.
  function reelAnimateTick(conveyor, newChip, existingEls, oldRects) {
    if (!reelMotionOk() || !newChip) return;
    var dur = REEL_TICK_MS;
    var conveyorRect = conveyor.getBoundingClientRect();
    var chipRect = newChip.getBoundingClientRect();
    var spawnX = conveyorRect.right - chipRect.left + 8;
    newChip.style.transform = 'translateX(' + spawnX + 'px)';

    var i, el, neu, dx;
    for (i = 0; i < existingEls.length; i += 1) {
      el = existingEls[i];
      if (el.classList.contains('is-rejected')) continue;
      neu = el.getBoundingClientRect();
      dx = oldRects[i].left - neu.left;
      if (Math.abs(dx) > 0.5) {
        el.style.transition = 'none';
        el.style.transform = 'translateX(' + dx + 'px)';
      }
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var trailTrans = 'transform ' + dur + 'ms ' + REEL_EASE;
        for (i = 0; i < existingEls.length; i += 1) {
          el = existingEls[i];
          if (el.classList.contains('is-rejected')) continue;
          el.style.transition = trailTrans;
          el.style.transform = '';
        }
        newChip.style.transition = 'transform ' + dur + 'ms ' + REEL_CLICK_EASE;
        newChip.style.transform = '';
        var finished = false;
        function done() {
          if (finished) return;
          finished = true;
          for (i = 0; i < existingEls.length; i += 1) {
            if (!existingEls[i].classList.contains('is-rejected')) reelClearMotion(existingEls[i]);
          }
          reelClearMotion(newChip);
          newChip.classList.add('is-landing');
          newChip.addEventListener('animationend', function () {
            newChip.classList.remove('is-landing');
          }, { once: true });
        }
        newChip.addEventListener('transitionend', function (e) {
          if (e.propertyName === 'transform') done();
        });
        setTimeout(done, dur + 48);
      });
    });
  }

  function makeBranchGroup(branch, i) {
    var group = el('li', 'harpoon-lab-auto-branch');
    if (i != null) group.style.setProperty('--i', String(i));
    var caseRow = el('div', 'harpoon-lab-auto-case');
    caseRow.appendChild(el('span', 'harpoon-lab-auto-case-node'));
    var head = el('div', 'harpoon-lab-auto-branch-head');
    head.appendChild(el('span', 'harpoon-lab-auto-branch-label', 'case'));
    var pat = el('code', 'harpoon-lab-auto-branch-pat');
    pat.textContent = branch;
    head.appendChild(pat);
    caseRow.appendChild(head);
    group.appendChild(caseRow);
    var host = el('ol', 'harpoon-lab-auto-branch-steps');
    group.appendChild(host);
    return { group: group, host: host };
  }

  // Incremental, branch-aware append into the committed record. Mirrors
  // appendAutoTree's grouping (steps under their case-branch pattern) but appends
  // ONE step at a time so the live record never rebuilds. The record element
  // carries its running branch state on `_lastBranch` / `_branchHost`.
  function appendCommittedStepRow(record, s, i) {
    var b = s.branch || null;
    var host = record._branchHost || record;
    if (b !== record._lastBranch) {
      record._lastBranch = b;
      if (b) {
        var made = makeBranchGroup(b, i);
        record.appendChild(made.group);
        host = made.host;
        record._branchHost = host;
      } else {
        host = record;
        record._branchHost = null;
      }
    }
    return appendAutoStepRow(host, s, i);
  }

  // The PROOF TREE trail: steps grouped under the case-branch pattern each was
  // taken in (top-level moves stay flat). A branchy proof reads as its case
  // analysis, not as a wall of moves.
  function appendAutoTree(trail, steps) {
    var lastBranch = null;
    var host = trail;
    steps.forEach(function (s, i) {
      var b = s.branch || null;
      if (b !== lastBranch) {
        lastBranch = b;
        if (b) {
          var made = makeBranchGroup(b, i);
          trail.appendChild(made.group);
          host = made.host;
        } else {
          host = trail;
        }
      }
      appendAutoStepRow(host, s, i);
    });
  }

  Session.prototype.refreshNativeAutoGoalDisplay = function () {
    var na = this.nativeAuto;
    if (!na || !na.goalType || !this._autoGoalWrap) return;
    if (na.phase === 'solved' || na.complete) return;
    var hero = resolveNativeAutoGoalDisplay(this, na);
    na.goalType = hero.goalType;
    na.goalState = hero.goalState;
    var goalHost = this._autoGoalWrap.querySelector('.harpoon-hole-goal');
    var ed = E();
    if (goalHost && ed && typeof ed.mountHoleGoalTier === 'function') {
      ed.mountHoleGoalTier(goalHost, {
        surface: 'lab',
        goalState: hero.goalState,
        goal: hero.goalType,
      });
    }
  };

  Session.prototype.clearNativeAutoShell = function () {
    if (this.stopReelClock) this.stopReelClock();
    if (this._settleTimer) { clearTimeout(this._settleTimer); this._settleTimer = null; }
    if (this._settleFlush) { this._settleFlush = null; }
    this._autoSearchBox = null;
    this._autoSearchText = null;
    this._autoTrail = null;
    this._autoLiveTree = null;
    this._autoLiveCount = 0;
    this._autoPauseBtn = null;
    this._autoGoalWrap = null;
    this._compromiseBanner = null;
    // Live reel handles
    this._reelRecord = null;      // the committed-steps record (append-only)
    this._reelRecordCount = 0;    // how many steps are already in the record
    this._autoSearchSpinner = null;
    this._workingRow = null;      // the live in-place conveyor row (current hole)
    this._workingStrip = null;    // the conveyor strip inside the working row
    this._workingChips = null;    // [{ kind, head, status, el }] on the conveyor
    this._settleTimer = null;
    this._settleFlush = null;
  };

  Session.prototype.syncAutoPauseBtn = function () {
    var na = this.nativeAuto;
    var btn = this._autoPauseBtn;
    if (!na || !btn) return;
    var paused = !!na.paused;
    if (btn._belPauseState !== paused) {
      btn._belPauseState = paused;
      btn.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
      btn.setAttribute('aria-label', paused ? 'Resume search' : 'Pause search');
      if (global.Tooltips && global.Tooltips.set) {
        global.Tooltips.set(btn, paused ? 'Resume' : 'Pause');
      }
    }
    if (this._autoSearchBox) {
      this._autoSearchBox.classList.toggle('is-paused', paused);
    }
  };

  // During search: keep the committed record append-only; the live conveyor is
  // driven event-by-event by feedConveyor/markConveyor/settleWorkingRow. A plain
  // re-render (e.g. goal-tier tick) only needs to re-sync the status line, never
  // rebuild — and must catch up any committed steps that predate this DOM shell.
  Session.prototype.updateNativeAutoSearch = function () {
    var na = this.nativeAuto;
    if (!na || na.phase !== 'searching') return;
    // A step may be mid-settle (reel out → record in); count is already reserved.
    if (this._reelRecord && this._reelRecord.querySelector('.harpoon-lab-auto-step.is-committing')) {
      this.syncReelStatus();
      this.syncAutoPauseBtn();
      return;
    }
    if (this._reelRecord && this._reelRecordCount < (na.steps || []).length) {
      for (var i = this._reelRecordCount; i < na.steps.length; i += 1) {
        appendCommittedStepRow(this._reelRecord, na.steps[i], i);
      }
      this._reelRecordCount = na.steps.length;
    }
    this.syncReelStatus();
    this.syncAutoPauseBtn();
  };

  // Reflect the search label + checks·time tooltip into the status row.
  Session.prototype.syncReelStatus = function () {
    var na = this.nativeAuto;
    if (!na) return;
    if (this._autoSearchText) this._autoSearchText.textContent = nativeAutoSearchLabel(na);
    syncReelStatTips(this, na);
    this.syncAutoPauseBtn();
  };

  // Ensure a live WORKING ROW exists at the bottom of the record — the in-place
  // reel for the hole currently being solved. Its copy area is a horizontal
  // CONVEYOR of candidate chips (newest at the right, in focus).
  Session.prototype.ensureWorkingRow = function () {
    if (!this._reelRecord) return null;
    if (this._workingRow && this._workingRow.isConnected
      && !this._workingRow.classList.contains('is-committing')) {
      return this._workingRow;
    }
    var i = this._reelRecordCount || 0;
    var item = el('li', 'harpoon-lab-auto-step is-working');
    item.style.setProperty('--i', String(i));
    item.appendChild(el('span', 'harpoon-lab-auto-node is-live'));
    var lane = el('div', 'harpoon-conveyor');
    var strip = el('div', 'harpoon-conveyor-strip');
    lane.appendChild(strip);
    item.appendChild(lane);
    // Append into the current branch host so the working row sits in the right
    // case-group, matching where the committed row will land.
    var host = this._reelRecord._branchHost || this._reelRecord;
    host.appendChild(item);
    this._workingRow = item;
    this._workingStrip = strip;
    this._workingChips = [];   // { kind, head, status, el }
    return item;
  };

  // Feed a wave of candidate terms onto the conveyor: each enters at the RIGHT in
  // focus; older chips shift left as one belt; trailing rejects are capped so the
  // strip stays a readable trail, not an unbounded list.
  Session.prototype.feedConveyor = function (wave) {
    var strip = this.ensureWorkingRow() && this._workingStrip;
    if (!strip) return;
    var conveyor = strip.parentElement;
    var motionOk = reelMotionOk();
    for (var i = 0; i < wave.length; i += 1) {
      var c = wave[i];
      var prev = this._workingChips[this._workingChips.length - 1];
      if (prev && prev.el) {
        prev.el.classList.remove('is-focus');
        prev.el.classList.add('is-trail');
      }
      var existingEls = motionOk ? Array.prototype.slice.call(strip.children) : [];
      var oldRects = motionOk
        ? existingEls.map(function (node) { return node.getBoundingClientRect(); })
        : [];

      var chip = el('div', 'harpoon-conveyor-chip is-trying is-focus move-' + (c.kind || 'move'));
      chip.appendChild(el('span', 'harpoon-conveyor-kind', c.kind || 'move'));
      var term = el('code', 'harpoon-conveyor-term');
      renderSource(term, c.head || '');
      chip.appendChild(term);
      strip.appendChild(chip);
      this._workingChips.push({ kind: c.kind, head: c.head, status: 'trying', el: chip });

      if (motionOk) reelAnimateTick(conveyor, chip, existingEls, oldRects);
    }
    this.trimConveyor();
  };

  // Mark the conveyor chip matching a verdict (kind+head) won/rejected.
  Session.prototype.markConveyor = function (v) {
    var na = this.nativeAuto;
    var chips = this._workingChips || [];
    var entry = null;
    for (var i = chips.length - 1; i >= 0; i -= 1) {
      if (chips[i].status === 'trying' && chips[i].kind === v.kind && chips[i].head === v.head) { entry = chips[i]; break; }
    }
    if (!entry) {
      // A guard-skipped candidate never entered as a wave chip — add it so the
      // rejection is still visible, then mark it.
      this.feedConveyor([{ kind: v.kind, head: v.head }]);
      entry = this._workingChips[this._workingChips.length - 1];
    }
    if (!entry && v.verdict === 'accepted') {
      // Split-prune can change effText so the accepted head no longer matches the
      // wave chip — fall back to the chip currently in focus for this kind.
      for (var j = chips.length - 1; j >= 0; j -= 1) {
        var trail = chips[j];
        if (trail.status === 'trying' && trail.kind === v.kind
          && trail.el && trail.el.classList.contains('is-focus')) {
          entry = trail;
          break;
        }
      }
    }
    if (!entry || !entry.el) return;
    entry.status = v.verdict === 'accepted' ? 'won' : 'rejected';
    entry.reason = v.reason || null;
    entry.el.classList.remove('is-trying', 'is-focus', 'is-trail');
    entry.el.classList.toggle('is-won', entry.status === 'won');
    entry.el.classList.toggle('is-rejected', entry.status === 'rejected');
    if (entry.status === 'rejected') {
      if (entry.reason) setTip(entry.el, entry.reason, { ariaLabel: false });
      if (na) na.checks = (na.checks || 0) + 1;
    }
  };

  // Cap the number of visible trailing (resolved) chips so the strip reads as a
  // short trail; the focus chip and a few recent rejects stay, older ones drop.
  Session.prototype.trimConveyor = function () {
    var MAX = 6;
    var chips = this._workingChips || [];
    var motionOk = reelMotionOk();
    while (chips.length > MAX) {
      var old = chips.shift();
      if (!old || !old.el || !old.el.parentNode) continue;
      var node = old.el;
      if (motionOk) {
        node.style.transition = 'transform 220ms ' + REEL_EASE + ', opacity 220ms ease';
        node.style.transform = 'translateX(-1.4rem)';
        node.style.opacity = '0';
        setTimeout(function (n) {
          if (n.parentNode) n.parentNode.removeChild(n);
          reelClearMotion(n);
        }, 230, node);
      } else {
        node.parentNode.removeChild(node);
      }
    }
  };

  // Working row → committed row: reel fades out, then record copy scales in.
  Session.prototype.settleWorkingRow = function (step, i) {
    var row = this._workingRow;
    if (!row || !row.isConnected) {
      appendCommittedStepRow(this._reelRecord, step, i);
      this._reelRecordCount = Math.max(this._reelRecordCount, i + 1);
      return;
    }
    var self = this;
    if (this._settleTimer) {
      clearTimeout(this._settleTimer);
      this._settleTimer = null;
      if (this._settleFlush) {
        this._settleFlush();
        this._settleFlush = null;
      }
    }
    var motionOk = reelMotionOk();
    this._reelRecordCount = Math.max(this._reelRecordCount, i + 1);
    // Next pulse must open a fresh working row, not feed this committing one.
    this._workingRow = null;
    this._workingStrip = null;
    this._workingChips = [];

    function finish() {
      self._settleTimer = null;
      self._settleFlush = null;
      if (!row.isConnected) return;
      installCommittedRow(row, step, motionOk);
      var b = step.branch || null;
      if (b !== self._reelRecord._lastBranch) {
        self._reelRecord._lastBranch = b;
        self._reelRecord._branchHost = b ? self._makeBranchGroup(b, i) : null;
      }
      self.refreshTreeExplorer();
    }

    this._settleFlush = finish;
    if (motionOk) {
      var spine = row.querySelector('.harpoon-lab-auto-node');
      if (spine) spine.classList.remove('is-live');
      row.classList.add('is-committing');
      this._settleTimer = setTimeout(finish, REEL_OUT_MS);
    } else {
      finish();
    }
  };

  // Create a case-branch group in the record and return its inner <ol> host.
  Session.prototype._makeBranchGroup = function (branch, i) {
    var made = makeBranchGroup(branch, i);
    this._reelRecord.appendChild(made.group);
    return made.host;
  };

  // A light clock refreshing only the stat readout while searching (no re-render).
  Session.prototype.startReelClock = function () {
    var self = this;
    this.stopReelClock();
    this._reelClock = setInterval(function () {
      var na = self.nativeAuto;
      if (!na || na.phase !== 'searching') { self.stopReelClock(); return; }
      syncReelStatTips(self, na);
    }, 200);
  };
  Session.prototype.stopReelClock = function () {
    if (this._reelClock) { clearInterval(this._reelClock); this._reelClock = null; }
  };

  // The auto-solve panel — search → reveal → place.
  Session.prototype.renderNativeAuto = function (parent) {
    var na = this.nativeAuto;
    if (!na) return;
    var self = this;
    var box = el('div', 'harpoon-lab-auto is-' + na.phase + (na.paused ? ' is-paused' : '')
      + (self.isFrozenRetrospective() ? ' is-frozen' : ''));
    var stage = 0;

    if (!self.isFrozenRetrospective()) this.renderCompromiseBanner(box);

    if (na.goalType) {
      var hero = resolveNativeAutoGoalDisplay(self, na);
      this._autoGoalWrap = appendAutoGoalHero(box, hero.goalType, na.declName, hero.goalState);
    }

    // ── Act I — searching. Goal stays visible; status line + pause/resume only. */
    if (na.phase === 'searching') {
      var controls = el('div', 'harpoon-lab-auto-controls');
      var searching = el('div', 'harpoon-lab-auto-searching');
      var spinnerEl = el('span', 'inspector-spinner harpoon-lab-auto-searching-spinner');
      spinnerEl.setAttribute('aria-hidden', 'true');
      var searchTextEl = el(
        'span',
        'harpoon-lab-auto-searching-text beljar-tip-shimmer',
        nativeAutoSearchLabel(na)
      );
      searchTextEl.style.setProperty('--shimmer-accent', 'var(--repl-holes-accent)');
      searching.appendChild(spinnerEl);
      searching.appendChild(searchTextEl);
      controls.appendChild(searching);
      var pauseBtn = iconBtn(
        'icon-btn harpoon-lab-auto-pause',
        na.paused ? ICON_PLAY : ICON_PAUSE,
        na.paused ? 'Resume search' : 'Pause search',
        na.paused ? 'Resume' : 'Pause',
        function () {
          if (!self.nativeAuto || self.nativeAuto.phase !== 'searching') return;
          self.nativeAuto.paused = !self.nativeAuto.paused;
          if (self.nativeAuto.paused) {
            self.nativeAuto.searchLabel = 'Paused';
          } else {
            self.nativeAuto.searchLabel = 'Checking…';
          }
          self.updateNativeAutoSearch();
        },
      );
      controls.appendChild(pauseBtn);
      // Pop out the derivation TREE while solving — it grows live as steps settle.
      // The reel stays the panel's default; the tree is opt-in, same as the proved
      // view. (Reuses the exact explorer; openTreeExplorer detects the live phase.)
      var livePop = iconBtn(
        'icon-btn harpoon-lab-auto-popout',
        ICON_POPOUT,
        'Open the proof tree explorer (grows live)',
        'Pop out tree',
        function () { self.openTreeExplorer(); },
      );
      controls.appendChild(livePop);
      box.appendChild(controls);

      // The live surface: ONE record. Committed steps are static rows; the hole
      // being solved is a live WORKING ROW whose copy area is an in-place conveyor
      // of candidate moves. When a move is accepted the working row morphs into the
      // committed row and the next hole's working row opens below it.
      var live = el('div', 'harpoon-reel');
      var record = el('ol', 'harpoon-lab-auto-trail harpoon-reel-record is-live');
      live.appendChild(record);
      box.appendChild(live);

      this._autoSearchBox = box;
      this._autoSearchText = searchTextEl;
      this._autoSearchSpinner = spinnerEl;
      this._autoTrail = null;
      this._autoLiveTree = null;
      this._autoLiveCount = 0;
      this._autoPauseBtn = pauseBtn;
      this._reelRecord = record;
      this._reelRecordCount = 0;
      this._workingRow = null;
      this._workingStrip = null;
      this._workingChips = [];
      record._lastBranch = null;
      record._branchHost = null;
      pauseBtn._belPauseState = !!na.paused;
      parent.appendChild(box);
      // Replay any steps already accepted before this render into the record.
      for (var si = 0; si < (na.steps || []).length; si += 1) {
        appendCommittedStepRow(record, na.steps[si], si);
      }
      this._reelRecordCount = (na.steps || []).length;
      this.syncReelStatus();
      // Tick the elapsed-time readout while searching.
      this.startReelClock();
      return;
    }

    if (na.complete) {
      var solutionBody = solvedBodyOf(na.code, na.declName || (this.prep && this.prep.name));
    }

    // ── Verdict — proven / stopped (below goal, above solution). */
    var sub = autoSubtext(na);
    var head = buildBannerShell({
      className: 'harpoon-lab-auto-head harpoon-lab-strip harpoon-lab-banner '
        + (na.complete ? 'is-solved' : 'is-stuck'),
      tone: autoVerdictTone(na),
      icon: na.complete ? ICON_CHECK : ICON_STOP,
      badgeClass: 'harpoon-lab-auto-badge' + (na.complete ? ' is-solved' : ' is-stuck'),
      copyClass: 'harpoon-lab-auto-head-copy',
      titleClass: 'harpoon-lab-auto-title',
      subClass: 'harpoon-lab-auto-sub',
      title: autoVerdictTitle(na),
      sub: sub,
    });
    stageNode(head, stage);
    stage += 1;
    box.appendChild(head);

    // ── The STUCK card (diagnostic): the open goal + every candidate the search
    //    tried at that hole with the checker's objection. This card should never
    //    need to show; when it does, it tells you what to fix. */
    if (!na.complete && na.stuck && na.stuck.goal) {
      var stuckCard = this.renderStuckCard(na);
      stageNode(stuckCard, stage);
      stage += 1;
      box.appendChild(stuckCard);
    }
    // ── File errors: the search never had a checkable program — show the error. */
    if (!na.complete && na.stuck && na.stuck.reason === 'file-errors' && na.stuck.error) {
      var errWrap = el('div', 'harpoon-lab-auto-stuck harpoon-lab-auto-panel tone-error');
      errWrap.appendChild(el('span', 'harpoon-lab-auto-stuck-label', 'Checker error'));
      errWrap.appendChild(el('div', 'harpoon-lab-auto-stuck-goal', na.stuck.error));
      stageNode(errWrap, stage);
      stage += 1;
      box.appendChild(errWrap);
    }

    // ── Place the solution (deferred commit). */
    if (na.complete) {
      var commit = self.getCommitState();
      if (commit.status === 'failed' || (commit.status === 'placed' && !commit.dismissed)) {
        stageNode(
          renderCommitOutcome(box, commit, na.declName || (self.prep && self.prep.name),
            commit.canRetry ? function () { self.resetCommitForRetry(); } : null),
          stage
        );
        stage += 1;
      } else if (commit.status !== 'placed') {
        var blocked = self.compromise && self.compromise.level === 'block';
        var warned = self.compromise && self.compromise.level === 'warn';
        var place = buildPlaceStrip(self, {
          blocked: blocked,
          warned: warned,
          extraCls: ' harpoon-lab-auto-place is-instant',
          title: 'Place the proof',
          onClick: function () { self.commitNativeAuto(); },
        });
        stageNode(place, stage);
        stage += 1;
        box.appendChild(place);
        if (commit.status === 'checking') self.updateCommitPlace();
      }
      if (solutionBody) {
        stageNode(appendAutoSolution(box, solutionBody), stage);
        stage += 1;
      }
    }

    // ── Derivation — LIST (default) ⇄ TREE, with a pop-out to the full explorer. */
    var steps = na.steps || [];
    if (steps.length) {
      var derivSection = this.renderDerivationSection(box, na);
      stageNode(derivSection, stage);
      box.appendChild(derivSection);
      stage += 1;
    }

    parent.appendChild(box);
  };

  // Short location for the stuck hole — the anchor for "where it went wrong".
  function stuckWhere(stuck) {
    if (!stuck) return '';
    var h = stuck.hole || null;
    if (h && h.name) return h.name;
    if (h && typeof h.line === 'number') return 'line ' + (h.line + 1) + (typeof h.col === 'number' ? ':' + (h.col + 1) : '');
    return '';
  }

  // Trim a checker objection down to the signal: drop the internal trial-splice
  // location prefix (`File "input.bel", line N, column M `) and the redundant
  // `Error:` label — the coordinates are into the throwaway splice, not the user's
  // file, so they're noise on this card. Keep the actual message.
  function stuckReason(reason) {
    if (!reason) return '';
    return String(reason)
      .replace(/^File\s+"[^"]*",\s*line\s+\d+,\s*column\s+\d+\s*/i, '')
      .replace(/^Error:\s*/i, '')
      .trim();
  }

  // A one-word tag for why the search halted — terse, diagnostic.
  var STUCK_REASON = {
    'no-move': 'no move certified',
    'step-bound': 'step limit',
    'file-errors': 'file errors',
    stopped: 'stopped',
    cancelled: 'cancelled',
  };

  // The STUCK card. This card should never need to show — a complete solve replaces
  // it. When it DOES show, it is a debugging surface: what the search reached and
  // exactly why every candidate at that hole failed. No consolation copy — the open
  // goal, and each tried move with the checker's own objection. Data is the engine's
  // (na.stuck + the trace's non-advanced entry); nothing is recomputed.
  Session.prototype.renderStuckCard = function (na) {
    var stuck = na.stuck;
    var card = el('div', 'harpoon-lab-auto-stuck harpoon-lab-auto-panel tone-warn harpoon-stuck');

    // Header: the reason + where. The "went wrong" anchor.
    var head = el('div', 'harpoon-stuck-head');
    head.appendChild(el('span', 'harpoon-lab-auto-stuck-label', STUCK_REASON[stuck.reason] || stuck.reason || 'stuck'));
    var where = stuckWhere(stuck);
    if (where) head.appendChild(el('code', 'harpoon-stuck-where', where));
    card.appendChild(head);

    // The open goal — the type nothing inhabited.
    if (stuck.goal) {
      var goal = el('div', 'harpoon-hole-goal harpoon-lab-auto-stuck-goal');
      renderType(goal, stuck.goal);
      card.appendChild(goal);
    }

    // The tried candidates for the stuck hole — the trace's non-advanced entry.
    var stuckTrace = null;
    var trace = na.trace || null;
    if (trace) {
      for (var t = 0; t < trace.length; t += 1) {
        if (!trace[t].advanced) stuckTrace = trace[t];
      }
    }
    var tried = (stuckTrace && stuckTrace.tried) || [];
    // Rejected (reached the checker, has an objection) FIRST — the real signal —
    // then guard-skipped (pre-filtered, never checked) as muted completeness.
    var rejected = tried.filter(function (v) { return v.verdict === 'rejected'; });
    var guarded = tried.filter(function (v) { return v.verdict === 'guard'; });

    if (rejected.length || guarded.length) {
      card.appendChild(el('div', 'harpoon-stuck-sub',
        rejected.length + ' rejected by the checker'
        + (guarded.length ? ' · ' + guarded.length + ' skipped' : '')));
      var list = el('ul', 'harpoon-stuck-tried');
      var addRow = function (v) {
        var li = el('li', 'harpoon-stuck-tried-row is-' + v.verdict);
        li.appendChild(el('span', 'hpt-card-kind hpt-kind--' + v.kind, v.kind));
        var hd = el('code', 'harpoon-stuck-tried-head');
        hd.textContent = v.head;
        li.appendChild(hd);
        var reason = stuckReason(v.reason);
        if (reason) {
          var rn = el('span', 'harpoon-stuck-tried-reason', reason);
          setTip(rn, v.reason, { ariaLabel: false });
          li.appendChild(rn);
        }
        list.appendChild(li);
      };
      rejected.forEach(addRow);
      guarded.forEach(addRow);
      card.appendChild(list);
    } else if (stuck.reason === 'no-move') {
      // No trace (collectTrace off) — say so plainly rather than imply nothing tried.
      card.appendChild(el('div', 'harpoon-stuck-sub', 'no candidate reached this goal'));
    }
    return card;
  };

  // The derivation section: a header with a List⇄Tree segmented toggle + a "Pop
  // out" button, then either the linear step list (default) or a compact inline
  // tree. The roomy experience lives in the pop-out explorer.
  Session.prototype.renderDerivationSection = function (box, na) {
    var self = this;
    var section = el('div', 'harpoon-deriv');
    var header = el('div', 'harpoon-deriv-header');
    header.appendChild(el('span', 'harpoon-lab-section-label is-steps', 'Derivation'));

    var toggle = el('div', 'harpoon-deriv-toggle');
    var views = [['list', 'List'], ['tree', 'Tree']];
    var view = 'list';
    var listHost = el('ol', 'harpoon-lab-auto-trail is-instant');
    appendAutoTree(listHost, na.steps || []);
    var treeHost = el('div', 'harpoon-deriv-treehost');
    var treeDrawn = false;

    function showView(v) {
      view = v;
      listHost.hidden = v !== 'list';
      treeHost.hidden = v !== 'tree';
      toggle.querySelectorAll('.harpoon-deriv-tab').forEach(function (t) {
        t.classList.toggle('is-active', t.dataset.view === v);
      });
      if (v === 'tree' && !treeDrawn) {
        treeDrawn = true;
        var mounted = self.mountTreePanel(treeHost, na, { compact: true, live: true });
        self._compactTreeRedraw = mounted.redraw;
      }
    }
    views.forEach(function (vv) {
      var t = el('button', 'harpoon-deriv-tab' + (vv[0] === view ? ' is-active' : ''), vv[1]);
      t.type = 'button';
      t.dataset.view = vv[0];
      t.addEventListener('click', function () { if (view !== vv[0]) showView(vv[0]); });
      toggle.appendChild(t);
    });
    header.appendChild(toggle);

    var popBtn = iconBtn(
      'icon-btn harpoon-deriv-popout',
      ICON_POPOUT,
      'Open the proof tree explorer',
      'Pop out tree',
      function () { self.openTreeExplorer(); },
    );
    header.appendChild(popBtn);
    section.appendChild(header);

    treeHost.hidden = true;
    section.appendChild(listHost);
    section.appendChild(treeHost);
    return section;
  };

  // Mount the SVG tree panel into a host. `opts.compact` = the inline side-panel
  // variant (smaller, detail card below); otherwise the roomy pop-out variant
  // (detail card in a side rail). `opts.live` = read the CURRENT session na on every
  // draw (so the tree grows during search, surviving the na reassignment at the end)
  // instead of a captured snapshot. Returns { wrap, redraw } — redraw re-lays the
  // tree from the latest na, preserving the chosen mode. Reuses HarpoonTree +
  // renderTreeDetail.
  Session.prototype.mountTreePanel = function (host, na, opts) {
    var self = this;
    opts = opts || {};
    host.textContent = '';
    var wrap = el('div', 'hpt-panel' + (opts.compact ? ' is-compact' : ' is-roomy'));
    var mode = 'path';
    var selectedNodeId = null;
    var treeHost = el('div', 'hpt-host');
    var card = el('div', 'hpt-card');
    card.hidden = true;

    // draw() rebuilds the whole SVG from scratch on every redraw (each step
    // settling during a live search). Left alone, that also resets pan/zoom
    // to the auto-fit default every time, yanking the view out from under
    // anyone who'd manually framed something. So: keep auto-fitting freely
    // until the user actually pans or zooms (userView goes null -> a vb),
    // then freeze on their view across redraws until they reset it (the
    // "Fit to view" menu action below).
    var userView = null;

    // The live variant tracks the session's current na (reassigned when the search
    // ends); the static variant renders the snapshot it was given.
    function cur() { return opts.live ? (self.nativeAuto || na) : na; }

    function draw() {
      if (!global.HarpoonTree) return;
      var n = cur();
      var root = global.HarpoonTree.buildModel({
        steps: n.steps || [],
        trace: n.trace || null,
        complete: !!n.complete,
        stuck: n.complete ? null : n.stuck,
        name: (self.prep && self.prep.name) || n.declName || 'theorem',
        goalType: n.goalType || '',
        theoremSnapshot: n.theoremSnapshot || null,
      });
      global.HarpoonTree.render(treeHost, root, {
        mode: mode,
        instant: !!opts.live,
        selectedId: selectedNodeId,
        initialView: userView,
        onViewChange: function (vb) { userView = vb; },
        onSelect: function (nn) {
          selectedNodeId = nn && nn.id != null ? nn.id : null;
          card._hptEverSelected = true;
          self.renderTreeDetail(card, nn, detailCtx(mode));
        },
      });
      if (opts.compact === false && !card._hptEverSelected) {
        self.renderTreeDetail(card, null, detailCtx(mode));
      }
    }

    function resetView() {
      userView = null;
      draw();
    }

    function detailCtx(treeMode) {
      var n = cur();
      return {
        na: n,
        declName: (self.prep && self.prep.name) || n.declName || 'theorem',
        treeMode: treeMode || mode,
      };
    }

    // The Path / Move-space toggle lives on the tree's own right-click menu
    // (dependency-graph convention) instead of a permanent tab bar.
    if (global.Menu && global.Menu.bindContextMenu) {
      global.Menu.bindContextMenu(treeHost, function () {
        var hasTrace = !!(cur().trace && cur().trace.length);
        return [
          {
            label: mode === 'space' ? 'Hide rejected moves' : 'Show full move space',
            disabled: !hasTrace,
            onSelect: function () {
              mode = mode === 'space' ? 'path' : 'space';
              draw();
            },
          },
          { type: 'separator' },
          { label: 'Fit to view', onSelect: resetView },
        ];
      }, { side: 'bottom', align: 'start' });
    }

    if (opts.compact) {
      wrap.appendChild(treeHost);
      wrap.appendChild(card);
    } else {
      // Roomy: tree on the left, detail card in a persistent side rail.
      var split = el('div', 'hpt-split');
      var left = el('div', 'hpt-split-tree');
      left.appendChild(treeHost);
      var rail = el('div', 'hpt-split-rail');
      card.hidden = false;
      card.classList.add('is-rail');
      card._hptEverSelected = false;
      self.renderTreeDetail(card, null, detailCtx(mode));
      rail.appendChild(card);
      split.appendChild(left);
      split.appendChild(rail);
      wrap.appendChild(split);
    }
    host.appendChild(wrap);
    draw();
    return { wrap: wrap, redraw: draw };
  };

  // The roomy POP-OUT tree explorer — a second FloatingWindow with space for
  // pan/zoom, the right-click move-space toggle, and a detail side rail. Reuses
  // mountTreePanel. When
  // opened DURING the search it tracks the live na, so the tree GROWS as steps
  // settle (redraw driven by settleWorkingRow / the phase transition); opened after,
  // it shows the final derivation.
  Session.prototype.openTreeExplorer = function () {
    var self = this;
    var fw = FW();
    var na = this.nativeAuto;
    if (!fw || !na) return;
    if (this._treeWin) { this._treeWin.raise && this._treeWin.raise(); return; }
    var live = na.phase === 'searching';
    var content = el('div', 'harpoon-tree-explorer' + (live ? ' is-live' : ''));
    var mounted = this.mountTreePanel(content, na, { compact: false, live: live });
    this._treeRedraw = mounted.redraw;
    var name = (this.prep && this.prep.name) || na.declName || 'theorem';
    this._treeWin = fw.open({
      title: labTitle(name + ' · proof tree'),
      className: 'harpoon-tree-window',
      content: content,
      width: 760,
      height: 560,
      minWidth: 420,
      minHeight: 320,
      onClose: function () { self._treeWin = null; self._treeRedraw = null; },
    });
  };

  // Redraw the pop-out tree if it's open (throttled to one per frame). Called as the
  // live search settles steps and on the search→solved/stuck transition, so the
  // explorer grows in step with the reel without thrashing on rapid settles.
  Session.prototype.refreshTreeExplorer = function () {
    var self = this;
    if (!this._treeRedraw || this._treeRedrawPending) return;
    this._treeRedrawPending = true;
    requestAnimationFrame(function () {
      self._treeRedrawPending = false;
      if (self._treeRedraw) self._treeRedraw();
      if (self._compactTreeRedraw) self._compactTreeRedraw();
    });
  };

  // Render a synth step's DERIVATION CHAIN — the ordered rule/lemma names the
  // backward-chaining engine applied to close the hole (meta.chain), and whether
  // it closed by inhabitation or by contradiction (meta.refutation). Surfaces the
  // engine's own datum verbatim; never recomputes the chain. Returns null when
  // there is no chain to show. `variant`: 'full' (card), 'rail' (pop-out), or
  // 'inline' (list row).
  function renderSynthChain(meta, variant) {
    var chain = (meta && meta.chain) || [];
    if (!chain.length) return null;
    var refutation = !!(meta && meta.refutation);
    var links = chain.filter(function (c) { return c !== 'impossible'; });
    var wrap = el('div', 'hpt-chain'
      + (variant === 'inline' ? ' is-inline' : '')
      + (variant === 'rail' ? ' is-rail' : '')
      + (refutation ? ' is-refutation' : ''));
    if (variant === 'full') {
      wrap.appendChild(el('div', 'hpt-chain-label',
        refutation ? 'Refutation — derived to a contradiction'
          : 'Synthesis — backward-chained ' + links.length
            + ' step' + (links.length === 1 ? '' : 's')));
    }
    var seq = el('div', 'hpt-chain-seq');
    links.forEach(function (name, i) {
      if (i > 0) seq.appendChild(el('span', 'hpt-chain-arrow', '→'));
      if (variant === 'rail') {
        var railNm = el('code', 'hpt-chain-name');
        railNm.textContent = name;
        seq.appendChild(railNm);
        return;
      }
      var last = i === links.length - 1;
      var link = el('span', 'hpt-chain-link' + (last && !refutation ? ' is-close' : ''));
      link.appendChild(el('span', 'hpt-chain-idx', String(i + 1)));
      var nm = el('code', 'hpt-chain-name');
      nm.textContent = name;
      link.appendChild(nm);
      seq.appendChild(link);
    });
    if (refutation) {
      seq.appendChild(el('span', 'hpt-chain-arrow', '→'));
      if (variant === 'rail') {
        seq.appendChild(el('code', 'hpt-chain-name is-impossible', 'impossible'));
      } else {
        seq.appendChild(el('span', 'hpt-chain-link is-impossible', 'impossible'));
      }
    }
    wrap.appendChild(seq);
    if (variant === 'full') {
      var refuted = (meta.uses && meta.uses.length) ? meta.uses[meta.uses.length - 1] : null;
      var note = el('div', 'hpt-chain-note');
      if (!refutation) {
        note.textContent = 'the final rule closes the goal';
      } else if (refuted) {
        note.appendChild(document.createTextNode('these rules refute '));
        var rc = el('code', 'hpt-chain-refuted');
        rc.textContent = refuted;
        note.appendChild(rc);
      } else {
        note.textContent = 'these rules refute a hypothesis';
      }
      wrap.appendChild(note);
    }
    return wrap;
  }

  function detailSection(label, bodyEl) {
    var sec = el('div', 'hpt-detail-section');
    if (label) sec.appendChild(el('span', 'harpoon-lab-section-label', label));
    var body = el('div', 'hpt-detail-section-body');
    body.appendChild(bodyEl);
    sec.appendChild(body);
    return sec;
  }

  function renderDetailMeta(meta, checks) {
    var parts = [];
    (meta.uses || []).forEach(function (u) { parts.push(u); });
    (meta.binds || []).forEach(function (b) { parts.push('⊕ ' + b); });
    if (typeof checks === 'number' && checks > 0) {
      parts.push(checks + ' check' + (checks === 1 ? '' : 's'));
    }
    if (!parts.length) return null;
    var foot = el('div', 'hpt-detail-foot');
    parts.forEach(function (p, i) {
      if (i > 0) foot.appendChild(el('span', 'hpt-detail-sep', '·'));
      foot.appendChild(el('span', 'hpt-detail-meta-item', p));
    });
    return foot;
  }

  function renderDetailBanner(moveKind, name, lead) {
    var banner = el('div', 'hpt-detail-banner');
    if (moveKind) {
      banner.appendChild(el('span', 'harpoon-lab-auto-move move-' + moveKind, moveKind));
    }
    banner.appendChild(el('div', 'hpt-detail-name', name));
    if (lead) banner.appendChild(el('p', 'hpt-detail-lead', lead));
    return banner;
  }

  function renderTreeRailOverview(mount, ctx) {
    var na = ctx.na || {};
    var name = ctx.declName || 'theorem';
    mount.appendChild(el('span', 'harpoon-lab-section-label is-steps', 'Overview'));
    var banner = el('div', 'hpt-detail-banner is-overview');
    banner.appendChild(el('div', 'hpt-detail-name', name));
    mount.appendChild(banner);
    if (na.goalType) {
      var g = el('div', 'hpt-detail-goal');
      renderType(g, na.goalType);
      mount.appendChild(detailSection('Theorem', g));
    }
    var snap = na.theoremSnapshot;
    if (snap && (snap.premiseCount || snap.totality)) {
      var meta = el('div', 'hpt-detail-theorem-meta');
      if (snap.premiseCount) {
        meta.appendChild(el('span', 'hpt-detail-meta-item', snap.premiseCount + ' premise' + (snap.premiseCount === 1 ? '' : 's')));
      }
      if (snap.totality && snap.totality.kind) {
        meta.appendChild(el('span', 'hpt-detail-meta-item', 'total ' + snap.totality.kind
          + (snap.totality.name ? ' ' + snap.totality.name : '')));
      }
      mount.appendChild(detailSection('Structure', meta));
    }
    var status = el('div', 'hpt-detail-status');
    if (na.phase === 'searching') {
      status.appendChild(el('div', 'hpt-detail-status-main', nativeAutoSearchLabel(na)));
      status.appendChild(el('div', 'hpt-detail-status-sub', reelStatText(na)));
    } else if (na.complete) {
      status.appendChild(el('div', 'hpt-detail-status-main', autoVerdictTitle(na)));
      var sc = (na.steps || []).length;
      var line = sc ? (sc + (sc === 1 ? ' step' : ' steps')) : '';
      if (na.checks) line += (line ? ' · ' : '') + na.checks + (na.checks === 1 ? ' check' : ' checks');
      if (line) status.appendChild(el('div', 'hpt-detail-status-sub', line));
    } else {
      status.appendChild(el('div', 'hpt-detail-status-main', autoVerdictTitle(na)));
      var sub = autoSubtext(na);
      if (sub) status.appendChild(el('div', 'hpt-detail-status-sub', sub));
      var sc2 = (na.steps || []).length;
      if (sc2) {
        status.appendChild(el('div', 'hpt-detail-status-sub',
          sc2 + (sc2 === 1 ? ' step' : ' steps') + ' recorded'));
      }
    }
    mount.appendChild(detailSection('Status', status));
    mount.appendChild(el('p', 'hpt-detail-hint', 'Click a node in the tree to inspect a move.'));
  }

  function renderTreeBreadcrumb(n) {
    if (!n || !global.HarpoonTree || typeof global.HarpoonTree.breadcrumb !== 'function') return null;
    var parts = global.HarpoonTree.breadcrumb(n);
    if (!parts.length) return null;
    function truncPart(s) {
      s = String(s || '');
      return s.length > 22 ? s.slice(0, 21) + '…' : s;
    }
    var row = el('div', 'hpt-breadcrumb');
    parts.forEach(function (p, i) {
      if (i > 0) row.appendChild(el('span', 'hpt-breadcrumb-sep', '/'));
      row.appendChild(el('span', 'hpt-breadcrumb-part', truncPart(p)));
    });
    return row;
  }

  function renderFocusLine(focus) {
    if (!focus) return null;
    var bits = [];
    if (focus.siblingCount > 1) bits.push(focus.siblingCount + ' open holes');
    if (focus.armLine) bits.push('deepest case arm (line ' + focus.armLine + ')');
    if (typeof focus.score === 'number') bits.push('priority score ' + focus.score);
    if (!bits.length) return null;
    return el('p', 'hpt-detail-focus', bits.join(' · '));
  }

  function renderAltRow(v, rail) {
    var li = el('li', 'hpt-tried is-' + v.verdict);
    li.appendChild(el('span', (rail ? 'harpoon-lab-auto-move' : 'hpt-card-kind') + ' move-' + v.kind, v.kind));
    var head = el('code', 'hpt-tried-head');
    head.textContent = v.head || v.kind;
    li.appendChild(head);
    if (v.rationale) {
      var rat = el('span', 'hpt-tried-rationale');
      rat.textContent = v.rationale;
      li.appendChild(rat);
    }
    if (v.text && v.text !== v.head) {
      var full = el('pre', 'hpt-tried-text');
      full.textContent = v.text;
      li.appendChild(full);
    }
    if (v.reason) {
      var reason = el('span', 'hpt-tried-reason');
      reason.textContent = (v.verdict === 'guard' ? 'Skipped: ' : 'Rejected: ') + v.reason;
      li.appendChild(reason);
    }
    return li;
  }

  function renderAlternativesTray(tried, opts) {
    opts = opts || {};
    if (!tried || !tried.length) return null;
    var groups = [
      { key: 'guard', label: 'Skipped (guard)' },
      { key: 'rejected', label: 'Rejected (checker)' },
      { key: 'accepted', label: 'Accepted' },
    ];
    var wrap = el('div', 'hpt-alt-tray');
    groups.forEach(function (g) {
      var rows = tried.filter(function (v) { return v.verdict === g.key; });
      if (!rows.length) return;
      var sec = el('div', 'hpt-alt-group is-' + g.key);
      sec.appendChild(el('div', 'hpt-alt-group-label', g.label + ' (' + rows.length + ')'));
      var list = el('ul', 'hpt-detail-tried');
      rows.forEach(function (v) { list.appendChild(renderAltRow(v, opts.rail)); });
      sec.appendChild(list);
      wrap.appendChild(sec);
    });
    return wrap.childNodes.length ? wrap : null;
  }

  // The theorem being proved is not necessarily the ACTIVE editor tab (the
  // Harpoon lab can stay open while the user reads a different file), so a
  // same-file-only jump against a possibly-stale `this.view` silently no-ops.
  // Use the app's real cross-file jump path instead — the same one go-to-
  // definition and project search use — which switches tabs first if needed.
  Session.prototype.jumpToTreeHole = function (hole) {
    var fileId = this.fileId;
    if (!hole || !hole.line || !fileId) return;
    var text = liveFileText(fileId);
    if (!text) return;
    var from = lineColToOffset(text, hole.line, hole.col);
    if (typeof global.openFileAt === 'function') {
      global.openFileAt(fileId, from, from + 1, { line: hole.line, col: hole.col, name: hole.name });
    }
  };

  function renderWhereSection(self, n, st) {
    var where = el('div', 'hpt-detail-where');
    var crumb = renderTreeBreadcrumb(n);
    if (crumb) where.appendChild(crumb);
    var hole = (st && st.hole) || n.hole;
    if (hole && hole.line) {
      var loc = el('button', 'hpt-hole-loc');
      loc.type = 'button';
      loc.textContent = 'line ' + hole.line + (hole.col ? ':' + hole.col : '')
        + (hole.name ? ' (' + hole.name + ')' : '');
      loc.addEventListener('click', function () { self.jumpToTreeHole(hole); });
      where.appendChild(loc);
    }
    if (st && st.branch) {
      where.appendChild(el('div', 'hpt-detail-branch', 'in branch: ' + st.branch));
    }
    if (st && typeof st.checks === 'number' && st.checks > 0) {
      where.appendChild(el('div', 'hpt-detail-checks', st.checks + ' checker call' + (st.checks === 1 ? '' : 's')));
    }
    return where.childNodes.length ? where : null;
  }

  function renderStateContext(self, mount, state, goalState) {
    if (!state) return;
    var ed = E();
    if (state.goal) {
      var goalHost = el('div', 'hpt-detail-goal');
      if (ed && typeof ed.mountHoleGoalTier === 'function') {
        ed.mountHoleGoalTier(goalHost, {
          surface: 'lab',
          goalState: goalState || 'live',
          goal: state.goal,
        });
      } else {
        renderType(goalHost, state.goal);
      }
      mount.appendChild(detailSection('Goal', goalHost));
    }
    if (state.meta && state.meta.length) {
      var metaWrap = el('div', 'hpt-detail-ctx');
      self.renderCtx(metaWrap, 'meta', state.meta);
      mount.appendChild(detailSection('Meta context', metaWrap));
    }
    if (state.ctx && state.ctx.length) {
      var ctxWrap = el('div', 'hpt-detail-ctx');
      self.renderCtx(ctxWrap, 'ctx', state.ctx);
      mount.appendChild(detailSection('Context', ctxWrap));
    }
  }

  // Proof-state inspector for a selected tree node.
  // `ctx` supplies theorem overview data when `n` is null (pop-out rail idle).
  Session.prototype.renderTreeDetail = function (card, n, ctx) {
    card.textContent = '';
    card.hidden = false;
    var rail = card.classList.contains('is-rail');
    if (!n) {
      if (rail && ctx) {
        var idle = el('div', 'hpt-detail');
        card.appendChild(idle);
        renderTreeRailOverview(idle, ctx);
      } else if (!rail) {
        card.hidden = true;
      }
      return;
    }

    var mount = rail ? el('div', 'hpt-detail') : card;
    if (rail) card.appendChild(mount);

    var self = this;
    var treeMode = (ctx && ctx.treeMode) || 'path';
    var goalState = (ctx && ctx.na && ctx.na.goalState) || 'live';
    var showAlts = treeMode === 'space';

    if (n.type === 'ghost') {
      var gh = n.ghost;
      var gBanner = renderDetailBanner(gh.kind, gh.head || gh.kind, 'candidate not taken');
      if (rail) mount.appendChild(gBanner);
      else card.appendChild(gBanner);
      if (gh.text && gh.text !== gh.head) {
        var gcode = rail ? el('div', 'hpt-detail-code') : el('div', 'hpt-card-code');
        renderSource(gcode, gh.text);
        if (rail) mount.appendChild(detailSection('Fragment', gcode));
        else card.appendChild(gcode);
      }
      var gverdict = el('div', 'hpt-detail-verdict is-' + gh.verdict,
        (gh.verdict === 'guard' ? 'skipped — ' : 'rejected — ') + (gh.reason || 'did not certify'));
      if (gh.rationale) gverdict.textContent += '\n' + gh.rationale;
      if (rail) mount.appendChild(gverdict);
      else card.appendChild(gverdict);
      return;
    }

    if (n.type === 'stuck') {
      mount.appendChild(renderDetailBanner('stuck', 'stuck', 'no certified move closes this goal'));
      var whereStuck = renderWhereSection(self, n, null);
      if (whereStuck) mount.appendChild(detailSection('Where', whereStuck));
      var focusStuck = renderFocusLine(n.focus);
      if (focusStuck) mount.appendChild(detailSection('Focus', focusStuck));
      renderStateContext(self, mount, n.state || { goal: n.goal }, goalState);
      var altStuck = renderAlternativesTray(n.tried || n.frontier || [], { rail: rail });
      if (altStuck) mount.appendChild(detailSection('Alternatives', altStuck));
      if (!rail) {
        // compact card already has content in mount when not rail - fix: for stuck non-rail, mount is card
      }
      return;
    }

    var st = n.step;
    if (!st) {
      var idleKind = n.type === 'theorem' ? null : (n.kind || n.type);
      var idleLead = n.sub || (n.type === 'arm' ? 'case branch' : '');
      mount.appendChild(renderDetailBanner(idleKind, n.label || '', idleLead));
      if (n.type === 'theorem' && ctx && ctx.na) {
        renderStateContext(self, mount, { goal: ctx.na.goalType }, ctx.na.goalState);
        var snap = ctx.na.theoremSnapshot;
        if (snap && snap.premiseCount) {
          mount.appendChild(detailSection('Structure',
            el('div', 'hpt-detail-theorem-meta', snap.premiseCount + ' premise(s)')));
        }
      } else if (n.type === 'arm' && n.pattern) {
        var pg = el('div', 'hpt-detail-goal');
        renderType(pg, n.pattern);
        mount.appendChild(detailSection('Branch pattern', pg));
      }
      return;
    }

    var meta = st.meta || {};
    var lead = st.lead || deriveMoveLead(st) || st.rationale || n.sub || '';
    mount.appendChild(renderDetailBanner(st.move, n.label || st.move || 'move', lead));
    var where = renderWhereSection(self, n, st);
    if (where) mount.appendChild(detailSection('Where', where));
    var focus = renderFocusLine(st.focus || n.focus);
    if (focus) mount.appendChild(detailSection('Focus', focus));
    renderStateContext(self, mount, n.state || {
      goal: st.goal,
      ctx: st.holeCtx,
      meta: st.holeMeta,
    }, goalState);
    var codeEl = el('div', rail ? 'hpt-detail-code' : 'hpt-card-code');
    renderSource(codeEl, st.text || '');
    mount.appendChild(detailSection('Fragment', codeEl));
    if (st.move === 'synth') {
      var chainEl = renderSynthChain(meta, rail ? 'rail' : 'full');
      if (chainEl) mount.appendChild(detailSection('Chain', chainEl));
    }
    if (st.move === 'split' && meta.armPatterns && meta.armPatterns.length) {
      var arms = el('ul', 'hpt-detail-arms');
      meta.armPatterns.forEach(function (pat) {
        var li = el('li', 'hpt-detail-arm');
        renderType(li, pat);
        arms.appendChild(li);
      });
      mount.appendChild(detailSection('Arms (' + meta.armPatterns.length + ')', arms));
    }
    var foot = renderDetailMeta(meta, st.checks);
    if (foot) mount.appendChild(foot);
    if (showAlts) {
      var alts = renderAlternativesTray(n.frontier || (n.traceEntry && n.traceEntry.tried) || [], { rail: rail });
      if (alts) mount.appendChild(detailSection('Alternatives', alts));
    }
  };

  Session.prototype.render = function () {
    if (!this.bodyEl) return;
    var self = this;
    var body = this.bodyEl;

    if (this.nativeAuto && this.nativeAuto.phase === 'searching'
        && this._autoSearchBox && this._autoSearchBox.parentNode === body) {
      this.updateNativeAutoSearch();
      return;
    }

    this.clearNativeAutoShell();
    body.textContent = '';
    body.classList.remove('is-starting');
    var m = this.model;

    // Native auto-solve owns the surface end-to-end (search → reveal → place); it
    // needs no OCaml subgoal model. When it's active, render it directly.
    if (this.nativeAuto) {
      this.renderNativeAuto(body);
      return;
    }

    if (!m || (!m.ok && (!m.subgoals || !m.subgoals.length))) {
      body.appendChild(el('div', 'harpoon-lab-empty', (m && m.error) ? ('Could not start: ' + m.error) : 'No proof.'));
      return;
    }

    this.renderBar(m);
    this.renderNativeAuto(body);

    // When auto-solve owns the surface (its own reveal + place strip), don't also
    // draw the manual solved-strip; auto's Act III is the single place action.
    var autoOwns = this.nativeAuto && (this.nativeAuto.phase === 'solved' || this.nativeAuto.phase === 'searching');
    if (m.complete && !autoOwns) {
      stageNode(renderManualSolvedSummary(body), 0);
      var commit = self.getCommitState();
      if (commit.status === 'failed' || (commit.status === 'placed' && !commit.dismissed)) {
        stageNode(
          renderCommitOutcome(body, commit, self.prep && self.prep.name,
            commit.canRetry ? function () { self.resetCommitForRetry(); } : null),
          1
        );
      } else if (commit.status !== 'placed') {
        var place = buildPlaceStrip(self, {
          title: 'Place the proof',
          sub: 'Insert into the file',
          onClick: function () { self.commit(); },
        });
        stageNode(place, 1);
        body.appendChild(place);
        if (commit.status === 'checking') self.updateCommitPlace();
      }
      return;
    }

    var work = el('div', 'harpoon-lab-work');
    var focused = this.findSubgoal(this.focusedId) || m.subgoals[0];
    var focusedIdx = 0;
    for (var fi = 0; fi < m.subgoals.length; fi++) {
      if (m.subgoals[fi].id === focused.id) { focusedIdx = fi; break; }
    }

    if (m.subgoals.length > 1) {
      var picker = el('div', 'harpoon-lab-picker');
      picker.setAttribute('role', 'tablist');
      picker.setAttribute('aria-label', 'Subgoals');
      m.subgoals.forEach(function (sg, idx) {
        var tab = el('button', 'harpoon-lab-picker-tab' + (sg.id === focused.id ? ' is-active' : ''));
        tab.type = 'button';
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', sg.id === focused.id ? 'true' : 'false');
        tab.appendChild(el('span', 'harpoon-lab-picker-num', String(idx + 1)));
        tab.addEventListener('click', function () { self.focusedId = sg.id; self.render(); });
        picker.appendChild(tab);
      });
      work.appendChild(picker);
    }

    work.appendChild(this.renderGoalCard(focused, focusedIdx, m.subgoals.length));
    body.appendChild(work);
  };

  function prepareForHole(view, hit) {
    var ed = E();
    var api = global.BelJarCurrentEditor;
    var ctx = api && typeof api.getHoleActionContext === 'function' ? api.getHoleActionContext() : null;
    if (!ctx || !ctx.code) { toast('Harpoon: no checkable program.', 'error'); return null; }
    var span = api.getDeclSpan ? api.getDeclSpan(hit.from) : null;
    if (!span) { toast('Harpoon: couldn\u2019t find the enclosing declaration.', 'error'); return null; }
    var decl = ed.parseDecl(view.state.doc.sliceString(span.from, span.to));
    if (!decl) { toast('Harpoon: only rec/proof declarations are supported.', 'error'); return null; }
    var assembled = String(ctx.code);
    var re = new RegExp('(^|\\n)\\s*(rec|proof)\\s+' + decl.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:');
    var match = re.exec(assembled);
    if (!match) { toast('Harpoon: declaration not found in the checkable program.', 'error'); return null; }
    var declStart = match.index + match[1].length;
    var semi = assembled.indexOf(';', declStart);
    var declEnd = semi === -1 ? assembled.length : semi + 1;
    var built = ed.buildProofProgram(assembled, declStart, declEnd);
    if (!built) { toast('Harpoon: couldn\u2019t build the proof program.', 'error'); return null; }
    var proveCode = (ed.proveOrchestrationCode)
      ? ed.proveOrchestrationCode(assembled, decl.name, declStart, declEnd, ctx.fileStart)
      : assembled;
    return {
      built: built,
      span: span,
      name: decl.name,
      declKey: decl.kw + ':' + decl.name,
      hit: hit,
      assembledCode: assembled,
      assembledDeclFrom: declStart,
      assembledDeclTo: declEnd,
      proveCode: proveCode,
      offsetLines: ctx.offsetLines || 0,
      fileStart: ctx.fileStart != null ? ctx.fileStart : 0,
    };
  }

  var floatSessions = [];

  function holeKeyFromHit(hit) {
    if (!hit || !hit.hole) return '';
    return hit.hole.line + ':' + (hit.hole.col || 1) + ':' + (hit.hole.name || '');
  }

  function removeFloatSession(session) {
    var idx = floatSessions.indexOf(session);
    if (idx !== -1) floatSessions.splice(idx, 1);
    if (global.BelJarWorkspaceState && global.BelJarWorkspaceState.scheduleSave) {
      global.BelJarWorkspaceState.scheduleSave();
    }
  }

  function listHoleHits(view, engine) {
    if (!view || !engine || typeof engine.getHoles !== 'function') return [];
    var doc = view.state.doc;
    var out = [];
    var holes = engine.getHoles() || [];
    for (var i = 0; i < holes.length; i++) {
      var h = holes[i];
      if (!h || h.line < 1 || h.line > doc.lines) continue;
      var off = doc.line(h.line).from + Math.max(0, (h.col || 1) - 1);
      if (off >= doc.length || doc.sliceString(off, off + 1) !== '?') continue;
      out.push({ hole: h, from: off, to: off + 1 });
    }
    return out;
  }

  function findHoleHit(view, engine, anchor) {
    if (!anchor) return null;
    var hits = listHoleHits(view, engine);
    if (anchor.holeKey) {
      for (var i = 0; i < hits.length; i++) {
        if (holeKeyFromHit(hits[i]) === anchor.holeKey) return hits[i];
      }
    }
    if (!anchor.declKey) return null;
    var ed = E();
    for (var j = 0; j < hits.length; j++) {
      var hit = hits[j];
      var span = ed && ed.getDeclSpan ? ed.getDeclSpan(hit.from) : null;
      if (!span) continue;
      var decl = ed.parseDecl(view.state.doc.sliceString(span.from, span.to));
      if (decl && (decl.kw + ':' + decl.name) === anchor.declKey) return hit;
    }
    return null;
  }

  function runSession(view, prep, host) {
    var session = new Session(view, prep.span.from, prep.span.to, host);
    session.prep = prep;
    var persist = global.BelJarPersist;
    session.fileId = persist && persist.getActiveFileId ? persist.getActiveFileId() : null;
    session.captureAnchor(view, prep);
    session.bindProbe();
    var content = el('div', 'harpoon-lab' + (host.kind === 'panel' ? ' harpoon-lab--panel' : ''));
    session.bodyEl = content;
    host.mount(content, session);
    if (host.onSessionStart) host.onSessionStart(prep.name);

    // BelJar drives: open straight into the native auto-solve (pure JS proof search,
    // checker-certified \u2014 no OCaml Harpoon session). runNativeAuto renders its own
    // Act I searching state, so no separate "Starting proof\u2026" bar is needed.
    session.runNativeAuto();
    return session;
  }

  function solvedBodyOf(code, name) {
    var src = String(code || '');
    var re = new RegExp('\\b(?:rec|proof)\\s+' + String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:');
    var m = re.exec(src);
    if (!m) return '';
    var eq = src.indexOf('=', m.index);
    if (eq < 0) return '';
    var semi = src.indexOf(';', eq);
    if (semi < 0) return '';
    return src.slice(eq + 1, semi).trim();
  }

  function proofDeclText(code, name) {
    var src = String(code || '');
    var re = new RegExp('\\b(?:rec|proof)\\s+' + String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:');
    var m = re.exec(src);
    if (!m) return '';
    var semi = src.indexOf(';', m.index);
    return src.slice(m.index, semi < 0 ? src.length : semi + 1);
  }

  function openFromHole(view, engine, hit, opts) {
    opts = opts || {};
    var ed = E(); var fw = FW();
    if (!ed || !fw) { toast('Harpoon unavailable.', 'error'); return; }
    var prep = prepareForHole(view, hit);
    if (!prep) return;
    var persist = global.BelJarPersist;
    var fileId = persist && persist.getActiveFileId ? persist.getActiveFileId() : null;
    var session = runSession(view, prep, {
      kind: 'float',
      mount: function (content, s) {
        var geom = opts.geom || {};
        s.fileId = fileId;
        s.declKey = prep.declKey;
        s.holeKey = holeKeyFromHit(prep.hit || hit);
        s.win = fw.open({
          title: labTitle(prep.name),
          className: 'harpoon-lab-window',
          content: content,
          width: geom.w || 440,
          height: geom.h || 520,
          x: geom.x,
          y: geom.y,
          onGeometryChange: function () {
            if (global.BelJarWorkspaceState && global.BelJarWorkspaceState.scheduleSave) {
              global.BelJarWorkspaceState.scheduleSave();
            }
          },
          onClose: function () {
            s.userCancelled = true;
            removeFloatSession(s);
            s.unbindProbe();
            var proof = P();
            if (proof && proof.dispose) proof.dispose();
          },
        });
        floatSessions.push(s);
        if (global.BelJarWorkspaceState && global.BelJarWorkspaceState.scheduleSave) {
          global.BelJarWorkspaceState.scheduleSave();
        }
      },
    });
    return session;
  }

  function labTitle(name) {
    var wrap = document.createElement('span');
    wrap.className = 'harpoon-lab-title';
    if (global.BelJarHarpoonIcon) global.BelJarHarpoonIcon.appendGlyph(wrap, 'harpoon-lab-title-glyph');
    wrap.appendChild(el('span', 'harpoon-lab-title-text', name ? ('Harpoon \u00b7 ' + name) : 'Harpoon'));
    return wrap;
  }

  function proveInPanel(view, engine, hit, container, opts) {
    var ed = E();
    if (!ed) { toast('Harpoon unavailable.', 'error'); return; }
    opts = opts || {};
    var prep = prepareForHole(view, hit);
    if (!prep) {
      if (opts.onSessionEnd) opts.onSessionEnd();
      return;
    }
    return runSession(view, prep, {
      kind: 'panel',
      onSessionStart: opts.onSessionStart,
      onSessionEnd: opts.onSessionEnd,
      onDone: opts.onDone,
      onBack: opts.onBack,
      mount: function (content) { container.textContent = ''; container.appendChild(content); },
    });
  }

  function collectFloatingHarpoonWindows(fileId, out) {
    if (!out.floating) out.floating = [];
    for (var i = 0; i < floatSessions.length; i++) {
      var s = floatSessions[i];
      if (!s.win || !s.win.getGeometry || s.fileId !== fileId) continue;
      out.floating.push({
        id: 'harpoon:' + fileId + ':' + (s.declKey || i),
        kind: 'harpoon',
        geom: s.win.getGeometry(),
        fileId: fileId,
        anchor: { declKey: s.declKey, holeKey: s.holeKey },
        followEditor: false,
        zOrder: Number(s.win.el && s.win.el.style ? s.win.el.style.zIndex : 0) || 0,
      });
    }
  }

  function restoreFloatingHarpoonWindow(entry, view, engine) {
    if (!entry || entry.kind !== 'harpoon' || !view || !engine) return false;
    var hit = findHoleHit(view, engine, entry.anchor);
    if (!hit) return false;
    openFromHole(view, engine, hit, { geom: entry.geom });
    return true;
  }

  global.BelJarHarpoon = {
    openFromHole: openFromHole,
    proveInPanel: proveInPanel,
    collectFloatingHarpoonWindows: collectFloatingHarpoonWindows,
    restoreFloatingHarpoonWindow: restoreFloatingHarpoonWindow,
  };
})(typeof window !== 'undefined' ? window : self);
