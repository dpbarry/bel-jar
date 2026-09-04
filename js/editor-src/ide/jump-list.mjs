/**
 * The jump list — `Ctrl-O` / `Ctrl-I` in Vim, back/forward in every IDE.
 *
 * BelJar already jumps constantly (definitions, references, holes, problems,
 * `:42`) and until now there was no way back. `jump-log.mjs` only *logs* jumps
 * for debugging; this remembers them.
 *
 * The list is a stack with a cursor, not a history of everything: going back
 * three times and then jumping somewhere new truncates the forward tail, which
 * is what every editor does and what people expect.
 */

const CAP = 60;

let entries = [];
let cursor = -1;
// Set while the list itself is driving a jump, so a back/forward does not
// record the position it is leaving as a new destination.
let navigating = false;

/** Pure: the list after recording `entry` at `cursor`. Exported for tests. */
export function pushEntry(list, at, entry, cap = CAP) {
  const kept = list.slice(0, at + 1);
  const last = kept[kept.length - 1];
  // Two jumps from the same spot are one entry; otherwise `gd` twice from one
  // line leaves a duplicate to step through on the way back.
  if (last && last.fileId === entry.fileId && Math.abs(last.pos - entry.pos) < 2) {
    return { list: kept, at: kept.length - 1 };
  }
  kept.push(entry);
  const trimmed = kept.length > cap ? kept.slice(kept.length - cap) : kept;
  return { list: trimmed, at: trimmed.length - 1 };
}

/** Pure: where a step lands, or null when there is nowhere to go. */
export function step(list, at, delta) {
  const next = at + delta;
  if (next < 0 || next >= list.length) return null;
  return { at: next, entry: list[next] };
}

export function isNavigating() {
  return navigating;
}

/**
 * After recording, the cursor sits ONE PAST the end — the same place vi leaves
 * it. The first step back then lands on the position you just left, rather than
 * skipping over it to the one before.
 */
export function record(entry) {
  if (navigating || !entry || !Number.isFinite(entry.pos)) return false;
  const res = pushEntry(entries, entries.length - 1, entry);
  entries = res.list;
  cursor = entries.length;
  return true;
}

/**
 * `delta` is -1 for back, +1 for forward. `go` performs the move; `current` is
 * where the caret is now, appended on the FIRST step back so that going forward
 * again can return to it — otherwise back is a one-way door.
 */
export function travel(delta, go, current) {
  if (delta < 0) {
    if (cursor >= entries.length) {
      if (current && Number.isFinite(current.pos)) {
        const res = pushEntry(entries, entries.length - 1, current);
        entries = res.list;
      }
      cursor = entries.length - 2;
    } else {
      cursor -= 1;
    }
    if (cursor < 0) {
      cursor = 0;
      return false;
    }
  } else {
    if (cursor + 1 >= entries.length) return false;
    cursor += 1;
  }
  const entry = entries[cursor];
  if (!entry) return false;
  navigating = true;
  try {
    return go(entry) !== false;
  } finally {
    navigating = false;
  }
}

export function state() {
  return { size: entries.length, cursor };
}

export function reset() {
  entries = [];
  cursor = -1;
  navigating = false;
}
