// Upload the Beluga runtime to R2 (bucket beljar-runtime, served at
// beljar-cdn.deanbarry.com), the step that comes BEFORE a deploy that needs it
// (_rebuild/RECIPE.md, Deploying). `npm run upload:runtime`.
//
//   node scripts/upload-runtime.mjs [--dry-run]
//
// What goes up is what the client loads: the files js/beluga/beluga-client.js
// `BUILDS` names, and the .wasm beside each Wasm loader, each with the type a
// browser needs (instantiateStreaming refuses a .wasm that is not application/wasm).
// A .wasm is named by its content hash, so it is cached for a year; the JS build and
// the loaders keep the bucket's caching and are fetched under the ?v= stamp.
//
// Then each file is read back through the CDN, under this build's stamp (a URL no
// edge has cached), and its bytes compared with the repository's: deploy only
// after this says so. Uses wrangler, so `npx wrangler login` first if it asks.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'beljar-runtime';
const CDN = 'https://beljar-cdn.deanbarry.com/';
const dry = process.argv.includes('--dry-run');
const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const client = readFileSync(join(root, 'js', 'beluga', 'beluga-client.js'), 'utf8');
const stamp = (/var RUNTIME_VERSION = '(\d{14})'/.exec(client) || [])[1];
const builds = [...client.matchAll(/^\s*'?[\w-]+'?:\s*\{\s*file:\s*'([^']+)'/gm)].map((m) => m[1]);
if (!stamp || !builds.length) {
  console.error('Could not read the builds or the stamp from js/beluga/beluga-client.js.');
  process.exit(1);
}
const files = builds.flatMap((f) => {
  if (!f.endsWith('.wasm.js')) return [f];
  const assets = f.replace(/\.js$/, '.assets');
  return [f, ...readdirSync(join(root, assets)).filter((x) => x.endsWith('.wasm')).map((x) => `${assets}/${x}`)];
});

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
console.log(`Runtime build ${stamp}: ${files.length} files to ${BUCKET}${dry ? ' (dry run: nothing is uploaded)' : ''}`);
for (const f of files) {
  const wasm = f.endsWith('.wasm');
  const args = [wrangler, 'r2', 'object', 'put', `${BUCKET}/${f}`, '--file', join(root, f),
    '--content-type', wasm ? 'application/wasm' : 'text/javascript', '--remote'];
  if (wasm) args.push('--cache-control', 'public, max-age=31536000, immutable');
  console.log(`\n  ${f}  (${readFileSync(join(root, f)).length} bytes)`);
  if (dry) { console.log('  npx wrangler ' + args.slice(1).map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')); continue; }
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\nUpload of ${f} failed (wrangler exited ${r.status}). Nothing after it was uploaded; fix and run again.`);
    process.exit(1);
  }
}
if (dry) process.exit(0);

console.log('\nReading each file back through the CDN ...');
let bad = 0;
for (const f of files) {
  const url = CDN + f + (f.endsWith('.wasm') ? '' : `?v=${stamp}`);
  try {
    const res = await fetch(url, { headers: { origin: 'https://beljar.deanbarry.com' } });
    const body = Buffer.from(await res.arrayBuffer());
    const same = res.ok && sha(body) === sha(readFileSync(join(root, f)));
    const type = res.headers.get('content-type') || '';
    const typeOk = f.endsWith('.wasm') ? type.startsWith('application/wasm') : type.startsWith('text/javascript');
    console.log(`  ${same && typeOk ? 'ok  ' : 'FAIL'} ${f}  ${res.status} ${type}${same ? '' : ' (bytes differ from the repository)'}`);
    if (!same || !typeOk) bad++;
  } catch (e) {
    console.log(`  FAIL ${f}  ${e.message}`);
    bad++;
  }
}
if (bad) {
  console.error(`\n${bad} file(s) not as uploaded. Do not deploy yet.`);
  process.exit(1);
}
console.log('\nR2 holds this build. Now deploy the site, then: npm run probe:live');
