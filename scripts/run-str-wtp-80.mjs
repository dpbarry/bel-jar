import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const port = 8852;
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
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForFunction(() => !!window.BelJarEditor, { timeout: 30000 });

const src = fs.readFileSync('scripts/prover-probes.mjs', 'utf8');
const block = src.slice(src.indexOf("name: 'str_wtp'"));
const pre = eval('([' + block.match(/prelude: \[([\s\S]*?)\]\.join/)[1] + ']).join("\\n")');
const decl = block.match(/decl: \[([\s\S]*?)\]\.join/)[1]
  .split("',\n").map((s) => s.replace(/^[\s']+|[\s',]+$/g, '').replace(/\\'/g, "'")).join('\n');

const r = await page.evaluate(async (pre, decl) => {
  const code = `${pre}\n\n${decl}\n`;
  const ed = window.BelJarEditor;
  const thm = ed.theoremUnderProof(decl);
  const out = await ed.proveProgram(code, thm, (x) => window.BelugaClient.checkResult(x), { maxSteps: 80 });
  return {
    complete: out.complete,
    steps: out.steps.map((s) => s.move),
    stuck: out.stuck,
  };
}, pre, decl);

console.log(r.complete ? 'COMPLETE' : 'STUCK', r.steps.length, 'steps');
console.log(r.steps.join(' -> '));
if (r.stuck) console.log(JSON.stringify(r.stuck));

await browser.close();
server.close();
