// A tip seen on one computer is seen on all of them (js/ui/hint-seen.mjs; Dean,
// 2026-10-06): each once-ever tip has a synced setting of its own, the device's
// old list still counts and is carried forward, and a device signed in before
// its first round waits for the account's answer.
import { SEEN_SETTING, seenSetting, wasSeen, carryForward, settingsKnown } from '../js/ui/hint-seen.mjs';
import { settingRow, isSyncedSetting } from '../js/persist/settings-schema.mjs';
import { mergeSettingValues } from '../js/persist/sync/settings-sync.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// Every once-ever tip the app shows has a row, and every row syncs and survives Reset.
const app = readFileSync(join(root, 'js/app/app.mjs'), 'utf8');
const shown = [...app.matchAll(/Hint\.show\(\{\s*id:\s*'([^']+)'/g)].map((m) => m[1])
  .concat([...app.matchAll(/const INSPECTOR_FOLLOW_HINT = '([^']+)'/g)].map((m) => m[1]));
expect(shown.length === 2 && shown.every((id) => seenSetting(id)), `every tip the editor shows has a seen setting (${shown.join(', ')})`);
for (const row of Object.values(SEEN_SETTING)) {
  const r = settingRow(row);
  expect(r && r.default === false && isSyncedSetting(r) && r.reset === false, `${row}: a synced row, false until seen, kept through Reset`);
}
expect(seenSetting('toString') === null && seenSetting('nope') === null, 'only the tips listed have a row');

// Seen: the synced row, or the device's own list from before.
const none = () => false;
expect(wasSeen('library', { setting: (r) => r === 'hintSeenLibrary', deviceList: [] }), 'the account says seen: seen here too');
expect(wasSeen('library', { setting: none, deviceList: ['library'] }), "this device's old list still counts");
expect(!wasSeen('library', { setting: none, deviceList: ['inspector-cursor'] }), 'one tip seen is not the other');
expect(carryForward(['library', 'old-tip'], none).join() === 'hintSeenLibrary', "the old list's tips reach the cloud");
expect(carryForward(['library'], (r) => r === 'hintSeenLibrary' ? true : undefined).length === 0, 'once, and not again');

// Two computers, each seeing a different tip before either syncs: both stay seen.
const merged = mergeSettingValues({}, { hintSeenLibrary: true }, { hintSeenInspectorCursor: true });
expect(merged.hintSeenLibrary === true && merged.hintSeenInspectorCursor === true, `two computers, two tips: neither is lost (${JSON.stringify(merged)})`);

// Whether the account has answered.
expect(settingsKnown(null, true) && settingsKnown({ signedIn: false, lastSync: 0 }, true), 'signed out: nothing to wait for');
expect(!settingsKnown({ signedIn: true, lastSync: 0 }, true), 'signed in on a new computer, no round yet: wait');
expect(settingsKnown({ signedIn: true, lastSync: 1 }, true), 'a round has landed: the answer is here');
expect(settingsKnown({ signedIn: true, lastSync: 0 }, false), 'settings sync off on this device: the answer will not come, so do not wait');

console.log(`OK hint seen (${n} checks: a tip seen on one computer stays seen on all, the old list counts, a new computer waits for its first round)`);
