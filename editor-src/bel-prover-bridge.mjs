// The bridge: wires BelJar's pure proof-search engine to the REAL model
// (bel-hole-split generators) and the REAL checker oracle (BelugaClient
// checkResult + the `## Holes ##` report). This is where "BelJar drives, Harpoon
// is an oracle" actually runs — NO Harpoon tactic calls anywhere in this path.
//
// The loop, per active hole:
//   1. Generate candidate moves from OUR model (intro / fill / recurse-via-IH /
//      split), each as body text with `?` sub-holes — ordered closing-moves first.
//   2. Splice the candidate over the hole, re-check the WHOLE program (holes are
//      wildcards, so a partial proof still type-checks `ok` — only a real type
//      error fails). The checker is the certifier.
//   3. If ok: re-read the remaining holes from the `## Holes ##` output. The holes
//      this move introduced (inside the spliced text's span) are the sub-goals;
//      recurse into each. Zero new holes ⇒ a solved leaf.
//   4. Backtrack on type-error; a hole with no working move ⇒ an honest `stuck`
//      node (reason carried), never a silent dead end.
//
// Pure move-GENERATION lives in `candidateMoves` (text in/out, unit-testable);
// the async search orchestration is `proveHoleLive`. The pure reasoning core
// (signature/totality/IH) is imported from bel-prover.mjs.

import {
  decomposeContextual,
  headOfConclusion,
  typeFamilyHead,
  enumerateConstructorsTyped,
  splitConstructorsForGoal,
  buildSplitSkeleton,
  buildIntroSkeleton,
  fillCandidates,
  invertCandidates,
  branchLetNames,
  constructorArgDescriptor,
  conclusionOf,
  schemaInfo,
  schemaAdmittedTypes,
  parameterTermFor,
  introBinders,
} from './bel-hole-split.mjs';
import { parseHoles } from './bel-holes.mjs';
import {
  parseCompType,
  parseTotality,
  boxedConclusionHead,
} from './bel-prover.mjs';

// Fresh-name helper mirroring bel-hole-split's, kept local so move-gen is pure.
function usedNamesOf(hole) {
  const out = [];
  for (const c of (hole.ctx || [])) if (c && c.name) out.push(c.name);
  for (const m of (hole.meta || [])) if (m && m.name) out.push(m.name);
  return out;
}

// Leading context-variable name of a boxed context string ("g, x:tm" → "g").
function leadCtxVar(ctxStr) {
  const first = String(ctxStr || '').split(',')[0];
  return first ? first.trim().split(/[\s:]/)[0] : '';
}

// Schema candidates for a context variable, from the hole's meta + the code.
function candidateSchemasFor(code, hole, ctxVar) {
  const out = [];
  const add = (s) => { if (s && !out.includes(s)) out.push(s); };
  if (!ctxVar) return out;
  const meta = (hole.meta || []).find((m) => m && m.name === ctxVar);
  if (meta && meta.type) add(String(meta.type).trim());
  const re = new RegExp('\\(\\s*' + ctxVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + '\\s*:\\s*([A-Za-z_][A-Za-z0-9_\']*)', 'g');
  let m;
  const src = String(code || '');
  while ((m = re.exec(src)) !== null) add(m[1]);
  return out;
}

function introBinderNames(thm, arrowCount) {
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
function splitTextFor(code, hole, varName) {
  const entry = (hole.ctx || []).find((c) => c && c.name === varName);
  if (!entry) return null;
  const decomp = decomposeContextual(entry.type);
  if (!decomp) return null;
  // The scrutinee's family head: the syntactic head of its conclusion (`hyp X A` →
  // `hyp`) when that is a declared family; else fall back to the notation-resolved
  // family (infix operators, e.g. `P ⇛ Q` → `⇛`). Guard against `typeFamilyHead`
  // collapsing a fully-applied family to its KIND (`type`).
  const synHead = headOfConclusion(decomp.concl);
  const notaHead = typeFamilyHead(decomp.concl, code);
  const head = (synHead && isDeclaredTypeFamily(code, synHead)) ? synHead
    : (notaHead && notaHead !== 'type') ? notaHead
    : synHead;
  if (!head) return null;
  // Typed enumeration reads BOTH declaration forms (the cp-suite `c : … -> F …`
  // form too). Map each constructor's arg TYPES to the {higherOrder, binders}
  // shape buildSplitSkeleton/constructorTerm expect (a function arg type ⇒
  // higher-order, with one binder per top-level arrow).
  const typed = enumerateConstructorsTyped(code, head);
  const typedFiltered = typed;
  const ctors = splitConstructorsForGoal(decomp.concl, typedFiltered.map((c) => ({
    name: c.name,
    args: c.argTypes.map((at) => ({ ...constructorArgDescriptor(at, usedNamesOf(hole)), rawType: at })),
  })), typedFiltered);
  const lead = leadCtxVar(decomp.ctx);
  const candidates = candidateSchemasFor(code, hole, lead);
  let schema = null;
  for (const name of candidates) {
    const info = schemaInfo(code, name);
    if (parameterTermFor(head, info)) { schema = info; break; }
  }
  if (!schema && candidates.length) schema = schemaInfo(code, candidates[0]);
  const schemaTypes = candidates.length ? schemaAdmittedTypes(code, candidates[0]) : null;
  const goalCtx = hole?.goal && decomposeContextual(hole.goal)?.ctx;
  const ctxStr = decomp.ctx || goalCtx;
  const hasHoCtor = ctors.some((c) => c.args?.some((a) => a.higherOrder));
  const ctxHasNames = String(ctxStr || '').split(',').some((p) => /:\s*name\b/.test(p));
  return buildSplitSkeleton(varName, ctxStr, ctors, {
    head, schema, schemaTypes, usedNames: usedNamesOf(hole),
    contextProjection: hasHoCtor || ctxHasNames,
  });
}

function theoremContextParam(thm) {
  if (!thm || !thm.compType) return null;
  const prem = thm.compType.premises.find((p) => p.kind === 'ctx');
  if (!prem) return null;
  const m = /\(\s*([A-Za-z_][A-Za-z0-9_']*)\s*:\s*([A-Za-z_][A-Za-z0-9_']*)\s*\)/.exec(prem.raw);
  return m ? { var: m[1], schema: m[2] } : { var: prem.binder, schema: null };
}

function resultBox(thm) {
  const d = thm && thm.compType && decomposeContextual(thm.compType.conclusion);
  const ctx = d && d.ctx;
  return (inner) => (ctx ? `[${ctx} |- ${inner}]` : `[ |- ${inner}]`);
}

function isDeclaredTypeFamily(code, fam) {
  if (!fam) return false;
  const re = new RegExp(`^\\s*${String(fam).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`, 'm');
  return re.test(String(code || ''));
}

function premiseDecHead(premRaw, code) {
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

function contextualBinderMeta(h) {
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
function isBlockSubderiv(h) {
  if (!h) return false;
  if (h.underBinder) return true;
  const cb = contextualBinderMeta(h);
  return !!(cb && /\bblock\b/.test(cb.ctx));
}

function metaConclusion(typeStr) {
  const t = String(typeStr || '').trim();
  const paren = /^\(\s*([^|]*)\|-\s*([\s\S]+)\)$/.exec(t);
  if (paren) return paren[2].trim();
  const d = decomposeContextual(t);
  if (d) return d.concl;
  return t;
}

function ihMetaCand(h, head) {
  if (!h || h.where !== 'meta') return false;
  if (h.underBinder) return true;
  const t = String(h.type || '').trim();
  if (t.startsWith('{')) return false;
  const concl = metaConclusion(t);
  return contextualHead(concl) === head;
}

function innerSubderivFromBranchGoal(hole, code, decHead) {
  const branch = code && hole ? branchPatternBox(code, hole) : null;
  const bd = branch && decomposeContextual(branch);
  if (!bd) return null;
  const m = /\s([A-Z][A-Za-z0-9_']*)\s*$/.exec(String(bd.concl || '').trim());
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

function decreasingHyps(hole, thm, decHead, code = '') {
  const fromBranch = branchPatternMetas(code, hole).filter((h) =>
    contextualHead(h.type) === decHead && isPremiseShapedSubderiv(h, thm),
  );
  if (fromBranch.length) return fromBranch;
  const fromGoal = innerSubderivFromBranchGoal(hole, code, decHead);
  if (fromGoal) return [fromGoal];
  const all = expandedHypsOf(hole, code);
  const ctxParam = theoremContextParam(thm);
  if (!ctxParam) {
    return all.filter((h) => h.where === 'meta' && boxedConclusionHead(h.type) === decHead);
  }
  return all.filter((h) => {
    if (ihMetaCand(h, decHead)) return isPremiseShapedSubderiv(h, thm);
    if (h.where !== 'comp' || boxedConclusionHead(h.type) !== decHead) return false;
    return !isIntroducedPremise(h, thm);
  });
}

function normCtxPart(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().replace(/\s*:\s*/g, ':');
}

function contextualHead(typeStr) {
  return headOfConclusion(conclusionOf(typeStr));
}

function isPremiseShapedSubderiv(h, thm) {
  if (h.underBinder || isBlockSubderiv(h)) return true;
  const t = String(h && h.type || '').trim();
  if (t[0] === '{' || (t[0] === '(' && !/\|-/.test(t))) return true;
  const prem = thm.compType.premises.find((p) => p.kind === 'box');
  if (!prem) return true;
  let raw = prem.raw;
  if (!raw.startsWith('[')) raw = `[${raw}]`;
  const premCtx = boxOf(raw).ctx.split(',').map(normCtxPart).filter(Boolean);
  const hypCtx = boxOf(h.type).ctx.split(',').map(normCtxPart).filter(Boolean);
  if (hypCtx.length < premCtx.length) return false;
  for (let i = 0; i < premCtx.length; i += 1) {
    if (hypCtx[i] !== premCtx[i]) {
      if (hypCtx.length > premCtx.length && hypCtx[0] === premCtx[0]) {
        const premTail = premCtx.slice(1);
        const hypTail = hypCtx.slice(1);
        return premTail.every((p) => hypTail.includes(p));
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
function isIntroducedPremise(h, thm) {
  if (h.where === 'meta') return false;
  const boxes = thm.compType.premises.filter((p) => p.kind === 'box');
  if (!boxes.length) return false;
  const decIdx = (thm.totality.kind === 'index') ? thm.totality.index - 1 : 0;
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
function subderivMetas(cands, preferComp = false, thm = null) {
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

// Recurse-via-IH candidates. The IH = the theorem applied to ALL its premises:
// `thm [Γ |- a1] … [Γ |- an]` where the DECREASING premise is filled by a
// structural sub-derivation (a cD metavar from a split, the totality guard) and
// the OTHER premises by in-scope hypotheses whose types are consistent with it
// (shared index vars unify across premises — that pairing is the crux of a
// multi-argument induction like `dl_uniq [⊢ X2] [⊢ X4]`). Each consistent
// argument-tuple yields `let [Γ |- R] = thm … in ?` binding a fresh result. For
// the classic single-premise case this reduces to `thm [⊢ D]` on each
// sub-derivation. Returns the `let … in ?` texts. Generate-and-verify: the
// checker rejects an inconsistent tuple, so we can over-propose safely.
export function recurseTexts(hole, thm, code) {
  if (!thm || !thm.compType) return [];
  const boxes = thm.compType.premises.filter((p) => p.kind === 'box');
  if (!boxes.length || !thm.totality) return [];
  const decIdx = (thm.totality.kind === 'index') ? thm.totality.index - 1 : 0;
  const decHead = premiseDecHead(boxes[decIdx] ? boxes[decIdx].raw : boxes[0].raw, code);
  if (!decHead) return [];

  const all = expandedHypsOf(hole, code);
  const ctxParam = theoremContextParam(thm);
  const rawDecCands = decreasingHyps(hole, thm, decHead, code);
  if (!rawDecCands.length) return [];
  const premHeads = boxes.map((b) => premiseDecHead(b.raw, code));
  // Candidate hypotheses for premise `i`: the decreasing premise is filled by the
  // chosen sub-derivation `dec`; every OTHER premise draws from in-scope hyps of the
  // matching family head, ranked so index-consistent pairings come first.
  const candsFor = (i, dec) => {
    if (i === decIdx) return [dec];
    let cs = ctxParam
      ? all.filter((h) => ihMetaCand(h, premHeads[i]))
      : all.filter((h) => h.where === 'meta' && contextualHead(h.type) === premHeads[i]);
    if (ctxParam?.schema) cs = subderivMetas(cs);
    return rankBySubject(cs, dec);
  };

  const fresh = freshName(usedNamesOf(hole));
  const out = [];
  const seen = new Set();

  // Single-premise theorem: recurse on EVERY decreasing sub-derivation at once (the
  // dual_sym shape: l from Dl, r from Dr → fill from both).
  if (boxes.length === 1) {
    const direct = goalMatchesTheoremConclusion(hole, thm);
    const decs = subderivMetas(rawDecCands, direct, thm);
    const lets = [];
    for (const d of decs) {
      const call = `${thm.name} ${premiseBoxArg(d, thm, code)}`;
      if (direct) { out.push(call); continue; }
      const r = fresh();
      lets.push(`let ${resultBox(thm)(r)} = ${call} in`);
    }
    // NEST the `let`s (each binds a recursion result) with a SINGLE trailing hole —
    // `let R = … in let R1 = … in ?` — never sibling `?`s (which is malformed).
    if (lets.length) out.push(lets.join('\n') + '\n?');
    return out;
  }

  // Multi-premise: for each decreasing sub-derivation, ENUMERATE the argument tuples
  // (one candidate per other premise) and propose each — ordered so index-consistent
  // tuples come first. The checker certifies the right pairing; over-propose safely.
  const rbox = resultBox(thm);
  for (const dec of rawDecCands) {
    if (ctxParam?.schema) {
      const sub = subderivMetas(rawDecCands);
      if (sub.length && !sub.includes(dec)) continue;
    }
    const perPremise = boxes.map((_, i) => candsFor(i, dec));
    if (perPremise.some((cs) => !cs.length)) continue;
    for (const tuple of cartesian(perPremise)) {
      const names = tuple.map((a) => a.name);
      if (new Set(names).size !== names.length) continue;
      const key = ctxParam?.var + '|' + thm.name + '|' + names.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      const call = `${thm.name} ${tuple.map((h) => premiseBoxArg(h, thm, code)).join(' ')}`;
      out.push(`let ${rbox(resultPattern(thm, code, fresh))} = ${call} in\n?`);
    }
  }
  return out;
}

function supportLemmaTexts(hole, currentThm, code) {
  const goal = decomposeContextual(hole && hole.goal);
  if (!goal) return [];
  const goalHead = headOfConclusion(goal.concl);
  if (!goalHead) return [];
  const all = expandedHypsOf(hole, code);
  const fresh = freshForHole(hole, code);
  const out = [];
  const seen = new Set();
  for (const lemma of theoremIndex(code)) {
    if (!lemma || !lemma.compType || (currentThm && lemma.name === currentThm.name)) continue;
    const conclHead = boxedConclusionHead(lemma.compType.conclusion);
    if (conclHead !== goalHead) continue;
    const boxes = lemma.compType.premises.filter((p) => p.kind === 'box');
    if (!boxes.length) continue;
    const perPremise = boxes.map((b) => all.filter((h) => contextualHead(h.type) === contextualHead(b.raw)));
    if (perPremise.some((cs) => !cs.length)) continue;
    const goalBox = (inner) => (goal.ctx ? `[${goal.ctx} |- ${inner}]` : `[ |- ${inner}]`);
    for (const tuple of cartesian(perPremise)) {
      const args = tuple.map((h) => {
        const b = boxOf(h.type);
        const box = (inner) => (b.ctx ? `[${b.ctx} |- ${inner}]` : `[ |- ${inner}]`);
        return box(termOf(h));
      });
      const key = lemma.name + '|' + args.join('|') + '|' + goal.ctx;
      if (seen.has(key)) continue;
      seen.add(key);
      const call = `${lemma.name} ${args.join(' ')}`;
      out.push({ name: lemma.name, text: `let ${goalBox(resultPattern(lemma, code, fresh))} = ${call} in\n?` });
    }
  }
  return out;
}

function theoremIndex(code) {
  const src = String(code || '');
  const out = [];
  const re = /\b(?:and\s+)?(?:rec|proof)\s+([A-Za-z_][A-Za-z0-9_']*)\s*:\s*([\s\S]*?)=/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const header = src.slice(m.index, re.lastIndex);
    out.push({
      name: m[1],
      compType: parseCompType(m[2].trim()),
      totality: parseTotality(header),
    });
  }
  return out;
}

// The `let`-pattern for binding the IH result. When the theorem's conclusion
// family has a UNIQUE constructor (e.g. `eq` has only `refl`), bind the result
// with THAT constructor's pattern — this REFINES the result's index variables
// (the `let [⊢ refl] = … in` idiom that unifies the two sides), which is what
// makes the outer goal provable. Otherwise bind a fresh result var.
function resultPattern(thm, code, fresh) {
  const concl = thm.compType && thm.compType.conclusion;
  const head = concl ? boxedConclusionHead(concl) : null;
  if (head) {
    const ctors = enumerateConstructorsTyped(code, head);
    if (ctors.length === 1) {
      const c = ctors[0];
      return c.argTypes.length ? `${c.name} ${c.argTypes.map(() => fresh()).join(' ')}` : c.name;
    }
  }
  return fresh();
}

// Order candidate hypotheses for a premise so those SHARING the subject (first)
// index with the decreasing arg come first — the consistent pairing in a
// uniqueness-style lemma (`dl_uniq [⊢ X2] [⊢ X4]`: X2, X4 share the left subtype).
function rankBySubject(cands, dec) {
  const decFirst = firstIndexOf(dec.type);
  return [...cands].sort((a, b) => {
    const sa = firstIndexOf(a.type) === decFirst ? 0 : 1;
    const sb = firstIndexOf(b.type) === decFirst ? 0 : 1;
    return sa - sb;
  });
}

// The first applied index of a boxed type's conclusion ("dl A B" → "A").
function firstIndexOf(typeStr) {
  const concl = boxOf(typeStr).inner;
  const toks = String(concl).trim().split(/\s+/);
  return toks.length > 1 ? toks[1] : null;
}

// Cartesian product of arrays-of-candidates (bounded — premise counts are small).
function cartesian(lists) {
  return lists.reduce((acc, list) => {
    const next = [];
    for (const combo of acc) for (const item of list) next.push([...combo, item]);
    return next;
  }, [[]]);
}

// All hypotheses available at a hole — meta-context (cD) AND computation context
// (cG) — each tagged with `where` so callers can apply context-specific rules
// (e.g. the IH structural guard requires the sub-derivation be a cD metavar).
function hypsOf(hole) {
  const out = [];
  for (const m of (hole.meta || [])) if (m && m.name) out.push({ name: m.name, type: m.type, where: 'meta' });
  for (const c of (hole.ctx || [])) if (c && c.name) out.push({ name: c.name, type: c.type, where: 'comp' });
  return out;
}

function expandedHypsOf(hole, code) {
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

function holeByteOffset(code, hole) {
  const h = normalizeHoleCol(code, hole);
  let off = offsetOfLineCol(code, h.line, h.col);
  if (off < 0 || off >= code.length || code.charAt(off) !== '?') {
    const ln = String(code || '').split('\n')[h.line - 1];
    const qi = ln ? ln.indexOf('?') : -1;
    if (qi >= 0) off = offsetOfLineCol(code, h.line, qi + 1);
  }
  return off;
}

function branchPatternBox(code, hole) {
  const off = holeByteOffset(code, hole);
  const prefix = off >= 0 ? code.slice(0, off) : code;
  const lastArm = Math.max(prefix.lastIndexOf('=>'), prefix.lastIndexOf('⇒'));
  const body = lastArm >= 0 ? prefix.slice(lastArm) : prefix;
  const armLine = body.split('\n').find((l) => /^\s*\|/.test(l));
  const line = armLine || (() => {
    const lines = String(code || '').split('\n');
    for (let i = hole.line - 1; i >= 0; i -= 1) {
      const ln = lines[i];
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
  const start = line.indexOf('[');
  const end = line.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  return line.slice(start, end + 1);
}

function branchPatternMetas(code, hole) {
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
  // Best-effort types for lambda-bound variables under a higher-order pattern: a
  // binder is a `name`-like variable unless the schema/AST says otherwise. The
  // checker certifies the actual type; this only seeds the recurse-arg context.
  const binderCtxFor = (binders) => binders.map((b) => ({ name: b, type: 'name' }));

  // A higher-order sub-derivation written `\v1. … \vk. Meta[…]` inside the pattern:
  // expose Meta as a hypothesis UNDER those binders (so the IH can recurse on it).
  // Handle any binder arity generically (Beluga writes 1+ leading `\v.`).
  for (const m of String(d.concl).matchAll(/((?:\\\w+\.\s*)+)([A-Za-z_][A-Za-z0-9_']*)\[/g)) {
    const binders = [...m[1].matchAll(/\\(\w+)\./g)].map((b) => b[1]);
    if (!binders.length) continue;
    add(m[2], goalStub, {
      underBinder: true,
      term: `${m[2]}[.., ${[...binders, ...branchCtxSuffix].join(', ')}]`,
      binderCtx: binderCtxFor(binders),
    });
  }
  // A constructor's higher-order ARGUMENT slot occupied by `\v. Meta[…]`: type the
  // exposed metavar by that argument's conclusion.
  if (ci) {
    for (let ai = 0; ai < ci.argTypes.length; ai += 1) {
      const desc = constructorArgDescriptor(ci.argTypes[ai], []);
      if (!desc.higherOrder) continue;
      const argGoal = `[${ctx} |- ${conclusionOf(ci.argTypes[ai])}]`;
      for (const m of String(d.concl).matchAll(/\\(\w+)\.\s*(?!\\)([A-Za-z_][A-Za-z0-9_']*)\[/g)) {
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
  for (const m of box.matchAll(/\b([A-Z][A-Za-z0-9_']*)\[\.\./g)) {
    add(m[1], `[${ctx} |- _]`, { term: `${m[1]}[..]` });
  }
  // BARE metavar ARGUMENTS of a constructor pattern `ctor A1 A2 … An`: each Ai is a
  // sub-derivation, typed by the constructor's i-th argument type. Recover ALL of
  // them (not just the last) so the IH can recurse on every structural sub-piece.
  if (patHead && ci) {
    const argMetas = [...String(d.concl).trim().replace(/^#?\S+\s*/, '').matchAll(/(?:^|\s)([A-Z][A-Za-z0-9_']*)(?=\s|$)/g)]
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

function blockProjectionHyps(hole, code) {
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
function helperLemmaTexts(hole, currentThm, code) {
  const goal = decomposeContextual(hole && hole.goal);
  if (!goal) return [];
  const goalHead = headOfConclusion(goal.concl);
  if (!goalHead) return [];
  const all = expandedHypsOf(hole, code);
  const fresh = freshForHole(hole, code);
  const out = [];
  const seen = new Set();
  for (const lemma of theoremIndex(code)) {
    if (!lemma || !lemma.compType || (currentThm && lemma.name === currentThm.name)) continue;
    const conclHead = boxedConclusionHead(lemma.compType.conclusion);
    if (!conclHead || conclHead === goalHead) continue;
    const lemGoal = decomposeContextual(lemma.compType.conclusion);
    if (!lemGoal || normCtxPart(lemGoal.ctx) !== normCtxPart(goal.ctx)) continue;
    const boxes = lemma.compType.premises.filter((p) => p.kind === 'box');
    if (!boxes.length) continue;
    const perPremise = boxes.map((b) => all.filter((h) => contextualHead(h.type) === contextualHead(b.raw)));
    if (perPremise.some((cs) => !cs.length)) continue;
    const lemBox = (inner) => (lemGoal.ctx ? `[${lemGoal.ctx} |- ${inner}]` : `[ |- ${inner}]`);
    for (const tuple of cartesian(perPremise)) {
      const args = tuple.map((h) => {
        const b = boxOf(h.type);
        return b.ctx ? `[${b.ctx} |- ${termOf(h)}]` : `[ |- ${termOf(h)}]`;
      });
      const key = lemma.name + '|' + args.join('|') + '|' + goal.ctx;
      if (seen.has(key)) continue;
      seen.add(key);
      const call = `${lemma.name} ${args.join(' ')}`;
      out.push({ name: lemma.name, text: `let ${lemBox(fresh())} = ${call} in\n?` });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function higherOrderHyp(h, usedNames) {
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
function goalMatchesTheoremConclusion(hole, thm) {
  if (!hole || !thm || !thm.compType) return false;
  const g = decomposeContextual(hole.goal);
  if (!g) return false;
  const gh = headOfConclusion(g.concl);
  const th = boxedConclusionHead(thm.compType.conclusion);
  if (!gh || !th || gh !== th) return false;
  // Direct inhabitation is sound when the conclusion has no index arguments to
  // reconcile (head alone determines it); otherwise we must bind + refine via `let`.
  const conclInner = boxOf(thm.compType.conclusion).inner;
  return String(conclInner).trim().split(/\s+/).length === 1;
}

function ihDirectCallTexts(hole, thm, code) {
  if (!goalMatchesTheoremConclusion(hole, thm)) return [];
  return recurseTexts(hole, thm, code).filter((t) => !t.includes('let ') && !t.includes('?'));
}

function premiseBoxArg(h, thm, code) {
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

function termOf(h) {
  if (h && h.term) return h.term;
  if (h && h.where === 'meta') {
    const d = decomposeContextual(h.type);
    if (d && d.ctx && !h.underBinder) return h.name;
  }
  return h && h.name;
}

function boxOf(typeStr) {
  const d = decomposeContextual(typeStr);
  return d ? { ctx: d.ctx, inner: d.concl } : { ctx: '', inner: String(typeStr || '') };
}

function letsInBranch(code, hole) {
  const body = branchBodyBefore(code, hole);
  const names = [];
  for (const m of body.matchAll(/let\s+\[[^\]]+\|\-\s*([^\]]+)\]\s*=/g)) {
    for (const part of m[1].trim().split(/\s+/)) if (part) names.push(part);
  }
  return names;
}

function freshForHole(hole, code) {
  return freshName([...usedNamesOf(hole), ...letsInBranch(code, hole)]);
}

function freshName(used) {
  const taken = new Set(used || []);
  let n = 0;
  return () => { let name; do { name = 'R' + (n === 0 ? '' : n); n += 1; } while (taken.has(name)); taken.add(name); return name; };
}

function enrichHoleFromTheorem(hole, thm, code) {
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
function unwrapExtraGoalBox(goalStr) {
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

function resolveHoleGoal(hole, thm) {
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
//   fill    — inhabit the goal directly (closes a leaf; cheapest, most decisive)
//   recurse — apply the induction hypothesis (leaf-ish, one continuation `?`)
//   invert  — a hypothesis is fully DETERMINED (exactly one constructor) ⇒ a `let`
//   lemma   — apply a support lemma whose conclusion matches the goal head
//   split   — case-analyse a scrutinee (branches; most expensive)
//   intro   — introduce the goal's binders
// The one STRUCTURAL nuance: at a top-level hole (no case pattern yet) a split is
// the ONLY thing that can make progress on an inductive scrutinee, so it leads.
// Every move's TEXT comes from the AST/schema model; nothing here branches on a
// specific theorem, family, or variable name.
export function candidateMoves(hole, code, thm) {
  hole = resolveHoleGoal(enrichHoleFromTheorem(hole, thm, code), thm);

  const fills = [];
  for (const t of fillCandidates(hole, code)) {
    fills.push({ kind: 'fill', text: t, rationale: 'inhabit the goal directly with ' + t });
  }
  for (const t of ihDirectCallTexts(hole, thm, code)) {
    fills.push({ kind: 'fill', text: t, rationale: 'close via the induction hypothesis ' + (thm && thm.name) });
  }

  const recurses = [];
  for (const t of recurseTexts(hole, thm, code)) {
    if (!t.includes('let ')) continue;
    recurses.push({ kind: 'recurse', text: t, rationale: 'apply the induction hypothesis ' + (thm && thm.name) });
  }

  // The current branch already destructured its SCRUTINEE — re-inverting THAT exact
  // hypothesis is a redundant self-inversion (re-binding the same constructor to
  // fresh names, no progress). Skip only the scrutinee itself (a comp hypothesis whose
  // boxed type equals a theorem premise), NOT other hypotheses of the same family — a
  // sibling premise may legitimately need inverting (e.g. dl_uniq's second argument).
  const splitDone = !!branchPatternBox(code, hole);
  const inverts = [];
  for (const c of (hole.ctx || [])) {
    if (!c || !c.name) continue;
    if (splitDone && thm && isIntroducedPremise({ type: c.type, where: 'comp' }, thm)) continue;
    const inv = invertCandidates(c, code, usedNamesOf(hole), (hole.ctx || []).filter((s) => s.name !== c.name));
    if (inv.length === 1) {
      inverts.push({ kind: 'invert', text: inv[0] + '\n?', rationale: 'invert the determined hypothesis ' + c.name });
    }
  }

  const lemmas = [];
  for (const t of helperLemmaTexts(hole, thm, code)) {
    lemmas.push({ kind: 'lemma', text: t.text, rationale: 'apply helper lemma ' + t.name });
  }
  for (const t of supportLemmaTexts(hole, thm, code)) {
    lemmas.push({ kind: 'lemma', text: t.text, rationale: 'apply support lemma ' + t.name });
  }

  const splits = [];
  for (const c of (hole.ctx || [])) {
    if (!c || !c.name) continue;
    const text = splitTextFor(code, hole, c.name);
    if (text) splits.push({ kind: 'split', text, rationale: 'case-analyse ' + c.name, scrutinee: c.name });
  }
  const topLevel = splits.length && !branchPatternBox(code, hole);

  const introInfo = introBinders(hole.goal);
  const intro = buildIntroSkeleton(hole.goal, {
    usedNames: usedNamesOf(hole),
    binderNames: introInfo ? introBinderNames(thm, introInfo.arrows) : null,
  });
  const intros = intro ? [{ kind: 'intro', text: intro, rationale: 'introduce the goal’s binders' }] : [];

  // A fill that CLOSES the goal (no `?`) is the most decisive — try those first. A
  // fill that leaves sub-holes is speculative, so it ranks AFTER the induction
  // hypothesis (the principled structural move). Then invert (determined hyp), lemma,
  // split. At a top-level hole a split must lead (nothing else applies yet).
  const closingFills = fills.filter((m) => !/\?/.test(m.text));
  const openFills = fills.filter((m) => /\?/.test(m.text));
  return topLevel
    ? [...splits, ...closingFills, ...recurses, ...openFills, ...inverts, ...lemmas, ...intros]
    : [...closingFills, ...recurses, ...openFills, ...inverts, ...lemmas, ...splits, ...intros];
}

// Parse the theorem under proof from its decl text (name + comp type + totality).
export function theoremUnderProof(declText) {
  const m = /^\s*(?:rec|proof)\s+([A-Za-z_][A-Za-z0-9_']*)\s*:\s*([\s\S]*?)=/.exec(String(declText || ''));
  if (!m) return null;
  return {
    name: m[1],
    compType: parseCompType(m[2].trim()),
    totality: parseTotality(declText),
  };
}

// ── Live orchestration: BelJar drives, the checker certifies ─────────────────
// Solve EVERY hole in `code` for the theorem `thm`, by repeatedly: re-check the
// program to read its holes (with goal/ctx/meta), take the first OPEN hole,
// generate candidate moves from our model, and accept the first move that
// type-checks AND does not increase the error count. Loop until no holes remain
// (PROVEN) or a hole has no working move (STUCK — honest partial).
//
// `oracle(code)` → Promise<{ ok, output }> (BelugaClient.checkResult, injected so
// this is testable with a stub). Returns
//   { complete, code, steps:[{move, rationale, goal}], stuck? }.
// Pure orchestration over the injected oracle + the pure model move-gen.
export async function proveProgram(initialCode, thm, oracle, opts = {}) {
  const maxSteps = opts.maxSteps || 200;
  let code = String(initialCode);
  const steps = [];
  const hardCancel = () => opts.shouldCancel && opts.shouldCancel();
  const paused = () => opts.shouldPause && opts.shouldPause();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitWhilePaused() {
    while (paused() && !hardCancel()) await sleep(50);
  }
  const runOracle = async (src) => {
    await waitWhilePaused();
    if (hardCancel()) return { ok: false, output: '', cancelled: true };
    if (opts.onPulse) opts.onPulse({ label: 'Checking…' });
    let res;
    try {
      res = await oracle(src);
    } catch (err) {
      if (paused() && !hardCancel()) {
        await waitWhilePaused();
        return runOracle(src);
      }
      throw err;
    }
    if (paused() && !hardCancel()) {
      await waitWhilePaused();
      return runOracle(src);
    }
    if (hardCancel()) return { ok: false, output: '', cancelled: true };
    return res;
  };

  // Baseline: how many errors does the program have right now (a partial proof
  // with holes still checks ok; errors come only from a genuinely bad step).
  if (hardCancel()) {
    return { complete: false, code, steps, stuck: { reason: 'cancelled' } };
  }
  const base = await runOracle(code);
  if (base.cancelled) {
    return { complete: false, code, steps, stuck: { reason: 'cancelled' } };
  }
  let baseErrors = countErrors(base);

  // PROGRESS guard: a move must change the open-goal state. We remember each
  // hole-set fingerprint we've been in; a move whose result revisits one is a
  // no-progress cycle (e.g. inverting an already-determined hypothesis to itself)
  // and is rejected — this keeps the search well-founded regardless of move kind.
  const seen = new Set();
  // Alpha-canonical fingerprint of the whole open-goal multiset (ctxSig already
  // folds the goal + hypotheses into one renaming-invariant string per hole).
  const holeSig = (h) => ctxSig(h) + '§' + branchBodyBefore(code, h).replace(/\s+/g, ' ').trim();
  const fingerprint = (holes) => holes.map(holeSig).sort().join('||');
  const baseHoles = parseHoles(base.output || '');
  seen.add(fingerprint(holesForTheorem(code, thm, baseHoles)));

  // Speculative-binding budget per goal: a `let … in ?` (recurse/invert) that adds
  // a hypothesis but leaves the leftmost GOAL alpha-unchanged is "speculative" — it
  // only pays off once a later move consumes it. We allow a bounded number of such
  // additions per distinct goal, then require a goal-CHANGING move. This kills the
  // speculative-`let` churn (e.g. `dl_uniq X2 X2` ad infinitum) generally, without
  // a per-move special case. Budget ≥ the theorem's premise count (enough lets to
  // assemble any single fill) plus slack.
  const specBudget = Math.max(4, 2 * ((thm && thm.compType && thm.compType.premises.length) || 1));
  const specCount = new Map(); // hole fingerprint → speculative additions so far

  for (let step = 0; step < maxSteps; step += 1) {
    await waitWhilePaused();
    if (hardCancel()) {
      return { complete: false, code, steps, stuck: { reason: 'cancelled' } };
    }
    const checked = await runOracle(code);
    if (checked.cancelled) {
      return { complete: false, code, steps, stuck: { reason: 'cancelled' } };
    }
    let holes = holesForTheorem(code, thm, parseHoles(checked.output || ''));
    if (!holes.length) {
      const syn = syntacticHoleInTheorem(code, thm);
      if (!syn) {
        return { complete: !!(checked.ok && countErrors(checked) <= baseErrors), code, steps };
      }
      // A `?` remains but Beluga reported no holes for it. If the check errored,
      // the report was cut short — searching blind would guess; decline honestly.
      if (countErrors(checked) > 0) {
        return {
          complete: false,
          code,
          steps,
          stuck: { reason: 'file-errors', error: firstErrorOf(checked.output) || 'the program does not check' },
        };
      }
      holes = [syn];
    }
    const armLines = holes.map((h) => caseArmLine(code, h));
    const focusArm = Math.min(...armLines);
    const pool = holes.filter((h, i) => armLines[i] === focusArm);
    let hole = resolveHoleGoal(
      normalizeHoleCol(code, enrichHoleFromTheorem(
        [...pool].sort((a, b) => scoreHole(b, code) - scoreHole(a, code))[0],
        thm,
        code,
      )),
      thm,
    );
    const goalKey = alphaGoal(hole.goal);
    const holeFp = ctxSig(hole);
    let moves = candidateMoves(hole, code, thm);
    if (!moves.length && (hole.ctx || []).length) {
      const retry = resolveHoleGoal(
        enrichHoleFromTheorem({ ...hole, ctx: [] }, thm, code),
        thm,
      );
      const retryMoves = candidateMoves(retry, code, thm);
      if (retryMoves.length) {
        hole = retry;
        moves = retryMoves;
      }
    }

    let advanced = false;
    for (const mv of moves) {
      await waitWhilePaused();
      if (hardCancel()) {
        return { complete: false, code, steps, stuck: { reason: 'cancelled' } };
      }
      if (opts.onPulse) opts.onPulse({ trying: mv.kind });
      // Duplicate-IH-call guard (cheap, pre-check): a `recurse` move whose
      // `let … = <call> in` re-derives a call ALREADY present IN THE CURRENT BRANCH
      // is redundant (the multi-arg loop re-emitting `dl_uniq [⊢ X2] [⊢ X4]`).
      // Scoped to (a) recurse only — an inversion's RHS is a bare hypothesis name
      // that legitimately recurs — and (b) the CURRENT BRANCH body (text after the
      // last `=>` before the hole), since pattern var names like `X1` repeat across
      // sibling branches and must not cross-block.
      if (mv.kind === 'recurse' || mv.kind === 'lemma') {
        const rhs = letRhsOf(mv.text);
        if (rhs && branchBodyBefore(code, hole).includes(rhs)) continue;
      }
      if (mv.kind === 'invert') {
        const rhs = letRhsOf(mv.text);
        if (rhs && branchBodyBefore(code, hole).includes(`= ${rhs} in`)) continue;
      }
      const spliced = spliceAtHole(code, hole, mv.text);
      if (spliced == null) continue;
      const res = await runOracle(spliced);
      if (res.cancelled) {
        return { complete: false, code, steps, stuck: { reason: 'cancelled' } };
      }
      const errs = countErrors(res);
      if (!res.ok || errs > baseErrors) continue;
      const nextHoles = holesForTheorem(spliced, thm, parseHoles(res.output || ''));
      const fp = fingerprint(nextHoles);
      const bodyBefore = branchBodyBefore(code, hole).trim();
      const bodyAfter = branchBodyBefore(spliced, hole).trim();
      const branchProgress = bodyAfter.length > bodyBefore.length;
      if (seen.has(fp) && !branchProgress) continue;
      // Speculative-`let` guard: if this move left the leftmost goal alpha-unchanged
      // (a `let … in ?` that only added a hypothesis), spend from the per-goal
      // budget; once exhausted, reject it so the search must change the goal.
      const stillSameGoal = nextHoles.some((h) => alphaGoal(h.goal) === goalKey);
      if (stillSameGoal && mv.kind !== 'fill' && nextHoles.length >= holes.length) {
        const used = specCount.get(holeFp) || 0;
        if (used >= specBudget) continue;
        specCount.set(holeFp, used + 1);
      }
      // Accept: real, type-correct progress.
      code = spliced;
      baseErrors = errs;
      seen.add(fp);
      steps.push({
        move: mv.kind,
        rationale: mv.rationale,
        goal: hole.goal,
        hole: { line: hole.line, col: hole.col, name: hole.name || null },
        text: mv.text,
        status: nextHoles.length ? 'open' : 'solved',
      });
      if (opts.onStep) opts.onStep({ steps: [...steps], last: steps[steps.length - 1] });
      advanced = true;
      break;
    }
    if (!advanced) {
      return {
        complete: false, code, steps, stuck: { goal: hole.goal, reason: 'no-move', hole: { line: hole.line, col: hole.col, name: hole.name || null } },
      };
    }
  }
  return { complete: false, code, steps, stuck: { reason: 'step-bound' } };
}

// A compact signature of a hole's context (meta + comp binders) for the progress
// fingerprint — two states are "the same" iff identical open goals AND identical
// available hypotheses UP TO BINDER RENAMING. We alpha-normalise: the multiset of
// hypothesis TYPES (binder names dropped) is what matters, so re-inverting a
// hypothesis to fresh-named sub-derivations of a shape already present counts as
// NO progress (the fresh names alone must not look like a new state — that was the
// infinite-inversion loop).
// We alpha-normalise the WHOLE hole (goal + all hypothesis types) with ONE shared
// renaming so cross-hypothesis variable sharing is preserved, but fresh binder
// NAMES don't fake progress. Re-inverting a hypothesis to fresh-named
// sub-derivations of a shape already present is then recognised as the same state.
// The right-hand side of a leading `let <pat> = <rhs> in …` move text (the
// applied call), or null. Used to detect a duplicate IH-call (same RHS already in
// the proof) cheaply, before paying for a checker round-trip.
function letRhsOf(moveText) {
  const m = /^let\s+.*?=\s*([\s\S]*?)\s+in\b/.exec(String(moveText || ''));
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

function branchBodyBefore(code, hole) {
  const off = holeByteOffset(code, hole);
  if (off < 0) return code;
  const prefix = code.slice(0, off);
  const lastArm = Math.max(prefix.lastIndexOf('=>'), prefix.lastIndexOf('⇒'));
  return lastArm >= 0 ? prefix.slice(lastArm) : prefix;
}

export function theoremDeclRange(code, name) {
  if (!name) return null;
  const lines = String(code || '').split('\n');
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const head = new RegExp(`^\\s*(?:rec|proof)\\s+${esc}\\s*:`);
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (head.test(lines[i])) { start = i + 1; break; }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i += 1) {
    if (/^\s*;\s*$/.test(lines[i])) { end = i + 1; break; }
    if (i > start && /^\s*(?:(?:and\s+)?rec|proof)\s+[A-Za-z_]/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

// Smaller program for the search oracle: suite prelude + schemas/complete lemmas
// from the active file + ONLY the theorem under proof. Skips sibling `?` holes so
// Beluga isn't re-checking the whole development on every move (same shape as
// prover-probes). Commit still uses the full assembled program.
export function proveOrchestrationCode(fullAssembled, thmName, declStart, declEnd, fileStart) {
  const src = String(fullAssembled || '');
  const fs = fileStart == null ? 0 : fileStart;
  const prelude = src.slice(0, fs).trimEnd();
  const filePrefix = src.slice(fs, declStart);
  const keptPrefix = stripHoledSiblingDecls(filePrefix, thmName);
  const decl = src.slice(declStart, declEnd).trim();
  const parts = [prelude, keptPrefix, decl].filter((s) => s && String(s).trim());
  return parts.join('\n\n') + '\n';
}

function stripHoledSiblingDecls(filePrefix, targetName) {
  const re = /\b(?:rec|proof)\s+([A-Za-z_][A-Za-z0-9_']*)\s*:[\s\S]*?;\s*/g;
  return String(filePrefix || '').replace(re, (block, name) => {
    if (name === targetName) return block;
    return /\?/.test(block) ? '' : block;
  }).trim();
}

function holesForTheorem(code, thm, holes) {
  const range = theoremDeclRange(code, thm && thm.name);
  if (!range) return holes;
  return holes.filter((h) => h.line >= range.start && h.line <= range.end);
}

// Locate a `?` inside the theorem decl when Beluga omitted it from ## Holes ##.
// A top-level hole (no `=>` introduced before it) has the FULL comp type as its
// goal — that is what Beluga itself reports there — so intro can bootstrap the
// search; past an arm/binder we leave the goal unknown (conclusion via resolve).
function syntacticHoleInTheorem(code, thm) {
  const range = theoremDeclRange(code, thm && thm.name);
  const lines = String(code || '').split('\n');
  const start = range ? range.start - 1 : 0;
  const end = range ? range.end : lines.length;
  for (let i = start; i < end; i += 1) {
    const col = lines[i].indexOf('?');
    if (col >= 0) {
      const upToHole = lines.slice(start, i).join('\n') + '\n' + lines[i].slice(0, col);
      const topLevel = !/=>|⇒/.test(upToHole);
      const goal = topLevel && thm?.compType?.raw ? thm.compType.raw : null;
      return { line: i + 1, col: col + 1, name: null, goal, ctx: [], meta: [] };
    }
  }
  return null;
}

// First error location/message in checker output, for an honest stuck report.
function firstErrorOf(output) {
  const lines = String(output || '').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (/error/i.test(lines[i])) {
      const loc = i > 0 && /^File\s+"/.test(lines[i - 1]) ? lines[i - 1].trim() + ' ' : '';
      return (loc + lines[i].trim()).slice(0, 300);
    }
  }
  return null;
}

function caseArmLine(code, hole) {
  const lines = String(code || '').split('\n');
  for (let i = hole.line - 1; i >= 0; i -= 1) {
    if (/^\s*\|/.test(lines[i])) return i + 1;
  }
  return hole.line;
}

function scoreHole(hole, code) {
  let s = 0;
  const pat = branchPatternBox(code, hole);
  if (pat) s += 30;
  const body = branchBodyBefore(code, hole);
  s += (body.match(/\blet\s+\[/g) || []).length * 8;
  s += branchLetNames(code, hole).length * 6;
  if (/"\w/.test(hole.goal || '')) s -= 500;
  if ((hole.meta || []).some((m) => m && /"/.test(String(m.name)))) s -= 500;
  return s;
}

function alphaGoal(goalStr) {
  const map = new Map();
  let n = 0;
  return String(goalStr == null ? '' : goalStr).replace(/\s+/g, ' ').trim()
    .replace(/[A-Z][A-Za-z0-9_']*/g, (m) => {
      if (!map.has(m)) { map.set(m, '#' + n); n += 1; }
      return map.get(m);
    });
}

function ctxSig(hole) {
  const map = new Map();
  let n = 0;
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
    .replace(/[A-Z][A-Za-z0-9_']*/g, (m) => {
      if (!map.has(m)) { map.set(m, '#' + n); n += 1; }
      return map.get(m);
    });
  const types = [];
  for (const m of (hole.meta || [])) types.push('m:' + norm(m.type));
  for (const c of (hole.ctx || [])) types.push('c:' + norm(c.type));
  // include the goal in the shared renaming so the WHOLE state is alpha-canonical
  return norm(hole.goal) + '⊢' + types.sort().join(',');
}

// Count genuine type ERRORS in checker output (NOT holes — holes are wildcards).
// A clean partial proof reports `ok:true` with a `## Holes ##` section and no
// error lines. We treat ok:false OR an explicit error marker as an error signal.
function countErrors(res) {
  if (!res) return 1;
  if (!res.ok) return 1;
  return 0;
}

// Splice `text` over the hole's `?` in `code`, using the hole's 1-based line/col.
function normalizeHoleCol(code, hole) {
  if (!hole) return hole;
  const lines = String(code || '').split('\n');
  const ln = lines[hole.line - 1];
  if (!ln) return hole;
  const qi = ln.indexOf('?');
  if (qi >= 0 && qi + 1 !== hole.col) return { ...hole, col: qi + 1 };
  return hole;
}

function holeLineIndent(code, hole) {
  const lines = String(code || '').split('\n');
  const ln = lines[hole.line - 1] || '';
  const qi = ln.indexOf('?');
  if (qi > 0) return ln.slice(0, qi);
  const m = /^(\s*)/.exec(ln);
  return m ? m[1] : '';
}

export function spliceAtHole(code, hole, text) {
  const off = holeByteOffset(code, hole);
  if (off < 0 || off >= code.length || code.charAt(off) !== '?') return null;
  const lines = String(code || '').split('\n');
  const ln = lines[hole.line - 1] || '';
  const qi = ln.indexOf('?');
  const pre = qi > 0 ? ln.slice(0, qi) : '';
  const ind = /^\s*$/.test(pre) ? pre : '';
  const cont = ind || '  ';
  const body = String(text || '').split('\n').map((line, i) => {
    const t = line.trim();
    if (!t) return '';
    return (i === 0 && !ind) ? t : cont + t;
  }).join('\n');
  return code.slice(0, off) + body + code.slice(off + 1);
}

// Byte offset of 1-based (line,col) in `code`.
function offsetOfLineCol(code, line, col) {
  let idx = 0;
  for (let l = 1; l < line; l += 1) {
    const nl = code.indexOf('\n', idx);
    if (nl === -1) return -1;
    idx = nl + 1;
  }
  return idx + (col - 1);
}
