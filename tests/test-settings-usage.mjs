// The settings table and the code that uses it agree, in both directions.
//
// Every id the app reads or writes is declared (a typo would otherwise only
// throw when that code path runs), and every declared setting is used by
// something (a row nothing reads is a preference the dialog can offer that
// changes nothing). Also: no module outside js/persist reads settings through
// Persist any more — that surface is gone.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SETTINGS } from '../js/persist/settings-schema.mjs';
import { SEEN_SETTING } from '../js/ui/hint-seen.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
function expect(cond, msg) {
  n += 1;
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

const declared = new Set(SETTINGS.map((r) => r.id));
const used = new Map();
const USE = /\b(?:Settings\.(?:get|set|isDefault|revision)|readSetting|writeSetting|settings\.(?:get|set))\(\s*'([A-Za-z]+)'/g;
const COMMAND_ROW = /\bsetting: '([A-Za-z]+)'/g;
for (const rel of walk('js')) {
  const src = readFileSync(join(root, rel), 'utf8');
  for (const re of [USE, COMMAND_ROW]) {
    for (const m of src.matchAll(re)) {
      if (!used.has(m[1])) used.set(m[1], new Set());
      used.get(m[1]).add(rel);
    }
  }
  if (!rel.startsWith('js/persist/')) {
    expect(!/\bPersist\??\.(?:read|write)Stored(?:Theme|UiFontSize|UiTextContrast|MotionPref|ToastDuration)\b/.test(src),
      `${rel} reads appearance settings through Persist`);
  }
}

// The frame repaints boot settings from Settings.values(); count those as used.
for (const row of SETTINGS.filter((r) => r.boot)) {
  if (!used.has(row.id)) used.set(row.id, new Set(['js/frame/frame.mjs (repaint)']));
}

// A tip's seen row is read and written by js/ui/hint.mjs through hint-seen.mjs's table.
for (const row of Object.values(SEEN_SETTING)) {
  if (!used.has(row)) used.set(row, new Set(['js/ui/hint.mjs (hint-seen.mjs)']));
}

const undeclared = [...used.keys()].filter((id) => !declared.has(id));
expect(undeclared.length === 0, `used but not declared in settings-schema.mjs: ${undeclared.map((id) => `${id} (${[...used.get(id)].join(', ')})`).join('; ')}`);
const unused = [...declared].filter((id) => !used.has(id));
expect(unused.length === 0, `declared but never read or written: ${unused.join(', ')}`);

console.log(`OK settings usage (${declared.size} settings, every one used, ${[...used.values()].reduce((a, s) => a + s.size, 0)} file uses, none undeclared)`);
