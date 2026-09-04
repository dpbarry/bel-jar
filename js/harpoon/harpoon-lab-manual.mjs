/**
 * Manual Harpoon — the interactive surface. Peer of `harpoon-lab.mjs`, bundled
 * via `harpoon-ui.mjs`, wired onto `Session.prototype` in `__initHarpoonLabPeels`.
 *
 * This is the DEFAULT way the lab opens: you stand at a hole, the engine offers
 * its ranked moves, you pick one, the checker certifies it, and the proof grows
 * a step. Auto-solve is not gone — it is one tactic here, "Orca", one click
 * away and runnable at ANY hole, so a proof can be half hand-built and half
 * searched without leaving the session.
 *
 * Every control below is built from the surface's existing vocabulary — the
 * `harpoon-lab-strip` tones, the `harpoon-lab-auto-btn` hero, the
 * `harpoon-lab-tac` pills, the `--harpoon-move-*` palette and the solve reel's
 * own step rows — so manual mode reads as the same instrument, not a bolt-on.
 */
function createManual(deps) {
  var el = deps.el;
  var iconBtn = deps.iconBtn;
  var setTip = deps.setTip;
  var E = deps.E;
  var toast = deps.toast;
  var renderSource = deps.renderSource;
  var appendAutoGoalHero = deps.appendAutoGoalHero;
  var appendDeclLabel = deps.appendDeclLabel;
  var priorGoalBinders = deps.priorGoalBinders;
  var buildPlaceStrip = deps.buildPlaceStrip;
  var renderCommitOutcome = deps.renderCommitOutcome;
  var stageNode = deps.stageNode;
  var solvedBodyOf = deps.solvedBodyOf;
  var appendCommittedStepRow = deps.appendCommittedStepRow;
  var appendAutoSolution = deps.appendAutoSolution;
  var renderManualSolvedSummary = deps.renderManualSolvedSummary;
  var tacticVerb = deps.tacticVerb;
  var setNativeSearchLabel = deps.setNativeSearchLabel;
  var nativeAutoSearchLabel = deps.nativeAutoSearchLabel;
  var ICON_UNDO = deps.ICON_UNDO;
  var ICON_REDO = deps.ICON_REDO;
  var ICON_ORCA = deps.ICON_ORCA;
  var ICON_CHEVRON_DOWN = deps.ICON_CHEVRON_DOWN;
  var ICON_DECLINE = deps.ICON_DECLINE;
  var ICON_CHECK = deps.ICON_CHECK;
  var ICON_PLAY = deps.ICON_PLAY;
  var ICON_PAUSE = deps.ICON_PAUSE;
  var ICON_POPOUT = deps.ICON_POPOUT;
  var manualRenderSig = deps.manualRenderSig;

  // ── Harpoon's own tactic vocabulary ────────────────────────────────────────
  // The NAMES come from the shared `tacticVerb` map (harpoon-lab.mjs) so the
  // picker, the manual trail and Orca's reel all speak one language. Only the
  // per-tactic explanations live here.
  var TACTIC_TIP = {
    intro: 'Introduce the goal’s binders',
    split: 'Case-analyse a hypothesis',
    invert: 'Invert a hypothesis with a single applicable case',
    impossible: 'Refute a hypothesis that cannot be inhabited',
    fill: 'Close the goal with an inhabiting term',
    recurse: 'Apply the induction hypothesis',
    lemma: 'Apply a lemma',
    synth: 'Synthesised chain closing the goal',
  };

  function tacticOf(mv, hole) {
    var base = { verb: tacticVerb(mv.kind), tip: TACTIC_TIP[mv.kind] || mv.rationale || '' };
    var arg = null;
    var ed = E();
    var meta = null;
    if (ed && typeof ed.stepMeta === 'function') {
      try { meta = ed.stepMeta(mv, mv.text, hole); } catch (e) { meta = null; }
    }
    if (mv.kind === 'split') arg = mv.scrutinee || (meta && meta.scrutinee) || null;
    else if (mv.kind === 'impossible') arg = meta && meta.refuted;
    else if (mv.kind === 'recurse' || mv.kind === 'lemma' || mv.kind === 'invert') {
      arg = (meta && meta.callee) || (meta && meta.uses && meta.uses[0]) || null;
    } else if (mv.kind === 'fill') arg = meta && meta.filler;
    return { verb: base.verb, arg: arg, tip: base.tip, meta: meta };
  }

  // Same shared glyph map the rows use, so a goal never shows as `|-` in a
  // tooltip while the row beside it shows the prettified form.
  function displayGoal(s) {
    var g = globalThis.HarpoonGlyphs;
    return g ? g.displayBeluga(s) : String(s == null ? '' : s);
  }

  function moveHeadText(text) {
    return String(text || '').split('\n')[0].replace(/\s+/g, ' ').trim().slice(0, 90);
  }

  // ── The move row ───────────────────────────────────────────────────────────
  // Two clearly different targets, because they do clearly different things:
  //
  //   HEADER  — the tactic in Harpoon's words + why. Clicking it APPLIES.
  //   FOOTER  — the term that would be written, its checker verdict, and a
  //             chevron. Clicking it EXPANDS.
  //
  // The verdict deliberately lives in the FOOTER, not the header: the header's
  // text is a Beluga term of unbounded width, and anything parked at its right
  // edge either collides with it or forces it to truncate. The footer already
  // truncates by nature (it is a one-line preview), so the status has a column
  // of its own that nothing competes for. It also sits beside the very thing it
  // is a verdict ABOUT — "does this term type-check" — rather than floating over
  // the tactic's name.
  function buildMoveRow(session, mv, hole, index) {
    var tac = tacticOf(mv, hole);
    var row = el('div', 'harpoon-lab-move move-' + mv.kind + (index === 0 ? ' is-primary' : ''));
    row.style.setProperty('--i', String(index));
    row._mv = mv;

    // ── header: apply ────────────────────────────────────────────────────────
    var btn = el('button', 'harpoon-lab-move-main');
    btn.type = 'button';
    var head = el('span', 'harpoon-lab-move-head');
    var verb = el('span', 'harpoon-lab-move-verb', tac.verb);
    setTip(verb, tac.tip);
    head.appendChild(verb);
    if (tac.arg) {
      var argEl = el('span', 'harpoon-lab-move-arg', tac.arg);
      setTip(argEl, argTip(mv.kind, tac.arg));
      head.appendChild(argEl);
    }
    btn.appendChild(head);
    if (mv.rationale) btn.appendChild(el('span', 'harpoon-lab-move-why', mv.rationale));
    btn.setAttribute('aria-label', 'Apply ' + tac.verb + (tac.arg ? ' ' + tac.arg : ''));
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      session.manualApply(mv, row);
    });
    row.appendChild(btn);

    // ── footer: the term, its verdict, and the expand affordance ─────────────
    var foot = el('button', 'harpoon-lab-move-foot');
    foot.type = 'button';
    foot.setAttribute('aria-expanded', 'false');
    foot.appendChild(el('span', 'harpoon-lab-move-termhead', moveHeadText(mv.text)));

    // The verdict pip is its OWN tooltip target — hovering it says what it means,
    // wherever the pointer came from. (Previously the tooltip was bound to the
    // whole card, so it answered for the wrong thing and only fired on entry.)
    var pip = el('span', 'harpoon-lab-move-pip');
    pip.setAttribute('aria-hidden', 'true');
    foot.appendChild(pip);
    row._pip = pip;

    var chev = el('span', 'harpoon-lab-move-chevron');
    chev.innerHTML = ICON_CHEVRON_DOWN;
    foot.appendChild(chev);

    setTip(foot, 'Show the full term');
    foot.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = row.classList.toggle('is-expanded');
      foot.setAttribute('aria-expanded', open ? 'true' : 'false');
      setTip(foot, open ? 'Hide the full term' : 'Show the full term');
      var full = row.querySelector('.harpoon-lab-move-term');
      if (open && !full) {
        var term = el('div', 'harpoon-lab-move-term');
        renderSource(term, mv.text);
        row.appendChild(term);
      }
    });
    row.appendChild(foot);
    markPip(row, null);
    return row;
  }

  function argTip(kind, arg) {
    if (kind === 'split') return 'Case-analyse ' + arg;
    if (kind === 'impossible') return 'Refute ' + arg;
    if (kind === 'recurse') return 'The induction hypothesis ' + arg;
    if (kind === 'lemma') return 'The lemma ' + arg;
    if (kind === 'invert') return 'Invert ' + arg;
    return arg;
  }

  // The verdict states, each with a distinct GLYPH, a distinct row treatment,
  // and its own tooltip — so "does this hold?" is answerable at a glance and
  // explainable on hover.
  var PIP_TIP = {
    checking: 'Checking this move with Beluga…',
    verified: 'Beluga accepts this move',
    rejected: 'Beluga rejects this move',
  };
  function markPip(row, state, detail) {
    if (!row || !row._pip) return;
    row.classList.remove('is-checking', 'is-verified', 'is-rejected');
    if (state) row.classList.add('is-' + state);
    if (state === 'verified') row._pip.innerHTML = ICON_CHECK;
    else if (state === 'rejected') row._pip.innerHTML = ICON_DECLINE;
    else row._pip.innerHTML = '';
    // A refused tactic is not an option. Disable the apply target outright
    // rather than letting the user fire a move we already know the checker
    // rejects — the footer stays live so they can still read the term.
    var main = row.querySelector('.harpoon-lab-move-main');
    if (main) {
      main.disabled = state === 'rejected';
      main.setAttribute('aria-disabled', state === 'rejected' ? 'true' : 'false');
    }
    var tip = PIP_TIP[state] || '';
    if (state === 'rejected' && detail) tip += ': ' + String(detail).slice(0, 180);
    setTip(row._pip, tip);
    row._pip.setAttribute('aria-hidden', tip ? 'false' : 'true');
    if (tip) row._pip.setAttribute('aria-label', tip);
  }

  // ── Skeletons ──────────────────────────────────────────────────────────────
  // Placeholders that occupy the EXACT band geometry of the thing they stand in
  // for, so the arrival of real data never reflows the panel.
  function skel(cls, w) {
    var n = el('span', 'harpoon-skel' + (cls ? ' ' + cls : ''));
    if (w) n.style.width = w;
    return n;
  }

  function sectionLabel(text) {
    var n = el('div', 'harpoon-lab-section-label is-steps harpoon-lab-moves-label');
    n.textContent = text;
    return n;
  }

  // `prep.declKey` is `kw + ':' + name`, so the keyword the author actually wrote is already
  // known here. Never default it: guessing `rec` would silently mislabel every `proof`.
  function declKwOf(prep) {
    var key = (prep && prep.declKey) || '';
    var i = key.indexOf(':');
    return i > 0 ? key.slice(0, i) : '';
  }
  function skelGoalHero(declName, declKw) {
    var wrap = el('div', 'harpoon-lab-auto-goal harpoon-lab-strip tone-goal');
    var glabel = el('div', 'harpoon-lab-goal-label');
    glabel.appendChild(el('span', 'harpoon-lab-goal-label-text harpoon-lab-section-label is-goal', 'Goal'));
    appendDeclLabel(glabel, declName, declKw);
    wrap.appendChild(glabel);
    var body = el('div', 'harpoon-lab-auto-goal-body');
    body.appendChild(skel('harpoon-skel--goal', '72%'));
    wrap.appendChild(body);
    return wrap;
  }

  function skelBar() {
    var bar = el('div', 'harpoon-lab-bar');
    var status = el('div', 'harpoon-lab-status');
    status.appendChild(el('span', 'harpoon-lab-status-dot'));
    status.appendChild(skel('harpoon-skel--text', '3.6rem'));
    bar.appendChild(status);
    return bar;
  }

  function skelCtx() {
    var wrap = el('div', 'harpoon-lab-context');
    var sec = el('div', 'harpoon-lab-ctx');
    sec.appendChild(el('span', 'harpoon-lab-ctx-label', 'meta'));
    var rows = el('div', 'harpoon-lab-binders');
    ['58%', '41%'].forEach(function (w, i) {
      var row = el('div', 'harpoon-lab-binder');
      row.appendChild(skel('harpoon-skel--text' + (i ? ' harpoon-skel--d1' : ''), w));
      rows.appendChild(row);
    });
    sec.appendChild(rows);
    wrap.appendChild(sec);
    return wrap;
  }

  // Two bars, not three: a short one where the tactic name goes and a longer one
  // for its rationale. The term-preview bar was pure noise — three bars per row
  // across three rows read as a wall rather than as "a list is coming".
  function skelMoveRow(i) {
    var row = el('div', 'harpoon-lab-move is-skeleton');
    row.style.setProperty('--i', String(i));
    var main = el('div', 'harpoon-lab-move-main');
    var head = el('span', 'harpoon-lab-move-head');
    head.appendChild(skel('harpoon-skel--verb', ['2.8rem', '2.2rem', '3.4rem'][i % 3]));
    main.appendChild(head);
    main.appendChild(skel('harpoon-skel--text harpoon-skel--d1', ['52%', '38%', '45%'][i % 3]));
    row.appendChild(main);
    return row;
  }

  // ── Orca ─────────────────────────────────────────────────────────────────
  // The one control that hands the work away. Proportioned like the surface's
  // banners (fixed badge, copy column) rather than a centred label, so it sits
  // in the same rhythm as everything else. The sheen is deliberately restrained:
  // this is a search that succeeds on a minority of goals, and the button should
  // not promise more than it delivers.
  // Let the glow lean toward the pointer — a gentle gravity, not a spotlight
  // welded to the cursor. Only a FRACTION of the offset is applied and it is
  // clamped well inside the sheen box's overhang, so the light is drawn toward
  // you and eases back when you leave; the easing lives in the CSS transition.
  //
  // The rect is measured once on enter (never per move — a layout read on every
  // pointermove is exactly the kind of thing this codebase pays for elsewhere),
  // and writes are coalesced to one per frame.
  // The glow rests at ~18% across, so a small pull kept it hugging the left
  // edge no matter where the pointer went. It now travels far enough that a
  // cursor at the right-hand end brings the light to about mid-face — still a
  // fraction of the distance, just no longer anchored.
  // Eased down from 0.55/0.45 along with a longer CSS transition. At the old values the
  // light arrived close enough behind the cursor to read as attached to it; the haze wants
  // to look pulled, not carried. Still far enough that a cursor at the right-hand end
  // brings it to about mid-face, which is what the pull was raised for.
  var GLOW_PULL_X = 0.46;     // how far toward the cursor, horizontally
  var GLOW_PULL_Y = 0.36;
  var GLOW_CLAMP_X = 0.3;     // ≤ the box's 40% horizontal overhang
  var GLOW_CLAMP_Y = 0.35;    // ≤ the box's 80% vertical overhang
  function bindOrcaGlow(btn) {
    var reduce = globalThis.matchMedia
      && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    var rect = null;
    var raf = 0;
    var pending = null;
    function flush() {
      raf = 0;
      if (!pending) return;
      btn.style.setProperty('--glow-dx', pending.x.toFixed(1) + 'px');
      btn.style.setProperty('--glow-dy', pending.y.toFixed(1) + 'px');
      pending = null;
    }
    function clamp(v, lim) { return v < -lim ? -lim : (v > lim ? lim : v); }
    btn.addEventListener('pointerenter', function () { rect = btn.getBoundingClientRect(); });
    btn.addEventListener('pointermove', function (e) {
      if (!rect || !rect.width) rect = btn.getBoundingClientRect();
      if (!rect.width) return;
      // Rest position of the glow is ~18% across; pull is measured from there.
      var restX = rect.left + rect.width * 0.18;
      pending = {
        x: clamp((e.clientX - restX) * GLOW_PULL_X, rect.width * GLOW_CLAMP_X),
        y: clamp((e.clientY - (rect.top + rect.height / 2)) * GLOW_PULL_Y,
          rect.height * GLOW_CLAMP_Y),
      };
      if (!raf) raf = globalThis.requestAnimationFrame(flush);
    });
    btn.addEventListener('pointerleave', function () {
      if (raf) { globalThis.cancelAnimationFrame(raf); raf = 0; }
      pending = null;
      rect = null;
      // Clearing the offsets lets the same transition carry it home.
      btn.style.removeProperty('--glow-dx');
      btn.style.removeProperty('--glow-dy');
    });
  }

  // ── Orca, RUNNING ────────────────────────────────────────────────────────
  // The same silhouette as the button it replaces — badge, copy column, actions —
  // so starting the search morphs this band rather than swapping in a new screen.
  // It keeps the reel's element handles on the session (`_autoSearchText` and
  // friends) so the existing live-status machinery drives it unchanged.
  function buildOrcaRunning(session, na) {
    var band = el('div', 'harpoon-lab-orca-band is-running'
      + (na.paused ? ' is-paused' : ''));
    var shell = el('div', 'harpoon-lab-orca harpoon-lab-orca--live');

    // The FIN STAYS and does the work — it is not swapped for a spinner.
    // While searching it drives: a weighted thrust and slow recovery (see CSS).
    var badge = el('span', 'harpoon-lab-orca-badge' + (na.paused ? '' : ' is-working'));
    badge.innerHTML = ICON_ORCA;
    shell.appendChild(badge);
    session._autoSearchSpinner = badge;
    // The checks·time readout hangs off the glyph alone — a small, fixed target
    // you can aim at, rather than most of the band.
    session._statTipEl = badge;

    var copy = el('span', 'harpoon-lab-orca-copy');
    copy.appendChild(el('span', 'harpoon-lab-orca-title', na.paused ? 'Orca paused' : 'Orca'));
    var sub = el('span', 'harpoon-lab-orca-sub'
      + (na.paused ? '' : ' beljar-tip-shimmer'));
    sub.textContent = na.paused
      ? 'Take a step by hand, or resume'
      : nativeAutoSearchLabel(na);
    if (!na.paused) sub.style.setProperty('--shimmer-accent', 'var(--repl-holes-accent)');
    copy.appendChild(sub);
    shell.appendChild(copy);
    session._autoSearchText = sub;

    var actions = el('div', 'harpoon-lab-orca-actions');
    var pauseBtn = iconBtn(
      'icon-btn harpoon-lab-auto-pause',
      na.paused ? ICON_PLAY : ICON_PAUSE,
      na.paused ? 'Resume the search' : 'Pause and get the tactics back',
      na.paused ? 'Resume' : 'Pause',
      function () { session.toggleOrcaPause(); },
    );
    pauseBtn._belPauseState = !!na.paused;
    session._autoPauseBtn = pauseBtn;
    actions.appendChild(pauseBtn);
    actions.appendChild(iconBtn(
      'icon-btn harpoon-lab-auto-popout',
      ICON_POPOUT,
      'Open the proof tree explorer (grows live)',
      'Pop out tree',
      function () { session.openTreeExplorer(); },
    ));
    shell.appendChild(actions);

    band.appendChild(shell);
    session._autoSearchBox = band;
    return band;
  }

  function buildOrca(session, state, disabled) {
    var band = el('div', 'harpoon-lab-orca-band');
    var btn = el('button', 'harpoon-lab-orca');
    btn.type = 'button';
    if (disabled) btn.disabled = true;
    var badge = el('span', 'harpoon-lab-orca-badge');
    badge.innerHTML = ICON_ORCA;
    btn.appendChild(badge);
    var copy = el('span', 'harpoon-lab-orca-copy');
    // Always just "Orca" — "again" is a word the user has to manage for no
    // gain; the sub-line already says what it will do from here.
    copy.appendChild(el('span', 'harpoon-lab-orca-title', 'Orca'));
    copy.appendChild(el('span', 'harpoon-lab-orca-sub',
      (state && state.steps.length) ? 'Search for the rest of the proof' : 'Search for the whole proof'));
    btn.appendChild(copy);
    // No tooltip: the card already states its name and what it does. A hover
    // bubble repeating that is noise on the one control that needs none.
    if (!disabled) {
      btn.addEventListener('click', function (e) { e.preventDefault(); session.runOrca(); });
      bindOrcaGlow(btn);
    }
    band.appendChild(btn);
    return band;
  }

  // ── The manual session, projected into the shape the shared derivation
  //    surfaces expect. Without this, coming back from a solved Orca run
  //    landed on a proof that HAD a solution and a full derivation but showed
  //    neither — only "Place the proof" — because those panels were wired to
  //    `nativeAuto` rather than to the proof. ────────────────────────────────
  function manualNa(session, m, st, complete) {
    return {
      phase: complete ? 'solved' : 'building',
      steps: (st && st.steps) || [],
      trace: null,
      stuck: null,
      complete: !!complete,
      code: st && st.code,
      goalType: session.manualGoalType(),
      goalState: complete ? 'live' : 'approximate',
      sourceGoalType: m.sourceGoalType,
      priorBinders: m.priorBinders,
      declName: m.declName,
      declKw: m.declKw || '',
      theoremSnapshot: m.theoremSnapshot || null,
      manual: true,
    };
  }

  // ── Session methods ────────────────────────────────────────────────────────

  /** Open (or reopen) the manual session over `code`, checking it once to learn
      the hole set. `code` defaults to the prep's orchestration program.
      `seed` carries a trail forward (steps + the undo stack) when we are
      resuming after a Orca run, so the proof reads as one continuous
      derivation rather than restarting. */
  function startManual(code, seed) {
    var ed = E();
    var client = globalThis.BelugaClient;
    var prep = this.prep;
    var self = this;
    if (!ed || !client || !prep || typeof ed.manualState !== 'function') {
      toast('Manual Harpoon is unavailable.', 'error');
      return Promise.resolve(false);
    }
    var declText = prep.assembledCode.slice(prep.assembledDeclFrom, prep.assembledDeclTo);
    var thm = ed.theoremUnderProof(declText);
    if (!thm) {
      toast('Harpoon could not read this theorem.', 'error');
      return Promise.resolve(false);
    }
    this.thm = thm;
    this.nativeAuto = null;
    var proveCode = code || prep.proveCode || prep.assembledCode;
    var sourceGoalType = (thm.compType && thm.compType.raw) || '';
    this.manual = {
      phase: 'loading',
      state: null,
      declName: thm.name || prep.name || '',
      declKw: declKwOf(prep),
      sourceGoalType: sourceGoalType,
      priorBinders: [],
      busy: false,
      error: null,
      commit: this.commitState || null,
    };
    this.captureAnchor(this.view, prep);
    this.bindProbe();
    this.render();

    var ready = client.beginProverSession ? client.beginProverSession() : Promise.resolve();
    return ready.then(function () {
      return client.loadProverChecker ? client.loadProverChecker(proveCode) : null;
    }).then(function () {
      return client.checkResultForProver
        ? client.checkResultForProver(proveCode)
        : client.checkResult(proveCode);
    }).then(function (res) {
      if (!self.manual) return false;
      if (!res || !res.ok) {
        self.manual.phase = 'error';
        self.manual.error = 'The file has errors. Fix them before proving.';
        self.render();
        return false;
      }
      self.manual.state = ed.manualState(proveCode, thm, res.output || '');
      if (seed) {
        self.manual.state.steps = (seed.steps || []).concat(self.manual.state.steps);
        self.manual.state.stack = seed.stack || [];
      }
      self.manual.phase = 'ready';
      self.manual.priorBinders = priorGoalBinders(self, sourceGoalType, self.manualGoalType());
      self.render();
      self.sweepCandidates();
      return true;
    }).catch(function (err) {
      if (!self.manual) return false;
      self.manual.phase = 'error';
      self.manual.error = (err && err.message) || String(err);
      self.render();
      return false;
    });
  }

  function manualGoalType() {
    var ed = E();
    var st = this.manual && this.manual.state;
    if (!st || !ed) return this.manual ? this.manual.sourceGoalType : '';
    var hole = ed.focusHole(st);
    return (hole && hole.goal) || this.manual.sourceGoalType || '';
  }

  // How long a single check may take before we call it lost. Generous: a real
  // check on a large suite can take seconds. The point is not to be strict, it is
  // that a check which NEVER settles must not leave the panel shimmering forever.
  var CHECK_TIMEOUT_MS = 45000;

  function manualOracle() {
    var client = globalThis.BelugaClient;
    return function (code) {
      var p = client.checkResultForProver
        ? client.checkResultForProver(code)
        : client.checkResult(code);
      // ⛔ A HUNG check used to hang the panel. `manualApply` clears its busy flag
      // in both `.then` and `.catch`, so a REJECTION recovers cleanly — but a
      // promise that simply never settles fires neither, and the applying track
      // and skeleton animate indefinitely with nothing to say. If the worker dies,
      // the request is dropped, or Beluga wedges, there is no rejection to catch.
      // Race it, so "no answer" becomes an ordinary failure the existing handlers
      // already know how to show.
      return new Promise(function (resolve, reject) {
        var done = false;
        var timer = setTimeout(function () {
          if (done) return;
          done = true;
          reject(new Error('The checker did not answer within '
            + Math.round(CHECK_TIMEOUT_MS / 1000) + 's.'));
        }, CHECK_TIMEOUT_MS);
        Promise.resolve(p).then(function (v) {
          if (done) return;
          done = true; clearTimeout(timer); resolve(v);
        }, function (e) {
          if (done) return;
          done = true; clearTimeout(timer); reject(e);
        });
      });
    };
  }

  // ── The Tactics status tag ─────────────────────────────────────────────────
  // Same idea as Orca's in-button status: say what is happening while it happens,
  // in the fewest words that are still specific. Blank when idle — a tag that is
  // always there stops being read.
  function setTacticStatus(session, text, stalled) {
    var host = session && session._tacticStatusEl;
    if (!host) return;
    // A zero-width space, never the empty string. The tag lives in the tactics
    // header, a baseline-aligned flex row: an EMPTY inline span contributes no line
    // box, so the first status text created one and grew the header by 1px, pushing
    // the whole list down under the user's cursor mid-click. Keeping a line box at
    // all times makes appearing free. Visibility is `.is-on`'s opacity, so the
    // placeholder is invisible.
    host.textContent = text || '​';
    host.classList.toggle('is-on', !!text);
    if (stalled) host.setAttribute('data-stalled', '');
    else host.removeAttribute('data-stalled');
  }

  /** Apply a user-picked move. */
  function manualApply(mv, row) {
    var ed = E();
    var self = this;
    var m = this.manual;
    if (!m || !m.state || m.busy || m.syncing) return Promise.resolve(false);
    // Already known to fail — the row is dead; nothing to do, nothing to say.
    if (row && row.classList.contains('is-rejected')) return Promise.resolve(false);

    // Taking a step by hand RETIRES the running search. Orca holds its own
    // copy of the program inside its loop; letting it resume from there would
    // silently discard the move just made. Its progress is already folded into
    // `m.state` by the pause sync, so nothing is lost — and "Resume" afterwards
    // simply starts a fresh search from the same working program, which the
    // user cannot tell apart from continuing.
    var na = this.nativeAuto;
    if (na && na.phase === 'searching') {
      if (!na.paused) return Promise.resolve(false);   // locked while it works
      this._retireOrca = true;
      this.nativeAuto = null;      // pulses/steps no-op from here
      this.userCancelled = true;   // let the loop reach its cancel check
      if (this.stopReelClock) this.stopReelClock();
    }
    m.busy = true;
    this.cancelSweep();
    markPip(row, 'checking');
    // Show WHICH tactic is running: the chosen row stays fully legible and grows
    // a progress track; its siblings recede. Dimming the whole list would hide
    // the one thing the user wants confirmed — that their click landed.
    if (row) {
      row.classList.add('is-applying');
      if (!row.querySelector('.harpoon-lab-move-track')) {
        // The track draws its own pulse in the tactic's colour (see CSS) — it
        // deliberately does NOT reuse `.harpoon-loadbar`, whose accent is the
        // place strip's magenta and whose internals leak out of a short host.
        row.insertBefore(el('div', 'harpoon-lab-move-track'), row.firstChild);
      }
    }
    if (this._movesEl) this._movesEl.classList.add('is-busy');
    var applyVerb = tacticVerb(mv.kind) || 'move';
    setTacticStatus(self, 'checking ' + applyVerb);
    // Escalate if it is taking unusually long. The count is the transparency:
    // "checking fill 12s" is a fact the user can act on; a shimmer is not.
    var since = Date.now();
    var tick = setInterval(function () {
      var secs = Math.round((Date.now() - since) / 1000);
      if (secs >= 3) setTacticStatus(self, 'checking ' + applyVerb + ' ' + secs + 's');
    }, 1000);
    var clearApplying = function () {
      clearInterval(tick);
      if (self._movesEl) self._movesEl.classList.remove('is-busy');
      if (!row) return;
      row.classList.remove('is-applying');
      var t = row.querySelector('.harpoon-lab-move-track');
      if (t) t.remove();
    };
    // Hand the sweep's cached verdict through: if this tactic was already
    // certified against the current program, applying it is instant.
    return ed.applyMove(m.state, mv, manualOracle(), this.thm, row && row._verified)
      .then(function (r) {
      m.busy = false;
      if (!r.ok) {
        // A rejection is an EVENT, not a state: it says what just happened, not
        // what is true of the panel. So it goes to a toast and the row goes
        // dead — a banner would sit there claiming to describe the goal.
        clearApplying();
        setTacticStatus(self, 'not accepted', true);
        markPip(row, 'rejected', r.error || 'The checker did not accept this move.');
        toast(firstLineOf(r.error) || 'That move did not type-check.', 'error');
        return false;
      }
      m.state = r.state;
      setTacticStatus(self, '');
      m.priorBinders = priorGoalBinders(self, m.sourceGoalType, self.manualGoalType());
      self.render();
      self.sweepCandidates();
      return true;
      }).catch(function (err) {
        // The checker itself failed (worker gone, cancelled, out of memory).
        // Say so — a click that silently does nothing is the worst outcome.
        m.busy = false;
        clearApplying();
        // The stall is now NAMED rather than silent: the tag says which tactic
        // was in flight when the checker stopped answering.
        setTacticStatus(self, 'no answer on ' + applyVerb, true);
        markPip(row, 'rejected', (err && err.message) || String(err));
        toast(firstLineOf(err && err.message) || 'That move could not be checked.', 'error');
        return false;
      });
  }

  // The checker's objection, trimmed to the sentence a toast can carry: drop the
  // internal splice coordinates (they point into a throwaway program, not the
  // user's file) and the redundant `Error:` label.
  function firstLineOf(detail) {
    var t = String(detail || '').replace(/^File\s+"[^"]*",\s*line\s*\d+,\s*column\s*\d+:?\s*/i, '');
    t = t.replace(/^Error:\s*/i, '').split('\n')[0].trim();
    return t.length > 160 ? t.slice(0, 157) + '…' : t;
  }

  /** Background verification of the offered moves: each row earns its ✓ before
      the user commits to it. Capped and cancellable — it must never make the
      picker wait. */
  function sweepCandidates() {
    var ed = E();
    var self = this;
    var m = this.manual;
    // Claim the token FIRST, before any early return. Every continuation below bails on
    // `_sweepToken !== token`, so replacing it is what orphans an in-flight sweep, and a
    // sweep that never starts must orphan the previous one just as firmly as one that does.
    // Returning early without claiming left the old token live, so a sweep begun for the
    // previous goal could still mark pips after a render that produced no rows, or after
    // move verification was switched off.
    var token = {};
    this._sweepToken = token;
    if (!m || !m.state || !this._moveRows || !this._moveRows.length) return;
    var persist = globalThis.Persist;
    var on = !persist || typeof persist.readStoredHarpoonVerifyMoves !== 'function'
      ? true
      : persist.readStoredHarpoonVerifyMoves();
    if (!on) return;
    var rows = this._moveRows.slice(0, 8);
    var i = 0;
    var oracle = manualOracle();

    // ── Sink the refused tactics ─────────────────────────────────────────────
    // A tactic the checker has refused is not an option, and it already renders
    // disabled. What it should not do is hold a place above tactics that DO
    // apply: after a stalled Orca run the first rows are exactly the candidates
    // the search just exhausted, so the list opened with a column of red crosses
    // and pushed anything usable below the fold.
    // Refused rows move to the BOTTOM, keeping their order. Nothing is hidden —
    // the evidence stays readable, it just stops outranking live moves. Rows the
    // sweep never reached rank above refused ones, since unknown beats refused.
    // Done ONCE when the sweep settles, not per verdict: reordering under the
    // pointer while the user is reading is worse than the problem it fixes.
    function sinkRefused() {
      if (self._sweepToken !== token || !self._moveRows) return;
      var list = self._moveRows[0] && self._moveRows[0].parentNode;
      if (!list) return;
      self._moveRows.forEach(function (row) {
        if (row && row.classList && row.classList.contains('is-rejected')) list.appendChild(row);
      });
    }

    function next() {
      if (self._sweepToken !== token) return;
      if (i >= rows.length) { sinkRefused(); setTacticStatus(self, ''); return; }
      if (!m.busy) setTacticStatus(self, 'checking ' + (i + 1) + '/' + rows.length);
      var row = rows[i];
      i += 1;
      if (!row || !row._mv) { next(); return; }
      markPip(row, 'checking');
      ed.attemptMove(m.state, row._mv, oracle, self.thm).then(function (r) {
        if (self._sweepToken !== token) return;
        // KEEP the result. It already contains the spliced program and the hole
        // report the successor state needs, so applying this tactic later costs
        // nothing — the sweep pre-computes the move rather than merely rating it.
        row._verified = r.ok ? r : null;
        markPip(row, r.ok ? 'verified' : 'rejected',
          r.ok ? 'The checker accepts this move' : (r.error || 'did not certify'));
        next();
      }).catch(function () {
        if (self._sweepToken !== token) return;
        // Do not let one unanswered check stop the rest silently.
        markPip(row, null);
        next();
      });
    }
    next();
  }

  function cancelSweep() { this._sweepToken = null; }

  function manualStepBack() {
    var ed = E();
    var m = this.manual;
    if (!m || !m.state || !ed.manualCanUndo(m.state)) return;
    this.cancelSweep();
    m.state = ed.manualUndo(m.state);
    m.lastError = null;
    this.render();
    this.sweepCandidates();
  }

  function manualStepForward() {
    var ed = E();
    var m = this.manual;
    if (!m || !m.state || !ed.manualCanRedo(m.state)) return;
    this.cancelSweep();
    m.state = ed.manualRedo(m.state);
    this.render();
    this.sweepCandidates();
  }

  function manualFocus(idx) {
    var ed = E();
    var m = this.manual;
    if (!m || !m.state) return;
    this.cancelSweep();
    m.state = ed.focusOn(m.state, idx);
    this.render();
    this.sweepCandidates();
  }

  /** ORCA — hand the current working program to the search. This is the one
      extra click, and because it runs from the LIVE state it also means "finish
      it from here" at any point mid-proof. */
  /** The pre-run state, pushed onto the undo stack EXACTLY ONCE per Orca run.
   *
   *  ⛔ One run is one undo. Orca's work folds into the session by three different
   *  exits — it finishes, it stalls, or the user pauses and takes over — and each
   *  one used to rebuild `stack` its own way. `absorbAuto` (finished) pushed the
   *  anchor and `backToManual` (took over) pushed the anchor, but the STALLED path
   *  and the pause/sync path both did `next.stack = before.stack`, silently
   *  dropping it. The effect: Orca advanced three steps, got stuck, and undo could
   *  not take you back to where you started — the steps were in the trail with no
   *  way to leave them.
   *  Anchoring here, once, makes all four exits agree; the flag stops a
   *  pause→resume→pause cycle stacking one anchor per pause. */
  function orcaStack(self, before) {
    var prior = (before && before.stack) || [];
    if (!before || self._orcaAnchored) return prior;
    self._orcaAnchored = true;
    return prior.concat([{
      code: before.code, holes: before.holes, focusIdx: before.focusIdx, steps: before.steps,
    }]);
  }

  function runOrca() {
    var m = this.manual;
    var self = this;
    if (!m || !m.state) return;
    this.cancelSweep();
    this.manualBefore = m.state;
    this._orcaAnchored = false;
    this.runNativeAuto(m.state.code);
    // Take the user to where the work is about to appear. The tactics stay put
    // above — this is a scroll, not a screen change, and scrolling back is the
    // whole gesture the paused state depends on.
    this.scrollToDerivation();
  }

  /** Smooth-scroll the panel to the derivation. Deferred a frame so the band has
      actually been laid out by the render Orca just triggered. */
  function scrollToDerivation() {
    var self = this;
    globalThis.requestAnimationFrame(function () {
      globalThis.requestAnimationFrame(function () {
        var target = self._derivEl;
        if (!target || !target.scrollIntoView) return;
        var reduce = globalThis.matchMedia
          && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
        try {
          target.scrollIntoView({
            behavior: reduce ? 'auto' : 'smooth', block: 'start', inline: 'nearest',
          });
        } catch (e) { target.scrollIntoView(false); }
      });
    });
  }

  /** Pause hands the tactics back; resume gives them to Orca again. If a
      manual step was taken while paused the original run is already finished, so
      "resume" starts a fresh search — from the SAME working program, which is
      what makes the two indistinguishable to the user. */
  function toggleOrcaPause() {
    var na = this.nativeAuto;
    var m = this.manual;
    if (!m) return;
    if (!na || na.phase !== 'searching') {
      // The run ended (a manual step retired it). Resuming is a new search.
      if (m.state) this.runOrca();
      return;
    }
    var self = this;
    na.paused = !na.paused;
    if (na.paused) {
      setNativeSearchLabel(na, 'Paused');
      // MARK SYNCING BEFORE RENDERING. Orca has moved the proof on since the
      // tactic list was built, so those moves are for a goal that no longer
      // exists — `intros` when intros has already been done. Rendering them
      // even for a moment offers steps that cannot apply, and if the sync then
      // fails they are all the user is left with: a dead end at a provable
      // hole. Skeleton until we actually know.
      m.syncing = true;
      m.syncFailed = false;
      this.render();
      this.syncManualToOrca().then(function (ok) {
        m.syncing = false;
        m.syncFailed = !ok;
        if (!self.manual || !self.nativeAuto || !self.nativeAuto.paused) return;
        self.render();
        if (ok) self.sweepCandidates();
      });
    } else {
      m.syncing = false;
      m.syncFailed = false;
      setNativeSearchLabel(na, 'Resuming…');
      this.render();
    }
  }

  /** Orca FINISHED — fold its result into the one working program.
   *
   *  Without this the panel kept rendering the pre-search state: the same goal,
   *  the same tactics, and a "Run Orca again" button, as though nothing had
   *  happened — because `m.state` was never told. There is no "returning from
   *  Orca" in a unified surface; the surface simply catches up.
   *
   *  Solved: absorb directly (a complete proof has no holes to report), which
   *  lands the Proven banner, the solution and the derivation. Otherwise:
   *  re-check whatever program it reached so the remaining goals, their tactics
   *  and the trail are all real. */
  function absorbOrcaResult(r) {
    var ed = E();
    var self = this;
    var m = this.manual;
    if (!m || !ed) return Promise.resolve(false);
    var before = this.manualBefore || m.state;
    var na = this.nativeAuto;
    // The search is over, so the panel must not still be in its live-update
    // mode: render()'s in-place fast path would otherwise swallow the rebuild
    // this result needs and leave the pre-search state on screen.
    if (this.stopReelClock) this.stopReelClock();

    if (r && r.complete && r.code) {
      m.state = ed.absorbAuto(
        before, { complete: true, code: r.code, steps: (r.steps || []), trace: (r.trace || null) }, this.thm);
      this.manualBefore = null;
      m.priorBinders = priorGoalBinders(this, m.sourceGoalType, this.manualGoalType());
      this.render();
      return Promise.resolve(true);
    }

    var code = (r && r.code) || (na && na.liveCode) || (before && before.code);
    if (!code || (before && code === before.code)) {
      // It got nowhere — nothing to fold in, but the verdict still renders.
      this.manualBefore = null;
      this.render();
      return Promise.resolve(false);
    }
    return manualOracle()(code).then(function (res) {
      if (!self.manual) return false;
      if (res && res.ok) {
        var next = ed.manualState(code, self.thm, res.output || '');
        next.steps = ((before && before.steps) || []).concat((r && r.steps) || []);
        next.stack = orcaStack(self, before);
        self.manual.state = next;
        self.manual.priorBinders = priorGoalBinders(
          self, self.manual.sourceGoalType, self.manualGoalType());
      }
      self.manualBefore = null;
      self.render();
      self.sweepCandidates();
      return true;
    }).catch(function () {
      self.manualBefore = null;
      self.render();
      return false;
    });
  }

  /** Rebuild the manual state from the program Orca has reached, so a paused
      search offers tactics for the CURRENT goal. One check; skipped when the
      search has not advanced past where we already are. */
  function syncManualToOrca() {
    var self = this;
    var ed = E();
    var na = this.nativeAuto;
    var m = this.manual;
    if (!na || !m || !m.state) return Promise.resolve(false);
    var code = na.liveCode || na.code;
    // No advance since we last looked — the state already IS the truth.
    if (!code || code === m.state.code) return Promise.resolve(true);
    return manualOracle()(code).then(function (res) {
      if (!res || !res.ok || !self.manual) return false;
      var next = ed.manualState(code, self.thm, res.output || '');
      var before = self.manualBefore;
      // The trail is everything that came before plus everything Orca found.
      // Orca's steps must carry their own trace entries here too, exactly as on the
      // finished-run path. Pausing is the commonest way a search gets folded into a manual
      // session, so concatenating them bare would drop the alternatives from the node graph
      // for the very case the surface exists to support.
      next.steps = ((before && before.steps) || [])
        .concat(ed.pairTrace ? ed.pairTrace(na.steps || [], na.trace) : (na.steps || []));
      next.stack = orcaStack(self, before);
      self.manual.state = next;
      self.manual.priorBinders = priorGoalBinders(
        self, m.sourceGoalType, self.manualGoalType());
      return true;
    }).catch(function () { return false; });
  }

  /** Return from a Orca run to hand-proving, KEEPING whatever it achieved.
      This is what makes the two modes one continuum: a search that stalls
      hands its partial derivation back rather than throwing it away. */
  function backToManual() {
    var ed = E();
    var na = this.nativeAuto;
    var before = this.manualBefore || null;
    var priorSteps = (before && before.steps) || [];
    var priorStack = (before && before.stack) || [];
    this.manualBefore = null;
    this.nativeAuto = null;

    if (na && na.complete && na.code && before && ed && typeof ed.absorbAuto === 'function') {
      // Solved: no re-check needed — a complete proof has no holes to report.
      this.manual.state = ed.absorbAuto(before, {
        complete: true, code: na.code, steps: na.steps || [], trace: na.trace || null,
      }, this.thm);
      this.render();
      return;
    }

    // Stalled, cancelled or taken over: re-open manually over whatever code
    // Orca reached. `startManual` re-checks, which is what gives us an accurate
    // hole report for the new state — the search's own return carries no raw
    // output. `liveCode` is the mid-search case: the run never returned a `code`,
    // but every accepted step was reported as it landed.
    var resumeCode = (na && (na.code || na.liveCode)) || (before && before.code) || null;
    var seedSteps = priorSteps.concat((na && na.steps) || []);
    this.startManual(resumeCode, {
      steps: seedSteps,
      stack: orcaStack(this, before),
    });
  }

  /** Place the hand-built proof into the file — the same verified commit the
      auto path uses. */
  function commitManual() {
    var ed = E();
    var m = this.manual;
    var st = this.getCommitState();
    if (!m || !m.state || st.status === 'checking' || st.status === 'placed') {
      return Promise.resolve(false);
    }
    var body = solvedBodyOf(m.state.code, m.declName);
    if (!body) { toast('Harpoon lost the proof body.', 'error'); return Promise.resolve(false); }
    this.beginCommitUi('verify');
    return this.verifyAndCommit(body, { skipBeginUi: true });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function renderManual(parent) {
    var ed = E();
    var self = this;
    var m = this.manual;
    if (!m) return;
    var st = m.state;
    var complete = st && ed.manualIsComplete(st);
    this._renderSig = manualRenderSig(this);
    var box = el('div', 'harpoon-lab-manual is-' + m.phase
      + (complete ? ' is-complete' : '')
      + (this.isFrozenRetrospective() ? ' is-frozen' : ''));
    var stage = 0;

    // 1. The goal hero — the focus subgoal, in the surface's own goal language.
    var goalType = this.manualGoalType();
    if (goalType) {
      this._autoGoalWrap = appendAutoGoalHero(
        box, goalType, m.declName, complete ? 'live' : 'approximate', m.priorBinders,
        m.declKw);
    }
    // Banners belong to the GOAL, directly beneath it — one unbroken segment of
    // "what is true right now". Nothing from the working area may come between.
    if (!this.isFrozenRetrospective()) this.renderCompromiseBanner(box);

    // ── Loading: the CHROME IS ALREADY THERE. ────────────────────────────────
    // Every band that will exist is laid out at its real size with its content
    // skeletoned, so the panel settles in place instead of assembling itself
    // around the user. Nothing moves when the data lands — only the fill changes.
    if (m.phase === 'loading') {
      // The declaration's own type is known before any check runs, so the goal
      // band shows it for real (step 1 above) and only the parts we genuinely do
      // not know yet are skeletoned. A second, empty goal band here would both
      // duplicate the header and pretend we know less than we do.
      if (!goalType) box.appendChild(skelGoalHero(m.declName, m.declKw));
      box.appendChild(skelBar());
      // ⛔ NO CONTEXT SKELETON. The band it stood for renders only when the focus
      // hole actually has binders, and a hole that has had no move made at it has
      // none — which is exactly the state the lab opens in. So the skeleton drew a
      // "meta" section, the real data landed with no context at all, the band
      // vanished and everything below it jumped up. That is the precise failure
      // the skeleton exists to prevent, caused by skeletoning a band we cannot
      // know will exist. Omitting it costs a downward settle in the rarer
      // resume-mid-proof case, which is the cheaper of the two.
      box.appendChild(buildOrca(this, null, true));
      var skelMoves = el('div', 'harpoon-lab-moves');
      skelMoves.appendChild(sectionLabel('Tactics'));
      var skelList = el('div', 'harpoon-lab-move-list');
      for (var k = 0; k < 3; k += 1) skelList.appendChild(skelMoveRow(k));
      skelMoves.appendChild(skelList);
      box.appendChild(skelMoves);
      parent.appendChild(box);
      return;
    }

    if (m.phase === 'error') {
      var err = el('div', 'harpoon-lab-auto-stuck harpoon-lab-auto-panel tone-error');
      err.appendChild(el('span', 'harpoon-lab-auto-stuck-label', 'Cannot prove'));
      err.appendChild(el('div', 'harpoon-lab-auto-stuck-goal', m.error || ''));
      box.appendChild(err);
      parent.appendChild(box);
      return;
    }

    // Project the session for the shared derivation surfaces (and the pop-out
    // tree explorer, which reads it live off the session).
    this._manualNa = manualNa(this, m, st, complete);

    if (complete) {
      // 5a. Proven. The verdict IS a permanent statement about the current
      //     state, so it earns a banner — and it reads the same whether the
      //     steps came from your hand, from Orca, or from both.
      var proven = renderManualSolvedSummary(box);
      if (proven) {
        proven.querySelector('.harpoon-lab-auto-sub').textContent =
          (st.steps.length === 1 ? '1 step' : st.steps.length + ' steps')
          + ' · ready to place in the file';
        stageNode(proven, stage);
        stage += 1;
      }
      var commit = this.getCommitState();
      if (commit.status === 'failed' || (commit.status === 'placed' && !commit.dismissed)) {
        stageNode(renderCommitOutcome(box, commit, m.declName,
          commit.canRetry ? function () { self.resetCommitForRetry(); } : null), stage);
        stage += 1;
      } else if (commit.status !== 'placed') {
        var blocked = this.compromise && this.compromise.level === 'block';
        var place = buildPlaceStrip(this, {
          blocked: blocked,
          extraCls: ' harpoon-lab-auto-place is-instant',
          title: 'Place the proof',
          onClick: function () { self.commitManual(); },
        });
        stageNode(place, stage);
        stage += 1;
        box.appendChild(place);
        if (commit.status === 'checking') this.updateCommitPlace();
      }
      // 2. The subgoal bar — progress, undo/redo. Harpoon's own header.
      var open = st ? st.holes.length : 0;
      var bar = el('div', 'harpoon-lab-bar');
      var status = el('div', 'harpoon-lab-status');
      var dot = el('span', 'harpoon-lab-status-dot' + (complete ? ' is-done' : ''));
      setTip(dot, complete ? 'Proven' : 'Unproven');
      dot.setAttribute('aria-label', complete ? 'Proven' : 'Unproven');
      status.appendChild(dot);
      status.appendChild(el('span', 'harpoon-lab-status-text',
        complete ? 'Proven' : (open === 1 ? '1 goal' : open + ' goals')));
      bar.appendChild(status);
      var actions = el('div', 'harpoon-lab-bar-actions');
      var undoBtn = iconBtn('icon-btn', ICON_UNDO, 'Undo the last move', 'Undo',
        function () { self.manualStepBack(); });
      undoBtn.disabled = !(st && ed.manualCanUndo(st));
      var redoBtn = iconBtn('icon-btn', ICON_REDO, 'Redo', 'Redo',
        function () { self.manualStepForward(); });
      redoBtn.disabled = !(st && ed.manualCanRedo(st));
      actions.appendChild(undoBtn);
      actions.appendChild(redoBtn);
      bar.appendChild(actions);
      box.appendChild(bar);

      // 3. Subgoal tabs — Harpoon's `subgoal list` / `defer`, when there's a choice.
      //    Its own band, on the panel's horizontal rhythm; the tabs no longer sit
      //    flush against the panel edges.
      if (st && st.holes.length > 1) {
        var pickBand = el('div', 'harpoon-lab-picker-band');
        var picker = el('div', 'harpoon-lab-picker');
        picker.setAttribute('role', 'tablist');
        picker.setAttribute('aria-label', 'Subgoals');
        st.holes.forEach(function (h, i) {
          var tab = el('button', 'harpoon-lab-picker-tab' + (i === st.focusIdx ? ' is-active' : ''));
          tab.type = 'button';
          tab.setAttribute('role', 'tab');
          tab.setAttribute('aria-selected', i === st.focusIdx ? 'true' : 'false');
          tab.textContent = String(i + 1);
          setTip(tab, 'Subgoal ' + (i + 1) + (h.goal ? ' · ' + displayGoal(h.goal) : ''));
          tab.addEventListener('click', function (e) { e.preventDefault(); self.manualFocus(i); });
          picker.appendChild(tab);
        });
        pickBand.appendChild(picker);
        box.appendChild(pickBand);
      }

      // 4. The context ledger — the assumptions in scope at the focus subgoal.
      //
      // While Orca runs this comes from the SEARCH's latest hole report, not from
      // `st`: `st` is the pre-run state, so the panel used to show the context of a
      // goal the search had long since left, frozen for the whole run.
      // `na.liveHoles` is the successor report the engine already computed for its
      // own guards and now hands over through onStep, so this costs no checker call.
      // First hole in source order, which is where the engine's leftmost-arm focus
      // rule goes next; an exact focus would need the reducer's scoring, and being
      // one subgoal out beats being a whole search out of date.
      var naRun = this.nativeAuto;
      var liveHole = (naRun && naRun.phase === 'searching'
        && naRun.liveHoles && naRun.liveHoles.length) ? naRun.liveHoles[0] : null;
      var hole = liveHole || (st ? ed.focusHole(st) : null);
      if (hole && ((hole.meta && hole.meta.length) || (hole.ctx && hole.ctx.length))) {
        var ctxWrap = el('div', 'harpoon-lab-context');
        this.renderCtx(ctxWrap, 'meta', hole.meta);
        this.renderCtx(ctxWrap, 'ctx', hole.ctx);
        box.appendChild(ctxWrap);
        // Handle for `syncLiveContext`, which refreshes this band in place while
        // Orca runs (render() takes its fast path then and never rebuilds).
        this._ctxWrap = ctxWrap;
        this._ctxKey = JSON.stringify([hole.meta || [], hole.ctx || []]);
      }
      // The proof itself — exactly what commit will write. A finished proof must
      // show its solution whether a human or Orca produced it.
      var solved = solvedBodyOf(st.code, m.declName);
      if (solved) {
        stageNode(appendAutoSolution(box, solved), stage);
        stage += 1;
      }
    } else {
      // 2. The subgoal bar — progress, undo/redo. Harpoon's own header.
      var open = st ? st.holes.length : 0;
      var bar = el('div', 'harpoon-lab-bar');
      var status = el('div', 'harpoon-lab-status');
      var dot = el('span', 'harpoon-lab-status-dot' + (complete ? ' is-done' : ''));
      setTip(dot, complete ? 'Proven' : 'Unproven');
      dot.setAttribute('aria-label', complete ? 'Proven' : 'Unproven');
      status.appendChild(dot);
      status.appendChild(el('span', 'harpoon-lab-status-text',
        complete ? 'Proven' : (open === 1 ? '1 goal' : open + ' goals')));
      bar.appendChild(status);
      var actions = el('div', 'harpoon-lab-bar-actions');
      var undoBtn = iconBtn('icon-btn', ICON_UNDO, 'Undo the last move', 'Undo',
        function () { self.manualStepBack(); });
      undoBtn.disabled = !(st && ed.manualCanUndo(st));
      var redoBtn = iconBtn('icon-btn', ICON_REDO, 'Redo', 'Redo',
        function () { self.manualStepForward(); });
      redoBtn.disabled = !(st && ed.manualCanRedo(st));
      actions.appendChild(undoBtn);
      actions.appendChild(redoBtn);
      bar.appendChild(actions);
      box.appendChild(bar);

      // 3. Subgoal tabs — Harpoon's `subgoal list` / `defer`, when there's a choice.
      //    Its own band, on the panel's horizontal rhythm; the tabs no longer sit
      //    flush against the panel edges.
      if (st && st.holes.length > 1) {
        var pickBand = el('div', 'harpoon-lab-picker-band');
        var picker = el('div', 'harpoon-lab-picker');
        picker.setAttribute('role', 'tablist');
        picker.setAttribute('aria-label', 'Subgoals');
        st.holes.forEach(function (h, i) {
          var tab = el('button', 'harpoon-lab-picker-tab' + (i === st.focusIdx ? ' is-active' : ''));
          tab.type = 'button';
          tab.setAttribute('role', 'tab');
          tab.setAttribute('aria-selected', i === st.focusIdx ? 'true' : 'false');
          tab.textContent = String(i + 1);
          setTip(tab, 'Subgoal ' + (i + 1) + (h.goal ? ' · ' + displayGoal(h.goal) : ''));
          tab.addEventListener('click', function (e) { e.preventDefault(); self.manualFocus(i); });
          picker.appendChild(tab);
        });
        pickBand.appendChild(picker);
        box.appendChild(pickBand);
      }

      // 4. The context ledger — the assumptions in scope at the focus subgoal.
      //
      // While Orca runs this comes from the SEARCH's latest hole report, not from
      // `st`: `st` is the pre-run state, so the panel used to show the context of a
      // goal the search had long since left, frozen for the whole run.
      // `na.liveHoles` is the successor report the engine already computed for its
      // own guards and now hands over through onStep, so this costs no checker call.
      // First hole in source order, which is where the engine's leftmost-arm focus
      // rule goes next; an exact focus would need the reducer's scoring, and being
      // one subgoal out beats being a whole search out of date.
      var naRun = this.nativeAuto;
      var liveHole = (naRun && naRun.phase === 'searching'
        && naRun.liveHoles && naRun.liveHoles.length) ? naRun.liveHoles[0] : null;
      var hole = liveHole || (st ? ed.focusHole(st) : null);
      if (hole && ((hole.meta && hole.meta.length) || (hole.ctx && hole.ctx.length))) {
        var ctxWrap = el('div', 'harpoon-lab-context');
        this.renderCtx(ctxWrap, 'meta', hole.meta);
        this.renderCtx(ctxWrap, 'ctx', hole.ctx);
        box.appendChild(ctxWrap);
        // Handle for `syncLiveContext`, which refreshes this band in place while
        // Orca runs (render() takes its fast path then and never rebuilds).
        this._ctxWrap = ctxWrap;
        this._ctxKey = JSON.stringify([hole.meta || [], hole.ctx || []]);
      }
      // 5b. ORCA — the headline action, and while it runs, the same band
      //     becomes its cockpit. Never a separate screen.
      var na = this.nativeAuto;
      var running = !!(na && na.phase === 'searching');
      var searching = running && !na.paused;
      // Record what we actually drew, so render()'s in-place fast path knows
      // when a rebuild is genuinely required (see manualRenderSig).
      if (running) box.appendChild(buildOrcaRunning(this, na));
      else box.appendChild(buildOrca(this, st, false));

      // Orca stopped without proving it — say why, right here, then let the
      // user carry on by hand or run it again.
      if (na && na.phase === 'stuck' && na.stuck && na.stuck.goal) {
        var stuckCard = this.renderStuckCard(na);
        stageNode(stuckCard, stage);
        stage += 1;
        box.appendChild(stuckCard);
      }

      // 6. The tactics — our engine's ranked moves, in Harpoon's vocabulary.
      var movesWrap = el('div', 'harpoon-lab-moves'
        + (searching ? ' is-locked' : ''));
      this._movesEl = movesWrap;
      this._moveRows = [];
      var tacticsLabel = sectionLabel('Tactics');
      if (searching) {
        // Locked, not hidden: the user can still see the section, and is told
        // plainly how to get it back.
        tacticsLabel.appendChild(
          el('span', 'harpoon-lab-moves-lock', 'Pause Orca to use tactics'));
      }
      // Where the status tag lives. Sits in the header rather than over the list,
      // so it never covers the rows it is describing.
      var tacStatus = el('span', 'harpoon-lab-moves-status');
      tacticsLabel.appendChild(tacStatus);
      this._tacticStatusEl = tacStatus;
      movesWrap.appendChild(tacticsLabel);
      var moves = [];
      try { moves = ed.movesAt(st, this.thm) || []; } catch (e) { moves = []; }
      var list = el('div', 'harpoon-lab-move-list');
      if (m.busy || m.syncing) {
        // Applying, or catching up to where Orca paused. NEVER show the
        // previous goal's tactics here: they were computed for a goal that no
        // longer exists, and offering them means offering moves that cannot
        // apply. Skeleton until we know what is actually on offer.
        for (var sk = 0; sk < Math.min(3, Math.max(1, moves.length)); sk += 1) {
          list.appendChild(skelMoveRow(sk));
        }
        movesWrap.appendChild(list);
      } else if (m.syncFailed) {
        // We could not read the paused program, so we cannot honestly say what
        // applies. Say that, rather than showing a list we do not trust.
        var lost = el('div', 'harpoon-lab-moves-empty');
        lost.appendChild(el('span', 'harpoon-lab-moves-empty-title',
          'Could not read the paused proof'));
        lost.appendChild(el('span', 'harpoon-lab-moves-empty-sub',
          'Resume Orca, or undo the last step and try again.'));
        movesWrap.appendChild(lost);
      } else if (!moves.length) {
        var none = el('div', 'harpoon-lab-moves-empty');
        none.appendChild(el('span', 'harpoon-lab-moves-empty-title', 'Nothing applies here'));
        none.appendChild(el('span', 'harpoon-lab-moves-empty-sub',
          'BelJar has no move for this goal. Undo the last step, pick another subgoal, '
          + 'or let Orca search.'));
        movesWrap.appendChild(none);
      } else {
        moves.forEach(function (mv, i) {
          var row = buildMoveRow(self, mv, hole, i);
          self._moveRows.push(row);
          list.appendChild(row);
        });
        movesWrap.appendChild(list);
      }
      stageNode(movesWrap, stage);
      stage += 1;
      box.appendChild(movesWrap);
    }

    // 7. The derivation — one place where the proof accumulates, whoever is
    //    building it. While Orca searches this is the LIVE reel (candidates
    //    streaming, steps settling); otherwise it is the shared List ⇄ Tree
    //    section with its pop-out. Same slot, same meaning.
    var naNow = this.nativeAuto;
    if (naNow && naNow.phase === 'searching') {
      var live = el('div', 'harpoon-reel harpoon-lab-manual-trail');
      var liveHead = el('div', 'harpoon-deriv-header');
      liveHead.appendChild(el('span', 'harpoon-lab-section-label is-steps', 'Derivation'));
      liveHead.appendChild(iconBtn(
        'icon-btn harpoon-deriv-popout',
        ICON_POPOUT,
        'Open the proof tree explorer (grows live)',
        'Pop out tree',
        function () { self.openTreeExplorer(); },
      ));
      live.appendChild(liveHead);
      var record = el('ol', 'harpoon-lab-auto-trail harpoon-reel-record is-live');
      record._lastBranch = null;
      record._branchHost = null;
      live.appendChild(record);
      box.appendChild(live);
      this._reelRecord = record;
      this._reelRecordCount = 0;
      this._workingRow = null;
      this._workingStrip = null;
      this._workingChips = [];
      this._derivEl = live;
      // Replay the WHOLE trail, then let the reel stream.
      //
      // The prior hand-built steps have to be replayed here or the derivation
      // appears to reset the instant Orca starts: it emptied to just the search's
      // own steps and refilled when the run ended, because both `absorbOrcaResult`
      // and `backToManual` concatenate `before.steps` with `na.steps` afterwards.
      // Nothing was ever lost, but the panel said otherwise.
      //
      // ⛔ `_reelRecordCount` must keep counting ONLY `na.steps`. The reel streams
      // new rows with `for (i = _reelRecordCount; i < na.steps.length; i++)`, so it
      // is an INDEX INTO na.steps, not a row count. Adding the prior steps to it
      // makes the reel believe it has already drawn search steps that have not
      // happened, and it silently stops appending.
      var prior = (this.manualBefore && this.manualBefore.steps) || [];
      for (var pi = 0; pi < prior.length; pi += 1) {
        appendCommittedStepRow(record, prior[pi], pi);
      }
      var already = (naNow.steps || []);
      for (var si = 0; si < already.length; si += 1) {
        appendCommittedStepRow(record, already[si], prior.length + si);
      }
      this._reelRecordCount = already.length;
      this.syncReelStatus();
      this.startReelClock();
    } else if (st && st.steps.length) {
      var deriv = this.renderDerivationSection(box, this._manualNa);
      stageNode(deriv, stage);
      stage += 1;
      box.appendChild(deriv);
      this._derivEl = deriv;
    }

    parent.appendChild(box);
  }

  return {
    startManual: startManual,
    renderManual: renderManual,
    manualGoalType: manualGoalType,
    manualApply: manualApply,
    manualStepBack: manualStepBack,
    manualStepForward: manualStepForward,
    manualFocus: manualFocus,
    sweepCandidates: sweepCandidates,
    cancelSweep: cancelSweep,
    runOrca: runOrca,
    toggleOrcaPause: toggleOrcaPause,
    absorbOrcaResult: absorbOrcaResult,
    syncManualToOrca: syncManualToOrca,
    scrollToDerivation: scrollToDerivation,
    backToManual: backToManual,
    commitManual: commitManual,
  };
}

export { createManual as create };
