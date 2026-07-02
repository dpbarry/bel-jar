import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { spliceAtHole } from '../editor-src/bel-prover-bridge.mjs';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const port = 8847;
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
execFileSync(process.execPath, ['scripts/build-editor.mjs'], { cwd: root, stdio: 'pipe' });
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
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => !!window.BelugaClient, { timeout: 60000 });

const code = readFileSync('scripts/.str-step-15.bel', 'utf8');
const hole = { line: 264, col: 3 };

const variants = [
  ['prime', `let [g, y:name |- R2'] = str_step' [g, y:name, hy:hyp y ⊥ |- R2[..,<y;hy>]] in\n?`],
  ['prime+close', `let [g, y:name |- R2'] = str_step' [g, y:name, hy:hyp y ⊥ |- R2[..,<y;hy>]] in\nRes [g |- _] [g, x:name |- refl_proc] [g |- β∥1 (\\y. R2'[.., y])]`],
  ['ref', `let [g, y:name |- s_P1''] = str_step' [g, y:name, hy:hyp y ⊥ |- R2[..,<y;hy>]] in\nRes [g |- _] [g, x:name |- refl_proc] [g |- β∥1 (\\y. s_P1''[..,y])]`],
];

for (const [name, text] of variants) {
  const spliced = spliceAtHole(code, hole, text);
  const chk = await page.evaluate(async (c) => {
    const r = await window.BelugaClient.checkResult(c);
    const out = r.output || '';
    const err = out.indexOf('Error:');
    return { ok: r.ok, err: err >= 0 ? out.slice(err, err + 600) : null };
  }, spliced);
  console.log(name, chk.ok ? 'OK' : 'FAIL');
  if (!chk.ok) console.log(chk.err, '\n---');
}

await browser.close();
server.close();
