// ⛔ Only the store touches browser storage (docs/PERSIST.md §4).
//
// Every other module asks Persist, Settings or Device. That is what lets one
// place wipe on a schema change, bound what is kept, class each record for the
// online layer, and report a full disk once. A module that reaches for
// localStorage itself is invisible to all of that.
//
// Two rules, over every authored module (comments do not count):
//   1. Only these may NAME a browser storage area: the store, Persist (which
//      hands the areas to the stores), and early boot (which hands them to the
//      pure readers below, because first paint cannot wait for the store).
//   2. Only these may CALL the storage API: the store, and the readers early
//      boot runs before the store exists.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const MAY_NAME = new Set([
  'js/persist/store.mjs',
  'js/persist/persist.mjs',
  'js/boot/early-boot.mjs',
  'js/boot/early-boot-core.mjs',
  'js/boot/panel-restore.mjs',
]);
const MAY_CALL = new Set([
  'js/persist/store.mjs',
  'js/persist/persist.mjs', // only to probe that an area is usable at all
  'js/persist/table.mjs', // readBootRows: early boot's read of a table
  'js/persist/keys.mjs', // readBootSession: early boot's read of the session
]);

const NAMES = /\b(localStorage|sessionStorage)\b/;
const CALLS = /\.(getItem|setItem|removeItem)\s*\(/;

function walk(dir, out = []) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = dir + '/' + name;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (rel.endsWith('.mjs')) out.push(rel);
  }
  return out;
}

/** The source without comments: prose about storage is fine, code is not. */
function code(src) {
  return src
    .replace(/\r\n?/g, '\n') // `.` stops at a bare \r: a CRLF file's line comments would survive
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, '')) // keep line numbers true
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`\\])\/\/.*$/, '$1'))
    .join('\n');
}

const offences = [];
let scanned = 0;
for (const rel of walk('js')) {
  scanned += 1;
  const lines = code(readFileSync(join(root, rel), 'utf8')).split('\n');
  lines.forEach((line, i) => {
    if (NAMES.test(line) && !MAY_NAME.has(rel)) offences.push(`${rel}:${i + 1} names browser storage: ${line.trim()}`);
    if (CALLS.test(line) && !MAY_CALL.has(rel)) offences.push(`${rel}:${i + 1} calls the storage API: ${line.trim()}`);
  });
}

if (offences.length) {
  console.error('FAIL: only the store touches browser storage (docs/PERSIST.md §4). Ask Persist, Settings or Device instead:');
  for (const o of offences) console.error('  ' + o);
  process.exit(1);
}

// The allow-lists stay honest: a file that no longer needs its exemption loses it.
for (const rel of MAY_NAME) {
  if (!NAMES.test(code(readFileSync(join(root, rel), 'utf8')))) {
    console.error(`FAIL: ${rel} no longer names browser storage; drop it from MAY_NAME`);
    process.exit(1);
  }
}
for (const rel of MAY_CALL) {
  if (!CALLS.test(code(readFileSync(join(root, rel), 'utf8')))) {
    console.error(`FAIL: ${rel} no longer calls the storage API; drop it from MAY_CALL`);
    process.exit(1);
  }
}

console.log(`OK store ownership (${scanned} modules; storage named by ${MAY_NAME.size}, called by ${MAY_CALL.size}, all on the list)`);
