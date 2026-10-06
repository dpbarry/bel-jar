/**
 * The sync protocol (js/persist/sync/protocol.mjs) on Cloudflare D1 and R2:
 * the server's rules exactly as the reference server keeps them
 * (js/persist/sync/memory-server.mjs, docs/PERSIST.md §5.7), and held to the
 * same tests (tests/_sync-protocol-suite.mjs).
 *
 * ⛔ A head moves in one D1 transaction or not at all: the UPDATE moves it
 * only if it is still `base`, and the version row goes in only if that
 * UPDATE changed a row. Two commits over one base cannot both land, and a
 * commit over any other base makes nothing. There is no read-then-write.
 *
 * ⛔ Every text is checked against its hash before it is stored, and a text
 * is indexed in D1 only after R2 holds it: the index never names a text R2
 * does not have, so a manifest that passed the `missing` check can be read.
 *
 * A commit may carry the texts it names (`texts`): a push is one request.
 * They are taken under the same rules as `putBlobs`, and only those the
 * manifest names; what is still missing after them is answered as `missing`.
 */
import { sha256, normalizeManifest, isHash, versionsLimit, QUOTA } from '../js/persist/sync/protocol.mjs';

// What one request may carry. Generous for proofs; small enough that no
// single request can make the Worker run long.
export const LIMITS = {
  hashes: 2000, // hashes named in one blobs / missing call
  textBytes: 4 * 1024 * 1024, // one file's text
  putTexts: 200, // texts in one putBlobs call
  manifestBytes: 1024 * 1024,
  settingsBytes: 256 * 1024,
  commitId: 128,
};

// D1 binds at most 100 parameters to a statement.
const IN_CHUNK = 90;

/** Where an account's texts are in R2: every key under it is one of its texts (deletion.mjs lists them). */
export const textPrefix = (account) => `t/${account}/`;
const textKey = (account, hash) => textPrefix(account) + hash;
const bytes = (s) => new TextEncoder().encode(s).length;

function validCommit(req) {
  return !!req && typeof req.id === 'string' && req.id.length > 0 && req.id.length <= LIMITS.commitId
    && Number.isInteger(req.base) && req.base >= 0;
}

/** A batch of texts as one request may carry them: null when any is malformed or over a limit. */
async function checkedTexts(raw, hash) {
  const entries = Object.entries(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});
  if (entries.length > LIMITS.putTexts) return null;
  for (const [h, text] of entries) {
    if (!isHash(h) || typeof text !== 'string' || bytes(text) > LIMITS.textBytes || (await hash(text)) !== h) return null;
  }
  return entries;
}

/**
 * @param {{ db: D1Database, texts: R2Bucket, hash?: (text: string) => Promise<string>, now?: () => number, quota?: object }} o
 */
export function createSyncStore(o) {
  const db = o.db;
  const r2 = o.texts;
  const hash = o.hash || sha256;
  const now = o.now || (() => Date.now());
  const quota = Object.assign({}, QUOTA, o.quota || {});

  /** The account's counts (migration 0005): { projects, text_bytes }. */
  async function usageOf(account) {
    const u = await db.prepare('SELECT projects, text_bytes FROM usage WHERE account = ?').bind(account).first();
    return u || { projects: 0, text_bytes: 0 };
  }

  async function project(pid) {
    return db.prepare('SELECT owner, head FROM projects WHERE id = ?').bind(pid).first();
  }

  async function headOf(pid, head) {
    const v = await db.prepare('SELECT version, deleted, manifest, commit_id FROM versions WHERE project = ? AND version = ?')
      .bind(pid, head).first();
    if (!v) return null;
    return { version: v.version, deleted: !!v.deleted, manifest: v.deleted ? null : JSON.parse(v.manifest), commit: v.commit_id };
  }

  async function held(account, hashes) {
    const have = new Set();
    for (let i = 0; i < hashes.length; i += IN_CHUNK) {
      const chunk = hashes.slice(i, i + IN_CHUNK);
      const rows = await db.prepare(`SELECT hash FROM texts WHERE account = ? AND hash IN (${chunk.map(() => '?').join(',')})`)
        .bind(account, ...chunk).all();
      for (const r of rows.results) have.add(r.hash);
    }
    return have;
  }

  /**
   * Move a head from `base` to `base + 1` in one transaction, writing the
   * version row with it. `create` first makes the project row (a first commit);
   * `counted`, after it, moves the account's count in the same transaction (its
   * `changes()` is the version row's: it counts only a head that moved).
   * True when it moved.
   */
  async function advance(table, keyCol, key, owner, base, versionRow, create, counted) {
    const stmts = [];
    if (create) stmts.push(create);
    stmts.push(owner == null
      ? db.prepare(`UPDATE ${table} SET head = ? WHERE ${keyCol} = ? AND head = ?`).bind(base + 1, key, base)
      : db.prepare(`UPDATE ${table} SET head = ? WHERE ${keyCol} = ? AND head = ? AND owner = ?`).bind(base + 1, key, base, owner));
    stmts.push(versionRow);
    const at = stmts.length - 1;
    if (counted) stmts.push(counted);
    const results = await db.batch(stmts);
    return results[at].meta.changes === 1;
  }

  /**
   * Store checked texts: R2 first, then the index (the index never names what
   * R2 lacks). Only the ones the account does not hold are stored and counted;
   * refused 'quota-texts', storing nothing, when they would pass its limit.
   */
  async function keep(account, entries) {
    if (!entries.length) return { ok: true };
    const have = await held(account, entries.map(([h]) => h));
    const fresh = entries.filter(([h]) => !have.has(h));
    if (!fresh.length) return { ok: true };
    const adding = fresh.reduce((sum, [, text]) => sum + bytes(text), 0);
    if ((await usageOf(account)).text_bytes + adding > quota.textBytes) return { ok: false, error: 'quota-texts' };
    for (const [h, text] of fresh) {
      await r2.put(textKey(account, h), text, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
      await db.prepare('INSERT OR IGNORE INTO texts (account, hash, size, created_at) VALUES (?, ?, ?, ?)')
        .bind(account, h, bytes(text), now()).run();
    }
    await db.prepare('INSERT INTO usage (account, projects, text_bytes) VALUES (?, 0, ?) '
      + 'ON CONFLICT (account) DO UPDATE SET text_bytes = usage.text_bytes + excluded.text_bytes').bind(account, adding).run();
    return { ok: true };
  }

  function transport(account) {
    if (!account) throw new Error('sync store: a transport speaks for one account');

    /** Nobody else's: unknown yet, or this account's. */
    async function mayWrite(pid) {
      const p = await project(pid);
      return !p || p.owner === account;
    }

    async function settingsHead() {
      const h = await db.prepare('SELECT head FROM settings_heads WHERE account = ?').bind(account).first();
      if (!h || !h.head) return null;
      const v = await db.prepare('SELECT version, vals FROM settings_versions WHERE account = ? AND version = ?')
        .bind(account, h.head).first();
      return v ? { version: v.version, values: JSON.parse(v.vals) } : null;
    }

    async function replayed(pid, id) {
      const r = await db.prepare('SELECT version FROM versions WHERE project = ? AND commit_id = ?').bind(pid, id).first();
      return r ? r.version : 0;
    }

    return {
      async heads(o) {
        const rows = await db.prepare(
          'SELECT p.id AS id, p.head AS version, v.deleted AS deleted FROM projects p '
          + 'JOIN versions v ON v.project = p.id AND v.version = p.head WHERE p.owner = ?',
        ).bind(account).all();
        const list = rows.results.map((r) => ({ id: r.id, version: r.version, deleted: !!r.deleted }));
        if (!(o && o.settings === true)) return list;
        const s = await db.prepare('SELECT head FROM settings_heads WHERE account = ?').bind(account).first();
        return { projects: list, settings: s && s.head ? s.head : 0 };
      },

      async head(pid) {
        const p = await project(pid);
        return p && p.owner === account ? headOf(pid, p.head) : null;
      },

      async blobs(pid, hashes) {
        const out = {};
        const wanted = [...new Set(Array.isArray(hashes) ? hashes : [])].filter(isHash).slice(0, LIMITS.hashes);
        if (!wanted.length || !(await mayWrite(pid))) return out;
        await Promise.all(wanted.map(async (h) => {
          const obj = await r2.get(textKey(account, h));
          if (obj) out[h] = await obj.text();
        }));
        return out;
      },

      async missing(pid, hashes) {
        const wanted = [...new Set(Array.isArray(hashes) ? hashes : [])].filter(isHash).slice(0, LIMITS.hashes);
        const have = await held(account, wanted);
        return wanted.filter((h) => !have.has(h));
      },

      async putBlobs(pid, texts) {
        if (!(await mayWrite(pid))) return { ok: false, error: 'forbidden' };
        if (Object.keys(texts && typeof texts === 'object' ? texts : {}).length > LIMITS.putTexts) return { ok: false, error: 'too-many' };
        const entries = await checkedTexts(texts, hash);
        if (!entries) return { ok: false, error: 'bad-text' };
        return keep(account, entries);
      },

      async commit(pid, req) {
        if (typeof pid !== 'string' || !pid) return { ok: false, error: 'bad-commit' };
        const p = await project(pid);
        if (p && p.owner !== account) return { ok: false, error: 'forbidden' };
        if (!validCommit(req)) return { ok: false, error: 'bad-commit' };
        const seen = p ? await replayed(pid, req.id) : 0;
        if (seen) return { ok: true, version: seen, replay: true };
        const current = p ? p.head : 0;
        if (req.base !== current) return { ok: false, head: p ? await headOf(pid, p.head) : null };
        const manifest = normalizeManifest(req.manifest);
        if (!manifest) return { ok: false, error: 'bad-manifest' };
        const json = JSON.stringify(manifest);
        if (bytes(json) > LIMITS.manifestBytes) return { ok: false, error: 'bad-manifest' };
        const named = [...new Set(manifest.files.map((f) => f.hash))];
        // One project more than the account may have: a new one is refused.
        if (!p && (await usageOf(account)).projects >= quota.projects) return { ok: false, error: 'quota-projects' };
        if (req.texts != null) {
          if (Object.keys(typeof req.texts === 'object' ? req.texts : {}).length > LIMITS.putTexts) return { ok: false, error: 'too-many' };
          const entries = await checkedTexts(req.texts, hash);
          if (!entries) return { ok: false, error: 'bad-text' };
          const wanted = new Set(named);
          const kept = await keep(account, entries.filter(([h]) => wanted.has(h)));
          if (!kept.ok) return kept;
        }
        const have = await held(account, named);
        const missing = named.filter((h) => !have.has(h));
        if (missing.length) return { ok: false, missing };
        let moved = false;
        try {
          moved = await advance('projects', 'id', pid, account, req.base,
            db.prepare('INSERT INTO versions (project, version, base, commit_id, deleted, manifest, created_at) '
              + 'SELECT ?, ?, ?, ?, 0, ?, ? WHERE changes() = 1')
              .bind(pid, req.base + 1, req.base, req.id, json, now()),
            req.base === 0 ? db.prepare('INSERT INTO projects (id, owner, head) VALUES (?, ?, 0) ON CONFLICT (id) DO NOTHING').bind(pid, account) : null,
            // A project counts from its first version, and again once a deleted one comes back.
            db.prepare('INSERT INTO usage (account, projects, text_bytes) SELECT ?, 1, 0 WHERE changes() = 1 AND '
              + '(? = 0 OR EXISTS (SELECT 1 FROM versions WHERE project = ? AND version = ? AND deleted = 1)) '
              + 'ON CONFLICT (account) DO UPDATE SET projects = usage.projects + 1').bind(account, req.base, pid, req.base));
        } catch (_) {
          // The same commit id landed at this moment from a retry: fall through to the replay check.
          moved = false;
        }
        if (moved) return { ok: true, version: req.base + 1 };
        const again = await project(pid);
        if (again && again.owner !== account) return { ok: false, error: 'forbidden' };
        const replay = again ? await replayed(pid, req.id) : 0;
        if (replay) return { ok: true, version: replay, replay: true };
        return { ok: false, head: again ? await headOf(pid, again.head) : null };
      },

      async remove(pid, req) {
        const p = await project(pid);
        if (!p) return { ok: false, head: null };
        if (p.owner !== account) return { ok: false, error: 'forbidden' };
        if (!validCommit(req)) return { ok: false, error: 'bad-commit' };
        const seen = await replayed(pid, req.id);
        if (seen) return { ok: true, version: seen, replay: true };
        if (req.base !== p.head) return { ok: false, head: await headOf(pid, p.head) };
        let moved = false;
        try {
          moved = await advance('projects', 'id', pid, account, req.base,
            db.prepare('INSERT INTO versions (project, version, base, commit_id, deleted, manifest, created_at) '
              + 'SELECT ?, ?, ?, ?, 1, NULL, ? WHERE changes() = 1')
              .bind(pid, req.base + 1, req.base, req.id, now()),
            null,
            // A deleted project no longer counts (unless it already did not).
            db.prepare('UPDATE usage SET projects = MAX(0, projects - 1) WHERE account = ? AND changes() = 1 '
              + 'AND NOT EXISTS (SELECT 1 FROM versions WHERE project = ? AND version = ? AND deleted = 1)').bind(account, pid, req.base));
        } catch (_) {
          moved = false;
        }
        if (moved) return { ok: true, version: req.base + 1 };
        const replay = await replayed(pid, req.id);
        if (replay) return { ok: true, version: replay, replay: true };
        const again = await project(pid);
        return { ok: false, head: await headOf(pid, again.head) };
      },

      async versions(pid, o) {
        const p = await project(pid);
        if (!p || p.owner !== account) return [];
        const before = o && Number.isInteger(o.before) && o.before > 0 ? o.before : p.head + 1;
        // The summary is read inside D1 (its JSON functions): a page of history
        // costs one query and carries no manifest.
        const rows = await db.prepare(
          "SELECT version, deleted, created_at, json_extract(manifest, '$.name') AS name, "
          + "json_array_length(manifest, '$.files') AS files FROM versions "
          + 'WHERE project = ? AND version < ? ORDER BY version DESC LIMIT ?',
        ).bind(pid, before, versionsLimit(o && o.limit)).all();
        return rows.results.map((r) => ({
          version: r.version,
          createdAt: r.created_at,
          deleted: !!r.deleted,
          name: r.deleted ? null : r.name,
          files: r.deleted ? 0 : r.files || 0,
        }));
      },

      async version(pid, n) {
        const p = await project(pid);
        if (!p || p.owner !== account || !Number.isInteger(n)) return null;
        const v = await db.prepare('SELECT version, deleted, manifest, created_at FROM versions WHERE project = ? AND version = ?')
          .bind(pid, n).first();
        return v ? { version: v.version, createdAt: v.created_at, deleted: !!v.deleted, manifest: v.deleted ? null : JSON.parse(v.manifest) } : null;
      },

      settings: settingsHead,

      async commitSettings(req) {
        if (!validCommit(req)) return { ok: false, error: 'bad-commit' };
        const replay = async () => {
          const r = await db.prepare('SELECT version FROM settings_versions WHERE account = ? AND commit_id = ?')
            .bind(account, req.id).first();
          return r ? r.version : 0;
        };
        const seen = await replay();
        if (seen) return { ok: true, version: seen, replay: true };
        const current = await settingsHead();
        if (req.base !== (current ? current.version : 0)) return { ok: false, head: current };
        if (!req.values || typeof req.values !== 'object' || Array.isArray(req.values)) return { ok: false, error: 'bad-settings' };
        const json = JSON.stringify(req.values);
        if (bytes(json) > LIMITS.settingsBytes) return { ok: false, error: 'bad-settings' };
        let moved = false;
        try {
          moved = await advance('settings_heads', 'account', account, null, req.base,
            db.prepare('INSERT INTO settings_versions (account, version, commit_id, vals, created_at) '
              + 'SELECT ?, ?, ?, ?, ? WHERE changes() = 1')
              .bind(account, req.base + 1, req.id, json, now()),
            req.base === 0 ? db.prepare('INSERT INTO settings_heads (account, head) VALUES (?, 0) ON CONFLICT (account) DO NOTHING').bind(account) : null);
        } catch (_) {
          moved = false;
        }
        if (moved) return { ok: true, version: req.base + 1 };
        const again = await replay();
        if (again) return { ok: true, version: again, replay: true };
        return { ok: false, head: await settingsHead() };
      },
    };
  }

  return { transport };
}
