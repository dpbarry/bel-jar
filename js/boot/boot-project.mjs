/**
 * What early boot may know of a project before the store exists: its record,
 * if this browser can show it. Pure, over the readers the store allows
 * (js/persist/table.mjs): the start page asks whether the last project can be
 * opened, and the editor paints its name into the header before first paint.
 */
import { SCHEMA } from '../persist/store.mjs';
import { metaKey } from '../persist/keys.mjs';
import { readBootRecord } from '../persist/table.mjs';

/**
 * The project's meta record ({ name, owner, ... }), or null: not here, or not
 * this browser's to show (it belongs to an account that is not signed in and
 * did not keep its projects here). The rule is work.mjs `isVisible`.
 */
export function showableProject(storage, device, pid) {
  if (!pid) return null;
  const meta = readBootRecord(storage, SCHEMA, metaKey(pid));
  if (!meta) return null;
  const owner = meta.owner == null ? null : meta.owner;
  const account = (device && device.account) || null;
  const kept = device && Array.isArray(device.keptAccounts) ? device.keptAccounts : [];
  if (owner !== null && owner !== account && !(!account && kept.includes(owner))) return null;
  return meta;
}
