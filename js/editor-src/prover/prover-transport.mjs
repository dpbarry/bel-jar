// prover-transport.mjs — CONTEXT TRANSPORT, computed rather than guessed.
//
// WHY THIS EXISTS (master plan entries 41/42, and the 2026-08-18 rejection census).
// The planner binds ONE ambient context: `goalParts = splitCtx(goalBox.ctx)`
// (`prover-moves.mjs:368`). Every fact is forced into it at admission time — a shorter
// context becomes `weaken:true`, a longer one becomes `extras`, and if those extras contain
// a `block` the fact is DROPPED (`prover-moves.mjs:441`). Measured: 160 drops across 16 of 40
// sampled targets, 7 of them STUCK:no-move.
//
// Entry 41 named two homes for the fix and preferred the bounded one; entry 42 built it and
// measured 40% reach / ZERO payoff. The remaining home — "extend the planner to per-argument
// contexts (correct, invasive — its single-context assumption is load-bearing throughout)" —
// has never been attempted. This module is its foundation.
//
// The 2026-08-18 census of why offered recursive calls are rejected: 58% context transport
// (wrong spelling for the target context), 19% malformed emission, 15% arity, 8% termination.
// The engine emits `X2` where `[ |- lam (\x. M')]` is required because it has no way to ASK
// what transports a term from one context to another. That question is this file.
//
// ⛔ NOT WIRED IN. Pure functions + no imports from the planner, so it can be unit-tested
// before anything load-bearing changes (§6.3: count the pieces, one toggle, or don't start).

// A context is a list of PARTS: `g, x:tm, b:block (y:term, u:aeq y y)` ->
//   [{kind:'var', name:'g'}, {kind:'decl', name:'x', type:'tm'},
//    {kind:'block', name:'b', fields:[{name:'y',type:'term'},{name:'u',type:'aeq y y'}]}]
// The leading context VARIABLE (schema-bound, e.g. `g`) is a part like any other; what makes
// it special is that it is opaque — nothing may be projected out of it.

const BLOCK_RE = /^\s*([\p{L}_][\p{L}\p{N}_']*)\s*:\s*block\s*\((.*)\)\s*$/su;

// Split a context string on TOP-LEVEL commas (a block's own commas are nested).
export function splitParts(ctxStr) {
  const s = String(ctxStr == null ? '' : ctxStr).trim();
  if (!s) return [];
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    if (ch === ',' && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parsePart(raw) {
  const s = String(raw || '').trim();
  const bm = BLOCK_RE.exec(s);
  if (bm) {
    const fields = splitParts(bm[2]).map((f) => {
      const c = f.indexOf(':');
      return c < 0 ? null : { name: f.slice(0, c).trim(), type: f.slice(c + 1).trim() };
    });
    return fields.some((f) => !f)
      ? { kind: 'opaque', name: s }
      : { kind: 'block', name: bm[1], fields };
  }
  const c = s.indexOf(':');
  if (c < 0) return { kind: 'var', name: s };            // a context variable: `g`
  return { kind: 'decl', name: s.slice(0, c).trim(), type: s.slice(c + 1).trim() };
}

export function parseCtx(ctxStr) { return splitParts(ctxStr).map(parsePart); }

const sameType = (a, b) => String(a || '').replace(/\s+/g, ' ').trim() === String(b || '').replace(/\s+/g, ' ').trim();

// Do two parts denote the same assumption? Names may differ (α-equivalence); for a context
// VARIABLE the name IS the identity, since nothing else distinguishes it.
function samePart(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'var') return a.name === b.name;
  if (a.kind === 'decl') return sameType(a.type, b.type);
  if (a.kind === 'block') {
    return a.fields.length === b.fields.length
      && a.fields.every((f, i) => sameType(f.type, b.fields[i].type));
  }
  return false;
}

// ── the question the planner cannot currently ask ────────────────────────────
//
// transport(from, to) — how do I spell a term that lives in context `from` so it can be used
// at context `to`? Returns
//   { ok:true, sub, kind }   sub = the substitution text, e.g. '..' or '.., b.1, b.2'
//   { ok:false, why }        with a REASON, so a caller can report an honest decline
//                            instead of silently dropping the fact (the current behaviour).
//
// Cases, in the order they arise in the corpus:
//   IDENTITY    from == to                          -> no substitution needed
//   WEAKENING   from is a prefix of to              -> '..'  (the shipped `weaken` flag)
//   PROJECTION  to extends from with BLOCKs         -> '.., b.1, b.2'  — the case that is
//               currently DROPPED, and the shape half the hard residue needs (Specimen D)
//   EXTENSION   to extends from with plain decls    -> '.., x'
export function transport(fromCtx, toCtx) {
  // Reach counter (§13: size by the mechanism's OWN predicate). A near-zero A/B delta is
  // meaningless unless the new path actually fired — that is the trap this whole day kept
  // falling into. `__transportStats` is a no-op unless an instrument installs it.
  const S = globalThis.__transportStats;
  const tally = (r) => { if (S) S[r.ok ? r.kind : 'decline:' + r.why] = (S[r.ok ? r.kind : 'decline:' + r.why] || 0) + 1; return r; };
  const from = Array.isArray(fromCtx) ? fromCtx : parseCtx(fromCtx);
  const to = Array.isArray(toCtx) ? toCtx : parseCtx(toCtx);

  if (from.length === to.length && from.every((p, i) => samePart(p, to[i]))) {
    return tally({ ok: true, sub: null, kind: 'identity' });
  }
  // Longest shared prefix. The source may be LONGER than the target (the projection case:
  // three flat parts collapsing into two, `h,y,u` -> `h,b:block(y,u)`), so length alone
  // decides nothing.
  let prefix = 0;
  while (prefix < from.length && prefix < to.length && samePart(from[prefix], to[prefix])) prefix += 1;
  if (prefix === 0 && from.length && to.length) {
    return tally({ ok: false, why: 'prefix-mismatch', detail: 'no shared prefix' });
  }
  // ⚠️ The first version of this function encoded the WRONG model — "to extends from, so
  // list to's extra binders" — and its tests passed because they asserted that same
  // invention. The corpus spelling is the authority (Specimen D):
  //
  //   let [h, b:block (y:term, _t:aeq y y) |- AE[.., b.1, b.2]] = ref' tr1 in
  //
  // `AE` lives in the FLAT context `h, y:term, _t:aeq y y`; the substitution maps those two
  // flat binders onto the BLOCK's projections in the target. So the projection case is
  // "the target's block FLATTENS to the source's tail", not "the target is longer".
  const fromExtra = from.slice(prefix);
  const toExtra = to.slice(prefix);

  // WEAKENING: the source has nothing past the shared prefix, so `..` (the identity
  // weakening substitution) carries it in. `..` ALREADY means "drop the new binders" —
  // naming them (`.., x`) would be a different, wrong substitution.
  if (!fromExtra.length) return tally({ ok: true, sub: '..', kind: 'weakening' });

  // PROJECTION: the target extends the shared prefix by exactly one block whose fields
  // match the source's remaining binders, in order.
  if (toExtra.length === 1 && toExtra[0].kind === 'block'
      && toExtra[0].fields.length === fromExtra.length
      && fromExtra.every((p, i) => p.kind === 'decl' && sameType(p.type, toExtra[0].fields[i].type))) {
    const b = toExtra[0].name;
    const projs = toExtra[0].fields.map((_, i) => `${b}.${i + 1}`);
    return tally({ ok: true, sub: `.., ${projs.join(', ')}`, kind: 'projection' });
  }

  // Record the actual SHAPE of a decline, so "it never fires" can become "here is what it
  // is actually asked to transport". A calculator that declines 100% of the time is either
  // wrong or aimed at a shape that does not occur; only the pairs can say which.
  if (globalThis.__transportDecl) {
    globalThis.__transportDecl.push({
      from: from.map((p) => p.kind + (p.kind === 'block' ? `(${p.fields.length})` : '')).join(','),
      to: to.map((p) => p.kind + (p.kind === 'block' ? `(${p.fields.length})` : '')).join(','),
      fromExtra: fromExtra.map((p) => p.kind).join(','), toExtra: toExtra.map((p) => p.kind).join(','),
    });
  }
  return tally({ ok: false, why: 'no-transport', detail: `${fromExtra.length} source extras vs ${toExtra.length} target` });
}

// Spell `term` for use at `toCtx`, given it lives at `fromCtx`. Returns null when no
// transport exists — an HONEST decline the caller can report, not a silent drop.
export function spellAt(term, fromCtx, toCtx) {
  const t = transport(fromCtx, toCtx);
  if (!t.ok) return null;
  if (!t.sub) return String(term);
  return `${String(term)}[${t.sub}]`;
}
