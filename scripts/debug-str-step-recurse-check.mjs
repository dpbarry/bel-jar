import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cpStrStepPrelude, strStepDecl } from './cp-str-step-prelude.mjs';
import { candidateMoves, theoremUnderProof, spliceAtHole, proveProgram } from '../editor-src/bel-prover-bridge.mjs';

const root = process.cwd();
const port = 8846;
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

const pre = cpStrStepPrelude(root);
const thm = theoremUnderProof(strStepDecl);
const code0 = `${pre}\n\n${strStepDecl}\n`;
const snap = await page.evaluate(async (c) => {
  const ed = window.BelJarEditor;
  const thm = ed.theoremUnderProof(c.split('\n').slice(-5).join('\n'));
  return await ed.proveProgram(c, thm, (x) => window.BelugaClient.checkResult(x), { maxSteps: 15 });
}, code0);

console.log('snap steps', snap.steps?.length, 'stuck', snap.stuck?.reason, snap.complete);
console.log('last step', snap.steps?.slice(-1)[0]?.move);
if (!snap.stuck) { await browser.close(); server.close(); process.exit(0); }
const hole = { line: snap.stuck.hole.line, col: snap.stuck.hole.col, goal: snap.stuck.goal, meta: [], ctx: [] };
const moves = candidateMoves(hole, snap.code, thm);
const rec = moves.find((m) => m.kind === 'recurse');
console.log('recurse move', rec?.text);
if (rec) {
  const spliced = spliceAtHole(snap.code, hole, rec.text);
  const chk = await page.evaluate(async (c) => {
    const r = await window.BelugaClient.checkResult(c);
    const errs = (r.output || '').split('\n').filter((l) => /Error|Failed/i.test(l));
    return { ok: r.ok, errs: errs.slice(0, 5), tail: (r.output || '').slice(-1200) };
  }, spliced);
  console.log('recurse splice', chk);
}
await browser.close();
server.close();
