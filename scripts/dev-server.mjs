// `npm run dev`: the whole site locally, at http://127.0.0.1:8787: sign-in,
// sync, and Beluga checks (docs/PERSIST.md §5.7). Applies the D1 migrations,
// serves the Beluga runtime from the working tree on 127.0.0.1:8788 (the
// Worker passes it on: it is not an asset, server/wrangler.jsonc), then runs
// wrangler dev.
//
// ⛔ The local database lives OUTSIDE the repository (~/.beljar-dev). wrangler
// dev serves the site from the repository root and watches it for changes,
// so its default state folder (server/.wrangler) sits inside what it watches:
// every write to it reloads the server, whose reload writes again, and the
// server never answers (found 2026-09-28).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const config = path.join(root, 'server', 'wrangler.jsonc');
const state = process.env.BELJAR_DEV_STATE || path.join(os.homedir(), '.beljar-dev');
fs.mkdirSync(state, { recursive: true });

if (!fs.existsSync(path.join(root, 'server', '.dev.vars'))) {
  console.log('No server/.dev.vars: sign-in will say it is not configured (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET).');
}
const migrate = spawnSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'DB', '--local', '--config', config, '--persist-to', state],
  { stdio: 'inherit', env: { ...process.env, CI: 'true' } });
if (migrate.status !== 0) process.exit(migrate.status || 1);

// The Beluga runtime: two large files, read from disk on each request so a
// rebuild (_rebuild/rebuild.ps1) is picked up without restarting.
const RUNTIME = new Set(['/beluga_web.bc.js', '/beluga_web.bc.dt.js']);
const missing = [...RUNTIME].filter((p) => !fs.existsSync(path.join(root, p.slice(1))));
if (missing.length) console.log(`No ${missing.join(', ')} in the repository: Beluga checks will not run (build it with _rebuild/rebuild.ps1).`);
const runtime = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://127.0.0.1').pathname;
  if (!RUNTIME.has(p)) { res.writeHead(404); res.end(); return; }
  fs.readFile(path.join(root, p.slice(1)), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(data);
  });
});
runtime.on('error', (err) => {
  console.log(`The Beluga runtime could not be served on 127.0.0.1:8788 (${err.code || err.message}): checks will not run.`);
});
runtime.listen(8788, '127.0.0.1');

console.log(`\nBelJar locally: http://127.0.0.1:8787 (use 127.0.0.1, not localhost: the local GitHub app's callback is registered there)`);
console.log(`Local database: ${state}\n`);
const dev = spawn(process.execPath, [wrangler, 'dev', '--config', config, '--ip', '127.0.0.1', '--port', '8787', '--persist-to', state, ...process.argv.slice(2)],
  { stdio: 'inherit' });
dev.on('exit', (code) => { runtime.close(); process.exit(code || 0); });
