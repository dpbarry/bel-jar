// Phase I — counterexample engine (fail-closed DISPROOF).
//
// Enumerate closed FO constructor trees from the signature, instantiate a
// theorem's free indices, and fire ONLY when premises are inhabited and the
// conclusion is rigidly empty. null means "no CE found" — NEVER "proved".
// Beluga certify + proveProgram DISPROVED wiring = later slices.

import {
  decomposeContextual,
  enumerateConstructorsTyped,
  parseAppType,
  renderApp,
} from './hole-split.mjs';
import { parseCompType, isCtypeApplication, normalizeCtypeSpelling } from './prover-comp-type.mjs';

function norm(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

function stripParens(t) {
  let s = norm(t);
  while (s[0] === '(' && s[s.length - 1] === ')') {
    let d = 0;
    let ok = true;
    for (let i = 0; i < s.length; i += 1) {
      if (s[i] === '(') d += 1;
      else if (s[i] === ')') {
        d -= 1;
        if (d === 0 && i < s.length - 1) { ok = false; break; }
      }
    }
    if (!ok || d !== 0) break;
    s = norm(s.slice(1, -1));
  }
  return s;
}

function isHoArg(at) {
  return /[{]|->|→/.test(String(at));
}

function isGroundTerm(text) {
  let t = norm(text);
  if (!t) return false;
  if (isCtypeApplication(t)) t = normalizeCtypeSpelling(t);
  const app = parseAppType(t);
  if (app) {
    // Family head may be uppercase (Ok); groundness is about INDEX metas.
    return app.indices.every((ix) => !/\p{Lu}/u.test(String(ix)));
  }
  return !/\p{Lu}/u.test(t);
}

function isFreeMeta(tok) {
  return /^\p{Lu}[\p{L}\p{N}_']*$/u.test(String(tok || '').trim());
}

// Pattern indices (may contain uppercase) vs ground goal indices.
function groundMatch(patternIdx, goalIdx) {
  if (patternIdx.length !== goalIdx.length) return null;
  const subst = new Map();
  for (let i = 0; i < patternIdx.length; i += 1) {
    if (!matchOne(patternIdx[i], goalIdx[i], subst)) return null;
  }
  return subst;
}

// Depth-aware top-level tokenizer (parenthesised groups stay whole) — the
// matching domain must be TOKEN ALIGNMENT, not parseAppType: an INFIX index
// (`A ⊗ B`) has no prefix head, and parseAppType misreads its first meta as
// the head, so every infix ctor result looked like a non-match and an
// inhabited conclusion was declared empty (the dual_sym FALSE DISPROVED,
// caught by the 2026-07-17 sweep). Token alignment treats prefix and infix
// uniformly: metas bind, operators/atoms compare literally, groups recurse.
function toksCE(text) {
  const s = norm(text);
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ' ' && depth === 0) { if (cur) { out.push(cur); cur = ''; } } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function matchOne(pat, goal, subst) {
  const p = stripParens(pat);
  const g = stripParens(goal);
  if (isFreeMeta(p)) {
    if (subst.has(p) && norm(subst.get(p)) !== norm(g)) return false;
    subst.set(p, g);
    return true;
  }
  if (norm(p) === norm(g)) return true;
  const pt = toksCE(p);
  const gt = toksCE(g);
  if (pt.length < 2 || pt.length !== gt.length) return false;
  for (let i = 0; i < pt.length; i += 1) {
    if (!matchOne(pt[i], gt[i], subst)) return false;
  }
  return true;
}

function applySubstText(text, subst) {
  if (!subst || !subst.size) return norm(text);
  return norm(text).replace(/[\p{L}_][\p{L}\p{N}_']*/gu, (m) => (subst.has(m) ? subst.get(m) : m));
}

function cartesian(lists, limit) {
  if (!lists.length) return [[]];
  let acc = [[]];
  for (const list of lists) {
    const next = [];
    for (const prefix of acc) {
      for (const x of list) {
        next.push([...prefix, x]);
        if (next.length >= limit) return next;
      }
    }
    acc = next;
    if (!acc.length) return [];
  }
  return acc;
}

// Closed FO inhabitants of a (possibly boxed or ctype) type. Empty ctx only.
export function enumerateInhabitants(typeText, code, opts = {}) {
  const maxDepth = opts.maxDepth == null ? 2 : opts.maxDepth;
  const cap = opts.cap == null ? 32 : opts.cap;
  const raw = String(typeText || '').trim();
  if (isCtypeApplication(raw)) {
    if (!ctypeEmptyCtxOnly(raw)) return [];
    const out = [];
    inhabitConcl(normalizeCtypeSpelling(raw), code, maxDepth, cap, out, true);
    return out;
  }
  const box = decomposeContextual(raw);
  if (box && box.ctx) return [];
  const concl = box ? box.concl : raw;
  const out = [];
  inhabitConcl(concl, code, maxDepth, cap, out, false);
  return out;
}

function ctypeDeclConstructors(code, family) {
  if (!family) return [];
  const esc = String(family).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\n)\\s*([\\p{L}_][\\p{L}\\p{N}_']*)\\s*:\\s*(${esc}\\b[^.;]*)\\.`, 'gu');
  const out = [];
  let m;
  while ((m = re.exec(String(code || ''))) !== null) {
    const name = m[1];
    if (name === family) continue; // type/family declaration itself
    const typeText = m[2].trim();
    if (/\bctype\b/.test(typeText)) continue; // `Ok : … -> ctype.`
    const parts = [];
    let depth = 0;
    let cur = '';
    const s = typeText;
    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i];
      if (ch === '(' || ch === '[') depth += 1;
      else if (ch === ')' || ch === ']') depth -= 1;
      if (depth === 0 && (s.startsWith('->', i) || ch === '→')) {
        parts.push(norm(cur));
        cur = '';
        i += ch === '→' ? 0 : 1;
        continue;
      }
      cur += ch;
    }
    if (norm(cur)) parts.push(norm(cur));
    if (!parts.length) continue;
    const resPlan = normalizeCtypeSpelling(parts[parts.length - 1]);
    const result = parseAppType(resPlan);
    if (!result || result.head !== family) continue;
    out.push({
      name,
      argTypes: parts.slice(0, -1),
      result: { head: result.head, indices: result.indices },
    });
  }
  return out;
}

function foConstructors(code, family) {
  const seen = new Set();
  const out = [];
  for (const c of [
    ...enumerateConstructorsTyped(code, family),
    ...ctypeDeclConstructors(code, family),
  ]) {
    const key = `${c.name}::${(c.result.indices || []).join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function inhabitConcl(concl, code, depth, cap, acc, asCtype) {
  if (acc.length >= cap || depth < 0) return;
  const plan = asCtype || isCtypeApplication(concl) ? normalizeCtypeSpelling(concl) : concl;
  const app = parseAppType(plan);
  if (!app) return;
  for (const c of foConstructors(code, app.head)) {
    if (acc.length >= cap) return;
    if (c.argTypes.some(isHoArg)) continue;
    const resPlan = normalizeCtypeSpelling(`${c.result.head} ${c.result.indices.join(' ')}`.trim());
    const resApp = parseAppType(resPlan);
    if (!resApp || resApp.head !== app.head) continue;
    if (resApp.indices.length !== app.indices.length) continue;
    const sub = app.indices.length
      ? groundMatch(resApp.indices, app.indices)
      : new Map();
    if (app.indices.length && !sub) continue;
    if (!c.argTypes.length) {
      acc.push(renderApp(code, c.name, []));
      continue;
    }
    if (depth <= 0) continue;
    const perArg = [];
    let ok = true;
    for (const at of c.argTypes) {
      const inst = applySubstText(at, sub);
      const choices = [];
      const nestCtype = isCtypeApplication(inst);
      if (nestCtype) {
        if (!ctypeEmptyCtxOnly(inst)) { ok = false; break; }
        inhabitConcl(normalizeCtypeSpelling(inst), code, depth - 1, cap, choices, true);
      } else {
        const b = decomposeContextual(inst);
        if (b && b.ctx) { ok = false; break; }
        inhabitConcl(b ? b.concl : inst, code, depth - 1, cap, choices, false);
      }
      if (!choices.length) { ok = false; break; }
      perArg.push(choices);
    }
    if (!ok) continue;
    for (const combo of cartesian(perArg, Math.max(1, cap - acc.length))) {
      acc.push(renderApp(code, c.name, combo));
      if (acc.length >= cap) return;
    }
  }
}

// True only when the ground conclusion has declared ctors and NONE could match.
// This is the load-bearing side of DISPROOF soundness (the reject-probe only
// sanity-checks one fill), so every uncertainty fails OPEN (not empty):
//  - an HO-arg ctor whose RESULT matches could inhabit the goal — it is tested
//    like any other (its arguments' inhabitability is not ours to refute);
//  - a ctor result the token matcher cannot faithfully analyse (a lambda in an
//    index, an arity the matcher can't align on a same-head goal) ⇒ not empty.
export function conclusionRigidlyEmpty(concl, code) {
  let t = norm(concl);
  if (!t || !isGroundTerm(t)) return false;
  if (isCtypeApplication(t)) {
    if (!ctypeEmptyCtxOnly(t)) return false;
    t = normalizeCtypeSpelling(t);
  }
  const app = parseAppType(t);
  if (!app) return false;
  const ctors = foConstructors(code, app.head);
  if (!ctors.length) return false;
  for (const c of ctors) {
    const resPlan = normalizeCtypeSpelling(`${c.result.head} ${c.result.indices.join(' ')}`.trim());
    if (/\\/.test(resPlan)) return false; // lambda in a result index — unanalysable, fail open
    const resApp = parseAppType(resPlan);
    if (!resApp) return false; // unparseable result — fail open
    if (resApp.indices.length !== app.indices.length) continue; // arity rules it out
    if (app.indices.length === 0) return false; // same nullary head — inhabited shape
    if (groundMatch(resApp.indices, app.indices)) return false;
  }
  return true;
}

/** Every nested contextual box in a ctype app has a structurally empty context. */
export function ctypeEmptyCtxOnly(raw) {
  if (!isCtypeApplication(raw)) return false;
  for (const m of String(raw).matchAll(/\[([^\[\]]*)\]/g)) {
    const inner = m[1];
    const turnSt = inner.search(/\|-/);
    const turnDag = inner.search(/⊢/);
    const turn = turnSt >= 0 ? turnSt : turnDag;
    if (turn < 0) continue;
    const ctx = inner.slice(0, turn).trim();
    if (!ctxStructurallyEmpty(ctx)) return false;
  }
  return true;
}

/**
 * Phase I.4 — empty of binders: blank, or a bare schema variable (`g`) with no
 * commas / `:` / `block`. Non-empty contexts (with hyps) stay fail-closed.
 */
export function ctxStructurallyEmpty(ctx) {
  const c = String(ctx || '').trim();
  if (!c) return true;
  if (/[,:]/.test(c) || /\bblock\b/.test(c)) return false;
  return /^[\p{L}_][\p{L}\p{N}_']*$/u.test(c);
}

function arrowArgFamilies(code, head) {
  if (!head) return [];
  const esc = String(head).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\n)\\s*${esc}\\s*:\\s*([^.;]+)\\.`, 'mu');
  const m = re.exec(String(code || ''));
  if (!m) return [];
  const parts = [];
  let depth = 0;
  let cur = '';
  const s = m[1];
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    if (depth === 0 && (s.startsWith('->', i) || ch === '→')) {
      parts.push(norm(cur));
      cur = '';
      i += ch === '→' ? 0 : 1;
      continue;
    }
    cur += ch;
  }
  if (norm(cur)) parts.push(norm(cur));
  if (parts.length < 2) return [];
  return parts.slice(0, -1).map((p) => {
    const b = decomposeContextual(p);
    return headOfBare(b ? b.concl : p);
  }).filter(Boolean);
}

function headOfBare(t) {
  const app = parseAppType(t);
  return app ? app.head : null;
}

function inferMetaFamilies(spine, code) {
  const map = new Map();
  const consider = (typeText) => {
    let concl = String(typeText || '').trim();
    if (isCtypeApplication(concl)) {
      if (!ctypeEmptyCtxOnly(concl)) return;
      concl = normalizeCtypeSpelling(concl);
    } else {
      const box = decomposeContextual(concl);
      concl = box ? box.concl : concl;
    }
    const app = parseAppType(concl);
    if (!app || !app.indices.length) return;
    const fams = arrowArgFamilies(code, app.head);
    app.indices.forEach((idx, i) => {
      // Ctype plan indices are `(N)` after normalize — peel for meta name.
      let id = norm(idx);
      if (id[0] === '(' && id[id.length - 1] === ')') id = norm(id.slice(1, -1));
      if (!isFreeMeta(id)) return;
      const fam = fams[i];
      if (!fam) return;
      if (!map.has(id)) map.set(id, new Set());
      map.get(id).add(fam);
    });
  };
  for (const p of spine.premises) {
    if (p.kind === 'box' || p.kind === 'ctype') consider(p.raw); // GENERAL: premise-kind tags
  }
  consider(spine.conclusion);
  return map;
}

function emptyCtxBox(raw) {
  const b = decomposeContextual(raw);
  if (!b) return { ok: false };
  if (!ctxStructurallyEmpty(b.ctx)) return { ok: false };
  return { ok: true, concl: b.concl };
}

function assignmentList(metaFams, code, opts) {
  const maxDepth = opts.maxDepth == null ? 2 : opts.maxDepth;
  const maxAssignments = opts.maxAssignments == null ? 64 : opts.maxAssignments;
  const metas = [...metaFams.keys()];
  if (!metas.length) return [new Map()];
  const perMeta = metas.map((m) => {
    const terms = [];
    const seen = new Set();
    for (const fam of metaFams.get(m)) {
      for (const t of enumerateInhabitants(fam, code, { maxDepth, cap: 16 })) {
        if (seen.has(t)) continue;
        seen.add(t);
        terms.push(t);
      }
    }
    return terms;
  });
  if (perMeta.some((t) => !t.length)) return [];
  const combos = cartesian(perMeta, maxAssignments);
  return combos.map((vals) => {
    const subst = new Map();
    metas.forEach((m, i) => subst.set(m, vals[i]));
    return subst;
  });
}

function boxConcl(concl) {
  return `[ |- ${concl}]`;
}

/**
 * @returns {null | {
 *   status: 'disproved',
 *   premises: { raw: string, term: string }[],
 *   conclusion: string,
 *   witness: { assignment: Record<string,string>, premiseTerms: string[], emptyConclusion: string }
 * }}
 */
export function findCounterexample(thmOrType, code, opts = {}) {
  const spine = typeof thmOrType === 'string'
    ? parseCompType(thmOrType)
    : (thmOrType && thmOrType.premises ? thmOrType : parseCompType(thmOrType && thmOrType.raw));
  if (!spine) return null;

  for (const p of spine.premises) {
    if (p.kind === 'box') { // GENERAL: premise-kind from classifyPremise
      const e = emptyCtxBox(p.raw);
      if (!e.ok) return null;
    } else if (p.kind === 'ctype' || isCtypeApplication(p.raw)) { // GENERAL: premise-kind
      if (!ctypeEmptyCtxOnly(p.raw)) return null;
    } else {
      return null; // pi/ctx / non-empty ctx still out of slice
    }
  }

  let conclText;
  let conclIsCtype = false;
  if (isCtypeApplication(spine.conclusion)) {
    if (!ctypeEmptyCtxOnly(spine.conclusion)) return null;
    conclText = spine.conclusion;
    conclIsCtype = true;
  } else {
    const conclEmpty = emptyCtxBox(spine.conclusion);
    if (!conclEmpty.ok) {
      const bare = decomposeContextual(spine.conclusion);
      if (bare && bare.ctx) return null;
      conclText = norm((bare || { concl: spine.conclusion }).concl);
    } else {
      conclText = conclEmpty.concl;
    }
  }

  const metaFams = inferMetaFamilies(spine, code);
  const assignments = assignmentList(metaFams, code, opts);
  if (!assignments.length && metaFams.size) return null;

  for (const subst of (assignments.length ? assignments : [new Map()])) {
    const groundConcl = applySubstText(conclText, subst);
    if (!conclusionRigidlyEmpty(groundConcl, code)) continue;

    const premiseTerms = [];
    const premiseRows = [];
    let premisesOk = true;
    for (const p of spine.premises) {
      const isCt = p.kind === 'ctype' || isCtypeApplication(p.raw); // GENERAL: premise-kind
      const g = isCt
        ? applySubstText(p.raw, subst)
        : applySubstText(emptyCtxBox(p.raw).concl, subst);
      const inhab = enumerateInhabitants(g, code, {
        maxDepth: opts.maxDepth == null ? 2 : opts.maxDepth,
        cap: 8,
      });
      if (!inhab.length) { premisesOk = false; break; }
      const term = isCt ? inhab[0] : boxConcl(inhab[0]);
      premiseTerms.push(term);
      premiseRows.push({
        raw: p.raw,
        term,
        groundType: isCt ? g : boxConcl(g),
      });
    }
    if (!premisesOk) continue;

    const assignment = {};
    for (const [k, v] of subst) assignment[k] = v;
    const emptyConcl = conclIsCtype ? groundConcl : boxConcl(groundConcl);
    return {
      status: 'disproved', // GENERAL: Phase-I verdict tag, not a Beluga name
      premises: premiseRows,
      conclusion: emptyConcl,
      witness: {
        assignment,
        premiseTerms,
        emptyConclusion: emptyConcl,
      },
    };
  }
  return null;
}

function signaturePrelude(code) {
  const s = String(code || '');
  const m = /(?:^|\n)\s*(?:rec|proof)\s+/m.exec(s);
  return m ? s.slice(0, m.index) : s;
}

function countOracleErrors(res) {
  if (!res) return 1;
  if (res.ok === false) return Math.max(1, (String(res.output || '').match(/\bError\b/gi) || []).length);
  return (String(res.output || '').match(/\bError\b/gi) || []).length;
}

function hasHoleReport(res) {
  return /##\s*Holes\s*##/i.test(String(res && res.output || ''));
}

// Concrete fill that should FAIL for a rigidly empty conclusion: the first FO
// nullary ctor of the family (e.g. refl into eq (s z) z). Not a proof attempt —
// a reject probe. Returns null when no such probe exists (HO-only family).
function conclusionRejectFill(ce, code) {
  const raw = String(ce.conclusion || '').trim();
  const isCt = isCtypeApplication(raw);
  const concl = isCt
    ? normalizeCtypeSpelling(raw)
    : ((decomposeContextual(raw) || {}).concl || raw);
  const app = parseAppType(concl);
  if (!app) return null;
  for (const c of foConstructors(code, app.head)) {
    if (c.argTypes.some(isHoArg)) continue;
    if (c.argTypes.length) continue;
    const fill = renderApp(code, c.name, []);
    return isCt ? fill : boxConcl(fill);
  }
  return null;
}

/** Build mini-programs: premise inhabitants must check; conclusion fill must fail. */
export function counterexamplePrograms(ce, code) {
  if (!ce) return [];
  const sig = signaturePrelude(code).trimEnd();
  const out = [];
  for (let i = 0; i < (ce.premises || []).length; i += 1) {
    const p = ce.premises[i];
    const gty = p.groundType || p.raw;
    out.push({
      role: 'premise',
      code: `${sig}\nrec ce_p${i} : ${gty} =\n${p.term}\n;\n`,
    });
  }
  const badFill = conclusionRejectFill(ce, code);
  if (badFill) {
    out.push({
      role: 'conclusion-reject',
      code: `${sig}\nrec ce_c : ${ce.conclusion} =\n${badFill}\n;\n`,
    });
  }
  return out;
}

/**
 * Beluga-gate a type-level CE. Premises must check clean; conclusion reject-fill
 * must error (or leave holes). Fail-closed: anything inconclusive ⇒ ok:false.
 * @returns {Promise<{ ok: boolean, checkCount: number, reason?: string }>}
 */
export async function certifyCounterexample(ce, code, oracle) {
  if (!ce || typeof oracle !== 'function') {
    return { ok: false, checkCount: 0, reason: 'no-oracle' };
  }
  const progs = counterexamplePrograms(ce, code);
  if (!progs.length) {
    // Zero-premise + no nullary reject probe — cannot Beluga-gate; decline.
    return { ok: false, checkCount: 0, reason: 'no-programs' };
  }
  let checkCount = 0;
  let sawReject = false;
  for (const p of progs) {
    checkCount += 1;
    let res;
    try {
      res = await oracle(p.code);
    } catch {
      return { ok: false, checkCount, reason: 'oracle-throw' };
    }
    const errs = countOracleErrors(res);
    if (p.role === 'premise') {
      if (!res.ok || errs > 0 || hasHoleReport(res)) {
        return { ok: false, checkCount, reason: 'premise-failed' };
      }
    } else {
      sawReject = true;
      // Must NOT be a clean complete check.
      if (res.ok && errs === 0 && !hasHoleReport(res)) {
        return { ok: false, checkCount, reason: 'conclusion-inhabited' };
      }
    }
  }
  if (!sawReject && !(ce.premises && ce.premises.length)) {
    return { ok: false, checkCount, reason: 'no-reject-probe' };
  }
  // Premises-only CE (no reject probe) still counts if premises checked — but
  // emptiness stays type-level. Require a reject probe whenever conclusion is set.
  if (!sawReject) {
    return { ok: false, checkCount, reason: 'no-reject-probe' };
  }
  return { ok: true, checkCount };
}
