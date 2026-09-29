// `npm run dev`: the site, sync and sign-in locally, at http://127.0.0.1:8787
// (docs/PERSIST.md §5.7). Applies the D1 migrations, then runs wrangler dev.
//
// ⛔ The local database lives OUTSIDE the repository (~/.beljar-dev). wrangler
// dev serves the site from the repository root and watches it for changes,
// so its default state folder (server/.wrangler) sits inside what it watches:
// every write to it reloads the server, whose reload writes again, and the
// server never answers (found 2026-09-28).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
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

console.log(`\nBelJar locally: http://127.0.0.1:8787 (use 127.0.0.1, not localhost: the local GitHub app's callback is registered there)`);
console.log(`Local database: ${state}\n`);
const dev = spawn(process.execPath, [wrangler, 'dev', '--config', config, '--ip', '127.0.0.1', '--port', '8787', '--persist-to', state, ...process.argv.slice(2)],
  { stdio: 'inherit' });
dev.on('exit', (code) => process.exit(code || 0));
