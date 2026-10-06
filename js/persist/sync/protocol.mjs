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
 *   heads({ settings: true })      { projects: [...as above], settings: version (0: none) }
 *        The same list, with where the account's settings are: an idle round is
 *        then ONE request (plan v6 c8). Without the option the answer is as it
 *        always was, for a page that has not reloaded since.
 *   head(pid)                      { version, deleted, manifest } | null
 *   blobs(pid, hashes)             { [hash]: text } for the ones it has
 *   missing(pid, hashes)           [hash] it does not have
 *   putBlobs(pid, { hash: text })  { ok } (every text is checked against its hash)
 *   commit(pid, { id, base, manifest, texts? })
 *        { ok: true, version } | { ok: false, head } | { ok: false, missing: [hash] }
 *        Moves the head only if it is still `base` (0: the project is new).
 *        A commit id seen before answers with the version it made, so a retry
 *        after a lost response can never commit twice.
 *        `texts` ({ hash: text }) travel with it: a push is ONE request. Each is
 *        checked against its hash and kept only if the manifest names it; the
 *        server answers `missing` with what it still lacks (texts it was not
 *        sent), and keeps the ones it took for the next try.
 *   remove(pid, { id, base })      { ok: true, version } | { ok: false, head }
 *   settings()                     { version, values } | null
 *   commitSettings({ id, base, values })   as commit
 *   versions(pid, { before?, limit? })
 *        [{ version, createdAt, deleted, name, files }]: the project's history,
 *        newest first, a page at a time (VERSIONS_PAGE, at most VERSIONS_MAX),
 *        each below `before` when given. `files` counts them. Version history.
 *   version(pid, n)                { version, createdAt, deleted, manifest } | null
 *        One version, whole. Its texts come from `blobs`: a text, once kept,
 *        is never removed while the account lasts.
 * Another account's project answers [] and null, as if it did not exist.
 * A transport that cannot reach the server throws; that is never an answer.
 */

export const MANIFEST_VERSION = 1;

/**
 * What one account may hold (plan v6 c10): projects that are not deleted, and
 * text stored, counted in one row per account. A commit that would make one
 * project too many is refused 'quota-projects'; texts that would pass the
 * limit, 'quota-texts'. Far above what a class writes: a guard against a bug
 * that loops more than against a person.
 */
export const QUOTA = { projects: 1000, textBytes: 1024 * 1024 * 1024 };

/** Versions a history page holds, by default and at most. */
export const VERSIONS_PAGE = 50;
export const VERSIONS_MAX = 200;

/** The page size a `versions` call asked for, within bounds. */
export function versionsLimit(n) {
  return Number.isInteger(n) && n > 0 ? Math.min(n, VERSIONS_MAX) : VERSIONS_PAGE;
}

/** A history row: what Version history lists of one version. */
export function versionSummary(v, createdAt) {
  return {
    version: v.version,
    createdAt: Number(createdAt) || 0,
    deleted: !!v.deleted,
    name: v.deleted || !v.manifest ? null : v.manifest.name,
    files: v.deleted || !v.manifest ? 0 : v.manifest.files.length,
  };
}

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

/**
 * SHA-256 of a text's UTF-8 bytes, as lowercase hex, at once: the same value
 * as `sha256`. For a page that is going: Web Crypto answers on a later turn,
 * and a tab being closed may not have one (engine.mjs `flush`).
 */
export function sha256Sync(text) {
  const bytes = new TextEncoder().encode(String(text));
  const n = bytes.length;
  const words = new Uint32Array((((n + 9 + 63) >> 6) << 4));
  for (let i = 0; i < n; i++) words[i >> 2] |= bytes[i] << (24 - (i & 3) * 8);
  words[n >> 2] |= 0x80 << (24 - (n & 3) * 8);
  words[words.length - 1] = n * 8;
  words[words.length - 2] = Math.floor(n / 0x20000000);
  const h = new Uint32Array(SHA_INIT);
  const w = new Uint32Array(64);
  for (let off = 0; off < words.length; off += 16) {
    for (let t = 0; t < 16; t++) w[t] = words[off + t];
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15];
      const y = w[t - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (k + S1 + ((e & f) ^ (~e & g)) + SHA_K[t] + w[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += k;
  }
  let s = '';
  for (let i = 0; i < 8; i++) s += h[i].toString(16).padStart(8, '0');
  return s;
}

const SHA_INIT = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

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
