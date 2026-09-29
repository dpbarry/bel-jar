// The production deploy (wrangler.jsonc at the root, docs/PERSIST.md §5.7) and
// what it uploads.
//
// The config: the dev switch that lets a request name its own account must
// never reach production, the client secret must never be a plain var, and the
// Worker must answer /api/* only, with the same bindings the code and the local
// config use.
//
// The upload: wrangler skips nothing on its own (only .assetsignore, _redirects
// and _headers), so this lists the files exactly as wrangler 4.143 does
// (buildAssetManifest: every path under the root, minus what .assetsignore
// matches, minus folders and symlinks) and checks both directions: nothing
// private goes up (until 2026-09-28 the live site served /.git/), and nothing
// the page loads is left behind.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ignore from 'ignore';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

/** JSON with // and /* comments, as wrangler reads it (strings may hold slashes). */
function readJsonc(file) {
  const src = fs.readFileSync(file, 'utf8');
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') {
      const start = i;
      for (i++; i < src.length && src[i] !== '"'; i++) if (src[i] === '\\') i++;
      out += src.slice(start, i + 1);
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i + 2) + 1;
    } else {
      out += c;
    }
  }
  return JSON.parse(out);
}

// ── the config ────────────────────────────────────────────────────────────
const prod = readJsonc(path.join(root, 'wrangler.jsonc'));
const dev = readJsonc(path.join(root, 'server', 'wrangler.jsonc'));
const vars = prod.vars || {};

expect(prod.name === 'bel-jar', 'it deploys the existing Worker (bel-jar), which carries the site today');
expect(prod.observability && prod.observability.enabled === true, 'the Worker\'s logs stay on, as the config the Git build used to generate had them');
expect(!('routes' in prod) && !('route' in prod) && !('workers_dev' in prod),
  'the deploy leaves the domain and workers.dev as they are (a listed route would switch workers.dev off)');
expect(!('DEV_ACCOUNT_HEADER' in vars), 'production never lets a request name its own account (no DEV_ACCOUNT_HEADER)');
expect(!Object.keys(vars).some((k) => /SECRET|TOKEN|PASSWORD/i.test(k)), 'no secret is a plain var (GITHUB_CLIENT_SECRET goes in with wrangler secret put)');
expect(/^Ov23[A-Za-z0-9]+$/.test(vars.GITHUB_CLIENT_ID || ''), 'the live GitHub app\'s client id is set');
expect(fs.existsSync(path.join(root, prod.main)), `the Worker exists (${prod.main})`);
expect(prod.assets && prod.assets.directory === '.' && prod.assets.binding === 'ASSETS', 'the site is served from the repository root through ASSETS');
expect(JSON.stringify(prod.assets.run_worker_first) === '["/api/*"]', 'the Worker answers /api/* only; every page and file is served as before');
expect(JSON.stringify(dev.assets.run_worker_first) === JSON.stringify(prod.assets.run_worker_first), 'locally too, the same paths reach the Worker');
const bindings = (c) => JSON.stringify([
  (c.d1_databases || []).map((d) => d.binding),
  (c.r2_buckets || []).map((b) => b.binding),
]);
expect(bindings(prod) === '[["DB"],["TEXTS"]]', `production binds what the Worker reads, DB and TEXTS (${bindings(prod)})`);
expect(bindings(dev) === bindings(prod), 'and the local config binds the same names');
const db = prod.d1_databases[0];
expect(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(db.database_id) && !/^0+-/.test(db.database_id),
  'the D1 database is a real one, not the local placeholder');
expect(db.migrations_dir && fs.existsSync(path.join(root, db.migrations_dir, '0001_sync.sql')),
  'wrangler d1 migrations apply --remote finds server/migrations');
expect(prod.r2_buckets[0].bucket_name !== dev.r2_buckets[0].bucket_name && db.database_name !== dev.d1_databases[0].database_name,
  'production and local development never share a database or a bucket');

// ── the upload ────────────────────────────────────────────────────────────
const patterns = ['/.assetsignore', '/_redirects', '/_headers',
  ...fs.readFileSync(path.join(root, '.assetsignore'), 'utf8').split('\n')];
const ig = ignore().add(patterns);
const uploaded = [];
(function walk(rel) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const p = rel ? rel + '/' + e.name : e.name;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      // gitignore semantics: nothing under an ignored folder can come back.
      if (!ig.ignores(p + '/')) walk(p);
    } else if (!ig.ignores(p)) {
      uploaded.push(p);
    }
  }
})('');
const up = new Set(uploaded);

const privatePaths = [/^\.git\//, /^\.git[a-z]*$/, /(^|\/)\.dev\.vars/, /^server\//, /^\.wrangler\//, /^node_modules\//,
  /^Beluga-W\//, /^tests\//, /^scripts\//, /^scratch\//, /^docs\//, /^wrangler\.jsonc$/, /\.md$/, /^package(-lock)?\.json$/];
for (const re of privatePaths) {
  const hit = uploaded.find((p) => re.test(p));
  expect(!hit, `nothing matching ${re} is uploaded (found ${hit})`);
}
expect(!up.has('beluga_web.bc.js') && !up.has('beluga_web.bc.dt.js'), 'the Beluga runtime is not uploaded (it is served from R2)');
const big = uploaded.find((p) => fs.statSync(path.join(root, p)).size > 25 * 1024 * 1024);
expect(!big, `no file is over the 25 MiB asset cap (${big})`);
expect(uploaded.length < 20000 * 0.5, `the upload is well under the 20,000-file limit (${uploaded.length})`);

// Everything the page loads goes up.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"#:?]+)(?:\?[^"]*)?"/g)].map((m) => m[1].replace(/^\.\//, ''))
  .filter((r) => !r.startsWith('/') && !/^beluga_web\./.test(r));
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
for (const m of css.matchAll(/@import\s+(?:url\()?["']([^"']+)["']/g)) refs.push(path.posix.join('css', m[1]));
expect(refs.length > 10, `index.html and style.css name the files the page loads (${refs.length})`);
for (const r of ['index.html', 'sw.js', ...refs]) expect(up.has(r), `the page's ${r} is uploaded`);

console.log(`OK deploy-config (${n} checks: no dev switch or secret in production, /api/* only, ${uploaded.length} files uploaded, none private, all the page loads)`);
