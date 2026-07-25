// Harpoon model — the pure layer that structures the Harpoon shim's proof
// JSON into records the UI renders. BelJar is the intelligence: the shim hands
// us a goal type and the meta/computation contexts as pretty-printed text, and
// THIS module parses the binders into { name, type } the same way hole-report.mjs
// structures the `## Holes ##` report. No DOM, no Beluga — pure + tested.
//
// Subgoal shape from the shim: { id, label, goal, ctxText, metaText }.
// Normalized shape: { id, label, goal, ctx:[{name,type}], meta:[{name,type}] }.

// Split a Harpoon context render ("x : [ |- nat],\ny : [ |- nat]") into binders.
// Entries are comma- or newline-separated; each is "name : type". A type may
// itself contain commas inside brackets (e.g. "[g, x:tm |- tm]"), so we split
// only on top-level separators (depth 0 w.r.t. (), [], {}).
export function parseBinders(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return [];
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));

  const out = [];
  for (const raw of parts) {
    const entry = raw.trim();
    if (!entry) continue;
    // Split on the FIRST top-level colon into name : type.
    let d = 0;
    let colon = -1;
    for (let i = 0; i < entry.length; i += 1) {
      const c = entry[i];
      if (c === '(' || c === '[' || c === '{') d += 1;
      else if (c === ')' || c === ']' || c === '}') d = Math.max(0, d - 1);
      else if (c === ':' && d === 0) { colon = i; break; }
    }
    if (colon === -1) {
      out.push({ name: entry, type: '' });
    } else {
      out.push({ name: entry.slice(0, colon).trim(), type: entry.slice(colon + 1).trim() });
    }
  }
  return out;
}

// Normalize one raw subgoal record into structured binders.
export function normalizeSubgoal(sg) {
  if (!sg || typeof sg !== 'object') return null;
  return {
    id: String(sg.id != null ? sg.id : ''),
    label: String(sg.label != null ? sg.label : (sg.id != null ? sg.id : '')),
    goal: String(sg.goal != null ? sg.goal : ''),
    ctx: parseBinders(sg.ctxText),
    meta: parseBinders(sg.metaText),
  };
}

// Normalize a full proof model returned by the shim (start/state/tactic/undo).
// Returns { ok, name, complete, error, subgoals:[normalized] }.
export function normalizeProofModel(model) {
  if (!model || typeof model !== 'object') {
    return { ok: false, error: 'no-model', subgoals: [] };
  }
  if (!model.ok) {
    return {
      ok: false,
      error: String(model.error || 'unknown'),
      complete: !!model.complete,
      subgoals: [],
    };
  }
  const subgoals = Array.isArray(model.subgoals)
    ? model.subgoals.map(normalizeSubgoal).filter(Boolean)
    : [];
  return {
    ok: true,
    name: model.name != null ? String(model.name) : null,
    complete: !!model.complete || subgoals.length === 0,
    error: null,
    subgoals,
  };
}

// Which tactics apply to a subgoal, from its structured shape. Mirrors the
// inline-hole logic (canIntro / splittable vars) so the Lab palette is gated the
// same way. Split/solve targets come from BOTH the meta-context (cD) and the
// computation context (cG): a boxed comp hypothesis like `x : [⊢ dual A A']`
// lives in cG, and is exactly what you case-split to advance an induction. Each
// target carries `where` ('meta'|'comp') so the tactic dispatch tells the shim
// which context to elaborate the scrutinee from.
export function splitTargets(sg) {
  if (!sg) return [];
  const out = [];
  for (const b of (sg.meta || [])) {
    if (b && b.name) out.push({ name: b.name, where: 'meta' });
  }
  for (const b of (sg.ctx || [])) {
    if (b && b.name) out.push({ name: b.name, where: 'comp' });
  }
  return out;
}

export function applicableTactics(sg) {
  if (!sg) return { intros: false, split: [], solve: [], auto: true };
  const goal = String(sg.goal || '');
  const intros = /->|=>|→|\{[^}]*\}/.test(goal); // arrow or Pi-box quantifier
  const targets = splitTargets(sg);
  // `solve` (fill with an in-scope var) stays meta-only: the shim's solve path
  // uses an mvar witness. `split` now covers cG hypotheses too.
  const solve = targets.filter((t) => t.where === 'meta').map((t) => t.name);
  return { intros, split: targets, solve, auto: true };
}
