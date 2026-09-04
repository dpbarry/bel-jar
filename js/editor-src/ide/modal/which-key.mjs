/**
 * Which-key: after a prefix, the bar says what it is waiting for.
 *
 * Vim already tells you that a sequence is pending (`cm.state.vim.status` holds
 * `2d`, `g`, `\`). What it never tells you is what the second key could BE — and
 * for BelJar's own maps, where `\h` is "intro at hole" and `]c` is "next case",
 * that is the whole difference between a leader people use and one they forget.
 *
 * Everything here is pure and driven by the same `NORMAL_MAP` / `LEADER_MAP`
 * that define the bindings, so a hint cannot advertise a key that is not mapped.
 *
 * ⛔ It renders as a LIST in the strip's popup, the same box the command line
 * completes into — not as a one-line message. There used to be a `whichKeyLine`
 * that abbreviated titles to fit one row; a list has room for the real ones.
 *
 * Both styles use it. Vim's pending keys come from `cm.state.vim.status`; Emacs'
 * come from `$data.keyChain`, which `reportEmacsChain()` already reads for the
 * mode badge — so `C-x` and `C-c` get the same treatment `g`, `]` and the leader
 * do. The chains differ only in spelling: `]h` continues `]` with `h`, and
 * `C-x C-f` continues `C-x` with `C-f`.
 */

/**
 * Pure: what `typed` could still become, given `[keys, id]` pairs.
 *
 * A leading count is Vim's, not ours — `2g` is still the `g` prefix — so it is
 * stripped before matching. An exact match is not a continuation: once the
 * sequence is complete there is nothing left to wait for.
 */
export function continuations(typed, maps) {
  const raw = String(typed == null ? '' : typed);
  const prefix = raw.replace(/^\d+/, '');
  if (!prefix) return [];
  const out = [];
  const seen = new Set();
  for (const [keys, id] of maps || []) {
    if (!keys.startsWith(prefix) || keys.length <= prefix.length) continue;
    const rest = keys.slice(prefix.length);
    // A chain is space-separated (`C-x C-f`), so the prefix must end at a
    // boundary — otherwise `C-x` would also claim a hypothetical `C-xy`.
    if (keys.indexOf(' ') >= 0 && rest[0] !== ' ') continue;
    const key = rest.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, id });
  }
  return out;
}

/** The maps a hint is built from: normal-mode pairs plus leader-expanded ones. */
export function keyMaps(normalMap, leaderMap, leader) {
  const lead = String(leader || '');
  return normalMap.concat(leaderMap.map(([keys, id]) => [lead + keys, id]));
}

/**
 * Emacs' chains, as one list.
 *
 * ⛔ The declined chords are left out on purpose. `C-x 2` answers "BelJar has one
 * editor pane" — worth saying when you press it, but a hint lists what you CAN
 * do, the same rule Available Macros follows.
 */
export function emacsMaps(cxMap, ccMap) {
  return (cxMap || []).concat(ccMap || []);
}
