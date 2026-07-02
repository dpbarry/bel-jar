'use strict';

(function (global) {
  function E() { return global.BelJarEditor || null; }

  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function curView() {
    var api = global.BelJarCurrentEditor;
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

  var bodyEl = null;
  var panelEl = null;
  var homeBtn = null;
  var proving = false;
  var backHandler = null;
  var provingDecl = null;
  var pendingProve = null;
  var computingKeys = {};

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
  }

  function exitProofMode() {
    proving = false;
    backHandler = null;
  }

  function declKeyForHit(view, hit) {
    var ed = E();
    if (!ed || !hit) return null;
    var span = ed.getDeclSpan ? ed.getDeclSpan(hit.from) : null;
    if (!span) return null;
    var decl = ed.parseDecl(view.state.doc.sliceString(span.from, span.to));
    if (!decl) return null;
    return decl.kw + ':' + decl.name;
  }

  function activeFileId() {
    var p = typeof global.BelJarPersist !== 'undefined' ? global.BelJarPersist : null;
    if (!p) return null;
    return typeof p.getActiveFileId === 'function' ? p.getActiveFileId() : null;
  }

  function activeFilePath() {
    var p = typeof global.BelJarPersist !== 'undefined' ? global.BelJarPersist : null;
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

  var CACHED_TIP = 'Cached from a previous check — not in the active development';
  var CACHED_HINT_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.75"/><rect x="11" y="10" width="2" height="7.5" rx="0.5" fill="currentColor" stroke="none"/><circle cx="12" cy="7.25" r="1.15" fill="currentColor" stroke="none"/></svg>';

  function cachedHintIcon() {
    var n;
    var ed = E();
    if (ed && typeof ed.createCachedGoalHintIcon === 'function') {
      n = ed.createCachedGoalHintIcon(CACHED_TIP);
    } else {
      n = el('span', 'bel-cached-hint');
      n.setAttribute('role', 'img');
      n.innerHTML = CACHED_HINT_SVG;
    }
    if (n && typeof Tooltips !== 'undefined' && typeof Tooltips.set === 'function') {
      Tooltips.set(n, CACHED_TIP);
    }
    if (n) {
      n.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
      n.addEventListener('click', function (ev) { ev.stopPropagation(); });
    }
    return n;
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
    var P = typeof global.BelJarPersist !== 'undefined' ? global.BelJarPersist : null;
    var PG = typeof global.BelJarHarpoonProjectGoals !== 'undefined'
      ? global.BelJarHarpoonProjectGoals : null;
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
          suiteHue: null,
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
    var PS = typeof global.BelJarProjectSource !== 'undefined' ? global.BelJarProjectSource : null;
    var SL = typeof global.BelJarExplorerSuiteLayout !== 'undefined' ? global.BelJarExplorerSuiteLayout : null;

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

  function buildRow(entry) {
    var hit = entry.hit;
    var key = entryKey(entry);
    var goalType = hit.hole.goal || null;
    var outOfScope = entry.inDevelopment === false;
    var computing = !!computingKeys[key];

    var row = el('div', 'harpoon-panel-hole');
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.dataset.entryKey = key;
    if (outOfScope && !goalType) row.classList.add('is-indeterminate');

    var head = el('div', 'harpoon-panel-hole-head');
    head.appendChild(el('span', 'harpoon-hole-mark', '?'));
    var loc = el('span', 'harpoon-hole-loc');
    var pathLabel = entry.fileBaseName || entry.filePath;
    if (pathLabel) loc.appendChild(el('span', 'harpoon-hole-path', pathLabel));
    loc.appendChild(el('span', 'harpoon-hole-ln', String(hit.hole.line)));
    head.appendChild(loc);

    var headEnd = el('div', 'harpoon-panel-hole-head-end');
    if (outOfScope && goalType) {
      var hint = cachedHintIcon();
      if (hint) headEnd.appendChild(hint);
    }
    if (entry.suiteLabel) {
      var suiteEl = el('span', 'harpoon-hole-suite');
      if (entry.suiteHue != null) suiteEl.style.setProperty('--suite-hue', String(entry.suiteHue));
      suiteEl.textContent = entry.suiteLabel;
      headEnd.appendChild(suiteEl);
    }
    if (headEnd.childNodes.length) head.appendChild(headEnd);
    row.appendChild(head);
    row.appendChild(el('div', 'harpoon-panel-hole-rule'));

    var goal = el('div', 'harpoon-hole-goal');
    if (goalType) {
      row.dataset.goalState = outOfScope ? 'cached' : 'ready';
      renderType(goal, goalType);
    } else if (computing) {
      row.classList.add('is-pending');
      row.dataset.goalState = 'computing';
      var sh0 = el('span', 'harpoon-hole-recalc beljar-tip-shimmer', 'Recalculating\u2026');
      var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      sh0.style.setProperty('--shimmer-pulse-delay', '-' + (t0 % 1400) + 'ms');
      sh0.style.setProperty('--shimmer-spin-delay', '-' + (t0 % 700) + 'ms');
      goal.appendChild(sh0);
    } else if (outOfScope) {
      row.classList.add('is-unfocused');
      row.dataset.goalState = 'inactive';
      goal.appendChild(el('span', 'harpoon-hole-unfocused', 'Out of scope: click to compute'));
    } else {
      row.classList.add('is-pending');
      row.dataset.goalState = 'pending';
      var sh = el('span', 'harpoon-hole-recalc beljar-tip-shimmer', 'Recalculating\u2026');
      var t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      sh.style.setProperty('--shimmer-pulse-delay', '-' + (t % 1400) + 'ms');
      sh.style.setProperty('--shimmer-spin-delay', '-' + (t % 700) + 'ms');
      goal.appendChild(sh);
    }
    row.appendChild(goal);

    row.addEventListener('click', function (ev) {
      if (ev.target.closest('.bel-cached-hint')) return;
      if (ev.ctrlKey || ev.metaKey) {
        ev.preventDefault();
        jumpToEntry(entry);
        return;
      }
      if (outOfScope && !goalType && !computing) {
        computeEntry(entry, key);
        return;
      }
      proveEntry(entry);
    });
    row.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      if (ev.target.closest('.bel-cached-hint')) return;
      ev.preventDefault();
      if (outOfScope && !goalType && !computing) computeEntry(entry, key);
      else proveEntry(entry);
    });
    return row;
  }

  function computeEntry(entry, key) {
    if (computingKeys[key]) return;
    var ed = E();
    var view = curView();
    if (!ed || typeof ed.computeHoleGoalOnDemand !== 'function') return;
    computingKeys[key] = true;
    renderList();
    ed.computeHoleGoalOnDemand(view, entry.fileId, entry.hit.hole.line, entry.hit.hole.col || 1)
      .then(function (hole) {
        delete computingKeys[key];
        renderList();
      })
      .catch(function () {
        delete computingKeys[key];
        renderList();
      });
  }

  function renderList() {
    if (!bodyEl) return;
    exitProofMode();
    var model = collectProjectSections();

    if (!model.totalCount) {
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
  }

  function proveHit(view, eng, hit, fileId) {
    var lab = global.BelJarHarpoon;
    if (!lab || typeof lab.proveInPanel !== 'function') return;

    proving = true;
    var dk = declKeyForHit(view, hit);
    var fid = fileId || activeFileId();
    if (dk && fid) provingDecl = { fileId: fid, declKey: dk };
    if (global.BelJarWorkspaceState && global.BelJarWorkspaceState.scheduleSave) {
      global.BelJarWorkspaceState.scheduleSave();
    }
    bodyEl.textContent = '';
    var host = el('div', 'harpoon-panel-session');
    bodyEl.appendChild(host);

    backHandler = function () {
      var proof = global.BelJarHarpoonEngine;
      if (proof && proof.dispose) proof.dispose();
      provingDecl = null;
      renderList();
    };

    lab.proveInPanel(view, eng, hit, host, {
      onSessionStart: function () { enterProofMode(); },
      onSessionEnd: function () { provingDecl = null; renderList(); },
      onBack: backHandler,
      onDone: function () { provingDecl = null; renderList(); },
    });
  }

  function proveEntry(entry) {
    var fid = entry.fileId;
    if (fid !== activeFileId()) {
      pendingProve = {
        fileId: fid,
        line: entry.hit.hole.line,
        col: entry.hit.hole.col || 1,
      };
      window.dispatchEvent(new CustomEvent('beljar:open-file-at', {
        detail: {
          fileId: fid,
          from: entry.hit.from,
          to: entry.hit.to,
          line: entry.hit.hole.line,
          col: entry.hit.hole.col,
        },
      }));
      return;
    }
    var view = curView();
    var api = global.BelJarCurrentEditor;
    var eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
    if (view && eng) proveHit(view, eng, entry.hit, fid);
  }

  function tryPendingProve() {
    if (!pendingProve || proving) return;
    if (pendingProve.fileId !== activeFileId()) return;
    var view = curView();
    var api = global.BelJarCurrentEditor;
    var eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
    if (!view || !eng) return;
    var hits = activeSyntacticHits(view);
    var hit = null;
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i].hole;
      if (h.line === pendingProve.line && (h.col || 1) === pendingProve.col) {
        hit = hits[i];
        break;
      }
    }
    if (!hit) return;
    var fid = pendingProve.fileId;
    pendingProve = null;
    proveHit(view, eng, hit, fid);
  }

  function init(container, opts) {
    bodyEl = container;
    panelEl = (opts && opts.panelEl) || container.closest('.harpoon-panel');
    if (panelEl) {
      homeBtn = panelEl.querySelector('.harpoon-panel-home');
      if (homeBtn) {
        homeBtn.addEventListener('click', function (e) {
          e.preventDefault();
          pendingProve = null;
          if (backHandler) backHandler();
          else renderList();
        });
      }
    }
    renderList();
  }

  function refresh() {
    if (bodyEl && !proving) {
      renderList();
      tryPendingProve();
    }
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
    var lab = global.BelJarHarpoon;
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

  global.BelJarHarpoonPanel = {
    init: init,
    refresh: refresh,
    collectWorkspaceHarpoon: collectWorkspaceHarpoon,
    restoreWorkspaceHarpoon: restoreWorkspaceHarpoon,
  };
})(typeof window !== 'undefined' ? window : self);
