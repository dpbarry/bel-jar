/**
 * Three versions of a project in, the one to keep out (docs/PERSIST.md §5).
 *
 * `base` is the version this device last synced, `mine` is this device now,
 * `theirs` is the server's head. Files are matched by id, so a rename is a
 * rename and never a delete plus an add. Per file:
 *
 *   changed on one side             that side
 *   changed on both                 merge3 of the texts; lines that collide
 *                                   are a conflict (storage takes theirs, and
 *                                   mine waits in a conflict record for a
 *                                   person: the same record §4.4 uses)
 *   deleted on one side only        gone
 *   deleted on one, changed on the  kept, and said so: an edit is never lost
 *   other                           to a delete
 *   renamed on both                 mine (the rename just made here)
 *
 * The project's name and each directory's active suites merge the same way
 * as one value each; empty folders merge as a set. Two files that end up
 * with one path keep the first (the server's), and the other becomes
 * "name (conflicted copy).ext".
 *
 * Pure and synchronous: the engine calls it again whenever this device
 * changed while it waited for the server, and applies the result without
 * yielding in between.
 */
import { merge3, conflictedCopyName } from '../merge.mjs';
import { filesById } from './protocol.mjs';

function sameList(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** One value changed on one side takes that side; changed on both, mine. */
function pick(base, mine, theirs, same) {
  if (same(mine, theirs)) return mine;
  if (same(mine, base)) return theirs;
  return mine;
}

const is = (a, b) => a === b;

/**
 * @param {object} a
 * @param {object} a.base          manifest (protocol.emptyManifest() when never synced)
 * @param {object} a.mine          manifest of this device now
 * @param {Record<string, string>} a.mineTexts   file id → this device's text
 * @param {object} a.theirs        manifest of the server's head
 * @param {(hash: string) => string | undefined} a.text   a text by hash, if known
 * @param {Set<string>} [a.conflicted]  files with a conflict here still waiting for a person
 * @param {() => string} a.newFileId
 * @returns {{ needs: string[] } | { project: object, conflicts: object[], notices: object[] }}
 *   needs: hashes to fetch before calling again
 *   project: { name, createdAt, files: [{ id, path, text }], folders, suites }
 *   conflicts: [{ id, base, mine, theirs }] records to write before the texts
 *   notices: [{ kind, path, from? }]
 *     'kept'      another device deleted it; kept because it changed here
 *     'restored'  deleted here; back because another device changed it
 *     'renamed'   another file took its path (from: the path it had)
 *     'conflict'  both changed the same lines; a person chooses
 *     'copied'    as 'conflict', on a file still waiting for a person: this
 *                 device's text was kept as a copy (from: the file's path)
 */
export function mergeProject(a) {
  const B = filesById(a.base);
  const M = filesById(a.mine);
  const T = filesById(a.theirs);
  const conflicted = a.conflicted || new Set();
  const needs = new Set();
  const out = [];
  const conflicts = [];
  const notices = [];
  const copies = [];

  function need(hash) {
    const t = a.text(hash);
    if (t === undefined) needs.add(hash);
    return t;
  }

  // A conflict still waiting here is a change here, whatever storage holds:
  // its other side lives only in the record.
  const changedHere = (id, m, b) => conflicted.has(id) || m.hash !== b.hash || m.path !== b.path;
  const changedThere = (t, b) => t.hash !== b.hash || t.path !== b.path;

  const order = [...T.keys()];
  for (const id of M.keys()) if (!T.has(id)) order.push(id);

  for (const id of order) {
    const b = B.get(id);
    const m = M.get(id);
    const t = T.get(id);
    if (m && t) {
      const path = pick(b ? b.path : undefined, m.path, t.path, is);
      const mine = a.mineTexts[id];
      if (m.hash === t.hash || (b && t.hash === b.hash)) {
        out.push({ id, path, text: mine });
      } else if (b && m.hash === b.hash) {
        const theirs = need(t.hash);
        if (theirs !== undefined) out.push({ id, path, text: theirs });
      } else {
        // Changed on both sides (or made on both with no common version).
        const baseText = b ? need(b.hash) : '';
        const theirs = need(t.hash);
        if (baseText === undefined || theirs === undefined) continue;
        const r = merge3(baseText, mine, theirs);
        // `askAll` ("Changed in two places: Ask me", Settings > Account):
        // nothing merges by itself, so a clean merge waits for a person as an
        // overlap does. The very same change on both sides never gets here:
        // equal hashes are settled above, with nothing to ask.
        if (r.ok && !a.askAll) {
          out.push({ id, path, text: r.text });
        } else {
          out.push({ id, path, text: theirs });
          if (conflicted.has(id)) {
            // A person has not chosen yet on this file: its record holds a
            // side already. Keep this one as a file rather than lose either.
            copies.push({ of: id, text: mine });
          } else {
            conflicts.push({ id, base: baseText, mine, theirs });
            notices.push({ kind: 'conflict', path });
          }
        }
      }
    } else if (m) {
      if (!b) {
        out.push({ id, path: m.path, text: a.mineTexts[id] });
      } else if (changedHere(id, m, b)) {
        out.push({ id, path: m.path, text: a.mineTexts[id] });
        notices.push({ kind: 'kept', path: m.path });
      }
      // else: deleted there, untouched here: gone.
    } else if (t) {
      if (!b || changedThere(t, b)) {
        const theirs = need(t.hash);
        if (theirs === undefined) continue;
        out.push({ id, path: t.path, text: theirs });
        if (b) notices.push({ kind: 'restored', path: t.path });
      }
      // else: deleted here, untouched there: gone.
    }
  }

  if (needs.size) return { needs: [...needs] };

  for (const c of copies) {
    const at = out.findIndex((f) => f.id === c.of);
    out.splice(at + 1, 0, { id: a.newFileId(), path: out[at].path, text: c.text, copyOf: c.of });
  }

  // One path, one file: the first keeps it (the server's order comes first).
  const taken = new Set(out.map((f) => f.path));
  const seen = new Set();
  for (const f of out) {
    if (seen.has(f.path)) {
      const from = f.path;
      f.path = conflictedCopyName(from, taken);
      taken.add(f.path);
      notices.push({ kind: f.copyOf ? 'copied' : 'renamed', path: f.path, from });
    }
    seen.add(f.path);
    delete f.copyOf;
  }

  // Empty folders: kept by both, or made by either. A folder with a file
  // under it is no longer empty.
  const bf = new Set(a.base.folders);
  const mf = new Set(a.mine.folders);
  const tf = new Set(a.theirs.folders);
  const folders = [...new Set([...a.theirs.folders, ...a.mine.folders])]
    .filter((x) => (mf.has(x) && tf.has(x)) || (mf.has(x) && !bf.has(x)) || (tf.has(x) && !bf.has(x)))
    .filter((x) => !out.some((f) => f.path.startsWith(x + '/')))
    .sort();

  const suites = {};
  const dirs = new Set([...Object.keys(a.base.suites), ...Object.keys(a.mine.suites), ...Object.keys(a.theirs.suites)]);
  for (const dir of [...dirs].sort()) {
    const v = pick(a.base.suites[dir] || [], a.mine.suites[dir] || [], a.theirs.suites[dir] || [], sameList);
    if (v.length) suites[dir] = v.slice();
  }

  return {
    project: {
      name: pick(a.base.name, a.mine.name, a.theirs.name, is),
      createdAt: a.theirs.createdAt || a.mine.createdAt,
      files: out,
      folders,
      suites,
    },
    conflicts,
    notices,
  };
}
