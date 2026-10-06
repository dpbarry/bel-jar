/**
 * Home and the editor are two documents, and the browser animates the
 * navigation between them (css/page-transition.css; docs/UI.md §0). The editor's
 * working area grows out of the row that was opened, and shrinks back onto it;
 * the project's name travels between the row and the header; the strip, the
 * same on both pages, stays where it is; everything else cross-fades.
 *
 * What is here is the little a stylesheet cannot do:
 *   - WHICH row. A name may be on one element at a time, so only the row being
 *     opened (or come back to) carries it: marked as the old page is left
 *     (`data-opening`, which also washes it: it is what was clicked), and as home
 *     is revealed after the editor (`data-landing`, which does not: a wash there
 *     stayed to the end and went in one frame).
 *   - The zoom. Where the row is, in the editor, is known only to the browser
 *     (the row was on the page just left): its group's box says, and
 *     `zoomSurface` scales the working area from it, evenly.
 *   - ⛔ Waiting for the editor to be there. The editor is shown (its first
 *     frame) as soon as its header has the project's name, and builds the rest
 *     from its scripts a moment later: run at once, the transition grew an
 *     empty shell out of the row and the code arrived half way. `holdUntil`
 *     keeps every animation of it on its first frame (home as it was left, the
 *     row that was clicked washed) until the editor is built, then runs it whole.
 *   - BelJar's own motion setting. The system's preference is a media query;
 *     Settings > Appearance > Motion is not, so a transition is skipped here
 *     when motion is held back: a plain cut.
 *   - A page nobody saw. A home that is only passing through to the last
 *     project, or an editor leaving for home because its project is not here,
 *     has nothing to animate from.
 *   - ⛔ Moving the name without the main thread. The browser's
 *     own animation of a named element changes its box's width and height,
 *     which only the main thread can do, and the editor's scripts hold the main
 *     thread for its first 150 ms: the page cross-faded while the name stood
 *     still at the row, then jumped (measured frame by frame, 2026-10-02).
 *     `compositeGroups` rewrites its animation as a transform alone (move and
 *     scale), which the compositor runs by itself.
 *
 * It runs from early boot, in both documents: the editor is revealed long
 * before its own scripts have loaded. ⛔ Nothing may depend on a transition
 * running: a browser without them navigates as it always did.
 */
import { prefersReducedMotion } from '../persist/settings-apply.mjs';
import { pageOf, projectOf } from '../frame/routes.mjs';

/** The project an address names, when it is the editor's; else null. */
export function projectOfUrl(url) {
  try {
    const u = new URL(String(url));
    return projectOf({ pathname: u.pathname, search: u.search });
  } catch (_) {
    return null;
  }
}

/** Which page an address string is (routes.mjs `pageOf`), or null for one that is not an address. */
export function pageOfUrl(url) {
  try {
    const u = new URL(String(url));
    return pageOf({ pathname: u.pathname });
  } catch (_) {
    return null;
  }
}

/**
 * What to do with a transition the browser is about to run.
 * @param {{ reduced: boolean, unseen: boolean, here: 'home'|'edit'|'privacy', other: string }} o
 *   other: the address being gone to (leaving) or come from (arriving)
 * @returns {'skip' | { row: string|null }}  the project whose row takes the names, on home
 *
 * ⛔ Only between home and the editor (docs/UI.md). The page on what BelJar
 * keeps is a document reached by a plain cut: it does not opt in, and a
 * transition left to the browser was aborted with an error in the console.
 */
export function transitionStep(o) {
  if (o.reduced || o.unseen) return 'skip';
  if (o.here === 'privacy' || pageOfUrl(o.other) === 'privacy') return 'skip';
  return { row: o.here === 'home' ? projectOfUrl(o.other) : null };
}

/** The elements that carry each name, in whichever document this is (css/page-transition.css). */
export const NAMED = {
  'proj-title': '#header-context-name, .home-row[data-opening] .home-row__name, .home-row[data-landing] .home-row__name',
  'proj-row': '.home-row[data-opening], .home-row[data-landing]',
  'proj-surface': 'body:not(.home-page) > .workspace',
};

/** The one pair the browser moves between two boxes, rewritten as a transform (`compositeGroups`). */
export const MORPHS = {
  'proj-title': NAMED['proj-title'],
};

/**
 * The same journey as the browser's own keyframes for a named group (from the
 * old box to the new one), as a transform alone: the box keeps its new size
 * throughout and is scaled from the old one. Pure: `from` is the browser's first
 * keyframe ({ transform, width, height }), `rect` the new element's box.
 * Null when there is nothing to rewrite.
 */
export function transformOnly(from, rect) {
  if (!from || !rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  const w = parseFloat(from.width);
  const h = parseFloat(from.height);
  if (!from.transform || from.transform === 'none' || !(w > 0) || !(h > 0)) return null;
  const sx = Math.round((w / rect.width) * 1e5) / 1e5;
  const sy = Math.round((h / rect.height) * 1e5) / 1e5;
  // The browser's keyframes carry the curve (css/page-transition.css sets it): kept.
  const easing = from.easing || 'ease';
  return [
    { transform: from.transform + ' scale(' + sx + ', ' + sy + ')', easing },
    { transform: 'translate(' + rect.left + 'px, ' + rect.top + 'px)', easing },
  ];
}

/** Rewrite the named groups' animations to transforms. Never throws: left alone, the browser's own still run. */
export function compositeGroups(document) {
  let done = 0;
  try {
    const root = document.documentElement;
    for (const anim of document.getAnimations()) {
      const effect = anim.effect;
      const m = /^::view-transition-group\((.+)\)$/.exec((effect && effect.pseudoElement) || '');
      if (!m || !MORPHS[m[1]] || effect.target !== root) continue;
      const el = document.querySelector(MORPHS[m[1]]);
      if (!el) continue;
      const frames = transformOnly(effect.getKeyframes()[0], el.getBoundingClientRect());
      if (!frames) continue;
      effect.setKeyframes(frames);
      done += 1;
    }
  } catch (_) { /* the browser's own animation stands */ }
  return done;
}

/**
 * The working area growing out of the row (`in`: opening a project) or
 * shrinking back onto it (`out`), as keyframes for its group. ⛔ Scaled EVENLY,
 * by the row's width: a box stretched to the row's shape squeezed the editor
 * into 32 rows of pixels on the way, and a picture of it came out as wavy
 * bands. Pure: `row` and `area` are boxes on the page ({ left, top, width }).
 * Opening, the area is seen from the start (it fades in over the first third,
 * while it is small and speeding up). ⛔ Closing is NOT the mirror of that: it
 * goes while it is moving. Faded over the last two thirds, it was still a third
 * there when the curve had all but stopped it: a still picture of the editor
 * over the row, then gone. It holds while it sets off, fades through the fast
 * part of the curve, and is gone by 55% of the time (the curve has done 83% of
 * the way by then, and creeps the rest unseen). Null when there is nothing to
 * zoom from.
 */
export function zoomFrames(row, area, dir) {
  if (!row || !area || !(row.width > 0) || !(area.width > 0)) return null;
  const s = Math.round((row.width / area.width) * 1e5) / 1e5;
  const full = 'translate(' + area.left + 'px, ' + area.top + 'px)';
  const small = 'translate(' + row.left + 'px, ' + row.top + 'px) scale(' + s + ')';
  if (dir === 'in') {
    return { transform: [{ transform: small }, { transform: full }], opacity: [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1 }] };
  }
  return {
    transform: [{ transform: full }, { transform: small }],
    opacity: [{ opacity: 1 }, { opacity: 1, offset: 0.2 }, { opacity: 0, offset: 0.55 }, { opacity: 0 }],
  };
}

/** A group's box, as the browser placed it: its own (static) transform and size. */
function groupBox(view, root, name) {
  const cs = view.getComputedStyle(root, '::view-transition-group(' + name + ')');
  const m = /matrix\(([^)]+)\)/.exec(cs.transform || '');
  const width = parseFloat(cs.width);
  if (!m || !(width > 0)) return null;
  const v = m[1].split(',').map(Number);
  return { left: v[4], top: v[5], width };
}

/**
 * Start the zoom: the working area's group, moved and scaled by transform, its
 * picture's fade carried by the group (the browser's own fade on the picture is
 * stopped, or the two would multiply). Only between a row and the editor: from
 * an editor to another editor there is no row, and the browser's cross-fade
 * stands. Never throws.
 */
export function zoomSurface(document) {
  try {
    const root = document.documentElement;
    const view = document.defaultView;
    const row = groupBox(view, root, 'proj-row');
    const area = groupBox(view, root, 'proj-surface');
    const dir = document.querySelector(NAMED['proj-surface']) ? 'in' : 'out';
    const frames = zoomFrames(row, area, dir);
    if (!frames) return 0;
    const css = view.getComputedStyle(root);
    const duration = parseFloat(css.getPropertyValue('--page-morph')) || 300;
    const easing = css.getPropertyValue('--ease-in-out').trim() || 'ease-in-out';
    for (const a of document.getAnimations()) {
      const pe = a.effect && a.effect.pseudoElement;
      if (pe === '::view-transition-old(proj-surface)' || pe === '::view-transition-new(proj-surface)') a.cancel();
    }
    const group = '::view-transition-group(proj-surface)';
    root.animate(frames.transform, { pseudoElement: group, duration, easing, fill: 'both' });
    root.animate(frames.opacity, { pseudoElement: group, duration, easing: 'linear', fill: 'both' });
    return 1;
  } catch (_) {
    return 0;
  }
}

/** How long a transition waits for the editor at most: a first visit, with nothing cached, is not held. */
export const HOLD_MS = 1200;

/**
 * Keep a transition on its first frame until `isReady()`, or `maxMs` at most,
 * then run all of it. True when it held. Never throws.
 */
export function holdUntil(window, document, isReady, maxMs) {
  try {
    if (isReady()) return false;
    const anims = document.getAnimations().filter((a) => a.effect && /^::view-transition/.test(a.effect.pseudoElement || ''));
    if (!anims.length) return false;
    for (const a of anims) a.pause();
    const t0 = window.performance.now();
    const run = () => { for (const a of anims) { try { a.play(); } catch (_) { /* finished with its page */ } } };
    const look = () => {
      let done = true;
      try { done = isReady() || window.performance.now() - t0 >= maxMs; } catch (_) { /* run it */ }
      if (done) run();
      else window.requestAnimationFrame(look);
    };
    window.requestAnimationFrame(look);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * A transition that is skipped, or that the browser gives up on, rejects its
 * promises. Nobody is waiting on them: unanswered, each would reach the page's
 * error hook as a failure, for a navigation that went exactly as meant.
 */
function quiet(vt) {
  for (const p of [vt.ready, vt.finished, vt.updateCallbackDone]) {
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }
}

/**
 * @param {object} env
 * @param {Window} env.window
 * @param {Document} env.document
 * @param {() => string} [env.bootMotion]  the motion setting as early boot reads it, for
 *   the time before the page's own Settings exists (early-boot-core.mjs hands it over:
 *   only early boot and the store may name browser storage)
 */
export function installPageTransitions(env) {
  const { window, document } = env;
  if (!window || typeof window.addEventListener !== 'function') return;

  const reduced = () => {
    let pref = 'system';
    try {
      pref = window.Settings && typeof window.Settings.get === 'function'
        ? window.Settings.get('motionPref')
        : (typeof env.bootMotion === 'function' ? env.bootMotion() : 'system');
    } catch (_) { /* the system's preference, then */ }
    return prefersReducedMotion(pref);
  };
  const unseen = () => window.BELJAR_LEAVING === true
    || !!(window.Persist && typeof window.Persist.leaving === 'function' && window.Persist.leaving());
  const mark = (pid, as) => {
    const row = pid ? document.querySelector('.home-row[data-pid="' + pid + '"]') : null;
    if (row) row.setAttribute(as, '');
    return row;
  };
  // The editor is built: its frame is mounted, with an editor in it.
  const editorBuilt = () => !!(window.Frame && typeof window.Frame.isMounted === 'function' && window.Frame.isMounted() && window.CurrentEditor);
  // Ready: the browser has made its animations and not yet shown a frame of them.
  const whenReady = (vt) => {
    if (!vt.ready || typeof vt.ready.then !== 'function') return;
    vt.ready.then(() => {
      compositeGroups(document);
      zoomSurface(document);
      if (pageOf(window.location) === 'edit') holdUntil(window, document, editorBuilt, HOLD_MS);
    }, () => {});
  };

  // Leaving: on home, the row being opened takes the names the editor's header carries.
  window.addEventListener('pageswap', (e) => {
    const vt = e && e.viewTransition;
    if (!vt) return;
    quiet(vt);
    const to = e.activation && e.activation.entry ? e.activation.entry.url : '';
    const step = transitionStep({ reduced: reduced(), unseen: unseen(), here: pageOf(window.location), other: to });
    if (step === 'skip') vt.skipTransition();
    else mark(step.row, 'data-opening');
  });

  // Arriving: back on home, the row of the project just left takes them.
  window.addEventListener('pagereveal', (e) => {
    const vt = e && e.viewTransition;
    if (!vt) return;
    quiet(vt);
    const nav = window.navigation;
    const from = nav && nav.activation && nav.activation.from ? nav.activation.from.url : '';
    const step = transitionStep({ reduced: reduced(), unseen: false, here: pageOf(window.location), other: from });
    if (step === 'skip') { vt.skipTransition(); return; }
    const row = mark(step.row, 'data-landing');
    whenReady(vt);
    if (!row || !vt.finished || typeof vt.finished.then !== 'function') return;
    const clear = () => row.removeAttribute('data-landing');
    vt.finished.then(clear, clear);
  });
}
