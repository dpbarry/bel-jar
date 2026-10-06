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
 *     would tell one account that another holds the same file;
 *   - an account may hold so many projects that are not deleted, and so much
 *     text (protocol.mjs QUOTA): past either, the server refuses, and says which.
 */
import { sha256, normalizeManifest, isHash, versionsLimit, versionSummary, QUOTA } from './protocol.mjs';

const copy = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/**
 * @param {{ hash?: (text: string) => Promise<string>, now?: () => number, quota?: object }} [opts]
 */
export function createMemoryServer(opts = {}) {
  const hash = opts.hash || sha256;
  const now = opts.now || (() => Date.now());
  const quota = Object.assign({}, QUOTA, opts.quota || {});
  const usage = new Map(); // account → { projects, textBytes }
  const bytes = (s) => new TextEncoder().encode(s).length;

  function used(account) {
    if (!usage.has(account)) usage.set(account, { projects: 0, textBytes: 0 });
    return usage.get(account);
  }

  /** Keep checked texts the account lacks, counted; false (keeping none) past its limit. */
  function keep(account, entries) {
    const b = pool(account);
    const fresh = entries.filter(([h]) => !b.has(h));
    const adding = fresh.reduce((sum, [, t]) => sum + bytes(t), 0);
    if (used(account).textBytes + adding > quota.textBytes) return false;
    for (const [h, text] of fresh) b.set(h, text);
    used(account).textBytes += adding;
    return true;
  }
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
      async heads(o) {
        const out = [];
        for (const [id, p] of projects) {
          if (p.owner !== account) continue;
          const h = top(p);
          out.push({ id, version: h.version, deleted: h.deleted });
        }
        if (!(o && o.settings === true)) return out;
        const s = settings.get(account);
        return { projects: out, settings: s && s.versions.length ? s.versions[s.versions.length - 1].version : 0 };
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
        return keep(account, entries) ? { ok: true } : { ok: false, error: 'quota-texts' };
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
        const named = new Set(manifest.files.map((f) => f.hash));
        if (!p && used(account).projects >= quota.projects) return { ok: false, error: 'quota-projects' };
        // The texts that came with it: checked against their hashes, kept only if named.
        const sent = req.texts && typeof req.texts === 'object' && !Array.isArray(req.texts) ? Object.entries(req.texts) : [];
        for (const [h, text] of sent) {
          if (!isHash(h) || typeof text !== 'string' || (await hash(text)) !== h) return { ok: false, error: 'bad-text' };
        }
        if (!keep(account, sent.filter(([h]) => named.has(h)))) return { ok: false, error: 'quota-texts' };
        const missing = [...named].filter((h) => !b.has(h));
        if (missing.length) return { ok: false, missing };
        const entry = p || { owner: account, versions: [], commits: new Map() };
        if (!p) projects.set(pid, entry);
        // A project counts from its first version, and again once a deleted one comes back.
        if (!p || top(p).deleted) used(account).projects += 1;
        const version = current + 1;
        entry.versions.push({ version, deleted: false, manifest, commit: req.id, base: req.base, createdAt: now() });
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
        if (!top(p).deleted) used(account).projects = Math.max(0, used(account).projects - 1);
        p.versions.push({ version, deleted: true, manifest: null, commit: req.id, base: req.base, createdAt: now() });
        p.commits.set(req.id, version);
        return { ok: true, version };
      },

      async versions(pid, o) {
        const p = projects.get(pid);
        if (!p || p.owner !== account) return [];
        const before = o && Number.isInteger(o.before) ? o.before : Infinity;
        return p.versions.filter((v) => v.version < before).slice(-versionsLimit(o && o.limit)).reverse()
          .map((v) => versionSummary(v, v.createdAt));
      },

      async version(pid, n) {
        const p = projects.get(pid);
        if (!p || p.owner !== account || !Number.isInteger(n)) return null;
        const v = p.versions.find((x) => x.version === n);
        return v ? { version: v.version, createdAt: v.createdAt, deleted: v.deleted, manifest: v.deleted ? null : copy(v.manifest) } : null;
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

    /** For tests: a text the server no longer has, as pruning would leave it (docs/PERSIST.md §5.7). */
    forget(account, h) {
      pool(account).delete(h);
    },

    /** For tests: what an account holds, counted ({ projects, textBytes }). */
    usage(account) {
      return copy(used(account));
    },

    /** For tests: every settings version an account committed. */
    settingsHistory(account) {
      const s = settings.get(account);
      return s ? copy(s.versions) : [];
    },
  };
}
