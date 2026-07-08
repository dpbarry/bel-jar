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
  paramInvertCandidates,
  reachableTypeHeads,
  isHypArgType,
  isCTypeFamily,
  branchLetNames,
  constructorArgDescriptor,
  conclusionOf,
  schemaInfo,
  schemaAdmittedTypes,
  parameterTermFor,
  introBinders,
} from './bel-hole-split.mjs';
import { synthesize } from './bel-synth.mjs';
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
function splitTextFor(code, hole, varName, splitOpts) {
  const entry = (hole.ctx || []).find((c) => c && c.name === varName);
  if (!entry) return null;
  return splitTextForBox(code, hole, varName, entry.type, splitOpts);
}

// Same, for an arbitrary scrutinee EXPRESSION (`case [g |- U] of …` — an
// mlam-bound meta split as a constructed box) with its boxed type.
function splitTextForBox(code, hole, scrutText, boxedType, splitOpts = {}) {
  const dbg = globalThis.__splitDebug || (() => {});
  const decomp = decomposeContextual(boxedType);
  if (!decomp) { dbg('no-decomp', boxedType); return null; }
  // The scrutinee's family head: the syntactic head of its conclusion (`hyp X A` →
  // `hyp`) when that is a declared family; else fall back to the notation-resolved
  // family (infix operators, e.g. `P ⇛ Q` → `⇛`). Guard against `typeFamilyHead`
  // collapsing a fully-applied family to its KIND (`type`).
  const synHead = headOfConclusion(decomp.concl);
  const notaHead = typeFamilyHead(decomp.concl, code);
  const head = (synHead && isDeclaredTypeFamily(code, synHead)) ? synHead
    : (notaHead && notaHead !== 'type') ? notaHead
    : synHead;
  if (!head) { dbg('no-head', decomp.concl); return null; }
  dbg('head', head);
  const lead = leadCtxVar(decomp.ctx);
  const candidates = candidateSchemasFor(code, hole, lead);
  let schema = null;
  for (const name of candidates) {
    const info = schemaInfo(code, name);
    if (parameterTermFor(head, info)) { schema = info; break; }
  }
  if (!schema && candidates.length) schema = schemaInfo(code, candidates[0]);
  const schemaTypes = candidates.length ? schemaAdmittedTypes(code, candidates[0]) : null;
  // Dependency annotations for a strengthening-shaped context (a declared binder
  // tail after the context variable): a pattern metavar depends only on the tail
  // binders whose TYPES its family's constructor closure can reach. Nothing
  // reachable at all (tail nor schema) pins the metavar closed (`D[]`).
  const tailParts = splitCtx(decomp.ctx).slice(1).map((p) => {
    const colon = p.indexOf(':');
    return { name: p.slice(0, colon < 0 ? p.length : colon).trim(), head: colon < 0 ? null : headOfConclusion(p.slice(colon + 1)) };
  });
  const reachMemo = new Map();
  const reachOf = (fam) => {
    if (!reachMemo.has(fam)) reachMemo.set(fam, reachableTypeHeads(code, fam));
    return reachMemo.get(fam);
  };
  const depFor = (at, desc) => {
    if (!tailParts.length) return null;
    if (/^\s*\{/.test(at) || isHypArgType(at) || isHypArgType(desc.bodyType)) return null;
    // Notation-aware family (an infix arg `(Q ⇛ R)` is family `⇛`, not `Q`), and
    // it must be DECLARED — a metavariable head has no closure to reason from.
    const concl0 = conclusionOf(desc.higherOrder ? desc.bodyType : String(at));
    const nota = typeFamilyHead(concl0, code);
    const fam = (nota && nota !== 'type') ? nota : headOfConclusion(concl0);
    if (!fam || !isDeclaredTypeFamily(code, fam)) return null;
    const r = reachOf(fam);
    const keep = tailParts.filter((t) => t.head && r.has(t.head)).map((t) => t.name);
    if (keep.length === tailParts.length) return null; // full dependency — no annotation
    const schemaReach = schemaTypes ? [...schemaTypes].some((h2) => r.has(h2)) : true;
    if (!keep.length && !schemaReach) return { closed: true, keep: [] };
    return { closed: false, keep };
  };
  // Typed enumeration reads BOTH declaration forms (the cp-suite `c : … -> F …`
  // form too). Map each constructor's arg TYPES to the {higherOrder, binders}
  // shape buildSplitSkeleton/constructorTerm expect (a function arg type ⇒
  // higher-order, with one binder per top-level arrow).
  const typed = enumerateConstructorsTyped(code, head);
  const typedFiltered = typed;
  const ctors = splitConstructorsForGoal(decomp.concl, typedFiltered.map((c) => ({
    name: c.name,
    result: c.result, // the arm ANNOTATION binds the implicit indices from this
    args: c.argTypes.map((at) => {
      const desc = { ...constructorArgDescriptor(at, usedNamesOf(hole)), rawType: at };
      desc.dep = depFor(at, desc);
      return desc;
    }),
  })), typedFiltered);
  const goalCtx = hole?.goal && decomposeContextual(hole.goal)?.ctx;
  const ctxStr = decomp.ctx || goalCtx;
  const hasHoCtor = ctors.some((c) => c.args?.some((a) => a.higherOrder));
  const ctxHasNames = String(ctxStr || '').split(',').some((p) => /:\s*name\b/.test(p));
  dbg('ctors', ctors.length, 'ctx', ctxStr);
  const sk = buildSplitSkeleton(scrutText, ctxStr, ctors, {
    head, schema, schemaTypes, usedNames: usedNamesOf(hole),
    contextProjection: hasHoCtor || ctxHasNames,
    annotate: splitOpts.annotate,
  });
  dbg('skeleton', sk ? 'ok' : 'null');
  return sk;
}

function theoremContextParam(thm) {
  if (!thm || !thm.compType) return null;
  const prem = thm.compType.premises.find((p) => p.kind === 'ctx');
  if (prem) {
    const m = /\(\s*([A-Za-z_][A-Za-z0-9_']*)\s*:\s*([A-Za-z_][A-Za-z0-9_']*)\s*\)/.exec(prem.raw);
    return m ? { var: m[1], schema: m[2] } : { var: prem.binder, schema: null };
  }
  // An EXPLICIT schema Pi (`{g:eqCtx}`) plays the same role — a Pi binder whose
  // type is a bare identifier (a schema name, not a box).
  for (const p of thm.compType.premises) {
    if (p.kind !== 'pi') continue;
    const m = /^\{\s*([A-Za-z_][A-Za-z0-9_']*)\s*:\s*([A-Za-z_][A-Za-z0-9_']*)\s*\}$/.exec(String(p.raw).trim());
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
function resultBoxFor(thm, decArgCtx) {
  const d = thm && thm.compType && decomposeContextual(thm.compType.conclusion);
  const ctx = d && d.ctx;
  if (!ctx) return (inner) => `[ |- ${inner}]`;
  const ctxParam = theoremContextParam(thm);
  if (ctxParam && ctx === ctxParam.var && decArgCtx) {
    const boxes = thm.compType.premises.filter((p) => p.kind === 'box');
    const decIdx = (thm.totality && thm.totality.kind === 'index') ? thm.totality.index - 1 : 0;
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

function isDeclaredTypeFamily(code, fam) {
  if (!fam) return false;
  const esc = String(fam).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*(?:(?:LF|and|inductive|stratified|coinductive)\\s+)?${esc}\\s*:`, 'm');
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
  // Notation-aware head for branch-meta stubs (an infix conclusion `P x' ⇛ P' x'`
  // is family `⇛`, not `P`) — reported cD types print prefix-form and don't need it.
  const famHeadOf = (t) => {
    const c = conclusionOf(t);
    const nota = typeFamilyHead(c, code);
    return (nota && nota !== 'type') ? nota : headOfConclusion(c);
  };
  const fromBranch = branchPatternMetas(code, hole).filter((h) =>
    famHeadOf(h.type) === decHead && isPremiseShapedSubderiv(h, thm),
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
function isIntroducedPremise(h, thm) {
  if (h.where === 'meta') return false;
  const boxes = thm.compType.premises.filter((p) => p.kind === 'box');
  if (!boxes.length) return false;
  // No totality annotation ⇒ no designated decreasing premise; the introduced
  // premise defaults to the first box (recursion is separately refused upstream).
  const decIdx = (thm.totality && thm.totality.kind === 'index') ? thm.totality.index - 1 : 0;
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
function openCasesAt(code, hole) {
  const off = holeByteOffsetBridge(code, hole);
  if (off < 0) return [];
  const prefix = code.slice(0, off);
  const cases = [];
  let depth = 0;
  for (const line of prefix.split('\n')) {
    const cm = /\bcase\s+(\[[^\]]*\]|[A-Za-z_][A-Za-z0-9_']*)\s+of\b/.exec(line);
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
      const inner = /(?:\|-|⊢)\s*([A-Za-z_][A-Za-z0-9_']*)\s*\]$/.exec(scrut);
      if (inner) scrut = inner[1];
      cases.push({ scrut, depth: before + (line.slice(0, cm.index).split('(').length - line.slice(0, cm.index).split(')').length), arm: null });
    }
    const am = /^\s*\|\s*([\s\S]*?)(?:=>|⇒)/.exec(line);
    if (am && cases.length) cases[cases.length - 1].arm = am[1];
  }
  return cases;
}

function decSubderivNames(code, hole, decIdxThm) {
  const off = holeByteOffsetBridge(code, hole);
  if (off < 0) return new Set();
  const prefix = code.slice(0, off);
  // The decreasing binder: the decIdx-th `fn` binder introduced for the theorem.
  const fnNames = [...prefix.matchAll(/\bfn\s+([A-Za-z_][A-Za-z0-9_']*)\s*(?:=>|⇒)/g)].map((m) => m[1]);
  const decBinder = fnNames[decIdxThm];
  if (!decBinder) return new Set();
  const cases = openCasesAt(code, hole);
  const dec = new Set([decBinder]);
  for (const c of cases) {
    if (!c.arm || !dec.has(c.scrut)) continue;
    for (const v of c.arm.match(/[A-Z][A-Za-z0-9_']*/g) || []) dec.add(v);
  }
  dec.delete(decBinder); // the binder itself is not smaller than itself
  return dec;
}

// Byte offset of the hole's `?` (mirrors bel-hole-split's branchBodyBefore math).
function holeByteOffsetBridge(code, hole) {
  const lines = String(code).split('\n');
  if (!hole || hole.line < 1 || hole.line > lines.length) return -1;
  const ln = lines[hole.line - 1] || '';
  const qi = ln.indexOf('?');
  const col = qi >= 0 ? qi : Math.max(0, (hole.col || 1) - 1);
  let off = 0;
  for (let l = 1; l < hole.line; l += 1) off += (lines[l - 1] || '').length + 1;
  return off + col;
}

function synthMoves(hole, code, thm) {
  if (!thm || !thm.compType || !thm.totality) return [];
  const goalBox = decomposeContextual(hole && hole.goal);
  if (!goalBox) return [];
  const goal = { ctx: String(goalBox.ctx || '').trim(), concl: String(goalBox.concl || '').trim() };
  const goalParts = splitCtx(goalBox.ctx);

  const boxes = thm.compType.premises.filter((p) => p.kind === 'box');
  if (!boxes.length) return [];
  const decIdxThm = (thm.totality.kind === 'index') ? thm.totality.index - 1 : 0;
  const decNames = decSubderivNames(code, hole, decIdxThm);

  const facts = [];
  const pushFact = (name, type) => {
    if (!name || !type || !/^[A-Za-z_][A-Za-z0-9_']*$/.test(name)) return;
    let t = String(type).trim();
    if (t[0] === '(' && t[t.length - 1] === ')') t = `[${t.slice(1, -1)}]`;
    const b = decomposeContextual(t);
    if (!b) return; // schema-typed / non-boxed — not a synthesis fact
    const hp = splitCtx(b.ctx);
    if (hp.length < goalParts.length) return;
    for (let i = 0; i < goalParts.length; i += 1) {
      if (normCtxPart(hp[i]) !== normCtxPart(goalParts[i])) return;
    }
    const extras = hp.slice(goalParts.length).map((e) => {
      const c = e.indexOf(':');
      return c < 0 ? null : { name: e.slice(0, c).trim(), type: e.slice(c + 1).trim() };
    });
    if (extras.some((e) => !e || /\bblock\b/.test(e.type))) return; // block extras — outside fragment
    facts.push({
      name, extras, concl: String(b.concl || '').trim(), original: true, decOk: decNames.has(name),
    });
  };
  for (const m of (hole.meta || [])) pushFact(m && m.name, m && m.type);
  for (const c of (hole.ctx || [])) pushFact(c && c.name, c && c.type);
  if (!facts.length) return [];

  // A theorem/lemma as an engine rule: box premises' conclusions, explicit-brace
  // binders as pi args (ctx vs boxed-object), implicit paren binders dropped
  // (they take no call argument). Flex = the schematic (uppercase) names.
  const mkRule = (name, compType, isIH, totality) => {
    const conclBox = decomposeContextual(compType.conclusion);
    if (!conclBox) return null; // ctype conclusion — outside the fragment
    const premises = [];
    const pis = [];
    for (const p of compType.premises) {
      if (p.kind === 'box') {
        let raw = p.raw;
        if (raw && !raw.startsWith('[')) raw = `[${raw}]`;
        const b = decomposeContextual(raw);
        if (!b) return null;
        premises.push(String(b.concl || '').trim());
      } else if (p.kind === 'pi') {
        const inner = p.raw.slice(1, p.raw.lastIndexOf('}') >= 0 ? p.raw.lastIndexOf('}') : p.raw.length);
        const ci = inner.indexOf(':');
        if (ci < 0) return null;
        const vn = inner.slice(0, ci).trim();
        const vt = inner.slice(ci + 1).trim();
        if (vt.includes('[') || vt.includes('⊢') || vt.includes('|-')) pis.push({ kind: 'obj', varName: vn });
        else pis.push({ kind: 'ctx' });
      }
      // kind 'ctx' (implicit `(g:schema)` binder): no call argument — skip
    }
    const flex = new Set();
    const scan = (t) => {
      for (const w of String(t).match(/[A-Z][A-Za-z0-9_']*/g) || []) flex.add(w);
    };
    premises.forEach(scan);
    scan(conclBox.concl);
    for (const pi of pis) if (pi.kind === 'obj') flex.add(pi.varName); // GENERAL: 'obj' is this adapter's own pi-kind tag, not a name
    const decI = (totality && totality.kind === 'index') ? totality.index - 1 : 0;
    return {
      name, isIH, decIdx: isIH ? decI : -1, flex, pis, premises, result: String(conclBox.concl || '').trim(),
    };
  };

  const rules = [];
  for (const lem of theoremIndex(code)) {
    if (!lem || !lem.compType || (thm && lem.name === thm.name)) continue;
    const r = mkRule(lem.name, lem.compType, false, null);
    if (r) rules.push(r);
  }
  const ihRule = mkRule(thm.name, thm.compType, true, thm.totality);
  if (ihRule) rules.push(ihRule);
  if (!rules.length) return [];

  const goalFam = headOfConclusion(goal.concl);
  const fams = new Set(goalFam ? reachableTypeHeads(code, goalFam) : []);
  if (goalFam) fams.add(goalFam);
  for (const r of rules) {
    const rf = headOfConclusion(r.result);
    if (rf) fams.add(rf);
  }
  // FACT families too: refutation closing tests each hypothesis's (refined) type
  // for inhabitation, so the constructor map must cover them (`notLam` at the
  // cross arms — reachable from neither the goal nor any rule result).
  for (const f of facts) {
    const fh = headOfConclusion(f.concl);
    if (fh && /^[A-Za-z_]/.test(fh)) fams.add(fh);
  }
  const ctorsMap = new Map();
  for (const fam of fams) {
    const cs = enumerateConstructorsTyped(code, fam);
    if (cs.length) ctorsMap.set(fam, cs);
  }

  // Refinable metavariables for the engine's symmetric inversion: the hole's cD
  // metas (a pattern match may refine them — the checker does exactly that).
  const metaVars = new Set((hole.meta || [])
    .map((m) => m && m.name)
    .filter((n) => n && /^[A-Za-z_"][A-Za-z0-9_']*$/.test(n)));

  // Debug hook (no-op unless a harness installs it): expose the exact engine
  // inputs so a real stuck state can be replayed and diagnosed purely.
  if (globalThis.__synthDebug) {
    globalThis.__synthDebug({ goal, facts, rules, ctors: [...ctorsMap.keys()], decNames: [...decNames] });
  }
  const out = synthesize(goal, facts, rules, ctorsMap, { maxDepth: 5, metaVars });
  if (!out || !out.text) return [];
  const moves = [{
    kind: 'synth',
    text: out.text,
    rationale: 'goal-directed synthesis: backward chaining from the goal type',
  }];
  for (const alt of (out.alts || []).slice(0, 3)) {
    moves.push({ kind: 'synth', text: alt, rationale: 'goal-directed synthesis: refutation closing' });
  }
  return moves;
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
  if (!boxes.length) return piRecurseTexts(hole, thm, code);
  if (!thm.totality) return [];
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
    // Per dec: the schema-instantiation VARIANTS of its recursion let (`_` first,
    // then each nullary some-var instantiation — they only differ under a block).
    const perDec = [];
    const letSeen = new Set();
    const insts = someInstVariants(thm, code);
    for (const d of decs) {
      const varLets = [];
      for (const someInst of insts) {
        const args = callArgs([d], boxes, thm, code, usedNamesOf(hole), someInst);
        const call = `${thm.name} ${args.map((a) => a.text).join(' ')}`;
        if (letSeen.has(call)) continue;
        letSeen.add(call);
        if (direct) { out.push(call); continue; }
        // A CTYPE conclusion destructures via its constructor pattern
        // (`let Res [g ⊢ _] [g, x:name ⊢ refl_proc] [g ⊢ R] = str_step … in`).
        const ctypePat = ctypeResultPattern(thm, code, fresh, args[0].ctx);
        if (ctypePat) {
          varLets.push(`let ${ctypePat} = ${call} in`);
          continue;
        }
        const r = fresh();
        // A block-repackaged call binds its result ANNOTATED with the same
        // projections — declaring it over the raw binder slots so the final fill can
        // re-lambda it (`let [g, b:block (…) |- R[.., b.1, b.2]] = … in … (\y.\hy. R)`).
        const rbox1 = resultBoxFor(thm, args[0].ctx);
        const rctx1 = (decomposeContextual(rbox1('X0')) || {}).ctx || '';
        const projs1 = args[0].resultProjs
          ? (depResultProjs(thm, code, rctx1) || args[0].resultProjs)
          : null;
        const bound = projs1 ? `${r}[.., ${projs1.join(', ')}]` : r;
        varLets.push(`let ${rbox1(bound)} = ${call} in`);
      }
      if (varLets.length) perDec.push(varLets);
    }
    // NEST one let per dec (first variant) with a SINGLE trailing hole —
    // `let R = … in let R1 = … in ?` — never sibling `?`s (which is malformed).
    // The composite leads; each variant follows singly so one bad candidate
    // can't sink the others.
    if (perDec.length) {
      out.push(perDec.map((v) => v[0]).join('\n') + '\n?');
      const singles = perDec.flat();
      if (singles.length > 1) for (const l of singles) out.push(l + '\n?');
    }
    return out;
  }

  // Multi-premise: for each decreasing sub-derivation, ENUMERATE the argument tuples
  // (one candidate per other premise) and propose each — ordered so index-consistent
  // tuples come first. The checker certifies the right pairing; over-propose safely.
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
      const args = callArgs(tuple, boxes, thm, code, usedNamesOf(hole));
      const call = `${thm.name} ${args.map((a) => a.text).join(' ')}`;
      const decCtx = args[decIdx] ? args[decIdx].ctx : args[0].ctx;
      const ctypePat = ctypeResultPattern(thm, code, fresh, decCtx);
      if (ctypePat) {
        out.push(`let ${ctypePat} = ${call} in\n?`);
        continue;
      }
      const rbox = resultBoxFor(thm, decCtx);
      // When the conclusion family reaches only SOME of the result context's
      // block fields, the bound result must carry the dep-filtered projection
      // annotation (`E1[.., b.1, b.4]`); when it reaches all of them the bare
      // binding stands (the eq_trans shape — its tuple fill relies on it).
      const rctx = (decomposeContextual(rbox('X0')) || {}).ctx || '';
      let inner = null;
      if (/:\s*block\b/.test(rctx)) {
        const projs = depResultProjs(thm, code, rctx);
        const total = splitCtx(rctx).reduce((n, p) => {
          const bm = /:\s*block\s*\(?([\s\S]*?)\)?\s*$/.exec(p);
          return n + (bm ? splitCtx(bm[1]).length : 0);
        }, 0);
        if (projs && projs.length < total) inner = `${fresh()}[.., ${projs.join(', ')}]`;
      }
      if (!inner) inner = resultPattern(thm, code, fresh);
      out.push(`let ${rbox(inner)} = ${call} in\n?`);
    }
  }
  return out;
}

// Recursion for a Pi-PREMISE theorem (`rec ref : {g:eqCtx} {U:[g ⊢ exp]} [g ⊢
// eq U U]`): the IH instantiates the Pi binders — the schema Pi gets the
// decreasing argument's (possibly block-extended) context, the boxed Pi gets the
// structural sub-term: `ref [g, e:block (q:exp, _t:eq q q)] [g, e |- L[.., e.1]]`.
function piRecurseTexts(hole, thm, code) {
  if (!thm.totality) return [];
  const pis = thm.compType.premises.filter((p) => p.kind === 'pi');
  if (!pis.length) return [];
  const parsed = pis.map((p) => {
    const m = /^\{\s*([A-Za-z_][A-Za-z0-9_']*)\s*:\s*([\s\S]*)\}$/.exec(String(p.raw).trim());
    return m ? { name: m[1], type: m[2].trim() } : null;
  });
  if (parsed.some((p) => !p)) return [];
  // The decreasing subject: the LAST Pi whose type is a box.
  let decI = -1;
  for (let i = parsed.length - 1; i >= 0; i -= 1) {
    if (decomposeContextual(parsed[i].type)) { decI = i; break; }
  }
  if (decI < 0) return [];
  const decHead = premiseDecHead(parsed[decI].type, code);
  if (!decHead) return [];
  const rawDecCands = decreasingHyps(hole, thm, decHead, code);
  if (!rawDecCands.length) return [];
  const decs = subderivMetas(rawDecCands, false, thm);
  const out = [];
  const seen = new Set();
  const fresh = freshForHole(hole, code);
  for (const d of decs) {
    for (const someInst of someInstVariants(thm, code)) {
      const arg = callArgs([d], [{ raw: parsed[decI].type }], thm, code, usedNamesOf(hole), someInst)[0];
      const ctxTxt = arg.ctx || '';
      // Block declarations belong to the FIRST spelling (the context argument);
      // later arguments abbreviate to the block variable.
      const abbrev = splitCtx(ctxTxt)
        .map((p2) => (/:\s*block\b/.test(p2) ? p2.split(':')[0].trim() : p2))
        .join(', ');
      const args = parsed.map((p2, i) => {
        if (i === decI) {
          return ctxTxt === abbrev ? arg.text : arg.text.replace(`[${ctxTxt} |-`, `[${abbrev} |-`);
        }
        if (decomposeContextual(p2.type)) return `[${ctxTxt} |- _]`;
        return ctxTxt ? `[${ctxTxt}]` : '[]';
      });
      const call = `${thm.name} ${args.join(' ')}`;
      if (seen.has(call)) continue;
      seen.add(call);
      const bound = arg.resultProjs ? `${fresh()}[.., ${arg.resultProjs.join(', ')}]` : fresh();
      out.push(`let ${resultBoxFor(thm, ctxTxt)(bound)} = ${call} in\n?`);
    }
  }
  return out;
}

// The last substitution former: a binder-extended meta used in a SHORTER context
// by instantiating its extra slots with in-scope TERMS of matching family —
// `eq_sym [g |- E1[.., N, E2]]` (slot x:exp ← N, slot u:eq x x ← E2). Candidates
// are matched per-slot by type-family head; the checker certifies each tuple.
function instantiatedVariants(h, premCtx, all, code) {
  if (!h || h.where !== 'meta' || h.term) return [];
  const hp = splitCtx(boxOf(h.type).ctx);
  const pp = splitCtx(premCtx || '');
  if (hp.length <= pp.length) return [];
  for (let i = 0; i < pp.length; i += 1) {
    if (normCtxPart(hp[i]) !== normCtxPart(pp[i])) return [];
  }
  const extras = hp.slice(pp.length);
  if (extras.some((e) => /\bblock\b/.test(e) || !e.includes(':'))) return [];
  const perSlot = extras.map((e) => {
    const ty = e.slice(e.indexOf(':') + 1).trim();
    const nota = typeFamilyHead(ty, code);
    const fh = (nota && nota !== 'type') ? nota : headOfConclusion(ty);
    if (!fh) return [];
    return all.filter((s) => s !== h && s.where === 'meta' && !s.term
      && normCtxPart(boxOf(s.type).ctx) === normCtxPart(premCtx || '')
      && contextualHead(s.type) === fh)
      .slice(0, 3)
      .map((s) => s.name);
  });
  if (perSlot.some((l) => !l.length)) return [];
  const out = [];
  for (const tuple of cartesian(perSlot).slice(0, 4)) {
    out.push({
      name: h.name,
      where: 'meta',
      term: `${h.name}[.., ${tuple.join(', ')}]`,
      type: premCtx ? `[${premCtx} |- ${conclusionOf(h.type)}]` : `[ |- ${conclusionOf(h.type)}]`,
    });
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
    const perPremise = boxes.map((b) => {
      let raw2 = b.raw;
      if (raw2 && !raw2.startsWith('[')) raw2 = `[${raw2}]`;
      const pc = boxOf(raw2).ctx;
      const pHead2 = premiseDecHead(b.raw, code);
      const bas = all.filter((h) => contextualHead(h.type) === pHead2);
      const ext = [];
      for (const h of bas) ext.push(...instantiatedVariants(h, pc, all, code));
      return [...bas, ...ext];
    });
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

// The comp-LET pattern destructuring a CTYPE result: the conclusion family's
// unique constructor applied to one boxed pattern per argument — a boxed Pi gets
// the wildcard witness (`Res [g ⊢ _] …`), a premise whose family has a unique
// NULLARY constructor gets it (`[g, x:name ⊢ refl_proc]` — the ctype analog of
// the `let [⊢ refl] = …` refinement), anything else binds a fresh metavar.
// Contexts are the constructor's declared ones with the lemma's context variable
// instantiated the way the decreasing argument instantiates it. Null when the
// conclusion isn't a single-constructor ctype of this shape.
function ctypeResultPattern(lemma, code, fresh, decArgCtx) {
  const concl = (lemma && lemma.compType && lemma.compType.conclusion) || '';
  if (decomposeContextual(concl)) return null; // boxed conclusion — not a ctype
  const head = headOfConclusion(concl);
  if (!head || !isCTypeFamily(code, head)) return null;
  const ctors = enumerateConstructorsTyped(code, head);
  if (ctors.length !== 1) return null;
  const ctor = ctors[0];
  const ctxParam = theoremContextParam(lemma);
  let inst = ctxParam ? ctxParam.var : null;
  if (ctxParam && decArgCtx) {
    const boxes = lemma.compType.premises.filter((p) => p.kind === 'box');
    const decIdx = (lemma.totality && lemma.totality.kind === 'index') ? lemma.totality.index - 1 : 0;
    let raw = (boxes[decIdx] || boxes[0] || {}).raw || '';
    if (raw && !raw.startsWith('[')) raw = `[${raw}]`;
    const tail = Math.max(0, splitCtx(boxOf(raw).ctx).length - 1);
    const parts = splitCtx(decArgCtx);
    if (parts.length > tail) inst = parts.slice(0, parts.length - tail).join(', ');
  }
  const instCtx = (declCtx) => {
    if (!ctxParam || !inst) return declCtx;
    const parts = splitCtx(declCtx);
    if (parts.length && parts[0] === ctxParam.var) return [inst, ...parts.slice(1)].join(', ');
    return declCtx;
  };
  const args = [];
  for (const at of ctor.argTypes) {
    const t = String(at).trim();
    const pim = t.startsWith('{') ? /^\{\s*[A-Za-z_][A-Za-z0-9_']*\s*:\s*([\s\S]*)\}$/.exec(t) : null;
    const boxT = decomposeContextual(pim ? pim[1].trim() : t);
    if (!boxT) return null; // a non-boxed ctype argument — not this shape
    const bctx = instCtx(boxT.ctx);
    const wrap = (inner) => (bctx ? `[${bctx} |- ${inner}]` : `[ |- ${inner}]`);
    if (pim) {
      // In a block-instantiated context the existential witness must carry its
      // dependency RESTRICTION — the checker rejects a bare `_` ("requires that
      // some metavariables are further restricted"). Keep only the projections of
      // block fields whose type-head the witness's family can reach
      // (`Q'[.., b.1]`: a proc may mention the name field, never the hyp).
      const blockDecls = splitCtx(bctx).filter((p) => /\bblock\b/.test(p));
      if (blockDecls.length) {
        const nota2 = typeFamilyHead(boxT.concl, code);
        const fam2 = (nota2 && nota2 !== 'type') ? nota2 : headOfConclusion(boxT.concl);
        const reach = fam2 ? reachableTypeHeads(code, fam2) : new Set();
        const projs = [];
        for (const bd of blockDecls) {
          const bv = bd.slice(0, bd.indexOf(':')).trim();
          const bi = bd.indexOf('block');
          let rest = bd.slice(bi + 5).trim();
          if (rest[0] === '(') {
            const close = rest.lastIndexOf(')');
            rest = rest.slice(1, close < 0 ? rest.length : close);
          }
          splitCtx(rest).forEach((f, k) => {
            const fh = headOfConclusion(f.slice(f.indexOf(':') + 1));
            if (fh && reach.has(fh)) projs.push(`${bv}.${k + 1}`);
          });
        }
        args.push(wrap(`${fresh()}[..${projs.length ? ', ' + projs.join(', ') : ''}]`));
        continue;
      }
      args.push(wrap('_'));
      continue;
    }
    const nota = typeFamilyHead(boxT.concl, code);
    const fam = (nota && nota !== 'type') ? nota : headOfConclusion(boxT.concl);
    const famCtors = fam ? enumerateConstructorsTyped(code, fam) : [];
    if (famCtors.length === 1 && !famCtors[0].argTypes.length) {
      args.push(wrap(famCtors[0].name));
      continue;
    }
    args.push(wrap(fresh()));
  }
  return `${ctor.name} ${args.join(' ')}`;
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
  for (const m of String(d.concl).matchAll(/((?:\\\w+\.\s*)+)([A-Za-z_][A-Za-z0-9_']*)\[/g)) {
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
  let goal = decomposeContextual(hole && hole.goal);
  let goalIsCType = false;
  if (!goal) {
    // An UNBOXED computation-type goal (`Result [g |- P] …`) has no context of
    // its own; the context gate below is meaningless for it.
    const raw = String((hole && hole.goal) || '').trim();
    const h0 = headOfConclusion(raw);
    if (!h0 || !isCTypeFamily(code, h0)) return [];
    goal = { ctx: '', concl: raw };
    goalIsCType = true;
  }
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
    // A CTYPE-conclusion lemma (unboxed) has no context to compare — admit it; a
    // boxed conclusion must share at least the goal's context VARIABLE (a result
    // in an EXTENDED context is still consumable under a binder in the fill).
    // Against a ctype GOAL the context gate is meaningless — skip it.
    if (!goalIsCType && lemGoal && normCtxPart(lemGoal.ctx) !== normCtxPart(goal.ctx)
      && leadCtxVar(lemGoal.ctx) !== leadCtxVar(goal.ctx)) continue;
    if (!lemGoal && !isCTypeFamily(code, conclHead)) continue;
    const boxes = lemma.compType.premises.filter((p) => p.kind === 'box');
    if (!boxes.length) continue;
    const perPremise = boxes.map((b) => {
      let raw = b.raw;
      if (raw && !raw.startsWith('[')) raw = `[${raw}]`;
      const premParts = splitCtx(boxOf(raw).ctx).length;
      const pHead = premiseDecHead(b.raw, code);
      const bas = all.filter((h) => {
        if (contextualHead(h.type) !== pHead) return false;
        const hp = splitCtx(boxOf(h.type).ctx);
        // an argument already SHORTER than the premise context is already
        // strengthened — unless its trailing BLOCK packs the premise's binders
        if (hp.length >= premParts) return true;
        return /\bblock\b/.test(hp[hp.length - 1] || '');
      });
      const pc = boxOf(raw).ctx;
      const ext = [];
      for (const h of all) {
        if (contextualHead(h.type) !== pHead) continue;
        ext.push(...instantiatedVariants(h, pc, all, code));
      }
      return [...bas, ...ext];
    });
    if (perPremise.some((cs) => !cs.length)) continue;
    const decI = (lemma.totality && lemma.totality.kind === 'index') ? lemma.totality.index - 1 : 0;
    const usedN = usedNamesOf(hole);
    for (const tuple of cartesian(perPremise)) {
      const args = tuple.map((h, ti) => {
        const b = boxOf(h.type);
        // Block-slot EXPANSION: the premise declares raw binders that the
        // hypothesis' trailing block packs — call with fresh binder declarations
        // and the block slot substituted by the tuple (the str_step' idiom
        // `s_P1'[.., <y;hy>]`).
        let praw = boxes[ti].raw;
        if (praw && !praw.startsWith('[')) praw = `[${praw}]`;
        const premTail = splitCtx(boxOf(praw).ctx).slice(1);
        const hParts = splitCtx(b.ctx);
        const lastPart = hParts[hParts.length - 1] || '';
        const bm = /^([A-Za-z_][A-Za-z0-9_']*)\s*:\s*block\s*\(?([\s\S]*?)\)?\s*$/.exec(lastPart);
        if (bm && premTail.length >= 2) {
          const fields = splitCtx(bm[2]);
          const fHeads = fields.map((p) => headOfConclusion(p.slice(p.indexOf(':') + 1)));
          const pHeads = premTail.map((p) => headOfConclusion(p.slice(p.indexOf(':') + 1)));
          if (fields.length === premTail.length && fHeads.every((x, k) => x && x === pHeads[k])) {
            const names = [];
            const decls = fields.map((f, k) => {
              const colon = f.indexOf(':');
              const fn = f.slice(0, colon).trim();
              let ft = f.slice(colon + 1).trim();
              for (let q = 0; q < k; q += 1) {
                const prev = fields[q].slice(0, fields[q].indexOf(':')).trim();
                const esc = prev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                ft = ft.replace(new RegExp(`(^|[^A-Za-z0-9_'])${esc}(?![A-Za-z0-9_'])`, 'g'), `$1${names[q]}`);
              }
              let nm = fn;
              let k2 = 0;
              while (usedN.includes(nm) || names.includes(nm)) { k2 += 1; nm = fn + k2; }
              names.push(nm);
              return `${nm}:${ft}`;
            });
            const ext = [...hParts.slice(0, -1), ...decls].join(', ');
            return { text: `[${ext} |- ${h.name}[.., <${names.join(';')}>]]`, ctx: ext };
          }
        }
        return { text: b.ctx ? `[${b.ctx} |- ${termOf(h)}]` : `[ |- ${termOf(h)}]`, ctx: b.ctx };
      });
      const key = lemma.name + '|' + args.map((a) => a.text).join('|') + '|' + goal.ctx;
      if (seen.has(key)) continue;
      seen.add(key);
      const call = `${lemma.name} ${args.map((a) => a.text).join(' ')}`;
      // Bind the result in the lemma's conclusion context INSTANTIATED the way the
      // decreasing argument instantiates it (a strengthening lemma called at
      // `[g, x:name, z:name |- X]` yields its result in `[g, x:name |- R]`); a
      // CTYPE conclusion destructures via its constructor pattern instead.
      const decCtx = (args[decI] || args[0]).ctx;
      const ctypePat = ctypeResultPattern(lemma, code, fresh, decCtx);
      const lhs = ctypePat || resultBoxFor(lemma, decCtx)(fresh());
      out.push({ name: lemma.name, text: `let ${lhs} = ${call} in\n?` });
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

// Split a context string on TOP-LEVEL commas only (a `block (x:tm, u:oft x _)`
// binder keeps its internal commas).
function splitCtx(ctxStr) {
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
function schemaSomeVars(code, schemaName) {
  if (!schemaName) return [];
  const esc = String(schemaName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`schema\\s+${esc}\\s*=\\s*some\\s*\\[([^\\]]*)\\]`).exec(String(code || ''));
  if (!m) return [];
  return m[1].split(',').map((p) => p.split(':')[0].trim()).filter(Boolean);
}

function eraseSomeVars(typeText, someVars, inst = '_') {
  let out = String(typeText || '');
  for (const v of someVars) {
    const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(^|[^A-Za-z0-9_'])${esc}(?![A-Za-z0-9_'])`, 'g'), (mm, p1) => p1 + inst);
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Candidate instantiations for the schema's `some`-bound variable when a block is
// re-declared at an IH call site: `_` first (the checker infers it when the call
// determines it), then each NULLARY constructor of the variable's type — a
// restriction channel's `hyp x ⊥` is not inferable from the call site, only
// certifiable (the β∥ shape: "Expression is not closed" under `_`).
function someInstVariants(thm, code) {
  const ctxParam = theoremContextParam(thm);
  if (!ctxParam || !ctxParam.schema) return [null];
  const esc = String(ctxParam.schema).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`schema\\s+${esc}\\s*=\\s*some\\s*\\[([^\\]]*)\\]`).exec(String(code || ''));
  if (!m) return [null];
  const first = m[1].split(',')[0] || '';
  const ty = first.includes(':') ? first.slice(first.indexOf(':') + 1).trim() : '';
  if (!ty) return [null];
  const out = [null];
  for (const c of enumerateConstructorsTyped(code, headOfConclusion(ty))) {
    if (!c.argTypes.length) out.push(c.name);
  }
  return out.slice(0, 5);
}

// Repackage a hypothesis' RAW context extension as the theorem-schema's BLOCK, for
// an IH call under a binder. A sub-derivation a split/inversion exposed under
// binders lives in `(g, x:tm, u:oft x A[..] |- …)`; under a block schema that raw
// extension is ill-formed at a call site (the checker's "free meta-variable is
// illegal"), so the schema-conformant call extends the context with the block whose
// fields align positionally with the extra binders BY TYPE-FAMILY HEAD and
// substitutes each binder by the positional projection — the unique3 idiom
// `[g, b:block (x:exp, u:type_of x _) |- D[.., b.1, b.2]]`. All read from the
// schema/AST; returns { premCtx, fieldsTxt, arity } or null (no aligned block).
function blockRepackaging(h, premCtx, thm, code) {
  if (!h || h.where !== 'meta') return null;
  const hctx = boxOf(h.type).ctx;
  if (!hctx) return null;
  const hp = splitCtx(hctx);
  const pp = splitCtx(premCtx);
  if (hp.length <= pp.length) return null;
  for (let i = 0; i < pp.length; i += 1) {
    if (normCtxPart(hp[i]) !== normCtxPart(pp[i])) return null;
  }
  const extras = hp.slice(pp.length);
  if (extras.some((e) => /\bblock\b/.test(e))) return null;
  const ctxParam = theoremContextParam(thm);
  if (!ctxParam || !ctxParam.schema) return null;
  const info = schemaInfo(code, ctxParam.schema);
  const someVars = schemaSomeVars(code, ctxParam.schema);
  const heads = extras.map((e) => {
    const colon = e.indexOf(':');
    return colon >= 0 ? headOfConclusion(e.slice(colon + 1).trim()) : null;
  });
  for (const el of (info.elements || [])) {
    // full alignment, or the extras matching a field PREFIX (a lone `x:exp` under
    // `block (x:exp, _t:eq x x)` projects only `b.1` — the eq-proof ref shape).
    if (!el.block || !el.fields || el.fields.length < extras.length) continue;
    if (!heads.every((hd, i) => hd && el.fields[i] && el.fields[i].head === hd && el.fields[i].name)) continue;
    const fieldsTxt = el.fields
      .map((f) => `${f.name}:${eraseSomeVars(f.type || f.head, someVars)}`)
      .join(', ');
    return { premCtx, fieldsTxt, arity: extras.length };
  }
  return null;
}

function freshBlockVarName(used) {
  const taken = new Set(used || []);
  let i = 0;
  let n = 'b';
  while (taken.has(n)) { i += 1; n = 'b' + i; }
  return n;
}

// Dependency-filtered RESULT projections: a result bound over a block-extended
// context may only depend on the fields its CONCLUSION family can reach
// (`E1[.., b.1, b.4]` — an eq result sees the exp and eq fields of a 4-field
// eval block, never eval/notLam). Enumerated from the RESULT context's block
// declarations; null when no block or nothing reachable.
function depResultProjs(thm, code, resultCtx) {
  const conclRaw = (thm && thm.compType && thm.compType.conclusion) || '';
  const d = decomposeContextual(conclRaw);
  const c = d ? d.concl : conclRaw;
  const nota = typeFamilyHead(c, code);
  const fam = (nota && nota !== 'type') ? nota : headOfConclusion(c);
  if (!fam) return null;
  const reach = reachableTypeHeads(code, fam);
  const out = [];
  for (const p of splitCtx(resultCtx || '')) {
    const bm = /^([A-Za-z_][A-Za-z0-9_']*)\s*:\s*block\s*\(?([\s\S]*?)\)?\s*$/.exec(p);
    if (!bm) continue;
    splitCtx(bm[2]).forEach((f, k) => {
      const fh = headOfConclusion(f.slice(f.indexOf(':') + 1));
      if (fh && reach.has(fh)) out.push(`${bm[1]}.${k + 1}`);
    });
  }
  return out.length ? out : null;
}

// Segment a run of pattern binders into consecutive SCHEMA BLOCKS by type-family
// head (a 4-binder run [name, hyp, name, hyp] under `block (x:name, h:hyp x A)` is
// TWO blocks — the wtp_inp shape). Null when the binders don't tile into blocks.
function schemaChunks(binderCtx, thm, code, someInst = null) {
  const ctxParam = theoremContextParam(thm);
  if (!ctxParam || !ctxParam.schema) return null;
  const info = schemaInfo(code, ctxParam.schema);
  const someVars = schemaSomeVars(code, ctxParam.schema);
  const blocks = (info.elements || []).filter((el) => el.block && el.fields && el.fields.length
    && el.fields.every((f) => f.name && f.head));
  if (!blocks.length) return null;
  const chunks = [];
  let i = 0;
  while (i < binderCtx.length) {
    // Greedy: prefer a FULL block match, else a block whose field PREFIX matches
    // the remaining binders (a lone `y:name` under `block (x:name, h:hyp x A)`
    // consumes the block projecting only `b.1` — the str_step β∥ shape).
    let el = blocks.find((b) => b.fields.length <= binderCtx.length - i
      && b.fields.every((f, k) => headOfConclusion(binderCtx[i + k].type) === f.head));
    let used = el ? el.fields.length : 0;
    if (!el) {
      const left = binderCtx.length - i;
      el = blocks.find((b) => b.fields.length > left
        && b.fields.slice(0, left).every((f, k) => headOfConclusion(binderCtx[i + k].type) === f.head));
      used = left;
    }
    if (!el) return null;
    chunks.push({
      fieldsTxt: el.fields.map((f) => `${f.name}:${eraseSomeVars(f.type || f.head, someVars, someInst || '_')}`).join(', '),
      arity: used,
    });
    i += used;
  }
  return chunks;
}

// The IH-call arguments for a tuple of hypotheses (tuple[i] fills premise i), each
// as { text, ctx }. A hypothesis whose context raw-extends its premise's context
// under a block schema is repackaged via blockRepackaging, sharing ONE block binder
// per block shape across the call (the reference idiom: the first argument spells
// `g, b:block (…)`, later ones abbreviate `g, b`). A pattern metavar seen UNDER
// `\`-binders (annotated `X[.., y, x]`) re-binds those binders as context
// declarations inserted after the context variable, before the branch tail —
// matching the annotation's slot order — and references the metavar bare:
// `str_lin [g, y:name, x:name |- X]` (the reference strengthening idiom).
function callArgs(tuple, boxes, thm, code, used, someInst = null) {
  const vars = new Map();
  return tuple.map((h, i) => {
    let raw = (boxes[Math.min(i, boxes.length - 1)] || {}).raw || '';
    if (raw && !raw.startsWith('[')) raw = `[${raw}]`;
    const plan = blockRepackaging(h, boxOf(raw).ctx, thm, code);
    if (plan) {
      let bv = vars.get(plan.fieldsTxt);
      const first = !bv;
      if (!bv) {
        bv = freshBlockVarName([...(used || []), ...vars.values()]);
        vars.set(plan.fieldsTxt, bv);
      }
      const projs = Array.from({ length: plan.arity }, (_, k) => `${bv}.${k + 1}`).join(', ');
      const ctxTxt = first
        ? `${plan.premCtx}, ${bv}:block (${plan.fieldsTxt})`
        : `${plan.premCtx}, ${bv}`;
      return { text: `[${ctxTxt} |- ${h.name}[.., ${projs}]]`, ctx: ctxTxt };
    }
    if (h.where === 'meta' && h.underBinder && Array.isArray(h.binderCtx) && h.binderCtx.length) {
      const base = splitCtx(boxOf(h.type).ctx);
      if (base.length) {
        // Under a BLOCK schema the binders must be repackaged as blocks inserted
        // before the strengthened tail, with the metavar substituted by the
        // projections then the tail (the cp str_wtp idiom:
        // `[g, b:block (x:name, h:hyp x _), z:name, hz:hyp z C[] |- X[.., b.1, b.2, z, hz]]`).
        const chunks = schemaChunks(h.binderCtx, thm, code, someInst);
        if (chunks) {
          const decls = [];
          const projs = [];
          for (const ch of chunks) {
            const bv = freshBlockVarName([...(used || []), ...vars.values(), ...decls.map((d) => d.split(':')[0])]);
            decls.push(`${bv}:block (${ch.fieldsTxt})`);
            for (let k = 1; k <= ch.arity; k += 1) projs.push(`${bv}.${k}`);
          }
          const tailNames = base.slice(1).map((p) => p.split(':')[0].trim());
          const ext = [base[0], ...decls, ...base.slice(1)].join(', ');
          const suffix = [...projs, ...tailNames].join(', ');
          return { text: `[${ext} |- ${h.name}[.., ${suffix}]]`, ctx: ext, resultProjs: projs };
        }
        // Bare schema: raw binder declarations in annotation-slot order, metavar bare.
        const ext = [base[0], ...h.binderCtx.map((b) => `${b.name}:${b.type}`), ...base.slice(1)].join(', ');
        return { text: `[${ext} |- ${h.name}]`, ctx: ext };
      }
    }
    return { text: premiseBoxArg(h, thm, code), ctx: boxOf(h.type).ctx };
  });
}

function letsInBranch(code, hole) {
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
  const recTexts = recurseTexts(hole, thm, code);
  for (const t of recTexts) {
    if (!t.includes('let ')) continue;
    recurses.push({ kind: 'recurse', text: t, rationale: 'apply the induction hypothesis ' + (thm && thm.name) });
  }
  // When the goal's family IS the theorem's conclusion family, a recursion's
  // result may close the goal directly — offer each recurse RHS as a closing
  // fill (the tail-call `deterministic [g |- D2] [g |- F3]` shape; the checker
  // arbitrates the indices).
  {
    const gd0 = decomposeContextual(hole.goal);
    const goalHead0 = gd0 ? headOfConclusion(gd0.concl) : headOfConclusion(String(hole.goal || ''));
    const thmConclHead = boxedConclusionHead((thm && thm.compType && thm.compType.conclusion) || '');
    if (goalHead0 && goalHead0 === thmConclHead) {
      for (const t of recTexts) {
        const rhs = letRhsOf(t);
        if (rhs) fills.push({ kind: 'fill', text: rhs, rationale: 'close via the induction hypothesis ' + (thm && thm.name) });
      }
    }
  }

  // The current branch already destructured its SCRUTINEE — re-inverting THAT exact
  // hypothesis is a redundant self-inversion (re-binding the same constructor to
  // fresh names, no progress). Skip only the scrutinee itself (a comp hypothesis whose
  // boxed type equals a theorem premise), NOT other hypotheses of the same family — a
  // sibling premise may legitimately need inverting (e.g. dl_uniq's second argument).
  const splitDone = !!branchPatternBox(code, hole);
  // ANY enclosing case's scrutinee is already destructured by its branch
  // pattern — re-analysing it (at any nesting depth) is vacuous by construction:
  // the nested case type-checks but derives nothing, and each round respawns the
  // whole branch search one level deeper (the re-split spiral).
  // openCasesAt tracks CLOSURE (a `(case f of …)` that already ended does not
  // block f elsewhere) — unlike the old nearest-`case`-regex, whose staleness
  // both blocked the legitimate split and let the vacuous re-split through.
  const caseScrutSet = new Set(splitDone ? openCasesAt(code, hole).map((c2) => c2.scrut) : []);
  const inverts = [];
  const impossibles = [];
  for (const c of (hole.ctx || [])) {
    if (!c || !c.name) continue;
    if (caseScrutSet.has(c.name)) continue;
    if (splitDone && thm && isIntroducedPremise({ type: c.type, where: 'comp' }, thm)) continue;
    const inv = invertCandidates(c, code, usedNamesOf(hole), (hole.ctx || []).filter((s) => s.name !== c.name));
    if (inv.length === 1) {
      inverts.push({ kind: 'invert', text: inv[0] + '\n?', rationale: 'invert the determined hypothesis ' + c.name });
      continue;
    }
    if (inv.length) continue;
    // NO constructor result unifies with this hypothesis' conclusion. If it mentions
    // a parameter, its only origin is a context-block projection — the inversion
    // `let [Γ |- #q.field[..]] = h in` (schema-driven; the checker certifies the
    // refinement it forces).
    let param = null;
    const lead = leadCtxVar(boxOf(c.type).ctx);
    for (const schemaName of candidateSchemasFor(code, hole, lead)) {
      const pv = paramInvertCandidates(c, schemaInfo(code, schemaName), usedNamesOf(hole));
      if (pv.length === 1) { param = pv[0]; break; }
    }
    if (param) {
      inverts.push({ kind: 'invert', text: param + '\n?', rationale: 'invert ' + c.name + ' to a context-block projection' });
      continue;
    }
    // Neither a constructor nor a parameter can inhabit it — the hypothesis type is
    // plausibly EMPTY, so propose the zero-branch case `impossible h`; Beluga itself
    // certifies the coverage refutation (a wrong guess is simply rejected).
    if (decomposeContextual(c.type)) {
      impossibles.push({ kind: 'impossible', text: `impossible ${c.name}`, rationale: 'refute the uninhabitable hypothesis ' + c.name });
    }
  }
  // A cD sub-derivation can be refutable too (`impossible [g |- NL]` — a
  // `notLam (lam …)` exposed by inversion). Gated on the family HAVING
  // constructors (emptiness-by-conflict), none of which unify.
  for (const m3 of (hole.meta || [])) {
    if (!m3 || !m3.name || m3.name[0] === '#' || m3.name[0] === '"') continue;
    const d3 = decomposeContextual(m3.type);
    if (!d3 || !d3.concl) continue;
    const fam3 = typeFamilyHead(d3.concl, code);
    if (!fam3 || fam3 === 'type' || !enumerateConstructorsTyped(code, fam3).length) continue;
    if (invertCandidates({ name: m3.name, type: m3.type }, code, usedNamesOf(hole), []).length) continue;
    if (String(d3.concl).includes('#')) continue; // parameter territory
    impossibles.push({
      kind: 'impossible',
      text: `impossible [${d3.ctx || ''} |- ${m3.name}]`,
      rationale: 'refute the uninhabitable sub-derivation ' + m3.name,
    });
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
    // Never RE-split the enclosing case's own scrutinee inside its branch — the
    // nested case type-checks but derives nothing, and each round respawns the
    // whole branch search one level deeper (the spiral).
    if (caseScrutSet.has(c.name)) continue;
    // A hypothesis already DESTRUCTURED by an inversion in this branch
    // (`let [ |- pat] = e in`) must not be case-split either: destructuring is
    // idempotent, so the nested case is vacuous — it re-binds the same
    // components under fresh names (and fresh index metas, corrupting the
    // decreasing-candidate scoping downstream).
    if (branchBodyBefore(code, hole).includes(`= ${c.name} in`)) continue;
    // TWO variants, checker-arbitrated: ANNOTATED arms first (bind the implicit
    // indices so branch bodies may reference them — the bigstep chains need it),
    // then BARE (strengthening/block shapes reject bare annotation index vars).
    // A NESTED case must be parenthesized — otherwise the OUTER case's remaining
    // arms parse as arms of the inner one (the reference writes `(case f of …)`).
    const annotated = splitTextFor(code, hole, c.name);
    const bare = splitTextFor(code, hole, c.name, { annotate: false });
    for (const text of [annotated, ...(bare !== annotated ? [bare] : [])]) {
      if (!text) continue;
      splits.push({
        kind: 'split',
        text: splitDone ? `(${text})` : text,
        rationale: 'case-analyse ' + c.name,
        scrutinee: c.name,
      });
    }
  }
  // The theorem's OWN Pi-bound metas (mlam binders) split as CONSTRUCTED boxes
  // (`case [g |- U] of …`) — never arbitrary sub-derivation metas.
  const piNames = (((thm && thm.compType && thm.compType.premises) || [])
    .filter((p) => p.kind === 'pi').map((p) => p.binder)).filter(Boolean);
  const normScrut = (s) => String(s || '').replace(/\s+/g, '');
  for (const m2 of (hole.meta || [])) {
    if (!m2 || !m2.name || !piNames.includes(m2.name)) continue;
    const d2 = decomposeContextual(m2.type);
    if (!d2 || !d2.concl) continue;
    const scrutText = d2.ctx ? `[${d2.ctx} |- ${m2.name}]` : `[ |- ${m2.name}]`;
    if ([...caseScrutSet].some((cs) => normScrut(scrutText) === normScrut(cs) || normScrut(m2.name) === normScrut(cs))) continue;
    const boxedType = d2.ctx ? `[${d2.ctx} |- ${d2.concl}]` : `[ |- ${d2.concl}]`;
    const annotated2 = splitTextForBox(code, hole, scrutText, boxedType);
    const bare2 = splitTextForBox(code, hole, scrutText, boxedType, { annotate: false });
    for (const text of [annotated2, ...(bare2 !== annotated2 ? [bare2] : [])]) {
      if (!text) continue;
      splits.push({
        kind: 'split',
        text: splitDone ? `(${text})` : text,
        rationale: 'case-analyse ' + scrutText,
        scrutinee: scrutText,
      });
    }
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
  // Goal-directed SYNTHESIS (backward chaining): derives a COMPLETE hole-closing
  // let-chain by unification when one exists in its fragment. It is a CLOSING
  // move (no `?` in its text), so it ranks with the closers — before any
  // refining move (invert/split), which can otherwise spiral: each invert/split
  // manufactures fresh metas that admit further inverts/splits, "progressing"
  // forever without approaching closure. A certified complete chain is never
  // worse than a speculative refinement of the same hole. Single-step closing
  // fills still lead (prefer the shortest certified closer).
  const synths = synthMoves(hole, code, thm);
  return topLevel
    ? [...splits, ...closingFills, ...synths, ...impossibles, ...recurses, ...openFills, ...inverts, ...lemmas, ...intros]
    : [...closingFills, ...synths, ...impossibles, ...recurses, ...openFills, ...inverts, ...lemmas, ...splits, ...intros];
}

// ── Sound syntactic PRE-FILTER (E2b) ─────────────────────────────────────────
// The search pays a full checker round-trip per candidate move. Most candidates
// are rejectable IN-PROCESS by a cheap, SOUND head-family check — one that never
// rejects a move the checker would accept. This collapses O(candidates) worker
// calls to O(survivors) (usually 1–3). The discipline: when in ANY doubt, return
// true (pass through to the checker) — soundness over completeness.
//
// The single high-yield rule: a CLOSING fill `[Γ ⊢ H a…]` whose head `H` is a
// DECLARED CONSTRUCTOR can only inhabit a goal of `H`'s RESULT family. If the goal
// head is a different declared family, the fill is dead — skip the checker. We only
// judge fills with a rigid constructor head against a rigid goal family head; a
// metavariable/parameter head, an infix-notation head, or a non-boxed goal all
// pass through untouched.
export function movePrefilterOk(mv, hole, code) {
  if (!mv || mv.kind !== 'fill') return true;
  const t = String(mv.text || '').trim();
  if (/\?/.test(t)) return true;               // open fill — not a closing inhabitant
  if (/\blet\b|\\|=>/.test(t)) return true;     // a call/binder form, not a bare box
  const box = decomposeContextual(t);
  if (!box) return true;                        // not a boxed term — don't judge
  const termHead = headOfConclusion(box.concl);
  if (!termHead || !/^[A-Za-z_]/.test(termHead)) return true; // metavar/param/#-head
  // The term head must be a DECLARED constructor with a known result family; else
  // (a bound var, a projection, an unknown) we can't judge soundly → pass.
  const ctors = enumerateConstructorsTyped(code, resultFamilyOfCtor(code, termHead));
  const ctor = ctors.find((c) => c.name === termHead);
  if (!ctor || !ctor.result || !ctor.result.head) return true;
  const gd = decomposeContextual(hole && hole.goal);
  if (!gd) return true;
  const goalHead = headOfConclusion(gd.concl);
  // (1) HEAD check: reject when both heads are rigid declared families and differ.
  if (goalHead && /^[A-Za-z_]/.test(goalHead) && isDeclaredTypeFamily(code, goalHead)
    && ctor.result.head !== goalHead) return false;

  // (2) ARGUMENT-FAMILY check (the high-yield one): each explicit constructor arg
  // has a declared family; if the fill passes a BARE in-scope hypothesis whose own
  // declared family differs, the fill is dead — reject, no checker. Sound: we only
  // judge args that are (a) a bare identifier naming a scope hyp of (b) a KNOWN
  // rigid family, against (c) a first-order (non-Pi, non-higher-order) ctor arg of
  // (d) a known rigid family. Anything else (metavars, `_`, lambdas, unknown types)
  // passes. This is what kills `eq_app d M1` where `d : eval …`.
  //
  // POSITIONAL-ALIGNMENT guard: `argTypes` excludes explicit `{Pi}` binders (the
  // spine walker skips them), but the TERM's args include their instances — so a
  // Pi-typed constructor shifts the alignment and judging would be UNSOUND. Only
  // judge when the ctor's declaration provably has no `{` and the arity matches
  // exactly; any doubt (decl not found, `{` anywhere in it) → pass to the checker.
  const argToks = splitTopLevelArgs(box.concl).slice(1); // drop the head
  if (argToks.length && argToks.length === ctor.argTypes.length
    && !ctorDeclHasPi(code, termHead)) {
    const scope = scopeFamilyMap(hole);
    for (let i = 0; i < argToks.length; i += 1) {
      const a = String(argToks[i]).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_']*(\[[^[\]]*\])?$/.test(a)) continue; // not a bare hyp
      const aName = a.replace(/\[[^[\]]*\]$/, '');
      const aFam = scope.get(aName);
      if (!aFam) continue; // unknown-typed hyp — can't judge
      const at = ctor.argTypes[i];
      const desc = constructorArgDescriptor(at, []);
      if (desc.higherOrder || /^\s*\{/.test(String(at))) continue; // Pi/HO arg — skip
      const wantFam = headOfConclusion(conclusionOf(String(at)));
      if (!wantFam || !isDeclaredTypeFamily(code, wantFam)) continue;
      if (aFam !== wantFam) return false; // rigid family mismatch — dead fill
    }
  }
  return true;
}

// Does constructor `name`'s DECLARATION contain an explicit `{Pi}` binder? Any `{`
// before the declaration's terminator (a depth-agnostic, conservative scan), or a
// declaration we cannot locate at all, answers TRUE — which makes the caller skip
// judging (sound). Terminators: `;`, a `.` followed by whitespace/EOF (so `b.1`
// projections don't cut the scan short), or a newline whose next line opens with
// `|`/`;` (the LF-block arm boundary).
let _ctorPiSrc = null;
let _ctorPiMap = null;
function ctorDeclHasPi(code, name) {
  const src = String(code || '');
  if (src !== _ctorPiSrc) { _ctorPiSrc = src; _ctorPiMap = new Map(); }
  if (_ctorPiMap.has(name)) return _ctorPiMap.get(name);
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\n|\\|)\\s*${esc}\\s*:`, 'g');
  let m;
  let found = false;
  let hasPi = false;
  while ((m = re.exec(src)) !== null && !hasPi) {
    found = true;
    const rest = src.slice(m.index + m[0].length);
    let end = rest.length;
    for (let i = 0; i < rest.length; i += 1) {
      const ch = rest[i];
      if (ch === ';') { end = i; break; }
      if (ch === '.' && (i + 1 >= rest.length || /\s/.test(rest[i + 1]))) { end = i; break; }
      if (ch === '\n' && /^\s*[|;]/.test(rest.slice(i + 1, i + 40))) { end = i; break; }
    }
    if (rest.slice(0, end).includes('{')) hasPi = true;
  }
  const out = !found || hasPi;
  _ctorPiMap.set(name, out);
  return out;
}

// Map from an in-scope hypothesis NAME to its rigid declared family head (meta +
// comp binders). Used by the argument-family pre-filter. Only entries whose family
// is a real declared family are included; ambiguous/notation heads are omitted so
// the filter stays sound (an absent entry means "don't judge").
function scopeFamilyMap(hole) {
  const m = new Map();
  const add = (name, type) => {
    if (!name || !type) return;
    const f = contextualHead(type);
    if (f && /^[A-Za-z_]/.test(f)) m.set(name, f);
  };
  for (const h of (hole.meta || [])) add(h && h.name, h && h.type);
  for (const c of (hole.ctx || [])) add(c && c.name, c && c.type);
  return m;
}

// Split the goal/term conclusion into top-level tokens (head + args), parens kept
// whole. `eq_app d M1` → ['eq_app','d','M1']; `eq_app (foo x) M1` → 3 toks.
function splitTopLevelArgs(concl) {
  const s = String(concl || '').trim();
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    if (/\s/.test(ch) && depth === 0) { if (cur) { out.push(cur); cur = ''; } } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// The declared family a constructor name belongs to (its result head). Reads the
// AST once via the memoized enumerator; null when `name` isn't a constructor.
function resultFamilyOfCtor(code, name) {
  return familyOfConstructorNameBridge(code, name);
}

// Family head that a constructor `name` constructs — found by scanning declared
// families for one whose constructor list contains `name`. Memoized per code
// string (single-entry) so the scan is paid once per program version.
let _ctorFamSrc = null;
let _ctorFamMap = null;
function familyOfConstructorNameBridge(code, name) {
  const src = String(code || '');
  if (src !== _ctorFamSrc) {
    _ctorFamSrc = src;
    _ctorFamMap = new Map();
    // Cheap: for each candidate family head declared in the file, map its ctors.
    const fams = new Set();
    let m;
    const famDecl = /^\s*(?:LF\s+)?([A-Za-z_][A-Za-z0-9_']*)\s*:\s*(?:[^.]*->)?\s*type\s*[.=]/gm;
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
  // Move-space trace (opts.collectTrace): one entry per visited hole with every
  // candidate's verdict — the data the Move-space view and the stuck card render.
  const trace = opts.collectTrace ? [] : null;
  let oracleCalls = 0;
  let oracleCallsAtStep = 0;

  const runOracle = async (src) => {
    await waitWhilePaused();
    if (hardCancel()) return { ok: false, output: '', cancelled: true };
    if (opts.onPulse) opts.onPulse({ label: 'Checking…' });
    oracleCalls += 1;
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

  // Carry the accepting candidate's oracle result into the next step: the loop-top
  // check of `code` is byte-identical to the check that just accepted it (and, on
  // the first iteration, to `base`), so re-running it is a pure waste of one full
  // checker round-trip per accepted step.
  let carried = { forCode: code, res: base };

  for (let step = 0; step < maxSteps; step += 1) {
    await waitWhilePaused();
    if (hardCancel()) {
      return { complete: false, code, steps, stuck: { reason: 'cancelled' } };
    }
    const checked = (carried && carried.forCode === code) ? carried.res : await runOracle(code);
    carried = null;
    if (checked.cancelled) {
      return { complete: false, code, steps, stuck: { reason: 'cancelled' } };
    }
    let holes = holesForTheorem(code, thm, parseHoles(checked.output || ''));
    if (!holes.length) {
      const syn = syntacticHoleInTheorem(code, thm);
      if (!syn) {
        return { complete: !!(checked.ok && countErrors(checked) <= baseErrors), code, steps, trace: trace || undefined };
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
    const branchAtHole = branchPatternBox(code, hole);
    const holeCtxSnap = (hole.ctx || []).map((b) => ({ name: b.name, type: b.type }));
    const holeMetaSnap = (hole.meta || []).map((b) => ({ name: b.name, type: b.type }));
    const focusMeta = {
      armLine: caseArmLine(code, hole),
      score: scoreHole(hole, code),
      siblingCount: holes.length,
    };
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

    // Cheap pre-guards, hoisted: they read only step-invariant state (`code`,
    // `hole`), so evaluating them up front is identical to the old lazy order.
    // Duplicate-IH-call guard: a `recurse` move whose `let … = <call> in`
    // re-derives a call ALREADY present IN THE CURRENT BRANCH is redundant (the
    // multi-arg loop re-emitting `dl_uniq [⊢ X2] [⊢ X4]`). Scoped to (a) recurse
    // only — an inversion's RHS is a bare hypothesis name that legitimately
    // recurs — and (b) the CURRENT BRANCH body, since pattern var names like `X1`
    // repeat across sibling branches and must not cross-block. Then the SOUND
    // PRE-FILTER: skip a candidate the checker would provably reject, without
    // paying the round-trip.
    const cands = [];
    // Per-hole TRIED record (the Move-space view + the stuck card): every
    // candidate that reached this hole, with its verdict — guard-skipped,
    // checker-rejected (with the objection), or accepted.
    const triedCap = Math.max(80, opts.triedCap || 200);
    const tried = trace ? [] : null;
    const recordTried = (mv, verdict, reason, textOverride) => {
      if (!tried || tried.length >= triedCap) return;
      const text = textOverride != null ? textOverride : mv.text;
      tried.push({
        kind: mv.kind,
        text,
        head: moveHead(text),
        rationale: mv.rationale || null,
        verdict,
        reason: reason || null,
      });
    };
    const traceSkip = (mv, reason) => {
      recordTried(mv, 'guard', reason);
    };
    // A candidate that reached the checker has RESOLVED (accepted/rejected/guard):
    // record it in the trace AND announce it to the live reel. `head` is the exact
    // one-line term already computed for the Move-space view — nothing recomputed.
    const reportVerdict = (mv, verdict, reason, textOverride) => {
      recordTried(mv, verdict, reason, textOverride);
      const text = textOverride != null ? textOverride : mv.text;
      if (opts.onPulse) {
        opts.onPulse({ verdict: { kind: mv.kind, head: moveHead(text), verdict, reason: reason || null } });
      }
    };
    for (const mv of moves) {
      if (mv.kind === 'recurse' || mv.kind === 'lemma') {
        const rhs = letRhsOf(mv.text);
        if (rhs && branchBodyBefore(code, hole).includes(rhs)) { traceSkip(mv, 'duplicate call already in this branch'); continue; }
      }
      if (mv.kind === 'invert') {
        const rhs = letRhsOf(mv.text);
        if (rhs && branchBodyBefore(code, hole).includes(`= ${rhs} in`)) { traceSkip(mv, 'hypothesis already destructured here'); continue; }
      }
      if (!movePrefilterOk(mv, hole, code)) { traceSkip(mv, 'pre-filter: constructor/argument family cannot match'); continue; }
      const spliced = spliceAtHole(code, hole, mv.text);
      if (spliced == null) continue;
      cands.push({ mv, spliced });
    }

    // WAVE-PARALLEL trial: fire the next few candidates' checks CONCURRENTLY
    // (a prover `check` is stateless worker-side and the client pools prover
    // workers), then scan the results IN RANK ORDER with the exact sequential
    // acceptance logic — so the accepted move is byte-identical to the serial
    // search, at ~wave× less wall time on the failing-candidate scans. A
    // later-rank candidate's error is discarded when an earlier one accepts
    // (the serial loop would never have run it).
    let advanced = false;
    const waveSize = Math.max(1, opts.wave || 3);
    for (let wi = 0; wi < cands.length && !advanced; wi += waveSize) {
      await waitWhilePaused();
      if (hardCancel()) {
        return { complete: false, code, steps, stuck: { reason: 'cancelled' } };
      }
      const batch = cands.slice(wi, wi + waveSize);
      // Live reel feed: announce the whole wave's candidate terms up front (kind +
      // one-line head), so the UI can stream the actual moves being attempted — not
      // just the first candidate's kind. `verdict` events below report each outcome.
      if (opts.onPulse) {
        opts.onPulse({
          trying: batch[0].mv.kind,
          goal: hole.goal,
          branch: branchPatternBox(code, hole),
          wave: batch.map((c) => ({ kind: c.mv.kind, head: moveHead(c.mv.text) })),
        });
      }
      const settled = await Promise.all(batch.map((c) => runOracle(c.spliced)
        .then((res) => ({ res }), (err) => ({ err }))));
      for (let bi = 0; bi < batch.length; bi += 1) {
      const { mv } = batch[bi];
      let effText = mv.text;
      let { spliced } = batch[bi];
      if (settled[bi].err) throw settled[bi].err;
      let res = settled[bi].res;
      if (res.cancelled) {
        return { complete: false, code, steps, stuck: { reason: 'cancelled' } };
      }
      // Checker-guided BRANCH PRUNING for a rejected split: Beluga expects branches
      // its coverage checker can infer impossible to be OMITTED (the cp idiom
      // "principal cases are inferred to be impossible"), and rejects an emitted
      // branch whose pattern cannot type-check against the scrutinee's refined type
      // (a rigid binder occurrence — a higher-order matching fact only the checker
      // decides). Drop the branch the error points into and re-verify, until the
      // split checks or nothing prunable remains. Pruning a branch coverage still
      // REQUIRES makes the final check fail at the case itself ⇒ honest rejection.
      if (mv.kind === 'split') {
        let guard = (effText.match(/^\s*\|/gm) || []).length;
        while ((!res.ok || countErrors(res) > baseErrors) && guard-- > 0) {
          const next = pruneOneBranch(effText, res.output, hole);
          if (!next) break;
          effText = next;
          spliced = spliceAtHole(code, hole, effText);
          if (spliced == null) break;
          res = await runOracle(spliced);
          if (res.cancelled) {
            return { complete: false, code, steps, stuck: { reason: 'cancelled' } };
          }
        }
        if (spliced == null) continue;
      }
      const errs = countErrors(res);
      if (!res.ok || errs > baseErrors) {
        reportVerdict(mv, 'rejected',
          (firstErrorOf(res.output) || 'did not certify').slice(0, 160));
        continue;
      }
      const nextHoles = holesForTheorem(spliced, thm, parseHoles(res.output || ''));
      const fp = fingerprint(nextHoles);
      const bodyBefore = branchBodyBefore(code, hole).trim();
      const bodyAfter = branchBodyBefore(spliced, hole).trim();
      const branchProgress = bodyAfter.length > bodyBefore.length;
      if (seen.has(fp) && !branchProgress) {
        reportVerdict(mv, 'guard', 'revisits an already-seen proof state');
        continue;
      }
      // Speculative-`let` guard: if this move left the leftmost goal alpha-unchanged
      // (a `let … in ?` that only added a hypothesis), spend from the per-goal
      // budget; once exhausted, reject it so the search must change the goal.
      // Keyed on BRANCH + GOAL (not the full hole fingerprint): every accepted
      // `let` adds a novel hypothesis, so a hypothesis-inclusive key resets the
      // budget each step and never trips on novel-shaped churn (the endless
      // lemma-let spiral). The goal staying alpha-equal in the same branch IS
      // the "no goal-changing move yet" condition the budget is meant to bound.
      const stillSameGoal = nextHoles.some((h) => alphaGoal(h.goal) === goalKey);
      if (globalThis.__budgetDebug) {
        globalThis.__budgetDebug({
          kind: mv.kind,
          stillSameGoal,
          goalKey,
          nh: nextHoles.length,
          h: holes.length,
          branch: (branchPatternBox(code, hole) || '').slice(0, 40),
        });
      }
      // Only genuinely SPECULATIVE lets are budgeted: recurse/lemma calls whose
      // payoff needs a later consumer. INVERTS are the invertible phase —
      // deterministic, information-preserving, each determined hypothesis
      // invertible once (the dup guard) — charging them starves legitimate
      // invert+invert+recurse+recurse proofs (dl_uniq) now that the budget
      // actually accumulates.
      if (stillSameGoal && (mv.kind === 'recurse' || mv.kind === 'lemma') && nextHoles.length >= holes.length) {
        const budgetKey = `${branchPatternBox(code, hole) || ''}§${goalKey}`;
        const used = specCount.get(budgetKey) || 0;
        if (used >= specBudget) {
          reportVerdict(mv, 'guard', 'speculative-let budget exhausted for this goal');
          continue;
        }
        specCount.set(budgetKey, used + 1);
      }
      // Accept: real, type-correct progress. Carry this result — the next step's
      // loop-top check of the same code would be byte-identical.
      code = spliced;
      carried = { forCode: spliced, res };
      baseErrors = errs;
      seen.add(fp);
      const meta = stepMeta(mv, effText, hole);
      const checksUsed = oracleCalls - oracleCallsAtStep;
      oracleCallsAtStep = oracleCalls;
      reportVerdict(mv, 'accepted', null, effText);
      const lead = stepLead(mv, meta, hole);
      steps.push({
        move: mv.kind,
        lead,
        rationale: lead,
        meta,
        checks: checksUsed,
        goal: hole.goal,
        hole: { line: hole.line, col: hole.col, name: hole.name || null },
        holeCtx: holeCtxSnap,
        holeMeta: holeMetaSnap,
        focus: focusMeta,
        // the enclosing case-branch PATTERN (null at top level) — the proof-tree
        // UI groups steps by it
        branch: branchPatternBox(code, hole),
        text: effText,
        status: nextHoles.length ? 'open' : 'solved',
      });
      if (opts.onStep) opts.onStep({ steps: [...steps], last: steps[steps.length - 1] });
      advanced = true;
      break;
      }
    }
    if (trace) {
      const traceEntry = {
        goal: hole.goal,
        branch: branchAtHole,
        hole: { line: hole.line, col: hole.col, name: hole.name || null },
        holeCtx: holeCtxSnap,
        holeMeta: holeMetaSnap,
        focus: focusMeta,
        tried: tried || [],
        advanced,
      };
      trace.push(traceEntry);
      if (opts.onTraceEntry) opts.onTraceEntry(traceEntry, trace.length - 1);
    }
    if (!advanced) {
      return {
        complete: false, code, steps, trace: trace || undefined, stuck: { goal: hole.goal, reason: 'no-move', hole: { line: hole.line, col: hole.col, name: hole.name || null } },
      };
    }
  }
  return { complete: false, code, steps, trace: trace || undefined, stuck: { reason: 'step-bound' } };
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

// A one-line head of a move's text, for trace/tooltip display.
function moveHead(text) {
  return String(text || '').split('\n')[0].replace(/\s+/g, ' ').trim().slice(0, 90);
}

// Structured, kind-specific metadata for an ACCEPTED move — computed from the
// final effective text so the UI renders insight, not reconstruction.
export function stepMeta(mv, effText, hole) {
  const t = String(effText || '');
  const meta = { kind: mv.kind };
  meta.goalHead = headOfConclusion(conclusionOf(hole && hole.goal || '')) || null;
  const names = new Set([
    ...((hole.meta || []).map((m) => m && m.name)),
    ...((hole.ctx || []).map((c) => c && c.name)),
  ].filter(Boolean));
  // hypotheses this move consumes: bare in-scope names referenced inside boxes
  const used = new Set();
  for (const m of t.matchAll(/[[\s|]([A-Za-z_][A-Za-z0-9_']*)(?=[\s\]])/g)) {
    if (names.has(m[1])) used.add(m[1]);
  }
  meta.uses = [...used];
  // bindings this move produces: let-bound names + pattern metavariables
  const produced = new Set();
  for (const m of t.matchAll(/let\s+\[[^\]]*?(?:\|-|⊢)\s*([\s\S]*?)\]/g)) {
    for (const v of String(m[1]).match(/[A-Z][A-Za-z0-9_']*/g) || []) produced.add(v);
  }
  meta.binds = [...produced];
  if (mv.kind === 'split') { // GENERAL: move-kind tag, not a name
    meta.scrutinee = mv.scrutinee || null;
    meta.arms = (t.match(/^\s*\|/gm) || []).length;
    meta.annotated = /\]\s*:\s*\[/.test(t);
    // The arm PATTERN boxes (first balanced box per `|` line — annotations and
    // `[..]` substitutions inside patterns survive): the tree view attaches each
    // later step to its arm by matching these against step.branch.
    meta.armPatterns = [];
    for (const line of t.split('\n')) {
      if (!/^\s*\|/.test(line)) continue;
      const s0 = line.indexOf('[');
      if (s0 < 0) continue;
      let d = 0;
      let e0 = -1;
      for (let i = s0; i < line.length; i += 1) {
        if (line[i] === '[') d += 1;
        else if (line[i] === ']') { d -= 1; if (d === 0) { e0 = i; break; } }
      }
      if (e0 > s0) meta.armPatterns.push(line.slice(s0, e0 + 1));
    }
  } else if (mv.kind === 'synth') { // GENERAL: move-kind tag, not a name
    const lines = t.split('\n').filter((l) => l.trim());
    const chain = [];
    for (const l of lines) {
      const call = /=\s*([A-Za-z_][A-Za-z0-9_']*)\s/.exec(l) || /^([A-Za-z_][A-Za-z0-9_']*)\s/.exec(l.trim());
      if (call && !['let', 'impossible', 'in'].includes(call[1])) chain.push(call[1]);
      else if (/^impossible\b/.test(l.trim())) chain.push('impossible');
    }
    meta.chain = chain;
    meta.refutation = /\bimpossible\b/.test(t);
  } else if (mv.kind === 'recurse' || mv.kind === 'lemma' || mv.kind === 'invert') { // GENERAL: move-kind tags
    const rhs = letRhsOf(t);
    meta.callee = rhs ? (rhs.split(/[\s[]/)[0] || null) : null;
    const pat = /let\s+\[[^\]]*?(?:\|-|⊢)\s*([A-Za-z_][A-Za-z0-9_']*)/.exec(t);
    meta.pattern = pat ? pat[1] : null;
  } else if (mv.kind === 'impossible') { // GENERAL: move-kind tag, not a name
    const h = /impossible\s+\[?[^\]|]*(?:\|-|⊢)?\s*([A-Za-z_][A-Za-z0-9_']*)/.exec(t);
    meta.refuted = h ? h[1] : null;
  } else if (mv.kind === 'fill') {
    meta.filler = moveHead(mv.text || t);
  } else if (mv.kind === 'intro') {
    const introduced = [];
    for (const m of t.matchAll(/\b(?:fn|mlam)\s+([A-Za-z_][A-Za-z0-9_']*)/g)) introduced.push(m[1]);
    meta.introduced = introduced;
  }
  return meta;
}

// Brief lead line for an accepted move — facts that appear in meta facets stay out.
export function stepLead(mv, meta, hole) {
  const goalHead = meta.goalHead || headOfConclusion(conclusionOf(hole.goal || '')) || 'the goal';
  switch (mv.kind) {
    case 'synth': {
      const links = (meta.chain || []).filter((c) => c !== 'impossible');
      const n = links.length || (meta.chain || []).length;
      return meta.refutation
        ? `refutation closing ${goalHead}`
        : `${n}-step chain closing ${goalHead}`;
    }
    case 'split':
      return `case on ${meta.scrutinee || 'the scrutinee'}`;
    case 'recurse':
      return 'induction hypothesis';
    case 'invert':
      return `inverted ${meta.uses[0] || 'a hypothesis'}`;
    case 'lemma':
      return `applied ${meta.callee || 'lemma'}`;
    case 'impossible':
      return `refuted ${meta.refuted || 'the hypothesis'}`;
    case 'fill':
      return `closed ${goalHead}`;
    case 'intro':
      return "opened the goal's binders";
    default:
      return mv.rationale || 'made a move';
  }
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

// Beluga reports holes in prove-orchestration line numbers; the goal store keys
// by editor-document line/col. Zip scoped checker holes with the syntactic hits
// we are certifying (same order within the theorem).
export function mapProveHolesToDocHits(parsed, proveCode, thmName, docHits) {
  const scoped = holesForTheorem(proveCode, { name: thmName }, parsed || []);
  if (!scoped.length || !docHits?.length) return [];
  const hits = [...docHits].sort((a, b) =>
    (a.hole.line - b.hole.line) || ((a.hole.col || 1) - (b.hole.col || 1)));
  const out = [];
  for (let i = 0; i < Math.min(hits.length, scoped.length); i += 1) {
    out.push({
      ...scoped[i],
      line: hits[i].hole.line,
      col: hits[i].hole.col || 1,
    });
  }
  return out;
}

// Approximate display goal for a hole at (line,col) in file text: the theorem
// header comp type when the hole is top-level in its decl (no `=>`/`fn` before it).
export function approximateHoleGoal(fileText, line, col) {
  const code = String(fileText || '');
  const wantLine = line;
  const wantCol = col || 1;
  const re = /\b(?:rec|proof)\s+([A-Za-z_][A-Za-z0-9_']*)\s*:/g;
  let match;
  while ((match = re.exec(code)) !== null) {
    const name = match[1];
    const range = theoremDeclRange(code, name);
    if (!range || wantLine < range.start || wantLine > range.end) continue;
    const semi = code.indexOf(';', match.index);
    const declText = code.slice(match.index, semi < 0 ? code.length : semi + 1);
    const thm = theoremUnderProof(declText);
    if (!thm) continue;
    const syn = syntacticHoleAt(code, thm, wantLine, wantCol);
    if (syn?.goal) return syn.goal;
  }
  return null;
}

function syntacticHoleAt(code, thm, line, col) {
  const range = theoremDeclRange(code, thm && thm.name);
  const lines = String(code || '').split('\n');
  const start = range ? range.start - 1 : 0;
  const end = range ? range.end : lines.length;
  if (line < start + 1 || line > end) return null;
  const i = line - 1;
  const holeCol = lines[i].indexOf('?');
  if (holeCol < 0 || holeCol + 1 !== col) return null;
  const upToHole = lines.slice(start, i).join('\n') + '\n' + lines[i].slice(0, holeCol);
  const topLevel = !/=>|⇒|\bfn\s+\w+\s*=>/.test(upToHole);
  const goal = topLevel && thm?.compType?.raw ? thm.compType.raw : null;
  return goal ? { line, col, goal, ctx: [], meta: [] } : null;
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
      const hit = syntacticHoleAt(code, thm, i + 1, col + 1);
      if (hit) return hit;
    }
  }
  return null;
}

// The line of the first genuine ERROR in checker output (a `File "…", line N`
// header immediately followed by an error line — hole reports use the same header
// shape and must not match).
function firstErrorLoc(output) {
  const lines = String(output || '').split('\n');
  for (let i = 0; i < lines.length - 1; i += 1) {
    const m = /File\s+"[^"]*",\s*line\s+(\d+)/.exec(lines[i]);
    if (m && /error/i.test(lines[i + 1])) return { line: parseInt(m[1], 10) };
  }
  return null;
}

// Remove the split branch the checker's error points into. Splicing maps move-text
// line i to program line hole.line + i, so an error inside the spliced span selects
// one `| …` branch to drop. Returns the pruned text, or null when the error is
// outside the span / at the case head / only one branch remains (a case needs ≥1
// branch — full emptiness is the separate `impossible` move).
function pruneOneBranch(text, output, hole) {
  const loc = firstErrorLoc(output);
  if (!loc) return null;
  const lines = String(text).split('\n');
  const rel = loc.line - hole.line;
  if (rel < 0 || rel >= lines.length) return null;
  const starts = [];
  lines.forEach((l, i) => { if (/^\s*\|/.test(l)) starts.push(i); });
  if (starts.length <= 1) return null;
  let bi = -1;
  for (let k = 0; k < starts.length; k += 1) {
    if (rel >= starts[k] && (k + 1 >= starts.length || rel < starts[k + 1])) { bi = k; break; }
  }
  if (bi < 0) return null;
  let to = bi + 1 < starts.length ? starts[bi + 1] : lines.length;
  // A NESTED case is wrapped `(case … of … )`; the closing `)` rides on the last
  // arm's final line. Removing the last arm must not swallow that `)` — carry any
  // trailing close-parens on the removed span's last line onto the survivor.
  let tail = '';
  if (to === lines.length) {
    const lastLine = lines[to - 1] || '';
    const closes = /(\)+\s*)$/.exec(lastLine);
    if (closes) tail = closes[1].trim();
  }
  const kept = [...lines.slice(0, starts[bi]), ...lines.slice(to)];
  if (tail && kept.length) {
    // append the carried close-parens to the survivor's last non-blank line
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      if (kept[i].trim()) { kept[i] = kept[i].replace(/\s*$/, '') + tail; break; }
    }
  }
  return kept.join('\n');
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

// Alpha-normalize a goal: metavariable SPELLINGS are printer artifacts — both
// the uppercase pattern names AND the checker's `"`-quoted INTERNAL names (which
// the checker RENUMBERS on every re-elaboration: `"i17` → `"i18` across two
// checks of the same state). Both classes map positionally, so a re-elaborated
// but unchanged goal keys identically — the budget/seen guards depend on it.
function alphaGoal(goalStr) {
  const map = new Map();
  let n = 0;
  return String(goalStr == null ? '' : goalStr).replace(/\s+/g, ' ').trim()
    .replace(/"[A-Za-z][A-Za-z0-9_']*|[A-Z][A-Za-z0-9_']*/g, (m) => {
      if (!map.has(m)) { map.set(m, '#' + n); n += 1; }
      return map.get(m);
    });
}

function ctxSig(hole) {
  const map = new Map();
  let n = 0;
  // Internal `"`-names normalize too (see alphaGoal) — the checker renumbers
  // them per elaboration, which would otherwise fake state novelty past `seen`.
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
    .replace(/"[A-Za-z][A-Za-z0-9_']*|[A-Z][A-Za-z0-9_']*/g, (m) => {
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
