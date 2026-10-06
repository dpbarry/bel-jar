/**
 * A tip seen on one computer is seen on all of them (Dean, 2026-10-06): signing
 * in on a new computer must not show again what the account has already seen.
 *
 * Each tip that shows once has a synced setting of its own (`hintSeen*` in
 * settings-schema.mjs). One row per tip, not one list: settings sync merges a
 * setting at a time, so two computers that each saw a different tip would
 * fight over one list, and over two rows they never disagree (each only goes
 * from false to true). The list this device kept before (`dismissedHints`)
 * still counts, and is carried into the rows at boot, so the cloud hears of a
 * tip seen before this change.
 *
 * Signed in on a device that has not finished a round yet, the cloud's answer
 * is still on its way: a tip waits for that round, however long it takes (a
 * tip shown on a slow first round is a tip shown twice), and one already
 * showing closes when a round says it was seen.
 *
 * Pure (tests/test-hint-seen.mjs); js/ui/hint.mjs uses it.
 */

/** Each tip that shows once, and the synced setting that remembers it. */
export const SEEN_SETTING = {
  library: 'hintSeenLibrary',
  'inspector-cursor': 'hintSeenInspectorCursor',
};

export function seenSetting(id) {
  return Object.prototype.hasOwnProperty.call(SEEN_SETTING, id) ? SEEN_SETTING[id] : null;
}

/**
 * @param {string} id
 * @param {{ setting: (row: string) => any, deviceList: string[] }} o
 */
export function wasSeen(id, o) {
  const row = seenSetting(id);
  if (row && o.setting(row) === true) return true;
  return (o.deviceList || []).indexOf(id) !== -1;
}

/** The rows the device list says were seen and the settings do not know yet. */
export function carryForward(deviceList, setting) {
  return (deviceList || []).map(seenSetting).filter((row) => row && setting(row) !== true);
}

/**
 * Whether the account's answer is here: signed out (there is none), settings
 * sync off on this device (it will not come), or a round has finished.
 * @param {{ signedIn?: boolean, lastSync?: number } | null} summary
 * @param {boolean} syncSettingsOn
 */
export function settingsKnown(summary, syncSettingsOn) {
  if (!summary || !summary.signedIn || !syncSettingsOn) return true;
  return summary.lastSync > 0;
}
