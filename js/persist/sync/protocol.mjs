/**
 * What sync says to the server (docs/PERSIST.md §5), as data.
 *
 * A project VERSION is a manifest: the project's name, its files in the
 * user's order (id, path, content hash), its empty folders and its active
 * suites. File texts travel and are stored once per content hash. A manifest
 * is small, so comparing two of them is how sync knows what changed: no
 * clock is ever consulted.
 *
 * Pure: shared by the engine, the reference server and the tests.
 *
 * The transport a server implements (every method async; `pid` a project id):
 *   heads()                        [{ id, version, deleted }]  every project of the account
 *   head(pid)                      { version, deleted, manifest } | null
 *   blobs(pid, hashes)             { [hash]: text } for the ones it has
 *   missing(pid, hashes)           [hash] it does not have
 *   putBlobs(pid, { hash: text })  { ok } (every text is checked against its hash)
 *   commit(pid, { id, base, manifest })
 *        { ok: true, version } | { ok: false, head } | { ok: false, missing: [hash] }
 *        Moves the head only if it is still `base` (0: the project is new).
 *        A commit id seen before answers with the version it made, so a retry
 *        after a lost response can never commit twice.
 *   remove(pid, { id, base })      { ok: true, version } | { ok: false, head }
 *   settings()                     { version, values } | null
 *   commitSettings({ id, base, values })   as commit
 * A transport that cannot reach the server throws; that is never an answer.
 */

export const MANIFEST_VERSION = 1;

/** JSON with every object's keys sorted: one spelling per value. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

const HASH = /^[0-9a-f]{64}$/;

export function isHash(h) {
  return typeof h === 'string' && HASH.test(h);
}

function hex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

/** SHA-256 of a text's UTF-8 bytes, as lowercase hex. */
export async function sha256(text) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error('sync: Web Crypto is not available');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return hex(new Uint8Array(digest));
}

export function emptyManifest() {
  return { v: MANIFEST_VERSION, name: '', createdAt: 0, files: [], folders: [], suites: {} };
}

function stringList(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const x of raw) {
    if (typeof x === 'string' && x && !out.includes(x)) out.push(x);
  }
  return out;
}

/**
 * A manifest the engine may trust, or null. Anything malformed is refused
 * whole, never repaired: a manifest that lost a file in repair would read
 * as that file having been deleted.
 */
export function normalizeManifest(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== MANIFEST_VERSION || !Array.isArray(raw.files)) return null;
  if (typeof raw.name !== 'string') return null;
  const ids = new Set();
  const paths = new Set();
  const files = [];
  for (const f of raw.files) {
    if (!f || typeof f.id !== 'string' || !f.id || typeof f.path !== 'string' || !f.path || !isHash(f.hash)) return null;
    if (ids.has(f.id) || paths.has(f.path)) return null;
    ids.add(f.id);
    paths.add(f.path);
    files.push({ id: f.id, path: f.path, hash: f.hash });
  }
  const suites = {};
  if (raw.suites && typeof raw.suites === 'object' && !Array.isArray(raw.suites)) {
    for (const dir of Object.keys(raw.suites).sort()) {
      const list = stringList(raw.suites[dir]);
      if (list.length) suites[dir] = list;
    }
  }
  return {
    v: MANIFEST_VERSION,
    name: raw.name,
    createdAt: typeof raw.createdAt === 'number' && raw.createdAt > 0 ? raw.createdAt : 0,
    files,
    folders: stringList(raw.folders).sort(),
    suites,
  };
}

/**
 * The manifest of a project as it stands locally. `hashes` maps each file id
 * to the hash of its text. Folders are sorted: their order means nothing, and
 * two devices listing them differently must not look like a change.
 */
export function manifestOf(meta, tree, hashes) {
  return normalizeManifest({
    v: MANIFEST_VERSION,
    name: meta.name,
    createdAt: meta.createdAt,
    files: tree.files.map((f) => ({ id: f.id, path: f.name, hash: hashes[f.id] })),
    folders: tree.folders,
    suites: tree.suites,
  });
}

export function sameManifest(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}

/** file id → manifest entry */
export function filesById(manifest) {
  const m = new Map();
  for (const f of manifest.files) m.set(f.id, f);
  return m;
}
