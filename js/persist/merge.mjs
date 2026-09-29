/**
 * Three-way line merge (docs/PERSIST.md §4.4): how two edits of one base are
 * combined without losing either. The open document uses it when its file
 * changes underneath it, undo uses it to take back your step without taking
 * back someone else's, and sync will use it per file.
 *
 * `merge3(base, mine, theirs)` is diff3 as Khanna, Kunal and Pierce define it
 * ("A Formal Investigation of Diff3"): align each side with the base, keep the
 * lines all three agree on, and between them take whichever side changed. Where
 * both changed the same stretch differently, including lines that merely touch,
 * it is a conflict: never guessed, always handed back to a person.
 *
 * Pure and dependency-free; lines are split on '\n' only, so '\r' stays part of
 * a line and every text round-trips exactly.
 */

// Past this many lines on both sides together, a diff is not worth its cost:
// the sides are treated as wholly different (a merge then keeps a side only if
// the other is unchanged, which is always correct, just less clever).
const MAX_DIFF_LINES = 40000;

export function splitLines(text) {
  return String(text != null ? text : '').split('\n');
}

/**
 * The longest common subsequence of two string arrays, as a map from each
 * index of `a` to its partner in `b` (or -1). Myers' O((N+M)D) algorithm after
 * trimming the common prefix and suffix, so the usual small edit costs little.
 * Matches are strictly increasing in both arrays.
 */
export function lcsMatch(a, b) {
  const match = new Int32Array(a.length).fill(-1);
  let start = 0;
  let endA = a.length;
  let endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) {
    match[start] = start;
    start += 1;
  }
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
    match[endA] = endB;
  }
  const n = endA - start;
  const m = endB - start;
  if (n === 0 || m === 0 || n + m > MAX_DIFF_LINES) return match;

  // Forward pass. trace[d] is the furthest-reaching x per diagonal k before
  // step d, stored over [-d-1, d+1] only (O(D^2) memory, not O(D(N+M))).
  const max = n + m;
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]))
        ? v[off + k + 1]
        : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[start + x] === b[start + y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { found = d; break; }
    }
  }

  // Backtrack from (n, m), recording the diagonal runs (the matches).
  let x = n;
  let y = m;
  for (let d = found; d >= 0; d--) {
    const vd = trace[d];
    const at = (k) => vd[k + d + 1];
    const k = x - y;
    const prevK = (k === -d || (k !== d && at(k - 1) < at(k + 1))) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x -= 1;
      y -= 1;
      match[start + x] = start + y;
    }
    if (d > 0) {
      x = prevX;
      y = prevY;
    }
  }
  return match;
}

function sameLines(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Merge `mine` and `theirs`, both edited from `base`.
 *
 * @returns {{ ok: true, text: string } |
 *           { ok: false, text: string, conflicts: Array<{ line: number, base: string[], mine: string[], theirs: string[] }> }}
 *   On a conflict `text` keeps MINE in each conflicting stretch (a caller that
 *   shows it loses nothing of the user's), and `conflicts` says where, by line
 *   of `text` (0-based), with all three versions of each stretch.
 */
export function merge3(base, mine, theirs) {
  const b0 = String(base != null ? base : '');
  const m0 = String(mine != null ? mine : '');
  const t0 = String(theirs != null ? theirs : '');
  if (m0 === t0 || t0 === b0) return { ok: true, text: m0 };
  if (m0 === b0) return { ok: true, text: t0 };

  const O = splitLines(b0);
  const A = splitLines(m0);
  const B = splitLines(t0);
  const ma = lcsMatch(O, A);
  const mb = lcsMatch(O, B);

  const out = [];
  const conflicts = [];
  let i = 0;
  let j = 0;
  let k = 0;
  for (;;) {
    // The next base line both sides kept: the end of this unstable stretch.
    let o = i;
    while (o < O.length && !(ma[o] >= 0 && mb[o] >= 0)) o++;
    const aEnd = o < O.length ? ma[o] : A.length;
    const bEnd = o < O.length ? mb[o] : B.length;
    if (i < o || j < aEnd || k < bEnd) {
      const oc = O.slice(i, o);
      const ac = A.slice(j, aEnd);
      const bc = B.slice(k, bEnd);
      if (sameLines(ac, oc)) out.push(...bc);
      else if (sameLines(bc, oc) || sameLines(ac, bc)) out.push(...ac);
      else {
        conflicts.push({ line: out.length, base: oc, mine: ac, theirs: bc });
        out.push(...ac);
      }
    }
    if (o >= O.length) break;
    out.push(O[o]);
    i = o + 1;
    j = aEnd + 1;
    k = bEnd + 1;
  }
  const text = out.join('\n');
  return conflicts.length ? { ok: false, text, conflicts } : { ok: true, text };
}

/** `text` in lines that keep their '\n', so offsets add up to the exact text. */
function lineTokens(text) {
  const out = [];
  let from = 0;
  for (;;) {
    const nl = text.indexOf('\n', from);
    if (nl < 0) {
      if (from < text.length) out.push(text.slice(from));
      return out;
    }
    out.push(text.slice(from, nl + 1));
    from = nl + 1;
  }
}

/**
 * The line-level changes that turn `a` into `b`, as editor changes
 * ({ from, to, insert } in offsets of `a`, ascending, non-overlapping). An
 * external change goes into the editor as exactly these, so the cursor, folds
 * and incremental parse outside them are untouched.
 */
export function textChanges(a, b) {
  const s = String(a != null ? a : '');
  const t = String(b != null ? b : '');
  if (s === t) return [];
  const A = lineTokens(s);
  const B = lineTokens(t);
  const match = lcsMatch(A, B);
  const changes = [];
  let i = 0;
  let j = 0;
  let pos = 0;
  while (i < A.length || j < B.length) {
    if (i < A.length && match[i] === j) {
      pos += A[i].length;
      i += 1;
      j += 1;
      continue;
    }
    let i2 = i;
    let removed = 0;
    while (i2 < A.length && match[i2] < 0) {
      removed += A[i2].length;
      i2 += 1;
    }
    const j2 = i2 < A.length ? match[i2] : B.length;
    changes.push({ from: pos, to: pos + removed, insert: B.slice(j, j2).join('') });
    pos += removed;
    i = i2;
    j = j2;
  }
  return changes;
}

/** Apply `textChanges` output to `a` (what the editor does; used by tests). */
/**
 * `name` with " (conflicted copy)" before its extension, numbered when that
 * is taken (`taken`: a Set of paths). Keep both, and two files that met at
 * one path in a sync, are named by this one rule.
 */
export function conflictedCopyName(name, taken) {
  const slash = name.lastIndexOf('/');
  const dir = slash === -1 ? '' : name.slice(0, slash + 1);
  const leaf = name.slice(slash + 1);
  const dot = leaf.lastIndexOf('.');
  const stem = dot > 0 ? leaf.slice(0, dot) : leaf;
  const ext = dot > 0 ? leaf.slice(dot) : '';
  for (let n = 1; ; n++) {
    const candidate = dir + stem + (n === 1 ? ' (conflicted copy)' : ' (conflicted copy ' + n + ')') + ext;
    if (!taken.has(candidate)) return candidate;
  }
}

export function applyChanges(a, changes) {
  let out = String(a != null ? a : '');
  for (let n = changes.length - 1; n >= 0; n--) {
    const c = changes[n];
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}
