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
 */
import { sha256, normalizeManifest, isHash } from '../js/persist/sync/protocol.mjs';

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

const textKey = (account, hash) => `t/${account}/${hash}`;
const bytes = (s) => new TextEncoder().encode(s).length;

function validCommit(req) {
  return !!req && typeof req.id === 'string' && req.id.length > 0 && req.id.length <= LIMITS.commitId
    && Number.isInteger(req.base) && req.base >= 0;
}

/**
 * @param {{ db: D1Database, texts: R2Bucket, hash?: (text: string) => Promise<string>, now?: () => number }} o
 */
export function createSyncStore(o) {
  const db = o.db;
  const r2 = o.texts;
  const hash = o.hash || sha256;
  const now = o.now || (() => Date.now());

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
   * version row with it. `create` first makes the project row (a first commit).
   * True when it moved.
   */
  async function advance(table, keyCol, key, owner, base, versionRow, create) {
    const stmts = [];
    if (create) stmts.push(create);
    stmts.push(owner == null
      ? db.prepare(`UPDATE ${table} SET head = ? WHERE ${keyCol} = ? AND head = ?`).bind(base + 1, key, base)
      : db.prepare(`UPDATE ${table} SET head = ? WHERE ${keyCol} = ? AND head = ? AND owner = ?`).bind(base + 1, key, base, owner));
    stmts.push(versionRow);
    const results = await db.batch(stmts);
    return results[results.length - 1].meta.changes === 1;
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
      async heads() {
        const rows = await db.prepare(
          'SELECT p.id AS id, p.head AS version, v.deleted AS deleted FROM projects p '
          + 'JOIN versions v ON v.project = p.id AND v.version = p.head WHERE p.owner = ?',
        ).bind(account).all();
        return rows.results.map((r) => ({ id: r.id, version: r.version, deleted: !!r.deleted }));
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
        const entries = Object.entries(texts && typeof texts === 'object' ? texts : {});
        if (entries.length > LIMITS.putTexts) return { ok: false, error: 'too-many' };
        for (const [h, text] of entries) {
          if (!isHash(h) || typeof text !== 'string' || bytes(text) > LIMITS.textBytes || (await hash(text)) !== h) {
            return { ok: false, error: 'bad-text' };
          }
        }
        for (const [h, text] of entries) {
          await r2.put(textKey(account, h), text, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
          await db.prepare('INSERT OR IGNORE INTO texts (account, hash, size, created_at) VALUES (?, ?, ?, ?)')
            .bind(account, h, bytes(text), now()).run();
        }
        return { ok: true };
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
        const have = await held(account, named);
        const missing = named.filter((h) => !have.has(h));
        if (missing.length) return { ok: false, missing };
        let moved = false;
        try {
          moved = await advance('projects', 'id', pid, account, req.base,
            db.prepare('INSERT INTO versions (project, version, base, commit_id, deleted, manifest, created_at) '
              + 'SELECT ?, ?, ?, ?, 0, ?, ? WHERE changes() = 1')
              .bind(pid, req.base + 1, req.base, req.id, json, now()),
            req.base === 0 ? db.prepare('INSERT INTO projects (id, owner, head) VALUES (?, ?, 0) ON CONFLICT (id) DO NOTHING').bind(pid, account) : null);
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
              .bind(pid, req.base + 1, req.base, req.id, now()));
        } catch (_) {
          moved = false;
        }
        if (moved) return { ok: true, version: req.base + 1 };
        const replay = await replayed(pid, req.id);
        if (replay) return { ok: true, version: replay, replay: true };
        const again = await project(pid);
        return { ok: false, head: await headOf(pid, again.head) };
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
