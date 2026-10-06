// Between home and the editor (js/boot/page-transition-core.mjs,
// css/page-transition.css; plan v6 h12, docs/PERSIST.md §5.11).
//
// The browser animates the navigation. What is held here is the little that is
// ours: which row carries the names, that held-back motion means a plain cut,
// that a page nobody saw animates nothing, that what travels is moved by
// transform alone (so the editor's start-up cannot stall it), that the working
// area is scaled evenly and waits for the editor to be built, and that both
// documents opt in where the browser looks for it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  projectOfUrl, transitionStep, transformOnly, compositeGroups, installPageTransitions, MORPHS, NAMED,
  zoomFrames, holdUntil, HOLD_MS,
} from '../js/boot/page-transition-core.mjs';
import { paintProjectName } from '../js/boot/panel-restore-core.mjs';
import { showableProject } from '../js/boot/boot-project.mjs';
import { SCHEMA } from '../js/persist/store.mjs';
import { metaKey } from '../js/persist/keys.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = 'p_01m3xq1ph808nx8xjd4jj1rhcx';

// ── 1. which row, and when there is no transition at all ────────────────────
expect(projectOfUrl('https://beljar.deanbarry.com/edit?p=' + A) === A && projectOfUrl('http://localhost:5500/edit.html?p=' + A) === A,
  'an editor address names its project, in either form');
expect(projectOfUrl('https://beljar.deanbarry.com/?open=' + A) === null && projectOfUrl('not a url') === null && projectOfUrl('') === null,
  'home names none, and neither does nonsense');
{
  const base = { reduced: false, unseen: false, here: 'home', other: 'http://x.test/edit?p=' + A };
  const step = (o) => transitionStep(Object.assign({}, base, o));
  expect(step({}).row === A, 'on home, going to (or coming from) the editor: that project’s row takes the names');
  expect(step({ here: 'edit' }).row === null, 'in the editor the header always carries them: no row');
  expect(step({ other: 'http://x.test/' }).row === null, 'home to home: no row');
  expect(step({ reduced: true }) === 'skip', '⛔ motion held back: no transition, a plain cut');
  expect(step({ unseen: true }) === 'skip', 'a page nobody saw has nothing to animate from');
  expect(step({ other: 'http://x.test/privacy' }) === 'skip' && step({ other: 'http://x.test/privacy.html' }) === 'skip'
    && step({ here: 'privacy', other: 'http://x.test/?home' }) === 'skip',
  '⛔ to and from the page on what BelJar keeps: a plain cut (it does not opt in, and a transition left to the browser was aborted with an error)');
}

// ── 2. ⛔ the travelling boxes move by transform alone ───────────────────────
{
  const from = { transform: 'matrix(1, 0, 0, 1, 252, 120)', width: '696px', height: '43.2px', easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
  const frames = transformOnly(from, { left: 0, top: 0, width: 1200, height: 32 });
  expect(frames.length === 2 && frames.every((f) => Object.keys(f).sort().join() === 'easing,transform'),
    'two keyframes, with a transform and a curve and nothing else: no width, no height');
  expect(frames[0].transform === 'matrix(1, 0, 0, 1, 252, 120) scale(0.58, 1.35)', `it starts as the old box: where it was, scaled to its size (${frames[0].transform})`);
  expect(frames[1].transform === 'translate(0px, 0px)', 'and ends as the new one, in place at its own size');
  expect(frames[0].easing === from.easing, 'on the curve the stylesheet gave the browser’s animation');
  expect(transformOnly(null, { left: 0, top: 0, width: 1, height: 1 }) === null
    && transformOnly(from, { left: 0, top: 0, width: 0, height: 32 }) === null
    && transformOnly({ transform: 'none', width: '1px', height: '1px' }, { left: 0, top: 0, width: 1, height: 1 }) === null
    && transformOnly({ transform: 'matrix(1,0,0,1,0,0)' }, { left: 0, top: 0, width: 1, height: 1 }) === null,
    'anything it cannot read is left to the browser');

  // Over a document: only the two named groups are rewritten, and a failure leaves everything as it was.
  const made = [];
  const root = { tag: 'html' };
  const anim = (pseudo, target) => ({ effect: {
    pseudoElement: pseudo, target: target || root,
    getKeyframes: () => [from, {}],
    setKeyframes: (f) => made.push([pseudo, f]),
  } });
  const doc = {
    documentElement: root,
    getAnimations: () => [
      anim('::view-transition-group(proj-title)'), anim('::view-transition-group(proj-surface)'),
      anim('::view-transition-group(root)'), anim('::view-transition-old(proj-title)'), anim('::view-transition-group(app-header)'),
      anim('::view-transition-group(proj-title)', { tag: 'other' }), { effect: null },
    ],
    querySelector: (sel) => (sel === MORPHS['proj-title'] || sel === MORPHS['proj-surface']
      ? { getBoundingClientRect: () => ({ left: 10, top: 5, width: 100, height: 20 }) } : null),
  };
  expect(compositeGroups(doc) === 1 && made.map((m) => m[0]).join() === '::view-transition-group(proj-title)',
    'the name is rewritten; the working area has its own zoom, and the page, the strip, the pictures and the rest are the browser’s');
  expect(compositeGroups({ documentElement: root, getAnimations: () => { throw new Error('no'); } }) === 0, 'and it never throws');
}

// ── 2b. the zoom, and the wait for the editor ───────────────────────────────
{
  const row = { left: 456, top: 388, width: 528 };
  const area = { left: 0, top: 32, width: 1200 };
  const z = zoomFrames(row, area, 'in');
  const scale = /scale\(([^)]+)\)/.exec(z.transform[0].transform);
  expect(scale && !scale[1].includes(',') && Math.abs(Number(scale[1]) - 0.44) < 1e-6,
    `⛔ the working area is scaled evenly, by the row's width: one number, never the row's shape (${z.transform[0].transform})`);
  expect(z.transform[0].transform.startsWith('translate(456px, 388px)') && z.transform[1].transform === 'translate(0px, 32px)',
    'opening, it starts where the row is and ends where it lives');
  expect(z.opacity[0].opacity === 0 && z.opacity[1].opacity === 1 && z.opacity[1].offset <= 0.35 && z.opacity[2].opacity === 1,
    'and is seen from the first third: it is the editor that grows, not a blank to be filled');
  const out = zoomFrames(row, area, 'out');
  expect(out.transform[0].transform === 'translate(0px, 32px)' && out.transform[1].transform === z.transform[0].transform,
    'closing, it goes back exactly onto the row');
  const zero = out.opacity.find((k) => k.opacity === 0);
  const gone = zero && { offset: zero.offset == null ? 1 : zero.offset };
  expect(out.opacity[0].opacity === 1 && gone && gone.offset <= 0.6 && out.opacity[out.opacity.length - 1].opacity === 0,
    `⛔ and is gone while it still moves (by ${gone && gone.offset} of the time): fading to the end, it stood still over the row a third there`);
  expect(out.opacity[1].opacity === 1 && out.opacity[1].offset >= 0.1, 'though it is seen setting off: the editor moves, it does not just fade');
  expect(zoomFrames(null, area, 'in') === null && zoomFrames(row, { left: 0, top: 0, width: 0 }, 'in') === null,
    'from an editor to an editor (no row) there is nothing to zoom from');

  // The hold: every animation of the transition waits on its first frame until the editor is built.
  const anim = (pe) => ({ effect: { pseudoElement: pe }, state: 'running', pause() { this.state = 'paused'; }, play() { this.state = 'running'; } });
  const anims = [anim('::view-transition-group(proj-surface)'), anim('::view-transition-old(root)'), anim('')];
  let frame = null;
  let now = 0;
  const win = { performance: { now: () => now }, requestAnimationFrame: (fn) => { frame = fn; } };
  const doc = { getAnimations: () => anims };
  let built = false;
  expect(holdUntil(win, doc, () => built, HOLD_MS) === true && anims[0].state === 'paused' && anims[1].state === 'paused' && anims[2].state === 'running',
    '⛔ until the editor is built, the transition waits on its first frame (its animations, and only its)');
  now = 100; frame();
  expect(anims[0].state === 'paused', 'and keeps waiting while it is not');
  built = true; frame();
  expect(anims[0].state === 'running' && anims[1].state === 'running', 'then runs, whole');
  const late = [anim('::view-transition-group(proj-surface)')];
  holdUntil(win, { getAnimations: () => late }, () => false, HOLD_MS);
  now = 100 + HOLD_MS; frame();
  expect(late[0].state === 'running', `a first visit, nothing cached, is not held past ${HOLD_MS} ms`);
  expect(holdUntil(win, doc, () => true, HOLD_MS) === false, 'an editor already built is not held at all');
}

// ── 3. the events, on a page ────────────────────────────────────────────────
function pageWith(o) {
  const handlers = {};
  const rows = new Map((o.rows || []).map((pid) => [pid, { attrs: new Set(), setAttribute(k) { this.attrs.add(k); }, removeAttribute(k) { this.attrs.delete(k); } }]));
  const window = Object.assign({
    addEventListener: (type, fn) => { handlers[type] = fn; },
    location: { pathname: o.path, search: o.search || '', hash: '' },
  }, o.window || {});
  const document = {
    documentElement: {},
    getAnimations: () => [],
    querySelector: (sel) => { const m = /data-pid="([^"]+)"/.exec(sel); return m ? rows.get(m[1]) || null : null; },
  };
  installPageTransitions({ window, document, bootMotion: () => (o.settings && o.settings.motionPref) || 'system' });
  return { handlers, rows, window };
}
function transition() {
  const caught = [];
  let finish;
  const promise = (name) => {
    const p = name === 'finished' ? new Promise((r) => { finish = r; }) : Promise.resolve();
    const real = p.catch.bind(p);
    p.catch = (fn) => { caught.push(name); return real(fn); };
    return p;
  };
  const vt = { skipped: 0, skipTransition() { this.skipped += 1; }, ready: promise('ready'), finished: promise('finished'), updateCallbackDone: promise('update') };
  return { vt, caught, finish: () => finish() };
}
{
  // Leaving home for the editor: the row is marked, as the page goes.
  const home = pageWith({ path: '/', rows: [A] });
  expect(typeof home.handlers.pageswap === 'function' && typeof home.handlers.pagereveal === 'function', 'both moments are listened for');
  const t = transition();
  home.handlers.pageswap({ viewTransition: t.vt, activation: { entry: { url: 'http://x.test/edit?p=' + A } } });
  expect(home.rows.get(A).attrs.has('data-opening') && t.vt.skipped === 0, 'leaving home for a project: its row carries the names');
  expect(t.caught.sort().join() === 'finished,ready,update', '⛔ and the transition’s promises are answered: skipped or given up on, they must not reach the error hook');
  home.handlers.pageswap({ viewTransition: null });
  home.handlers.pagereveal({});
  expect(true, 'a navigation with no transition (another browser, a first arrival) is left alone');

  // Motion held back by BelJar's own setting, from early boot's read and from the live Settings.
  const still = pageWith({ path: '/', rows: [A], settings: { motionPref: 'reduce' } });
  const t2 = transition();
  still.handlers.pageswap({ viewTransition: t2.vt, activation: { entry: { url: 'http://x.test/edit?p=' + A } } });
  expect(t2.vt.skipped === 1 && !still.rows.get(A).attrs.has('data-opening'), 'Settings > Appearance > Motion: Reduce is a plain cut, leaving');
  const t3 = transition();
  still.handlers.pagereveal({ viewTransition: t3.vt });
  expect(t3.vt.skipped === 1, 'and arriving');
  const live = pageWith({ path: '/edit', window: { Settings: { get: () => 'reduce' } } });
  const t4 = transition();
  live.handlers.pageswap({ viewTransition: t4.vt, activation: { entry: { url: 'http://x.test/' } } });
  expect(t4.vt.skipped === 1, 'changed since the page loaded, the live setting is the one asked');

  // A page nobody saw.
  const passing = pageWith({ path: '/', rows: [A], window: { BELJAR_LEAVING: true } });
  const t5 = transition();
  passing.handlers.pageswap({ viewTransition: t5.vt, activation: { entry: { url: 'http://x.test/edit?p=' + A } } });
  expect(t5.vt.skipped === 1, 'home passing through to the last project (the start page) animates nothing');
  const lost = pageWith({ path: '/edit', window: { Persist: { leaving: () => A } } });
  const t6 = transition();
  lost.handlers.pageswap({ viewTransition: t6.vt, activation: { entry: { url: 'http://x.test/?open=' + A } } });
  expect(t6.vt.skipped === 1, 'nor does an editor leaving for home because its project is not here');

  // Back on home from the editor: the row is marked for the transition, and only for it.
  const back = pageWith({ path: '/', rows: [A], window: { navigation: { activation: { from: { url: 'http://x.test/edit?p=' + A } } } } });
  const t7 = transition();
  back.handlers.pagereveal({ viewTransition: t7.vt });
  expect(back.rows.get(A).attrs.has('data-landing') && !back.rows.get(A).attrs.has('data-opening'),
    'arriving on home from a project: its row carries the names, but not the wash of a row clicked (it stayed to the end and went in one frame)');
  t7.finish();
  await new Promise((r) => setImmediate(r));
  expect(!back.rows.get(A).attrs.has('data-landing'), 'and gives them up when the transition is over (a name may be on one element at a time)');
}

// ── 4. the name is in the editor's header before first paint ────────────────
{
  const meta = (name, owner) => JSON.stringify({ at: 1, data: { name, createdAt: 1, owner } });
  const B = 'p_01m3xq1ph808nx8xjd4jj1rhcy';
  const storage = (device) => ({
    data: {
      'beljar/schema': String(SCHEMA), [metaKey(A)]: meta('Thesis', null), [metaKey(B)]: meta('Hers', 'u_ana'),
      'beljar/device': JSON.stringify({ at: 1, data: { values: device || {} } }),
    },
    getItem(k) { return this.data[k] ?? null; },
  });
  const header = () => { const el = { textContent: 'Untitled project' }; return { el, document: { getElementById: (id) => (id === 'header-context-name' ? el : null) } }; };
  let h = header();
  expect(paintProjectName(h.document, storage(), { pathname: '/edit', search: '?p=' + A }) === 'Thesis' && h.el.textContent === 'Thesis',
    'the project the address names: its name replaces the placeholder');
  h = header();
  expect(paintProjectName(h.document, storage({ activeProject: A }), { pathname: '/edit.html', search: '' }) === 'Thesis', 'a bare address: the last project opened');
  h = header();
  expect(paintProjectName(h.document, storage(), { pathname: '/edit', search: '?p=' + B }) === null && h.el.textContent === 'Untitled project',
    '⛔ a project of an account that is not signed in is not named, even for a moment');
  h = header();
  expect(paintProjectName(h.document, storage({ account: 'u_ana' }), { pathname: '/edit', search: '?p=' + B }) === 'Hers', 'signed in as its owner, it is');
  h = header();
  expect(paintProjectName(h.document, storage(), { pathname: '/edit', search: '?p=p_01m3xq1ph808nx8xjd4jj1zzzz' }) === null, 'a project that is not here: the placeholder stays');
  expect(paintProjectName({ getElementById: () => null }, storage(), { pathname: '/', search: '' }) === null, 'a page with no such header (home) is left alone');
  expect(showableProject(storage(), { account: '', keptAccounts: ['u_ana'] }, B).name === 'Hers', 'kept on sign-out, it can be shown');
}

// ── 5. ⛔ the documents and the stylesheet ───────────────────────────────────
{
  const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  for (const file of ['index.html', 'edit.html']) {
    const html = noComments(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    const head = html.slice(0, html.indexOf('</head>'));
    expect(/<style>\s*@view-transition\s*\{\s*navigation:\s*auto;\s*\}\s*<\/style>/.test(head),
      `${file} opts in to the transition in its own head (through @import the editor’s was not seen in time, and the transition was refused)`);
    const expectId = (/<link rel="expect" href="#([a-z-]+)" blocking="render">/.exec(head) || [])[1];
    expect(!!expectId && html.indexOf('id="' + expectId + '"') > html.indexOf('</head>'),
      `${file} holds its first frame until #${expectId} is parsed`);
    const script = file === 'index.html' ? 'js/home.js' : 'js/boot/panel-restore.js';
    expect(html.indexOf('id="' + expectId + '"') > html.indexOf(script) && html.indexOf(script) > 0,
      `which is after ${script}: the first frame has the list (home) or the project’s name (the editor) in it`);
    expect(html.indexOf('js/boot/early-boot.js') < html.indexOf('</head>'), `${file} runs early boot, which listens for the transition, in its head`);
  }
  const css = noComments(fs.readFileSync(path.join(ROOT, 'css', 'page-transition.css'), 'utf8'));
  for (const f of fs.readdirSync(path.join(ROOT, 'css'))) {
    if (!f.endsWith('.css')) continue;
    expect(!/@view-transition/.test(noComments(fs.readFileSync(path.join(ROOT, 'css', f), 'utf8'))), `css/${f} does not carry the opt-in: the documents do`);
  }
  expect(/@import url\('\.\/page-transition\.css'\)/.test(fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8')), 'the stylesheet both pages load imports it');
  // The elements the script rewrites are the ones the stylesheet names.
  const named = (name) => [...css.matchAll(/([^{}]+)\{[^{}]*view-transition-name:\s*([a-z-]+);/g)]
    .filter((m) => m[2] === name).flatMap((m) => m[1].split(',')).map((sel) => sel.trim().replace(/\s+/g, ' ')).sort().join(', ');
  for (const name of Object.keys(NAMED)) {
    expect(named(name) === NAMED[name].split(', ').sort().join(', '), `the stylesheet and the script name the same elements ${name} (${named(name)})`);
  }
  expect(Object.keys(MORPHS).every((k) => MORPHS[k] === NAMED[k]), 'and the pair the script rewrites is one of them');
  expect(/::view-transition-group\(proj-title\),\s*::view-transition-group\(proj-surface\)\s*\{[^}]*transform-origin:\s*0 0;/.test(css),
    'the two boxes are scaled from their top left corner, as the rewritten animation assumes');
  // ⛔ The surface that travels carries no picture of either end, and has no rounded corners: the box is
  // moved by transform alone, so a picture or a corner inside it is scaled from one end's box to the other's.
  // Every block whose selector list has exactly this selector (not one that merely ends in it).
  const blocks = (sel) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].split(',').map((x) => x.trim()).includes(sel)).map((m) => m[2]).join('\n');
  const surface = blocks('::view-transition-group(proj-surface)');
  expect(!/background|border-radius/.test(surface),
    `⛔ the working area's group paints nothing of its own (no blank to fill, no corner to stretch): it is the editor that moves (${surface.trim().replace(/\s+/g, ' ')})`);
  expect(!blocks('::view-transition-old(proj-surface)') && !blocks('::view-transition-new(proj-surface)'),
    'and its picture is not hidden by the stylesheet: the zoom carries it');
  const landing = blocks(':root:has(> body.home-page)::view-transition-group(proj-title)');
  const factor = /animation-duration:\s*calc\(var\(--page-morph\)\s*\*\s*([\d.]+)\)/.exec(landing);
  expect(factor && Number(factor[1]) < 1,
    `back on home the name lands as the area goes, in less than the page's time: at the full length it crept onto its row across the heading (${landing.trim().replace(/\s+/g, ' ')})`);
  expect(!/var\(--ease-out\)/.test(css) && /--ease-in-out/.test(css),
    '⛔ one balanced curve for what moves: the sharp ease-out did most of the way at once and crept the rest');
  const homeCss = noComments(fs.readFileSync(path.join(ROOT, 'css', 'home.css'), 'utf8'));
  expect(!/data-landing/.test(homeCss) && /\.home-row\[data-opening\] \.home-row__open/.test(homeCss),
    'only a row clicked is washed; the row come back to is not, so nothing goes in one frame at the end');
  // ⛔ The strip does not travel: it is the same on both pages, one picture that stays where it is.
  expect(named('app-header') === 'body > header', `the strip is one named picture on both pages (${named('app-header')})`);
  expect(/::view-transition-group\(app-header\)\s*\{\s*animation:\s*none;/.test(css), 'and its box is not animated: it does not move');
  expect(!Object.values(MORPHS).join(', ').split(', ').some((sel) => /(^|[\s>])header$/.test(sel.trim())), 'nothing the script moves is the strip');
  expect(/html\.jar-motion-reduce::view-transition-group\(\*\)/.test(css) && /prefers-reduced-motion: reduce/.test(css),
    'and with no script at all, reduced motion (the setting, or the system’s) animates nothing');
}

console.log(`OK page transition (${n} checks: which row, a plain cut when motion is held back, nothing from a page nobody saw, transform-only boxes, the name before first paint, both documents opted in)`);
