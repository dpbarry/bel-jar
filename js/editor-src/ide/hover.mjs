import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import { forEachDiagnostic } from '@codemirror/lint';
import { ViewPlugin, closeHoverTooltips, hasHoverTooltips, hoverTooltip as cmHoverTooltip, repositionTooltips } from '@codemirror/view';
import { resolveHover } from '../name-resolve.mjs';
import { renderTypeInto } from '../format/type-render.mjs';
import { findGroupSignature } from '../semantic/project-prelude.mjs';
import { BUILTIN_TOOLTIPS } from './builtins.mjs';
import { isSuitePreludeBannerDiag } from '../semantic/suite-prelude-banner.mjs';
import { polishBelugaMessage } from './beluga-diag.mjs';

export const HOVER_OPEN_MS = 60;

export const LINT_TOOLTIP_FILTER = () => [];

// Phase-lock a freshly-created "Recalculating…" shimmer to a shared clock. Both
// its animations (the 1.4s opacity pulse and the 0.7s spinner) get a NEGATIVE
// animation-delay equal to elapsed-mod-period, so a node recreated mid-animation
// (e.g. the inspector full-rebuilds its body on each checker pass) resumes at the
// current phase instead of snapping the spinner back to 0° and opacity to 0.55.
const SHIMMER_PULSE_MS = 1400;
const SHIMMER_SPIN_MS = 700;
export function setShimmerPhase(elm) {
  if (!elm || !elm.style) return;
  const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  elm.style.setProperty('--shimmer-pulse-delay', '-' + (t % SHIMMER_PULSE_MS) + 'ms');
  elm.style.setProperty('--shimmer-spin-delay', '-' + (t % SHIMMER_SPIN_MS) + 'ms');
}

const IDENT = new Set(['LowerIdentifier', 'UpperIdentifier']);

// The hoverable head of a #p / $ρ variable is the sigil + identifier (+ any
// projection tail) — NOT the trailing substitution closure. A ParameterVariable
// node spans the whole "#p[.., x]"; anchoring to that would center the tooltip
// over the substitution and keep it open while the cursor is over "..", which
// belongs to its own (SubstHead) tooltip. Stop at the Substitution child.
function variableHeadEnd(node) {
  let to = node.from;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'Substitution') break;
    to = c.to;
  }
  return to;
}

function identRangeAt(state, pos) {
  for (const bias of [1, -1]) {
    const n = syntaxTree(state).resolveInner(pos, bias);
    if (n && IDENT.has(n.name)) {
      const p = n.parent;
      if (p && (p.name === 'ParameterVariable' || p.name === 'SubstitutionVariable')) {
        return { from: p.from, to: variableHeadEnd(p) };
      }
      // Bound-variable projection (b2.2): extend over the trailing tail so the
      // whole thing is one hoverable entity.
      const proj = n.nextSibling;
      return { from: n.from, to: proj && proj.name === 'ProjectionTail' ? proj.to : n.to };
    }
    if (n && (n.name === '#' || n.name === '$')) {
      const p = n.parent;
      if (p && (p.name === 'ParameterVariable' || p.name === 'SubstitutionVariable')) {
        return { from: p.from, to: variableHeadEnd(p) };
      }
      const sib = n.nextSibling;
      if (sib && IDENT.has(sib.name)) return { from: n.from, to: sib.to };
    }
    // The projection tail (the ".2" of "#p.2" or "b2.2") is part of the same
    // hoverable entity as its head — hovering it opens the variable's tooltip.
    if (n && n.name === 'ProjectionTail') {
      const p = n.parent;
      if (p && (p.name === 'ParameterVariable' || p.name === 'SubstitutionVariable')) {
        return { from: p.from, to: variableHeadEnd(p) };
      }
      const id = n.prevSibling;
      if (id && IDENT.has(id.name)) return { from: id.from, to: n.to };
    }
  }
  return null;
}

function parseFsigOutput(raw) {
  const cleaned = String(raw || '').replace(/[;\s]+$/, '');
  if (!cleaned || cleaned[0] === '-' || /^no\s/i.test(cleaned)) return null;
  const colonIdx = cleaned.indexOf(':');
  if (colonIdx < 0) return null;
  const t = cleaned.slice(colonIdx + 1).trim();
  return t || null;
}

function parseConstructorsCompOutput(raw, target) {
  const cleaned = String(raw || '').replace(/[;\s]+$/, '');
  if (!cleaned || cleaned[0] === '-' || /^no\s/i.test(cleaned)) return null;
  for (const line of cleaned.split('\n')) {
    const m = line.match(/^(\S+)\s*:\s*\[\d+\]\s*(.+)$/);
    if (m && m[1] === target) {
      const t = m[2].trim();
      return t || null;
    }
  }
  return null;
}

async function runFallback(g, fb) {
  if (!fb) return null;
  if (fb.kind === 'inline-kind') return fb.text || null;
  const client = g.BelugaClient;
  const editor = g.CurrentEditor;
  if (!client || !editor || typeof client.runCheckerCommand !== 'function') return null;
  const code = typeof editor.getValue === 'function' ? editor.getValue() : '';
  if (!code) return null;
  try {
    if (fb.kind === 'fsig') {
      const raw = await client.runCheckerCommand(code, '%:fsig ' + fb.name);
      return parseFsigOutput(raw);
    }
    if (fb.kind === 'comp-ctor') {
      const raw = await client.runCheckerCommand(code, '%:constructors-comp ' + fb.parent);
      return parseConstructorsCompOutput(raw, fb.ctor);
    }
  } catch (_) {
    return null;
  }
  return null;
}

export function buildTipHead(label, headName, state) {
  const head = document.createElement('div');
  head.className = 'beljar-tip-head';
  if (state) head.setAttribute('data-state', state);

  if (label) {
    const kind = document.createElement('span');
    kind.className = 'beljar-tip-kind';
    kind.textContent = label;
    head.appendChild(kind);
  }
  if (headName) {
    const nameEl = document.createElement('span');
    nameEl.className = 'beljar-tip-name';
    nameEl.textContent = headName;
    head.appendChild(nameEl);
  }
  return head;
}

export function buildTipBody(text) {
  const body = document.createElement('div');
  body.className = 'beljar-tip-body';
  if (text) body.textContent = text;
  return body;
}

// Type body: syntax-highlighted + carries the "type-of" flourish (supercolon),
// added via the --type class so the leading glyph is decorative, never confused
// with literal colons inside the type.
function buildTypeBody(typeStr, kind) {
  const body = document.createElement('div');
  body.className = 'beljar-tip-body beljar-tip-body--type bel-type';
  if (typeStr != null) renderTypeInto(body.appendChild(typeContentEl()), typeStr, kind);
  return body;
}

// Inner element that holds the highlighted type text (sibling to the ::before
// supercolon on the .bel-type container).
function typeContentEl() {
  const span = document.createElement('span');
  span.className = 'bel-type-text';
  return span;
}

function buildComputingBody() {
  const body = document.createElement('div');
  body.className = 'beljar-tip-body beljar-tip-body--computing';
  const label = document.createElement('span');
  label.className = 'beljar-tip-shimmer';
  label.textContent = 'Recalculating...';
  setShimmerPhase(label);
  body.appendChild(label);
  return body;
}

export function diagnosticMatchesPos(pos, side, from, to) {
  if (from === to) return pos === from;
  if (pos < from || pos > to) return false;
  if (pos > from && pos < to) return true;
  return (pos === from && side >= 0) || (pos === to && side <= 0);
}

function diagnosticSpan(d) {
  const from = d?.from;
  if (from == null || !Number.isFinite(from)) return null;
  const to = Number.isFinite(d.to) && d.to > from ? d.to : from + 1;
  return { from, to };
}

function checkerDiagnosticsForHover(g, semanticEngine, getOverlayDiags) {
  const eng = engineFor(g, semanticEngine);
  const base = eng?.getBelugaDiagnostics ? eng.getBelugaDiagnostics() : [];
  const extra = typeof getOverlayDiags === 'function' ? (getOverlayDiags() || []) : [];
  if (!extra.length) return base;
  return [...extra, ...base];
}

function hoverRegion(view, pos, side) {
  const term = identRangeAt(view.state, pos);
  if (term) return { from: term.from, to: term.to, term: true, side };
  return { from: pos, to: pos, term: false, side };
}

function diagnosticMatchesRegion(region, dFrom, dTo) {
  return region.term
    ? dFrom < region.to && dTo > region.from
    : diagnosticMatchesPos(region.from, region.side, dFrom, dTo);
}

function diagnosticsForRegion(view, region, diagSources = null) {
  const diagnostics = [];
  const seen = new Set();
  let from = region.from;
  let to = region.to;
  const absorb = (diagnostic, dFrom, dTo) => {
    if (diagnostic.severity !== 'error' && diagnostic.severity !== 'warning') return;
    if (!diagnosticMatchesRegion(region, dFrom, dTo)) return;
    const key = `${dFrom}:${dTo}:${diagnostic.severity}:${diagnostic.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push(diagnostic);
    from = Math.min(from, dFrom);
    to = Math.max(to, dTo);
  };
  forEachDiagnostic(view.state, (diagnostic, dFrom, dTo) => absorb(diagnostic, dFrom, dTo));
  if (diagSources) {
    const g = typeof window !== 'undefined' ? window : self;
    for (const diagnostic of checkerDiagnosticsForHover(
      g, diagSources.semanticEngine, diagSources.getOverlayDiags
    )) {
      if (isSuitePreludeBannerDiag(diagnostic)) continue;
      const span = diagnosticSpan(diagnostic);
      if (span) absorb(diagnostic, span.from, span.to);
    }
  }
  return diagnostics.length ? { diagnostics, from, to } : null;
}

// Styled Error/Warning frame — the single renderer for lint diagnostics in a
// tooltip, so .bel and .cfg show identical chrome. Exported for the cfg editor.
export function buildDiagnosticTip(diagnostic) {
  const frame = document.createElement('div');
  frame.className = `cm-diagnostic cm-diagnostic-${diagnostic.severity}`;
  const head = document.createElement('div');
  head.className = 'beljar-tip-head';
  const kind = document.createElement('span');
  kind.className = 'beljar-tip-kind';
  kind.textContent = diagnostic.severity === 'warning' ? 'Warning' : 'Error';
  head.appendChild(kind);
  frame.append(head, buildTipBody(polishBelugaMessage(diagnostic.message)));
  return frame;
}

function diagnosticsSignature(hit) {
  return hit ? hit.diagnostics.map((d) => `${d.severity}${d.message}`).join('') : '';
}

function rangeAnchorCoords(view, range_) {
  const start = view.coordsAtPos(range_.from, -1);
  const end = view.coordsAtPos(range_.to, 1);
  if (!start || !end) return null;
  // The spout should point WHERE the error visually begins, not at the geometric
  // centre. For a whole-line or multi-line span (e.g. the first-line rule, which
  // stretches a start-of-file error across the line) the midpoint lands far from
  // the start, so the spout floats in the middle of nowhere. Anchor near the
  // start for any span that wraps lines or is wider than a token's worth.
  const multiline = Math.abs(end.top - start.top) > 1;
  const wide = (end.right - start.left) > 160; // px — well past a single token
  if (multiline || wide) {
    const lx = start.left + 8; // a touch in from the very edge, still "at the start"
    return { left: lx, right: lx, top: start.top, bottom: end.bottom };
  }
  const cx = (start.left + end.right) / 2;
  return { left: cx, right: cx, top: start.top, bottom: end.bottom };
}

function markTooltipRemeasure(dom) {
  const scope = dom.closest('.bel-hover-stack') || dom;
  scope.classList.add('beljar-tip--remeasure');
}

function preferHoverAbove(state, pos) {
  return state.doc.lineAt(pos).number > 1;
}

function liveTooltip(anchor, region, typeTip, diagSources = null, view) {
  return {
    pos: anchor.from,
    end: anchor.to,
    above: view ? preferHoverAbove(view.state, anchor.from) : true,
    strictSide: true,
    create(view) {
      const typeDom = typeTip ? typeTip.create(view).dom : null;
      const container = document.createElement('div');
      container.className = 'bel-hover-stack';
      let signature = null;
      let hasPositioned = false;

      // typeDom is mounted ONCE and never detached. Re-inserting it would restart
      // its CSS animations from frame 0 (the "Recalculating…" spinner/sweep jank
      // for ~0.5s while diagnostics are still settling, then smooth). Only the
      // diagnostic frames above it are swapped on each sync.
      if (typeDom) container.appendChild(typeDom);

      function sync(initial = false) {
        const hit = diagnosticsForRegion(view, region, diagSources);
        const next = diagnosticsSignature(hit);
        if (next === signature) return false;
        if (!initial) markTooltipRemeasure(container);
        signature = next;
        // Remove only the previous diagnostic frames (everything before typeDom),
        // leaving typeDom in place so its animation is never interrupted.
        while (container.firstChild && container.firstChild !== typeDom) {
          container.removeChild(container.firstChild);
        }
        const diagParts = hit ? hit.diagnostics.map(buildDiagnosticTip) : [];
        for (const d of diagParts) container.insertBefore(d, typeDom);
        const count = diagParts.length + (typeDom ? 1 : 0);
        container.style.display = count ? '' : 'none';
        return true;
      }

      sync(true);
      let cachedAnchor = null;
      return {
        dom: container,
        getCoords: () => {
          cachedAnchor = rangeAnchorCoords(view, anchor);
          return cachedAnchor;
        },
        get offset() {
          const w = container.offsetWidth;
          if (!w) return { x: 0, y: 0 };
          const half = w / 2;
          const ltr = getComputedStyle(view.contentDOM).direction !== 'rtl';
          return { x: ltr ? -half : half, y: 0 };
        },
        positioned() {
          positionArrow(container, cachedAnchor);
          if (hasPositioned) container.classList.remove('beljar-tip--remeasure');
          else hasPositioned = true;
        },
        update(u) { if (sync()) repositionTooltips(u.view); },
      };
    },
  };
}

function positionArrow(scope, anchor) {
  if (!scope.isConnected || !anchor) return;
  const host = scope.classList.contains('bel-hover-stack') ? scope.lastElementChild : scope;
  if (!host) return;
  const rect = host.getBoundingClientRect();
  if (!rect.width) return;
  const min = 12;
  host.style.setProperty(
    '--tooltip-arrow-x',
    `${Math.max(min, Math.min(anchor.left - rect.left, rect.width - min))}px`
  );
}

function engineFor(g, semanticEngine) {
  return semanticEngine
    || (g.CurrentEditor && g.CurrentEditor.getSemanticEngine
      ? g.CurrentEditor.getSemanticEngine()
      : null);
}

function displayTypeFrom(result) {
  if (!result) return null;
  if (result.status === 'ready') return result.type;
  if (result.staleType != null) return result.staleType;
  return null;
}

function typePromiseFromHover(hover, g, resolved) {
  if (hover && hover.promise) {
    return Promise.resolve(hover.promise)
      .then((final) => {
        const t = displayTypeFrom(final);
        if (t != null) return t;
        if (resolved.fallback) return runFallback(g, resolved.fallback);
        return null;
      });
  }
  if (resolved.fallback) return runFallback(g, resolved.fallback);
  return Promise.resolve(null);
}

// Whether the pointer has left the hovered token's hitbox (so the display-only
// hover tooltip should dismiss). Covers: moving INTO the tooltip box (our tips
// sit above the token, where CM would otherwise keep them open), moving over the
// GUTTER (line numbers / fold — never a token), and moving off the text on the
// same row.
function pointerLeftHoverTarget(view, event) {
  const x = event.clientX;
  const y = event.clientY;

  const tipHost = view.dom.querySelector('.cm-tooltip-hover');
  if (tipHost) {
    const r = tipHost.getBoundingClientRect();
    const margin = 4;
    if (x >= r.left - margin && x <= r.right + margin
      && y >= r.top - margin && y <= r.bottom + margin) {
      return true;
    }
  }

  // The gutter is to the left of the text — outside any token's hitbox.
  const gutters = view.dom.querySelector('.cm-gutters');
  if (gutters && event.target instanceof Node && gutters.contains(event.target)) return true;

  const pos = view.posAtCoords({ x, y });
  if (pos == null) return false;
  const c = view.coordsAtPos(pos);
  if (!c) return false;
  const cw = view.defaultCharacterWidth || 8;
  const onRow = y >= c.top && y <= c.bottom;
  const offText = x > c.right + cw || x < c.left - cw;
  return onRow && offText;
}

// Listens on the whole editor DOM (content + gutters + the in-DOM tooltip), not
// just the content — so sliding from a line-start token onto its gutter cell
// dismisses the hover instead of letting it linger.
const closeHoverOffToken = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view;
    this.onMove = (event) => {
      if (!hasHoverTooltips(view.state)) return;
      if (pointerLeftHoverTarget(view, event)) view.dispatch({ effects: closeHoverTooltips });
    };
    view.dom.addEventListener('mousemove', this.onMove);
  }

  destroy() {
    this.view.dom.removeEventListener('mousemove', this.onMove);
  }
});

// A bare "#" / "$" sigil that is NOT part of a #p / $S variable (those are
// caught earlier as user symbols) heads a parameter type "#[Γ ⊢ A]" or a
// substitution type "$[Γ ⊢ Δ]". Read the role off the parent node so the
// tooltip names what the sigil actually introduces here.
function sigilTip(node) {
  const parent = node.parent && node.parent.name;
  if (node.name === '#') {
    if (parent === 'ParameterType') {
      return { label: 'PARAMETER TYPE', desc: 'The type of a parameter variable: #[Γ ⊢ A].' };
    }
    return {
      label: 'PARAMETER VARIABLE',
      desc: 'Parameter variable; refers to a variable from the context.',
    };
  }
  if (parent === 'SubstitutionType') {
    return { label: 'SUBSTITUTION TYPE', desc: 'The type of a substitution variable: $[Γ ⊢ Δ].' };
  }
  return {
    label: 'SUBSTITUTION VARIABLE',
    desc: 'Substitution variable; refers to a substitution.',
  };
}

function keywordAt(state, pos) {
  for (const bias of [1, -1]) {
    const n = syntaxTree(state).resolveInner(pos, bias);
    if (!n) continue;
    for (const candidate of [n, n.parent]) {
      if (!candidate) continue;
      const tip = candidate.name === '#' || candidate.name === '$'
        ? sigilTip(candidate)
        : BUILTIN_TOOLTIPS.get(candidate.name);
      if (tip) {
        return {
          from: candidate.from,
          to: candidate.to,
          label: tip.label,
          name: state.sliceDoc(candidate.from, candidate.to),
          desc: tip.desc,
        };
      }
    }
  }
  return null;
}

function makeKeywordTooltip(range, label, name, desc) {
  return {
    pos: range.from, end: range.to, above: true, strictSide: true,
    create() {
      const dom = document.createElement('div');
      dom.className = 'beljar-tip';
      dom.appendChild(buildTipHead(label, name));
      if (desc) dom.appendChild(buildTipBody(desc));
      return { dom };
    },
  };
}

// The goal type of the hole whose `?` sits at `offset` (from the checker's parsed
// holes), or null when there is no hole there or it isn't typed yet.
function holeGoalAt(engine, doc, offset) {
  if (!engine || typeof engine.getHoles !== 'function' || !doc) return null;
  for (const h of engine.getHoles()) {
    if (!h || h.line < 1 || h.line > doc.lines) continue;
    const off = doc.line(h.line).from + Math.max(0, (h.col || 1) - 1);
    if (off === offset) return h.goal || null;
  }
  return null;
}

// A hole's single tooltip: the "HOLE ?" head + goal type (or recalc shimmer).
// Shows IMMEDIATELY, even before Beluga has reconstructed the goal — a shimmer
// skeleton stands in and is REPLACED IN PLACE by the real type when it resolves.
function makeHoleTooltip(range, name, goalAt) {
  return {
    pos: range.from, end: range.to, above: true, strictSide: true,
    create() {
      const dom = document.createElement('div');
      dom.className = 'bel-type-tip beljar-tip';
      dom.appendChild(buildTipHead('HOLE', name));
      const body = document.createElement('div');
      body.className = 'beljar-tip-body beljar-tip-goal';
      const slot = typeContentEl();
      body.appendChild(slot);
      dom.appendChild(body);

      let poll = null;
      const renderGoal = (goal) => {
        slot.textContent = '';
        slot.classList.remove('beljar-tip-goal-pending');
        renderTypeInto(slot, goal, 'comp');
      };
      const renderPending = () => {
        slot.textContent = '';
        slot.classList.add('beljar-tip-goal-pending');
        // The same "Recalculating…" shimmer idiom used for a recalculating type.
        const sh = document.createElement('span');
        sh.className = 'beljar-tip-shimmer';
        sh.textContent = 'Recalculating…';
        setShimmerPhase(sh);
        slot.appendChild(sh);
      };

      const initial = typeof goalAt === 'function' ? goalAt() : goalAt;
      if (initial != null) {
        renderGoal(initial);
      } else {
        renderPending();
        // The goal arrives when the checker settles (no doc change), so poll the
        // live goal getter briefly and swap it in place when it appears.
        if (typeof goalAt === 'function') {
          poll = setInterval(() => {
            const g = goalAt();
            if (g != null) { clearInterval(poll); poll = null; renderGoal(g); }
          }, 200);
        }
      }
      return {
        dom,
        destroy() { if (poll) { clearInterval(poll); poll = null; } },
      };
    },
  };
}

export function readHoverScope(g) {
  const P = g.Persist;
  if (!P || typeof P.readStoredHoverScope !== 'function') return 'all';
  return P.readStoredHoverScope();
}

function showSymbolTooltips(g) {
  return readHoverScope(g) !== 'none';
}

export { showSymbolTooltips };

function showBuiltinTooltips(g) {
  return readHoverScope(g) === 'all';
}

export function hoverTooltip(semanticEngine = null, getOverlayDiags = null) {
  const diagSources = { semanticEngine, getOverlayDiags };
  return [cmHoverTooltip(
    function (view, pos, side) {
      const g = typeof window !== 'undefined' ? window : self;

      ensureSyntaxTree(view.state, pos + 1, 100);

      const region = hoverRegion(view, pos, side);
      const diagHit = diagnosticsForRegion(view, region, diagSources);

      let typeTip = null;
      const symbolTips = showSymbolTooltips(g);
      if (symbolTips && region.term) {
        const range = { from: region.from, to: region.to };
        const resolved = resolveHover(view.state, range.from);
        const eng = engineFor(g, semanticEngine);
        if (resolved && eng && typeof eng.hoverAt === 'function') {
          const hover = eng.hoverAt(range.from, {
            fallback: resolved.fallback
              ? (fb) => runFallback(g, fb)
              : undefined,
          });
          const label = hover.label || resolved.label || null;
          const headName = hover.displayName || resolved.displayName || hover.name || resolved.name || null;

          if (hover.status === 'ready') {
            const text = displayTypeFrom(hover);
            if (text != null) {
              typeTip = resolved.kind === 'external' && resolved.externalFile
                ? makeCrossFileTooltip(range, headName, {
                  label, type: text, fileName: resolved.externalFile,
                })
                : makeStaticTooltip(range, label, headName, text);
            } else if (resolved.kind === 'local' || resolved.kind === 'implicit') {
              // No type to show (a bare binder, or a substitution variable with
              // no position-typeable classifier): the role label IS the answer.
              typeTip = makeHeadOnlyTooltip(range, label, headName);
            }
          } else if (hover.status !== 'suppressed' && hover.status !== 'unavailable') {
            typeTip = makeAsyncTooltip(range, label, headName, typePromiseFromHover(hover, g, resolved));
          }
        }
      }

      // Cross-file: a name this document can't explain but the project group
      // defines — show the source signature from the defining file.
      if (symbolTips && !typeTip && region.term) {
        const name = view.state.sliceDoc(region.from, region.to);
        const sig = crossFileSignature(g, name);
        if (sig) {
          typeTip = makeCrossFileTooltip({ from: region.from, to: region.to }, name, sig);
        }
      }

      let kwHit = null;
      if (symbolTips && !typeTip && showBuiltinTooltips(g)) {
        kwHit = keywordAt(view.state, pos);
        if (kwHit) {
          const range = { from: kwHit.from, to: kwHit.to };
          // A `?` is a HOLE: show its goal tooltip IMMEDIATELY (a shimmer until the
          // checker types it, then the goal swaps in place) — never the generic
          // builtin blurb. `goalAt` is a LIVE getter so the poll picks up the goal.
          if (kwHit.label === 'HOLE') {
            const eng = engineFor(g, semanticEngine);
            typeTip = makeHoleTooltip(range, kwHit.name, () => holeGoalAt(eng, view.state.doc, range.from));
          } else {
            typeTip = makeKeywordTooltip(range, kwHit.label, kwHit.name, kwHit.desc);
          }
        }
      }

      if (!typeTip && !diagHit) return null;
      const anchor = typeTip
        ? (region.term
          ? { from: region.from, to: region.to }
          : { from: kwHit.from, to: kwHit.to })
        : { from: diagHit.from, to: diagHit.to };
      return liveTooltip(anchor, region, typeTip, diagSources, view);
    },
    { hideOnChange: true, hoverTime: HOVER_OPEN_MS }
  ), closeHoverOffToken];
}

function crossFileSignature(g, name) {
  const P = g.Persist;
  if (!name || !P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') {
    return null;
  }
  try {
    return findGroupSignature(P.listFiles(), P.getActiveFileId(), name, (id) => P.getFileText(id));
  } catch (_) {
    return null;
  }
}

function makeCrossFileTooltip(range, name, sig) {
  return {
    pos: range.from,
    end: range.to,
    above: true,
    strictSide: false,
    create() {
      const dom = document.createElement('div');
      dom.className = 'bel-type-tip beljar-tip';
      dom.appendChild(buildTipHead(sig.label, name, null));
      dom.appendChild(buildTypeBody(sig.type, sig.label));
      const note = document.createElement('div');
      note.className = 'beljar-tip-filenote';
      note.textContent = 'defined in ' + sig.fileName.split('/').pop();
      dom.appendChild(note);
      return { dom };
    },
  };
}

function makeStaticTooltip(range, label, headName, text) {
  return {
    pos: range.from,
    end: range.to,
    above: true,
    strictSide: false,
    create(view) {
      const dom = document.createElement('div');
      dom.className = 'bel-type-tip beljar-tip';
      dom.appendChild(buildTipHead(label, headName, null));
      dom.appendChild(buildTypeBody(text, label));
      return { dom };
    },
  };
}

function makeHeadOnlyTooltip(range, label, headName) {
  return {
    pos: range.from,
    end: range.to,
    above: true,
    strictSide: false,
    create(view) {
      const dom = document.createElement('div');
      dom.className = 'bel-type-tip beljar-tip';
      dom.appendChild(buildTipHead(label, headName, null));
      return { dom };
    },
  };
}

function makeAsyncTooltip(range, label, headName, textPromise, options = {}) {
  return {
    pos: range.from,
    end: range.to,
    above: true,
    strictSide: false,
    create(view) {
      const dom = document.createElement('div');
      dom.className = 'bel-type-tip beljar-tip';
      const head = buildTipHead(label, headName, 'Recalculating...');
      const initialText = options.initialText || null;
      const body = initialText ? buildTypeBody(initialText, label) : buildComputingBody();
      dom.appendChild(head);
      dom.appendChild(body);

      function setBodyText(text) {
        markTooltipRemeasure(dom);
        // Reconstitute the body as a highlighted type body in place: clear any
        // prior content (e.g. the computing shimmer) before rendering the type.
        body.textContent = '';
        body.className = 'beljar-tip-body beljar-tip-body--type bel-type';
        renderTypeInto(body.appendChild(typeContentEl()), text, label);
        head.removeAttribute('data-state');
        view.requestMeasure();
      }

      function finishNoType() {
        if (!body.isConnected) return;
        markTooltipRemeasure(dom);
        head.removeAttribute('data-state');
        body.remove();
        view.requestMeasure();
      }

      Promise.resolve(textPromise)
        .then((text) => {
          if (!body.isConnected) return;
          if (text) setBodyText(text, false);
          else if (initialText) setBodyText(initialText, false);
          else finishNoType();
        })
        .catch(() => {
          if (initialText && body.isConnected) setBodyText(initialText, false);
          else finishNoType();
        });

      return { dom };
    },
  };
}
