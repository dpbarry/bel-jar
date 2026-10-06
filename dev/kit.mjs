/**
 * The kit page (dev/kit.html): BelJar's components, drawn by the app's own
 * modules, on one page.
 *
 * ⛔ Nothing here is a copy of a component. A row is `rowNode`, a button is
 * `actionButton`, the cloud is `cloudSvg`, a menu is `Menu.open`, the two
 * headers are read out of the two documents. A specimen retyped here would
 * show what the kit thinks ships, which is the one thing a kit is for avoiding.
 *
 * The app's sources are loaded as they are written (native modules, no build):
 * a change to a component shows here on reload. The page has no store behind
 * it, so what a specimen DOES is not on show, only how it looks; the parts that
 * would reach for a project are inert.
 */
import { settingRow } from '../js/persist/settings-schema.mjs';

// The few modules that read a setting as they load get the settings' own defaults.
window.Settings = {
  get: (id) => { const row = settingRow(id); return row ? row.default : undefined; },
  set: () => true,
  reset: () => true,
  revision: () => 0,
  values: () => ({}),
  subscribe: () => () => {},
};

const { Routes } = await import('../js/frame/routes.mjs');
await import('../js/ui/tooltips.mjs');
await import('../js/ui/menu.mjs');
await import('../js/ui/toasts.mjs');
const { actionButton, buildActions, el, PromptDialog } = await import('../js/ui/prompt-dialog.mjs');
const { cloudLook, cloudSvg } = await import('../js/account/cloud-glyphs.mjs');
const home = await import('../js/home/home.mjs');

const kit = document.getElementById('kit');

function section(title, about) {
  const sec = el('section', 'kit-section');
  sec.appendChild(el('h2', 'kit-section__title', title));
  if (about) sec.appendChild(el('p', 'kit-section__about', about));
  const list = el('div', 'kit-specimens');
  sec.appendChild(list);
  kit.appendChild(sec);
  return list;
}

/** Two frames: long enough for a component to have opened and taken its shown state. */
const settled = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 250))));

/**
 * A component that floats over the app (a menu, a toast), in the page instead:
 * the nodes the component itself made, cloned as they are once shown, and set
 * in the frame. The look is the component's; only where it sits is the kit's.
 */
function inFlow(frame, nodes) {
  for (const node of nodes) {
    const copy = node.cloneNode(true);
    copy.style.left = '';
    copy.style.top = '';
    copy.classList.add('kit-inflow');
    frame.appendChild(copy);
  }
}

/** One button, in the row a dialog would set it in (so it takes its own width). */
function loneButton(frame, label, action) {
  const row = buildActions([{ action, label, variant: 'secondary' }], 'row');
  frame.appendChild(row);
  return row.querySelector('button');
}

function specimen(list, label, frameClass) {
  const wrap = el('div', 'kit-specimen');
  wrap.appendChild(el('p', 'kit-specimen__label', label));
  const frame = el('div', 'kit-frame' + (frameClass ? ' ' + frameClass : ''));
  wrap.appendChild(frame);
  list.appendChild(wrap);
  return frame;
}

async function documentOf(file) {
  const res = await fetch(new URL('../' + file, import.meta.url));
  return new DOMParser().parseFromString(await res.text(), 'text/html');
}

/** A header as its document ships it; `signedIn` shows the cloud and the avatar it gains. */
function headerOf(doc, signedIn) {
  const header = doc.querySelector('body > header').cloneNode(true);
  for (const a of header.querySelectorAll('a[href]')) a.addEventListener('click', (e) => e.preventDefault());
  if (signedIn) {
    const cloud = header.querySelector('#btn-sync');
    if (cloud) {
      cloud.hidden = false;
      cloud.dataset.state = 'synced';
      cloud.innerHTML = cloudSvg(cloudLook('synced'));
    }
    const account = header.querySelector('#btn-account');
    if (account) {
      account.hidden = false;
      account.classList.add('is-signed-in');
      account.replaceChildren(el('span', 'account-avatar account-initial', 'D'));
    }
  } else {
    const account = header.querySelector('#btn-account');
    if (account && /home-page/.test(doc.body.className)) {
      account.hidden = false;
      account.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
    }
  }
  const name = header.querySelector('#header-context-name');
  if (name) name.textContent = 'Lecture notes';
  return header;
}

// ── headers ─────────────────────────────────────────────────────────────────
{
  const [homeDoc, editDoc] = await Promise.all([documentOf('index.html'), documentOf('edit.html')]);
  const list = section('Headers', 'Read out of index.html and edit.html. Signed in, a header gains the cloud and the avatar.');
  specimen(list, 'Home, signed out', 'kit-frame--flush').appendChild(headerOf(homeDoc, false));
  specimen(list, 'Home, signed in', 'kit-frame--flush').appendChild(headerOf(homeDoc, true));
  specimen(list, 'The editor, signed out: no account button', 'kit-frame--flush').appendChild(headerOf(editDoc, false));
  specimen(list, 'The editor, signed in', 'kit-frame--flush').appendChild(headerOf(editDoc, true));
  window.__kitHomeDoc = homeDoc;
}

// ── panel headers ───────────────────────────────────────────────────────────
{
  const editDoc = await documentOf('edit.html');
  const list = section('Panel headers', 'Read out of edit.html, each in its panel, open as the workspace opens it: the label first, the controls at the end.');
  for (const [id, label] of [['explorer', 'Explorer'], ['inspector', 'Inspector'], ['library', 'Library'], ['harpoon', 'Harpoon']]) {
    const panel = editDoc.getElementById(id + '-panel');
    if (!panel) continue;
    const workspace = el('div', 'workspace is-' + id + '-open kit-inflow');
    const shell = el('div', panel.className);
    const header = panel.querySelector('.panel-header').cloneNode(true);
    // Ids belong to the editor's one copy; these are pictures of it.
    for (const n of [header, ...header.querySelectorAll('[id]')]) n.removeAttribute('id');
    shell.appendChild(header);
    workspace.appendChild(shell);
    specimen(list, label, 'kit-frame--flush kit-frame--panel').appendChild(workspace);
  }
}

// ── buttons ─────────────────────────────────────────────────────────────────
{
  const list = section('Buttons', 'actionButton (js/ui/prompt-dialog.mjs): the one text button, in its four weights.');
  const variants = ['primary', 'secondary', 'danger', 'ghost'].map((v) => ({ action: v, label: v.charAt(0).toUpperCase() + v.slice(1), variant: v }));
  specimen(list, 'Primary, secondary, danger, ghost: in a row, as a dialog sets them').appendChild(buildActions(variants, 'row'));
  const off = buildActions(variants, 'row');
  for (const b of off.querySelectorAll('button')) b.disabled = true;
  specimen(list, 'Each one disabled').appendChild(off);
  specimen(list, 'Stacked, as a dialog with long answers sets them').appendChild(buildActions(variants.slice(0, 2)));
}

// ── the cloud ───────────────────────────────────────────────────────────────
{
  const list = section('The cloud', 'cloudSvg (js/account/cloud-glyphs.mjs): one indicator for sync, in every state the summary has.');
  const row = specimen(list, 'Each state of the sync summary, and the look it takes', 'kit-frame--row');
  for (const state of ['synced', 'pending', 'syncing', 'offline', 'differs', 'held', 'error']) {
    const cell = el('span', 'kit-cloud');
    const btn = el('button', 'icon-btn sync-cloud');
    btn.type = 'button';
    btn.dataset.state = state;
    btn.setAttribute('aria-label', state);
    btn.innerHTML = cloudSvg(cloudLook(state));
    cell.append(btn, el('span', null, state));
    row.appendChild(cell);
  }
}

// ── a menu ──────────────────────────────────────────────────────────────────
{
  const list = section('Menus', 'Menu (js/ui/menu.mjs), opened as the app opens it: a status row, a section, items, a separator.');
  const anchor = loneButton(specimen(list, 'The live one: press it'), 'Open the menu', 'menu');
  const frame = specimen(list, 'A popover: state first, then what you can do');
  const items = () => [
    { type: 'status', title: 'All changes synced', detail: 'Synced 2 minutes ago' },
    { type: 'separator' },
    { label: 'Sync now', onSelect() {} },
    { label: 'Review differences', onSelect() {}, disabled: true },
    { type: 'section', label: 'Project' },
    { label: 'Rename…', onSelect() {}, shortcut: 'F2' },
    { label: 'Download', onSelect() {} },
    { type: 'separator' },
    { label: 'Delete…', onSelect() {} },
  ];
  const open = () => window.Menu.open({ anchor, items: items(), side: 'bottom', align: 'start' });
  anchor.addEventListener('click', open);
  open();
  await settled();
  inFlow(frame, document.querySelectorAll('#menu-root .menu'));
  window.Menu.closeAll();
}

// ── dialog cards ────────────────────────────────────────────────────────────
{
  const list = section('Dialogs', 'PromptDialog (js/ui/prompt-dialog.mjs), opened as the app opens it and then set in the page instead of over it.');
  const card = async (label, opts) => {
    const frame = specimen(list, label);
    const answered = PromptDialog.open(opts);
    await settled();
    // The one over the page: an earlier specimen is an open dialog too, in its frame.
    const real = document.querySelector('dialog.jar-dialog:modal');
    if (!real) return;
    inFlow(frame, [real]);
    real.querySelector('button[data-action]').click();
    await answered;
    await settled();
  };
  await card('A choice only a person can make: the message, one note, two buttons in a row', {
    message: 'Not everything is in the cloud yet',
    note: 'Signing out removes your projects from this browser, with what hasn’t synced.',
    layout: 'row',
    buttons: [
      { action: 'out', label: 'Sign out anyway', variant: 'secondary' },
      { action: 'stay', label: 'Stay signed in', variant: 'primary' },
    ],
  });
  await card('About one thing, named: the subject in mono, a destructive answer', {
    subject: 'Lecture notes',
    message: 'Delete this project and its 4 files?',
    layout: 'row',
    buttons: [
      { action: 'no', label: 'Cancel', variant: 'secondary' },
      { action: 'yes', label: 'Delete', variant: 'danger' },
    ],
  });
}

// ── home ────────────────────────────────────────────────────────────────────
{
  const list = section('Home', 'The page\'s own column, read out of index.html and filled by home\'s own builders (js/home/home.mjs): rowNode, startNodes, linkNodes, findNodes, signInLine.');
  const now = Date.now();
  const rows = [
    [{ id: 'p_01m3xq1ph808nx8xjd4jj1rhca', name: 'Lecture notes' }, { editedAt: now - 2 * 60 * 1000 }, 0],
    [{ id: 'p_01m3xq1ph808nx8xjd4jj1rhcb', name: 'Assignment 3' }, { editedAt: now - 3 * 3600 * 1000 }, 0],
    [{ id: 'p_01m3xq1ph808nx8xjd4jj1rhcc', name: 'Thesis' }, { editedAt: now - 30 * 3600 * 1000 }, 2],
    [{ id: 'p_01m3xq1ph808nx8xjd4jj1rhcd', name: 'A project with a name long enough that it has to be cut short somewhere before its date' }, { editedAt: now - 9 * 86400 * 1000 }, 0],
    [{ id: 'p_01m3xq1ph808nx8xjd4jj1rhce', name: 'Scratch' }, { editedAt: now - 400 * 86400 * 1000 }, 0],
  ];
  /** Home's `<main>`, as its document ships it, in a frame: inert, since its actions need a store. */
  const page = (label, mode) => {
    const frame = specimen(list, label, 'kit-frame--flush kit-frame--home');
    frame.inert = true;
    const main = window.__kitHomeDoc.querySelector('main.home').cloneNode(true);
    main.dataset.mode = mode;
    frame.appendChild(main);
    const part = (id) => main.querySelector('#' + id);
    part('home-mark').prepend(window.__kitHomeDoc.querySelector('header .header-logo').cloneNode(true));
    part('home-actions').append(...home.startNodes());
    part('home-links').append(...home.linkNodes());
    return { main, part };
  };

  // Coming back: the ways to start, then the projects (one with files to review, one being opened).
  const back = page('Coming back, signed out where a server answers: the way in under the name, the ways to start, the projects (one with files to review, one being opened)', 'returning');
  back.part('home-signin').hidden = false;
  home.signInLine(back.part('home-signin'), () => {});
  back.part('home-projects-section').hidden = false;
  back.part('home-find').hidden = false;
  back.part('home-find').append(...home.findNodes('Ctrl+K'));
  for (const [p, stats, review] of rows) back.part('home-list').appendChild(home.rowNode(p, stats, review));
  back.part('home-list').children[1].setAttribute('data-opening', '');

  // A browser with no project in it: the ways to start are all there is.
  page('A browser with no project in it: the name and the ways to start', 'first');

  // The quiet lines.
  const lines = page('The quiet lines: a project that is not here, news in passing, Safari\'s seven days', 'first');
  for (const [id, text] of [
    ['home-waiting', 'That project isn’t in this browser.'],
    ['home-news', 'Start page: Last project'],
    ['home-risk', 'Safari deletes this site’s data after 7 days without a visit. Sign in, or download your projects, to keep them.'],
  ]) {
    lines.part(id).hidden = false;
    lines.part(id).textContent = text;
  }
  // One document, one of each id: the specimens keep their classes and give up their ids.
  for (const node of document.querySelectorAll('.kit-frame--home [id]')) node.removeAttribute('id');
}

// ── toasts ──────────────────────────────────────────────────────────────────
{
  const list = section('Toasts', 'Toasts (js/ui/toasts.mjs), in their own corner of the page: a failure, a warning, a note. Never for something that went right.');
  const again = loneButton(specimen(list, 'The live ones, where the app shows them: press it'), 'Show them', 'toasts');
  const show = (ms) => {
    window.Toasts.dismissAll();
    window.Toasts.error('Couldn’t sign in with GitHub. The reason is in the notifications.', { duration: ms, notify: false });
    window.Toasts.warn('BelJar was updated in another tab. Reload to keep editing.', { duration: ms, notify: false });
    window.Toasts.info('Sign-in was cancelled.', { duration: ms, notify: false });
  };
  again.addEventListener('click', () => show(6000));
  const frame = specimen(list, 'An error, a warning, a note');
  show(0);
  await settled();
  inFlow(frame, document.querySelectorAll('#toast-stack .toast'));
  window.Toasts.dismissAll();
}

// ── what is not here ────────────────────────────────────────────────────────
{
  const list = section('Not on this page yet', '');
  const frame = specimen(list, 'These draw themselves from an open project, and the kit has none: phase 02 of the plan (u1) brings them here.');
  frame.appendChild(el('p', 'kit-missing', 'The strip, explorer rows, the side panels below their headers, floating windows, the palette, the Settings dialog, the name prompt, notifications.'));
}

// ── themes ──────────────────────────────────────────────────────────────────
function setTheme(theme) {
  document.documentElement.classList.toggle('light', theme === 'light');
  for (const b of document.querySelectorAll('[data-kit-theme]')) b.setAttribute('aria-pressed', String(b.dataset.kitTheme === theme));
}
for (const b of document.querySelectorAll('[data-kit-theme]')) b.addEventListener('click', () => setTheme(b.dataset.kitTheme));
setTheme('dark');

window.Kit = {
  setTheme,
  sections: () => [...document.querySelectorAll('.kit-section__title')].map((h) => h.textContent),
  specimens: () => document.querySelectorAll('.kit-specimen').length,
  routes: Routes,
};
window.KitReady = true;
