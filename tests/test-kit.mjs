// The kit page (dev/kit.html; plan v6 h1, docs/UI.md §6): every component on
// one page, for looking at. Chrome draws it (`npm run probe:kit`); what is held
// here is what keeps it honest without a browser.
//
// ⛔ A kit that styles or retypes a component shows something that does not
// ship. Its stylesheet may only frame and place; its script may only call the
// app's own modules; and none of it is uploaded.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

// ── the stylesheet frames and places, and nothing else ──────────────────────
{
  const css = noComments(read('dev/kit.css'));
  const selectors = [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) => m[2].trim()).filter(Boolean);
  expect(selectors.length > 8, `the kit's stylesheet was read (${selectors.length} rules)`);
  for (const sel of selectors) {
    for (const part of sel.split(',').map((s) => s.trim())) {
      expect(/^\.kit(-[a-z_-]+)?\b/.test(part), `every rule starts from a class of the kit's own: ${part}`);
      expect(!/\.(jar-|menu|toast|home|icon-btn|sync-cloud|header)/.test(part), `and reaches into no component: ${part}`);
    }
  }
  // Tokens only: a value typed here is a second copy of one in css/tokens.css.
  const tokens = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'css'))) {
    if (f.endsWith('.css')) for (const m of read('css/' + f).matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) tokens.add(m[1]);
  }
  const used = [...css.matchAll(/var\((--[A-Za-z0-9_-]+)/g)].map((m) => m[1]);
  expect(used.length > 5 && used.every((t) => tokens.has(t)), `every token it uses is a real one: ${used.filter((t) => !tokens.has(t)).join(', ')}`);
  expect(!/#[0-9a-fA-F]{3,8}\b|\b(rgb|hsl)a?\(/.test(css), 'and it names no colour of its own');
}

// ── the script calls the app's modules, and copies none ─────────────────────
{
  const src = read('dev/kit.mjs');
  const imports = [...src.matchAll(/(?:^import\b[^'\n]*\bfrom\s*|\bawait import\()'([^']+)'/gm)].map((m) => m[1]);
  expect(imports.length >= 6 && imports.every((p) => p.startsWith('../js/')), `it imports only from the app's sources (${imports.join(', ')})`);
  for (const p of imports) expect(fs.existsSync(path.join(ROOT, 'dev', p)), `${p} exists`);
  for (const used of ['home.rowNode(', 'home.startNodes(', 'home.linkNodes(', 'home.findNodes(', 'home.signInLine(', 'cloudSvg(cloudLook(', 'buildActions(', 'PromptDialog.open(', 'window.Menu.open(', 'window.Toasts.']) {
    expect(src.includes(used), `it draws with the app's own ${used.replace(/[(.]$/, '')}`);
  }
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  expect(!/class(Name)?\s*=\s*['"](menu|toast|home-row|jar-dialog)\b/.test(code), 'and builds no menu, toast, row or dialog by hand');
  // What home exports for it is what home itself draws with.
  const home = read('js/home/home.mjs');
  expect(/export \{ rowNode, startNodes, linkNodes, findNodes, signInLine \};/.test(home), 'home exports its builders for the kit');
  for (const call of ['list.replaceChildren(...ordered.map((p) => rowNode(', 'actions.append(...startNodes())',
    'links.append(...linkNodes())', 'btn.replaceChildren(...findNodes(chord))', 'signInLine(box, ']) {
    expect(home.includes(call), `and draws its own page with the same one: ${call}`);
  }
  expect(/main\.home'\)\.cloneNode\(true\)/.test(src), 'the kit takes home\'s frame from home\'s own document');
}

// ── the page, and where it may be served ────────────────────────────────────
{
  const html = noComments(read('dev/kit.html'));
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  expect(sheets.join() === '../css/style.css,../css/home.css,kit.css', `it is styled by the app's stylesheets, then its own frame (${sheets.join(', ')})`);
  expect(/<script type="module" src="kit\.mjs"><\/script>/.test(html), 'and loads its script as the sources are written, with no build');
  for (const id of ['toast-stack', 'tooltip-root', 'menu-root']) expect(html.includes('id="' + id + '"'), `it has #${id}, which the components draw into`);
  const ignored = read('.assetsignore').split('\n').map((l) => l.trim());
  expect(ignored.includes('dev'), '⛔ dev/ is named in .assetsignore: the kit is never uploaded');
  for (const doc of ['index.html', 'edit.html']) expect(!/dev\/kit/.test(read(doc)), `${doc} does not link to it`);
  const pkg = JSON.parse(read('package.json'));
  expect(pkg.scripts['probe:kit'] === 'node scripts/probe-kit.mjs' && !/probe:kit/.test(pkg.scripts.probe),
    'npm run probe:kit shoots it, and it is not part of the product gate');
}

console.log(`OK kit (${n} checks: the stylesheet only frames and places, the script only calls the app, the page is never uploaded)`);
