/**
 * The reading page of a link (share.html, docs/PERSIST.md §5.12): the project
 * someone shared, read only. It asks the server once (GET /api/share/<id>),
 * then draws the files, the open one highlighted, and its outline.
 *
 * Nothing here writes to the browser's storage: a reader keeps nothing of a
 * link until Open in BelJar, which goes home to make the copy
 * (home.mjs `copyShared`).
 */
import { Routes } from '../frame/routes.mjs';
import { whenWords } from '../ui/when.mjs';
import { isBeluga, parse, highlightRuns, runsByLine, outline, holesWords } from './share-render.mjs';
import { fetchShare } from './share-fetch.mjs';

export { fetchShare };

const g = typeof window !== 'undefined' ? window : globalThis;

/** What the page says when there is nothing to show, by why. */
export function noteWords(why) {
  if (why === 'gone') return 'This link no longer works. Whoever shared it may have revoked it, or deleted the project.';
  if (why === 'too-large') return 'This project is too big to show here. Ask whoever shared it for a download.';
  if (why === 'empty') return 'This project has no files yet.';
  return 'Couldn’t load this project. Check the connection and try again.';
}

/**
 * The line under the name: who shared it, and when it was last changed, or
 * when the version it shows was saved: "Shared by @dean · Updated today at 14:02".
 */
export function metaWords(view, now = Date.now()) {
  const parts = [];
  if (view.by) parts.push('Shared by @' + view.by);
  if (view.updatedAt) parts.push((view.follows ? 'Updated ' : 'Version saved ') + whenWords(view.updatedAt, now));
  return parts.join(' · ');
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** The file the address names after its #, else the first Beluga file, else the first. */
export function chooseFile(files, hash) {
  let want = '';
  try { want = decodeURIComponent(String(hash || '').replace(/^#/, '')); } catch (_) { want = ''; }
  const named = files.find((f) => f.path === want);
  if (named) return named.path;
  const bel = files.find((f) => isBeluga(f.path));
  return (bel || files[0] || {}).path || null;
}

function drawCode(box, file) {
  const text = String(file.text || '').replace(/\r\n?/g, '\n');
  const tree = isBeluga(file.path) ? parse(text) : null;
  const lines = runsByLine(highlightRuns(text, tree));
  const pre = el('pre', 'share-lines' + (tree ? '' : ' is-plain'));
  lines.forEach((runs, i) => {
    const line = el('div', 'share-line');
    line.dataset.line = String(i + 1);
    line.appendChild(el('span', 'share-line__n', String(i + 1)));
    const code = el('span', 'share-line__text');
    for (const r of runs) code.appendChild(r.cls ? el('span', r.cls, r.text) : document.createTextNode(r.text));
    if (!runs.length) code.appendChild(document.createTextNode('​'));
    line.appendChild(code);
    pre.appendChild(line);
  });
  box.replaceChildren(pre);
  box.scrollTop = 0;
  box.scrollLeft = 0;
  return tree ? outline(text, tree) : { items: [], holes: [] };
}

function goToLine(box, n) {
  const line = box.querySelector('.share-line[data-line="' + n + '"]');
  if (!line) return;
  for (const was of box.querySelectorAll('.share-line.is-target')) was.classList.remove('is-target');
  line.classList.add('is-target');
  line.scrollIntoView({ block: 'center' });
}

function drawOutline(box, codeBox, o) {
  box.replaceChildren();
  if (!o.items.length && !o.holes.length) return;
  const head = el('h2', 'share-outline__head', 'Outline');
  if (o.holes.length) head.appendChild(el('span', 'share-outline__holes', holesWords(o.holes.length) + ' open'));
  box.appendChild(head);
  const list = el('ul', 'share-outline__list');
  for (const item of o.items) {
    const li = el('li');
    const btn = el('button', 'share-outline__item');
    btn.type = 'button';
    btn.appendChild(el('span', 'share-outline__name', item.name));
    if (item.holes) btn.appendChild(el('span', 'share-outline__count', holesWords(item.holes)));
    btn.addEventListener('click', () => goToLine(codeBox, item.line));
    li.appendChild(btn);
    list.appendChild(li);
  }
  box.appendChild(list);
}

/**
 * The files under their folders, each folder named once: the top level's
 * first, then each folder in the order its first file comes. [{ dir, files }].
 */
export function fileGroups(files) {
  const groups = new Map([['', []]]);
  for (const f of files) {
    const slash = f.path.lastIndexOf('/');
    const dir = slash > 0 ? f.path.slice(0, slash) : '';
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push(f);
  }
  return [...groups].filter(([, fs]) => fs.length).map(([dir, fs]) => ({ dir, files: fs }));
}

function fileButton(f, current, choose) {
  const li = el('li');
  const btn = el('button', 'share-file');
  btn.type = 'button';
  btn.dataset.path = f.path;
  btn.setAttribute('aria-current', f.path === current ? 'true' : 'false');
  btn.appendChild(el('span', 'share-file__name', f.path.slice(f.path.lastIndexOf('/') + 1)));
  btn.addEventListener('click', () => choose(f.path));
  li.appendChild(btn);
  return li;
}

function drawFiles(list, files, current, choose) {
  list.replaceChildren();
  for (const group of fileGroups(files)) {
    if (!group.dir) {
      for (const f of group.files) list.appendChild(fileButton(f, current, choose));
      continue;
    }
    const li = el('li', 'share-folder');
    li.appendChild(el('span', 'share-folder__name', group.dir + '/'));
    const inner = el('ul', 'share-files share-files--in');
    inner.setAttribute('aria-label', group.dir);
    for (const f of group.files) inner.appendChild(fileButton(f, current, choose));
    li.appendChild(inner);
    list.appendChild(li);
  }
}

function say(why, retry) {
  const note = document.getElementById('share-note');
  document.getElementById('share-body').hidden = true;
  document.getElementById('share-note-text').textContent = noteWords(why);
  const link = document.getElementById('share-note-link');
  link.href = Routes.homeUrl();
  link.textContent = why === 'network' ? 'Try again' : 'Go to BelJar';
  link.onclick = why === 'network' ? (e) => { e.preventDefault(); retry(); } : null;
  note.hidden = false;
  document.body.dataset.state = why;
}

function show(id, view) {
  const files = view.files;
  document.title = view.name ? view.name + ' · BelJar' : 'BelJar';
  document.getElementById('share-name').textContent = view.name || 'Untitled project';
  document.getElementById('share-meta').textContent = metaWords(view);
  const open = document.getElementById('share-open');
  open.hidden = false;
  open.onclick = () => Routes.go(Routes.homeUrl({ copy: id }));
  if (!files.length) {
    say('empty');
    return;
  }
  document.getElementById('share-note').hidden = true;
  const body = document.getElementById('share-body');
  const list = document.getElementById('share-files');
  const codeBox = document.getElementById('share-code');
  const outlineBox = document.getElementById('share-outline');
  body.hidden = false;
  document.body.dataset.state = 'shown';
  let current = null;
  function choose(path, fromHash) {
    const f = files.find((x) => x.path === path);
    if (!f) return;
    current = path;
    drawFiles(list, files, current, choose);
    drawOutline(outlineBox, codeBox, drawCode(codeBox, f));
    codeBox.setAttribute('aria-label', f.path);
    if (!fromHash && g.history && typeof g.history.replaceState === 'function') {
      g.history.replaceState(g.history.state, '', '#' + encodeURIComponent(path).replace(/%2F/g, '/'));
    }
  }
  choose(chooseFile(files, g.location.hash), true);
  g.addEventListener('hashchange', () => {
    const p = chooseFile(files, g.location.hash);
    if (p && p !== current) choose(p, true);
  });
}

/** Load the link the address names and draw it. */
export async function start() {
  const home = document.getElementById('share-home');
  if (home) home.href = Routes.homeUrl();
  const id = Routes.shareOf(g.location);
  const load = async () => {
    document.body.dataset.state = 'loading';
    const got = await fetchShare(id);
    if (got.view) show(id, got.view);
    else say(got.why, load);
  };
  await load();
}
