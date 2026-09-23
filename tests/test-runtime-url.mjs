// The Beluga runtime URL has ONE owner.
//
// Two things load the runtime: the checker's workers (BelugaClient) and
// Harpoon's dedicated proof worker (HarpoonEngine). They used to build its URL
// separately, and when the blobs moved to R2 only one copy followed: Harpoon's
// worker asked the app origin and got a 404 on the deployed site. Nothing in
// the product starts that worker today, so no user hit it; the next consumer
// of the runtime would have. This pins the single owner, the build stamp that
// makes every rebuild a fresh URL, and that stamp's agreement with sw.js.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const client = read('js/beluga/beluga-client.js');
const harpoon = read('js/harpoon/harpoon-client.js');
const sw = read('sw.js');
const stamper = read('_rebuild/stamp-runtime.ps1');
const rebuild = read('_rebuild/rebuild.ps1');

// 1. The stamp exists, is a build timestamp, and agrees with sw.js.
const v = /var RUNTIME_VERSION = '(\d{14})';/.exec(client);
expect(v, 'beluga-client.js declares RUNTIME_VERSION as a 14-digit build stamp');
const c = /var CACHE_NAME = 'beluga-runtime-(\d{14})';/.exec(sw);
expect(c, 'sw.js declares CACHE_NAME with a 14-digit build stamp');
expect(v[1] === c[1],
  `runtime URL stamp ${v[1]} matches sw.js CACHE_NAME ${c[1]} (re-stamp with _rebuild/stamp-runtime.ps1)`);

// 2. The one resolver puts the stamp in the URL and is on the public API.
const resolver = client.slice(client.indexOf('function mainScriptUrl'), client.indexOf('function createWorkerSlot'));
expect(resolver.length > 0, 'mainScriptUrl is found ahead of createWorkerSlot');
expect(resolver.includes("'?v=' + RUNTIME_VERSION"), 'mainScriptUrl carries the build stamp in the URL');
expect(resolver.includes('runtimeBase()'), 'mainScriptUrl honours the deployment base');
expect(client.split('function mainScriptUrl').length === 2, 'there is exactly one mainScriptUrl');
expect(/runtimeScriptUrl:\s*function/.test(client), 'BelugaClient exposes runtimeScriptUrl to other consumers');

// 3. Harpoon asks; it does not rebuild the URL.
expect(/client\.runtimeScriptUrl\(build\)/.test(harpoon), 'harpoon-client.js asks BelugaClient for the runtime URL');
expect(!/beluga_web\.bc/.test(harpoon), 'harpoon-client.js names no runtime blob of its own');
expect(/try \{\s*bind\(slot\);\s*\} catch \(err\) \{\s*return Promise\.reject\(err\);/.test(harpoon),
  'a worker that cannot be constructed rejects the call instead of throwing out of start()');

// 4. No new private copy anywhere in the authored sources. Every file that
//    names a runtime blob is on this list for a stated reason.
const ALLOWED = new Map([
  ['js/beluga/beluga-client.js', 'the owner'],
  ['js/beluga/beluga-worker.js', 'receives the URL as ?script=; same-origin fallback when none is passed'],
]);
const CLASSIC = new Set(['js/beluga/beluga-client.js', 'js/beluga/beluga-worker.js', 'js/harpoon/harpoon-client.js']);
const offenders = [];
(function walk(dir) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = dir + '/' + name;
    if (statSync(join(root, rel)).isDirectory()) { walk(rel); continue; }
    // Authored sources only: every .mjs, plus the hand-written classic scripts.
    // Generated .js leaves are built from the .mjs and would double-count.
    if (!rel.endsWith('.mjs') && !CLASSIC.has(rel)) continue;
    if (/beluga_web\.bc/.test(read(rel)) && !ALLOWED.has(rel)) offenders.push(rel);
  }
})('js');
expect(offenders.length === 0,
  `only the owner builds the runtime URL; also naming a runtime blob: ${offenders.join(', ')}`);

// 5. The rebuild stamps both files from one timestamp, all-or-nothing.
expect(/stamp-runtime\.ps1" -Version \$version/.test(rebuild), 'rebuild.ps1 hands its timestamp to stamp-runtime.ps1');
expect(!/-replace "var CACHE_NAME/.test(rebuild), 'rebuild.ps1 no longer stamps sw.js on its own');
expect(/CACHE_NAME/.test(stamper) && /RUNTIME_VERSION/.test(stamper),
  'stamp-runtime.ps1 writes both CACHE_NAME and RUNTIME_VERSION');
expect(/\[regex\]::Matches\(/.test(stamper) && /\$hits -ne 1/.test(stamper),
  'stamp-runtime.ps1 refuses unless each pattern matches exactly once');
expect(stamper.indexOf('WriteAllText') > stamper.lastIndexOf('throw '),
  'stamp-runtime.ps1 writes nothing until every file has been checked');

console.log(`OK runtime-url (${n} checks: one owner, stamped URL ${v[1]}, agrees with sw.js)`);
