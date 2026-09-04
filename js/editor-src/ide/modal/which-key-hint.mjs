/**
 * Which-key, resolved against the live registry.
 *
 * `which-key.mjs` is the pure half — given a pending prefix and a list of
 * `[keys, id]` pairs it says what could follow. This is the half that reaches
 * for `Commands` to name them, and it is deliberately separate so the matching
 * logic stays testable without a page.
 *
 * ⛔ Titles come from the registry, so a hint names commands the way every other
 * surface does and cannot advertise a key that is not mapped.
 */
import { continuations, keyMaps } from './which-key.mjs';
import { _pure as vimMaps, DEFAULT_LEADER, leaderKeys } from './vim-setup.mjs';

/** How long a prefix must sit before the bar volunteers the continuations. */
export const WHICH_KEY_MS = 400;

/**
 * The which-key rows for a pending sequence, or [] when nothing follows it.
 *
 * `mapsOrLeader` is either an explicit `[keys, id]` list (Emacs passes its
 * chains) or a leader character, in which case Vim's own maps are used.
 */
export function whichKeyHint(pending, mapsOrLeader) {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const C = g.Commands;
  if (!C || typeof C.get !== 'function') return [];
  const maps = Array.isArray(mapsOrLeader)
    ? mapsOrLeader
    // ⛔ Vim's SPELLING, not the stored character: `cm.state.vim.status` reads
    // `<Space>` after a space, so matching against a literal ' ' found nothing
    // and the hint stayed silent for exactly the leader that needs it most.
    : keyMaps(vimMaps.NORMAL_MAP, vimMaps.LEADER_MAP,
      leaderKeys(mapsOrLeader != null ? mapsOrLeader : DEFAULT_LEADER));
  const out = [];
  for (const row of continuations(pending, maps)) {
    const cmd = C.get(row.id);
    if (cmd && cmd.title) out.push({ key: row.key, title: cmd.title });
  }
  return out;
}
