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

// Beluga comments: `%{ … }%` blocks and `%` to end of line. Kept local so this
// module stays a leaf (no imports) — the same discipline as stripLfComments.
function stripComments(text) {
  return String(text == null ? '' : text)
    .replace(/%\{[\s\S]*?\}%/g, ' ')
    .replace(/%[^\n]*/g, ' ');
}

// ── Computation-type signature parsing ───────────────────────────────────────
// A theorem's type is a computation type: a (possibly dependent) chain of
// premises to a conclusion, e.g.
//   [ |- dual A A'] -> [ |- dual A' A]
//   {g:ctx} [g |- tm] -> [g |- tp] -> [g |- oft]
// Split it into ordered premises + the final conclusion, respecting brackets so
// arrows inside boxes/braces don't split. Dependent binders ({x:T}, (g:ctx)) are
// captured as premises tagged `dependent` (they bind a meta/context variable).
export function parseCompType(typeStr) {
  // Invariant 18 (comment-awareness) applies to the TYPE SIGNATURE too. Corpus
  // authors annotate premises inline (`[g |- eq T R]     % e1 : eq T R`); the
  // comment text was carried into the premise's `raw`, so every downstream
  // consumer — decomposeContextual, splitTextFor, the IH matcher — saw a
  // corrupted type and silently produced NO split/recurse/lemma candidate at all.
  const s = stripComments(String(typeStr == null ? '' : typeStr)).trim();
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
  // NOTE (2026-07-27, tried and REVERTED): a PARENTHESISED FUNCTION premise
  // (`({T:[⊢tp]} TmVar [g] [⊢T] -> Sem [h] [⊢T])`, the `extend`/`nsubst` shape) is
  // really an ordinary argument, not an implicit `(g:ctx)` binder, and tagging it
  // `ctx` shifts every downstream argument index. Narrowing this branch the way
  // `introSpineSegments` does (a `( … )` is a binder only with no arrow/turnstile/
  // box inside) is CORRECT in isolation but blew up `tapl/ch3+arith+leq#mstep_leq_2`
  // from COMPLETE to a >10-minute search — the extra premise widens the IH/rule
  // arity and the lemma pool explodes. It also moved no split subject. Do not
  // re-apply without first bounding that search cost.
  if (t[0] === '(') {
    const inner = t.slice(1, t.lastIndexOf(')') >= 0 ? t.lastIndexOf(')') : t.length);
    const name = (inner.split(':')[0] || '').trim();
    return { kind: 'ctx', raw: t, binder: name };
  }
  // CTYPE application (TRel [g |- M] [h |- N]): no top-level turnstile — must NOT
  // be tagged 'box' (wrapping it makes decomposeContextual misparse nested ⊢).
  if (isCtypeApplication(t)) return { kind: 'ctype', raw: t };
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
  // DELIBERATELY NOT comment-stripped (measured 2026-07-25). 93 corpus decls
  // carry a `%`-commented-out `/ total … /`; 27 of them currently COMPLETE.
  // Invariant 18's concern is scanners misreading program STRUCTURE — but the
  // pragma is not structure here: the engine never EMITS a pragma, and the real
  // recursion guard is decOk's structural case-component descent, not the
  // measure. A commented pragma is therefore the author's INTENT about which
  // argument decreases — free, already-verified guidance. Discarding it buys no
  // correctness and costs completions.
  const s = String(declOrBodyText == null ? '' : declOrBodyText);
  const m = /\/\s*total\b([^/]*)\//.exec(s);
  if (!m) return null;
  const arg = m[1].trim();
  if (!arg) return { kind: 'bare' };
  // `/ total 1 /` — positional.
  const num = /^(\d+)$/.exec(arg);
  if (num) return { kind: 'index', index: parseInt(num[1], 10) };
  // `/ total d (unique3 g e t t' d) /` — name then the application pattern. The
  // pattern's ARGUMENT LIST is kept: the decreasing argument is by convention the
  // LAST one, and resolving WHICH premise it names requires aligning that spine
  // (see decreasingBoxIndex) — defaulting to premise 0 silently inverts the IH
  // slot discipline for every multi-premise named-measure theorem.
  // `/ total (f) /` and `/ total (f x) /` — the measure written as ONLY the call
  // pattern, 64 declarations corpus-wide (plus the `str_hyp` gate). The parens
  // used to stay glued to the token, so the measure's "decreasing argument" came
  // out as `(neutral_mstep` or `h)`; `introBinderNames` then named a binder that
  // way and the intro emitted `fn (neutral_mstep => …`, which does not parse — the
  // theorem had NO first move at all and bailed at step 0 in 3 checks.
  // A lone function name designates no argument, which is exactly `bare`.
  if (arg[0] === '(' && arg[arg.length - 1] === ')') {
    const inner = arg.slice(1, -1).trim();
    const its = inner.split(/\s+/).filter(Boolean);
    if (its.length <= 1) return { kind: 'bare' };
    return { kind: 'named', name: its[its.length - 1], fn: its[0] };
  }
  const paren = arg.indexOf('(');
  if (paren > 0) {
    const name = arg.slice(0, paren).trim();
    const inner = arg.slice(paren + 1).replace(/\)\s*$/, '').trim();
    const toks = inner.split(/\s+/).filter(Boolean);
    if (name) return { kind: 'named', name, args: toks.slice(1) }; // drop the theorem name
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

// The distinct implicit metavariables of a computation type: the free uppercase
// identifiers of its premises + conclusion, excluding explicit Pi binder names.
// This is Beluga's own implicit-quantification rule, and it is what aligns a
// named totality pattern's argument spine against the premises. `$`-prefixed
// names ($W) and slash-qualified constructors (T/s) are not implicit metas.
export function implicitMetaCount(compType) {
  const names = new Set();
  const scan = (t) => {
    const s = String(t == null ? '' : t);
    const re = /\p{Lu}[\p{L}\p{N}_']*/gu;
    let m;
    while ((m = re.exec(s))) {
      const prev = m.index > 0 ? s[m.index - 1] : ' ';
      const next = s[m.index + m[0].length] || ' ';
      if (/[\p{L}\p{N}_'$/]/u.test(prev)) continue; // mid-identifier / $W / T-in-x/T
      if (next === '/') continue;                 // slash-qualified constructor head
      names.add(m[0]);
    }
  };
  const piBinders = new Set();
  for (const p of compType.premises) {
    if (p.kind === 'pi' && p.binder) piBinders.add(p.binder.replace(/^[$#]/, ''));
    scan(p.raw);
  }
  scan(compType.conclusion);
  for (const b of piBinders) names.delete(b);
  return names.size;
}

// Where the totality measure POINTS, in premise terms:
//   { kind: 'box', boxIdx } — the boxIdx-th box premise decreases (classic);
//   { kind: 'pi',  piIdx }  — the piIdx-th Pi binder decreases: recursion is by
//                             case analysis ON that (object) meta;
//   null                    — no measure, or nothing designatable.
// `/ total N /` counts EXPLICIT arguments uniformly — Pi binders AND box
// premises; implicit paren groups don't number. (Native ground truth
// 2026-07-12: `/ total 1 /` on `copy : {n:[ |- nat]} [ |- unit] -> [ |- nat]`
// designates n and certifies; `/ total 2 /` is rejected.)
// Named `/ total x (f a1 …) /`: the spine is the non-box premises (in order) +
// implicit metas + box premises; the position spelled `x` designates.
export function measureDesignation(thm) {
  if (!thm || !thm.compType || !thm.totality) return null;
  const prem = thm.compType.premises || [];
  const boxes = prem.filter((p) => p.kind === 'box');
  const tot = thm.totality;
  if (tot.kind === 'index') {
    let n = 0;
    let piN = 0;
    let boxN = 0;
    for (const p of prem) {
      const raw = String((p && p.raw) || '').trim();
      if (raw.startsWith('(')) continue; // implicit group — not numbered
      n += 1;
      if (n === tot.index) {
        if (p.kind === 'box') return { kind: 'box', boxIdx: boxN };
        if (p.kind === 'pi') return { kind: 'pi', piIdx: piN };
        return boxes.length ? { kind: 'box', boxIdx: 0 } : null;
      }
      if (p.kind === 'pi') piN += 1;
      if (p.kind === 'box') boxN += 1;
    }
    return boxes.length
      ? { kind: 'box', boxIdx: Math.min(Math.max(0, tot.index - 1), boxes.length - 1) }
      : null;
  }
  if (tot.kind === 'named' && Array.isArray(tot.args) && tot.args.length) {
    const nonBox = prem.filter((p) => p.kind !== 'box');
    // The decreasing argument is the NAMED one at its spine position — patterns
    // may end at it (`… x1 x2)`) or spell the full spine (`… d q)`).
    const pos = tot.args.lastIndexOf(tot.name);
    const spineIdx = pos >= 0 ? pos : tot.args.length - 1;
    const boxIdx = spineIdx - nonBox.length - implicitMetaCount(thm.compType);
    if (boxIdx >= 0 && boxIdx < boxes.length) return { kind: 'box', boxIdx };
    if (spineIdx < nonBox.length && nonBox[spineIdx] && nonBox[spineIdx].kind === 'pi') {
      let piN = 0;
      for (const q of prem) {
        if (q === nonBox[spineIdx]) return { kind: 'pi', piIdx: piN };
        if (q.kind === 'pi') piN += 1;
      }
    }
    return boxes.length ? { kind: 'box', boxIdx: 0 } : null;
  }
  return boxes.length ? { kind: 'box', boxIdx: 0 } : null;
}

// Resolve the totality measure to a BOX-premise index. Returns -1 when there
// are no box premises OR when the measure designates a Pi binder (recursion by
// case analysis on the binder — the piRecurseTexts route, never a box slot).
export function decreasingBoxIndex(thm) {
  const boxes = thm.compType.premises.filter((p) => p.kind === 'box');
  if (!boxes.length) return -1;
  if (!thm.totality) return 0;
  const d = measureDesignation(thm);
  if (!d) return 0;
  return d.kind === 'box' ? d.boxIdx : -1;
}

// Resolve the totality measure to an ARGUMENT-premise index — the index among
// box+ctype premises in DECLARATION order. This is the notion aligned with (a)
// mkRule's `premises` array (which interleaves box and ctype premises in
// order) and (b) the source's `fn`-binder order (fn binds box AND ctype
// premises; Pi binders come via mlam) — the two consumers of a decreasing slot
// in the synthesis path. decreasingBoxIndex's boxIdx is aligned with neither
// once a ctype premise exists, which is why recursion on a ctype premise
// (`exCRel : TRel … -> Crel …`, the S1b composition class) was structurally
// impossible: boxes=[] → -1 → no IH rule, no decOk facts.
//
// COMPAT GUARANTEE: when the theorem has NO ctype argument premise this
// delegates to decreasingBoxIndex verbatim (boxIdx === argIdx for all-box
// spines), so every existing all-box theorem behaves byte-identically.
//
// The ctype path mirrors the box laws exactly:
//   - no totality → -1 (unverified recursion never enters synthesis — the
//     same law that gates boxes at synthMoves' hasBoxPremise bail);
//   - named measure: spine = [pi binders] + [implicit metas] + [arg premises
//     in order] (native ground truth: `/ total e (ev_value t m v e) /` spells
//     implicits t,m,v BEFORE the ctype premise e — a ctype premise sits on
//     the BOX side of the spine, not the pi side);
//   - index measure: the explicit-premise walk, landing on whichever arg
//     premise is numbered;
//   - unresolvable designation with totality present → 0 (first arg premise),
//     mirroring decreasingBoxIndex's `if (!d) return 0` — the checker
//     arbitrates a wrong guess downstream, it is never unsound.
export function decreasingArgIndex(thm) {
  const prem = (thm && thm.compType && thm.compType.premises) || [];
  const args = prem.filter((p) => p.kind === 'box' || p.kind === 'ctype');
  if (!args.length) return -1;
  if (!args.some((p) => p.kind === 'ctype')) return decreasingBoxIndex(thm);
  // AUTHOR-FAITHFUL UNTOTALIED RECURSION (user policy, 2026-07-21): when the
  // AUTHOR's own decl omits `/ total /`, recursion is allowed — Beluga accepts
  // untotalied recs (it skips termination checking), and refusing here made
  // ~19 corpus targets (exCRel, det_eq, howe shapes) unprovable on principle
  // the author didn't hold. SAFETY: Beluga would also accept CIRCULAR junk
  // (`fn x => f x`) — the checker is NOT the guard here. The engine's own
  // decOk discipline is: the IH rule's decreasing slot (this index) only
  // accepts facts from decSubderivNames — case-components of the destructured
  // binder — so a generated call is structurally smaller BY CONSTRUCTION,
  // morally total even though unverified. Default to the first arg premise
  // (mirroring decreasingBoxIndex's untotalied default); no pragma is ever
  // emitted (the masked decl keeps the author's own header verbatim).
  if (!thm.totality) return 0;
  const tot = thm.totality;
  const argIdxOf = (p) => args.indexOf(p);
  if (tot.kind === 'index') {
    let n = 0;
    for (const p of prem) {
      const raw = String((p && p.raw) || '').trim();
      if (raw.startsWith('(')) continue; // implicit group — not numbered
      n += 1;
      if (n === tot.index) return (p.kind === 'box' || p.kind === 'ctype') ? argIdxOf(p) : -1;
    }
    return 0;
  }
  if (tot.kind === 'named' && Array.isArray(tot.args) && tot.args.length) {
    const pis = prem.filter((p) => p.kind === 'pi');
    const pos = tot.args.lastIndexOf(tot.name);
    const spineIdx = pos >= 0 ? pos : tot.args.length - 1;
    const argIdx = spineIdx - pis.length - implicitMetaCount(thm.compType);
    if (argIdx >= 0 && argIdx < args.length) return argIdx;
    if (spineIdx < pis.length) return -1; // designates a Pi binder — the mlam route
    return 0;
  }
  return 0;
}

// The premise of the theorem that the totality measure says decreases.
function decreasingPremise(thm) {
  const boxes = thm.compType.premises.filter((p) => p.kind === 'box');
  if (!boxes.length) return null;
  const i = decreasingBoxIndex(thm);
  return boxes[i] || boxes[0];
}

// The conclusion head of a boxed type `[ Γ |- head … ]` (or bare `[ |- head ]`).
// Reused matcher primitive — kept here (not imported) so this module stays a pure
// leaf; the richer decomposition lives in hole-split.mjs for the split layer.
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

// True iff a turnstile sits outside nested `[…]` / `(…)` boxes — the discriminator
// between a contextual box (`[g |- T]`) and a ctype application (`TRel [g |- M] [h |- N]`).
// Strip ONE outer box first (the segment itself may be `[g |- T]`), then mask nested.
export function hasTopLevelTurnstile(typeStr) {
  let s = String(typeStr == null ? '' : typeStr).trim();
  if ((s[0] === '[' && s[s.length - 1] === ']')
    || (s[0] === '(' && s[s.length - 1] === ')')) {
    s = s.slice(1, -1);
  }
  let masked = s;
  for (let g = 0; g < 8; g += 1) {
    const next = masked
      .replace(/\[[^\][]*\]/g, (x) => ' '.repeat(x.length))
      .replace(/\([^()]*\)/g, (x) => ' '.repeat(x.length));
    if (next === masked) break;
    masked = next;
  }
  return /\|-|⊢|\|/.test(masked);
}

// Phase C canonical ctype spelling: every `[Ψ ⊢ X]` / `[Ψ |- X]` → `(X)`, and
// unify `⊢`→`|-`. Applied to ctype facts, premises, conclusions, and ctor args so
// matchT sees one representation (Seam 3).
export function normalizeCtypeSpelling(typeStr) {
  let t = String(typeStr == null ? '' : typeStr).replace(/⊢/g, '|-').replace(/\s+/g, ' ').trim();
  for (let g = 0; g < 8; g += 1) {
    // The conclusion group tolerates ONE level of nested brackets so a
    // substitution/weakening suffix survives intact: `[g' |- $Id[..]]` →
    // `($Id[..])`. The old `[^\]]+` group stopped at the FIRST `]` — inside
    // `$Id[..]` — producing the mangled `($Id[..)]` (junk tokens that poison
    // matchT; found on the idLogSub trace, 2026-07-21). Deeper nesting now
    // fails to match at all (left unnormalized) rather than mangling.
    const next = t.replace(/\[([^\[\]]*\|-\s*)((?:[^\[\]]|\[[^\[\]]*\])+)\]/g, '($2)');
    if (next === t) break;
    t = next;
  }
  return t.trim();
}

// A ctype application: letter-headed, no top-level turnstile, not a binder.
export function isCtypeApplication(typeStr) {
  const t = String(typeStr == null ? '' : typeStr).trim();
  if (!t || t[0] === '{' || t[0] === '(') return false;
  if (t[0] === '[' && hasTopLevelTurnstile(t)) return false;
  if (hasTopLevelTurnstile(t)) return false;
  return /^[\p{L}_]/u.test(t);
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
