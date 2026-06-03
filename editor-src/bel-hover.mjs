import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import { hoverTooltip } from '@codemirror/view';
import { isHoverableIdent, resolveHover } from './bel-resolve.mjs';

const HOVER_OPEN_MS = 60;

const IDENT = new Set(['LowerIdentifier', 'UpperIdentifier']);

function identRangeAt(state, pos) {
  let n = syntaxTree(state).resolveInner(pos, 1);
  if (n && IDENT.has(n.name)) return { from: n.from, to: n.to };
  if (n && (n.name === '#' || n.name === '$')) {
    const sib = n.nextSibling;
    if (sib && IDENT.has(sib.name)) return { from: n.from, to: sib.to };
  }
  n = syntaxTree(state).resolveInner(pos, -1);
  if (n && IDENT.has(n.name)) return { from: n.from, to: n.to };
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
  const editor = g.BelJarCurrentEditor;
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

function buildTipHead(label, headName, state) {
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

function buildTipBody(text) {
  const body = document.createElement('div');
  body.className = 'beljar-tip-body';
  if (text) body.textContent = text;
  return body;
}

function buildComputingBody() {
  const body = document.createElement('div');
  body.className = 'beljar-tip-body beljar-tip-body--computing';
  const label = document.createElement('span');
  label.className = 'beljar-tip-shimmer';
  label.textContent = 'Recalculating...';
  body.appendChild(label);
  return body;
}

function positionArrow(dom, view, range_) {
  const charW = view.defaultCharacterWidth || 8;
  const halfWidthPx = ((range_.to - range_.from) * charW) / 2;
  dom.style.setProperty('--tooltip-arrow-x', `${halfWidthPx}px`);
}

function engineFor(g, semanticEngine) {
  return semanticEngine
    || (g.BelJarCurrentEditor && g.BelJarCurrentEditor.getSemanticEngine
      ? g.BelJarCurrentEditor.getSemanticEngine()
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

export function belHoverTooltip(semanticEngine = null) {
  return hoverTooltip(
    function (view, pos) {
      const g = typeof window !== 'undefined' ? window : self;

      // Ensure tree is parsed at hover position before resolving.
      // 100ms timeout - parses lazily only where needed.
      ensureSyntaxTree(view.state, pos + 1, 100);

      if (!isHoverableIdent(view.state, pos)) return null;

      const range = identRangeAt(view.state, pos);
      if (!range) return null;

      const resolved = resolveHover(view.state, range.from);
      if (!resolved) return null;

      const eng = engineFor(g, semanticEngine);
      if (!eng || typeof eng.hoverAt !== 'function') return null;

      const hover = eng.hoverAt(range.from, {
        fallback: resolved.fallback
          ? (fb) => runFallback(g, fb)
          : undefined,
      });
      const label = hover.label || resolved.label || null;
      const headName = hover.displayName || resolved.displayName || hover.name || resolved.name || null;

      if (hover.status === 'ready') {
        const text = displayTypeFrom(hover);
        if (text != null) return makeStaticTooltip(range, label, headName, text);
        if (resolved.kind === 'local') return makeHeadOnlyTooltip(range, label, headName);
        return null;
      }

      if (hover.status === 'suppressed' || hover.status === 'unavailable') return null;

      const initial = hover.staleType
        ?? (resolved.kind === 'local' ? resolved.text : null)
        ?? resolved.sourceText
        ?? resolved.sourceType
        ?? null;

      const textPromise = typePromiseFromHover(hover, g, resolved);

      return makeAsyncTooltip(range, label, headName, textPromise, { initialText: initial });
    },
    { hideOnChange: true, hoverTime: HOVER_OPEN_MS }
  );
}

function makeStaticTooltip(range, label, headName, text, options = {}) {
  return {
    pos: range.from,
    end: range.to,
    above: true,
    strictSide: false,
    create(view) {
      const dom = document.createElement('div');
      dom.className = 'bel-type-tip beljar-tip';
      if (options.stale) dom.setAttribute('data-semantic-stale', 'true');
      dom.appendChild(buildTipHead(label, headName, null));
      dom.appendChild(buildTipBody(text));
      positionArrow(dom, view, range);
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
      positionArrow(dom, view, range);
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
      const body = initialText ? buildTipBody(initialText) : buildComputingBody();
      dom.appendChild(head);
      dom.appendChild(body);
      positionArrow(dom, view, range);

      function setBodyText(text, empty) {
        body.classList.remove('beljar-tip-body--computing');
        body.classList.add('beljar-tip-body--settling');
        requestAnimationFrame(() => {
          if (!body.isConnected) return;
          body.textContent = text;
          body.classList.toggle('beljar-tip-body--empty', !!empty);
          head.removeAttribute('data-state');
          view.requestMeasure();
          requestAnimationFrame(() => {
            if (body.isConnected) body.classList.remove('beljar-tip-body--settling');
          });
        });
      }

      // Every Beluga query settles — with a type, or with nothing. There is no
      // legitimate "still loading" end state: once the promise resolves we
      // either show the type (or stale/source text), or collapse the spinner to
      // a head-only tip (no type shown). Leaving the shimmer up after the
      // promise settled is the "endless loading" bug — a finished query that
      // the UI never finished rendering.
      function finishNoType() {
        if (!body.isConnected) return;
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
