// split-skeleton.mjs — the case split BelJar builds from its own model, as pure
// functions. Moved out of hole-actions.mjs (2026-10-03) so that code with no editor and
// no DOM can use the same split the editor's Split command makes: the case-completion
// worker builds the missing arms of a proof from it. Behaviour is unchanged.

import {
  decomposeContextual,
  headOfConclusion,
  enumerateLFConstructors,
  schemaAdmittedTypes,
  schemaInfo,
  parameterTermFor,
  buildSplitSkeleton,
} from './hole-split.mjs';

// Names already in scope at the hole (context + meta vars) — so generated fresh
// metavars don't collide.
export function usedNamesAt(hole) {
  const names = [];
  for (const c of (hole.ctx || [])) if (c && c.name) names.push(c.name);
  for (const m of (hole.meta || [])) if (m && m.name) names.push(m.name);
  return names;
}

// Candidate schema names for context variable `ctxVar`, MOST-AUTHORITATIVE FIRST:
// the hole's own meta-context (`g : ctx`, scoped to THIS hole) leads; then every
// distinct `(g : SCHEMA)` binder in the assembled code. A program may bind the same
// name to DIFFERENT schemas in different recs (cp_lemmas binds `g:ctx` for str_hyp
// AND `g:nctx` for str_lin), so we must NOT grab the first global match — the caller
// picks the candidate whose schema actually fits the split's head type.
export function candidateSchemasFor(code, hole, ctxVar) {
  const out = [];
  const add = (s) => { if (s && !out.includes(s)) out.push(s); };
  if (!ctxVar) return out;
  const meta = (hole.meta || []).find((m) => m && m.name === ctxVar);
  if (meta && meta.type) add(String(meta.type).trim());
  const re = new RegExp('\\(\\s*' + ctxVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*([A-Za-z_][A-Za-z0-9_\']*)', 'g');
  const src = String(code || '');
  let m;
  while ((m = re.exec(src)) !== null) add(m[1]);
  return out;
}

// ── Step 1: BelJar-native split skeleton from our model ─────────────────────
// Build the case-split skeleton from BelJar's own model: enumerate the scrutinee
// head type's constructors across the WHOLE development (the assembled `code`
// includes the prelude, so cross-file definitions are seen), and add a schema-aware
// parameter-variable branch (`#p.h[..]` block projection) when the context can hold
// a variable of that type — e.g. `hyp` has NO constructors but a hypothesis comes
// from the context (the str_hyp case). Returns the case text, or null when BelJar
// can't model the split (→ cascade to Beluga). `info` (optional out-param) is filled
// with diagnostics for an honest-decline notification.
// `extra` passes builder options through: `{ annotate: false }` gives the bare variant
// of every arm (an annotation's index variables can be rejected by strengthening or
// block shapes, so a caller offers both and the checker arbitrates).
export function belJarSplit(code, hole, varName, info, extra = {}) {
  const note = info || {};
  const entry = (hole.ctx || []).find((c) => c && c.name === varName);
  if (!entry) { note.reason = 'no-such-var'; return null; }
  note.scrutType = entry.type;
  const decomp = decomposeContextual(entry.type);
  if (!decomp) { note.reason = 'non-contextual'; return null; }
  const head = headOfConclusion(decomp.concl);
  if (!head) { note.reason = 'no-head'; return null; }
  note.head = head;

  // Constructors of the head family — across the whole development (assembled code).
  const ctors = enumerateLFConstructors(code, head) || [];
  note.ctorCount = ctors.length;

  // Schema of the leading context variable → block-projection parameter pattern.
  // A name may bind to DIFFERENT schemas in different recs, so pick the candidate
  // whose schema actually admits the head type (a fitting `#p`/`#p.field`); if none
  // fits (a pure constructor split), keep the first candidate for context display.
  const leadCtxVar = decomp.ctx.split(',')[0]?.trim().split(/[\s:]/)[0];
  const candidates = candidateSchemasFor(code, hole, leadCtxVar);
  let schema = null;
  let schemaName = null;
  for (const name of candidates) {
    const info2 = schemaInfo(code, name);
    if (parameterTermFor(head, info2)) { schema = info2; schemaName = name; break; }
  }
  if (!schema && candidates.length) { schemaName = candidates[0]; schema = schemaInfo(code, schemaName); }
  note.schema = schemaName;
  const schemaTypes = schemaName ? schemaAdmittedTypes(code, schemaName) : null;

  const text = buildSplitSkeleton(varName, decomp.ctx, ctors, {
    head,
    schema,
    schemaTypes,
    usedNames: usedNamesAt(hole),
    code, // fixity source: arm annotations must respect --infix declarations
    ...extra,
  });
  if (!text) note.reason = ctors.length ? 'no-pattern' : 'no-constructors-no-param';
  return text;
}
