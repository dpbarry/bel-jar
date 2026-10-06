// The Worker (server/) as tests run it: `wrangler dev` with server/wrangler.jsonc
// on a free port, over a fresh local D1 (every migration applied) and R2.
//
// Hermetic: every run uses a copy of server/wrangler.jsonc written into its own
// temp folder (absolute paths to the Worker and the migrations), so wrangler
// never looks beside the real config and a developer's server/.dev.vars (the
// GitHub secret) is never even read. The GitHub client is the tests' own, and
// GitHub's addresses point nowhere unless a test gives its stand-in.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WRANGLER = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
export const CONFIG = path.join(ROOT, 'server', 'wrangler.jsonc');
const ENV = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };
const NOWHERE = 'http://127.0.0.1:9';

/**
 * server/wrangler.jsonc, copied into `dir` with absolute paths. Returns the
 * copy's path. Without `o.site` the static site is left out: the API tests
 * never ask for it, and wrangler starts faster without it.
 */
export function testConfig(dir, o = {}) {
  const text = fs.readFileSync(CONFIG, 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const cfg = JSON.parse(text);
  cfg.main = path.join(ROOT, 'server', cfg.main);
  for (const d of cfg.d1_databases || []) if (d.migrations_dir) d.migrations_dir = path.join(ROOT, 'server', d.migrations_dir);
  if (o.site && cfg.assets) cfg.assets.directory = path.join(ROOT, 'server', cfg.assets.directory);
  else delete cfg.assets;
  const out = path.join(dir, 'wrangler.json');
  fs.writeFileSync(out, JSON.stringify(cfg, null, 2));
  return out;
}

export function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

/**
 * @param {{ vars?: Record<string, string>, site?: boolean }} [o]
 *   vars: --var overrides (DEV_ACCOUNT_HEADER, GITHUB_*); site: serve the static site too
 * @returns {Promise<{ url: string, logs(): string, stop(o?: { keep?: boolean }): void, persist: string }>}
 *   stop({ keep: true }) leaves the local D1 and R2 on disk, for a test to read
 *   them afterwards (getPlatformProxy over `persist`); it removes them itself.
 */
export async function startWorker(o = {}) {
  const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'beljar-worker-'));
  const config = testConfig(persist, { site: !!o.site });
  let logs = '';
  const migrate = spawnSync(process.execPath, [WRANGLER, 'd1', 'migrations', 'apply', 'DB', '--local', '--config', config, '--persist-to', persist],
    { env: ENV, encoding: 'utf8', timeout: 180000 });
  if (migrate.status !== 0) throw new Error('D1 migrations failed:\n' + (migrate.stdout || '') + (migrate.stderr || ''));
  const vars = Object.assign({
    GITHUB_CLIENT_ID: 'test-client',
    GITHUB_CLIENT_SECRET: 'test-secret',
    GITHUB_AUTHORIZE_URL: NOWHERE + '/login/oauth/authorize',
    GITHUB_TOKEN_URL: NOWHERE + '/login/oauth/access_token',
    GITHUB_API_URL: NOWHERE,
  }, o.vars || {});
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const args = [WRANGLER, 'dev', '--config', config, '--ip', '127.0.0.1', '--port', String(port), '--persist-to', persist];
  for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}:${v}`);
  const child = spawn(process.execPath, args, { env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => { logs += d; });
  child.stderr.on('data', (d) => { logs += d; });
  const stop = (o) => {
    if (child.exitCode === null) {
      // wrangler starts workerd beneath it: stop the whole tree it made, nothing else.
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGTERM');
    }
    if (o && o.keep) return;
    try { fs.rmSync(persist, { recursive: true, force: true }); } catch (_) { /* workerd may hold a file briefly */ }
  };
  for (let i = 0; i < 600; i++) {
    try {
      if ((await fetch(url + '/api/auth/me')).status === 200) {
        if (/\.dev\.vars/.test(logs)) {
          stop();
          throw new Error('wrangler read a .dev.vars: a developer\'s secrets must never reach a test');
        }
        return { url, logs: () => logs, stop, persist };
      }
    } catch (_) { /* not yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  stop();
  throw new Error('wrangler dev did not come up:\n' + logs.split('\n').slice(-20).join('\n'));
}
