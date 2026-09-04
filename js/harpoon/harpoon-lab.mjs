'use strict';

// Harpoon — the Harpoon UI (Architecture II).
import { create as createDisplay } from './harpoon-lab-display.mjs';
import { create as createCommit } from './harpoon-lab-commit.mjs';
import { create as createReel } from './harpoon-lab-reel.mjs';
import { create as createAuto } from './harpoon-lab-auto.mjs';
import { create as createTreeUi } from './harpoon-lab-tree-ui.mjs';
import { create as createManual } from './harpoon-lab-manual.mjs';

const global = globalThis;
function E() { return global.BelEditor || null; }
  function P() { return global.HarpoonEngine || null; }
  function FW() { return global.FloatingWindow || null; }

  function toast(msg, kind) {
    var T = global.Toasts;
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
  function compromiseBannerIcon(c) {
    if (c && c.level === 'warn') {
      return '<span class="harpoon-lab-banner-warn-glyph" aria-hidden="true">!</span>';
    }
    return ICON_ALERT;
  }
  var ICON_CHEVRON_RIGHT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="m9 6 6 6-6 6"/>'
    + '</svg>';
  var ICON_CHEVRON_LEFT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="m15 18-6-6 6-6"/>'
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
  // ORCA — the DORSAL FIN breaking the surface, not a whale.
  // ⛔ A whale silhouette is the one thing this glyph must not be: at 17px an orca
  // and a beluga are the same rounded blob, and Beluga is the proof assistant we
  // sit on top of. Naming the search after the beluga's predator only works if the
  // icon cannot be mistaken for the beluga.
  // ⭐ The fin is the answer, and the reason is anatomical: a beluga has NO dorsal
  // fin at all — just a low ridge, an adaptation for surfacing under pack ice. The
  // tall swept fin is therefore the single feature a beluga physically cannot have,
  // and it is unmistakable in silhouette.
  // MASS AT THE TOP (a filled fin, not an outline — at 17px an outlined fin is two
  // hairlines around nothing) over a single WAVE.
  // ⛔ It was two straight horizontals, and that read as a BOAT: a triangle above a
  // long waterline with a shorter line under it is a hull and its reflection, so the
  // glyph said "sailing" rather than "something is under there". One wave fixes it,
  // because a fin cutting water is the only reason water would be disturbed.
  // ⛔ The FIN had to be reshaped too, not just the water. Its first form had a long
  // swept left edge rising to a peak with a near-vertical right edge straight down to a
  // flat base — which is a SAIL. Swapping the rules for a wave under a sail still read
  // as sailing. What separates a dorsal fin from a sail is the trailing edge: a sail's
  // luff is straight, a fin's trailing edge is CONCAVE and swept back.
  //
  // Geometry, worked out rather than eyeballed. Each control point is placed relative to
  // its own chord, since that is what decides which way an edge bows:
  // A gentle lean was not enough: a nearly symmetric triangle is a sail whatever its edges
  // are doing, because at this size a shallow curve reads as straight. The tip has to
  // OVERHANG the base. Nothing rigged like a sail leans past its own footing, so the
  // overhang alone settles what the shape is.
  //   · base (6.4,15.4)→(14.2,15.4), 7.8 wide. Tip (16.2,4.4) — 2.0 PAST the base's rear
  //     corner, which is the whole read.
  //   · leading edge base-front→tip, control (9.4,8.2) against a chord midpoint of
  //     (11.3,9.9). Up and left of it, so the edge bulges outward: convex, the way the
  //     front of a fin does.
  //   · trailing edge tip→base-rear, control (13.6,10.4) against a chord midpoint of
  //     (15.2,9.9). Well left of the chord, so this edge cuts INWARD. That hook is what a
  //     sail's straight luff can never do.
  //   · height 11.0 against a 7.8 base — taller than it is wide, as a fin is.
  // ⛔ The water was three identical quadratic humps, and it read as a tilde string rather
  // than a surface. Amplitude was not the fault: at 2.4 peak-to-peak over a 5.6 half-period
  // its proportions were near enough to a well-drawn wave. Three things were:
  //   1. every hump began and ended ON the baseline, which is where a sinusoid is at its
  //      STEEPEST (40.6° here). So the round caps — the blunt fat end of a 1.85 stroke —
  //      were parked at the exact moment of fastest motion. The line stopped dead instead
  //      of receding, and a stroke that stops mid-gesture always looks cut off.
  //   2. three identical humps at identical spacing is a repeating pattern, and a pattern
  //      reads as ornament. Water is not periodic at this scale.
  //   3. it was symmetric under an asymmetric fin, so the two shapes shared a frame
  //      without relating to one another.
  //
  // Rebuilt as three cubics with the turns placed deliberately:
  //   · every turning point has a HORIZONTAL tangent, set by giving both controls of a
  //     hump the same x (its midpoint) and the y of the point they lead into. That is what
  //     makes a crest broad instead of pointed.
  // The water is three humps because three humps is the CONVENTIONAL sign for water, and
  // at 17px recognition comes from convention, not from anatomy. Two smoother turns and one
  // long tapered S were both tried, both looked better drawn large, and both read as a
  // tilde at the size it ships. Compare candidates at 17px rather than reasoning about
  // curves: scratch/probes/orca-water-sheet.mjs puts them side by side.
  // What was actually wrong with the first attempt was only that it was faint — 2.4
  // peak-to-peak under a 1.85 stroke. Deeper at 3.0, heavier at 2.0, same shape.
  // The stroke applies to the water alone; the fin carries stroke="none".
  //   · span 3→20.4, wider than the fin, three quadratics of 5.8. A quadratic peaks at HALF
  //     its control offset, so −3 gives a band of y 17.3→20.3.
  //   · `t` reflects the previous control, so the humps alternate without restating each.
  //   · the crest tops out at 16.3 against a fin base of 15.4 — 0.9 clear, close enough
  //     that the two shapes read as one object rather than a fin above a separate line.
  var ICON_ORCA =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M6.4 15.4Q9.4 8.2 16.2 4.4Q13.6 10.4 14.2 15.4Z" '
    + 'fill="currentColor" stroke="none"/>'
    + '<path d="M3 18.8q2.9-3 5.8 0t5.8 0t5.8 0"/>'
    + '</svg>';
  var ICON_CHEVRON_DOWN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="m6 9 6 6 6-6"/>'
    + '</svg>';
  // "This one does not work" — an X. A dash reads as "omitted" or "neutral"; a
  // tactic the checker has refused is a definite no and should look like one.
  var ICON_DECLINE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M7 7 17 17"/><path d="M17 7 7 17"/>'
    + '</svg>';
  // "I'll take it from here" — a pointer. Sits beside pause (stop the clock) and
  // pop-out (expand); a bare chevron said only "back", which is not the action.
  var ICON_TAKEOVER =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M5 3.4 18.6 10.6 12.3 12.3 9.6 18.6Z"/>'
    + '</svg>';

  // ONE tactic vocabulary for the whole surface. Our engine's move kinds ARE
  // Harpoon's tactics, so they are named as Harpoon names them — in the picker,
  // in the manual trail, and in Orca's solve reel alike. A proof should not
  // change language depending on who built it.
  var TACTIC_VERB = {
    intro: 'intros',
    split: 'split',
    invert: 'invert',
    impossible: 'impossible',
    fill: 'solve',
    recurse: 'by',
    lemma: 'by',
    synth: 'chain',
  };
  function tacticVerb(kind) {
    return TACTIC_VERB[kind] || kind || 'move';
  }

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

  // Build a rich tooltip fragment: a small label above a syntax-highlighted
  // type/source fragment. `kind` is 'type' (comp type) or 'source'.
  function buildLabeledCodeTip(label, code, kind) {
    var frag = document.createDocumentFragment();
    if (label) {
      var lab = el('div', 'hpt-tip-note');
      lab.textContent = label;
      frag.appendChild(lab);
    }
    var host = el('div', 'hpt-tip-code');
    if (kind === 'source') renderSource(host, code);
    else renderType(host, code);
    frag.appendChild(host);
    return frag;
  }

  function bindStepGoalTip(host, goal) {
    if (!host) return;
    var shown = goal ? displayType(goal) : '';
    if (!shown) {
      if (global.Tooltips && global.Tooltips.setRich) global.Tooltips.setRich(host, null);
      setTip(host, '', { ariaLabel: false });
      host.removeAttribute('data-tooltip-placement');
      return;
    }
    host.setAttribute('data-tooltip-placement', 'below');
    if (global.Tooltips && typeof global.Tooltips.setRich === 'function') {
      global.Tooltips.setRich(host, function () {
        return buildLabeledCodeTip('Goal at this step', goal, 'type');
      }, 'Goal at this step: ' + shown);
    } else {
      setTip(host, 'Goal at this step: ' + shown, { ariaLabel: false });
    }
  }

  function bindChipTip(el, tip, richCode, richKind, placement) {
    if (!el || !tip) return;
    el.setAttribute('data-tooltip-placement', placement || 'below');
    el.setAttribute('data-tooltip-no-track', '');
    if (richCode && global.Tooltips && typeof global.Tooltips.setRich === 'function') {
      global.Tooltips.setRich(el, function () {
        return buildLabeledCodeTip(tip, richCode, richKind || 'type');
      }, tip);
    } else {
      setTip(el, tip, { ariaLabel: false });
    }
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

  // Prefer the mounted editor's document id — Persist.getActiveFileId can
  // lag behind the open tab (tabs use persist.getCurrentFileId).
  function liveEditorFileId() {
    var api = global.CurrentEditor;
    if (api && typeof api.getDocumentId === 'function') {
      var docId = api.getDocumentId();
      if (docId) return docId;
    }
    if (api && typeof api.getActiveFileId === 'function') {
      var edId = api.getActiveFileId();
      if (edId) return edId;
    }
    var P = global.Persist;
    return P && P.getActiveFileId ? P.getActiveFileId() : null;
  }

  function liveFileText(fileId) {
    var P = global.Persist;
    if (!P || !fileId) return '';
    var api = global.CurrentEditor;
    if (fileId === liveEditorFileId() && api && typeof api.getValue === 'function') {
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
    var loc = ed.locateMember
      ? ed.locateMember(docText, anchor.declName)
      : null;
    var from;
    var to;
    if (loc) {
      from = loc.from;
      to = loc.to;
    } else {
      var re = new RegExp(
        '(^|[\\n\\r])[ \\t]*(?:and\\s+(?:rec\\s+)?|(?:rec|proof)\\s+)'
          + String(anchor.declName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:',
      );
      var m = re.exec(docText);
      if (!m) return null;
      from = m.index + m[1].length;
      var semi = docText.indexOf(';', from);
      to = semi < 0 ? docText.length : semi + 1;
    }
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
    var off = bodyStart + qIdx;
    return { hole: { line: line, col: col, name: null }, from: off, to: off + 1 };
  }

  // Display/commit peels — filled by __initHarpoonLabPeels.
  var displayApi = null;
  var commitApi = null;

  function normalizeGlyphs() { return displayApi.normalizeGlyphs.apply(null, arguments); }
  function displayType() { return displayApi.displayType.apply(null, arguments); }
  function displaySource() { return displayApi.displaySource.apply(null, arguments); }
  function renderType() { return displayApi.renderType.apply(null, arguments); }
  function renderSource() { return displayApi.renderSource.apply(null, arguments); }
  function peelDisplayGoal() { return displayApi.peelDisplayGoal.apply(null, arguments); }
  function resolveNativeAutoGoalDisplay() { return displayApi.resolveNativeAutoGoalDisplay.apply(null, arguments); }
  function fullDeclSignature() { return displayApi.fullDeclSignature.apply(null, arguments); }
  function priorGoalBinders() { return displayApi.priorGoalBinders.apply(null, arguments); }
  function mountGoalPriors() { return displayApi.mountGoalPriors.apply(null, arguments); }
  // `prep.declKey` is `kw + ':' + name`, so the keyword the author actually wrote is already
  // known here. Never default it: guessing `rec` would silently mislabel every `proof`.
  function declKwOf(prep) {
    var key = (prep && prep.declKey) || '';
    var i = key.indexOf(':');
    return i > 0 ? key.slice(0, i) : '';
  }
  function appendAutoGoalHero() { return displayApi.appendAutoGoalHero.apply(null, arguments); }
  function appendAutoSolution() { return displayApi.appendAutoSolution.apply(null, arguments); }
  function formatSolutionBody() { return displayApi.formatSolutionBody.apply(null, arguments); }
  function autoVerdictTone() { return displayApi.autoVerdictTone.apply(null, arguments); }
  function renderManualSolvedSummary() { return displayApi.renderManualSolvedSummary.apply(null, arguments); }
  function stageNode() { return displayApi.stageNode.apply(null, arguments); }
  function buildBannerShell() { return displayApi.buildBannerShell.apply(null, arguments); }
  function buildPlaceStrip() { return displayApi.buildPlaceStrip.apply(null, arguments); }
  function renderCommitOutcome() { return displayApi.renderCommitOutcome.apply(null, arguments); }
  function deriveMoveLead() { return displayApi.deriveMoveLead.apply(null, arguments); }
  function moveLead() { return displayApi.moveLead.apply(null, arguments); }
  function renderMoveFacet() { return displayApi.renderMoveFacet.apply(null, arguments); }
  function appendMoveFacet() { return displayApi.appendMoveFacet.apply(null, arguments); }
  function autoVerdictTitle() { return displayApi.autoVerdictTitle.apply(null, arguments); }
  function setNativeSearchLabel() { return displayApi.setNativeSearchLabel.apply(null, arguments); }
  function autoSubtext() { return displayApi.autoSubtext.apply(null, arguments); }
  function nativeAutoSearchLabel() { return displayApi.nativeAutoSearchLabel.apply(null, arguments); }
  function solvedBodyOf() { return displayApi.solvedBodyOf.apply(null, arguments); }
  function defaultCommitState() { return commitApi.defaultCommitState(); }
  function commitFailureUserMessage() { return commitApi.commitFailureUserMessage(); }

  /**
   * Every live lab, newest last — panel and floats alike.
   *
   * The command layer needs "the lab the user is looking at", and neither half
   * knows that alone: the panel holds one session, `floatSessions` holds the
   * windows, and a chord has to reach whichever one has the user's attention.
   */
  var liveSessions = [];

  /**
   * The session a keyboard command drives: the one holding DOM focus, else the
   * most recently opened. Null when no lab is open — which is what gates the
   * `harpoon.*` commands out of the palette rather than letting them no-op.
   */
  function activeSession() {
    var active = global.document ? global.document.activeElement : null;
    var newest = null;
    for (var i = liveSessions.length - 1; i >= 0; i -= 1) {
      var s = liveSessions[i];
      // A session with no `bodyEl` is mid-construction — there is nothing on
      // screen yet, so it is not what the user is looking at.
      if (!s || !s.bodyEl) continue;
      if (active && s.bodyEl.contains(active)) return s;
      if (!newest) newest = s;
    }
    return newest;
  }

  function trackSession(session) {
    if (liveSessions.indexOf(session) < 0) liveSessions.push(session);
  }

  function untrackSession(session) {
    var at = liveSessions.indexOf(session);
    if (at !== -1) liveSessions.splice(at, 1);
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
    this.commitState = defaultCommitState();
    this._verdictPopPlayed = false;
    // Tracked from construction, not from `runSession`: the invariant is "a
    // Session exists ⇒ a command can reach it", and `disposeSession` is the one
    // place it stops being true.
    trackSession(this);
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

  Session.prototype.finishCommitSuccess = function () {
    var st = this.getCommitState();
    st.status = 'placed';
    st.phase = null;
    st.detail = '';
    st.dismissed = true;
    this.unbindProbe();
    this.compromise = { level: 'none', reason: '', detail: '' };
    var body = this.bodyEl;
    if (body) {
      var box = body.querySelector('.harpoon-lab-auto');
      if (box) box.classList.add('is-frozen');
      var place = body.querySelector('.harpoon-lab-place');
      if (place) place.remove();
      if (this._compromiseBanner) this._compromiseBanner.hidden = true;
      this.updateCompromiseBanner();
    }
    try {
      var focusNext = typeof Persist === 'undefined' || Persist.readStoredAutosolveFocusNext();
      if (focusNext && global.CurrentEditor && typeof global.CurrentEditor.cycleHole === 'function') {
        global.CurrentEditor.cycleHole(1);
      }
    } catch (_) {}
  };

  Session.prototype.finishCommitFailure = function (detail, canRetry, opts) {
    opts = opts || {};
    var st = this.getCommitState();
    var raw = String(detail || 'The proof did not re-check.');
    var checkerReject = opts.kind === 'checker';
    st.status = 'failed';
    st.phase = null;
    if (checkerReject) {
      st.detail = commitFailureUserMessage();
      st.detailRaw = raw;
      toast(st.detail, 'error');
      var N = global.Notifications;
      if (N && typeof N.emit === 'function') {
        N.emit({
          kind: 'error',
          category: 'ops',
          title: st.detail,
          detail: raw,
          source: 'harpoon.commit',
          dedupeKey: 'harpoon.commit.checker',
        });
      }
    } else {
      st.detail = raw;
      st.detailRaw = '';
    }
    st.canRetry = !!canRetry;
    st.dismissed = false;
    this.render();
  };

  Session.prototype.resetCommitForRetry = function () {
    var st = this.getCommitState();
    st.status = 'idle';
    st.phase = null;
    st.detail = '';
    st.detailRaw = '';
    st.usedFullCheck = false;
    st.canRetry = false;
    st.dismissed = false;
    this.render();
  };

  Session.prototype.abortCommitChecking = function (detail, canRetry) {
    if (canRetry) this.resetCommitForRetry();
    else this.finishCommitFailure(detail, false);
  };

  Session.prototype.clearPendingCommitNav = function () {
    if (this._pendingCommitNavTimer != null) {
      global.clearTimeout(this._pendingCommitNavTimer);
      this._pendingCommitNavTimer = null;
    }
    if (this._pendingCommitNavListener) {
      global.removeEventListener('beljar:active-editor-view', this._pendingCommitNavListener);
      this._pendingCommitNavListener = null;
    }
    this.pendingCommitSource = null;
  };

  Session.prototype.bindProbe = function () {
    if (probeSessions.indexOf(this) === -1) probeSessions.push(this);
  };

  Session.prototype.unbindProbe = function () {
    var idx = probeSessions.indexOf(this);
    if (idx !== -1) probeSessions.splice(idx, 1);
  };

  Session.prototype.resolveView = function () {
    var api = global.CurrentEditor;
    if (!api || !this.fileId) return this.view;
    if (liveEditorFileId() === this.fileId && typeof api.getView === 'function') {
      var v = api.getView();
      if (v) this.view = v;
    }
    return this.view;
  };

  Session.prototype.captureAnchor = function (view, prep) {
    var ed = E();
    if (!ed || typeof ed.captureHarpoonAnchor !== 'function' || !prep) return;
    var api = global.CurrentEditor;
    var P = global.Persist;
    var fileId = this.fileId || (P && P.getActiveFileId ? P.getActiveFileId() : null);
    var fileText = view
      ? view.state.doc.toString()
      : (prep.fileText != null ? prep.fileText : liveFileText(fileId));
    var declSlice = prep.span
      ? (view
        ? view.state.doc.sliceString(prep.span.from, prep.span.to)
        : fileText.slice(prep.span.from, prep.span.to))
      : '';
    this.anchor = ed.captureHarpoonAnchor(prep, {
      fileId: fileId,
      fileText: fileText,
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
    var api = global.CurrentEditor;
    var active = liveEditorFileId() === fileId;
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

  /**
   * Mirror the search into the status strip so Orca is watchable without the
   * Harpoon panel open. Driven by `nativeAuto.phase`, which is the lab's own
   * authority on whether a search is live — never inferred from silence.
   */
  function pushOrca(session, label) {
    if (typeof window === 'undefined' || !window.StatusStrip) return;
    var na = session && session.nativeAuto;
    if (!na || na.phase !== 'searching') {
      window.StatusStrip.setOrca(false);
      return;
    }
    window.StatusStrip.setOrca(true, na.paused ? 'paused' : (label || ''));
  }

  Session.prototype.stopNativeAuto = function () {
    this.userCancelled = true;
    if (this.nativeAuto && this.nativeAuto.phase === 'searching') {
      setNativeSearchLabel(this.nativeAuto, 'Stopping…');
      this.updateNativeAutoSearch();
      pushOrca(this, 'stopping');
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
    var api = global.CurrentEditor;
    var eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
    var hit = this.findLiveHit(view, eng);
    if (!hit) {
      toast('The proof hole is no longer there.', 'error');
      return;
    }
    var prep = view
      ? prepareForHole(view, hit)
      : prepareForHoleInFile(this.fileId || (this.anchor && this.anchor.fileId), hit);
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
    var tone = c.level === 'block' ? ' tone-error' : (c.level === 'warn' ? ' tone-warn' : '');
    banner.className = 'harpoon-lab-auto-compromise harpoon-lab-strip harpoon-lab-banner is-' + c.level + tone
      + (na && na.phase === 'searching' ? ' is-searching' : '');
    if (c.level === 'none') {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    var badge = banner.querySelector('.harpoon-lab-compromise-badge');
    if (badge) badge.innerHTML = compromiseBannerIcon(c);
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
          : 'Insert into the file';
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
      icon: compromiseBannerIcon(c),
      badgeClass: 'harpoon-lab-compromise-badge',
      copyClass: 'harpoon-lab-compromise-copy',
      titleClass: 'harpoon-lab-compromise-title',
      subClass: 'harpoon-lab-compromise-sub',
      title: compromiseBannerTitle(c),
      sub: compromiseBannerSub(c),
      onClick: function () { self.restartNativeAuto(); },
    });
    if (c.level === 'none') banner.hidden = true;
    // APPEND, so position is decided by call order rather than forced to the
    // top. Both surfaces want it in the banner segment beneath the goal; the
    // hard prepend put it above, splitting the goal off from its own banners.
    parent.appendChild(banner);
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
    // Parsed hole positions are proveCode-relative (assembled + trimmed prelude),
    // NOT doc-relative — map them back onto the doc hit before matching.
    if (typeof ed.mapProveHolesToDocHits === 'function') {
      var mapped = ed.mapProveHolesToDocHits(
        holes, prep.proveCode || prep.assembledCode, prep.name, [prep.hit]);
      for (var m = 0; m < mapped.length; m++) {
        var mh = mapped[m];
        if (mh.line === line && (mh.col || 1) === col && mh.goal) { match = mh; break; }
      }
    }
    for (var i = 0; !match && i < holes.length; i++) {
      var h = holes[i];
      if (h.line === line && (h.col || 1) === col && h.goal) { match = h; break; }
    }
    if (!match || !match.goal) return;
    this.nativeAuto.goalType = match.goal;
    this.nativeAuto.goalState = 'live';
    this.nativeAuto.priorBinders = priorGoalBinders(
      this, this.nativeAuto.sourceGoalType, match.goal);
    if (this._autoGoalWrap) {
      var goalHost = this._autoGoalWrap.querySelector('.harpoon-hole-goal');
      var ed = typeof global.BelEditor !== 'undefined' ? global.BelEditor : null;
      if (goalHost && ed && typeof ed.mountHoleGoalTier === 'function') {
        ed.mountHoleGoalTier(goalHost, { surface: 'lab', goalState: 'live', goal: match.goal });
      } else if (goalHost) {
        renderType(goalHost, match.goal);
      }
      mountGoalPriors(this._autoGoalWrap, this.nativeAuto.priorBinders);
    }
  };

  // Resolve the reconstructed signature from the PROVER's own loaded program
  // (one surgical worker job — no intel-slot eviction). This is what makes
  // priors work when the proof hole lives in a file that is not the active
  // editor file: the active file's semantic engine cannot answer for it.
  Session.prototype.resolveFullDeclSignature = function (proveCode, sourceType) {
    var self = this;
    var ed = E();
    var client = global.BelugaClient;
    var name = this.prep && this.prep.name;
    if (!ed || !client || typeof client.ideDeclTypeForProver !== 'function'
        || !name || !proveCode) return;
    if (this._fullDeclSigRequested === name) return;
    this._fullDeclSigRequested = name;
    client.ideDeclTypeForProver(proveCode, name).then(function (raw) {
      var r = null;
      try { r = JSON.parse(raw); } catch (e) { r = null; }
      if (!r || !r.ok || r.type == null) return;
      var merged = typeof ed.mergeDeclSignatures === 'function'
        ? (ed.mergeDeclSignatures(sourceType, String(r.type)) || String(r.type))
        : String(r.type);
      self._fullDeclSig = { name: name, type: merged };
      var na = self.nativeAuto;
      if (!na) return;
      na.priorBinders = priorGoalBinders(self, na.sourceGoalType, na.goalType);
      if (self._autoGoalWrap) mountGoalPriors(self._autoGoalWrap, na.priorBinders);
    }).catch(function () { self._fullDeclSigRequested = null; });
  };

  // `codeOverride` lets Orca run from the manual session's WORKING program
  // rather than the pristine one — i.e. "finish the proof from here".
  Session.prototype.runNativeAuto = function (codeOverride) {
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
    var proveCode = codeOverride || prep.proveCode || prep.assembledCode;
    var api = global.CurrentEditor;
    var eng = api && typeof api.getSemanticEngine === 'function' ? api.getSemanticEngine() : null;
    var goalHit = typeof ed.resolveHoleGoalForHit === 'function'
      ? ed.resolveHoleGoalForHit(this.view, eng, prep.hit)
      : { goal: thm.compType && thm.compType.raw ? thm.compType.raw : '', state: 'approximate', loadingLive: true };
    if ((!goalHit || !goalHit.goal) && prep.hit && prep.hit.hole && prep.hit.hole.goal) {
      // View-less (cross-file) session: reuse the goal the panel already showed.
      goalHit = { goal: prep.hit.hole.goal, state: prep.hit.hole.goalState || 'approximate' };
    }
    this.userCancelled = false;
    this._verdictPopPlayed = false;
    this.captureAnchor(this.view, prep);
    this.bindProbe();
    this.clearNativeAutoShell();
    var sourceGoalType = thm.compType && thm.compType.raw ? thm.compType.raw : '';
    var initialGoalState = goalHit.state || 'approximate';
    var initialGoalType = peelDisplayGoal(goalHit.goal || sourceGoalType, initialGoalState);
    this.nativeAuto = {
      phase: 'searching',
      steps: [],
      trace: [],
      stuck: null,
      complete: false,
      paused: false,
      goalType: initialGoalType,
      goalState: initialGoalState,
      sourceGoalType: sourceGoalType,
      priorBinders: priorGoalBinders(this, sourceGoalType, initialGoalType),
      declName: thm.name || (this.prep && this.prep.name) || '',
      declKw: declKwOf(this.prep),
      theoremSnapshot: {
        premiseCount: (thm.compType && thm.compType.premises && thm.compType.premises.length) || 0,
        totality: thm.totality || null,
        conclusion: (thm.compType && thm.compType.conclusion) || '',
      },
      searchLabel: 'Starting Beluga…',
      labelAt: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
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
    function pulseLabel(label) {
      if (!self.nativeAuto || self.nativeAuto.paused) return;
      setNativeSearchLabel(self.nativeAuto, label);
      self.syncReelStatus();
      pushOrca(self, String(label || '').replace(/[….]+$/, ''));
    }
    pulseLabel('Starting Beluga…');
    var proverReady = client.beginProverSession ? client.beginProverSession() : Promise.resolve();
    var warm = client.loadProverChecker && proveCode
      ? client.loadProverChecker(proveCode)
      : Promise.resolve();
    return proverReady.then(function () {
      pulseLabel('Loading the program…');
      return warm;
    }).then(function () {
      self.resolveFullDeclSignature(proveCode, sourceGoalType);
      if (client.checkResultForProver) {
        pulseLabel('Reading the goal…');
        return client.checkResultForProver(proveCode).then(function (base) {
          if (base && base.output) self.upgradeNativeAutoGoal(base.output, prep);
        });
      }
    }).then(function () {
      pulseLabel('Starting search…');
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
            var tryKey = pulse.wave.map(function (c) {
              return String(c.kind || '') + '\0' + String(c.head || '');
            }).join('|');
            setNativeSearchLabel(na, 'Trying ' + (pulse.trying || pulse.wave[0].kind) + '…', {
              tryKey: tryKey,
            });
            self.feedConveyor(pulse.wave);
          } else if (pulse.verdict) {
            var v = pulse.verdict;
            if (v.verdict === 'accepted') setNativeSearchLabel(na, 'Found ' + v.kind);
            self.markConveyor(v);
          } else if (pulse.trying) {
            setNativeSearchLabel(na, 'Trying ' + pulse.trying + '…', {
              tryKey: 'kind:' + pulse.trying,
            });
          } else if (pulse.label) {
            setNativeSearchLabel(na, pulse.label);
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
          // Where the search has actually got to — what "take over" inherits.
          if (info.code) na.liveCode = info.code;
          // The successor hole report, straight from the search. Lets the panel
          // show the CURRENT context while the run continues instead of the
          // pre-search one, at no checker cost.
          // ⛔ Refresh from HERE. `onStep` is the only per-step signal during a
          // run: it does not call `render()` (the fast path) or
          // `updateNativeAutoSearch`, so a refresh hung off either of those never
          // fires while the search is actually moving, and the context only
          // caught up once the run ended.
          if (info.holes) {
            na.liveHoles = info.holes;
            self.syncLiveContext();
          }
          na.checks = na.steps.reduce(function (t, s) { return t + (s.checks || 0); }, 0);
          if (!na.paused) {
            setNativeSearchLabel(na, 'Step ' + na.steps.length
              + (info.last && info.last.move ? (' · ' + info.last.move) : ''));
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
      // RETIRED: the user took a step by hand while paused. The manual state is
      // already correct (synced at pause), so just let the surface settle — do
      // not resurrect a verdict for a search nobody is waiting on.
      if (self._retireOrca) {
        self._retireOrca = false;
        self.userCancelled = false;
        self.render();
        return false;
      }
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
        sourceGoalType: self.nativeAuto && self.nativeAuto.sourceGoalType,
        priorBinders: self.nativeAuto && self.nativeAuto.priorBinders,
        declName: self.nativeAuto && self.nativeAuto.declName,
        theoremSnapshot: self.nativeAuto && self.nativeAuto.theoremSnapshot,
        hadLiveTrail: !!(self.nativeAuto && self.nativeAuto.steps && self.nativeAuto.steps.length),
        commit: priorCommit || defaultCommitState(),
      };
      self.render();
      // Final state (trace + stuck/complete): grow the pop-out tree to it if open.
      self.refreshTreeExplorer();
      // ONE SURFACE: hand the result to the working program so the panel shows
      // what actually happened rather than the state it started from.
      if (self.manual) self.absorbOrcaResult(r);
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
        sourceGoalType: self.nativeAuto && self.nativeAuto.sourceGoalType,
        priorBinders: self.nativeAuto && self.nativeAuto.priorBinders,
        declName: self.nativeAuto && self.nativeAuto.declName,
        stuck: (cancelled && self.userCancelled)
          ? { reason: 'stopped' }
          : (cancelled ? { reason: 'cancelled' } : { reason: err && err.message ? err.message : String(err) }),
      };
      self.render();
      self.refreshTreeExplorer();
      return false;
    }).finally(function () {
      // The search is over, whatever the outcome — the bar must stop claiming
      // Orca is running.
      pushOrca(self);
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

  Session.prototype.disposeSession = function () {
    untrackSession(this);
    this.clearPendingCommitNav();
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

  // The derivation surfaces (list ⇄ tree, the pop-out explorer) are shared by
  // both ways of building a proof, so they must not read `nativeAuto` directly —
  // a hand-built proof has the same steps and deserves the same instruments.
  // `_manualNa` is the manual session projected into that shape.
  // Everything about the manual surface that changes its STRUCTURE rather than
  // just its status text. Compared against what was last drawn to decide whether
  // render() may take its in-place fast path.
  function manualRenderSig(session) {
    var na = session.nativeAuto;
    var m = session.manual;
    if (!m) return 'no-manual';
    return [
      na ? na.phase : 'idle',
      na && na.paused ? 'paused' : 'live',
      m.phase,
      m.syncing ? 'syncing' : '',
      m.syncFailed ? 'syncfail' : '',
      m.busy ? 'busy' : '',
    ].join('|');
  }

  Session.prototype.derivationNa = function () {
    return this.nativeAuto || this._manualNa || null;
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

  // ── Lab peer systems (reel / auto / tree-ui) ────────────────────────────────
  var reelApi = null;
  var autoApi = null;
  var treeUiApi = null;
  var manualApi = null;

  function renderSynthChain(meta, variant) {
    return treeUiApi.renderSynthChain(meta, variant);
  }

  function __initHarpoonLabPeels() {
    displayApi = createDisplay({
      el: function () { return el.apply(null, arguments); },
      E: E,
      setTip: function () { return setTip.apply(null, arguments); },
      liveEditorFileId: function () { return liveEditorFileId.apply(null, arguments); },
      bindChipTip: function () { return bindChipTip.apply(null, arguments); },
      renderSynthChain: function () { return renderSynthChain.apply(null, arguments); },
      ICON_CHECK: ICON_CHECK,
      ICON_ARROW_RIGHT: ICON_ARROW_RIGHT,
      ICON_ALERT: ICON_ALERT,
    });

    commitApi = createCommit({
      E: E,
      toast: function () { return toast.apply(null, arguments); },
      liveEditorFileId: function () { return liveEditorFileId.apply(null, arguments); },
      prepareForHole: function () { return prepareForHole.apply(null, arguments); },
    });

    reelApi = createReel({
      el: function () { return el.apply(null, arguments); },
      tacticVerb: tacticVerb,
      setTip: function () { return setTip.apply(null, arguments); },
      bindStepGoalTip: function () { return bindStepGoalTip.apply(null, arguments); },
      bindChipTip: function () { return bindChipTip.apply(null, arguments); },
      moveLead: displayApi.moveLead,
      appendMoveFacet: displayApi.appendMoveFacet,
      renderType: displayApi.renderType,
      renderSource: displayApi.renderSource,
      nativeAutoSearchLabel: displayApi.nativeAutoSearchLabel,
      resolveNativeAutoGoalDisplay: displayApi.resolveNativeAutoGoalDisplay,
      priorGoalBinders: displayApi.priorGoalBinders,
      mountGoalPriors: displayApi.mountGoalPriors,
      E: E,
      ICON_PLAY: ICON_PLAY,
      ICON_PAUSE: ICON_PAUSE,
    });

    treeUiApi = createTreeUi({
      el: function () { return el.apply(null, arguments); },
      iconBtn: function () { return iconBtn.apply(null, arguments); },
      setTip: function () { return setTip.apply(null, arguments); },
      bindChipTip: function () { return bindChipTip.apply(null, arguments); },
      renderType: displayApi.renderType,
      renderSource: displayApi.renderSource,
      appendAutoTree: function () { return reelApi.appendAutoTree.apply(reelApi, arguments); },
      nativeAutoSearchLabel: displayApi.nativeAutoSearchLabel,
      reelStatText: function () { return reelApi.reelStatText.apply(reelApi, arguments); },
      autoSubtext: displayApi.autoSubtext,
      autoVerdictTitle: displayApi.autoVerdictTitle,
      deriveMoveLead: displayApi.deriveMoveLead,
      liveFileText: function () { return liveFileText.apply(null, arguments); },
      lineColToOffset: function () { return lineColToOffset.apply(null, arguments); },
      labTitle: function () { return labTitle.apply(null, arguments); },
      FW: FW,
      E: E,
      ICON_POPOUT: ICON_POPOUT,
      ICON_CHEVRON_LEFT: ICON_CHEVRON_LEFT,
      ICON_CHEVRON_RIGHT: ICON_CHEVRON_RIGHT,
    });

    autoApi = createAuto({
      el: function () { return el.apply(null, arguments); },
      iconBtn: function () { return iconBtn.apply(null, arguments); },
      setTip: function () { return setTip.apply(null, arguments); },
      renderType: displayApi.renderType,
      renderSource: displayApi.renderSource,
      nativeAutoSearchLabel: displayApi.nativeAutoSearchLabel,
      autoSubtext: displayApi.autoSubtext,
      autoVerdictTitle: displayApi.autoVerdictTitle,
      autoVerdictTone: displayApi.autoVerdictTone,
      appendAutoGoalHero: displayApi.appendAutoGoalHero,
      appendDeclLabel: displayApi.appendDeclLabel,
      resolveNativeAutoGoalDisplay: displayApi.resolveNativeAutoGoalDisplay,
      priorGoalBinders: displayApi.priorGoalBinders,
      setNativeSearchLabel: displayApi.setNativeSearchLabel,
      appendCommittedStepRow: function () { return reelApi.appendCommittedStepRow.apply(reelApi, arguments); },
      solvedBodyOf: displayApi.solvedBodyOf,
      buildBannerShell: displayApi.buildBannerShell,
      stageNode: displayApi.stageNode,
      appendAutoSolution: displayApi.appendAutoSolution,
      buildPlaceStrip: displayApi.buildPlaceStrip,
      renderCommitOutcome: displayApi.renderCommitOutcome,
      ICON_PLAY: ICON_PLAY,
      ICON_PAUSE: ICON_PAUSE,
      ICON_POPOUT: ICON_POPOUT,
      ICON_CHECK: ICON_CHECK,
      ICON_STOP: ICON_STOP,
      ICON_CHEVRON_LEFT: ICON_CHEVRON_LEFT,
      ICON_TAKEOVER: ICON_TAKEOVER,
    });

    // Session methods — unbound so `this` is the session when called via prototype.
    Session.prototype.refreshNativeAutoGoalDisplay = reelApi.refreshNativeAutoGoalDisplay;
    Session.prototype.clearNativeAutoShell = reelApi.clearNativeAutoShell;
    Session.prototype.syncAutoPauseBtn = reelApi.syncAutoPauseBtn;
    Session.prototype.updateNativeAutoSearch = reelApi.updateNativeAutoSearch;
    Session.prototype.syncLiveContext = reelApi.syncLiveContext;
    Session.prototype.syncReelStatus = reelApi.syncReelStatus;
    Session.prototype.ensureWorkingRow = reelApi.ensureWorkingRow;
    Session.prototype.feedConveyor = reelApi.feedConveyor;
    Session.prototype.markConveyor = reelApi.markConveyor;
    Session.prototype.trimConveyor = reelApi.trimConveyor;
    Session.prototype.settleWorkingRow = reelApi.settleWorkingRow;
    Session.prototype._makeBranchGroup = reelApi._makeBranchGroup;
    Session.prototype.startReelClock = reelApi.startReelClock;
    Session.prototype.stopReelClock = reelApi.stopReelClock;

    Session.prototype.renderNativeAuto = autoApi.renderNativeAuto;
    Session.prototype.renderStuckCard = autoApi.renderStuckCard;

    Session.prototype.renderDerivationSection = treeUiApi.renderDerivationSection;
    Session.prototype.mountTreePanel = treeUiApi.mountTreePanel;
    Session.prototype.openTreeExplorer = treeUiApi.openTreeExplorer;
    Session.prototype.refreshTreeExplorer = treeUiApi.refreshTreeExplorer;
    Session.prototype.jumpToTreeHole = treeUiApi.jumpToTreeHole;
    Session.prototype.renderTreeDetail = treeUiApi.renderTreeDetail;

    Session.prototype.pendingCommitAfterNav = commitApi.pendingCommitAfterNav;
    Session.prototype.verifyAndCommit = commitApi.verifyAndCommit;

    // Manual Harpoon — the DEFAULT surface. Built last because it leans on the
    // display/reel vocabulary above (the goal hero, the place strip, the
    // committed step rows) so a hand-built proof reads exactly like a searched one.
    manualApi = createManual({
      el: function () { return el.apply(null, arguments); },
      iconBtn: function () { return iconBtn.apply(null, arguments); },
      setTip: function () { return setTip.apply(null, arguments); },
      toast: function () { return toast.apply(null, arguments); },
      E: E,
      renderSource: displayApi.renderSource,
      appendAutoGoalHero: displayApi.appendAutoGoalHero,
      appendDeclLabel: displayApi.appendDeclLabel,
      priorGoalBinders: displayApi.priorGoalBinders,
      buildPlaceStrip: displayApi.buildPlaceStrip,
      renderCommitOutcome: displayApi.renderCommitOutcome,
      stageNode: displayApi.stageNode,
      solvedBodyOf: displayApi.solvedBodyOf,
      appendCommittedStepRow: function () { return reelApi.appendCommittedStepRow.apply(reelApi, arguments); },
      appendAutoSolution: displayApi.appendAutoSolution,
      renderManualSolvedSummary: displayApi.renderManualSolvedSummary,
      tacticVerb: tacticVerb,
      setNativeSearchLabel: displayApi.setNativeSearchLabel,
      nativeAutoSearchLabel: displayApi.nativeAutoSearchLabel,
      ICON_UNDO: ICON_UNDO,
      ICON_REDO: ICON_REDO,
      ICON_ORCA: ICON_ORCA,
      ICON_CHEVRON_DOWN: ICON_CHEVRON_DOWN,
      ICON_DECLINE: ICON_DECLINE,
      ICON_CHECK: ICON_CHECK,
      ICON_PLAY: ICON_PLAY,
      ICON_PAUSE: ICON_PAUSE,
      ICON_POPOUT: ICON_POPOUT,
      manualRenderSig: manualRenderSig,
    });

    Session.prototype.startManual = manualApi.startManual;
    Session.prototype.renderManual = manualApi.renderManual;
    Session.prototype.manualGoalType = manualApi.manualGoalType;
    Session.prototype.manualApply = manualApi.manualApply;
    Session.prototype.manualStepBack = manualApi.manualStepBack;
    Session.prototype.manualStepForward = manualApi.manualStepForward;
    Session.prototype.manualFocus = manualApi.manualFocus;
    Session.prototype.sweepCandidates = manualApi.sweepCandidates;
    Session.prototype.cancelSweep = manualApi.cancelSweep;
    Session.prototype.runOrca = manualApi.runOrca;
    Session.prototype.toggleOrcaPause = manualApi.toggleOrcaPause;
    Session.prototype.absorbOrcaResult = manualApi.absorbOrcaResult;
    Session.prototype.syncManualToOrca = manualApi.syncManualToOrca;
    Session.prototype.scrollToDerivation = manualApi.scrollToDerivation;
    Session.prototype.backToManual = manualApi.backToManual;
    Session.prototype.commitManual = manualApi.commitManual;
  }

  __initHarpoonLabPeels();

  Session.prototype.render = function () {
    if (!this.bodyEl) return;
    var self = this;
    var body = this.bodyEl;

    // While Orca searches, its status line and reel are updated IN PLACE —
    // rebuilding the panel on every pulse would thrash the DOM and destroy the
    // user's scroll position, which now matters because the tactics stay on
    // screen above the live derivation.
    // …but only for STATUS changes. Pausing, resyncing after a pause, and a
    // failed resync all change the panel's structure (they unlock the tactics,
    // skeleton them, or replace them), and a status-only update would leave the
    // previous structure on screen — which is how a pause once stranded the user
    // with the tactics of a goal Orca had already left. `_renderSig` is what
    // renderManual last drew; anything else means rebuild.
    if (this.nativeAuto && this.nativeAuto.phase === 'searching'
        && this._autoSearchBox && body.contains(this._autoSearchBox)
        && this._renderSig === manualRenderSig(this)) {
      this.updateNativeAutoSearch();
      return;
    }

    // ── Hold the scroll position across a structural rebuild ─────────────────
    // `body.textContent = ''` drops every child, and the browser clamps the
    // scroller to 0 the moment its content collapses. So any render that is not
    // the in-place search pulse threw the reader back to the top: finishing the
    // initial load, a pause, a resync, a tactic landing. The band that scrolls is
    // an ANCESTOR of bodyEl (`.harpoon-panel-body`), not bodyEl itself, so find
    // it rather than assuming.
    // Restored synchronously after the rebuild, which is safe because the panel
    // is text and lays out in the same frame. A shorter panel clamps naturally,
    // and anything that deliberately moves the view (scrollToDerivation) runs in
    // a later frame and still wins.
    var scroller = body;
    while (scroller && scroller !== document.body) {
      var oy = '';
      try { oy = globalThis.getComputedStyle(scroller).overflowY; } catch (e) { oy = ''; }
      if ((oy === 'auto' || oy === 'scroll') && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentNode;
    }
    var keepTop = (scroller && scroller !== document.body) ? scroller.scrollTop : 0;

    this.clearNativeAutoShell();
    body.textContent = '';
    body.classList.remove('is-starting');
    // Restored in a MICROTASK, not a frame: `render` has several early returns,
    // so there is no single place to put this, and a microtask runs once the whole
    // synchronous rebuild is done but still BEFORE paint. A rAF would paint the
    // top-of-panel first and then snap, which is the flash we are removing.
    if (keepTop > 0) {
      Promise.resolve().then(function () {
        if (scroller && Math.abs(scroller.scrollTop - keepTop) > 1) scroller.scrollTop = keepTop;
      });
    }
    var m = this.model;

    // ONE SURFACE. The manual panel is the whole of Harpoon; Orca is a STATE
    // of it, not a screen that replaces it. While the search runs the tactics
    // stay in place (disabled) and the derivation below streams; pausing hands
    // the tactics straight back. `renderManual` renders every phase.
    if (this.manual) {
      this.renderManual(body);
      return;
    }
    // No manual session (legacy/standalone Orca) — its own surface still works.
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

  function finishPrepare(ed, ctx, span, decl, hit) {
    var assembled = String(ctx.code);
    var loc = ed.locateMember
      ? ed.locateMember(assembled, decl.name, ctx.fileStart || 0)
      : null;
    var declStart;
    var declEnd;
    var blockStart;
    var blockEnd;
    if (loc) {
      declStart = loc.from;
      declEnd = loc.to;
      blockStart = loc.blockFrom != null ? loc.blockFrom : loc.from;
      blockEnd = loc.blockTo != null ? loc.blockTo : loc.to;
    } else {
      var re = new RegExp(
        '(^|\\n)\\s*(?:and\\s+(?:rec\\s+)?|(?:rec|proof)\\s+)'
          + decl.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:',
      );
      var match = re.exec(assembled);
      if (!match) { toast('Harpoon: declaration not found in the checkable program.', 'error'); return null; }
      declStart = match.index + match[1].length;
      var semi = assembled.indexOf(';', declStart);
      declEnd = semi === -1 ? assembled.length : semi + 1;
      blockStart = declStart;
      blockEnd = declEnd;
    }
    var built = ed.buildProofProgram(assembled, declStart, declEnd);
    if (!built) { toast('Harpoon: couldn\u2019t build the proof program.', 'error'); return null; }
    var proveCode = (ed.proveOrchestrationCode)
      ? ed.proveOrchestrationCode(assembled, decl.name, blockStart, blockEnd, ctx.fileStart)
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
      assembledBlockFrom: blockStart,
      assembledBlockTo: blockEnd,
      proveCode: proveCode,
      offsetLines: ctx.offsetLines || 0,
      fileStart: ctx.fileStart != null ? ctx.fileStart : 0,
    };
  }

  function prepareForHole(view, hit) {
    var ed = E();
    var api = global.CurrentEditor;
    var ctx = api && typeof api.getHoleActionContext === 'function' ? api.getHoleActionContext() : null;
    if (!ctx || !ctx.code) { toast('Harpoon: no checkable program.', 'error'); return null; }
    var span = api.getMemberSpan ? api.getMemberSpan(hit.from)
      : (api.getDeclSpan ? api.getDeclSpan(hit.from) : null);
    if (!span) { toast('Harpoon: couldn\u2019t find the enclosing declaration.', 'error'); return null; }
    var decl = ed.parseDecl(view.state.doc.sliceString(span.from, span.to));
    if (!decl) { toast('Harpoon: only rec/proof declarations are supported.', 'error'); return null; }
    return finishPrepare(ed, ctx, span, decl, hit);
  }

  // Text-based prep for a file that is NOT mounted in the editor: the program
  // is assembled from stored texts for the file's own development, and the decl
  // span is located in the file text. No file switch happens; commit navigates
  // later via pendingCommitAfterNav.
  function prepareForHoleInFile(fileId, hit) {
    var ed = E();
    if (!ed || typeof ed.holeActionContextForFile !== 'function'
        || typeof ed.declSpanInText !== 'function') return null;
    var ctx = ed.holeActionContextForFile(fileId);
    if (!ctx || !ctx.code) { toast('Harpoon: no checkable program.', 'error'); return null; }
    var span = ed.memberSpanInText
      ? ed.memberSpanInText(ctx.fileText, hit.from)
      : ed.declSpanInText(ctx.fileText, hit.from);
    if (!span) { toast('Harpoon: couldn\u2019t find the enclosing declaration.', 'error'); return null; }
    var decl = ed.parseDecl(String(ctx.fileText).slice(span.from, span.to));
    if (!decl) { toast('Harpoon: only rec/proof declarations are supported.', 'error'); return null; }
    var prep = finishPrepare(ed, ctx, span, decl, hit);
    if (prep) prep.fileText = String(ctx.fileText);
    return prep;
  }

  var floatSessions = [];


  function holeKeyFromHit(hit) {
    if (!hit || !hit.hole) return '';
    return hit.hole.line + ':' + (hit.hole.col || 1) + ':' + (hit.hole.name || '');
  }

  function removeFloatSession(session) {
    var idx = floatSessions.indexOf(session);
    if (idx !== -1) floatSessions.splice(idx, 1);
    if (global.WorkspaceState && global.WorkspaceState.scheduleSave) {
      global.WorkspaceState.scheduleSave();
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
    var api = global.CurrentEditor;
    for (var j = 0; j < hits.length; j++) {
      var hit = hits[j];
      var span = null;
      if (api && api.getMemberSpan) span = api.getMemberSpan(hit.from);
      else if (api && api.getDeclSpan) span = api.getDeclSpan(hit.from);
      else if (ed && ed.getMemberSpan) span = ed.getMemberSpan(hit.from);
      else if (ed && ed.getDeclSpan) span = ed.getDeclSpan(hit.from);
      if (!span) continue;
      var decl = ed.parseDecl(view.state.doc.sliceString(span.from, span.to));
      if (decl && (decl.kw + ':' + decl.name) === anchor.declKey) return hit;
    }
    return null;
  }

  // Which surface the lab opens into. Manual unless the user has chosen otherwise.
  function openingMode() {
    var persist = global.Persist;
    if (persist && typeof persist.readStoredHarpoonMode === 'function') {
      return persist.readStoredHarpoonMode() === 'orca' ? 'orca' : 'manual';
    }
    return 'manual';
  }

  function runSession(view, prep, host) {
    var session = new Session(view, prep.span.from, prep.span.to, host);
    session.prep = prep;
    var persist = global.Persist;
    session.fileId = host.fileId
      || (persist && persist.getActiveFileId ? persist.getActiveFileId() : null);
    session.captureAnchor(view, prep);
    session.bindProbe();
    var content = el('div', 'harpoon-lab' + (host.kind === 'panel' ? ' harpoon-lab--panel' : ''));
    session.bodyEl = content;
    host.mount(content, session);
    if (host.onSessionStart) host.onSessionStart(prep.name);

    // BelJar drives \u2014 no OCaml Harpoon session either way. MANUAL is the default:
    // proving is an interactive act, and the search ("Orca") is one tactic within
    // it, one click from the manual surface. A user who wants the old
    // straight-to-search behaviour flips the preference.
    // Always the manual surface. Opening "in Orca" now means the search starts
    // itself once the goal is read — not that a different panel appears.
    var startOrca = openingMode() === 'orca';
    session.startManual().then(function (ok) {
      if (ok && startOrca) session.runOrca();
    });
    return session;
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
    var persist = global.Persist;
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
            if (global.WorkspaceState && global.WorkspaceState.scheduleSave) {
              global.WorkspaceState.scheduleSave();
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
        if (global.WorkspaceState && global.WorkspaceState.scheduleSave) {
          global.WorkspaceState.scheduleSave();
        }
      },
    });
    return session;
  }

  function labTitle(name) {
    var wrap = document.createElement('span');
    wrap.className = 'harpoon-lab-title';
    if (global.HarpoonIcon) global.HarpoonIcon.appendGlyph(wrap, 'harpoon-lab-title-glyph');
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

  // Solve a goal in a file that is NOT active — no file switch. The session
  // runs against the file's stored text; commit navigates when placing.
  function proveInPanelForFile(fileId, hit, container, opts) {
    var ed = E();
    if (!ed) { toast('Harpoon unavailable.', 'error'); return; }
    opts = opts || {};
    var prep = prepareForHoleInFile(fileId, hit);
    if (!prep) {
      if (opts.onSessionEnd) opts.onSessionEnd();
      return;
    }
    return runSession(null, prep, {
      kind: 'panel',
      fileId: fileId,
      onSessionStart: opts.onSessionStart,
      onSessionEnd: opts.onSessionEnd,
      onDone: opts.onDone,
      onBack: opts.onBack,
      mount: function (content) { container.textContent = ''; container.appendChild(content); },
    });
  }

  // Collect every open float, not just the active tab's. Sessions survive file
  // switches; filtering by active fileId left closed-tab ghosts in the snapshot
  // and dropped still-open windows when saving from another tab.
  function collectFloatingHarpoonWindows(_fileId, out) {
    if (!out.floating) out.floating = [];
    for (var i = 0; i < floatSessions.length; i++) {
      var s = floatSessions[i];
      if (!s.win || !s.win.getGeometry || !s.fileId) continue;
      out.floating.push({
        id: 'harpoon:' + s.fileId + ':' + (s.declKey || i),
        kind: 'harpoon',
        geom: s.win.getGeometry(),
        fileId: s.fileId,
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

  global.Harpoon = {
    // Test seam: probes mount a Session over a fabricated state to drive the
    // SHIPPED render/click paths rather than a re-implementation of them.
    _Session: Session,
    openFromHole: openFromHole,
    activeSession: activeSession,
    proveInPanel: proveInPanel,
    proveInPanelForFile: proveInPanelForFile,
    collectFloatingHarpoonWindows: collectFloatingHarpoonWindows,
    restoreFloatingHarpoonWindow: restoreFloatingHarpoonWindow,
  };
  global.BelJarHarpoon = global.Harpoon;
