/**
 * Settings sync (docs/PERSIST.md §5): the settings follow the account between
 * devices, merged one setting at a time.
 *
 * The device keeps the settings as last synced (`beljar/settings-sync`, with
 * the account and the server's version). A setting changed on one side since
 * then takes that side; changed on both, this device's (the change just made
 * here). So two devices changing different settings never disagree, and no
 * clock decides anything. Rows marked `sync: false` never leave the device,
 * and arriving values are checked against the table like any stored value.
 */
import { SETTINGS_KEY, settingRow, normalizeSetting, sameValue, isSyncedSetting } from '../settings-schema.mjs';
import { SETTINGS_SYNC_KEY } from '../keys.mjs';

/** Only values the table can hold, that differ from their default, on rows that sync. */
export function cleanSyncedValues(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const id of Object.keys(raw).sort()) {
    const row = settingRow(id);
    if (!isSyncedSetting(row)) continue;
    const v = normalizeSetting(row, raw[id]);
    if (v !== undefined && !sameValue(v, row.default)) out[id] = v;
  }
  return out;
}

export function sameValues(a, b) {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((id) => id in b && sameValue(a[id], b[id]));
}

/** Per setting: changed on one side takes it; on both, mine. Absent means the default. */
export function mergeSettingValues(base, mine, theirs) {
  const out = {};
  const ids = new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)]);
  for (const id of [...ids].sort()) {
    const b = base[id];
    const m = mine[id];
    const t = theirs[id];
    const v = sameValue(m, t) ? m : sameValue(m, b) ? t : m;
    if (v !== undefined) out[id] = v;
  }
  return out;
}

function readRecord(store, account) {
  const r = store.get(SETTINGS_SYNC_KEY);
  if (!r || typeof r !== 'object' || r.account !== account) return null;
  const pending = r.pending && typeof r.pending === 'object' && typeof r.pending.id === 'string'
    ? { id: r.pending.id, base: Number(r.pending.base) || 0, values: cleanSyncedValues(r.pending.values) }
    : null;
  return {
    account,
    version: Number.isInteger(r.version) && r.version > 0 ? r.version : 0,
    values: cleanSyncedValues(r.values),
    pending,
  };
}

/**
 * @param {object} o
 * @param {object} o.store
 * @param {{ get(id: string): any }} o.settings
 * @param {string} o.account
 * @param {(method: string, ...args) => Promise<any>} o.call   the transport, through the engine
 * @param {() => string} o.commitId
 * @param {number} [o.attempts]
 */
export function createSettingsSync(o) {
  const { store, account } = o;
  const attempts = o.attempts || 8;

  function writeRecord(rec) {
    const res = store.set(SETTINGS_SYNC_KEY, rec);
    if (!res.ok) throw Object.assign(new Error('sync: could not record the settings sync'), { storage: res.error });
  }

  /** This device's synced settings: the stored overrides, minus rows that stay here. */
  function local() {
    const rec = store.get(SETTINGS_KEY);
    return cleanSyncedValues(rec && rec.values);
  }

  /** Put merged values in place, keeping this device's `sync: false` rows as they are. */
  function apply(values) {
    const rec = store.get(SETTINGS_KEY);
    const cur = rec && rec.values && typeof rec.values === 'object' ? rec.values : {};
    const next = {};
    for (const id of Object.keys(cur)) {
      const row = settingRow(id);
      if (row && !isSyncedSetting(row)) next[id] = cur[id];
    }
    Object.assign(next, values);
    const res = store.applyRemote(SETTINGS_KEY, { values: next });
    if (!res.ok) throw Object.assign(new Error('sync: could not apply synced settings'), { storage: res.error });
  }

  function normalizeHead(raw) {
    if (raw == null) return null;
    if (typeof raw !== 'object' || !Number.isInteger(raw.version) || raw.version < 1) {
      throw new Error('sync: the server sent settings this version cannot read');
    }
    return { version: raw.version, values: cleanSyncedValues(raw.values) };
  }

  async function sync() {
    if (!o.settings.get('syncSettings')) return { status: 'off' };
    for (let i = 0; i < attempts; i++) {
      const rec = readRecord(store, account);
      if (rec && rec.pending) {
        // Sent, never answered: send it again. A commit id the server has
        // seen answers with the version it made; one it has not either
        // lands now or is refused, and either way the next pass knows.
        const res = await o.call('commitSettings', rec.pending);
        writeRecord(res && res.ok
          ? { account, version: res.version, values: rec.pending.values, pending: null }
          : { account, version: rec.version, values: rec.values, pending: null });
        continue;
      }
      const head = normalizeHead(await o.call('settings'));
      const mine = local();
      if (!head || (rec && head.version === rec.version)) {
        // Nothing new on the server (or nothing there at all: a first sync,
        // or a server that lost them, and then these are the settings).
        const synced = head ? rec.values : null;
        if (synced ? sameValues(mine, synced) : !Object.keys(mine).length) return { status: 'clean' };
        const kept = { account, version: rec ? rec.version : 0, values: rec ? rec.values : {} };
        const pending = { id: o.commitId(), base: head ? head.version : 0, values: mine };
        writeRecord({ ...kept, pending });
        const res = await o.call('commitSettings', pending);
        if (res && res.ok) {
          writeRecord({ account, version: res.version, values: mine, pending: null });
          return { status: 'pushed', version: res.version };
        }
        writeRecord({ ...kept, pending: null });
        continue;
      }
      // The server moved on (or this device never synced this account).
      // Nothing awaited since `mine` was read: merge and apply in one go.
      const merged = mergeSettingValues(rec ? rec.values : {}, mine, head.values);
      if (!sameValues(merged, mine)) apply(merged);
      writeRecord({ account, version: head.version, values: head.values, pending: null });
      // The next pass pushes the merge if it differs from the server's.
    }
    return { status: 'busy' };
  }

  return { sync };
}
