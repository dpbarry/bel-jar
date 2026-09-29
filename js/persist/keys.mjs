/**
 * Every storage key BelJar uses outside the two tables, built in one place
 * (docs/PERSIST.md §3.3). The tables name their own records: `beljar/settings`
 * (settings-schema.mjs) and `beljar/device` (device-schema.mjs).
 *
 * Pure so early boot can read a session record before the app loads. The class
 * of each key (work, device, cache) is decided by the pattern table in
 * store.mjs, not here.
 */
import { DEVICE_KEY, readBootDevice } from './device-schema.mjs';

export { DEVICE_KEY };

export const NOTIFICATIONS_KEY = 'beljar/notifications';
export const REPL_TRANSCRIPT_KEY = 'beljar/repl/transcript';
export const REPL_COMMANDS_KEY = 'beljar/repl/commands';
/** Synced projects deleted here, until the server has been told (sync/engine.mjs). */
export const TOMBSTONES_KEY = 'beljar/tombstones';
/** The settings as last synced, and the server version they came from. */
export const SETTINGS_SYNC_KEY = 'beljar/settings-sync';

/** The tab guard's handshake (tab-guard.mjs): one key per message kind. */
export function tabMessageKey(kind) {
  return 'beljar/tabs/' + kind;
}

/** Everything that belongs to one project, for deleting it whole. */
export function projectPrefix(pid) {
  return 'beljar/p/' + pid + '/';
}

/** A project's name, creation time and owner. Its existence is the project's. */
export function metaKey(pid) {
  return projectPrefix(pid) + 'meta';
}

export function treeKey(pid) {
  return projectPrefix(pid) + 'tree';
}

export function fileKey(pid, fid) {
  return projectPrefix(pid) + 'f/' + fid;
}

export function sessionKey(pid) {
  return projectPrefix(pid) + 'session';
}

export function cacheKey(pid, fid) {
  return projectPrefix(pid) + 'cache/' + fid;
}

/** Editor folds per file, in the store the fold setting picks. */
export function foldsKey(pid) {
  return projectPrefix(pid) + 'folds';
}

/** The version of this project this device last synced, and its manifest (docs/PERSIST.md §5). */
export function syncKey(pid) {
  return projectPrefix(pid) + 'sync';
}

/** The undo stack, in the tab store: it outlives a reload, not the tab. */
export function undoKey(pid) {
  return projectPrefix(pid) + 'undo';
}

/**
 * A file whose text changed on both sides in the same lines: both versions,
 * kept on this device until a person chooses (document.mjs).
 */
export function conflictKey(pid, fid) {
  return projectPrefix(pid) + 'conflict/' + fid;
}

var PROJECT_KEY = /^beljar\/p\/([^/]+)\/(meta|tree|session|folds|undo|sync|f|cache|conflict)(?:\/([^/]+))?$/;

/** What a project key names: { pid, kind, fid? }, or null for any other key. */
export function parseKey(key) {
  var m = typeof key === 'string' ? PROJECT_KEY.exec(key) : null;
  if (!m) return null;
  var hasFile = m[2] === 'f' || m[2] === 'cache' || m[2] === 'conflict';
  if (hasFile !== (m[3] != null)) return null;
  return hasFile ? { pid: m[1], kind: m[2], fid: m[3] } : { pid: m[1], kind: m[2] };
}

// ── ids ─────────────────────────────────────────────────────────────────────
// 128 bits in the shape of a ULID: 48 bits of millisecond time, then 80 random
// bits, in lowercase Crockford base32 (26 characters, no I L O U, no modulo
// bias). They become server keys and URL segments (`/edit/:id`), so they must
// be unique across every account, not just this browser; and time order gives
// files a creation order that survives merging (a folder run without a .cfg
// runs its files in registry order).

var B32 = '0123456789abcdefghjkmnpqrstvwxyz';
var lastTime = -1;
var lastRand = null;

function randomBytes(n) {
  var cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') return cryptoApi.getRandomValues(new Uint8Array(n));
  var out = new Uint8Array(n);
  for (var i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

function encodeTime(ms) {
  var s = '';
  var t = ms;
  for (var i = 0; i < 10; i++) {
    s = B32[t % 32] + s;
    t = Math.floor(t / 32);
  }
  return s;
}

function encodeRandom(bytes) {
  var s = '';
  var acc = 0;
  var bits = 0;
  for (var i = 0; i < bytes.length; i++) {
    acc = (acc << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      s += B32[(acc >> bits) & 31];
    }
    acc &= (1 << bits) - 1;
  }
  return s;
}

function increment(bytes) {
  for (var i = bytes.length - 1; i >= 0; i--) {
    if (bytes[i] < 255) { bytes[i] += 1; return true; }
    bytes[i] = 0;
  }
  return false;
}

/**
 * A fresh id: `p_…` for a project, `f_…` for a file. A path is data, never a
 * key, so two paths can never meet in storage and a rename never moves text.
 * Ids made by one page sort in the order they were made, even within one
 * millisecond or across a clock stepping back. `taken` rejects a repeat.
 */
export function newId(kind, taken) {
  for (;;) {
    var now = Date.now();
    if (now > lastTime || !lastRand) {
      lastTime = now;
      lastRand = randomBytes(10);
    } else if (!increment(lastRand)) {
      lastTime += 1;
      lastRand = randomBytes(10);
    }
    var id = kind + '_' + encodeTime(lastTime) + encodeRandom(lastRand);
    if (!taken || !taken(id)) return id;
  }
}

/** When an id was made (ms since the epoch), or NaN for anything else. */
export function idTime(id) {
  var m = /^[a-z]+_([0-9a-hjkmnp-tv-z]{10})[0-9a-hjkmnp-tv-z]{16}$/.exec(String(id));
  if (!m) return NaN;
  var t = 0;
  for (var i = 0; i < 10; i++) t = t * 32 + B32.indexOf(m[1][i]);
  return t;
}

/**
 * Early boot's read of the page's session, straight from storage: which side
 * panel this project had open. Mirrors the store's envelope and schema rules
 * without the store (it is not loaded yet); anything unexpected reads as none.
 */
export function readBootSession(storage, schema) {
  try {
    var pid = readBootDevice(storage, schema).activeProject;
    if (!pid) return null;
    var env = JSON.parse(storage.getItem(sessionKey(pid)) || 'null');
    return env && env.data && typeof env.data === 'object' ? env.data : null;
  } catch (_) {
    return null;
  }
}
