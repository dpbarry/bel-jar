import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const port = 8851;
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
execFileSync(process.execPath, ['scripts/build-editor.mjs'], { cwd: root, stdio: 'inherit' });

const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(root, p), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(port, r));

const puppeteer = (await import('../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default;
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', protocolTimeout: 590000 });

const prelude = [
  'tp : type.', 'base : tp.', 'arr : tp -> tp -> tp.', 'tm : type.',
  'app : tm -> tm -> tm.', 'lam : tp -> (tm -> tm) -> tm.',
  'oft : tm -> tp -> type.',
  't_app : oft M (arr A B) -> oft N A -> oft (app M N) B.',
  't_lam : ({x:tm} oft x A -> oft (R x) B) -> oft (lam A R) (arr A B).',
  'eq : tp -> tp -> type.', 'refl : eq A A.',
  'schema tctx = some [A:tp] block (x:tm, u:oft x _);',
].join('\n');
const decl = [
  "rec tp_uniq : (g:tctx)[g |- oft M T[]] -> [g |- oft M T'[]] -> [ |- eq T T'] =",
  '/ total d (tp_uniq g m t t\' d) /', '?', ';',
].join('\n');

const variants = [
  ['#r.u', 'let [g |- #r.u[..]] = f in\n[ |- refl]'],
  ['#r.2', 'let [g |- #r.2] = f in\n[ |- refl]'],
  ['#p.u=f', 'let [g |- #p.u[..]] = f in\n[ |- refl]'],
];

try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.BelJarEditor, { timeout: 30000 });
  let code = await page.evaluate(async (c, d) => {
    const ed = window.BelJarEditor;
    return (await ed.proveProgram(c, ed.theoremUnderProof(d), (x) => window.BelugaClient.checkResult(x), { maxSteps: 10 })).code;
  }, `${prelude}\n\n${decl}\n`, decl);

  for (const [name, tail] of variants) {
    const trial = code.replace(/\| \[g \|\- #p\.u\[\.\.\]\] =>\n  \?/, `| [g |- #p.u[..]] =>\n  ${tail}`);
    const out = await page.evaluate(async (c) => {
      const r = await window.BelugaClient.checkResult(c);
      const holes = (r.output || '').match(/Goal:\s*(.*)/i);
      return { ok: r.ok, goal: holes && holes[1], err: (r.output || '').split('\n').slice(-5).join(' | ') };
    }, trial);
    console.log(name, JSON.stringify(out));
  }
} finally {
  await browser.close();
  server.close();
}
