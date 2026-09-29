/**
 * A sync server in memory: the reference for what a real one must do
 * (protocol.mjs), and what the tests and the simulator run against.
 *
 * Its rules are the server's rules, whatever runs them:
 *   - a commit moves a project's head only if the head is still its `base`
 *     (compare-and-swap); versions count up by one, so history is a line;
 *   - a commit id seen before answers with the version it made (a retry
 *     after a lost response never commits twice);
 *   - a manifest may only name texts the server has; every text is checked
 *     against its hash on the way in;
 *   - a project belongs to the account that first committed it, and no other
 *     account can read, write or learn that it exists;
 *   - texts are pooled per account, never across accounts: a shared pool
 *     would tell one account that another holds the same file.
 */
import { sha256, normalizeManifest, isHash } from './protocol.mjs';

const copy = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/**
 * @param {{ hash?: (text: string) => Promise<string> }} [opts]
 */
export function createMemoryServer(opts = {}) {
  const hash = opts.hash || sha256;
  const projects = new Map(); // pid → { owner, versions: [{ version, deleted, manifest, commit, base }], commits: Map }
  const pools = new Map(); // account → Map(hash → text)
  const settings = new Map(); // account → { versions: [{ version, values, commit }], commits: Map }

  function pool(account) {
    if (!pools.has(account)) pools.set(account, new Map());
    return pools.get(account);
  }

  function top(p) {
    return p.versions[p.versions.length - 1];
  }

  function headOf(p) {
    if (!p) return null;
    const h = top(p);
    return { version: h.version, deleted: h.deleted, manifest: h.deleted ? null : copy(h.manifest), commit: h.commit };
  }

  /** Nobody else's: unknown yet, or this account's. */
  function mayWrite(pid, account) {
    const p = projects.get(pid);
    return !p || p.owner === account;
  }

  function transport(account) {
    if (!account) throw new Error('memory server: a transport speaks for one account');
    return {
      async heads() {
        const out = [];
        for (const [id, p] of projects) {
          if (p.owner !== account) continue;
          const h = top(p);
          out.push({ id, version: h.version, deleted: h.deleted });
        }
        return out;
      },

      async head(pid) {
        const p = projects.get(pid);
        return p && p.owner === account ? headOf(p) : null;
      },

      async blobs(pid, hashes) {
        const out = {};
        if (!mayWrite(pid, account)) return out;
        const b = pool(account);
        for (const h of hashes || []) if (b.has(h)) out[h] = b.get(h);
        return out;
      },

      async missing(pid, hashes) {
        const b = pool(account);
        return [...new Set(hashes || [])].filter((h) => !b.has(h));
      },

      async putBlobs(pid, texts) {
        if (!mayWrite(pid, account)) return { ok: false, error: 'forbidden' };
        const entries = Object.entries(texts || {});
        for (const [h, text] of entries) {
          if (!isHash(h) || typeof text !== 'string' || (await hash(text)) !== h) return { ok: false, error: 'bad-text' };
        }
        const b = pool(account);
        for (const [h, text] of entries) b.set(h, text);
        return { ok: true };
      },

      async commit(pid, req) {
        const p = projects.get(pid);
        if (p && p.owner !== account) return { ok: false, error: 'forbidden' };
        if (!req || typeof req.id !== 'string' || !req.id) return { ok: false, error: 'bad-commit' };
        if (p && p.commits.has(req.id)) return { ok: true, version: p.commits.get(req.id), replay: true };
        const current = p ? top(p).version : 0;
        if (req.base !== current) return { ok: false, head: headOf(p) };
        const manifest = normalizeManifest(req.manifest);
        if (!manifest) return { ok: false, error: 'bad-manifest' };
        const b = pool(account);
        const missing = [...new Set(manifest.files.map((f) => f.hash))].filter((h) => !b.has(h));
        if (missing.length) return { ok: false, missing };
        const entry = p || { owner: account, versions: [], commits: new Map() };
        if (!p) projects.set(pid, entry);
        const version = current + 1;
        entry.versions.push({ version, deleted: false, manifest, commit: req.id, base: req.base });
        entry.commits.set(req.id, version);
        return { ok: true, version };
      },

      async remove(pid, req) {
        const p = projects.get(pid);
        if (!p || p.owner !== account) return p ? { ok: false, error: 'forbidden' } : { ok: false, head: null };
        if (!req || typeof req.id !== 'string' || !req.id) return { ok: false, error: 'bad-commit' };
        if (p.commits.has(req.id)) return { ok: true, version: p.commits.get(req.id), replay: true };
        const current = top(p).version;
        if (req.base !== current) return { ok: false, head: headOf(p) };
        const version = current + 1;
        p.versions.push({ version, deleted: true, manifest: null, commit: req.id, base: req.base });
        p.commits.set(req.id, version);
        return { ok: true, version };
      },

      async settings() {
        const s = settings.get(account);
        if (!s) return null;
        const h = s.versions[s.versions.length - 1];
        return { version: h.version, values: copy(h.values) };
      },

      async commitSettings(req) {
        if (!req || typeof req.id !== 'string' || !req.id) return { ok: false, error: 'bad-commit' };
        const s = settings.get(account) || { versions: [], commits: new Map() };
        if (s.commits.has(req.id)) return { ok: true, version: s.commits.get(req.id), replay: true };
        const current = s.versions.length ? s.versions[s.versions.length - 1].version : 0;
        if (req.base !== current) {
          const h = s.versions[s.versions.length - 1];
          return { ok: false, head: h ? { version: h.version, values: copy(h.values) } : null };
        }
        if (!req.values || typeof req.values !== 'object' || Array.isArray(req.values)) return { ok: false, error: 'bad-settings' };
        if (!settings.has(account)) settings.set(account, s);
        const version = current + 1;
        s.versions.push({ version, values: copy(req.values), commit: req.id });
        s.commits.set(req.id, version);
        return { ok: true, version };
      },
    };
  }

  return {
    transport,

    /** For tests: every version of a project, oldest first (copies), and who owns it. */
    history(pid) {
      const p = projects.get(pid);
      return p ? { owner: p.owner, versions: copy(p.versions) } : null;
    },

    /** For tests: every project id the server has, whoever owns it. */
    projectIds() {
      return [...projects.keys()].sort();
    },

    /** For tests: a text by hash from an account's pool. */
    text(account, h) {
      return pool(account).get(h);
    },

    /** For tests: every settings version an account committed. */
    settingsHistory(account) {
      const s = settings.get(account);
      return s ? copy(s.versions) : [];
    },
  };
}
