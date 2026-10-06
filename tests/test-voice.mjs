// The house voice, held (plan v6 phase 02, u4; docs/UI.md §5). Every string a
// person reads in the menus, the commands, the dialogs, the settings and the
// notices is collected from its source and checked:
//   - sentence case, except command titles, which are Title Case in the palette
//     and may be named as they are in prose ("Available Keys has the list");
//   - no em or en dash;
//   - no running uppercase, and no stat dump strung on `·`.
// Names keep their capitals: products, keys, Vim's modes, a setting's options
// ("With Kill ring, M-y…"), a menu ("the Project menu", "Project > Download project").
// Uppercase set by CSS (small caps shouting) is held by test-css-tokens.mjs:
// its count per file only goes down.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const rel = (f) => relative(root, f).replace(/\\/g, '/');

function walk(dir, test, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, test, out);
    else if (test(full)) out.push(full);
  }
  return out;
}

// Where surface strings live. The editor's internals, the prover and Beluga's
// own output are not surfaces written in BelJar's voice.
const SURFACES = walk(join(root, 'js'), (f) => f.endsWith('.mjs')
  && /[\\/]js[\\/](ui|account|home|app|commands|persist|frame|status-strip|explorer|library|repl)[\\/]/.test(f))
  .concat(['js/beluga/run-notice.mjs', 'js/harpoon/orca-notice.mjs'].map((f) => join(root, f)));

/** Names that keep their capitals wherever they stand. */
const PROPER = new Set(('BelJar Beluga Harpoon Orca Calf GitHub Google Chrome Safari Firefox Edge Windows Linux Mac '
  + 'macOS iOS Vim Emacs JetBrains Mono Inter Cloudflare REPL LF I OK Ctrl Alt Shift Cmd Meta Enter Esc Escape '
  + 'Tab Space Backspace Delete Home End PageUp PageDown Up Down Left Right Leader Live Server JSON URL CSS HTML API '
  + 'ID Markdown Unicode ASCII Twelf Normal Insert Visual').split(' '));
/** A key or a chord: Ctrl+S, M-y, C-x. */
const CHORD = /^(?:Ctrl|Alt|Shift|Cmd|Meta|Option|[CMS])[+-]/;
const SMALL = new Set('a an and as at but by for from in into nor of on onto or per the to vs via with'.split(' '));
const ACRONYM = /^(?:REPL|JSON|HTML|CSS|URL|API|LF|ID|OK|GPU|CPU|UTF|ASCII|PNG|SVG|ZIP|HTTP|HTTPS|IDE|AST)$/;

const KEYED = /\b(label|title|description|desc|body|message|confirmLabel|cancelLabel|actionLabel|placeholder|hint|heading|detail|note)\s*:\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g;
const ROWS = /\badd(Switch|Dropdown|Action)Row\(\s*[^,()]+,\s*(?:'[^']*',\s*)?'((?:\\.|[^'\\])*)',\s*'((?:\\.|[^'\\])*)'/g;

/** Comments out, strings kept: line comments only where they cannot be inside a string. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, '')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

/** A source string as the page shows it. */
const unescape = (s) => s.replace(/\\n/g, '\n').replace(/\\(['"`\\])/g, '$1');

const strings = []; // { file, key, text }
const commandTitles = new Set();
const optionNames = new Set(); // a dropdown's options, named in its prose
for (const f of SURFACES) {
  const src = stripComments(readFileSync(f, 'utf8'));
  const isCatalog = f.endsWith('command-catalog.mjs');
  for (const m of src.matchAll(/\{\s*value:\s*'[^']*',\s*label:\s*'((?:\\.|[^'\\])*)'/g)) optionNames.add(unescape(m[1]));
  for (const m of src.matchAll(KEYED)) {
    const text = unescape(m[3]);
    if (m[2] === '`' && text.includes('${')) continue;
    if (!/\p{Ll}/u.test(text) || /^[\w.:/#-]+$/.test(text)) continue; // ids, paths, selectors
    if (isCatalog && m[1] === 'title') commandTitles.add(text);
    else strings.push({ file: rel(f), key: m[1], text });
  }
  for (const m of src.matchAll(ROWS)) {
    strings.push({ file: rel(f), key: 'row label', text: unescape(m[2]) });
    if (m[3]) strings.push({ file: rel(f), key: 'row description', text: unescape(m[3]) });
  }
}

const problems = [];
const say = (s, why) => problems.push(`${s.file}  ${s.key}: "${s.text.slice(0, 80)}"  ${why}`);

// Command titles: Title Case, one vocabulary.
for (const t of commandTitles) {
  const s = { file: 'js/commands/command-catalog.mjs', key: 'command', text: t };
  if (/[—–]/.test(t)) say(s, 'has a dash');
  const words = t.split(/\s+/);
  const bad = words.filter((w, i) => /^\p{Ll}/u.test(w) && !(i > 0 && SMALL.has(w)) && !/^(?:e\.g\.|vs\.?)$/.test(w));
  if (bad.length) say(s, `is a command title, so Title Case (${bad.join(', ')})`);
}

// Names prose may use as they are: command titles (with or without their "…")
// and options, longest first so the longer name is taken whole.
const names = [...new Set([...commandTitles, ...[...commandTitles].map((t) => t.replace(/…$/, '')), ...optionNames])]
  .filter((n) => /\p{Lu}/u.test(n)).sort((a, b) => b.length - a.length);
for (const s of strings) {
  const t = s.text;
  if (/[—–]/.test(t)) say(s, 'has a dash');
  if (/·[^·]*·/.test(t)) say(s, 'is a stat dump strung on ·');
  const shout = t.match(/\b\p{Lu}{3,}\b(?:\s+\b\p{Lu}{3,}\b)+/u);
  if (shout && !shout[0].split(/\s+/).every((w) => ACRONYM.test(w))) say(s, `shouts (${shout[0]})`);
  // Sentence case: after a sentence's first word, a capital is a name.
  let prose = t.replace(/\p{Lu}\p{L}*(?=\s+>\s+|\s+menu\b)/gu, ' ');
  for (const name of names) prose = prose.split(name).join(' ');
  for (const sentence of prose.split(/(?<=[.?!:;])\s+|\s+>\s+|\n|["“”‘(]/)) {
    const words = sentence.trim().split(/[\s/]+/).filter(Boolean);
    const caps = words.slice(1).filter((w) => !CHORD.test(w))
      .map((w) => w.replace(/^[^\p{L}]+|[^\p{L}\p{N}’']+$/gu, ''))
      .filter((w) => /^\p{Lu}\p{Ll}/u.test(w) && !PROPER.has(w.replace(/[’']s$/, '')));
    if (caps.length) say(s, `is not sentence case (${caps.join(', ')})`);
  }
}

// A dash in any string a surface module writes, however it reaches the page
// (the REPL's banner was a text node, and said "Beluga 1.1.3 — help"). Not a
// lone "—", the key tables' word for "no key", and not what only a developer
// reads: the console, and the perf HUD.
for (const f of SURFACES.filter((x) => !/perf-hud\.mjs$/.test(x))) {
  stripComments(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
    if (/\bconsole\.\w+\(/.test(line)) return;
    for (const m of line.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*[—–](?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
      if (m[2] === '—') continue;
      problems.push(`${rel(f)}:${i + 1}  has a dash ("${m[2].slice(0, 60)}")`);
    }
  });
}

// One ellipsis, "…", in every module and page: a word trailing off in three typed
// dots is the same thing spelled twice (docs/UI.md §7, "Ellipses").
const everywhere = walk(join(root, 'js'), (f) => f.endsWith('.mjs'))
  .concat(['edit.html', 'index.html', 'privacy.html'].map((f) => join(root, f)));
for (const f of everywhere) {
  stripComments(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/[\p{L}\p{N}]\.\.\.(?=['"`<])/gu)) {
      problems.push(`${rel(f)}:${i + 1}  types three dots ("${line.trim().slice(0, 60)}"): use …`);
    }
  });
}

if (problems.length) {
  console.error(`FAIL: ${problems.length} strings out of the house voice (docs/UI.md §5):`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`OK voice (${strings.length} surface strings and ${commandTitles.size} command titles in ${SURFACES.length} files: sentence case, Title Case commands, no dashes, no shouting)`);
