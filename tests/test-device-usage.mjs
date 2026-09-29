// The device table and the code that uses it agree, in both directions
// (as test-settings-usage.mjs does for settings).
//
// Every id the app reads or writes is declared (a typo would otherwise only
// throw when that code path runs), and every declared row is used by something
// (a row nothing reads is state kept for nobody).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEVICE } from '../js/persist/device-schema.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = dir + '/' + name;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (rel.endsWith('.mjs')) out.push(rel);
  }
  return out;
}

const declared = new Set(DEVICE.map((r) => r.id));
// A call that names an id: these must be declared.
const CALL = /\b(?:Device\.(?:get|set|isDefault|revision|defaultOf)|D\.(?:get|set)|device\.(?:get|set)|readDevice|writeDevice|deviceRow|deviceDefault)\(\s*'([A-Za-z]+)'/g;
// Any quoted declared id counts as a use (graph-prefs maps fields to ids in a table).
const QUOTED = /'([A-Za-z]+)'/g;

const called = new Map();
const mentioned = new Set();
for (const rel of walk('js')) {
  if (rel === 'js/persist/device-schema.mjs') continue;
  const src = readFileSync(join(root, rel), 'utf8');
  for (const m of src.matchAll(CALL)) {
    if (!called.has(m[1])) called.set(m[1], new Set());
    called.get(m[1]).add(rel);
  }
  for (const m of src.matchAll(QUOTED)) if (declared.has(m[1])) mentioned.add(m[1]);
}

// Settings ids share call shapes (settings.get('x')), so only flag an undeclared
// id when it is not a setting either.
const { SETTINGS } = await import('../js/persist/settings-schema.mjs');
const settingIds = new Set(SETTINGS.map((r) => r.id));
const undeclared = [...called.keys()].filter((id) => !declared.has(id) && !settingIds.has(id));
expect(undeclared.length === 0,
  `read or written but not declared in device-schema.mjs: ${undeclared.map((id) => `${id} (${[...called.get(id)].join(', ')})`).join('; ')}`);

// Panel sizes are read by id built from the panel name (side-panel-resize.mjs)
// and painted by early boot through their cssVar: the cssVar is their use.
const unused = DEVICE.filter((r) => !r.cssVar && !mentioned.has(r.id)).map((r) => r.id);
expect(unused.length === 0, `declared but never used: ${unused.join(', ')}`);

console.log(`OK device usage (${declared.size} rows, every one used, none undeclared)`);
