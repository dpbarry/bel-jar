// Hole / theorem substrate: type-string algebra, hyp classification,
// decreasing/IH eligibility, schema/ctx helpers, F.0 writability, path/branch
// locality, theorem-header parse. No move ranking, no Beluga search loop.

import {
  decomposeContextual,
  headOfConclusion,
  typeFamilyHead,
  enumerateConstructorsTyped,
  patternMetavars,
  isHypArgType,
  isCTypeFamily,
  branchLetNames,
  schemaInfo,
  schemaAdmittedTypes,
  introBinders,
  familyIndexSorts,
  conclusionOf,
  constructorArgDescriptor,
} from './hole-split.mjs';
import {
  parseCompType,
  parseTotality,
  boxedConclusionHead,
  decreasingBoxIndex,
  decreasingArgIndex,
  measureDesignation,
  implicitMetaCount,
  normalizeCtypeSpelling,
  isCtypeApplication,
} from './prover-comp-type.mjs';
import { holeByteOffset, theoremDeclRange, stripLfComments } from './prover-certify.mjs';
import { DECL_IDENT, reIdentExact } from './ident.mjs';

// Fresh-name helper mirroring hole-split's, kept local so move-gen is pure.

export function usedNamesOf(hole) {
  const out = [];
  for (const c of (hole.ctx || [])) if (c && c.name) out.push(c.name);
  for (const m of (hole.meta || [])) if (m && m.name) out.push(m.name);
  return out;
}

// Leading context-variable name of a boxed context string ("g, x:tm" → "g").

// Leading context-variable name of a boxed context string ("g, x:tm" → "g").

export function leadCtxVar(ctxStr) {
  const first = String(ctxStr || '').split(',')[0];
  return first ? first.trim().split(/[\s:]/)[0] : '';
}

// Schema candidates for a context variable, from the hole's meta + the code.

// Schema candidates for a context variable, from the hole's meta + the code.

export function candidateSchemasFor(code, hole, ctxVar) {
  const out = [];
  const add = (s) => { if (s && !out.includes(s)) out.push(s); };
  if (!ctxVar) return out;
  const meta = (hole.meta || []).find((m) => m && m.name === ctxVar);
  if (meta && meta.type) add(String(meta.type).trim());
  const re = new RegExp('\\(\\s*' + ctxVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + '\\s*:\\s*([\\p{L}_][\\p{L}\\p{N}_\']*)', 'gu');
  let m;
  const src = String(code || '');
  while ((m = re.exec(src)) !== null) add(m[1]);
  return out;
}


export function introBinderNames(thm, arrowCount) {
  if (!thm || !thm.compType || !thm.totality) return null;
  const boxes = thm.compType.premises.filter((p) => p.kind === 'box');
  if (boxes.length !== arrowCount) return null;
  const tot = thm.totality;
  let decIdx = 0;
  if (tot.kind === 'index') decIdx = tot.index - 1;
  const names = new Array(arrowCount).fill(null);
  if (tot.kind === 'named' && tot.name) names[decIdx] = tot.name;
  const pool = ['f', 'e', 'h', 'g'];
  let pi = 0;
  for (let i = 0; i < arrowCount; i += 1) {
    if (!names[i]) names[i] = pool[pi++] || ('X' + i);
  }
  return names;
}

// Build the case-split text for scrutinee `varName` from OUR model (constructors
// + schema parameter branch). Returns the `case … of …` text or null.

// Top-level application argument groups of a conclusion, head dropped:
// `step (succ N) "i` → ['(succ N)', '"i'] (paren/bracket-aware).

export function topLevelIndexGroups(concl) {
  const s = String(concl || '').trim();
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.slice(1);
}

// The head of an index group iff it is a DECLARED LF constructor (rigid);
// null for metas (uppercase), `"`-internals, params/projections, binders —
// everything a unifier could still refine (fail-open callers keep the arm).

// The head of an index group iff it is a DECLARED LF constructor (rigid);
// null for metas (uppercase), `"`-internals, params/projections, binders —
// everything a unifier could still refine (fail-open callers keep the arm).

export function rigidCtorHeadOf(tok, code) {
  const m = /^[(\s]*([\p{Ll}_][\p{L}\p{N}_']*)/u.exec(String(tok || ''));
  const h = m && m[1];
  if (!h) return null;
  return resultFamilyOfCtor(code, h) ? h : null;
}


export function theoremContextParam(thm) {
  if (!thm || !thm.compType) return null;
  const prem = thm.compType.premises.find((p) => p.kind === 'ctx');
  if (prem) {
    const m = /\(\s*([\p{L}_][\p{L}\p{N}_']*)\s*:\s*([\p{L}_][\p{L}\p{N}_']*)\s*\)/u.exec(prem.raw);
    return m ? { var: m[1], schema: m[2] } : { var: prem.binder, schema: null };
  }
  // An EXPLICIT schema Pi (`{g:eqCtx}`) plays the same role — a Pi binder whose
  // type is a bare identifier (a schema name, not a box).
  for (const p of thm.compType.premises) {
    if (p.kind !== 'pi') continue;
    const m = /^\{\s*([\p{L}_][\p{L}\p{N}_']*)\s*:\s*([\p{L}_][\p{L}\p{N}_']*)\s*\}$/u.exec(String(p.raw).trim());
    if (m) return { var: m[1], schema: m[2] };
  }
  return null;
}

// The conclusion box for ONE IH call: the theorem's conclusion with its context
// variable instantiated the way the DECREASING argument instantiates it. A
// strengthening premise `[g, x:name |- …]` called at `[g, y:name, x:name |- D]`
// instantiates g := g, y:name — so the result is bound in `[g, y:name |- R]`
// (the reference `let [g, y:name |- linQr] = str_lin [g, y:name, x:name |- linQ]`).
// A closed conclusion (`[ |- …]`) is unaffected.

// The conclusion box for ONE IH call: the theorem's conclusion with its context
// variable instantiated the way the DECREASING argument instantiates it. A
// strengthening premise `[g, x:name |- …]` called at `[g, y:name, x:name |- D]`
// instantiates g := g, y:name — so the result is bound in `[g, y:name |- R]`
// (the reference `let [g, y:name |- linQr] = str_lin [g, y:name, x:name |- linQ]`).
// A closed conclusion (`[ |- …]`) is unaffected.

export function resultBoxFor(thm, decArgCtx) {
  const d = thm && thm.compType && decomposeContextual(thm.compType.conclusion);
  const ctx = d && d.ctx;
  if (!ctx) return (inner) => `[ |- ${inner}]`;
  const ctxParam = theoremContextParam(thm);
  if (ctxParam && ctx === ctxParam.var && decArgCtx) {
    const boxes = thm.compType.premises.filter((p) => p.kind === 'box');
    const decIdx = decreasingBoxIndex(thm);
    let raw = (boxes[decIdx] || boxes[0] || {}).raw || '';
    if (raw && !raw.startsWith('[')) raw = `[${raw}]`;
    const tail = Math.max(0, splitCtx(boxOf(raw).ctx).length - 1);
    const parts = splitCtx(decArgCtx);
    if (parts.length > tail) {
      return (inner) => `[${parts.slice(0, parts.length - tail).join(', ')} |- ${inner}]`;
    }
  }
  return (inner) => `[${ctx} |- ${inner}]`;
}


export function isDeclaredTypeFamily(code, fam) {
  if (!fam) return false;
  const esc = String(fam).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*(?:(?:LF|and|inductive|stratified|coinductive)\\s+)?${esc}\\s*:`, 'm');
  return re.test(String(code || ''));
}


export function premiseDecHead(premRaw, code) {
  let raw = premRaw;
  if (!raw.startsWith('[')) raw = `[${raw}]`;
  const d = decomposeContextual(raw);
  if (!d) return boxedConclusionHead(raw);
  const plain = headOfConclusion(d.concl);
  if (plain && (isDeclaredTypeFamily(code, plain) || enumerateConstructorsTyped(code, plain).length)) {
    return plain;
  }
  const fam = typeFamilyHead(d.concl, code);
  if (fam && fam !== 'type') return fam;
  return plain || boxedConclusionHead(raw);
}


export function contextualBinderMeta(h) {
  const t = String(h && h.type || '').trim();
  const m = /^\(\s*([^|]*)\|-\s*([\s\S]+)\)$/.exec(t);
  if (!m) return null;
  const ctx = m[1].trim();
  if (!ctx.includes(':')) return null;
  const parts = ctx.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return null;
  return { ctx, concl: m[2].trim() };
}

// A sub-derivation living under a BLOCK-extended context (a schema `block (…)` binder)
// or under a lambda binder — the shapes the structural IH may still recurse on.
// Structural, no family name.

// A sub-derivation living under a BLOCK-extended context (a schema `block (…)` binder)
// or under a lambda binder — the shapes the structural IH may still recurse on.
// Structural, no family name.

export function isBlockSubderiv(h) {
  if (!h) return false;
  if (h.underBinder) return true;
  const cb = contextualBinderMeta(h);
  return !!(cb && /\bblock\b/.test(cb.ctx));
}


export function metaConclusion(typeStr) {
  const t = String(typeStr || '').trim();
  const paren = /^\(\s*([^|]*)\|-\s*([\s\S]+)\)$/.exec(t);
  if (paren) return paren[2].trim();
  const d = decomposeContextual(t);
  if (d) return d.concl;
  return t;
}


export function ihMetaCand(h, head) {
  if (!h || h.where !== 'meta') return false;
  if (h.underBinder) return true;
  const t = String(h.type || '').trim();
  if (t.startsWith('{')) return false;
  const concl = metaConclusion(t);
  return contextualHead(concl) === head;
}


export function innerSubderivFromBranchGoal(hole, code, decHead) {
  const branch = code && hole ? branchPatternBox(code, hole) : null;
  const bd = branch && decomposeContextual(branch);
  if (!bd) return null;
  const m = /\s(\p{Lu}[\p{L}\p{N}_']*)\s*$/u.exec(String(bd.concl || '').trim());
  if (!m) return null;
  const name = m[1];
  const meta = (hole.meta || []).find((x) => x && x.name === name && contextualHead(x.type) === decHead);
  if (!meta) return null;
  return {
    name,
    type: meta.type,
    where: 'meta',
    term: name,
  };
}


export function decreasingHyps(hole, thm, decHead, code = '') {
  // Notation-aware head for branch-meta stubs (an infix conclusion `P x' ⇛ P' x'`
  // is family `⇛`, not `P`) — reported cD types print prefix-form and don't need it.
  const famHeadOf = (t) => {
    const c = conclusionOf(t);
    const nota = typeFamilyHead(c, code);
    return (nota && nota !== 'type') ? nota : headOfConclusion(c);
  };
  const rawBranchMetas = branchPatternMetas(code, hole);
  const fromBranch = rawBranchMetas.filter((h) =>
    famHeadOf(h.type) === decHead && isPremiseShapedSubderiv(h, thm),
  );
  // Debug hook (no-op unless a harness installs it): the dec-candidate sources.
  if (globalThis.__decDebug) {
    globalThis.__decDebug({
      decHead,
      rawBranchMetas: rawBranchMetas.map((h) => ({ name: h.name, type: h.type })),
      fromBranch: fromBranch.map((h) => h.name),
    });
  }
  const all = expandedHypsOf(hole, code);
  const ctxParam = theoremContextParam(thm);
  const widePool = () => (ctxParam
    ? all.filter((h) => {
      if (ihMetaCand(h, decHead)) return isPremiseShapedSubderiv(h, thm);
      if (h.where !== 'comp' || boxedConclusionHead(h.type) !== decHead) return false;
      return !isIntroducedPremise(h, thm);
    })
    : all.filter((h) => h.where === 'meta' && boxedConclusionHead(h.type) === decHead));
  if (fromBranch.length) {
    // POISONED DECREASING SLOT. `fromBranch` is the INNERMOST enclosing arm's
    // pattern metavariables, family-filtered only — so when that arm destructured
    // a premise that is NOT descended from the MEASURED one (the uniqueness /
    // determinacy / confluence idiom: two derivations of the same family, split
    // one after the other), every call it generates is rejected by the totality
    // checker with "Recursive call not structurally smaller", and the call the
    // proof actually needs — decreasing argument from the OUTER split on the
    // measured premise — is never generated at all (measured on
    // logrel/algeq-simplified#determinacy: `determinacy [g ⊢ X1] [g ⊢ X]`
    // proposed 4×, `determinacy [g ⊢ X] [g ⊢ X1]` never).
    //
    // `decSubderivNames` is the totality checker's OWN criterion (the fixpoint
    // over enclosing cases whose scrutinee is decreasing-descended) and already
    // gates the synthesis engine's decOk facts. Apply it here: when the innermost
    // arm binds NO eligible sub-derivation, lead with the eligible ones that ARE
    // in scope. Nothing is dropped (the criterion is blind to a subderivation
    // bound by a `let`-inversion rather than a case) — the pool is only widened
    // and reordered, so a hole whose innermost arm IS eligible is untouched.
    const decNames = decSubderivNames(code, hole, decreasingArgIndex(thm));
    if (!decNames.size || fromBranch.some((h) => decNames.has(h.name))) return fromBranch;
    const eligible = widePool().filter((h) => decNames.has(h.name)
      && !fromBranch.some((b) => b.name === h.name));
    if (eligible.length) return [...eligible, ...fromBranch];
    return fromBranch;
  }
  const fromGoal = innerSubderivFromBranchGoal(hole, code, decHead);
  if (fromGoal) return [fromGoal];
  return widePool();
}


export function normCtxPart(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().replace(/\s*:\s*/g, ':');
}


export function contextualHead(typeStr) {
  return headOfConclusion(conclusionOf(typeStr));
}

// Compare two context-entry spellings up to the checker's round-trip prints:
// identity substitutions elided (`pure A[..]` ⇄ `pure A`) and redundant parens
// (`pure (B[..])` ⇄ `pure B[..]`). Over-accepting here only widens the
// candidate pool — certification still arbitrates.

// Compare two context-entry spellings up to the checker's round-trip prints:
// identity substitutions elided (`pure A[..]` ⇄ `pure A`) and redundant parens
// (`pure (B[..])` ⇄ `pure B[..]`). Over-accepting here only widens the
// candidate pool — certification still arbitrates.

export function normCtxPartSpelling(part) {
  return normCtxPart(part)
    .replace(/\[\.\.\]/g, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}


export function isPremiseShapedSubderiv(h, thm) {
  if (h.underBinder || isBlockSubderiv(h)) return true;
  const t = String(h && h.type || '').trim();
  if (t[0] === '{' || (t[0] === '(' && !/\|-/.test(t))) return true;
  const prem = thm.compType.premises.find((p) => p.kind === 'box');
  if (!prem) return true;
  let raw = prem.raw;
  if (!raw.startsWith('[')) raw = `[${raw}]`;
  const premCtx = boxOf(raw).ctx.split(',').map(normCtxPartSpelling).filter(Boolean);
  const hypCtx = boxOf(h.type).ctx.split(',').map(normCtxPartSpelling).filter(Boolean);
  if (hypCtx.length < premCtx.length) return false;
  for (let i = 0; i < premCtx.length; i += 1) {
    if (hypCtx[i] !== premCtx[i]) {
      if (hypCtx.length > premCtx.length && hypCtx[0] === premCtx[0]) {
        // The premise's declared binder tail must be present in the hypothesis'
        // extension BY TYPE — binder names are pattern-chosen and never significant
        // (`x:name` is satisfied by `x10:name`).
        const typeOf = (part) => (part.includes(':') ? part.slice(part.indexOf(':') + 1) : part);
        const premTail = premCtx.slice(1);
        const hypTail = hypCtx.slice(1);
        return premTail.every((p) => hypTail.some((hq) => typeOf(hq) === typeOf(p)));
      }
      return false;
    }
  }
  return true;
}

// True when `h` IS the original scrutinee — the whole introduced premise, not a
// smaller sub-derivation. Only a COMPUTATION-context hypothesis can be the scrutinee;
// a META hypothesis recovered from a case pattern is a sub-derivation even if it
// alpha-matches the premise's variable names (distinct instance). So we require
// `where === 'comp'` before the verbatim-type check.

// True when `h` IS the original scrutinee — the whole introduced premise, not a
// smaller sub-derivation. Only a COMPUTATION-context hypothesis can be the scrutinee;
// a META hypothesis recovered from a case pattern is a sub-derivation even if it
// alpha-matches the premise's variable names (distinct instance). So we require
// `where === 'comp'` before the verbatim-type check.

export function isIntroducedPremise(h, thm) {
  if (h.where === 'meta') return false;
  const boxes = thm.compType.premises.filter((p) => p.kind === 'box');
  if (!boxes.length) return false;
  // No totality annotation ⇒ no designated decreasing premise; the introduced
  // premise defaults to the first box (recursion is separately refused upstream).
  const decIdx = decreasingBoxIndex(thm);
  let prem = boxes[decIdx] ? boxes[decIdx].raw : boxes[0].raw;
  if (!prem.startsWith('[')) prem = `[${prem}]`;
  const a = boxOf(h.type);
  const b = boxOf(prem);
  return a.inner.replace(/\s+/g, ' ').trim() === b.inner.replace(/\s+/g, ' ').trim()
    && a.ctx.replace(/\s+/g, ' ').trim() === b.ctx.replace(/\s+/g, ' ').trim();
}

// The structural sub-derivations we may recurse on: everything of the decreasing
// family that is NOT the original scrutinee and NOT a verbatim copy of the premise
// (i.e. a genuinely SMALLER piece produced by a split). Prefer, in order:
// higher-order (under-binder) sub-derivations, then context-EXTENDED ones (a block or
// binder was added), else the whole pool. No name-index heuristic — a split's pattern
// metavars (X1, X2, …) are ALL legitimate sub-derivations.

// The structural sub-derivations we may recurse on: everything of the decreasing
// family that is NOT the original scrutinee and NOT a verbatim copy of the premise
// (i.e. a genuinely SMALLER piece produced by a split). Prefer, in order:
// higher-order (under-binder) sub-derivations, then context-EXTENDED ones (a block or
// binder was added), else the whole pool. No name-index heuristic — a split's pattern
// metavars (X1, X2, …) are ALL legitimate sub-derivations.

export function subderivMetas(cands, preferComp = false, thm = null) {
  let pool = cands;
  if (thm) {
    const scrName = introBinderNames(thm, 1)?.[0];
    pool = cands.filter((h) => h.name !== scrName && !isIntroducedPremise(h, thm));
  }
  if (preferComp && thm) {
    const comp = pool.filter((h) => h.where === 'comp');
    if (comp.length) return comp;
  }
  const ho = pool.filter((h) => h.underBinder);
  if (ho.length) return ho;
  if (thm) {
    let raw = thm.compType.premises.find((p) => p.kind === 'box')?.raw || '';
    if (raw && !raw.startsWith('[')) raw = `[${raw}]`;
    const n = raw ? boxOf(raw).ctx.split(',').filter(Boolean).length : 0;
    const ext = pool.filter((h) => boxOf(h.type).ctx.split(',').filter(Boolean).length > n);
    if (ext.length) return ext;
  }
  return pool;
}

// GOAL-DIRECTED SYNTHESIS moves (the bel-synth backward-chaining engine): adapt
// the hole to the engine's plain-data shape — facts from the hole's meta/comp
// bindings (decOk = the same decreasing-candidate set the greedy recurse uses),
// rules from the IH + sibling lemmas, constructors from the reachable families —
// and let it DERIVE a complete hole-closing chain by unification. Anything
// outside the engine's fragment simply yields no facts/rules and it returns
// null; the other move generators still run. One candidate, checker-certified.
// The names that may legally fill the IH's DECREASING argument at this hole:
// the pattern variables of any enclosing case whose scrutinee IS the decreasing
// binder or is itself decreasing-descended — a fixpoint over the enclosing-case
// chain. This is the totality checker's actual criterion (structurally smaller
// than the decreasing argument), so the synthesis engine never plans a chain the
// checker would reject for termination. (A sub-derivation of the OTHER premise —
// F1/F2 from `f`'s nested split — is original but NOT decreasing-eligible.)
// The enclosing OPEN cases at the hole, outermost first, each with its current
// arm pattern: a line scan with a paren-depth counter over OUR OWN emitted proof
// text (nested cases are parenthesised, arms start their own lines). Shared by
// the decreasing-descendant fixpoint and the re-split guard.
// `fromOff` scopes the scan (e.g. to the decl under proof): sibling recs'
// unparenthesized top-level cases never close, so a whole-prefix count is
// valid ONLY for relative depth compares — an absolute threshold (the split
// budget) must count from the decl start or every hole in a fat assembly is
// born over-budget (measured 2026-07-19: values/natval died at 8 checks).

// GOAL-DIRECTED SYNTHESIS moves (the bel-synth backward-chaining engine): adapt
// the hole to the engine's plain-data shape — facts from the hole's meta/comp
// bindings (decOk = the same decreasing-candidate set the greedy recurse uses),
// rules from the IH + sibling lemmas, constructors from the reachable families —
// and let it DERIVE a complete hole-closing chain by unification. Anything
// outside the engine's fragment simply yields no facts/rules and it returns
// null; the other move generators still run. One candidate, checker-certified.
// The names that may legally fill the IH's DECREASING argument at this hole:
// the pattern variables of any enclosing case whose scrutinee IS the decreasing
// binder or is itself decreasing-descended — a fixpoint over the enclosing-case
// chain. This is the totality checker's actual criterion (structurally smaller
// than the decreasing argument), so the synthesis engine never plans a chain the
// checker would reject for termination. (A sub-derivation of the OTHER premise —
// F1/F2 from `f`'s nested split — is original but NOT decreasing-eligible.)
// The enclosing OPEN cases at the hole, outermost first, each with its current
// arm pattern: a line scan with a paren-depth counter over OUR OWN emitted proof
// text (nested cases are parenthesised, arms start their own lines). Shared by
// the decreasing-descendant fixpoint and the re-split guard.
// `fromOff` scopes the scan (e.g. to the decl under proof): sibling recs'
// unparenthesized top-level cases never close, so a whole-prefix count is
// valid ONLY for relative depth compares — an absolute threshold (the split
// budget) must count from the decl start or every hole in a fat assembly is
// born over-budget (measured 2026-07-19: values/natval died at 8 checks).

export function openCasesAt(code, hole, fromOff = 0) {
  const off = holeByteOffsetBridge(code, hole);
  if (off < 0) return [];
  const prefix = code.slice(fromOff, off);
  const cases = [];
  let depth = 0;
  for (const line of prefix.split('\n')) {
    const cm = /\bcase\s+(\[[^\]]*\]|[\p{L}_][\p{L}\p{N}_']*)\s+of\b/u.exec(line);
    const before = depth;
    for (const ch of line) {
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        while (cases.length && cases[cases.length - 1].depth > depth) cases.pop();
      }
    }
    if (cm) {
      let scrut = cm[1];
      const inner = /(?:\|-|⊢)\s*([\p{L}_][\p{L}\p{N}_']*)\s*\]$/u.exec(scrut);
      if (inner) scrut = inner[1];
      cases.push({ scrut, depth: before + (line.slice(0, cm.index).split('(').length - line.slice(0, cm.index).split(')').length), arm: null });
    }
    const am = /^\s*\|\s*([\s\S]*?)(?:=>|⇒)/.exec(line);
    if (am && cases.length) cases[cases.length - 1].arm = am[1];
  }
  return cases;
}

// The fn binder bound at the theorem's decreasing premise index — the name
// whose case components are decOk (invariant 9; P15: scanned from the DECL
// under proof, never the whole prefix).

// The fn binder bound at the theorem's decreasing premise index — the name
// whose case components are decOk (invariant 9; P15: scanned from the DECL
// under proof, never the whole prefix).

export function decreasingBinderNameAt(code, hole, decIdxThm) {
  const off = holeByteOffsetBridge(code, hole);
  if (off < 0) return null;
  const prefix = code.slice(0, off);
  const declStart = (() => {
    const re = /(^|\n)[ \t]*(?:rec|proof|and)\s/g;
    let last = 0;
    let m;
    while ((m = re.exec(prefix))) last = m.index;
    return last;
  })();
  const fnNames = [...prefix.slice(declStart).matchAll(/\bfn\s+([\p{L}_][\p{L}\p{N}_']*)\s*(?:=>|⇒)/gu)].map((m) => m[1]);
  return fnNames[decIdxThm] || null;
}


export function decSubderivNames(code, hole, decIdxThm) {
  const decBinder = decreasingBinderNameAt(code, hole, decIdxThm);
  if (!decBinder) return new Set();
  const cases = openCasesAt(code, hole);
  // A `let`-INVERSION is a ONE-BRANCH CASE: `let [g ⊢ ctor S] = d in` destructures
  // `d` exactly as an arm would, and Beluga's totality checker accepts a recursive
  // call on `S` whenever `d` is decreasing-descended. Walking `openCasesAt` alone
  // made every such sub-derivation invisible — to the decOk facts AND to the
  // recurse pool — for the whole "invert, then call" idiom. Matched only when the
  // RHS is a bare identifier (a hypothesis, never a call result) and the pattern
  // sits on one line: both restrictions UNDER-approximate, so a miss costs a
  // candidate, never a wrong one.
  const lets = [...pathBodyBefore(code, hole)
    .matchAll(/\blet\b([^=\n]*)=\s*([\p{L}_][\p{L}\p{N}_']*)\s+in\b/gu)];
  const dec = new Set([decBinder]);
  // One fixpoint over BOTH forms: a case may scrutinise a let-bound sub-derivation
  // and a let may invert a case-bound one, in either order.
  for (let pass = 0; pass <= cases.length + lets.length; pass += 1) {
    let grew = false;
    const add = (v) => { if (v && !dec.has(v)) { dec.add(v); grew = true; } };
    for (const c of cases) {
      if (!c.arm || !dec.has(c.scrut)) continue;
      for (const v of c.arm.match(/\p{Lu}[\p{L}\p{N}_']*/gu) || []) add(v);
    }
    for (const m of lets) {
      if (!dec.has(m[2])) continue;
      for (const v of m[1].match(/\p{Lu}[\p{L}\p{N}_']*/gu) || []) add(v);
    }
    if (!grew) break;
  }
  dec.delete(decBinder); // the binder itself is not smaller than itself
  return dec;
}

// Byte offset of the hole's `?` (mirrors hole-split's branchBodyBefore math).

// Byte offset of the hole's `?` (mirrors hole-split's branchBodyBefore math).

export function holeByteOffsetBridge(code, hole) {
  const lines = String(code).split('\n');
  if (!hole || hole.line < 1 || hole.line > lines.length) return -1;
  const ln = lines[hole.line - 1] || '';
  const qi = ln.indexOf('?');
  const col = qi >= 0 ? qi : Math.max(0, (hole.col || 1) - 1);
  let off = 0;
  for (let l = 1; l < hole.line; l += 1) off += (lines[l - 1] || '').length + 1;
  return off + col;
}

/**
 * Phase F.0 — names bound in SOURCE up to the hole (path body + prior lines).
 * Checker-invented hole.meta/ctx names absent from this set are unwritable by
 * construction (D11 residual: free meta / invented fact in a premise slot).
 */

/**
 * Phase F.0 — names bound in SOURCE up to the hole (path body + prior lines).
 * Checker-invented hole.meta/ctx names absent from this set are unwritable by
 * construction (D11 residual: free meta / invented fact in a premise slot).
 */

export function sourceWritableNames(code, hole, thm) {
  const names = new Set();
  const chunks = [pathBodyBefore(code, hole) || ''];
  const lines = String(code || '').split('\n');
  const holeLine = (hole && hole.line > 0) ? hole.line : lines.length + 1;
  chunks.push(lines.slice(0, Math.max(0, holeLine - 1)).join('\n'));
  // The hole's OWN line up to the hole's column: a binder bound on that line
  // (`mlam g' => fn f => ?`, `| [g |- pat] => ?`) is source-writable. Excluding
  // it tagged every same-line binder INVENTED, and F.7 then forbade synth from
  // citing the theorem's own premises — the todbruijn wrong-chain (P10,
  // 2026-07-17: synth fell through to a garbage ctor fill because the one
  // certifiable chain cited a "forbidden" fn binder).
  if (hole && hole.line > 0 && hole.line <= lines.length && hole.col > 1) {
    chunks.push(lines[hole.line - 1].slice(0, hole.col - 1));
  }
  const src = chunks.join('\n');
  for (const m of src.matchAll(/[\p{L}_$][\p{L}\p{N}_']*/gu)) names.add(m[0]);
  if (thm && thm.name) names.add(thm.name);
  return names;
}

/** Hole-report binders not present in the source-writable set. */

/** Hole-report binders not present in the source-writable set. */

export function inventedReportNames(hole, writable) {
  const out = [];
  for (const b of [...(hole && hole.meta || []), ...(hole && hole.ctx || [])]) {
    if (!b || !b.name) continue;
    const n = String(b.name);
    if (n[0] === '#' || n[0] === '"' || n[0] === '¿') continue; // GENERAL: engine namespaces (#param, "i, ¿schematic) — not theorem names
    if (writable && writable.has(n)) continue;
    out.push(n);
  }
  return out;
}

/** True when `text` mentions any of `names` as a whole identifier. */

/** True when `text` mentions any of `names` as a whole identifier. */

export function textReferencesNames(text, names) {
  if (!names || !names.length) return false;
  const s = String(text || '');
  for (const n of names) {
    const esc = String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^\\p{L}\\p{N}_'$])${esc}(?![\\p{L}\\p{N}_'])`, 'u').test(s)) return true;
  }
  return false;
}

// The index of a decl's BODY `=`: the first standalone `=` TOKEN at bracket
// depth 0 from `from` (comment-skipping); -1 when the decl ends (`;`) first.
// Beluga identifiers may CONTAIN or END WITH `=` (church-rosser's `pred=`
// family, 2026-07-12) and an infix `=` type lives inside boxes at depth > 0 —
// a lazy first-`=` regex truncates the type mid-identifier in both cases.

export function declBodyEqIndex(s, from) {
  let depth = 0;
  for (let i = from; i < s.length; i += 1) {
    const c = s[i];
    if (c === '%') {
      if (s[i + 1] === '{') {
        let d = 1;
        let j = i + 2;
        while (j < s.length && d > 0) {
          if (s[j] === '%' && s[j + 1] === '{') { d += 1; j += 2; continue; }
          if (s[j] === '}' && s[j + 1] === '%') { d -= 1; j += 2; continue; }
          j += 1;
        }
        i = j - 1;
        continue;
      }
      while (i < s.length && s[i] !== '\n') i += 1;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0 && c === ';') return -1;
    else if (depth === 0 && c === '='
      && (i === from || /\s/.test(s[i - 1]))
      && (i + 1 >= s.length || /\s/.test(s[i + 1]))) return i;
  }
  return -1;
}


// Every `rec`/`proof` in the program, with the two facts a CALLER needs to know
// whether it may cite one: `at` (where the declaration starts) and `block` (which
// mutual `and`-chain it belongs to). Beluga's signature is SEQUENTIAL — see
// `theoremInScope`.
export function theoremIndex(code) {
  const src = String(code || '');
  const out = [];
  const re = new RegExp(String.raw`\b(and\s+)?(?:rec|proof)\s+(${DECL_IDENT})\s*:`, 'gu');
  let m;
  let block = 0;
  while ((m = re.exec(src)) !== null) {
    if (!m[1]) block += 1; // a head `rec`/`proof` opens a new mutual block
    const eq = declBodyEqIndex(src, re.lastIndex);
    if (eq < 0) continue;
    const header = src.slice(m.index, eq + 1);
    out.push({
      name: m[2],
      at: m.index,
      block,
      compType: parseCompType(src.slice(re.lastIndex, eq).trim()),
      totality: parseTotality(header),
    });
  }
  return out;
}

// May the theorem under proof CITE `lemma`? Beluga's signature is sequential: a
// `rec` declared AFTER the one being proved is not in scope, and citing it is
// rejected outright ("Identifier <name> is unbound"). Mutual `and`-chain members
// see each other regardless of order. Measured 2026-07-25: without this filter
// ~15% of ALL checker traffic on the stuck residue was spent on out-of-scope
// lemma calls — candidates that can never succeed, in some targets hundreds of
// them (`confluence` 88 rejections, `determinacy'` 88, `mstep_trans` 86).
// FAIL OPEN: when the caller cannot be located in the index, nothing is filtered.
export function theoremInScope(lemma, currentThm, index) {
  if (!lemma || !currentThm || !Array.isArray(index)) return true;
  const self = index.find((t) => t && t.name === currentThm.name);
  if (!self || typeof self.at !== 'number' || typeof lemma.at !== 'number') return true;
  if (lemma.block === self.block) return true; // same mutual block — mutually visible
  return lemma.at < self.at;
}

// The comp-LET pattern destructuring a CTYPE result: the conclusion family's
// unique constructor applied to one boxed pattern per argument — a boxed Pi gets
// the wildcard witness (`Res [g ⊢ _] …`), a premise whose family has a unique
// NULLARY constructor gets it (`[g, x:name ⊢ refl_proc]` — the ctype analog of
// the `let [⊢ refl] = …` refinement), anything else binds a fresh metavar.
// Contexts are the constructor's declared ones with the lemma's context variable
// instantiated the way the decreasing argument instantiates it. Null when the
// conclusion isn't a single-constructor ctype of this shape.

// All hypotheses available at a hole — meta-context (cD) AND computation context
// (cG) — each tagged with `where` so callers can apply context-specific rules
// (e.g. the IH structural guard requires the sub-derivation be a cD metavar).

export function hypsOf(hole) {
  const out = [];
  for (const m of (hole.meta || [])) if (m && m.name) out.push({ name: m.name, type: m.type, where: 'meta' });
  for (const c of (hole.ctx || [])) if (c && c.name) out.push({ name: c.name, type: c.type, where: 'comp' });
  return out;
}


export function expandedHypsOf(hole, code) {
  const base = hypsOf(hole);
  const out = [...base];
  const used = usedNamesOf(hole);
  for (const h of base) {
    if (h.where !== 'meta') continue;
    const ho = higherOrderHyp(h, used);
    if (ho) out.push(ho);
  }
  out.push(...blockProjectionHyps(hole, code));
  out.push(...branchPatternMetas(code, hole));
  return out;
}

// The byte offset where the CURRENT declaration starts (the nearest preceding
// `rec`/`proof` head). All branch-relative reasoning must be scoped to it — an
// unclamped upward scan leaks into the PREVIOUS theorem's case arms, making a
// top-level hole look mid-branch (blocking its primary split).

// The byte offset where the CURRENT declaration starts (the nearest preceding
// `rec`/`proof` head). All branch-relative reasoning must be scoped to it — an
// unclamped upward scan leaks into the PREVIOUS theorem's case arms, making a
// top-level hole look mid-branch (blocking its primary split).

export function declStartOffset(code, off) {
  const upto = String(code || '').slice(0, Math.max(0, off));
  const re = new RegExp(String.raw`(^|\n)\s*(?:rec|proof)\s+${DECL_IDENT}`, 'gu');
  let last = 0;
  let m;
  while ((m = re.exec(upto))) last = m.index + (m[1] ? 1 : 0);
  return last;
}


export function branchPatternBox(code, hole) {
  const off = holeByteOffset(code, hole);
  const declFrom = declStartOffset(code, off >= 0 ? off : code.length);
  const prefix = (off >= 0 ? code.slice(0, off) : code).slice(declFrom);
  const lastArm = Math.max(prefix.lastIndexOf('=>'), prefix.lastIndexOf('⇒'));
  const body = lastArm >= 0 ? prefix.slice(lastArm) : prefix;
  const armLine = body.split('\n').find((l) => /^\s*\|/.test(l));
  const line = armLine || (() => {
    const lines = String(code || '').split('\n');
    for (let i = hole.line - 1; i >= 0; i -= 1) {
      const ln = lines[i];
      if (/^\s*(?:rec|proof)\b/.test(ln)) break; // never scan past the current decl
      if (!/^\s*\|/.test(ln)) continue;
      const start = ln.indexOf('[');
      const end = ln.lastIndexOf(']');
      if (start < 0 || end <= start) continue;
      const tail = ln.slice(end + 1).trim();
      if (/=>\s*$/.test(tail) || /⇒\s*$/.test(tail)) return ln;
    }
    return null;
  })();
  if (!line) return null;
  // The pattern is the FIRST balanced box on the arm line — an annotated arm
  // (`| [g |- pat] : [g |- T] =>`) carries a second box (the type annotation)
  // that a first-`[`-to-last-`]` span would wrongly swallow.
  const start = line.indexOf('[');
  if (start < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < line.length; i += 1) {
    if (line[i] === '[') depth += 1;
    else if (line[i] === ']') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end <= start) return null;
  return line.slice(start, end + 1);
}


export function branchPatternMetas(code, hole) {
  const box = branchPatternBox(code, hole);
  if (!box) return [];
  const d = decomposeContextual(box);
  if (!d || !d.concl) return [];
  const ctx = d.ctx;
  const ctxType = ctx ? `(${ctx} |- ` : '( |- ';
  const out = [];
  const seen = new Set();
  const taken = new Set((hole.meta || []).map((m) => m && m.name).filter(Boolean));
  const patHead = headOfConclusion(d.concl);
  const fam = typeFamilyHead(d.concl, code);
  const ctors = fam ? enumerateConstructorsTyped(code, fam) : [];
  const ci = ctors.find((c) => c.name === patHead);

  const add = (name, type, opts = {}) => {
    if (!name || seen.has(name) || name.startsWith('#')) return;
    const prev = taken.has(name) ? (hole.meta || []).find((m) => m && m.name === name) : null;
    if (prev) {
      const patHeadTy = contextualHead(type);
      const prevHeadTy = contextualHead(prev.type);
      // Re-expose a pattern metavar as a hypothesis when the pattern REFINES what we
      // knew: same conclusion family head, OR it's now seen under a binder (a
      // higher-order occurrence the plain meta-context entry didn't capture).
      const refines = (patHeadTy && patHeadTy === prevHeadTy) || (opts.underBinder && !prev.underBinder);
      if (refines) {
        seen.add(name);
        const fullType = type.startsWith('[') ? type : (type.endsWith(')') ? type : `${ctxType}${type})`);
        out.push({ name, type: fullType, where: 'meta', ...opts, term: opts.term || `${name}[..]` });
      }
      return;
    }
    seen.add(name);
    const fullType = type.startsWith('[') ? type : (type.endsWith(')') ? type : `${ctxType}${type})`);
    out.push({ name, type: fullType, where: 'meta', ...opts });
  };

  const branchCtxSuffix = ctx
    ? ctx.split(',').slice(1).map((p) => p.trim().split(':')[0]).filter(Boolean)
    : [];
  const branchNameSuffix = ctx
    ? ctx.split(',').slice(1)
      .map((p) => p.trim())
      .filter((p) => /:\s*name\b/.test(p))
      .map((p) => p.slice(0, p.indexOf(':')).trim())
      .filter(Boolean)
    : [];
  const goalStub = fam ? `[${ctx} |- ${fam} _]` : `[${ctx} |- _]`;
  // The constructor's higher-order argument descriptor whose binder arity matches —
  // the AST authority for BOTH the binder types AND the metavar's own family (an
  // under-binder `linear` sub-derivation must not be stubbed with the SCRUTINEE's
  // family, or it poisons the decreasing-candidate pool).
  const hoArgInfo = (binders) => {
    if (ci) {
      for (const at of ci.argTypes) {
        const d0 = constructorArgDescriptor(at, []);
        if (d0.higherOrder && d0.binderCtx.length === binders.length) return d0;
      }
    }
    return null;
  };

  // A higher-order sub-derivation written `\v1. … \vk. Meta[…]` inside the pattern:
  // expose Meta as a hypothesis UNDER those binders (so the IH can recurse on it).
  // Handle any binder arity generically (Beluga writes 1+ leading `\v.`).
  for (const m of String(d.concl).matchAll(/((?:\\\w+\.\s*)+)([\p{L}_][\p{L}\p{N}_']*)\[/gu)) {
    const binders = [...m[1].matchAll(/\\(\w+)\./g)].map((b) => b[1]);
    if (!binders.length) continue;
    const info = hoArgInfo(binders);
    add(m[2], info ? `[${ctx} |- ${conclusionOf(info.bodyType)}]` : goalStub, {
      underBinder: true,
      term: `${m[2]}[.., ${[...binders, ...branchCtxSuffix].join(', ')}]`,
      binderCtx: binders.map((b, i) => ({
        name: b,
        type: (info && info.binderCtx[i] && info.binderCtx[i].type) || 'name',
      })),
    });
  }
  // A constructor's higher-order ARGUMENT slot occupied by `\v. Meta[…]`: type the
  // exposed metavar by that argument's conclusion.
  if (ci) {
    for (let ai = 0; ai < ci.argTypes.length; ai += 1) {
      const desc = constructorArgDescriptor(ci.argTypes[ai], []);
      if (!desc.higherOrder) continue;
      const argGoal = `[${ctx} |- ${conclusionOf(ci.argTypes[ai])}]`;
      for (const m of String(d.concl).matchAll(/\\(\w+)\.\s*(?!\\)([\p{L}_][\p{L}\p{N}_']*)\[/gu)) {
        const args = [m[1], ...branchNameSuffix.filter((n) => n !== m[1])];
        add(m[2], argGoal, {
          underBinder: true,
          term: `${m[2]}[.., ${args.join(', ')}]`,
          binderCtx: [{ name: m[1], type: 'name' }],
        });
      }
    }
  }
  // Plain applied metavars `Meta[..…]` in the pattern box.
  for (const m of box.matchAll(/\b(\p{Lu}[\p{L}\p{N}_']*)\[\.\./gu)) {
    add(m[1], `[${ctx} |- _]`, { term: `${m[1]}[..]` });
  }
  // BARE metavar ARGUMENTS of a constructor pattern `ctor A1 A2 … An`: each Ai is a
  // sub-derivation, typed by the constructor's i-th argument type. Recover ALL of
  // them (not just the last) so the IH can recurse on every structural sub-piece.
  if (patHead && ci) {
    const argMetas = [...String(d.concl).trim().replace(/^#?\S+\s*/, '').matchAll(/(?:^|\s)(\p{Lu}[\p{L}\p{N}_']*)(?=\s|$)/gu)]
      .map((m) => m[1]);
    argMetas.forEach((name, i) => {
      const at = ci.argTypes[i];
      const stub = at ? `[${ctx} |- ${conclusionOf(at)}]` : goalStub;
      const meta = (hole.meta || []).find((x) => x && x.name === name);
      add(name, meta?.type || stub, { term: name });
    });
  }
  return out;
}


export function blockProjectionHyps(hole, code) {
  const branch = branchPatternBox(code, hole);
  const bctx = branch ? (decomposeContextual(branch)?.ctx || '') : (decomposeContextual(hole?.goal)?.ctx || '');
  if (!bctx) return [];
  const out = [];
  for (const m of (hole.meta || [])) {
    if (!m || !m.name || m.name[0] !== '#') continue;
    const bi = String(m.type || '').indexOf('block');
    if (bi < 0) continue;
    let rest = String(m.type).slice(bi + 5).trim();
    if (rest[0] === '(') rest = rest.slice(1, rest.lastIndexOf(')'));
    for (const part of rest.split(',')) {
      const colon = part.indexOf(':');
      if (colon < 0) continue;
      const fname = part.slice(0, colon).trim();
      const ftype = part.slice(colon + 1).trim();
      const head = headOfConclusion(ftype.replace(/\)\s*$/, ''));
      if (!fname || !head) continue;
      const term = `${m.name}.${fname}[..]`;
      if (branch && !branch.includes(`${m.name}.${fname}`)) continue;
      out.push({
        name: `${m.name}.${fname}`,
        type: `[${bctx} |- ${head} ${m.name}.${fname} _]`,
        where: 'meta',
        term,
      });
    }
  }
  return out;
}

// Apply a support lemma that TRANSFORMS the goal — a lemma whose conclusion head
// DIFFERS from the goal head, so its result is a new hypothesis a later move
// consumes (`let [Γ |- R] = lemma [Γ |- h] … in ?`). General: matched purely by
// conclusion/premise family heads against in-scope hypotheses; the checker certifies
// the pairing. (Same-head lemmas that CLOSE the goal are supportLemmaTexts.)


export function higherOrderHyp(h, usedNames) {
  const desc = constructorArgDescriptor(h.type, usedNames);
  if (!desc.higherOrder || !desc.bodyType) return null;
  const ctx = desc.binderCtx.map((b) => `${b.name}:${b.type}`).join(', ');
  const args = desc.binderCtx.map((b) => b.name).join(' ');
  const type = ctx ? `[${ctx} |- ${conclusionOf(desc.bodyType)}]` : `[ |- ${conclusionOf(desc.bodyType)}]`;
  return {
    name: h.name,
    type,
    where: h.where,
    term: args ? `${h.name} ${args}` : h.name,
    underBinder: true,
  };
}

// True when the hole's goal is exactly the theorem's own conclusion — then the IH
// applied to a sub-derivation INHABITS the goal directly (a bare `thm arg`, no
// result-binding `let` needed). General: matched by conclusion family head, and only
// when the conclusion carries no index arguments that would need to be unified via a
// binding pattern (a bare family like `imposs`, or a fully-parametric result).


export function premiseBoxArg(h, thm, code) {
  const ctx = boxOf(h.type).ctx;
  let term = (h.where === 'comp') ? h.name : termOf(h);
  // A metavar referenced in ITS OWN context is bare (`[Γ |- X]`); referenced in a
  // DIFFERENT context it weakens via the identity substitution (`[Γ' |- X[..]]`). A
  // CLOSED metavar (empty own context) is always bare — never `X[..]`.
  if (h.where === 'meta' && !/\[\.\./.test(term) && !/\[\]/.test(term)) {
    const hctx = normCtxPart(boxOf(h.type).ctx);
    if (!hctx || hctx === normCtxPart(ctx)) term = h.name;
    else term = `${h.name}[..]`;
  }
  return ctx ? `[${ctx} |- ${term}]` : `[ |- ${term}]`;
}


export function termOf(h) {
  if (h && h.term) return h.term;
  if (h && h.where === 'meta') {
    const d = decomposeContextual(h.type);
    if (d && d.ctx && !h.underBinder) return h.name;
  }
  return h && h.name;
}


export function boxOf(typeStr) {
  const d = decomposeContextual(typeStr);
  return d ? { ctx: d.ctx, inner: d.concl } : { ctx: '', inner: String(typeStr || '') };
}

// Split a context string on TOP-LEVEL commas only (a `block (x:tm, u:oft x _)`
// binder keeps its internal commas).

// Split a context string on TOP-LEVEL commas only (a `block (x:tm, u:oft x _)`
// binder keeps its internal commas).

export function splitCtx(ctxStr) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of String(ctxStr || '')) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// The `some [a:tp, …]`-bound variable names of a schema declaration. Needed when a
// block is re-declared at an IH call site: each some-variable is an instance the
// checker must infer there, so it is erased to `_`.

// The `some [a:tp, …]`-bound variable names of a schema declaration. Needed when a
// block is re-declared at an IH call site: each some-variable is an instance the
// checker must infer there, so it is erased to `_`.

export function schemaSomeVars(code, schemaName) {
  if (!schemaName) return [];
  const esc = String(schemaName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Comment-stripped, or a COMMENTED-OUT alternative declaration is scanned as
  // real (eq-proof-tuple's `% schema w = some [x:exp] eq x x;` made the live
  // block schema's own field references erase to `eq _ _` — every block-
  // extension call then failed "Expression is not closed"; the P5 fail-open
  // law applies to scanners as much as trims, measured 2026-07-18).
  const clean = stripLfComments(code);
  const m = new RegExp(`schema\\s+${esc}\\s*=\\s*some\\s*\\[([^\\]]*)\\]`).exec(clean);
  if (m) return m[1].split(',').map((p) => p.split(':')[0].trim()).filter(Boolean);
  // IMPLICIT some-abstraction (`schema ctx = block (x:tm, u:oft x A);`): Beluga
  // some-binds any identifier free in a field type that is neither a field name
  // nor a declared family/constructor. Those leak as "free meta-variable is
  // illegal" at IH call sites unless erased exactly like explicit some-vars.
  const b = new RegExp(`schema\\s+${esc}\\s*=\\s*([^;]*);`).exec(clean);
  if (!b) return [];
  const body = b[1];
  const fieldNames = new Set();
  for (const fm of body.matchAll(/([\p{L}_][\p{L}\p{N}_']*)\s*:/gu)) fieldNames.add(fm[1]);
  const out = new Set();
  for (const tok of body.match(/[\p{L}_][\p{L}\p{N}_']*/gu) || []) {
    if (fieldNames.has(tok)) continue;
    if (tok === 'block' || tok === 'some') continue; // GENERAL: schema syntax keywords
    if (isDeclaredTypeFamily(code, tok)) continue;
    out.add(tok);
  }
  return [...out];
}


export function letsInBranch(code, hole) {
  const body = branchBodyBefore(code, hole);
  const names = [];
  // Lazy box match (`\]\s*=` anchors the close) so a projected binding
  // `[… |- R[.., b.1, b.2]] =` — which ends in `]]` — still parses.
  for (const m of body.matchAll(/let\s+(\[[\s\S]*?\])\s*=/g)) {
    const d = decomposeContextual(m[1]);
    if (!d) continue;
    for (const part of String(d.concl).trim().split(/\s+/)) {
      // A projected binding `R[.., b.1, b.2]` reserves the NAME `R`.
      const name = part.replace(/\[.*/, '').replace(/,+$/, '');
      if (name) names.push(name);
    }
  }
  return names;
}


export function freshForHole(hole, code) {
  return freshName([...usedNamesOf(hole), ...letsInBranch(code, hole)]);
}


export function freshName(used) {
  const taken = new Set(used || []);
  let n = 0;
  return () => { let name; do { name = 'R' + (n === 0 ? '' : n); n += 1; } while (taken.has(name)); taken.add(name); return name; };
}


export function enrichHoleFromTheorem(hole, thm, code) {
  if (!hole || !thm?.compType) return hole;
  const out = { ...hole, ctx: [...(hole.ctx || [])], meta: [...(hole.meta || [])] };
  const ctxP = theoremContextParam(thm);
  if (ctxP && !out.meta.some((m) => m && m.name === ctxP.var)) {
    out.meta.push({ name: ctxP.var, type: ctxP.schema || 'ctx' });
  }
  if (branchPatternBox(code, hole)) return out;
  const boxes = thm.compType.premises.filter((p) => p.kind === 'box');
  const binders = introBinderNames(thm, boxes.length);
  if (!binders || boxes.length !== binders.length) return out;
  const lines = String(code || '').split('\n');
  const range = theoremDeclRange(code, thm.name);
  const declText = range ? lines.slice(range.start - 1, hole.line).join('\n') : lines.slice(0, hole.line).join('\n');
  for (let i = 0; i < boxes.length; i += 1) {
    const nm = binders[i];
    const esc = nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`\\bfn\\s+${esc}\\s*=>`).test(declText)) continue;
    const raw = boxes[i].raw;
    if (!raw) continue;
    const idx = out.ctx.findIndex((c) => c && c.name === nm);
    if (idx >= 0) out.ctx.splice(idx, 1);
    out.ctx.push({ name: nm, type: raw });
  }
  return out;
}

// A hole goal is normally a box `[Γ |- C]`. Occasionally the checker reports it
// doubly-wrapped as `[F [Γ |- …] …]` where F is a COMPUTATION-type family applied
// to boxes (no turnstile at the outer level). Peel one such non-turnstile wrapper
// so the inner boxed goal is what we reason about. General: keyed on the ABSENCE of
// a top-level turnstile, not on any family name.

// A hole goal is normally a box `[Γ |- C]`. Occasionally the checker reports it
// doubly-wrapped as `[F [Γ |- …] …]` where F is a COMPUTATION-type family applied
// to boxes (no turnstile at the outer level). Peel one such non-turnstile wrapper
// so the inner boxed goal is what we reason about. General: keyed on the ABSENCE of
// a top-level turnstile, not on any family name.

export function unwrapExtraGoalBox(goalStr) {
  const g = String(goalStr == null ? '' : goalStr).trim();
  if (g[0] === '[' && g.endsWith(']')) {
    const inner = g.slice(1, -1);
    // outer box has no top-level turnstile but DOES contain a nested `[… |- …]`
    if (!/\|-|⊢/.test(inner.replace(/\[[^\]]*\]/g, '')) && /\[[^\]]*(?:\|-|⊢)[^\]]*\]/.test(inner)) {
      return inner.trim();
    }
  }
  return g;
}


export function resolveHoleGoal(hole, thm) {
  if (hole?.goal) return { ...hole, goal: unwrapExtraGoalBox(hole.goal) };
  const raw = thm?.compType?.conclusion;
  if (!raw) return hole;
  const ctxVar = (hole.meta || []).find((m) => m && m.type === 'ctx')?.name
    || theoremContextParam(thm)?.var;
  const goal = raw.startsWith('[') ? raw : (ctxVar ? `[${ctxVar} |- ${raw}]` : `[${raw}]`);
  return { ...hole, goal };
}

// All candidate moves for a hole, in ONE general priority order — justified by
// each move's cost/decisiveness, NOT by which theorem it unlocks:
//   fill       — inhabit the goal directly (closes a leaf; cheapest, most decisive)
//   impossible — refute an uninhabitable hypothesis (zero-branch case; closes a leaf)
//   recurse    — apply the induction hypothesis (leaf-ish, one continuation `?`)
//   invert     — a hypothesis is fully DETERMINED (one constructor, or a parameter
//                projection when no constructor unifies) ⇒ a `let`
//   lemma      — apply a support lemma whose conclusion matches the goal head
//   split      — case-analyse a scrutinee (branches; most expensive)
//   intro      — introduce the goal's binders
// The one STRUCTURAL nuance: at a top-level hole (no case pattern yet) a split is
// the ONLY thing that can make progress on an inductive scrutinee, so it leads.
// Every move's TEXT comes from the AST/schema model; nothing here branches on a
// specific theorem, family, or variable name.

// The declared family a constructor name belongs to (its result head). Reads the
// AST once via the memoized enumerator; null when `name` isn't a constructor.

export function resultFamilyOfCtor(code, name) {
  return familyOfConstructorNameBridge(code, name);
}

// Family head that a constructor `name` constructs — found by scanning declared
// families for one whose constructor list contains `name`. Memoized per code
// string (single-entry) so the scan is paid once per program version.
let _ctorFamSrc = null;
let _ctorFamMap = null;


export function familyOfConstructorNameBridge(code, name) {
  const src = String(code || '');
  if (src !== _ctorFamSrc) {
    _ctorFamSrc = src;
    _ctorFamMap = new Map();
    // Cheap: for each candidate family head declared in the file, map its ctors.
    const fams = new Set();
    let m;
    const famDecl = /^\s*(?:LF\s+)?([\p{L}_][\p{L}\p{N}_']*)\s*:\s*(?:[^.]*->)?\s*type\s*[.=]/gmu;
    while ((m = famDecl.exec(src)) !== null) fams.add(m[1]);
    for (const f of fams) {
      for (const c of enumerateConstructorsTyped(code, f)) {
        if (!_ctorFamMap.has(c.name)) _ctorFamMap.set(c.name, f);
      }
    }
  }
  return _ctorFamMap.get(name) || null;
}

// Parse the theorem under proof from its decl text (name + comp type + totality).

// Parse the theorem under proof from its decl text (name + comp type + totality).

export function theoremUnderProof(declText) {
  const s = String(declText || '');
  const m = new RegExp(String.raw`^\s*(?:rec|proof)\s+(${DECL_IDENT})\s*:`, 'u').exec(s);
  if (!m) return null;
  const eq = declBodyEqIndex(s, m[0].length);
  if (eq < 0) return null;
  return {
    name: m[1],
    compType: parseCompType(s.slice(m[0].length, eq).trim()),
    totality: parseTotality(s),
  };
}

// ── Fragment classification for honest STUCK verdicts ───────────────────────
// The move space is CLOSED over Beluga's inductive expression formers (plan
// §1); the copattern `fun` former — the only way to CONSTRUCT an inhabitant of
// a `coinductive`-declared ctype — is deliberately out of scope. So a no-move
// stuck state whose goal CONCLUDES in a coinductive family is not a search
// gap: it is out of fragment BY CONSTRUCTION, and the verdict must say so
// instead of a bare "no-move". Purely syntax-directed — keyed on the
// `coinductive` declaration KEYWORD, never on a family or theorem name.


export function branchBodyBefore(code, hole) {
  const off = holeByteOffset(code, hole);
  if (off < 0) return code;
  const prefix = code.slice(0, off);
  const lastArm = Math.max(prefix.lastIndexOf('=>'), prefix.lastIndexOf('⇒'));
  return lastArm >= 0 ? prefix.slice(lastArm) : prefix;
}

// ANCESTOR-CHAIN body before the hole (§7 per-path discipline): the concatenated
// bodies of every ENCLOSING case-arm up to the hole, with CLOSED SIBLING arms
// excluded. branchBodyBefore sees only the innermost arm, so any guard scoped to
// it is laundered by a nested split (the measured eval_add_comm path re-accepted
// the same lemma call at three nesting depths). Bindings in an ancestor arm are
// in scope at the hole — re-deriving them is redundant on the WHOLE path — while
// a sibling arm's bindings are not, so repeats across siblings stay legal.
// Structure: nested cases are parenthesized (engine invariant 6), so the
// enclosing scopes are exactly the unclosed `(` groups; within each level the
// containing arm starts at the last depth-0 `=>`.

// ANCESTOR-CHAIN body before the hole (§7 per-path discipline): the concatenated
// bodies of every ENCLOSING case-arm up to the hole, with CLOSED SIBLING arms
// excluded. branchBodyBefore sees only the innermost arm, so any guard scoped to
// it is laundered by a nested split (the measured eval_add_comm path re-accepted
// the same lemma call at three nesting depths). Bindings in an ancestor arm are
// in scope at the hole — re-deriving them is redundant on the WHOLE path — while
// a sibling arm's bindings are not, so repeats across siblings stay legal.
// Structure: nested cases are parenthesized (engine invariant 6), so the
// enclosing scopes are exactly the unclosed `(` groups; within each level the
// containing arm starts at the last depth-0 `=>`.

export function pathBodyBefore(code, hole) {
  const off = holeByteOffset(code, hole);
  if (off < 0) return code;
  const dStart = declStartOffset(code, off);
  const region = code.slice(dStart, off);
  const opens = [];
  for (let i = 0; i < region.length; i += 1) {
    const ch = region[i];
    if (ch === '(') opens.push(i);
    else if (ch === ')') opens.pop();
  }
  // Segment boundaries: decl start, then just AFTER each unclosed `(` (so each
  // segment's own text sits at relative paren depth 0), then the hole.
  const bounds = [0, ...opens.map((i) => i + 1), region.length];
  const segs = [];
  for (let b = 0; b + 1 < bounds.length; b += 1) {
    const seg = region.slice(bounds[b], bounds[b + 1]);
    let depth = 0;
    let lastArm = -1;
    for (let i = 0; i < seg.length; i += 1) {
      const ch = seg[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (depth === 0 && ch === '>' && seg[i - 1] === '=') lastArm = i + 1;
      else if (depth === 0 && ch === '⇒') lastArm = i + 1; // GENERAL: the arm-marker glyph (syntax, not a constructor name)
    }
    segs.push(lastArm >= 0 ? seg.slice(lastArm) : seg);
  }
  return segs.join('\n');
}

// Approximate display goal for a hole at (line,col) in file text: the theorem
// header comp type when the hole is top-level in its decl (no `=>`/`fn` before it).
