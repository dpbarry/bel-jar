// Every name the app calls on Persist, and every setting and device row it names
// by id, exists on the objects as they are.
//
// The persistence rebuild moved preferences into a settings table and dropped the
// old read-a-stored-preference functions from Persist. js/beluga/beluga-client.js,
// a plain script outside the build, kept calling two of them, and Run threw "… is
// not a function" on every file, locally and live, until probe:live ran a check
// (2026-09-28): nothing had run a file with the real Persist on the page, and Node
// tests run the client without Persist, where the call is skipped.
//
// This reads every script the page can load (js/ and index.html) and holds each
// `Persist.<name>` to the real Persist, and each literal id given to Settings,
// readSetting/writeSetting and Device to its schema.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBrowserStorage, openTab } from './_persist-env.mjs';
import { SETTINGS } from '../js/persist/settings-schema.mjs';
import { DEVICE } from '../js/persist/device-schema.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const { P } = openTab(makeBrowserStorage());
expect(P && typeof P.listProjects === 'function', 'the real Persist runs here');

const files = [path.join(root, 'index.html')];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(m?js)$/.test(e.name)) files.push(p);
  }
})(path.join(root, 'js'));
expect(files.length > 100, `the page's scripts are found (${files.length})`);

const settingIds = new Set(SETTINGS.map((r) => r.id));
const deviceIds = new Set(DEVICE.map((r) => r.id));
const missing = { persist: new Map(), setting: new Map(), device: new Map() };
const note = (map, name, file) => {
  if (!map.has(name)) map.set(name, path.relative(root, file).replace(/\\/g, '/'));
};
let persistUses = 0;
let idUses = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bPersist\.([A-Za-z_$][\w$]*)/g)) {
    persistUses += 1;
    if (!(m[1] in P)) note(missing.persist, m[1], file);
  }
  for (const m of src.matchAll(/\b(?:Settings\.(?:get|set)|readSetting|writeSetting)\(\s*['"]([\w.-]+)['"]/g)) {
    idUses += 1;
    if (!settingIds.has(m[1])) note(missing.setting, m[1], file);
  }
  for (const m of src.matchAll(/\bDevice\.(?:get|set)\(\s*['"]([\w.-]+)['"]/g)) {
    idUses += 1;
    if (!deviceIds.has(m[1])) note(missing.device, m[1], file);
  }
}
const show = (map) => [...map].map(([name, file]) => `${name} (${file})`).join(', ');
expect(persistUses > 50 && idUses > 20, `the scan sees the app's uses (${persistUses} Persist, ${idUses} ids)`);
expect(missing.persist.size === 0, `every Persist.<name> the app calls exists: missing ${show(missing.persist)}`);
expect(missing.setting.size === 0, `every setting the app names is in the settings table: missing ${show(missing.setting)}`);
expect(missing.device.size === 0, `every device row the app names is in the device table: missing ${show(missing.device)}`);

console.log(`OK persist-api-use (${n} checks: ${persistUses} Persist calls and ${idUses} setting and device ids across ${files.length} files, all real)`);
