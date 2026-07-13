// Hole extraction — Beluga prints a `## Holes ##` report DURING reconstruction, so
// every check/load output already carries it (no prover command, no rebuild; see
// the Theme C plan). This module parses that report into structured holes. The
// reported line/col are 1-based and point AT the `?` (matching the grammar's
// `Hole` node). Positions are doc-relative once the caller has line-shifted the
// text (settlement's shiftCheckerOutput), exactly as for diagnostics.

function stripAnsi(s) {
  return String(s != null ? s : '')
    .replace(/\r\n/g, '\n')
    .replace(/\[[0-9;]*m/g, '');
}

const HOLE_HEAD =
  /^File\s+"([^"]*)"\s*,\s*line\s+(\d+)\s*,\s*column\s+(\d+)\s*:\s*Hole number\s+(\d+)\s*,\s*(.*)$/i;
const CTX_ENTRY = /^([^\s:]+)\s*:\s*(.+)$/;

// Parse the `## Holes ##` report into [{ file, line, col, number, name, goal,
// ctx:[{name,type}], meta:[{name,type}], index }] in source order. `number` is
// Beluga's session-global counter (NOT 0-based per check) — `index` renumbers by
// source order for the UI.
export function parseHoles(rawOutput) {
  const lines = stripAnsi(rawOutput).split('\n');
  const holes = [];
  let cur = null;
  let section = null; // 'meta' | 'comp' | null
  // A DEEP type wraps across report lines (`X :` then an indented multi-line
  // `(g, x : name, … |-` continuation). Accumulate until brackets balance —
  // otherwise the entry is dropped AND its tail line parses as a bogus entry.
  let pending = null; // { name, type, section }
  let goalOpen = false;
  const depth = (s) => {
    let d = 0;
    for (const ch of String(s)) {
      if (ch === '(' || ch === '[' || ch === '{') d += 1;
      else if (ch === ')' || ch === ']' || ch === '}') d -= 1;
    }
    return d;
  };
  const commitPending = () => {
    if (pending && cur && pending.type.trim()) {
      (pending.section === 'meta' ? cur.meta : cur.ctx)
        .push({ name: pending.name, type: pending.type.replace(/\s+/g, ' ').trim() });
    }
    pending = null;
  };
  const flush = () => {
    commitPending();
    goalOpen = false;
    if (cur) holes.push(cur);
    cur = null;
    section = null;
  };

  for (const raw of lines) {
    const head = raw.match(HOLE_HEAD);
    if (head) {
      flush();
      const name = head[5].trim();
      cur = {
        file: head[1],
        line: parseInt(head[2], 10),
        col: parseInt(head[3], 10),
        number: parseInt(head[4], 10),
        name: !name || name === '<anonymous>' ? null : name,
        goal: null,
        ctx: [],
        meta: [],
      };
      continue;
    }
    if (!cur) continue;
    const t = raw.trim();
    if (goalOpen) {
      // 'block' mode: the goal STARTED on the line AFTER `Goal:` (multi-line Pi
      // types print that way — `{g : ctx}\n {h : ctx}\n {$W : …} [g ⊢ …] -> …`).
      // Each line may be bracket-balanced on its own, so depth can't close the
      // block; a blank line or a new section/hole marker does.
      if (goalOpen === 'block') {
        if (!t || /^(Meta-context:|Computation context:|Variable of this type:)/i.test(t) || t.startsWith('##')) {
          goalOpen = false;
          if (!t) continue;
        } else {
          cur.goal = `${cur.goal || ''} ${t}`.replace(/\s+/g, ' ').trim();
          continue;
        }
      } else if (t) {
        // 'depth' mode: a single-line goal that opened brackets — close on balance.
        cur.goal = `${cur.goal || ''} ${t}`.replace(/\s+/g, ' ').trim();
        if (depth(cur.goal) <= 0) goalOpen = false;
        continue;
      }
    }
    if (/^Meta-context:/i.test(t)) { commitPending(); section = 'meta'; continue; }
    if (/^Computation context:/i.test(t)) { commitPending(); section = 'comp'; continue; }
    const goal = t.match(/^Goal:\s*(.*)$/i);
    if (goal) {
      commitPending();
      cur.goal = goal[1].trim() || null;
      section = null;
      goalOpen = cur.goal ? (depth(cur.goal) > 0 ? 'depth' : false) : 'block';
      continue;
    }
    if (/^Variable of this type:/i.test(t)) { commitPending(); section = null; continue; }
    if (t.startsWith('##')) { flush(); continue; } // left the holes section
    if ((section === 'meta' || section === 'comp') && t) {
      if (pending) {
        pending.type += ` ${t}`;
        if (pending.type.trim() && depth(pending.type) <= 0) commitPending();
        continue;
      }
      const e = t.match(CTX_ENTRY);
      if (e) {
        const type = e[2].trim();
        if (depth(type) > 0) pending = { name: e[1], type, section };
        else (section === 'meta' ? cur.meta : cur.ctx).push({ name: e[1], type });
        continue;
      }
      // `X :` alone — the whole type follows on continuation lines.
      const open = t.match(/^([^\s:]+)\s*:\s*$/);
      if (open) pending = { name: open[1], type: '', section };
    }
  }
  flush();
  // Source order, then renumber 0..N-1 for the UI (stable across checks).
  holes.sort((a, b) => a.line - b.line || a.col - b.col);
  holes.forEach((h, i) => { h.index = i; });
  return holes;
}

// True when the raw output even has a holes section (cheap pre-check).
export function hasHoleReport(rawOutput) {
  return /##\s*Holes:/.test(String(rawOutput || ''));
}

// SYNTACTIC holes from the parse tree — known the instant the `?` is parsed, with
// NO checker round-trip. A `?` is a `Hole` grammar node, so we just walk for it.
// Returns [{ line, col, from, to, name, index }] in source order (doc-relative,
// 1-based line/col like the checker report) — but WITHOUT goal/ctx/meta (those need
// reconstruction; the engine merges the checker's rich data in when it settles).
// Memoized per Lezer tree so repeated calls (gutter, inspector, panel) are free.
const treeHoleCache = new WeakMap();
export function parseHolesFromTree(tree, doc) {
  if (!tree || !doc) return [];
  const cached = treeHoleCache.get(tree);
  if (cached) return cached;
  const holes = [];
  const cursor = tree.cursor();
  do {
    if (cursor.name !== 'Hole') continue;
    const from = cursor.from;
    const to = cursor.to;
    let lineObj;
    try { lineObj = doc.lineAt(from); } catch (_) { continue; }
    const name = doc.sliceString(from + 1, to).trim(); // text after `?`
    holes.push({
      line: lineObj.number,
      col: from - lineObj.from + 1, // 1-based column of the `?`
      from,
      to,
      name: name ? '?' + name : null,
    });
  } while (cursor.next());
  holes.sort((a, b) => a.from - b.from);
  holes.forEach((h, i) => { h.index = i; });
  treeHoleCache.set(tree, holes);
  return holes;
}
