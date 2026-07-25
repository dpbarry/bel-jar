/**
 * Goal presentation + type/source render + move captions for the lab UI.
 */
const global = globalThis;
function createDisplay(deps) {
  var el = deps.el;
  var E = deps.E;
  var setTip = deps.setTip;
  var liveEditorFileId = deps.liveEditorFileId;
  var bindChipTip = deps.bindChipTip;
  var renderSynthChain = deps.renderSynthChain;
  var ICON_CHECK = deps.ICON_CHECK;
  var ICON_ARROW_RIGHT = deps.ICON_ARROW_RIGHT;
  var ICON_ALERT = deps.ICON_ALERT;

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

  function displaySource(text) {
    var ed = E();
    var s = String(text || '');
    if (ed && typeof ed.expandBelAliases === 'function') s = ed.expandBelAliases(s);
    return displayType(s);
  }

  function renderType(host, typeStr, kind) {
    var norm = displayType(typeStr);
    host.textContent = '';
    if (!norm) return;
    var ed = E();
    if (ed && typeof ed.renderTypeInto === 'function') {
      try {
        ed.renderTypeInto(host, norm, kind || 'comp');
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

  /** Source-derived (non-live) goals show leading binders inline; the settled
      goal peels them into the meta-context. Peel them up front so the display
      keeps the settled silhouette from the first frame — the binders re-enter
      via the priors diff. Live checker goals are never second-guessed. */
  function peelDisplayGoal(goalType, goalState) {
    if (!goalType || goalState === 'live') return goalType;
    var ed = E();
    if (!ed || typeof ed.peelLeadingBinders !== 'function') return goalType;
    try {
      var peeled = ed.peelLeadingBinders(goalType);
      if (peeled.binders.length && peeled.rest) return peeled.rest;
    } catch (e) { /* keep as-is */ }
    return goalType;
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
    var api = global.CurrentEditor;
    var eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
    var hit = ed.resolveHoleGoalForHit(session.view, eng, prep.hit);
    if (!hit || !hit.goal) {
      return { goalType: na.goalType, goalState: na.goalState || 'live' };
    }
    var st = hit.state || 'live';
    if (st === 'pending' || st === 'approximate' || st === 'rechecking') {
      return { goalType: peelDisplayGoal(hit.goal, st), goalState: st };
    }
    return { goalType: hit.goal, goalState: 'live' };
  }

  /** The decl's FULL signature: the engine's merged type (source binders +
      inferred {...} binders, same as the tooltip) when available; else the
      session's cached resolution (engine answer memoized before a file switch,
      or the prover-slot ideDeclType result for never-active files); else the
      source annotation. */
  function fullDeclSignature(session, sourceType) {
    var name = session && session.prep && session.prep.name;
    var cached = session && name && session._fullDeclSig && session._fullDeclSig.name === name
      ? session._fullDeclSig.type : null;
    var view = session && session.view;
    var from = session ? session.declFrom : null;
    if (!view || !name || from == null) return cached || sourceType;
    if (session.fileId && liveEditorFileId() !== session.fileId) return cached || sourceType;
    var api = global.CurrentEditor;
    var eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
    if (!eng || typeof eng.intelSyncAt !== 'function') return cached || sourceType;
    var to = session.declTo != null ? session.declTo : Math.min(from + 400, view.state.doc.length);
    var idx = view.state.doc.sliceString(from, to).indexOf(name);
    if (idx < 0) return cached || sourceType;
    try {
      var intel = eng.intelSyncAt(from + idx);
      if (intel && intel.type && intel.definition && intel.definition.isGlobal
          && (intel.definition.name === name || intel.name === name)) {
        session._fullDeclSig = { name: name, type: intel.type };
        return intel.type;
      }
    } catch (e) { /* fall through */ }
    return cached || sourceType;
  }

  /** Signature binders absent from the displayed goal — explicit source binders
      AND reconstruction-inferred ones ({A : (⊢ tp)} …). */
  function priorGoalBinders(session, sourceType, goalType) {
    var ed = E();
    if (!ed || typeof ed.priorDeclBinders !== 'function') return [];
    var sig = fullDeclSignature(session, sourceType);
    if (!sig) return [];
    try { return ed.priorDeclBinders(sig, goalType || ''); }
    catch (e) { return []; }
  }

  function mountGoalPriors(wrap, binders) {
    if (!wrap) return;
    var body = wrap.querySelector('.harpoon-lab-auto-goal-body');
    if (!body) return;
    var old = wrap.querySelector('.harpoon-lab-auto-goal-priors');
    if (old) old.remove();
    if (!binders || !binders.length) return;
    var row = el('div', 'harpoon-lab-auto-goal-priors');
    var text = el('span', 'harpoon-lab-auto-goal-priors-text');
    renderType(text, binders.map(function (b) { return b.text; }).join(' '), 'binder');
    row.appendChild(text);
    body.insertAdjacentElement('afterend', row);
  }

  function appendAutoGoalHero(parent, goalType, declName, goalState, priorBinders) {
    var wrap = el('div', 'harpoon-lab-auto-goal harpoon-lab-strip tone-goal');
    var glabel = el('div', 'harpoon-lab-goal-label');
    glabel.appendChild(el('span', 'harpoon-lab-goal-label-text harpoon-lab-section-label is-goal', 'Goal'));
    if (declName) glabel.appendChild(el('span', 'harpoon-lab-auto-goal-name', declName));
    wrap.appendChild(glabel);
    var body = el('div', 'harpoon-lab-auto-goal-body');
    var goal = el('div', 'harpoon-hole-goal');
    var ed = E();
    if (ed && typeof ed.mountHoleGoalTier === 'function') {
      ed.mountHoleGoalTier(goal, { surface: 'lab', goalState: goalState || 'live', goal: goalType });
    } else {
      renderType(goal, goalType);
    }
    body.appendChild(goal);
    wrap.appendChild(body);
    mountGoalPriors(wrap, priorBinders);
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

  function autoVerdictTone(na) {
    if (na.complete) return 'success';
    if (na.stuck && na.stuck.reason === 'file-errors') return 'error';
    return 'warn';
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
    var title = opts.title || 'Place the proof';
    var sub = opts.sub || (blocked
      ? 'The hole changed — restart to insert'
      : 'Insert into the file');
    var extraCls = opts.extraCls || '';
    return buildBannerShell({
      tag: 'button',
      className: 'harpoon-lab-place harpoon-lab-strip harpoon-lab-banner'
        + extraCls + (blocked ? ' is-blocked' : ''),
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
    if (!placed && commit.detailRaw) {
      var copy = banner.querySelector('.harpoon-lab-banner-copy');
      if (copy) copy.appendChild(el('span', 'harpoon-lab-commit-tech', commit.detailRaw));
    }
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
    var ed = global.BelEditor;
    if (ed && typeof ed.stepLead === 'function' && s && s.meta) {
      var fromEd = ed.stepLead({ kind: s.move }, s.meta, { goal: s.goal });
      if (fromEd) return fromEd;
    }
    var derived = deriveMoveLead(s);
    if (derived) return derived;
    return (s && MOVE_GLOSS[s.move]) || 'made a move';
  }

  function facetChip(text, extraClass, tip, richKind) {
    var chip = el('span', 'hpt-move-facet-chip' + (extraClass ? ' ' + extraClass : ''));
    var code = el('code', 'hpt-move-facet-code');
    renderSource(code, text);
    chip.appendChild(code);
    if (tip) bindChipTip(chip, tip, richKind ? text : null, richKind);
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
        wrap.appendChild(facetChip(n, '', 'Binder introduced for the assumed input'));
        has = true;
      });
    } else if (move === 'split') {
      if (meta.arms) {
        var armTip = meta.arms === 1
          ? 'Opened one branch with a single hole'
          : 'Opened ' + meta.arms + ' branches, each with its own hole';
        wrap.appendChild(facetChip(meta.arms + ' arm' + (meta.arms === 1 ? '' : 's'), '', armTip));
        has = true;
      }
      if (meta.annotated) {
        wrap.appendChild(facetChip('typed', 'is-muted', 'Arms carry explicit type annotations'));
        has = true;
      }
    } else if (move === 'fill') {
      var filler = meta.filler
        || (step.text && String(step.text).split('\n')[0].replace(/\s+/g, ' ').trim());
      if (filler) {
        wrap.appendChild(facetChip(filler, '', 'Proof term written in place of the hole', 'type'));
        has = true;
      }
    } else if (move === 'recurse' || move === 'lemma') {
      (meta.uses || []).forEach(function (u) {
        wrap.appendChild(facetChip(u, '', 'Used from the local context'));
        has = true;
      });
      (meta.binds || []).forEach(function (b) {
        wrap.appendChild(facetChip(b, 'is-binds', 'New witness bound by this move'));
        has = true;
      });
    } else if (move === 'invert') {
      if (meta.uses && meta.uses[0]) {
        var arrow = el('span', 'hpt-move-facet-arrow');
        arrow.textContent = meta.uses[0] + ' → ' + ((meta.binds || []).join(', ') || '…');
        bindChipTip(arrow, 'Hypothesis inverted into pattern variables');
        wrap.appendChild(arrow);
        has = true;
      }
    } else if (move === 'impossible' && meta.refuted) {
      wrap.appendChild(facetChip(meta.refuted, '', 'Shown to be contradictory'));
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

  function nowMs() {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  function setNativeSearchLabel(na, label, opts) {
    if (!na || label == null) return;
    var tryKey = opts && Object.prototype.hasOwnProperty.call(opts, 'tryKey')
      ? opts.tryKey
      : undefined;
    var isTrying = /^Trying /.test(label);
    // Trying… identity is the specific candidate(s), not the kind. Rapidly
    // cycling new fills must not accumulate into a fake long stall.
    if (isTrying && tryKey !== undefined) {
      if (na.searchLabel === label && na.tryKey === tryKey) return;
      na.searchLabel = label;
      na.tryKey = tryKey;
      na.labelAt = nowMs();
      return;
    }
    if (na.searchLabel === label && !isTrying) {
      na.tryKey = null;
      return;
    }
    na.searchLabel = label;
    na.tryKey = isTrying ? (tryKey != null ? tryKey : null) : null;
    na.labelAt = nowMs();
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
    var label = na.searchLabel
      || (na.steps && na.steps.length ? 'Step ' + na.steps.length : 'Searching…');
    // After 5s on the same phase (or same Trying candidate), show elapsed.
    if (na.phase === 'searching' && !na.paused && na.labelAt != null) {
      var secs = Math.floor((nowMs() - na.labelAt) / 1000);
      if (secs >= 5) {
        label = String(label).replace(/[….]+$/, '') + ' · ' + secs + 's…';
      }
    }
    return label;
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

  return {
    normalizeGlyphs: normalizeGlyphs,
    displayType: displayType,
    displaySource: displaySource,
    renderType: renderType,
    renderSource: renderSource,
    peelDisplayGoal: peelDisplayGoal,
    resolveNativeAutoGoalDisplay: resolveNativeAutoGoalDisplay,
    fullDeclSignature: fullDeclSignature,
    priorGoalBinders: priorGoalBinders,
    mountGoalPriors: mountGoalPriors,
    appendAutoGoalHero: appendAutoGoalHero,
    appendAutoSolution: appendAutoSolution,
    formatSolutionBody: formatSolutionBody,
    autoVerdictTone: autoVerdictTone,
    renderManualSolvedSummary: renderManualSolvedSummary,
    stageNode: stageNode,
    buildBannerShell: buildBannerShell,
    buildPlaceStrip: buildPlaceStrip,
    renderCommitOutcome: renderCommitOutcome,
    deriveMoveLead: deriveMoveLead,
    moveLead: moveLead,
    renderMoveFacet: renderMoveFacet,
    appendMoveFacet: appendMoveFacet,
    autoVerdictTitle: autoVerdictTitle,
    setNativeSearchLabel: setNativeSearchLabel,
    nativeAutoSearchLabel: nativeAutoSearchLabel,
    autoSubtext: autoSubtext,
    solvedBodyOf: solvedBodyOf,
  };
}

export { createDisplay as create };
