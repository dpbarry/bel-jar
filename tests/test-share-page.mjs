// The reading page of a link (share.html, js/share/, docs/PERSIST.md §5.12):
// a small page of its own, the editor's highlighting on the parser alone, an
// outline from the same parse, and a sentence for everything that can go
// wrong. The Share window's words (js/ui/share-window.mjs) and home's copy
// (Open in BelJar) are held here too.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, highlightRuns, runsByLine, outline, holesWords, isBeluga, lineStarts, lineAt } from '../js/share/share-render.mjs';
import { fetchShare } from '../js/share/share-fetch.mjs';
import { noteWords, metaWords, chooseFile, fileGroups } from '../js/share/share-page.mjs';
import {
  PROJECT_LINK_WORDS, NO_LINK_WORDS, VERSION_LINKS_WORDS, ACCESS, GLYPH_NAMES, addressParts,
  versionLinkWords, shareProblem, SIGNED_OUT_WORDS, UNSYNCED_WORDS,
} from '../js/ui/share-window.mjs';
import { whenWords } from '../js/ui/when.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── 1. ⛔ a small page of its own ────────────────────────────────────────────
{
  const built = fs.readFileSync(path.join(ROOT, 'js', 'share.js'), 'utf8');
  expect(built.length < 300 * 1024, `the reading page's script is under 300 KB (${Math.round(built.length / 1024)} KB)`);
  expect(!/EditorView|@codemirror|createSyncEngine|Persist\s*=|localStorage\.setItem/.test(built), 'and holds no editor, no Persist, and writes nothing to the browser');
  const seen = new Set();
  (function walk(file) {
    const rel = path.relative(path.join(ROOT, 'js'), file).replace(/\\/g, '/');
    if (seen.has(rel)) return;
    seen.add(rel);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/^\s*(?:import|export)\s[^;'"]*?\bfrom\s*['"](\.[^'"]+)['"]|^\s*import\s*['"](\.[^'"]+)['"]/gm)) {
      walk(path.join(path.dirname(file), m[1] || m[2]));
    }
  })(path.join(ROOT, 'js', 'share.mjs'));
  const ALLOWED = new Set([
    'share.mjs', 'frame/routes.mjs', 'ui/when.mjs', 'share/share-page.mjs', 'share/share-render.mjs', 'share/share-fetch.mjs',
    'editor-src/beluga-parser.js', 'editor-src/beluga-parser.terms.js', 'editor-src/beluga-tokens.mjs', 'editor-src/highlight-tags.mjs',
  ]);
  const strays = [...seen].filter((m) => !ALLOWED.has(m));
  expect(seen.size === ALLOWED.size && !strays.length, `the page imports the parser, the tags, Routes and itself, nothing else (${strays.join(', ') || seen.size})`);
  const html = fs.readFileSync(path.join(ROOT, 'share.html'), 'utf8');
  expect(/<meta name="robots" content="noindex, nofollow">/.test(html), 'it asks not to be indexed');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  expect(JSON.stringify(scripts) === JSON.stringify(['/js/boot/early-boot.js', '/js/share.js']), `it loads early boot and its own script only (${scripts})`);
  const homeSrc = fs.readFileSync(path.join(ROOT, 'js', 'home.mjs'), 'utf8');
  const homeHome = fs.readFileSync(path.join(ROOT, 'js', 'home', 'home.mjs'), 'utf8');
  expect(!/share-page|share-render/.test(homeSrc + homeHome) && /from '\.\.\/share\/share-fetch\.mjs'/.test(homeHome),
    'home asks the server for a link without loading the reading page or its parser');
}

// ── 2. one table of tags, for the editor and every reading of source ────────
{
  const lang = fs.readFileSync(path.join(ROOT, 'js', 'editor-src', 'language.mjs'), 'utf8');
  const render = fs.readFileSync(path.join(ROOT, 'js', 'editor-src', 'format', 'source-render.mjs'), 'utf8');
  expect(/import \{ holeTag, belugaHighlight \} from '\.\/highlight-tags\.mjs'/.test(lang) && !/styleTags\(/.test(lang),
    'the editor reads its node tags from highlight-tags.mjs, and defines none of its own');
  expect(/import \{ SOURCE_HIGHLIGHTER \} from '\.\.\/highlight-tags\.mjs'/.test(render) && !/tagHighlighter\(/.test(render),
    'the Library preview takes its classes from the same place');
  const css = fs.readFileSync(path.join(ROOT, 'css', 'source-hl.css'), 'utf8');
  const tags = fs.readFileSync(path.join(ROOT, 'js', 'editor-src', 'highlight-tags.mjs'), 'utf8');
  const classes = [...new Set([...tags.matchAll(/class: '([\w-]+)'/g)].map((m) => m[1]))];
  const unstyled = classes.filter((c) => !css.includes('.' + c + ' '));
  expect(classes.length > 15 && !unstyled.length, `every class the tags give is styled in source-hl.css (${unstyled.join(', ') || classes.length})`);
}

// ── 3. the highlighting: every character once, the editor's classes ──────────
const SAMPLE = [
  'LF nat : type =',
  '| z : nat',
  '| s : nat → nat;',
  '',
  'rec half : [⊢ nat] → [⊢ nat] = / total n (half n) /',
  'fn n ⇒ case n of',
  '| [⊢ z] ⇒ ?',
  '| [⊢ s N] ⇒ ?todo;',
  '',
  'rec id : [⊢ nat] → [⊢ nat] = fn n ⇒ n;',
  '',
  'proof p : [⊢ nat] =',
  '?;',
  '',
].join('\n');
{
  const tree = parse(SAMPLE);
  const runs = highlightRuns(SAMPLE, tree);
  expect(tree && runs.map((r) => r.text).join('') === SAMPLE, 'the runs are the text, every character once, in order');
  const cls = (t) => (runs.find((r) => r.text === t) || {}).cls;
  expect(cls('LF') === 'jar-hl-keyword' && cls('rec') === 'jar-hl-keyword' && cls('?todo') === 'jar-hl-hole' && cls('z') === 'jar-hl-ctor',
    `keywords, holes and constructors take the editor's classes (${cls('LF')}, ${cls('?todo')}, ${cls('z')})`);
  const lines = runsByLine(runs);
  expect(lines.length === SAMPLE.split('\n').length && lines[3].length === 0
    && lines[4].map((r) => r.text).join('') === SAMPLE.split('\n')[4], 'split into lines as the file has them, blank ones too');
  expect(JSON.stringify(highlightRuns('plain text', null)) === '[{"text":"plain text","cls":""}]' && !highlightRuns('', null).length,
    'a file that is not Beluga is shown as it is');
  expect(isBeluga('a/b.bel') && isBeluga('x.LF') && !isBeluga('suite.cfg') && !isBeluga('notes.md'), 'Beluga is .bel and .lf');
  const st = lineStarts('a\nbb\n\nc');
  expect(lineAt(st, 0) === 1 && lineAt(st, 2) === 2 && lineAt(st, 5) === 3 && lineAt(st, 6) === 4, 'a position is on its line');
}

// ── 4. the outline, from the same parse ──────────────────────────────────────
{
  const o = outline(SAMPLE, parse(SAMPLE));
  expect(JSON.stringify(o.items) === JSON.stringify([
    { kind: 'rec', name: 'half', line: 5, total: true, holes: 2 },
    { kind: 'rec', name: 'id', line: 10, total: false, holes: 0 },
    { kind: 'proof', name: 'p', line: 12, total: false, holes: 1 },
  ]), `each theorem, where it starts, whether it declares totality, and its open holes (${JSON.stringify(o.items)})`);
  expect(JSON.stringify(o.holes) === JSON.stringify([{ name: '?', line: 7 }, { name: '?todo', line: 8 }, { name: '?', line: 13 }]),
    `every hole in the file, a Harpoon script's too (${JSON.stringify(o.holes)})`);
  const mutual = 'rec a : [⊢ nat] → [⊢ nat] = fn x ⇒ ?\nand b : [⊢ nat] → [⊢ nat] = fn x ⇒ x;\n';
  const m = outline(mutual, parse(mutual));
  expect(m.items.map((i) => i.name + i.holes).join() === 'a1,b0', `mutual definitions are each a theorem, each with its own holes (${m.items.map((i) => i.name + i.holes)})`);
  expect(holesWords(0) === '' && holesWords(1) === '1 hole' && holesWords(3) === '3 holes', 'the hole count in words');
  expect(JSON.stringify(outline('x', null)) === '{"items":[],"holes":[]}', 'no parse, no outline');
}

// ── 5. the library: every file reads back whole ──────────────────────────────
{
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.bel')) files.push(p);
    }
  })(path.join(ROOT, 'library', 'data'));
  let theorems = 0;
  const bad = [];
  const t0 = Date.now();
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8').replace(/\r\n?/g, '\n');
    const tree = parse(text);
    if (!tree || highlightRuns(text, tree).map((r) => r.text).join('') !== text) bad.push(path.relative(ROOT, f));
    theorems += outline(text, tree).items.length;
  }
  expect(files.length > 50 && !bad.length, `every library file (${files.length}) is drawn whole (${bad.slice(0, 3).join(', ')})`);
  expect(theorems > 200, `and its outline finds the theorems (${theorems})`);
  console.log(`  the library drawn and outlined in ${Date.now() - t0} ms`);
}

// ── 6. asking the server ─────────────────────────────────────────────────────
{
  const answer = (status, body) => async () => ({ status, json: async () => (typeof body === 'function' ? body() : body) });
  const view = { name: 'P', files: [{ path: 'a.bel', text: 'x' }], folders: [], version: 1, follows: true };
  expect(JSON.stringify(await fetchShare('id', answer(200, view))) === JSON.stringify({ view }), 'a link: what it shows');
  expect((await fetchShare('id', answer(404, {}))).why === 'gone' && (await fetchShare(null)).why === 'gone', 'no link (revoked, deleted, never was): gone');
  expect((await fetchShare('id', answer(413, {}))).why === 'too-large', 'too big to send: said so');
  expect((await fetchShare('id', answer(500, {}))).why === 'network' && (await fetchShare('id', async () => { throw new Error('offline'); })).why === 'network'
    && (await fetchShare('id', answer(200, () => { throw new Error('not json'); }))).why === 'network'
    && (await fetchShare('id', answer(200, { name: 'no files' }))).why === 'network', 'anything else: try again');
  let asked = null;
  await fetchShare('a/b', async (url, o) => { asked = [url, o]; return { status: 404 }; });
  expect(asked[0] === '/api/share/a%2Fb' && asked[1].cache === 'no-store' && asked[1].credentials === 'omit',
    'it asks for that id alone, never from a cache, and sends no cookie');
}

// ── 7. what the page says ────────────────────────────────────────────────────
{
  for (const why of ['gone', 'too-large', 'empty', 'network']) {
    const w = noteWords(why);
    expect(w && !/—/.test(w) && /[.]$/.test(w), `"${why}" has its sentence (${w})`);
  }
  expect(noteWords('gone').startsWith('This link no longer works.'), 'a revoked link says it no longer works');
  const now = new Date(2026, 9, 31, 18, 0).getTime();
  const at = new Date(2026, 9, 31, 14, 2).getTime();
  expect(metaWords({ by: 'dean', updatedAt: at, follows: true }, now) === 'Shared by @dean · Updated today at ' + new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    `the project link: who, and when it last changed, as a sentence says it (${metaWords({ by: 'dean', updatedAt: at, follows: true }, now)})`);
  expect(/^Shared by @dean · Version saved today at /.test(metaWords({ by: 'dean', updatedAt: at, follows: false }, now))
    && / · Version saved on \S+ \S+ at /.test(metaWords({ by: 'dean', updatedAt: new Date(2026, 9, 2, 9, 0).getTime(), follows: false }, now)),
    `a version link: when that version was saved (${metaWords({ by: 'dean', updatedAt: new Date(2026, 9, 2, 9, 0).getTime(), follows: false }, now)})`);
  expect(metaWords({ by: null, updatedAt: 0, follows: true }, now) === '', 'nothing known, nothing said');
  const files = [{ path: 'README.md' }, { path: 'lib/nat.bel' }, { path: 'main.bel' }];
  expect(chooseFile(files, '#main.bel') === 'main.bel' && chooseFile(files, '#lib%2Fnat.bel') === 'lib/nat.bel' && chooseFile(files, '#lib/nat.bel') === 'lib/nat.bel',
    'the address names a file');
  expect(chooseFile(files, '') === 'lib/nat.bel' && chooseFile(files, '#nothing') === 'lib/nat.bel' && chooseFile([{ path: 'a.txt' }], '') === 'a.txt'
    && chooseFile([], '') === null && chooseFile(files, '#%E0%A4%A') === 'lib/nat.bel', 'else the first Beluga file, else the first file');
  const groups = fileGroups([{ path: 'lib/nat.bel' }, { path: 'README.md' }, { path: 'proofs/a.bel' }, { path: 'lib/plus.bel' }, { path: 'main.bel' }]);
  const shape = groups.map((g) => (g.dir || '.') + ':' + g.files.map((f) => f.path.split('/').pop()).join(',')).join(' ');
  expect(shape === '.:README.md,main.bel lib:nat.bel,plus.bel proofs:a.bel',
    `the files under their folders, each folder named once, the top level's first (${shape})`);
  expect(fileGroups([]).length === 0 && fileGroups([{ path: 'a/b/c.bel' }])[0].dir === 'a/b', 'none, nothing; a folder in a folder by its path');
}

// ── 8. the Share window's words (Dean, 2026-11-01; drawn again 2026-11-02) ────
{
  expect(ACCESS.link.title === 'Anyone with the link'
    && PROJECT_LINK_WORDS === 'Can read the project, including changes you make later. It isn’t listed anywhere.'
    && ACCESS.link.words === PROJECT_LINK_WORDS,
    'over the project link: who can read it, what it shows, and that it is unlisted');
  expect(ACCESS.none.title === 'Only you' && ACCESS.none.words === NO_LINK_WORDS && /including changes you make later\.$/.test(NO_LINK_WORDS),
    'before there is one: only you, and what a link would show');
  // With links to single versions out, "Only you" would not be true.
  expect(ACCESS.versions.title !== ACCESS.none.title && !/only you/i.test(ACCESS.versions.title), `with only version links, the title does not say only you (${ACCESS.versions.title})`);
  expect(ACCESS.out.words === SIGNED_OUT_WORDS && ACCESS.link.glyph === 'globe' && ACCESS.none.glyph === 'lock',
    'signed out it says sign in; the mark is a lock until there is a link, then the globe');
  expect(Object.values(ACCESS).every((a) => GLYPH_NAMES.includes(a.glyph) && a.title && !/—/.test(a.title + a.words) && a.title[0] === a.title[0].toUpperCase()),
    'every state has a glyph that exists, a title in sentence case, and no em dash');
  expect(/^Each shows the project as it was then\.$/.test(VERSION_LINKS_WORDS), `over the version links: what each shows (${VERSION_LINKS_WORDS})`);
  const id = 'wXn8I_iEGU4FppighmVA2k';
  expect(JSON.stringify(addressParts('https://beljar.deanbarry.com/s/' + id, id)) === JSON.stringify({ host: 'beljar.deanbarry.com/s/', id })
    && JSON.stringify(addressParts('http://127.0.0.1:5500/share.html?s=' + id, id)) === JSON.stringify({ host: '127.0.0.1:5500/share.html?s=', id }),
    'the address is shown without its scheme, the id apart, on either kind of server');
  const now = new Date(2026, 10, 1, 9, 0).getTime();
  const at = new Date(2026, 9, 31, 14, 2).getTime();
  expect(versionLinkWords(at, now) === 'Anyone with this link can read this version, as it was ' + whenWords(at, now) + '. It isn’t listed anywhere.'
    && /^yesterday at /.test(whenWords(at, now)), `under a version link: as it was then (${versionLinkWords(at, now)})`);
  expect(/^on .+ at .+/.test(whenWords(new Date(2026, 8, 2, 16, 40).getTime(), now)) && /^today at /.test(whenWords(now - 60000, now)), 'a moment, inside a sentence');
  for (const e of ['not-found', 'deleted', 'no-version', 'too-many', 'network']) {
    const w = shareProblem(e);
    expect(w && !/—/.test(w) && /[.]$/.test(w), `"${e}" has its own sentence (${w})`);
  }
  expect(new Set(['not-found', 'deleted', 'no-version', 'too-many'].map(shareProblem)).size === 4, 'each a different one');
  const protocol = fs.readFileSync(path.join(ROOT, 'js', 'persist', 'sync', 'protocol.mjs'), 'utf8');
  const line = /\*\s+error: (.*)/.exec(protocol.slice(protocol.indexOf('share(pid, { version })')));
  const named = line ? [...line[1].matchAll(/'([\w-]+)'/g)].map((m) => m[1]) : [];
  expect(named.length === 4 && named.every((e) => shareProblem(e) !== shareProblem('network')), `every error the protocol lists for share has its sentence (${named})`);
  expect(/Sign in/.test(SIGNED_OUT_WORDS) && /aren’t in the cloud yet/.test(UNSYNCED_WORDS), 'signed out it says sign in; unsynced, that the link lacks the newest');
}

// ── 9. Open in BelJar, at home ───────────────────────────────────────────────
{
  const g = globalThis;
  g.document = g.document || { getElementById: () => null, addEventListener() {} };
  const { copyProblem } = await import('../js/home/home.mjs');
  for (const why of ['gone', 'too-large', 'storage', 'network']) expect(/[.]$/.test(copyProblem(why)), `home says why a copy failed: ${why}`);
  const src = fs.readFileSync(path.join(ROOT, 'js', 'home', 'home.mjs'), 'utf8');
  const copy = src.slice(src.indexOf('async function copyShared'), src.indexOf('function pickFolder'));
  expect(/createImportedProject\(/.test(copy) && /Routes\.go\(Routes\.editUrl\(pid\), \{ replace: true \}\)/.test(copy) && /activeCfgByDir/.test(copy),
    'it makes the copy as an imported folder is made, with its suites, and opens it in place of home (back goes to the link)');
  expect(/const copying = Routes\.copyOf\(g\.location\);/.test(src), 'only when the address asks');
}

console.log(`OK share page (${n} checks: a small page of its own, one table of tags, the highlighting, the outline, the library, the server's answers, the words, the copy)`);
