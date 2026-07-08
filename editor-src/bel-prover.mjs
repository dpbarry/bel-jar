// BelJar's proof-search engine — BelJar IS the prover; Harpoon is an oracle.
//
// This is the inversion away from "wrap Harpoon's REPL". A proof is a TREE we
// build over BelJar's own semantic model (deep parse / AST / totality / schemas).
// We reason from the FUNDAMENTALS of what a Beluga proof is — "what does this
// TYPE admit here?" — not from any particular theorem's shape. The same engine
// must close dual_sym, dual_uniq, the typing lemmas, … because they are all just
// structural induction + case analysis + direct inhabitation over the model.
//
// The principled moves, each derived from the type structure itself:
//   • goal is an arrow/Pi  → introduce (the only inhabitant shape is fn/mlam)
//   • a hypothesis is an inductive object → case-analyse it (coverage over its
//     constructors, which our AST enumerates; schemas give the parameter cases)
//   • goal head is directly inhabited (hypothesis / constructor / a call result)
//     → inhabit it
//   • a subgoal is a structurally-smaller instance of the theorem under proof →
//     invoke the IH (recursion, guarded by the totality measure we parse)
//
// Every assembled step is certified by the checker ORACLE before acceptance, so
// the search never commits a wrong move. When the principled moves are exhausted
// on a node (needs a real lemma / non-structural induction), we STOP and surface
// a partial tree with an honest reason — never a silent dead end.
//
// ANTI-OVERFIT: nothing here may branch on a specific theorem (no "dual"…). The
// matcher operates on the GENERAL type/AST. If a special-case creeps in, it's a
// bug in the reasoning, not a feature.
//
// PURE module (data in, data out): no DOM, no Beluga session. The live wiring
// (oracle calls, insertion) lives in the action layer; the search takes an
// injected `verify` oracle so it is fully unit-testable.

// ── Computation-type signature parsing ───────────────────────────────────────
// A theorem's type is a computation type: a (possibly dependent) chain of
// premises to a conclusion, e.g.
//   [ |- dual A A'] -> [ |- dual A' A]
//   {g:ctx} [g |- tm] -> [g |- tp] -> [g |- oft]
// Split it into ordered premises + the final conclusion, respecting brackets so
// arrows inside boxes/braces don't split. Dependent binders ({x:T}, (g:ctx)) are
// captured as premises tagged `dependent` (they bind a meta/context variable).
export function parseCompType(typeStr) {
  const s = String(typeStr == null ? '' : typeStr).trim();
  if (!s) return null;
  const parts = splitArrowSpine(s);
  if (!parts.length) return null;
  const premises = parts.slice(0, -1).map(classifyPremise);
  return { premises, conclusion: parts[parts.length - 1].trim(), raw: s };
}

// Split a computation type into spine segments. Two splitters, both bracket-aware
// so arrows/binders inside `[ … ]` boxes don't split:
//   1. TOP-LEVEL `->`/`→` arrows separate premises from the conclusion.
//   2. A LEADING dependent binder `{…}` / `(…)` at depth 0 is ITS OWN segment
//      (it binds a meta/context variable, then the rest follows with no arrow,
//      e.g. `(g:ctx) [g |- tm] -> …` ⇒ `(g:ctx)` | `[g |- tm]` | …).
function splitArrowSpine(s) {
  const raw = [];
  let depthSquare = 0;
  let depthParen = 0;
  let depthBrace = 0;
  let start = 0;
  const flush = (end) => { const seg = s.slice(start, end).trim(); if (seg) raw.push(seg); };
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '[') depthSquare += 1;
    else if (c === ']') depthSquare -= 1;
    else if (c === '(') depthParen += 1;
    else if (c === ')') depthParen -= 1;
    else if (c === '{') depthBrace += 1;
    else if (c === '}') depthBrace -= 1;
    const top = depthSquare === 0 && depthParen === 0 && depthBrace === 0;
    // A dependent binder that just CLOSED at depth 0 ends its own segment when it
    // started this segment (start..i is `{…}`/`(…)` with nothing before it).
    if (top && (c === '}' || c === ')')) {
      const head = s.slice(start).trimStart();
      if (head[0] === '{' || head[0] === '(') { flush(i + 1); start = i + 1; continue; }
    }
    if (!top) continue;
    if (c === '-' && s[i + 1] === '>') { flush(i); start = i + 2; i += 1; }
    else if (c === '→') { flush(i); start = i + 1; }
  }
  flush(s.length);
  return raw;
}

// Classify one premise segment: a dependent binder ({x:T} explicit Pi, (g:ctx)
// context) vs an ordinary boxed/computation premise. We keep the raw text plus,
// for boxed premises, the decomposed contextual type so the matcher can reason
// about its conclusion head without re-parsing.
function classifyPremise(seg) {
  const t = seg.trim();
  if (t[0] === '{') {
    const inner = t.slice(1, t.indexOf('}') >= 0 ? t.indexOf('}') : t.length).replace(/^\{|\}$/g, '');
    const name = (inner.split(':')[0] || '').trim();
    return { kind: 'pi', raw: t, binder: name };
  }
  if (t[0] === '(') {
    const inner = t.slice(1, t.lastIndexOf(')') >= 0 ? t.lastIndexOf(')') : t.length);
    const name = (inner.split(':')[0] || '').trim();
    return { kind: 'ctx', raw: t, binder: name };
  }
  return { kind: 'box', raw: t };
}

// ── Totality measure ─────────────────────────────────────────────────────────
// The recursion guard. `/ total /` (no arg) = trust-me/unchecked; `/ total N /`
// = the N-th EXPLICIT argument decreases; `/ total f arg /` = the named argument
// `arg` decreases (f is the function name). We need the decreasing argument so
// the IH may only be applied to a STRUCTURALLY-SMALLER piece of it — the thing
// that makes the search (and the proof) terminate.
//
// Returns { kind: 'none'|'index'|'named'|'bare', index?, name? } or null when
// there is no totality annotation at all (then we must NOT recurse blindly).
export function parseTotality(declOrBodyText) {
  const s = String(declOrBodyText == null ? '' : declOrBodyText);
  const m = /\/\s*total\b([^/]*)\//.exec(s);
  if (!m) return null;
  const arg = m[1].trim();
  if (!arg) return { kind: 'bare' };
  // `/ total 1 /` — positional.
  const num = /^(\d+)$/.exec(arg);
  if (num) return { kind: 'index', index: parseInt(num[1], 10) };
  // `/ total d (unique3 g e t t' d) /` — name then parenthesized index list.
  const paren = arg.indexOf('(');
  if (paren > 0) {
    const name = arg.slice(0, paren).trim();
    if (name) return { kind: 'named', name };
  }
  // `/ total f x /` (function-name then the decreasing argument) or `/ total x /`.
  const toks = arg.split(/\s+/).filter(Boolean);
  if (toks.length >= 2) return { kind: 'named', name: toks[toks.length - 1], fn: toks[0] };
  if (toks.length === 1) return { kind: 'named', name: toks[0].replace(/\)$/, '') };
  return { kind: 'bare' };
}

// ── The induction-hypothesis matcher (the genuine intelligence gap) ──────────
// Given the theorem under proof (its parsed comp type + totality measure) and a
// SUBGOAL produced by a case-split — together with the binders that split
// introduced (each carrying which split-scrutinee subterm it came from) — decide
// whether the IH applies, i.e. whether some introduced subterm has the type of
// the theorem's decreasing premise, so that calling the theorem on it yields a
// term usable toward the subgoal.
//
// This is GENERAL: it matches the theorem's decreasing-premise CONCLUSION HEAD
// against an available hypothesis' conclusion head (the structural-recursion
// pattern), never a specific theorem. Returns the applicable IH applications as
// { onBinder, name } where `name` is the theorem name and `onBinder` is the
// in-scope hypothesis to recurse on, or [] when none apply.
export function inductionApplications(thm, subgoalHyps) {
  if (!thm || !thm.compType) return [];
  // No totality annotation ⇒ no certified structural measure ⇒ the IH is NOT
  // safe to apply (the recursion might not terminate). Refuse.
  if (!thm.totality) return [];
  const measured = decreasingPremise(thm);
  if (!measured) return []; // no measure ⇒ no safe structural recursion
  const wantHead = boxedConclusionHead(measured.raw);
  if (!wantHead) return [];
  const out = [];
  for (const h of (subgoalHyps || [])) {
    // Only recurse on a hypothesis that (a) matches the decreasing premise's
    // family head AND (b) is a STRICT subterm of the original scrutinee (the
    // structural guard the totality measure certifies). `fromScrutinee` is set by
    // the split layer for binders born of decomposing the scrutinee.
    if (!h || !h.fromScrutinee) continue;
    const head = boxedConclusionHead(h.type);
    if (head && head === wantHead) out.push({ onBinder: h.name, name: thm.name });
  }
  return out;
}

// The premise of the theorem that the totality measure says decreases. For an
// index measure it's the N-th BOX premise; for a named measure we fall back to
// the first box premise whose binder matches (the signature rarely names box
// premises, so index is the common path); bare ⇒ first box premise (best-effort,
// still guarded by fromScrutinee at application).
function decreasingPremise(thm) {
  const boxes = thm.compType.premises.filter((p) => p.kind === 'box');
  if (!boxes.length) return null;
  const tot = thm.totality;
  if (tot && tot.kind === 'index') return boxes[Math.max(0, tot.index - 1)] || boxes[0];
  return boxes[0];
}

// The conclusion head of a boxed type `[ Γ |- head … ]` (or bare `[ |- head ]`).
// Reused matcher primitive — kept here (not imported) so this module stays a pure
// leaf; the richer decomposition lives in bel-hole-split.mjs for the split layer.
// The turnstile is searched OUTSIDE nested boxes (a ctype application
// `Result' [g ⊢ P] [g, x:name ⊢ Q]` has no top-level turnstile — its head is the
// family, not the P inside its first index), and a Symbol head (`⇛`) counts.
export function boxedConclusionHead(boxedTypeStr) {
  const t = String(boxedTypeStr == null ? '' : boxedTypeStr).trim();
  if (!t) return null;
  const inner = (t[0] === '[' && t[t.length - 1] === ']') ? t.slice(1, -1) : t;
  let masked = inner;
  for (let guard = 0; guard < 4 && /\[[^\][]*\]/.test(masked); guard += 1) {
    masked = masked.replace(/\[[^\][]*\]/g, (s) => ' '.repeat(s.length));
  }
  const mi = masked.search(/\|-|⊢|\|/);
  if (mi >= 0) {
    const m = inner.slice(mi).match(/(?:\|-|⊢|\|)\s*([\p{L}\p{S}_][\p{L}\p{N}\p{S}_'.]*)/u);
    if (m) return m[1];
  }
  // No top-level turnstile: the whole thing is the conclusion (bare LF/ctype).
  const h = inner.trim().match(/^([\p{L}\p{S}_][\p{L}\p{N}\p{S}_'.]*)/u);
  return h ? h[1] : null;
}

// ── The search loop — BelJar building the proof tree ─────────────────────────
// Generate-and-verify over BelJar's model. We assemble candidate proof text from
// the principled moves and let the CHECKER ORACLE certify each step, so a wrong
// move is rejected immediately and we only deepen verified branches. The result
// is a proof TREE (`{goal, move, rationale, children, status, reason?}`) that
// powers auto-solve AND the visual tree / explain / suggest features.
//
// `ctx` (the injected world) provides — all PURE except `verify`:
//   moves(hole)            → ordered candidate moves for a hole, each:
//                            { kind:'fill'|'intro'|'split'|'recurse',
//                              text,            // the body text to splice over `?`
//                              rationale,       // human "why" for explain/suggest
//                              opensHoles? }    // does this move leave sub-holes
//   verify(body)           → { ok, holes }     // splice `body` over the root hole,
//                            run the checker; ok=false on a type error, `holes` =
//                            remaining `?` count. (The ORACLE. Injected so tests
//                            can stub it; live wiring uses BelugaClient.checkResult.)
//   maxDepth, maxNodes     → search bounds (totality bounds the proof; these bound
//                            the SEARCH against pathological branching).
//
// Status of a node: 'solved' (a verified, hole-free move closed it), 'open' (a
// verified move with sub-holes whose children are all solved), or 'stuck' (no
// move verified / sub-search failed → honest partial).
export function searchProof(rootGoalText, ctx) {
  const cfg = {
    maxDepth: (ctx && ctx.maxDepth) || 40,
    maxNodes: (ctx && ctx.maxNodes) || 4000,
  };
  const state = { nodes: 0, verify: ctx.verify, moves: ctx.moves };

  // The body we are assembling, as a template with one active `?` at a time is too
  // rigid for branches; instead each node owns the SUBTREE text it produces, and a
  // parent stitches children's text into its move's hole slots. We model a move's
  // text as containing `?` placeholders (one per sub-hole, in order); the search
  // fills them depth-first and the parent's final text is the move text with each
  // `?` replaced by the corresponding solved child's text.
  function solveHole(goalText, depth) {
    if (depth > cfg.maxDepth || state.nodes > cfg.maxNodes) {
      return { goal: goalText, status: 'stuck', reason: 'search-bound', children: [] };
    }
    state.nodes += 1;
    const candidates = state.moves(goalText, depth) || [];
    let lastReason = 'no-move';
    for (const mv of candidates) {
      // Verify this move in isolation: a move whose text type-errors (ignoring its
      // own remaining `?`s, which the oracle reports as holes not errors) is dead.
      const v = state.verify(mv.text, goalText);
      if (!v || !v.ok) { lastReason = mv.kind + '-rejected'; continue; }

      const subHoles = mv.subGoals || [];
      if (!subHoles.length) {
        // A closing move (fill / recurse-to-leaf): solved.
        return {
          goal: goalText, move: mv.kind, rationale: mv.rationale,
          text: mv.text, status: 'solved', children: [],
        };
      }
      // A branching move (intro-then-?, split into cases): recurse into each
      // sub-hole. ALL must solve for this move to stand.
      const children = [];
      let allSolved = true;
      for (const sg of subHoles) {
        const child = solveHole(sg.goal, depth + 1);
        children.push(child);
        if (child.status !== 'solved' && child.status !== 'open') { allSolved = false; break; }
      }
      if (allSolved) {
        return {
          goal: goalText, move: mv.kind, rationale: mv.rationale,
          text: mv.text, status: 'open', children,
        };
      }
      // This move's sub-search failed; keep the partial children for honesty but
      // try the next candidate move.
      lastReason = mv.kind + '-subsearch-failed';
    }
    return { goal: goalText, status: 'stuck', reason: lastReason, children: [] };
  }

  const tree = solveHole(rootGoalText, 0);
  const complete = tree.status === 'solved' || tree.status === 'open';
  return { complete, tree, nodes: state.nodes };
}

// Stitch a completed proof tree back into a single body text: each node's move
// text has `?` placeholders that are replaced, in order, by its children's
// stitched text. A leaf 'solved' node IS its move text. Returns the full proof
// body (no trailing `;`) for the root.
export function stitchProof(tree) {
  if (!tree) return '?';
  if (tree.status === 'solved') return tree.text != null ? tree.text : '?';
  if (tree.status !== 'open') return '?'; // stuck — leave a hole, honestly
  // Replace the i-th top-level `?` in the move text with the i-th child's stitch.
  const childTexts = (tree.children || []).map(stitchProof);
  return replaceHolesInOrder(tree.text != null ? tree.text : '?', childTexts);
}

// Replace each top-level `?` placeholder in `text`, left to right, with the
// corresponding replacement. A `?` inside a nested move is owned by THAT node, so
// we only touch the holes this node's move text exposes (its direct sub-goals).
function replaceHolesInOrder(text, replacements) {
  let i = 0;
  return String(text).replace(/\?/g, () => {
    const r = replacements[i];
    i += 1;
    return r != null ? r : '?';
  });
}
