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
  function iconBtn(className, svg, label, tip, onClick, disabled) {
    var b = el('button', className);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    if (tip) {
      b.setAttribute('data-tooltip', tip);
      if (global.Tooltips && global.Tooltips.bind) global.Tooltips.bind(b);
    }
    if (disabled) b.disabled = true;
    b.innerHTML = svg;
    b.addEventListener('click', function (e) { e.preventDefault(); if (!b.disabled) onClick(); });
    return b;
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

  function appendAutoGoalHero(parent, goalType, declName) {
    var wrap = el('div', 'harpoon-lab-auto-goal');
    var glabel = el('div', 'harpoon-lab-goal-label');
    glabel.appendChild(el('span', 'harpoon-lab-goal-label-text', 'Goal'));
    if (declName) glabel.appendChild(el('span', 'harpoon-lab-auto-goal-name', declName));
    wrap.appendChild(glabel);
    var goal = el('div', 'harpoon-hole-goal harpoon-lab-goal-type harpoon-lab-auto-goal-type');
    renderType(goal, goalType);
    wrap.appendChild(goal);
    parent.appendChild(wrap);
    return wrap;
  }

  function appendAutoSolution(parent, body) {
    var wrap = el('div', 'harpoon-lab-auto-solution');
    wrap.appendChild(el('span', 'harpoon-lab-auto-solution-label', 'Solution'));
    var bodyEl = el('div', 'harpoon-lab-auto-solution-body');
    renderSource(bodyEl, body);
    wrap.appendChild(bodyEl);
    parent.appendChild(wrap);
    return wrap;
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
  }

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
    // Prove on the assembled rec-form program (suite prelude included). The
    // proof-form transform is for OCaml Harpoon only — Beluga does not emit hole
    // reports for `proof … = ?`, which made proveProgram falsely "complete".
    var declText = prep.assembledCode.slice(prep.assembledDeclFrom, prep.assembledDeclTo);
    var thm = ed.theoremUnderProof(declText);
    if (!thm) {
      toast('BelJar auto-solve could not read this theorem.', 'error');
      return Promise.resolve(false);
    }
    // Search on a minimal program (prelude + this theorem only) — same shape as
    // prover-probes. Full assembled code is kept for commit re-check only.
    var proveCode = prep.proveCode || prep.assembledCode;
    this.clearNativeAutoShell();
    this.nativeAuto = {
      phase: 'searching',
      steps: [],
      stuck: null,
      complete: false,
      paused: false,
      goalType: thm.compType && thm.compType.raw ? thm.compType.raw : '',
      declName: thm.name || (this.prep && this.prep.name) || '',
      searchLabel: 'Checking…',
    };
    this.render();
    var warm = (client.loadChecker && proveCode) ? client.loadChecker(proveCode) : Promise.resolve();
    return warm.then(function () {
      return ed.proveProgram(proveCode, thm, function (code) {
        return client.checkResult(code);
      }, {
        maxSteps: 120,
        shouldPause: function () { return !!(self.nativeAuto && self.nativeAuto.paused); },
        onPulse: function (pulse) {
          if (!self.nativeAuto || self.nativeAuto.paused) return;
          if (pulse.trying) self.nativeAuto.searchLabel = 'Trying ' + pulse.trying + '…';
          else if (pulse.label) self.nativeAuto.searchLabel = pulse.label;
          self.updateNativeAutoSearch();
        },
        onStep: function (info) {
          if (!self.nativeAuto) return;
          self.nativeAuto.steps = info.steps || [];
          if (!self.nativeAuto.paused) {
            self.nativeAuto.searchLabel = 'Step ' + self.nativeAuto.steps.length
              + (info.last && info.last.move ? (' · ' + info.last.move) : '');
          }
          self.updateNativeAutoSearch();
        },
      });
    }).then(function (r) {
      self.nativeAuto = {
        phase: r && r.complete ? 'solved' : 'stuck',
        steps: (r && r.steps) || [],
        stuck: (r && r.stuck) || null,
        complete: !!(r && r.complete),
        code: r && r.code,
        goalType: self.nativeAuto && self.nativeAuto.goalType,
        declName: self.nativeAuto && self.nativeAuto.declName,
        hadLiveTrail: !!(self.nativeAuto && self.nativeAuto.steps && self.nativeAuto.steps.length),
      };
      // Act II — reveal the derivation, THEN (if solved) offer to place it. The
      // commit is deferred to a user action on the solved strip, so the reveal is
      // seen and the placement feels earned (never a silent auto-commit).
      self.render();
      return !!(r && r.complete);
    }).catch(function (err) {
      var cancelled = client.isCancelledError && client.isCancelledError(err);
      if (cancelled && self.nativeAuto && self.nativeAuto.paused) return false;
      self.nativeAuto = {
        phase: 'stuck',
        steps: (self.nativeAuto && self.nativeAuto.steps) || [],
        complete: false,
        goalType: self.nativeAuto && self.nativeAuto.goalType,
        declName: self.nativeAuto && self.nativeAuto.declName,
        stuck: cancelled ? { reason: 'cancelled' } : { reason: err && err.message ? err.message : String(err) },
      };
      self.render();
      return false;
    });
  };

  // Place the auto-solved body into the file (the deferred commit from Act II).
  Session.prototype.commitNativeAuto = function () {
    var na = this.nativeAuto;
    if (!na || !na.complete || !na.code) return Promise.resolve(false);
    var body = solvedBodyOf(na.code, this.prep && this.prep.name);
    if (!body) { toast('BelJar auto-solve lost the solution.', 'error'); return Promise.resolve(false); }
    return Promise.resolve(this.verifyAndCommit(body));
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
    return P().translate().then(function (tr) {
      if (!tr || !tr.ok) {
        toast(tr && tr.error === 'incomplete'
          ? 'The proof still has open subgoals — finish them first.'
          : 'Could not translate the proof.', 'error');
        return false;
      }
      return self.verifyAndCommit(tr.source);
    });
  };

  function totalityPrefixFromDecl(declText) {
    var m = /=\s*(\/\s*total[^/]*\/\s*)/.exec(String(declText || ''));
    return m ? m[1].trim() : '';
  }

  Session.prototype.verifyAndCommit = function (source) {
    var ed = E();
    var view = this.view;
    var prep = this.prep;
    var range = ed.declRangeWithSemicolon
      ? ed.declRangeWithSemicolon(view.state.doc, this.declFrom, this.declTo)
      : { from: this.declFrom, to: this.declTo };
    var declFrom = range.from;
    var declTo = range.to;
    var docText = view.state.doc.toString();
    var declSlice = view.state.doc.sliceString(declFrom, declTo);
    var decl = ed.parseDecl(declSlice);
    if (!decl) { toast('Harpoon: lost the declaration to commit into.', 'error'); return false; }
    var body = String(source).replace(/;\s*$/, '').trimEnd();
    var tot = totalityPrefixFromDecl(declSlice);
    if (tot && !/\/\s*total\b/.test(body)) body = tot + '\n' + body;
    var newDecl = 'rec ' + decl.name + ' : ' + decl.type + ' =\n' + body + '\n;';
    var candidate = docText.slice(0, declFrom) + newDecl + docText.slice(declTo);
    var checkCode = (prep && prep.assembledCode != null)
      ? prep.assembledCode.slice(0, prep.assembledDeclFrom) + newDecl + prep.assembledCode.slice(prep.assembledDeclTo)
      : candidate;
    var self = this;
    var doCommit = function () {
      ed.commitProof(view, declFrom, declTo, source);
      toast('Proof committed.', 'success');
      self.close();
      return true;
    };
    var client = global.BelugaClient;
    if (client && typeof client.checkResult === 'function') {
      return client.checkResult(checkCode).then(function (res) {
        if (res && res.ok) return doCommit();
        toast('Translated proof did not re-check — not committed.', 'error');
        return false;
      }).catch(function () { return doCommit(); });
    }
    return Promise.resolve(doCommit());
  };

  Session.prototype.close = function () {
    if (this.win && this.win.close) this.win.close();
    this.win = null;
    var proof = P();
    if (proof && proof.dispose) proof.dispose();
    if (this.host && this.host.kind === 'panel' && typeof this.host.onDone === 'function') {
      this.host.onDone();
    }
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
    var goalWrap = el('div', 'harpoon-lab-goal');
    var glabel = el('div', 'harpoon-lab-goal-label');
    glabel.appendChild(el('span', 'harpoon-lab-goal-label-text', 'Goal'));
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

  // A short, human gloss of a move kind — the "what BelJar did" line.
  var MOVE_GLOSS = {
    intro: 'introduced the premises',
    split: 'case-split the scrutinee',
    recurse: 'applied the induction hypothesis',
    invert: 'inverted a determined derivation',
    fill: 'closed the goal',
    lemma: 'applied a supporting lemma',
  };
  function moveGloss(s) {
    if (s && s.rationale) return s.rationale;
    return (s && MOVE_GLOSS[s.move]) || 'made a move';
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
    var node = el('span', 'harpoon-lab-auto-node');
    item.appendChild(node);
    var rowCopy = el('div', 'harpoon-lab-auto-step-copy');
    var verb = el('span', 'harpoon-lab-auto-move move-' + (s.move || 'move'));
    verb.textContent = s.move || 'move';
    rowCopy.appendChild(verb);
    rowCopy.appendChild(el('span', 'harpoon-lab-auto-why', moveGloss(s)));
    item.appendChild(rowCopy);
    trail.appendChild(item);
  }

  Session.prototype.clearNativeAutoShell = function () {
    this._autoSearchBox = null;
    this._autoSearchText = null;
    this._autoTrail = null;
    this._autoPauseBtn = null;
  };

  Session.prototype.syncAutoPauseBtn = function () {
    var na = this.nativeAuto;
    var btn = this._autoPauseBtn;
    if (!na || !btn) return;
    var paused = !!na.paused;
    btn.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
    btn.setAttribute('aria-label', paused ? 'Resume search' : 'Pause search');
    if (global.Tooltips && global.Tooltips.set) {
      global.Tooltips.set(btn, paused ? 'Resume' : 'Pause');
    }
    if (this._autoSearchBox) {
      this._autoSearchBox.classList.toggle('is-paused', paused);
    }
  };

  // During search, update label / step rows in place — never tear down the shimmer shell.
  Session.prototype.updateNativeAutoSearch = function () {
    var na = this.nativeAuto;
    if (!na || na.phase !== 'searching' || !this._autoSearchText) return;
    this._autoSearchText.textContent = nativeAutoSearchLabel(na);
    var steps = na.steps || [];
    if (!this._autoTrail && steps.length && this._autoSearchBox && this._autoPauseBtn) {
      var trail = el('ol', 'harpoon-lab-auto-trail is-live');
      this._autoSearchBox.appendChild(trail);
      this._autoTrail = trail;
    }
    if (this._autoTrail) {
      for (var i = this._autoTrail.children.length; i < steps.length; i += 1) {
        appendAutoStepRow(this._autoTrail, steps[i], i);
      }
    }
    this.syncAutoPauseBtn();
  };

  // The auto-solve panel — search → reveal → place.
  Session.prototype.renderNativeAuto = function (parent) {
    var na = this.nativeAuto;
    if (!na) return;
    var self = this;
    var box = el('div', 'harpoon-lab-auto is-' + na.phase + (na.paused ? ' is-paused' : ''));

    if (na.goalType) appendAutoGoalHero(box, na.goalType, na.declName);

    // ── Act I — searching. Goal stays visible; status line + pause/resume only. */
    if (na.phase === 'searching') {
      var controls = el('div', 'harpoon-lab-auto-controls');
      var searching = el('div', 'harpoon-lab-auto-searching beljar-tip-shimmer');
      searching.style.setProperty('--shimmer-accent', 'var(--repl-holes-accent)');
      var searchTextEl = el('span', 'harpoon-lab-auto-searching-text', nativeAutoSearchLabel(na));
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
            var bc = global.BelugaClient;
            if (bc && bc.cancelCheckerWorkload) bc.cancelCheckerWorkload();
          } else {
            self.nativeAuto.searchLabel = 'Checking…';
          }
          self.updateNativeAutoSearch();
        },
      );
      controls.appendChild(pauseBtn);
      box.appendChild(controls);
      this._autoSearchBox = box;
      this._autoSearchText = searchTextEl;
      this._autoTrail = null;
      this._autoPauseBtn = pauseBtn;
      var liveSteps = na.steps || [];
      if (liveSteps.length) {
        var trail = el('ol', 'harpoon-lab-auto-trail is-live');
        liveSteps.forEach(function (s, i) { appendAutoStepRow(trail, s, i); });
        box.appendChild(trail);
        this._autoTrail = trail;
      }
      parent.appendChild(box);
      return;
    }

    if (na.complete) {
      var solutionBody = solvedBodyOf(na.code, na.declName || (this.prep && this.prep.name));
    }

    // ── Verdict — proven / stopped (below goal, above solution). */
    var head = el('div', 'harpoon-lab-auto-head');
    var badge = el('span', 'harpoon-lab-auto-badge' + (na.complete ? ' is-solved' : ' is-stuck'));
    badge.innerHTML = na.complete ? ICON_CHECK : ICON_STOP;
    head.appendChild(badge);
    var headCopy = el('div', 'harpoon-lab-auto-head-copy');
    headCopy.appendChild(el('span', 'harpoon-lab-auto-title', autoVerdictTitle(na)));
    var sub = autoSubtext(na);
    if (sub) headCopy.appendChild(el('span', 'harpoon-lab-auto-sub', sub));
    head.appendChild(headCopy);
    box.appendChild(head);

    if (na.complete && solutionBody) appendAutoSolution(box, solutionBody);

    // ── The stuck goal (honest-decline): shown calmly, syntax-highlighted. */
    if (!na.complete && na.stuck && na.stuck.goal) {
      var stuckWrap = el('div', 'harpoon-lab-auto-stuck');
      stuckWrap.appendChild(el('span', 'harpoon-lab-auto-stuck-label', 'Open goal'));
      var stuckGoal = el('div', 'harpoon-hole-goal harpoon-lab-auto-stuck-goal');
      renderType(stuckGoal, na.stuck.goal);
      stuckWrap.appendChild(stuckGoal);
      box.appendChild(stuckWrap);
    }
    // ── File errors: the search never had a checkable program — show the error. */
    if (!na.complete && na.stuck && na.stuck.reason === 'file-errors' && na.stuck.error) {
      var errWrap = el('div', 'harpoon-lab-auto-stuck');
      errWrap.appendChild(el('span', 'harpoon-lab-auto-stuck-label', 'Checker error'));
      errWrap.appendChild(el('div', 'harpoon-lab-auto-stuck-goal', na.stuck.error));
      box.appendChild(errWrap);
    }

    // ── Place the solution (deferred commit). */
    if (na.complete) {
      var place = el('button', 'harpoon-lab-place harpoon-lab-auto-place is-instant');
      place.type = 'button';
      var arrow = el('span', 'harpoon-lab-place-arrow');
      arrow.innerHTML = ICON_ARROW_RIGHT;
      place.appendChild(arrow);
      var copy = el('span', 'harpoon-lab-place-copy');
      copy.appendChild(el('span', 'harpoon-lab-place-title', 'Place the proof'));
      copy.appendChild(el('span', 'harpoon-lab-place-sub', 'Insert into the file'));
      place.appendChild(copy);
      place.addEventListener('click', function (e) { e.preventDefault(); self.commitNativeAuto(); });
      box.appendChild(place);
    }

    // ── Derivation trail — steps of proving, last. */
    var steps = na.steps || [];
    if (steps.length) {
      box.appendChild(el('div', 'harpoon-lab-auto-steps-label', 'Steps'));
      var trailCls = 'harpoon-lab-auto-trail' + (na.hadLiveTrail ? ' is-instant' : '');
      var trail = el('ol', trailCls);
      steps.forEach(function (s, i) { appendAutoStepRow(trail, s, i); });
      box.appendChild(trail);
    }

    parent.appendChild(box);
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
      // The proof is closed — surface a single, self-explaining action that swaps
      // the hole for the proven term. A strip, not a button buried in the toolbar.
      var solved = el('button', 'harpoon-lab-place');
      solved.type = 'button';
      var arrow = el('span', 'harpoon-lab-place-arrow');
      arrow.innerHTML = ICON_ARROW_RIGHT;
      solved.appendChild(arrow);
      var copy = el('span', 'harpoon-lab-place-copy');
      copy.appendChild(el('span', 'harpoon-lab-place-title', 'Replace hole with solution'));
      copy.appendChild(el('span', 'harpoon-lab-place-sub', 'The proof is complete and re-checks clean.'));
      solved.appendChild(copy);
      solved.addEventListener('click', function (e) { e.preventDefault(); self.commit(); });
      body.appendChild(solved);
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
            removeFloatSession(s);
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
    runSession(view, prep, {
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
