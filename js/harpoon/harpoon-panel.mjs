const global = globalThis;
function E() { return global.BelEditor || null; }

  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function curView() {
    var api = global.CurrentEditor;
    return api && typeof api.getView === 'function' ? api.getView() : null;
  }

  function activeSyntacticHits(view) {
    var ed = E();
    if (!view || !ed || typeof ed.scanFileHoles !== 'function') return [];
    return ed.scanFileHoles(view.state.doc.toString()).map(function (h) {
      return { hole: h, from: h.from, to: h.to };
    });
  }

  function normalizeGlyphs(text) {
    var g = global.HarpoonGlyphs;
    if (g) return g.fallbackNormalize(text);
    return String(text == null ? '' : text)
      .replace(/\|-#/g, '⊢#')
      .replace(/\|-/g, '⊢')
      .replace(/=>/g, '⇒')
      .replace(/->/g, '→');
  }

  function displayType(typeStr) {
    var g = global.HarpoonGlyphs;
    if (g) return g.displayBeluga(typeStr);
    var ed = E();
    if (ed && typeof ed.normalizeType === 'function') return ed.normalizeType(typeStr);
    return normalizeGlyphs(typeStr);
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

  // "suite: <name>" — the key in the cfg/suite green, the name plain; no suite reads "(none)".
  function setSuiteTip(host, label) {
    var name = label || '(none)';
    var tips = global.Tooltips;
    if (tips && typeof tips.setRich === 'function') {
      tips.setRich(host, function () {
        // One row element: the rich tooltip body is a flex COLUMN, so sibling
        // spans would stack into two lines.
        var row = el('span', 'harpoon-tip-suite');
        row.appendChild(el('span', 'harpoon-tip-suite-key', 'Suite:'));
        row.appendChild(el('span', 'harpoon-tip-suite-name', name));
        return row;
      }, 'Suite: ' + name);
      return;
    }
    if (tips && typeof tips.set === 'function') tips.set(host, 'Suite: ' + name);
  }

  var bodyEl = null;
  var panelEl = null;
  var backBtn = null;
  var proving = false;
  var backHandler = null;
  var provingDecl = null;
  var panelSession = null;
  var lastListRenderKey = '';

  function goalRenderToken(goal, goalState, loadingLive) {
    var st = goalState || '';
    // In-dev approximate/rechecking still await Beluga — collapse those to one
    // token so the row doesn't thrash. Out-of-dev approximate is final display.
    if (loadingLive && (st === 'approximate' || st === 'rechecking' || st === 'pending')) {
      st = 'loading';
    } else if (st === 'pending') {
      st = 'loading';
    }
    var g = goal || '';
    if (g) g = displayType(g).replace(/\s+/g, '');
    return st + ':' + g;
  }

  function modelRenderKey(model) {
    if (!model || !model.totalCount) return '';
    var parts = [String(model.totalCount)];
    for (var si = 0; si < model.sections.length; si++) {
      var sec = model.sections[si];
      for (var ei = 0; ei < sec.entries.length; ei++) {
        var entry = sec.entries[ei];
        var hit = entry.hit;
        var h = hit.hole;
        var key = entryKey(entry);
        parts.push([
          key,
          entry.inDevelopment === false ? '0' : '1',
          goalRenderToken(h.goal, h.goalState, h.loadingLive),
        ].join(':'));
      }
    }
    return parts.join('|');
  }

  function jumpToEntry(entry) {
    var hit = entry.hit;
    var from = hit.from != null ? hit.from : hit.hole.from;
    if (from == null) return;
    var to = hit.to != null ? hit.to : (hit.hole.to != null ? hit.hole.to : from + 1);
    window.dispatchEvent(new CustomEvent('beljar:open-file-at', {
      detail: {
        fileId: entry.fileId,
        from: from,
        to: to,
        line: hit.hole.line,
        col: hit.hole.col,
      },
    }));
  }

  function enterProofMode() {
    proving = true;
    if (backBtn) backBtn.hidden = false;
  }

  function exitProofMode() {
    proving = false;
    backHandler = null;
    if (backBtn) backBtn.hidden = true;
  }

  function declKeyForHit(view, hit) {
    var ed = E();
    var api = global.CurrentEditor;
    if (!hit) return null;
    var span = null;
    if (api && api.getMemberSpan) span = api.getMemberSpan(hit.from);
    else if (api && api.getDeclSpan) span = api.getDeclSpan(hit.from);
    else if (ed && ed.getMemberSpan) span = ed.getMemberSpan(hit.from);
    else if (ed && ed.getDeclSpan) span = ed.getDeclSpan(hit.from);
    if (!span) return null;
    var decl = ed && ed.parseDecl ? ed.parseDecl(view.state.doc.sliceString(span.from, span.to)) : null;
    if (!decl) return null;
    return decl.kw + ':' + decl.name;
  }

  function activeFileId() {
    var p = typeof global.Persist !== 'undefined' ? global.Persist : null;
    if (!p) return null;
    return typeof p.getActiveFileId === 'function' ? p.getActiveFileId() : null;
  }

  function activeFilePath() {
    var p = typeof global.Persist !== 'undefined' ? global.Persist : null;
    if (!p) return '';
    var id = typeof p.getActiveFileId === 'function' ? p.getActiveFileId()
      : (typeof p.getCurrentFileId === 'function' ? p.getCurrentFileId() : null);
    if (!id || typeof p.getFileById !== 'function') return '';
    var f = p.getFileById(id);
    return f && f.name ? f.name : '';
  }

  function holeKey(hit) {
    return hit.hole.line + ':' + (hit.hole.col || 1) + ':' + (hit.hole.name || '');
  }

  function entryKey(entry) {
    return entry.fileId + ':' + holeKey(entry.hit);
  }

  // `mountHoleGoalTier` marks the element it mounts INTO, which is now the sliding track,
  // while the card's rules key off the window. Mirror the marker up one level rather than
  // rewriting every `--tiered` selector to reach through the track.
  function mirrorTierClass(win) {
    var track = trackOf(win);
    win.classList.toggle('harpoon-hole-goal--tiered',
      !!track && track.classList.contains('harpoon-hole-goal--tiered'));
  }

  function mountTieredGoal(goalEl, goalState, goalType) {
    var ed = E();
    if (ed && typeof ed.mountHoleGoalTier === 'function') {
      ed.mountHoleGoalTier(goalEl, {
        surface: 'harpoon-card',
        goalState: goalState,
        goal: goalType,
      });
      return;
    }
    goalEl.appendChild(el('span', 'harpoon-hole-recalc beljar-tip-shimmer', 'Recalculating\u2026'));
  }

  function applyGoalStateToModel(model, view) {
    var ed = E();
    var api = global.CurrentEditor;
    var eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
    var P = typeof global.Persist !== 'undefined' ? global.Persist : null;
    if (!ed || typeof ed.enrichHoleHitsWithGoalState !== 'function' || !view) return model;
    var activeId = activeFileId();
    var getText = P && typeof P.getFileText === 'function'
      ? function (id) { return P.getFileText(id); }
      : function () { return ''; };
    for (var si = 0; si < model.sections.length; si++) {
      var sec = model.sections[si];
      for (var ei = 0; ei < sec.entries.length; ei++) {
        var entry = sec.entries[ei];
        var enriched = ed.enrichHoleHitsWithGoalState(view, [entry.hit], entry.filePath, eng, {
          fileId: entry.fileId,
          isActiveFile: entry.fileId === activeId,
          inDevelopment: entry.inDevelopment !== false,
          fileText: String(getText(entry.fileId) ?? ''),
        });
        entry.hit = enriched[0];
      }
    }
    return model;
  }

  function maybeCertifyVisibleGoals(model, view) {
    var ed = E();
    if (!ed || typeof ed.scheduleCertifyHoleGoalsScoped !== 'function' || !view) return;
    var activeId = activeFileId();
    var hits = [];
    for (var si = 0; si < model.sections.length; si++) {
      var sec = model.sections[si];
      for (var ei = 0; ei < sec.entries.length; ei++) {
        var entry = sec.entries[ei];
        if (entry.fileId !== activeId || entry.inDevelopment === false) continue;
        hits.push(entry.hit);
      }
    }
    if (hits.length) ed.scheduleCertifyHoleGoalsScoped(view, hits);
  }

  function mergeHitGoal(hit, richHoles) {
    if (!richHoles || !richHoles.length || !hit) return hit;
    var byPos = {};
    for (var i = 0; i < richHoles.length; i++) {
      byPos[richHoles[i].line + ':' + richHoles[i].col] = richHoles[i];
    }
    var rh = byPos[hit.hole.line + ':' + hit.hole.col];
    if (!rh || !rh.goal) return hit;
    return {
      hole: Object.assign({}, hit.hole, {
        goal: rh.goal,
        ctx: rh.ctx || [],
        meta: rh.meta || [],
      }),
      from: hit.from,
      to: hit.to,
    };
  }

  function collectInScopeHoleGoals() {
    var ed = E();
    var view = curView();
    if (ed && typeof ed.freshHoleGoalsForDevelopment === 'function' && view) {
      return ed.freshHoleGoalsForDevelopment(view) || {};
    }
    return {};
  }

  function enrichOutOfScopeEntry(entry, view) {
    if (entry.inDevelopment !== false || entry.hit.hole.goal) return entry;
    var ed = E();
    if (!ed || typeof ed.freshHoleGoalsForFile !== 'function' || !view) return entry;
    var extra = ed.freshHoleGoalsForFile(view, entry.fileId) || {};
    var rich = extra[entry.filePath];
    if (!rich) return entry;
    return Object.assign({}, entry, { hit: mergeHitGoal(entry.hit, rich) });
  }

  function collectProjectSections() {
    var P = typeof global.Persist !== 'undefined' ? global.Persist : null;
    var PG = typeof global.HarpoonGoalSections !== 'undefined'
      ? global.HarpoonGoalSections : null;
    var holeGoals = collectInScopeHoleGoals();
    var view = curView();
    var ed = E();
    var devPaths = ed && typeof ed.developmentMemberPaths === 'function' && view
      ? ed.developmentMemberPaths(view)
      : null;

    if (!P || !PG || typeof PG.buildSections !== 'function') {
      var fp = activeFilePath();
      var hits = activeSyntacticHits(view);
      if (holeGoals[fp]) {
        hits = hits.map(function (hit) { return mergeHitGoal(hit, holeGoals[fp]); });
      }
      if (!hits.length) return { sections: [], totalCount: 0 };
      return {
        sections: [{
          id: 'active',
          label: '',
          entries: hits.map(function (hit) {
            return {
              fileId: activeFileId(),
              filePath: fp,
              fileBaseName: fp,
              inDevelopment: true,
              hit: hit,
            };
          }),
        }],
        totalCount: hits.length,
      };
    }

    var files = typeof P.listFiles === 'function' ? P.listFiles() : [];
    var getText = typeof P.getFileText === 'function' ? function (id) { return P.getFileText(id); } : function () { return ''; };
    var PS = typeof global.ProjectSource !== 'undefined' ? global.ProjectSource : null;
    var SL = typeof global.ExplorerSuiteLayout !== 'undefined' ? global.ExplorerSuiteLayout : null;

    var model = PG.buildSections({
      files: files,
      getText: getText,
      activeFileId: activeFileId(),
      activeHits: activeSyntacticHits(view),
      memberHoles: holeGoals,
      developmentPaths: devPaths,
      getActiveCfgsForDir: typeof P.getActiveCfgsForDir === 'function'
        ? function (dir) { return P.getActiveCfgsForDir(dir); }
        : function () { return []; },
      computeDirLayout: SL && typeof SL.computeDirLayout === 'function' && PS
        ? function (dir, filesInDir) {
          var active = P.getActiveCfgsForDir(dir);
          var resolver = typeof PS.orderedPathsForCfg === 'function'
            ? function (all, cfgPath, gt) { return PS.orderedPathsForCfg(all, cfgPath, gt); }
            : null;
          return SL.computeDirLayout(filesInDir, active, resolver, files, getText);
        }
        : null,
    });

    for (var si = 0; si < model.sections.length; si++) {
      var sec = model.sections[si];
      for (var ei = 0; ei < sec.entries.length; ei++) {
        sec.entries[ei] = enrichOutOfScopeEntry(sec.entries[ei], view);
      }
    }
    return model;
  }

  // ── The declaration a hole sits in ──────────────────────────────────────────
  // The card header names the theorem being proved, not just the file, so a list of
  // holes reads as a list of OBLIGATIONS. `declKeyForHit` cannot serve here: it needs a
  // live view and therefore only answers for the active file, while this panel lists
  // holes across the whole project.
  // Scanning the file text upward from the hole is enough and works everywhere. `and`
  // is included because a mutual block continues a declaration, and a hole inside one
  // belongs to the arm it sits under, not to the block head.
  var DECL_LINE = /^[ \t]*(rec|proof|and)[ \t]+([^\s:(){}\[\],]+)[ \t]*:/;
  var declTextCache = Object.create(null);

  function fileTextFor(fileId) {
    if (fileId in declTextCache) return declTextCache[fileId];
    var P = typeof global.Persist !== 'undefined' ? global.Persist : null;
    var t = null;
    try { t = P && typeof P.getFileText === 'function' ? P.getFileText(fileId) : null; } catch (_) { t = null; }
    declTextCache[fileId] = t == null ? null : String(t);
    return declTextCache[fileId];
  }

  /** `{ kw, name }` for the declaration enclosing this hole, or null. */
  function declForEntry(entry) {
    var line = entry && entry.hit && entry.hit.hole && entry.hit.hole.line;
    if (!line) return null;
    var text = fileTextFor(entry.fileId);
    if (!text) return null;
    var lines = text.split(/\r?\n/);
    // `hole.line` is 1-based; start at the hole's own line so a one-line declaration
    // is found, then walk back to the nearest head above it.
    for (var i = Math.min(line, lines.length) - 1; i >= 0; i -= 1) {
      var m = DECL_LINE.exec(lines[i]);
      if (m) return { kw: m[1], name: m[2] };
    }
    return null;
  }

  // ── Clip and slide ──────────────────────────────────────────────────────────
  // Overflow is track (content-sized) minus mask (the visible viewport). Measuring
  // against the WINDOW would include its padding and under-slide the tail; measuring
  // a shrinking track reports ~0 overflow, so the fade never appears.

  function maskOf(win) {
    return win && win.firstElementChild;
  }

  function trackOf(win) {
    var mask = maskOf(win);
    return mask ? mask.firstElementChild : null;
  }

  /** Overflow in px, or -1 when the card cannot be measured yet (panel hidden). */
  function readOver(win) {
    var mask = maskOf(win);
    var track = trackOf(win);
    if (!mask || !track || !mask.clientWidth) return -1;
    return Math.max(0, Math.round(track.scrollWidth - mask.clientWidth));
  }

  function applyOver(win, over) {
    if (over < 0) return;
    win.dataset.measured = '1';
    if (over <= 1) {
      if (!win.classList.contains('is-clipped')) return;
      win.classList.remove('is-clipped');
      win.style.removeProperty('--slide');
      win.style.removeProperty('--slide-ms');
      return;
    }
    var slide = '-' + over + 'px';
    var ms = Math.min(2800, Math.max(500, Math.round(over * 6))) + 'ms';
    if (win.style.getPropertyValue('--slide').trim() === slide
        && win.style.getPropertyValue('--slide-ms').trim() === ms
        && win.classList.contains('is-clipped')) return;
    win.classList.add('is-clipped');
    win.style.setProperty('--slide', slide);
    win.style.setProperty('--slide-ms', ms);
  }

  function markClipped(root) {
    if (!root) return;
    var wins = root.querySelectorAll('.harpoon-hole-goal');
    var over = [];
    for (var i = 0; i < wins.length; i++) over.push(readOver(wins[i]));
    for (var j = 0; j < wins.length; j++) applyOver(wins[j], over[j]);
  }

  var clipObs = null;
  var clipRoot = null;

  function scheduleMarkClipped(root) {
    clipRoot = root;
    markClipped(root);
    requestAnimationFrame(function () {
      if (clipRoot !== root || !root.isConnected) return;
      markClipped(root);
      requestAnimationFrame(function () {
        if (clipRoot === root && root.isConnected) markClipped(root);
      });
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        if (clipRoot === root && root.isConnected) markClipped(root);
      });
    }
    if (typeof ResizeObserver === 'undefined') return;
    if (clipObs) clipObs.disconnect();
    clipObs = new ResizeObserver(function () { markClipped(root); });
    clipObs.observe(root);
    var tracks = root.querySelectorAll('.harpoon-hole-goal-track');
    for (var i = 0; i < tracks.length; i++) clipObs.observe(tracks[i]);
  }

  function buildRow(entry) {
    var hit = entry.hit;
    var key = entryKey(entry);
    var goalType = hit.hole.goal || null;
    var goalState = hit.hole.goalState || (goalType ? 'live' : 'pending');
    var loadingLive = !!hit.hole.loadingLive;
    var outOfScope = entry.inDevelopment === false;
    var tiered = !outOfScope && loadingLive
      && (goalState === 'pending' || goalState === 'approximate' || goalState === 'rechecking');
    var showType = !!(goalType && (
      goalState === 'live'
      || goalState === 'cached'
      || (outOfScope && goalState === 'approximate')
    ));

    var row = el('div', 'harpoon-panel-hole');
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.dataset.entryKey = key;
    if (outOfScope && !goalType) row.classList.add('is-indeterminate');

    var head = el('div', 'harpoon-panel-hole-head');

    // Left: the obligation. Syntax-coloured so it reads as Beluga source, matching the
    // corner label the hole box shows mid-proof.
    var decl = declForEntry(entry);
    var declEl = el('span', 'harpoon-hole-decl');
    if (decl) {
      declEl.appendChild(el('span', 'harpoon-hole-decl-kw bel-hl-keyword', decl.kw));
      declEl.appendChild(el('span', 'harpoon-hole-decl-name bel-hl-var-def', decl.name));
    } else {
      declEl.classList.add('is-unknown');
      declEl.appendChild(el('span', 'harpoon-hole-decl-name', 'top level'));
    }
    head.appendChild(declEl);

    // Right: where it lives. Both fields ellipsis instead of wrapping, so the strip is
    // always exactly one line tall whatever the names are.
    var loc = el('span', 'harpoon-hole-loc');
    var pathLabel = entry.fileBaseName || entry.filePath;
    if (pathLabel) loc.appendChild(el('span', 'harpoon-hole-path', pathLabel));
    loc.appendChild(el('span', 'harpoon-hole-ln', String(hit.hole.line)));
    // Sections group by DIRECTORY, so the suite is NOT recoverable from the section header:
    // it hangs off the location field — the one place on the card that already answers
    // "where does this live" — keyed so an absent suite reads as an answer, not a gap.
    setSuiteTip(loc, entry.suiteLabel);
    head.appendChild(loc);

    row.appendChild(head);
    row.appendChild(el('div', 'harpoon-panel-hole-rule'));

    // Three nested elements, each with one job:
    //   window  clips, and carries the goal band's padding and background
    //   mask    carries the edge fade, and never moves
    //   track   holds the type, and is what slides
    // The fade cannot live on the window: a mask applies to an element's BACKGROUND as
    // well as its text, so the band itself would fade out at the right edge on exactly the
    // long-type cards and not the short ones. It cannot live on the track either, since a
    // mask on the track would travel with the text it is meant to fade.
    var goal = el('div', 'harpoon-hole-goal');
    var goalMask = el('div', 'harpoon-hole-goal-mask');
    var goalInner = el('div', 'harpoon-hole-goal-track');
    goalMask.appendChild(goalInner);
    goal.appendChild(goalMask);
    if (showType) {
      row.dataset.goalState = outOfScope
        ? (goalState === 'approximate' ? 'approximate' : 'cached')
        : 'ready';
      var edLive = E();
      if (edLive && typeof edLive.mountHoleGoalTier === 'function') {
        edLive.mountHoleGoalTier(goalInner, {
          surface: 'harpoon-card',
          goalState: 'live',
          goal: goalType,
        });
      } else {
        renderType(goalInner, goalType);
      }
    } else if (tiered) {
      row.classList.add('is-pending');
      row.dataset.goalState = goalState;
      mountTieredGoal(goalInner, goalState, goalType);
    } else if (outOfScope) {
      row.classList.add('is-unfocused');
      row.dataset.goalState = 'inactive';
      goalInner.appendChild(el('span', 'harpoon-hole-unfocused', 'Not computable outside scope'));
    } else {
      row.classList.add('is-pending');
      row.dataset.goalState = 'pending';
      mountTieredGoal(goalInner, 'pending', null);
    }
    mirrorTierClass(goal);
    row.appendChild(goal);

    // Safety net for a list built while the panel was hidden: every width reads as 0 then,
    // so the batched pass could not classify this card. One card on enter is cheap.
    row.addEventListener('pointerenter', function () {
      applyOver(goal, readOver(goal));
    });

    row.addEventListener('click', function (ev) {
      if (ev.ctrlKey || ev.metaKey) {
        ev.preventDefault();
        jumpToEntry(entry);
        return;
      }
      proveEntry(entry);
    });
    row.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      proveEntry(entry);
    });
    return row;
  }

  function renderList(opts) {
    if (!bodyEl) return;
    exitProofMode();
    var view = curView();
    // File text is cached only for the span of one render; it is stale by the next one.
    declTextCache = Object.create(null);
    var model = collectProjectSections();
    applyGoalStateToModel(model, view);
    if (opts && opts.certify) maybeCertifyVisibleGoals(model, view);

    var renderKey = modelRenderKey(model);
    if (model.totalCount && renderKey === lastListRenderKey && bodyEl.querySelector('.harpoon-panel-list')) return;
    lastListRenderKey = renderKey;

    if (!model.totalCount) {
      if (clipObs) { clipObs.disconnect(); clipObs = null; }
      clipRoot = null;
      bodyEl.textContent = '';
      var empty = el('div', 'panel-empty');
      empty.appendChild(el('p', 'panel-empty__note', 'No open goals in this project.'));
      bodyEl.appendChild(empty);
      return;
    }

    bodyEl.textContent = '';
    var root = el('div', 'harpoon-panel-list');
    for (var si = 0; si < model.sections.length; si++) {
      var sec = model.sections[si];
      var block = el('div', 'harpoon-panel-suite');
      if (sec.label) {
        var lbl = el('div', 'harpoon-panel-suite-label');
        var isDev = sec.entries.some(function (e) { return e.inDevelopment !== false; });
        if (isDev) lbl.classList.add('is-active-dev');
        lbl.textContent = sec.label;
        block.appendChild(lbl);
      }
      var secList = el('div', 'harpoon-panel-section');
      for (var ei = 0; ei < sec.entries.length; ei++) {
        secList.appendChild(buildRow(sec.entries[ei]));
      }
      block.appendChild(secList);
      root.appendChild(block);
    }
    bodyEl.appendChild(root);
    scheduleMarkClipped(root);
  }

  function beginPanelSession(fileId, declKey, start) {
    enterProofMode();
    if (declKey && fileId) provingDecl = { fileId: fileId, declKey: declKey };
    if (global.WorkspaceState && global.WorkspaceState.scheduleSave) {
      global.WorkspaceState.scheduleSave();
    }
    bodyEl.textContent = '';
    var host = el('div', 'harpoon-panel-session');
    bodyEl.appendChild(host);

    backHandler = function () {
      if (panelSession && typeof panelSession.disposeSession === 'function') {
        panelSession.disposeSession();
        panelSession = null;
        return;
      }
      var proof = global.HarpoonEngine;
      if (proof && proof.dispose) proof.dispose();
      provingDecl = null;
      renderList();
    };

    panelSession = start(host, {
      onSessionStart: function () { enterProofMode(); },
      onSessionEnd: function () { panelSession = null; provingDecl = null; renderList(); },
      onBack: backHandler,
      onDone: function () { panelSession = null; provingDecl = null; renderList(); },
    });
  }

  function proveHit(view, eng, hit, fileId) {
    var lab = global.Harpoon;
    if (!lab || typeof lab.proveInPanel !== 'function') return;
    var fid = fileId || activeFileId();
    beginPanelSession(fid, declKeyForHit(view, hit), function (host, opts) {
      return lab.proveInPanel(view, eng, hit, host, opts);
    });
  }

  function declKeyInFileText(fileId, from) {
    var ed = E();
    var P = global.Persist;
    if (!ed || !P || typeof ed.declSpanInText !== 'function') return null;
    var text = String(P.getFileText(fileId) || '');
    var span = ed.memberSpanInText
      ? ed.memberSpanInText(text, from)
      : ed.declSpanInText(text, from);
    var decl = span ? ed.parseDecl(text.slice(span.from, span.to)) : null;
    return decl ? decl.kw + ':' + decl.name : null;
  }

  function proveEntry(entry) {
    var fid = entry.fileId;
    var lab = global.Harpoon;
    if (fid !== activeFileId()) {
      // Solve in place — no file switch. The session runs against the file's
      // stored text; commit navigates when the proof is placed.
      if (!lab || typeof lab.proveInPanelForFile !== 'function') return;
      beginPanelSession(fid, declKeyInFileText(fid, entry.hit.from), function (host, opts) {
        return lab.proveInPanelForFile(fid, entry.hit, host, opts);
      });
      return;
    }
    var view = curView();
    var api = global.CurrentEditor;
    var eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
    if (view && eng) proveHit(view, eng, entry.hit, fid);
  }

  function init(container, opts) {
    bodyEl = container;
    panelEl = (opts && opts.panelEl) || container.closest('.harpoon-panel');
    if (panelEl) {
      backBtn = panelEl.querySelector('.harpoon-panel-back');
      if (backBtn) {
        backBtn.addEventListener('click', function (e) {
          e.preventDefault();
          if (backHandler) backHandler();
          else renderList();
        });
      }
    }
    renderList({ certify: true });
  }

  function refresh() {
    if (bodyEl && !proving) renderList({ certify: true });
  }

  function collectWorkspaceHarpoon(out) {
    if (!out.sidebar) return;
    out.sidebar.harpoon = { provingDecl: proving && provingDecl ? provingDecl : null };
  }

  function restoreWorkspaceHarpoon(sidebar, deps) {
    if (!sidebar || !sidebar.harpoon || !sidebar.harpoon.provingDecl) return;
    var decl = sidebar.harpoon.provingDecl;
    var view = deps && deps.view;
    var eng = deps && deps.engine;
    if (!view || !eng) return;
    if (decl.fileId && decl.fileId !== activeFileId()) return;
    var lab = global.Harpoon;
    if (!lab) return;
    var hit = null;
    if (typeof lab.restoreFloatingHarpoonWindow === 'function') {
      var doc = view.state.doc;
      var holes = eng.getHoles ? eng.getHoles() : [];
      for (var i = 0; i < holes.length; i++) {
        var h = holes[i];
        if (!h || h.line < 1 || h.line > doc.lines) continue;
        var off = doc.line(h.line).from + Math.max(0, (h.col || 1) - 1);
        if (off >= doc.length || doc.sliceString(off, off + 1) !== '?') continue;
        var candidate = { hole: h, from: off, to: off + 1 };
        if (declKeyForHit(view, candidate) === decl.declKey) { hit = candidate; break; }
      }
    }
    if (hit) proveHit(view, eng, hit, decl.fileId);
  }

  global.HarpoonPanel = {
    init: init,
    refresh: refresh,
    collectWorkspaceHarpoon: collectWorkspaceHarpoon,
    restoreWorkspaceHarpoon: restoreWorkspaceHarpoon,
  };
  global.BelJarHarpoonPanel = global.HarpoonPanel;
