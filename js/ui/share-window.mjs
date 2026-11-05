/**
 * Share… (docs/PERSIST.md §5.12): one small window for one project.
 *
 * Read from the top. First who can read the project: a mark (a lock, or the
 * globe once there is a link), the state in a few words, and what it means.
 * Under it, the link itself. Before there is one that is Copy link; after, the
 * address and Copy joined in one control of the same height, so making the
 * link turns the button into the link. Revoke sits at the end of the state it
 * ends. Under a hairline, the links made to single versions from Version
 * history: the version's time and address, with copy and revoke.
 *
 * Links are the server's: the window asks it every time it opens, and keeps
 * nothing. Signed out it says links live in the cloud, as Version history does.
 * Opened from the Project menu, home's row menu and the palette.
 */
import { createDialog, openDialog, requestDialogClose } from './dialog.mjs';
import { CARD_CLASS, WRAP_CLASS, actionButton, el } from './prompt-dialog.mjs';
import { versionTime, whenWords } from './when.mjs';

const g = typeof window !== 'undefined' ? window : globalThis;

/** What the window says once the project has a link, under "Anyone with the link". */
export const PROJECT_LINK_WORDS = 'Can read the project, including changes you make later. It isn’t listed anywhere.';

/** What it says before there is one, under "Only you". */
export const NO_LINK_WORDS = 'Anyone you send a link to can read the project, including changes you make later.';

/** What it says over the links to single versions. */
export const VERSION_LINKS_WORDS = 'Each shows the project as it was then.';

/** What Version history says under a link to one version, made `at`. */
export function versionLinkWords(at, now = Date.now()) {
  return 'Anyone with this link can read this version, as it was ' + whenWords(at, now) + '. It isn’t listed anywhere.';
}

/** Why a link could not be made, in a sentence. */
export function shareProblem(error) {
  if (error === 'not-found') return 'This project isn’t in the cloud yet. Try again once it has synced.';
  if (error === 'deleted') return 'This project was deleted in the cloud, so it can’t be shared.';
  if (error === 'no-version') return 'That version can’t be shared.';
  if (error === 'too-many') return 'This project has as many links as it can have. Revoke one to make another.';
  return 'Couldn’t reach the cloud. Try again.';
}

export const SIGNED_OUT_WORDS = 'Links are kept in the cloud. Sign in to make one.';
export const UNSYNCED_WORDS = 'Some changes here aren’t in the cloud yet, so the link doesn’t show them.';

/**
 * Each state the window can be in: its mark, its title, what it means. The
 * window draws one of these at the top, and nothing else says who can read.
 */
export const ACCESS = {
  looking: { glyph: 'link', title: 'Looking for a link…', words: '' },
  none: { glyph: 'lock', title: 'Only you', words: NO_LINK_WORDS },
  // Links to single versions, and none to the project: "Only you" would not be true.
  versions: { glyph: 'link', title: 'No link to the project yet', words: NO_LINK_WORDS },
  link: { glyph: 'globe', title: 'Anyone with the link', words: PROJECT_LINK_WORDS },
  out: { glyph: 'lock', title: 'Only you', words: SIGNED_OUT_WORDS },
  trouble: { glyph: 'alert', title: 'Couldn’t reach the cloud', words: '' },
};

/** Lucide's glyphs (ISC licence), drawn with one stroke: what each mark and control is. */
const GLYPHS = {
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  open: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  unlink: '<path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/><path d="M8 2v3"/><path d="M2 8h3"/><path d="M16 19v3"/><path d="M19 16h3"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
};

export const GLYPH_NAMES = Object.keys(GLYPHS);

function svgOf(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + GLYPHS[name] + '</svg>';
}

/** One glyph, in a span that sizes it. */
export function glyph(name, className) {
  const span = el('span', 'share-glyph' + (className ? ' ' + className : ''));
  span.dataset.glyph = name;
  span.innerHTML = svgOf(name);
  return span;
}

/** A text button with its glyph before the words. */
export function glyphButton(label, action, variant, name) {
  const btn = actionButton(label, action, variant);
  btn.classList.add('has-glyph');
  btn.replaceChildren(glyph(name), el('span', 'share-label', label));
  return btn;
}

/** A control's words where the pointer can read them, and a screen reader always. */
function tip(node, text) {
  const T = g.Tooltips;
  if (T && typeof T.set === 'function') T.set(node, text);
  else node.setAttribute('aria-label', text);
}

/** The whole address of link `id`, to send. */
export function linkAddress(id) {
  const R = g.Routes;
  return R && typeof R.shareUrl === 'function' ? R.shareUrl(id, true) : '/s/' + id;
}

/** An address as the window shows it: no scheme, and the link's own id apart. */
export function addressParts(href, id) {
  const shown = String(href).replace(/^https?:\/\//, '');
  const cut = id && shown.endsWith(id) ? shown.length - id.length : shown.lastIndexOf('/') + 1;
  return { host: shown.slice(0, cut), id: shown.slice(cut) };
}

function selectAll(node) {
  const sel = typeof g.getSelection === 'function' ? g.getSelection() : null;
  if (!sel || typeof document === 'undefined') return;
  const range = document.createRange();
  range.selectNodeContents(node);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Put `text` on the clipboard. True when it went; false leaves the address
 * selected in `field`, ready for the keyboard's copy.
 */
export async function copyText(text, field) {
  try {
    const nav = g.navigator;
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      await nav.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* fall back to the selection */ }
  if (field) {
    if (typeof field.focus === 'function') field.focus();
    if (typeof field.select === 'function') field.select();
    else selectAll(field);
  }
  return false;
}

/** For a moment after a copy, the control says it went: the check, and `done` for its words. */
function copied(btn, label, words, done) {
  const mark = btn.querySelector('.share-glyph');
  if (mark) mark.replaceWith(glyph('check'));
  else btn.innerHTML = svgOf('check');
  btn.classList.add('is-copied');
  if (label) label.textContent = done;
  clearTimeout(btn._copiedTimer);
  btn._copiedTimer = setTimeout(() => {
    const now = btn.querySelector('.share-glyph');
    if (now) now.replaceWith(glyph('copy'));
    else btn.innerHTML = svgOf('copy');
    btn.classList.remove('is-copied');
    if (label) label.textContent = words;
  }, 1600);
}

/**
 * One link: its address and Copy, joined, with a way to open it. `onCopy(ok)`
 * hears whether the clipboard took it. Returns the row; `row.copy()` copies.
 */
export function linkRow(id, opts = {}) {
  const href = linkAddress(id);
  const parts = addressParts(href, id);
  const row = el('div', 'share-link');
  const field = el('div', 'share-link__address share-window__address');
  field.tabIndex = 0;
  field.dataset.link = href;
  field.setAttribute('role', 'textbox');
  field.setAttribute('aria-readonly', 'true');
  field.setAttribute('aria-label', 'Link');
  field.append(el('span', 'share-link__host', parts.host), el('span', 'share-link__id', parts.id));
  field.addEventListener('focus', () => selectAll(field));
  // Copied by hand, the address goes whole, with its scheme.
  field.addEventListener('copy', (e) => {
    if (!e.clipboardData) return;
    e.clipboardData.setData('text/plain', href);
    e.preventDefault();
  });

  const open = el('a', 'share-link__open');
  open.href = href;
  open.target = '_blank';
  open.rel = 'noopener';
  open.appendChild(glyph('open'));
  tip(open, 'Open link');

  const copy = el('button', 'share-link__copy share-window__copy');
  copy.type = 'button';
  copy.dataset.action = 'copy';
  const label = el('span', 'share-label', 'Copy');
  copy.append(glyph('copy'), label);
  async function doCopy() {
    const ok = await copyText(href, field);
    if (ok) copied(copy, label, 'Copy', 'Copied');
    if (typeof opts.onCopy === 'function') opts.onCopy(ok);
    return ok;
  }
  copy.addEventListener('click', doCopy);
  row.append(field, open, copy);
  row.copy = doCopy;
  return row;
}

/** An icon-only control, its words in its tooltip. */
function iconButton(name, words, className) {
  const btn = el('button', 'icon-btn share-icon-btn ' + className);
  btn.type = 'button';
  btn.innerHTML = svgOf(name);
  tip(btn, words);
  return btn;
}

/** A link to one version: when the version was, its address; copy, revoke. */
function versionRow(link, onRevoke) {
  const href = linkAddress(link.id);
  const item = el('li', 'share-version share-window__version');
  item.dataset.version = String(link.version);
  item.appendChild(glyph('history', 'share-version__mark'));
  const text = el('div', 'share-version__text');
  text.appendChild(el('span', 'share-version__when', versionTime(link.versionAt || link.createdAt)));
  const address = el('span', 'share-version__address share-window__address', '/s/' + link.id);
  address.dataset.link = href;
  text.appendChild(address);
  item.appendChild(text);
  const copy = iconButton('copy', 'Copy link', 'share-version__copy');
  copy.addEventListener('click', async () => {
    if (await copyText(href, address)) copied(copy, null, '', '');
  });
  const off = iconButton('unlink', 'Revoke link', 'share-version__revoke share-window__revoke');
  off.addEventListener('click', () => onRevoke(link.id, off));
  item.append(copy, off);
  return item;
}

/** The top of the window: who can read the project. `action` sits on the title's line. */
function accessRow(kind, action) {
  const A = ACCESS[kind];
  const box = el('div', 'share-access');
  box.dataset.state = kind;
  box.appendChild(glyph(A.glyph, 'share-access__mark'));
  box.appendChild(el('p', 'share-access__title', A.title));
  if (action) box.appendChild(action);
  if (A.words) box.appendChild(el('p', 'share-access__words share-window__words', A.words));
  return box;
}

/** A line under the link: a problem, or what it does not show yet. */
function line(text, kind) {
  const p = el('p', 'share-line share-window__' + kind);
  p.append(glyph('alert'), el('span', '', text));
  return p;
}

let open = null;

/**
 * Open the window for project `pid` (default: the open one). `name` is how
 * the title names it.
 */
export async function openShareWindow(pid, name) {
  const P = g.Persist;
  const A = g.Account;
  if (!P) return false;
  if (!pid) pid = P.getActiveProjectId();
  if (!name) {
    const p = (typeof P.projects === 'function' ? P.projects() : []).find((x) => x.id === pid);
    name = p ? p.name : P.getProjectName();
  }
  if (open) requestDialogClose(open);

  const body = el('div', 'share-window');
  const dialogEl = createDialog({
    ariaLabel: 'Share ' + name,
    title: 'Share “' + name + '”',
    content: body,
    className: WRAP_CLASS + ' share-window-wrap',
    cardClass: CARD_CLASS + ' share-window__card',
    removeOnClose: true,
  });
  dialogEl.addEventListener('close', () => { if (open === dialogEl) open = null; });
  open = dialogEl;
  openDialog(dialogEl);

  let busy = false;
  let synced = null;
  let links = [];

  /** The slot under the state: one control, always the same height. */
  function slotButton(label, action, variant, glyphName) {
    const btn = glyphName ? glyphButton(label, action, variant, glyphName) : actionButton(label, action, variant);
    btn.classList.add('share-slot');
    return btn;
  }

  function signedOut() {
    const parts = [accessRow('out')];
    if (A && typeof A.signIn === 'function') {
      const sign = slotButton('Sign in with GitHub', 'sign-in', 'primary');
      sign.addEventListener('click', () => { requestDialogClose(dialogEl); A.signIn(); });
      parts.push(sign);
    }
    body.replaceChildren(...parts);
  }

  function trouble() {
    const again = slotButton('Try again', 'retry', 'secondary');
    again.addEventListener('click', () => load());
    body.replaceChildren(accessRow('trouble'), again);
  }

  function looking() {
    const wait = slotButton('Copy link', 'make', 'primary', 'link');
    wait.disabled = true;
    body.replaceChildren(accessRow('looking'), wait);
  }

  async function make() {
    if (busy) return null;
    busy = true;
    let res;
    try {
      res = await P.makeShare(pid, 0);
    } catch (_) {
      res = { ok: false, error: 'network' };
    }
    busy = false;
    if (res === null) {
      signedOut();
      return null;
    }
    return res;
  }

  async function revoke(id, btn) {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try {
      await P.revokeShare(pid, id);
    } catch (_) {
      busy = false;
      btn.disabled = false;
      draw(shareProblem('network'));
      return;
    }
    busy = false;
    await load(true);
  }

  function draw(problem) {
    const project = links.find((l) => !l.version);
    const parts = [];
    if (project) {
      const off = actionButton('Revoke', 'revoke', 'ghost');
      off.classList.add('share-access__revoke', 'share-window__revoke');
      off.addEventListener('click', () => revoke(project.id, off));
      parts.push(accessRow('link', off), linkRow(project.id));
    } else {
      const make1 = slotButton('Copy link', 'make', 'primary', 'link');
      make1.classList.add('share-window__make');
      make1.addEventListener('click', async () => {
        make1.disabled = true;
        const res = await make();
        if (!res) return;
        if (!res.ok) {
          draw(shareProblem(res.error));
          return;
        }
        links = [{ id: res.id, version: 0, createdAt: res.createdAt, versionAt: 0 }].concat(links.filter((l) => l.version));
        draw();
        const row = body.querySelector('.share-link');
        if (row && row.copy) row.copy();
      });
      parts.push(accessRow(links.length ? 'versions' : 'none'), make1);
    }
    if (problem) parts.push(line(problem, 'problem'));
    if (synced === false) parts.push(line(UNSYNCED_WORDS, 'unsynced'));

    const fixed = links.filter((l) => l.version);
    if (fixed.length) {
      const versions = el('section', 'share-versions');
      const head = el('div', 'share-versions__head');
      head.append(el('h3', 'share-versions__title', 'Links to one version'), el('p', 'share-versions__words', VERSION_LINKS_WORDS));
      const list = el('ul', 'share-versions__list');
      for (const l of fixed) list.appendChild(versionRow(l, revoke));
      versions.append(head, list);
      parts.push(versions);
    }
    body.replaceChildren(...parts);
  }

  /** Ask the server what links there are. `quiet` keeps what is shown until it answers. */
  async function load(quiet) {
    if (!A || typeof A.user !== 'function' || !A.user()) {
      signedOut();
      return;
    }
    if (!quiet) looking();
    // What was typed here goes up first, so a link made now shows it.
    if (synced == null) {
      try {
        const s = await P.confirmSynced();
        synced = !!(s && s.ok);
      } catch (_) {
        synced = false;
      }
    }
    let got;
    try {
      got = await P.shareLinks(pid);
    } catch (_) {
      got = undefined;
    }
    if (open !== dialogEl) return;
    if (got === null) return signedOut();
    if (!got) return trouble();
    links = got;
    draw();
  }

  await load();
  return true;
}

/** Share… is offered wherever there is a server to keep links (signed out, it says sign in). */
export function shareAvailable() {
  const A = g.Account;
  return !!A && typeof A.available === 'function' && A.available();
}

/**
 * Version history's "Share this version": make the version link (or find the
 * one there is), copy it, and say what it is. `into` receives the link and
 * the words.
 */
export async function shareVersion(pid, version, at, into) {
  const P = g.Persist;
  let res;
  try {
    res = await P.makeShare(pid, version);
  } catch (_) {
    res = { ok: false, error: 'network' };
  }
  const box = el('div', 'share-window__inline');
  if (!res) {
    box.appendChild(el('p', 'history__note', SIGNED_OUT_WORDS));
  } else if (!res.ok) {
    box.appendChild(el('p', 'review__problem', shareProblem(res.error)));
  } else {
    const row = linkRow(res.id);
    box.appendChild(row);
    box.appendChild(el('p', 'history__note share-window__words', versionLinkWords(res.versionAt || at)));
    into.replaceChildren(box);
    await row.copy();
    return res;
  }
  into.replaceChildren(box);
  return res;
}

export const ShareWindow = { open: openShareWindow, available: shareAvailable, shareVersion };
g.ShareWindow = ShareWindow;
