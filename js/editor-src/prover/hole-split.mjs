// BelJar-native case-split + intro skeleton generation (Theme C).
//
// The IDE is the intelligence, NOT a slave wrapper around Beluga's `%:split`
// printer (whose output is informational and not always re-parseable). A case
// skeleton is structure BelJar already understands: it enumerates the scrutinee
// type's constructors from OUR parse tree, reads each constructor's argument
// structure (arity + higher-order args) from the AST, and ASSEMBLES well-typed
// patterns itself, in our own grammar. Beluga is consulted only for genuine
// semantic facts it uniquely owns (and only as a fallback) — never to print the
// answer. See [[feedback-beljar-not-beluga-wrapper]] / [[project-beljar-level2-principle]].
//
// Everything here is PURE (text in, text out) so it is fully unit-testable
// without a browser or a Beluga session — the live wiring lives in
// hole-actions.mjs.

import { parser } from '../beluga-parser.js';
import { parseCompType } from './prover-comp-type.mjs';
import { firstChildNamed, firstIdentChild, isLFDatatypeHead } from '../tree-helpers.mjs';
import { reIdentDollarHashExact } from './ident.mjs';

// ── Contextual type decomposition ───────────────────────────────────────────
// A hole scrutinee var has a type like `[ |- nat]`, `[g |- tm]`, `[g, x:tm |- tm]`,
// or a bare `nat`. Split it into the context part (before the turnstile, may be
// empty) and the conclusion (after). Returns { ctx, concl } or null when there's
// no contextual wrapper (a plain computation type we don't case-split here).
// Does the bracket opening `t` close exactly at the final character?
function closesAtEnd(t, open, close) {
  if (t[0] !== open) return false;
  let depth = 0;
  for (let i = 0; i < t.length; i += 1) {
    if (t[i] === open) depth += 1;
    else if (t[i] === close) {
      depth -= 1;
      if (depth === 0) return i === t.length - 1;
    }
  }
  return false;
}

export function decomposeContextual(typeStr) {
  const t = String(typeStr == null ? '' : typeStr).trim();
  if (!t) return null;
  // Strip one outer [ … ] (computation) or ( … ) (meta) box when a turnstile is
  // present. The opener must CLOSE at the last char: `[|- nat] -> [|- nat]` opens
  // and ends with brackets but is an arrow between two boxes, not one box.
  const boxed = closesAtEnd(t, '[', ']') || closesAtEnd(t, '(', ')');
  if (boxed) {
    const inner = t.slice(1, -1);
    const turn = inner.search(/[|⊢]|\|-/);
    if (turn < 0) return { ctx: '', concl: inner.trim(), boxed: true };
    // The turnstile token is `|-`, `|` or `⊢`. Find where the conclusion starts.
    const m = inner.match(/^(.*?)(\|-|⊢|\|)\s*(.*)$/s);
    if (!m) return { ctx: '', concl: inner.trim(), boxed: true };
    return { ctx: m[1].trim(), concl: m[3].trim(), boxed: true };
  }
  return null;
}

// Head type-family name of an LF conclusion type, e.g. `nat` from `nat`,
// `tm` from `tm`, `term A` → `term`, `hyp X A` → `hyp`. Symbol-headed families
// count too — the checker PREFIX-prints infix applications (`⇛ (P1…) (Q…)`), and
// `⇛` is a math Symbol, not a Letter. Null if we can't read one.
export function headOfConclusion(conclStr) {
  const t = String(conclStr == null ? '' : conclStr).trim();
  if (!t) return null;
  const m = t.match(/^([\p{L}\p{S}_][^\s(]*)/u);
  return m ? m[1] : null;
}

// Result type-head of a signature (last segment of the arrow spine).
export function resultHeadOfType(typeStr) {
  const t = String(typeStr || '').trim();
  if (!t) return null;
  const boxed = decomposeContextual(t);
  const inner = boxed ? boxed.concl : t;
  const parts = splitArrowSpineText(inner);
  const last = parts.length ? parts[parts.length - 1] : inner;
  return headOfConclusion(last);
}

// Domain type at arrow index (fn-param peeling from a comp signature).
export function domainAtArrowIndex(typeStr, index) {
  const parts = splitArrowSpineText(String(typeStr || '').trim());
  if (!parts.length) return index === 0 ? String(typeStr || '').trim() || null : null;
  if (index < 0 || index >= parts.length - 1) return null;
  return parts[index];
}

// True / false / null (unknown). Null keeps the candidate at J2 — never drops.
export function typeCompatibleWithGoal(candidateType, goalType) {
  const cand = String(candidateType || '').trim();
  const goal = String(goalType || '').trim();
  if (!cand || !goal) return null;
  if (assumptionCompatible(cand, goal)) return true;
  const gh = resultHeadOfType(goal);
  const ch = resultHeadOfType(cand);
  if (!gh || !ch) return null;
  return gh === ch;
}

function familyOfConstructorName(code, ctorName) {
  if (!ctorName) return null;
  const esc = ctorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // LF/inductive BLOCK form: `LF fam : K = | c1 : T1 | c2 : T2 ;` — a constructor
  // declared as an alternative of the block belongs to the block's head family.
  {
    const blockRe = /(?:^|\n)\s*(?:LF|inductive|stratified|coinductive)\s+([\p{L}_][\p{L}\p{N}_']*)\s*:[^=;]*=([\s\S]*?);/gu;
    let bm;
    while ((bm = blockRe.exec(String(code || '')))) {
      if (new RegExp(`\\|\\s*${esc}\\s*:`).test(bm[2])) return bm[1];
    }
  }
  let acc = '';
  for (const raw of String(code || '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('%')) continue;
    acc = acc ? `${acc} ${line}` : line;
    if (!acc.endsWith('.')) continue;
    const m = acc.match(new RegExp(`^(${esc})\\s*:\\s*(.+)\\.$`, 'u'));
    acc = '';
    if (!m) continue;
    const parts = splitArrowSpineText(m[2]);
    const last = parts.length ? parts[parts.length - 1] : m[2];
    for (const fam of ['⇛', '≡', '⊗', '⅋', '⊕', '&']) {
      const inf = infixFamilySpine(last, fam);
      if (inf && enumerateConstructorsTyped(code, fam).length) return fam;
    }
    const spine = compArrowSpineTyped(m[2]);
    if (spine?.result?.head && enumerateConstructorsTyped(code, spine.result.head).length) {
      return spine.result.head;
    }
  }
  return null;
}

function isDeclaredTypeFamily(code, fam) {
  if (!fam) return false;
  const esc = fam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Cover every declaration form: plain `f : …`, block `LF f : type =`, mutual
  // `and f : …`, and the ctype keywords.
  const re = new RegExp(`^\\s*(?:(?:LF|and|inductive|stratified|coinductive)\\s+)?${esc}\\s*:`, 'm');
  return re.test(String(code || ''));
}

/**
 * FO index sorts from a type-family kind telescope (Phase F.5).
 * `LF ev : tm → tm → type =` → `['tm','tm']`; `nat : type.` → `[]`.
 * Fail-closed (null) on Pi binders or non-simple domains.
 */
export function familyIndexSorts(code, family) {
  if (!family) return null;
  const esc = String(family).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `^\\s*(?:(?:LF|and|inductive|stratified|coinductive)\\s+)?${esc}\\s*:\\s*(.*?)\\btype\\s*[.=]`,
    'mu',
  );
  const m = re.exec(String(code || ''));
  if (!m) return null;
  const tel = m[1].trim();
  if (/[{]/.test(tel)) return null;
  if (!tel) return [];
  const parts = tel.split(/\s*(?:→|->)\s*/).map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    if (!/^[\p{L}_][\p{L}\p{N}_']*$/u.test(p)) return null;
  }
  return parts;
}

// Type family for case-split / ctor lookup. Prefers an applicative head when it has
// constructors; else an infix operator (`P[..] ⇛ Q` → `⇛`); else a bare ctor name.
export function typeFamilyHead(conclStr, code) {
  const plain = headOfConclusion(conclStr);
  if (plain) {
    if (enumerateConstructorsTyped(code, plain).length) return plain;
    const ctorFam = familyOfConstructorName(code, plain);
    if (ctorFam) return ctorFam;
  }
  const t = String(conclStr == null ? '' : conclStr).trim();
  const opRe = /\s([\p{L}_⇛≡⅋&⊕⊗][\p{L}\p{N}_⇛≡⅋&⊕⊗]*)\s/gu;
  let m;
  while ((m = opRe.exec(t)) !== null) {
    const op = m[1];
    if (enumerateConstructorsTyped(code, op).length) return op;
    if (isDeclaredTypeFamily(code, op)) return op;
  }
  return plain;
}

// When the scrutinee conclusion carries an opaque projection ([..] / […]), nullary
// LF constructors (fixed process shapes like l_fwd) cannot inhabit it — keep only
// constructors whose result index ties subprocesses to the main metavar (e.g. (P z)).
export function splitConstructorsForGoal(conclusionType, ctors) {
  // The constructor set of the scrutinee family IS the coverage. Any narrowing must
  // come from index unification against the scrutinee, done by the checker when it
  // rejects an ill-typed branch — not from a family-specific filter here.
  return Array.isArray(ctors) ? ctors : [];
}

// ── Constructor enumeration from OUR AST ────────────────────────────────────
// Walk an LFType node's top-level arrow spine, skipping leading `{Pi}` binders
// (LF Pi-bound args are IMPLICIT — they are not bound positionally in a pattern).
// Returns [{ higherOrder, binders }] — one entry per EXPLICIT argument:
//   higherOrder = the arg type is itself a function (needs a `\x. …` pattern);
//   binders     = how many `\`-binders that higher-order arg introduces.
function argsOfLFType(typeNode, doc) {
  // Descend through leading Pi binders ( `{ PiBinder : T } BODY` ).
  let node = typeNode;
  // A node is "an arrow" iff it has a direct ArrowOp child with an LFType before
  // and after. A Pi at top level shows as `{`,PiBinder,`:`,LFType,`}`,LFType.
  const args = [];
  // Guard against pathological depth.
  for (let guard = 0; node && guard < 256; guard += 1) {
    const children = [];
    for (let c = node.firstChild; c; c = c.nextSibling) children.push(c);
    const brace = children.find((c) => c.name === '{');
    const arrow = children.find((c) => c.name === 'ArrowOp');
    if (brace) {
      // Leading Pi binder → implicit; skip to the body (the LFType AFTER `}`).
      const close = children.findIndex((c) => c.name === '}');
      const body = close >= 0 ? children.slice(close + 1).find((c) => c.name === 'LFType') : null;
      if (!body) break;
      node = body;
      continue;
    }
    if (!arrow) break; // reached the (atomic) result type
    // node = [ LFType(domain), ArrowOp, LFType(codomain) ]
    const lfChildren = children.filter((c) => c.name === 'LFType');
    if (lfChildren.length < 2) break;
    const domain = lfChildren[0];
    const codomain = lfChildren[lfChildren.length - 1];
    args.push(describeArg(domain, doc));
    node = codomain;
  }
  return args;
}

// Is a domain LFType a function type (so the pattern needs `\x. …`)? Count the
// arrows under any parenthesisation to know how many binders.
function describeArg(domainNode, doc) {
  // Unwrap `( … )` to inspect the real shape.
  let inner = unwrapParens(domainNode);
  let binders = 0;
  let node = inner;
  for (let guard = 0; node && guard < 64; guard += 1) {
    const arrow = firstChildNamed(node, 'ArrowOp');
    if (!arrow) break;
    const lf = [];
    for (let c = node.firstChild; c; c = c.nextSibling) if (c.name === 'LFType') lf.push(c);
    if (lf.length < 2) break;
    binders += 1;
    node = unwrapParens(lf[lf.length - 1]);
  }
  return { higherOrder: binders > 0, binders };
}

function unwrapParens(node) {
  let n = node;
  for (let guard = 0; n && guard < 32; guard += 1) {
    // LFType > LFAppType > LFAtomicType > ( LFType )
    const app = firstChildNamed(n, 'LFAppType') || (n.name === 'LFAppType' ? n : null);
    const atomic = app ? firstChildNamed(app, 'LFAtomicType') : firstChildNamed(n, 'LFAtomicType');
    if (!atomic) return n;
    const open = firstChildNamed(atomic, '(');
    const innerLf = open ? firstChildNamed(atomic, 'LFType') : null;
    if (!innerLf) return n;
    n = innerLf;
  }
  return n;
}

// Enumerate the constructors of LF type family `headName` from `code`, reading
// each constructor's explicit-argument structure from the AST. Returns
// [{ name, args:[{higherOrder, binders}] }] in source order, or null when the
// family isn't found / isn't an LF datatype we can model.
export function enumerateLFConstructors(code, headName) {
  if (!headName) return null;
  const src = String(code == null ? '' : code);
  let tree;
  try { tree = parser.parse(src); } catch (_) { return null; }
  const doc = { sliceString: (from, to) => src.slice(from, to) };

  let found = null;
  const cur = tree.cursor();
  do {
    if (cur.name !== 'LFDatatypeDeclaration' && cur.name !== 'LFDeclaration') continue;
    const node = cur.node;
    // Does THIS declaration head match headName?
    let matches = false;
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if ((c.name === 'LowerIdentifier' || c.name === 'UpperIdentifier') && isLFDatatypeHead(c)) {
        if (src.slice(c.from, c.to) === headName) { matches = true; break; }
      }
    }
    if (!matches) continue;
    const ctors = [];
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.name !== 'LFConstructor') continue;
      const id = firstIdentChild(c);
      if (!id) continue;
      const typeNode = firstChildNamed(c, 'LFType');
      const args = typeNode ? argsOfLFType(typeNode, doc) : [];
      ctors.push({ name: src.slice(id.from, id.to), args });
    }
    found = ctors;
    // Keep scanning: a later (shadowing) redefinition wins, matching Beluga.
  } while (cur.next());
  return found;
}

// ── Typed constructor enumeration (for term SYNTHESIS) ──────────────────────
// The richer cousin of enumerateLFConstructors: for each constructor of `family`,
// extract its ARGUMENT TYPES and its RESULT TYPE (head + index argument texts), so
// the prover can synthesise a constructor application `c a1 … an` that inhabits a
// goal. Handles BOTH declaration forms — the `LF F = | c1 | …` block AND the
// top-level `c : … -> F …` form used across the cp suite (the latter was the gap:
// enumerateLFConstructors only saw block constructors). A constructor of `family`
// is ANY declaration whose type's RESULT head is `family`.
//
// Returns [{ name, argTypes:[string], result:{ head, indices:[string] } }] or [].
// ── Model-query memoization ──────────────────────────────────────────────────
// The move generators query the SAME program text hundreds of times per hole
// (constructor enumeration, schema info — each a full Lezer parse). One program
// version is live at a time during a search, so a single-entry cache keyed by
// the code string amortizes the parse and the per-family walks.
let memoSrc = null;
let memoTree;
let memoCtors = null;
let memoSchemas = null;
function memoFor(src) {
  if (src !== memoSrc) {
    memoSrc = src;
    memoTree = undefined; // parsed lazily
    memoCtors = new Map();
    memoSchemas = new Map();
  }
  return { ctors: memoCtors, schemas: memoSchemas };
}
function parseTreeFor(src) {
  memoFor(src);
  if (memoTree === undefined) {
    try { memoTree = parser.parse(src); } catch (_) { memoTree = null; }
  }
  return memoTree;
}

// SCOPE of the declaration under proof. Beluga's signature is SEQUENTIAL: the
// proof under repair sees exactly the declarations that PRECEDE it, and a family
// declared twice resolves to the last one before that point (a corpus file really
// does refine `LF eq` mid-file, with proofs on both sides of the boundary). The
// search runs on ONE declaration at a time, so the scope is a property of the run:
// `proveProgram` announces it here, and every model query is answered in it.
let ctorScopeDecl = null;
export function setConstructorScopeDecl(name) {
  const n = name ? String(name) : null;
  if (n !== ctorScopeDecl) { ctorScopeDecl = n; memoCtors = new Map(); }
}
// Byte offset where the scope decl starts, or Infinity when there is none / it
// cannot be located (FAIL OPEN — the whole program stays visible, as before).
function ctorScopeLimit(src) {
  if (!ctorScopeDecl) return Infinity;
  const esc = ctorScopeDecl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\n)\\s*(?:rec|proof|and\\s+rec|and)\\s+${esc}\\s*:`, 'u').exec(src);
  return m ? m.index : Infinity;
}

export function enumerateConstructorsTyped(code, family) {
  if (!family) return [];
  const src = String(code == null ? '' : code);
  const memo = memoFor(src);
  if (memo.ctors.has(family)) return memo.ctors.get(family);
  const scopeLimit = ctorScopeLimit(src);
  const done = (result) => { memo.ctors.set(family, result); return result; };
  const tree = parseTreeFor(src);
  if (!tree) return done([]);
  const slice = (n) => src.slice(n.from, n.to).trim();
  const out = [];
  const seen = new Set();
  // A family we enumerate constructors for must be DECLARED — a bare metavariable
  // must never pose as one (`refl_proc : eq_proc P P` is NOT a constructor of
  // "family P", and the AST spine misreads an infix result `P ⇛ S` as headed by P).
  if (!isDeclaredTypeFamily(src, family)) return done([]);

  const cur = tree.cursor();
  do {
    // Block-form constructors (LFConstructor) and top-level decls (LFDeclaration).
    const isCtorNode = cur.name === 'LFConstructor';
    const isDecl = cur.name === 'LFDeclaration';
    // Slice 1 (2026-07-20): CompConstructor — a comp-level (ctype/inductive)
    // constructor, `inductive Name : … ctype = | Ctor : CompType | …;`. The
    // grammar ALREADY parses this structurally (comment-safe, correctly
    // block-bounded by construction) — reading it retired the hand-rolled
    // text-scanning pipeline this session built and then had to keep
    // patching (P16 comment-unsafety, the block-extent bug). Verified against
    // the whole corpus (231 families): every one of the 36 places the two
    // paths disagreed was the OLD scanner being wrong (an entire family
    // returning [], multiple Pi binders glommed into one string, or garbage
    // spilling in from the next mutual-block decl) — zero regressions.
    const isCompCtorNode = cur.name === 'CompConstructor';
    // SHADOWING: a program may DECLARE the same family twice (a refined variant
    // later in the same file, or in a later file of an assembly). Beluga's scope
    // rule is last-wins — the proof under repair sees the LAST declaration — but
    // this walker kept the FIRST (`seen` holds the earliest key), so it enumerated
    // the SHADOWED family's constructors: wrong arities, wrong arms, and every
    // split on that family rejected. When a new declaration of `family` opens,
    // drop what the previous one contributed.
    if (cur.name === 'LFDatatypeDeclaration' || cur.name === 'InductiveDeclaration'
      || cur.name === 'StratifiedDeclaration' || cur.name === 'CoinductiveDeclaration') {
      if (cur.from >= scopeLimit) continue;
      const hid = firstIdentChild(cur.node);
      if (hid && slice(hid) === family && out.length) { out.length = 0; seen.clear(); }
      continue;
    }
    if (!isCtorNode && !isDecl && !isCompCtorNode) continue;
    if (cur.from >= scopeLimit) continue;
    const node = cur.node;
    const id = firstIdentChild(node);
    if (!id) continue;
    const name = slice(id);
    if (isCompCtorNode) {
      const ctypeNode = firstChildNamed(node, 'CompType');
      if (!ctypeNode) continue;
      const spine = compArrowSpineTree(ctypeNode, slice);
      if (!spine || spine.result.head !== family) continue;
      const key = name + '::' + spine.result.indices.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, argTypes: spine.argTypes, result: spine.result });
      continue;
    }
    // The type node: for a constructor it's the LFType after `:`; for a top-level
    // decl, the LFType/LFKind after `:` (we only want term families, so skip kinds
    // whose result is `type`).
    const typeNode = firstChildNamed(node, 'LFType');
    if (!typeNode) continue;
    const spine = lfDeclSpine(typeNode, slice, family);
    if (!spine) continue;
    if (spine.result.head !== family) continue;
    const key = name + '::' + spine.result.indices.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name, argTypes: spine.argTypes, result: spine.result, piArgIdx: spine.piArgIdx || [],
    });
  } while (cur.next());
  if (!out.length) {
    for (const c of enumerateInfixLfDeclsText(src, family)) {
      const key = c.name + '::' + c.result.indices.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }
  return done(out);
}

// Slice 1 (2026-07-20): the text-scanning pipeline that used to live here
// (`ctypeCtorArms`, `stripLfCommentsForCtors`, `blockExtent`,
// `enumerateCTypeConstructorsText`) is RETIRED — `enumerateConstructorsTyped`
// now reads `CompConstructor` nodes directly from the Lezer tree (above),
// which is comment-safe and correctly block-bounded by construction (there
// is no text span to mis-scope). Verified byte-for-byte against the whole
// corpus before deletion: see docs/prover-master-plan.md's Slice 1 entry.
// `compArrowSpineTyped` (below) stays — it is still used by the INFIX-family
// text fallback (`enumerateInfixLfDeclsText`), a separate, untouched path.
function compArrowSpineTyped(typeText) {
  const parts = splitArrowSpineText(typeText);
  if (!parts.length) return null;
  const result = parseAppType(parts[parts.length - 1]);
  if (!result || !result.head) return null;
  return { argTypes: parts.slice(0, -1), result };
}

function infixFamilySpine(typeText, family) {
  if (!family) return null;
  const arrows = splitArrowSpineText(typeText);
  if (!arrows.length) return null;
  const esc = String(family).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const last = arrows[arrows.length - 1];
  const m = last.match(new RegExp(`^(.+?)\\s+${esc}\\s+(.+)$`));
  if (!m) return null;
  return {
    argTypes: arrows.length > 1 ? arrows.slice(0, -1) : [],
    result: { head: family, indices: [m[1].trim(), m[2].trim()] },
  };
}

function lfDeclSpine(typeNode, slice, family) {
  const ast = lfArrowSpineTyped(typeNode, slice);
  if (ast && ast.result.head === family) return ast;
  return infixFamilySpine(slice(typeNode), family);
}

function enumerateInfixLfDeclsText(src, family) {
  const out = [];
  const seen = new Set();
  let acc = '';
  for (const raw of String(src || '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('%')) continue;
    acc = acc ? `${acc} ${line}` : line;
    if (!acc.endsWith('.')) continue;
    const m = acc.match(/^([\p{L}_][\p{L}\p{N}_'βκ∥≡⅋⊗⊕&⇛]*)\s*:\s*(.+)\.\s*$/u);
    acc = '';
    if (!m) continue;
    const spine = infixFamilySpine(m[2], family) || compArrowSpineTyped(m[2]);
    if (!spine || spine.result.head !== family) continue;
    const key = m[1] + '::' + spine.result.indices.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: m[1], argTypes: spine.argTypes, result: spine.result });
  }
  return out;
}

// Walk an LFType's top-level arrow spine, returning argument TYPE texts and the
// result type decomposed into { head, indices:[arg texts] }. `slice` reads node
// text.
//
// A `{A:tp}` binder that is WRITTEN in the source is an EXPLICIT argument of the
// constructor — Beluga's implicit arguments come from FREE uppercase variables
// and are never spelled — so it must appear in `argTypes`, in position, exactly
// as the comp-level twin (`compArrowSpineTree`) already does. This walker used to
// drop them ("index variables, not term args"), which silently built every
// pattern and every application of such a constructor with the wrong ARITY
// (`lam (\x. X)` for `lam : {A:tp}(value A -> exp B) -> value (arr A B)`), so the
// checker rejected the whole case and the theorem had no first move at all.
function lfArrowSpineTyped(typeNode, slice) {
  const argTypes = [];
  const piArgIdx = [];
  let node = unwrapParenLFType(typeNode);
  for (let guard = 0; node && guard < 256; guard += 1) {
    const children = [];
    for (let c = node.firstChild; c; c = c.nextSibling) children.push(c);
    const brace = children.find((c) => c.name === '{');
    const arrow = children.find((c) => c.name === 'ArrowOp');
    if (brace) {
      const close = children.findIndex((c) => c.name === '}');
      const body = close >= 0 ? children.slice(close + 1).find((c) => c.name === 'LFType') : null;
      if (!body) return null;
      piArgIdx.push(argTypes.length);
      argTypes.push(slice({ from: brace.from, to: children[close].to }));
      node = unwrapParenLFType(body);
      continue;
    }
    if (!arrow) break; // atomic result
    const lf = children.filter((c) => c.name === 'LFType');
    if (lf.length < 2) break;
    argTypes.push(slice(lf[0]));
    node = unwrapParenLFType(lf[lf.length - 1]);
  }
  // `node` is now the (atomic) result type — read its head + index args.
  const result = appHeadAndIndices(node, slice);
  if (!result || !result.head) return null;
  return { argTypes, result, piArgIdx };
}

// REDUNDANT GROUPING in the TAIL of an arrow spine: `axiom : (hyp A -> conc A)`
// and `impl : conc A -> (hyp B -> conc C) -> (hyp (imp A B) -> conc C)` wrap the
// continuation of the spine in parentheses. Those parens are grouping, not a
// higher-order argument — the arrows inside them are still the constructor's own
// arguments. Unwrapping ONLY the tail keeps a genuine HO argument (which is read
// from the ARGUMENT slot, parens and all) untouched, while recovering the args a
// parenthesized tail was hiding (the model reported `axiom` as NULLARY).
function unwrapParenLFType(node) {
  let n = node;
  for (let guard = 0; n && guard < 16; guard += 1) {
    const children = [];
    for (let c = n.firstChild; c; c = c.nextSibling) children.push(c);
    if (children.some((c) => c.name === 'ArrowOp' || c.name === '{')) return n;
    // Descend the single-child LFAppType/LFAtomicType chain to the `( … )` group.
    let inner = n;
    let body = null;
    for (let d = 0; inner && d < 8; d += 1) {
      const kids = [];
      for (let c = inner.firstChild; c; c = c.nextSibling) kids.push(c);
      if (kids.some((c) => c.name === '(')) { body = kids.find((c) => c.name === 'LFType'); break; }
      inner = kids.find((c) => c.name === 'LFAppType') || kids.find((c) => c.name === 'LFAtomicType');
    }
    if (!body) return n;
    n = body;
  }
  return n;
}

// Decompose an applicative LF type `head a1 a2 …` into { head, indices:[a1,a2,…] }
// from the LFAppType left-spine. Each index is the raw text of an applied term.
function appHeadAndIndices(typeNode, slice) {
  // Descend to the LFAppType.
  let app = typeNode;
  if (app && app.name !== 'LFAppType') app = firstChildNamed(app, 'LFAppType');
  if (!app) {
    // An atomic head with no args (e.g. a result like `nat`).
    const atom = firstChildNamed(typeNode, 'LFAtomicType') || typeNode;
    const id = firstIdentChild(atom);
    return id ? { head: slice(id), indices: [] } : null;
  }
  // Collect the spine: LFAppType nests left (LFAppType (LFAppType head a1) a2).
  const indices = [];
  let n = app;
  let head = null;
  for (let guard = 0; n && guard < 128; guard += 1) {
    const left = firstChildNamed(n, 'LFAppType');
    // The applied argument is the LAST non-LFAppType child (LFAtomicTerm / term).
    let arg = null;
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.name !== 'LFAppType') arg = c;
    }
    if (left) {
      if (arg) indices.unshift(slice(arg));
      n = left;
    } else {
      // innermost: head atom
      const atomic = firstChildNamed(n, 'LFAtomicType');
      const id = atomic ? firstIdentChild(atomic) : firstIdentChild(n);
      if (id) head = slice(id);
      break;
    }
  }
  return head ? { head, indices } : null;
}

// Slice 1 (2026-07-20, grind-inspired substrate work): a TREE-based twin of
// `lfArrowSpineTyped`/`appHeadAndIndices` for `CompType` — the grammar node
// for a comp-level (ctype/inductive) constructor's type. `beluga.grammar`
// already parses `inductive Name : … ctype = | Ctor : CompType | …;` blocks
// structurally (InductiveDeclaration → InductiveBody → CompConstructor), with
// CompType itself a real recursive rule (arrow spine, {}/() Pi binders,
// CompAppType application spine) — this walker reads THAT tree instead of
// hand-rolling a second, comment-unsafe, block-extent-fragile text scanner
// (the `enumerateCTypeConstructorsText`/`ctypeCtorArms` pipeline this session
// built and then had to keep patching). Mirrors lfArrowSpineTyped exactly:
// same {argTypes, result} output shape, same "just slice the raw arg text"
// policy (an LF-boxed arg's `[Γ⊢…]` brackets are preserved as-is in its slice
// — downstream consumers already know how to read that shape).
function compArrowSpineTree(typeNode, rawSlice) {
  // Multi-line source formatting is common in comp-type premises (block
  // arguments especially) — normalize internal whitespace so a tree-sourced
  // slice matches the OLD regex path's `.replace(/\s+/g,' ')` convention byte
  // for byte (downstream string-matching is token-based either way, but
  // exact-equality/pin comparisons should not have to care about layout).
  const slice = (n) => rawSlice(n).replace(/\s+/g, ' ').trim();
  const argTypes = [];
  let node = typeNode;
  for (let guard = 0; node && guard < 256; guard += 1) {
    const children = [];
    for (let c = node.firstChild; c; c = c.nextSibling) children.push(c);
    // A Pi binder is `{CompTypeBinder}` OR `(CompTypeBinder)` — CompType has
    // TWO binder forms (unlike LFType's implicit-only `{…}`). UNLIKE the LF
    // walker (which discards its Pi binders — they reconstruct as implicit
    // index args, never real explicit ones), a comp-level Pi binder here IS a
    // real, nameable explicit constructor argument (`{h:taCtx}` in TRvor0) —
    // `splitTextForCtype`'s Pi-prefix detection and every other consumer
    // expect it as its OWN argType entry (matching the OLD regex path's
    // convention). Preserve it, then continue descending into the body.
    const brace = children.find((c) => c.name === '{' || c.name === '(');
    const arrow = children.find((c) => c.name === 'ArrowOp');
    if (brace) {
      const closeName = brace.name === '{' ? '}' : ')';
      const close = children.findIndex((c) => c.name === closeName);
      if (close < 0) return null;
      const closeNode = children[close];
      const body = children.slice(close + 1).find((c) => c.name === 'CompType');
      if (!body) return null;
      argTypes.push(slice({ from: brace.from, to: closeNode.to }));
      node = body;
      continue;
    }
    if (!arrow) break; // atomic result (CompAppType, possibly wrapped)
    const ct = children.filter((c) => c.name === 'CompType');
    if (ct.length < 2) break;
    argTypes.push(slice(ct[0]));
    node = ct[ct.length - 1];
  }
  const result = compAppHeadAndIndices(node, slice);
  if (!result || !result.head) return null;
  return { argTypes, result };
}

// Decompose a `CompAppType` left-spine (`head a1 a2 …`) into {head, indices}.
// Mirrors `appHeadAndIndices` for LF, over CompAppType/CompAtomicType/CompTypeArg.
function compAppHeadAndIndices(typeNode, slice) {
  let app = typeNode;
  if (app && app.name !== 'CompAppType') app = firstChildNamed(app, 'CompAppType');
  if (!app) {
    // An atomic head with no args — CompAtomicType's UpperIdentifier/
    // LowerIdentifier child directly (or the node itself already is one).
    const atom = firstChildNamed(typeNode, 'CompAtomicType') || typeNode;
    const id = firstIdentChild(atom);
    return id ? { head: slice(id), indices: [] } : null;
  }
  const indices = [];
  let n = app;
  let head = null;
  for (let guard = 0; n && guard < 128; guard += 1) {
    const left = firstChildNamed(n, 'CompAppType');
    // The applied argument is the LAST non-CompAppType child (a CompTypeArg).
    let arg = null;
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.name !== 'CompAppType') arg = c;
    }
    if (left) {
      if (arg) indices.unshift(slice(arg));
      n = left;
    } else {
      const atomic = firstChildNamed(n, 'CompAtomicType');
      const id = atomic ? firstIdentChild(atomic) : firstIdentChild(n);
      if (id) head = slice(id);
      break;
    }
  }
  return head ? { head, indices } : null;
}

// The type-family head of an `name : type` style binding text, e.g. `hyp x A`
// from `h : hyp x A`, `name` from `x : name`. Null when no head reads.
function headOfBindingType(text) {
  const m = String(text == null ? '' : text).replace(/^[^:]*:/, '').trim()
    .match(/([\p{L}_][\p{L}\p{N}_'.]*)/u);
  return m ? m[1] : null;
}

// Structured schema info, read from OUR AST. Returns
//   { elements: [{ block: bool, fields: [{name, head}] | null, head: string|null }] }
// — a bare element (`nctx = name`) has block:false, head:'name'; a block element
// (`ctx = some […] block x:name, h:hyp x A`) has block:true with its fields. This is
// what a schema-aware PARAMETER split needs: a `hyp` term in a `ctx` context is a
// projection `#p.h` of the block (the field whose type-head is `hyp`). Empty when
// the schema isn't found.
export function schemaInfo(code, schemaName) {
  const info = { elements: [] };
  if (!schemaName) return info;
  const src = String(code == null ? '' : code);
  const memo = memoFor(src);
  if (memo.schemas.has(schemaName)) return memo.schemas.get(schemaName);
  const tree = parseTreeFor(src);
  if (!tree) return info;
  memo.schemas.set(schemaName, info); // filled in place below
  const cur = tree.cursor();
  do {
    if (cur.name !== 'SchemaDeclaration') continue;
    const id = firstChildNamed(cur.node, 'LowerIdentifier');
    if (!id || src.slice(id.from, id.to) !== schemaName) continue;
    const body = firstChildNamed(cur.node, 'SchemaBody');
    if (!body) break;
    for (let el = body.firstChild; el; el = el.nextSibling) {
      if (el.name !== 'SchemaElement') continue;
      const block = firstChildNamed(el, 'LFBlock');
      if (block) {
        const fields = [];
        for (let f = block.firstChild; f; f = f.nextSibling) {
          if (f.name !== 'LFBlockField') continue;
          const fid = firstChildNamed(f, 'LowerIdentifier');
          const fieldSrc = src.slice(f.from, f.to).trim();
          const colon = fieldSrc.indexOf(':');
          const typeText = colon >= 0 ? fieldSrc.slice(colon + 1).trim() : null;
          fields.push({
            name: fid ? src.slice(fid.from, fid.to) : null,
            head: headOfBindingType(typeText ? ':' + typeText : fieldSrc),
            type: typeText,
          });
        }
        info.elements.push({ block: true, fields, head: null });
      } else {
        const ty = firstChildNamed(el, 'LFType');
        info.elements.push({ block: false, fields: null, head: ty ? headOfBindingType(':' + src.slice(ty.from, ty.to)) : null });
      }
    }
    break;
  } while (cur.next());
  return info;
}

// Every schema NAME the program declares, in source order.
export function declaredSchemaNames(code) {
  const src = String(code == null ? '' : code);
  const tree = parseTreeFor(src);
  const out = [];
  if (!tree) return out;
  const cur = tree.cursor();
  do {
    if (cur.name !== 'SchemaDeclaration') continue;
    const id = firstChildNamed(cur.node, 'LowerIdentifier');
    if (id) {
      const n = src.slice(id.from, id.to);
      if (n && !out.includes(n)) out.push(n);
    }
  } while (cur.next());
  return out;
}

// The schema of a context we could NOT name. A theorem may leave its context
// variables FREE (Beluga quantifies them implicitly — `nsubst : … [g |- neut S[]]
// → [h |- neut S[]]` never writes `(g:ctx)`), and the checker then reports the
// context as `g` or `_` with no binder anywhere to read a schema from. Without a
// schema the split emits no PARAMETER arm, so every case on a family the context
// admits is coverage-incomplete and is rejected outright — measured as the
// dominant COVERAGE FAILURE sub-cause.
//
// The family alone decides it: if exactly ONE declared schema admits `head`, that
// is the context's schema. Ambiguity (two schemas admitting the same family) is
// not guessed — we return null and behave as before.
export function soleSchemaAdmitting(code, head) {
  if (!head) return null;
  let found = null;
  for (const name of declaredSchemaNames(code)) {
    const info = schemaInfo(code, name);
    if (!parameterTermFor(head, info)) continue;
    if (found) return null; // ambiguous — do not guess
    found = info;
  }
  return found;
}

// The set of LF type-family heads a schema admits (derived from schemaInfo) — a
// quick membership check. `ctx = tm` → {tm}; block schema → its field heads.
export function schemaAdmittedTypes(code, schemaName) {
  const out = new Set();
  for (const el of schemaInfo(code, schemaName).elements) {
    if (el.block) { for (const f of (el.fields || [])) if (f.head) out.add(f.head); }
    else if (el.head) out.add(el.head);
  }
  return out;
}

// ── Dependency closure ───────────────────────────────────────────────────────
// The type-family heads REACHABLE from `family` through its constructors: argument
// types (including Pi binder types) plus the families of term constructors used in
// argument/result indices. Decides what a derivation of the family can possibly
// contain — a metavariable of a family whose closure never reaches any context
// type is CLOSED there (the `D[]` pattern annotation); one that reaches `name` but
// not `hyp` keeps name binders and drops hyp ones (`linP1[.., z]`). A sound
// over-approximation from OUR AST; the checker certifies the final pattern.
export function reachableTypeHeads(code, family) {
  const seen = new Set();
  const queue = [String(family || '')];
  const enqueue = (fam) => { if (fam && !seen.has(fam) && !queue.includes(fam)) queue.push(fam); };
  const famOfToken = new Map();
  const tokenFamily = (tok) => {
    if (!famOfToken.has(tok)) {
      let fam = null;
      if (enumerateConstructorsTyped(code, tok).length) fam = tok;
      else fam = familyOfConstructorName(code, tok);
      famOfToken.set(tok, fam);
    }
    return famOfToken.get(tok);
  };
  const indexTokens = (text) => [...String(text || '').matchAll(/[\p{L}\p{S}_][\p{L}\p{N}\p{S}_']*/gu)]
    .map((m) => m[0]).filter((t) => !/^\p{Lu}/u.test(t));
  let guard = 64;
  while (queue.length && guard-- > 0) {
    const fam = queue.shift();
    if (!fam || seen.has(fam)) continue;
    seen.add(fam);
    for (const ctor of enumerateConstructorsTyped(code, fam)) {
      for (const at of ctor.argTypes) {
        for (const part of splitArrowSpineText(stripOneOuterParen(at))) {
          const pi = parsePiBinder(part);
          const target = pi ? pi.type : part;
          enqueue(headOfConclusion(target));
          for (const tok of indexTokens(target)) enqueue(tokenFamily(tok));
        }
      }
      for (const idx of ((ctor.result && ctor.result.indices) || [])) {
        for (const tok of indexTokens(idx)) enqueue(tokenFamily(tok));
      }
    }
  }
  return seen;
}

// The PARAMETER-VARIABLE LF term that matches a context variable of `head` type in
// a context of schema `schema` (from schemaInfo). For a block schema it is the
// projection of the field whose type-head is `head` (`#p.h[..]`); for a bare schema
// it is `#p[..]`. Null when no element of the schema admits `head`.
export function parameterTermFor(head, schema) {
  if (!schema || !Array.isArray(schema.elements)) return null;
  for (const el of schema.elements) {
    if (el.block) {
      const field = (el.fields || []).find((f) => f.head === head && f.name);
      if (field) return `#p.${field.name}[..]`;
    } else if (el.head === head) {
      return '#p[..]';
    }
  }
  return null;
}

// ── Pattern + skeleton assembly (OURS, in our grammar) ──────────────────────
// A fresh uppercase metavariable name generator (X, X1, X2, …) avoiding a set of
// names already in scope.
export function freshNamer(used) {
  const taken = new Set(used || []);
  let n = 0;
  return () => {
    let name;
    do { name = n === 0 ? 'X' : 'X' + n; n += 1; } while (taken.has(name));
    taken.add(name);
    return name;
  };
}

function freshLowerNamer(used) {
  const taken = new Set(used || []);
  const base = ['x', 'd', 'y', 'z', 'h'];
  let n = 0;
  const reserve = (name) => { if (name) taken.add(name); };
  const next = () => {
    let name;
    do {
      const b = base[n % base.length];
      const k = Math.floor(n / base.length);
      name = b + (k === 0 ? '' : k);
      n += 1;
    } while (taken.has(name));
    taken.add(name);
    return name;
  };
  return { next, reserve };
}

// Shared descriptor for an explicit constructor argument type. Higher-order
// arguments carry both the lambda-pattern arity and the typed context extension
// needed when the prover later recurses under that binder.
export function constructorArgDescriptor(typeText, usedNames = []) {
  const raw = String(typeText || '').trim();
  const unwrapped = stripOneOuterParen(raw);
  const parts = splitArrowSpineText(unwrapped);
  const lower = freshLowerNamer(usedNames);
  const binders = [];
  let bodyType = unwrapped;
  let explicitPi = null;
  if (parts.length > 1) {
    for (let i = 0; i < parts.length - 1; i += 1) {
      const p = parts[i].trim();
      const pi = parsePiBinder(p);
      if (pi) {
        explicitPi = pi;
        const name = pi.name || lower.next();
        lower.reserve(name);
        binders.push({ name, type: pi.type });
      } else {
        binders.push({ name: lower.next(), type: p });
      }
    }
    bodyType = parts[parts.length - 1].trim();
  }
  // A WHOLE argument that is itself an explicit `{n:T}` binder (lfArrowSpineTyped
  // now keeps those in position — they are real, spelled arguments).
  const wholePi = parsePiBinder(unwrapped);
  return {
    higherOrder: binders.length > 0,
    binders: binders.length,
    binderCtx: binders,
    bodyType,
    explicitPi,
    piBinder: wholePi,
  };
}

function stripOneOuterParen(text) {
  const s = String(text || '').trim();
  if (s[0] === '(' && matchingParenText(s, 0) === s.length - 1) return s.slice(1, -1).trim();
  return s;
}

function matchingParenText(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i += 1) {
    if (s[i] === '(') depth += 1;
    else if (s[i] === ')') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

function parsePiBinder(text) {
  const m = /^\{\s*([\p{L}_][\p{L}\p{N}_']*)\s*:\s*([\s\S]*)\}$/u.exec(String(text || '').trim());
  return m ? { name: m[1], type: m[2].trim() } : null;
}

// Which explicit `{X:T}` argument positions are ALREADY supplied by a later
// hypothesis argument's block-projection PAIR? The `{X:name} hyp X A -> …` idiom
// (str_wtp's `wtp_fwd`) fills BOTH slots from one block (`#b.x #b.h` — the name
// and its derivation), so emitting the binder separately over-applies the
// constructor. Returns a Set of indices into `argTypes`.
function piArgsCoveredByHyp(argTypes) {
  const covered = new Set();
  const list = (argTypes || []).map((t) => String(t == null ? '' : t));
  for (let i = 0; i < list.length; i += 1) {
    const pi = parsePiBinder(stripOneOuterParen(list[i]));
    if (!pi || !pi.name) continue;
    const esc = pi.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_'])${esc}([^\\p{L}\\p{N}_']|$)`, 'u');
    for (let j = i + 1; j < list.length; j += 1) {
      if (isHypArgType(list[j]) && re.test(list[j])) { covered.add(i); break; }
    }
  }
  return covered;
}

export function splitArrowSpineText(text) {
  const s = String(text || '').trim();
  const out = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (c === '{' && depth === 0) {
      const close = s.indexOf('}', i);
      // A Pi binder is its own spine segment whenever nothing but whitespace
      // precedes it in the current segment (`-> {y:name}hyp y A ->` carries a
      // leading space — the binder still starts the segment).
      if (close >= 0 && !s.slice(start, i).trim()) {
        out.push(s.slice(i, close + 1).trim());
        start = close + 1;
        i = close;
      }
    } else if (depth === 0 && ((c === '-' && s[i + 1] === '>') || c === '→')) {
      out.push(s.slice(start, i).trim());
      start = i + (c === '-' ? 2 : 1);
      if (c === '-') i += 1;
    }
  }
  const tail = s.slice(start).trim();
  if (tail) out.push(tail);
  return out.filter(Boolean);
}

function ctxBinderNames(ctxStr) {
  const parts = String(ctxStr || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return [];
  return parts.slice(1).map((p) => {
    const colon = p.indexOf(':');
    return colon >= 0 ? p.slice(0, colon).trim() : p.split(/\s+/)[0];
  }).filter(Boolean);
}

function ctxNameBinderNames(ctxStr) {
  const parts = String(ctxStr || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return [];
  return parts.slice(1)
    .filter((p) => /:\s*name\b/.test(p))
    .map((p) => p.slice(0, p.indexOf(':')).trim())
    .filter(Boolean);
}

function metaProjectionSuffix(lambdaBinders, ctxNames) {
  const idx = [...lambdaBinders, ...ctxNames];
  return idx.length ? `[.., ${idx.join(', ')}]` : '[..]';
}

export function isHypArgType(typeText) {
  return /^hyp\s+/.test(String(typeText || '').trim());
}

// A "closed" LF argument type: a bare family application `F I1 … In` whose indices
// are all metavariables (uppercase) with NO context binder and no lambda — its
// inhabitant is a closed metavar boxed `[]`. General & structural (dual_sym's
// premises `dual A A'` are the canonical case), not tied to any family name.
function isClosedArgType(typeText) {
  const t = String(typeText || '').trim();
  if (!t || /[(){}]|\\|\|-|⊢|\[/.test(t)) return false;
  const toks = t.split(/\s+/);
  if (toks.length < 2) return false;
  if (!/^\p{Ll}/iu.test(toks[0])) return false;
  return toks.slice(1).every((x) => /^\p{Lu}[\p{L}\p{N}_']*$/u.test(x));
}

function normCtxText(ctx) {
  return String(ctx || '').replace(/\s+/g, ' ').trim();
}

function needsWeakening(hypType, goalBox) {
  const tc = normCtxText(contextOf(hypType));
  const gc = normCtxText(contextOf(goalBox));
  if (!tc || !gc || tc === gc) return false;
  return tc.startsWith(gc) && (tc.length === gc.length || tc[gc.length] === ',');
}

function fillTermForHyp(hyp, goalBox, want) {
  const term = hyp.name;
  // A hypothesis whose context strictly extends the goal's must be weakened to the
  // goal context, written `name[]` (an empty-substitution box).
  if (needsWeakening(hyp.type, goalBox)) return `${term}[]`;
  // A CLOSED metavar (empty own context) placed into a non-empty goal context needs
  // the empty substitution `name[]` too. General: keyed on the hypothesis' context
  // being empty while the goal's is not — no family name involved.
  const hypCtx = normCtxText(contextOf(hyp.type));
  const goalCtx = normCtxText(contextOf(goalBox));
  if (!hypCtx && goalCtx && /^[A-Z(]/.test(String(hyp.type || '').trim())) return `${term}[]`;
  return term;
}

function hypBlockNameFromType(want) {
  const t = String(want || '').trim();
  const m = /^hyp\s+([^\s]+)/.exec(t);
  if (!m || !m[1].startsWith('#')) return null;
  return m[1].split('.')[0];
}

function hypFillTerms(want, meta, opts = {}) {
  const block = hypBlockNameFromType(want);
  if (block) {
    const entry = (meta || []).find((m) => m && m.name === block);
    if (!entry || !parseBlockFields(entry.type)) return null;
    return [`${block}.x`, `${block}.h`];
  }
  if (opts.blockHyp) {
    const b = freshBlockNamer([])();
    return [`#${b}.x`, `#${b}.h`];
  }
  const ch = hypNameChannel(want);
  if (!ch) return null;
  return ch;
}

function findScopeForArg(want, scope, goalBox) {
  const exact = scope.find((s) => typesMatchModuloSpacing(s.concl, want));
  if (exact) return exact;
  const wantHead = headOfConclusion(want);
  if (!wantHead) return null;
  const cands = scope.filter((s) => headOfConclusion(s.concl) === wantHead);
  if (!cands.length) return null;
  const scored = cands.map((s) => {
    const vague = (String(s.concl).match(/_/g) || []).length;
    const precise = /\[\.\./.test(s.concl) ? 1 : 0;
    const weaken = goalBox && needsWeakening(s.type, goalBox) ? 100 : 0;
    return { s, score: precise * 10 - vague - weaken };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].s;
}

function branchBodyBefore(code, hole) {
  if (!hole || !hole.line) return '';
  const lines = String(code || '').split('\n');
  const ln = lines[hole.line - 1] || '';
  let col = hole.col || 1;
  const qi = ln.indexOf('?');
  if (qi >= 0) col = qi + 1;
  let off = 0;
  // Guard a hole line past the doc end (a stale hole against a shrunken program).
  const upto = Math.min(hole.line, lines.length + 1);
  for (let l = 1; l < upto; l += 1) off += (lines[l - 1] || '').length + 1;
  off += col - 1;
  const prefix = code.slice(0, off);
  const lastArm = Math.max(prefix.lastIndexOf('=>'), prefix.lastIndexOf('⇒'));
  return lastArm >= 0 ? prefix.slice(lastArm) : prefix;
}

// Names bound by `let [Γ |- R] = … in` in the case branch above a hole.
export function branchLetNames(code, hole) {
  return branchLetBindings(code, hole).map((b) => b.name);
}

// TYPED let bindings in the branch above a hole: each `let [Γ |- R…] = fn … in`
// recovers the bound name, the let's context, AND the conclusion family head of
// the applied function (looked up from its `rec`/`proof` signature) — so fills can
// pick the RIGHT recursion/lemma result by type instead of blind enumeration.
export function branchLetBindings(code, hole) {
  const body = branchBodyBefore(code, hole);
  const out = [];
  for (const m of body.matchAll(/let\s+(\[[\s\S]*?\])\s*=\s*([\p{L}_][\p{L}\p{N}_']*)/gu)) {
    const d = decomposeContextual(m[1]);
    if (!d) continue;
    const bind = String(d.concl || '').trim().split(/\s+/)[0].replace(/\[.*/, '');
    if (!bind || !/^[\p{L}_][\p{L}\p{N}_']*$/u.test(bind)) continue;
    out.push({ name: bind, ctx: d.ctx, head: declConclusionHead(code, m[2]) });
  }
  // CTYPE-pattern lets `let Res [b1] [b2] … = fn …` — each box binding a fresh
  // metavar is typed by the corresponding constructor argument's family (the
  // wildcard/constant boxes bind nothing).
  const re2 = /let\s+([\p{L}_][\p{L}\p{N}_']*)\s*\[/gu;
  let m2;
  while ((m2 = re2.exec(body)) !== null) {
    const boxes = [];
    let i = body.indexOf('[', m2.index + 3);
    while (i >= 0 && body[i] === '[') {
      let depth = 0;
      let j = i;
      for (; j < body.length; j += 1) {
        if (body[j] === '[') depth += 1;
        else if (body[j] === ']') { depth -= 1; if (depth === 0) break; }
      }
      if (depth !== 0) { boxes.length = 0; break; }
      boxes.push(body.slice(i, j + 1));
      i = j + 1;
      while (i < body.length && /\s/.test(body[i])) i += 1;
    }
    if (boxes.length < 2 || body[i] !== '=') continue;
    const fnm = /^=\s*([\p{L}_][\p{L}\p{N}_']*)/u.exec(body.slice(i));
    if (!fnm) continue;
    const conclHead = declConclusionHead(code, fnm[1]);
    if (!conclHead) continue;
    const ctors = enumerateConstructorsTyped(code, conclHead);
    const ctor = ctors.find((c) => c.name === m2[1]) || (ctors.length === 1 ? ctors[0] : null);
    if (!ctor) continue;
    boxes.forEach((bx, k) => {
      const bd = decomposeContextual(bx);
      if (!bd) return;
      const tok = String(bd.concl || '').trim();
      if (!/^[\p{L}_][\p{L}\p{N}_']*$/u.test(tok) || tok === '_') return; // GENERAL: `_` is the wildcard token, not a name
      // a declared constant in the pattern (refl_proc) binds nothing
      if (enumerateConstructorsTyped(code, tok).length || familyOfConstructorName(code, tok)) return;
      const at = ctor.argTypes[k];
      if (!at) return;
      const t = String(at).trim();
      const pim = t.startsWith('{') ? /^\{\s*[\p{L}_][\p{L}\p{N}_']*\s*:\s*([\s\S]*)\}$/u.exec(t) : null;
      const abox = decomposeContextual(pim ? pim[1].trim() : t);
      const nota = abox ? typeFamilyHead(abox.concl, code) : null;
      const head = (nota && nota !== 'type') ? nota : (abox ? headOfConclusion(abox.concl) : null);
      out.push({ name: tok, ctx: bd.ctx, head });
    });
  }
  return out;
}

// The conclusion family head of a declared `rec`/`proof` signature (null when the
// name isn't a declared theorem — e.g. a constructor RHS). Notation-aware: an
// infix conclusion `[g, x:name ⊢ P ⇛ Q]` is family `⇛`, not `P`.
function declConclusionHead(code, fnName) {
  if (!fnName) return null;
  const esc = String(fnName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`\\b(?:rec|proof)\\s+${esc}\\s*:\\s*([\\s\\S]*?)=`).exec(String(code || ''));
  if (!m) return null;
  const parts = splitArrowSpineText(m[1].trim());
  if (!parts.length) return null;
  const last = parts[parts.length - 1].trim();
  // An UNBOXED ctype conclusion (`Reassoc [ ⊢ N1] …`) leads with the family
  // constant itself; its boxed INDEX arguments carry `|-`s that would misdirect
  // conclusionOf. Resolve the leading identifier as a declared family first.
  const lead = (last.match(/^[\p{L}_][\p{L}\p{N}_']*/u) || [])[0];
  if (lead && enumerateConstructorsTyped(code, lead).length) return lead;
  const concl = conclusionOf(last);
  const nota = typeFamilyHead(concl, code);
  return (nota && nota !== 'type') ? nota : headOfConclusion(concl);
}

// The name-channel PAIR the branch pattern used for a fused `{X:name}`+hyp
// constructor argument (`… x[..] hx …`): the fill in the strengthened body reuses
// the name metavar; the hyp slot takes a strengthened result. Null when the branch
// pattern carries no such pair.
export function branchPairChannel(code, hole) {
  const box = branchPatternBox(code, hole);
  if (!box) return null;
  const m = /\b(\p{Ll}[\p{L}\p{N}_']*)\[\.\.\]\s+(h[\p{L}\p{N}_']*)/u.exec(box);
  return m ? { nameVar: m[1], hypVar: m[2] } : null;
}

function fillScope(hole, code) {
  const seen = new Set();
  const out = [];
  const add = (name, type) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push({ name, type: type || '', concl: conclusionOf(type || name) });
  };
  // Let-bound results FIRST: the freshest derivations (a just-destructured
  // recursion's components) are the highest-signal fill arguments, and the
  // bounded combo enumeration must reach them before the cap.
  for (const b of branchLetBindings(code, hole)) {
    add(b.name, b.head ? `[${b.ctx} |- ${b.head} _]` : '');
  }
  for (const c of (hole.ctx || [])) add(c.name, c.type);
  for (const m of (hole.meta || [])) add(m.name, m.type);
  return out;
}

// The `\`-binder names a higher-order argument expects. A hypothesis-typed binder
// (`hyp v A`) is named by prefixing `h` to the variable it witnesses; other
// binders keep their descriptor name. General: derived from binder TYPES, no fixed
// variable names.
function hoLamBinderNames(desc) {
  const bs = (desc.binderCtx || []).map((b, i) => {
    if (/^hyp\b/.test(String(b.type || ''))) {
      const prev = (desc.binderCtx[i - 1] || {}).name;
      return 'h' + (prev || i);
    }
    return b.name;
  });
  for (let i = bs.length; i < desc.binders; i += 1) {
    bs.push('v' + i);
  }
  return bs;
}

// Wrap `term` in the `\`-binders a higher-order argument expects.
function hoLamTerm(desc, term) {
  const bs = hoLamBinderNames(desc);
  return '(' + bs.map((b) => '\\' + b + '. ').join('') + term + ')';
}

// A result bound over a trailing BLOCK slot whose field count equals the binder
// arity re-lambdas via the TUPLE substitution (`eq_lam \x.\u. E[.., <x;u>]` — the
// binders pack into the block slot). Null when the shape doesn't apply.
function hoLamTupleTerm(desc, entry) {
  const d = decomposeContextual(entry && entry.type);
  if (!d || !d.ctx) return null;
  const parts = splitTopLevel(d.ctx, ',').map((p) => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || '';
  const bi = last.indexOf('block');
  if (bi < 0) return null;
  let rest = last.slice(bi + 5).trim();
  if (rest[0] === '(') {
    const close = rest.lastIndexOf(')');
    rest = rest.slice(1, close < 0 ? rest.length : close);
  }
  const fields = splitTopLevel(rest, ',').filter((f) => f.trim());
  const bs = hoLamBinderNames(desc);
  if (!fields.length || fields.length !== bs.length) return null;
  return '(' + bs.map((b) => '\\' + b + '. ').join('') + `${entry.name}[.., <${bs.join(';')}>])`;
}

function hoLamTermFromPattern(code, hole, desc, term) {
  const box = branchPatternBox(code, hole);
  if (!box) return hoLamTerm(desc, term);
  let best = null;
  for (const m of String(box).matchAll(/\(((?:\\\w+\.\s*)+)([\p{L}_][\p{L}\p{N}_']*)\[\.\./gu)) {
    const binders = [...m[1].matchAll(/\\(\w+)\./g)].map((x) => x[1]);
    if (!best || binders.length > best.length) best = binders;
  }
  if (best && best.length > desc.binders) {
    return '(' + best.map((b) => '\\' + b + '. ').join('') + term + ')';
  }
  return hoLamTerm(desc, term);
}

function hoLamInner(term) {
  const m = /\.\s*([\p{L}_][\p{L}\p{N}_']*)\s*\)\s*$/u.exec(String(term || ''));
  return m ? m[1] : term;
}

function branchPatternBox(code, hole) {
  const body = branchBodyBefore(code, hole);
  const armLine = body.split('\n').find((l) => /^\s*\|/.test(l));
  if (!armLine) {
    const lines = String(code || '').split('\n');
    for (let i = hole.line - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (!/^\s*\|/.test(line)) continue;
      const start = line.indexOf('[');
      const end = line.lastIndexOf(']');
      if (start < 0 || end <= start) continue;
      const tail = line.slice(end + 1).trim();
      if (/=>\s*$/.test(tail) || /⇒\s*$/.test(tail)) return line.slice(start, end + 1);
    }
    return null;
  }
  const start = armLine.indexOf('[');
  const end = armLine.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  return armLine.slice(start, end + 1);
}

// Peel a non-turnstile outer box `[F [Γ |- …] …]` (a computation-type family applied
// to boxes) down to the inner boxed goal. General: keyed on the ABSENCE of a
// top-level turnstile plus the PRESENCE of a nested box, not on any family name.
function unwrapExtraGoalBox(goalStr) {
  const g = String(goalStr == null ? '' : goalStr).trim();
  if (g[0] === '[' && g.endsWith(']')) {
    const inner = g.slice(1, -1);
    if (!/\|-|⊢/.test(inner.replace(/\[[^\]]*\]/g, '')) && /\[[^\]]*(?:\|-|⊢)[^\]]*\]/.test(inner)) {
      return inner.trim();
    }
  }
  return g;
}

// A goal displayed as an UNBOXED computation-type application `F [Γ |- P] …` (a comp
// result type, not an LF box). Recover its head + context so fill/synthesis can reason
// about it. General: any head that is NOT a boxed `[Γ |- …]` goal and whose arguments
// include a boxed sub-term — the context is read from that first boxed argument (or the
// hole's context meta). No family name is hardcoded.
function resultGoalParts(hole) {
  const raw = unwrapExtraGoalBox(hole?.goal);
  if (!raw) return null;
  const gd = decomposeContextual(raw);
  const h = headOfConclusion(raw);
  if (!h) return null;
  // A genuine boxed goal `[Γ |- head …]` is handled by the normal path, not here.
  if (gd && /(?:\|-|⊢)/.test(String(raw))) {
    // Unless the box's own conclusion is itself a comp-family application over boxes.
    if (!/\[[^\]]*(?:\|-|⊢)[^\]]*\]/.test(gd.concl)) return null;
    return { head: headOfConclusion(gd.concl), ctx: gd.ctx };
  }
  // Unboxed `F [Γ |- …] …`: needs at least one boxed argument to qualify.
  if (!/\[[^\]]*(?:\|-|⊢)[^\]]*\]/.test(raw)) return null;
  let ctx = (hole.meta || []).find((x) => x && x.type === 'ctx')?.name || 'g';
  if (/_\s+\|-/.test(raw) || /\[_,/.test(raw)) ctx = '_';
  else {
    const m = raw.match(new RegExp(`^${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\[[^\\]]+\\])`));
    if (m && decomposeContextual(m[1])?.ctx) ctx = decomposeContextual(m[1]).ctx;
  }
  return { head: h, ctx };
}

// Candidate fill terms for ONE constructor argument of type `rawType`, given the
// argument's structural descriptor and the in-scope hypotheses. General & type-driven:
//   • dependent binder `{…}`  → `_` (checker infers)
//   • higher-order arg        → `\`-lambda over recursion results / scope vars
//   • hypothesis arg (`hyp …`)→ the block/param projection that inhabits it
//   • otherwise               → each in-scope hypothesis of a compatible type
// No lemma/family/variable name is hardcoded; the checker certifies each choice.
// Is `fam` a COMPUTATION-level family (declared `inductive`/`stratified`/…)? Its
// constructor fills are BARE applications over boxed arguments, never LF-boxed.
export function isCTypeFamily(code, fam) {
  if (!fam) return false;
  const esc = String(fam).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b(?:inductive|stratified|coinductive)\\s+${esc}\\s*:`).test(String(code || ''));
}

// Depth-2 argument synthesis (the invert-then-REBUILD idiom): fill an argument of
// a ctype family by applying ONE constructor of that family to in-scope
// hypotheses — `Halts/c (Onestep s ms') v` after `let Halts/c ms' v = h`. The
// engine already inverts premises cleanly; what was missing is re-CONSTRUCTING the
// nested witness (§4 / master-plan: intelligence in the term structure, not the
// STEP dimension). Strictly one level deep, and only when EVERY constructor
// argument is inhabited by an in-scope hypothesis of its family (the strong
// limiter — this fires exactly at a rebuild point, never as generic search
// breadth); ctors with a boxed-LF or Pi argument are skipped (their arg spelling
// is not a bare name). Rendered pre-parenthesised — renderApp does not wrap a
// multi-token index. The checker arbitrates; capped tight.
function nestedCtorArgFills(rawType, scope, code) {
  // The COMPUTATION family of a type, or null. A ctype derivation is an UNBOXED
  // application with an uppercase head (`MStep [⊢M] [⊢M']`); a boxed `[…]` LF/term
  // hypothesis is deliberately NOT a comp family — its inhabitant is spelled boxed,
  // not as a bare constructor application. `conclusionOf`/`headOfConclusion` grab
  // the tail after the last turnstile for these shapes, so parse the head directly.
  const compFam = (t) => {
    const s = String(t || '').trim();
    if (!s || s.startsWith('[') || s.startsWith('(') || s.startsWith('{')) return null;
    const p = parseAppType(s);
    const h = p && p.head;
    return (h && /^\p{Lu}/u.test(h)) ? h : null;
  };
  const fam = compFam(rawType);
  if (!fam) return [];
  const famOf = new Map();
  for (const s of scope) { const f = compFam(s.type); if (f) { if (!famOf.has(f)) famOf.set(f, []); if (!famOf.get(f).includes(s.name)) famOf.get(f).push(s.name); } }
  const out = [];
  for (const c of enumerateConstructorsTyped(code, fam)) {
    if (!c.argTypes || !c.argTypes.length) continue; // nullary handled elsewhere
    const perArg = [];
    let ok = true;
    for (const at of c.argTypes) {
      const d = constructorArgDescriptor(at, []);
      const afam = d.higherOrder ? null : compFam(at);
      const names = afam ? famOf.get(afam) : null;
      if (!names || !names.length) { ok = false; break; }
      perArg.push(names);
    }
    if (!ok) continue;
    for (const combo of cartesianArgCombos(perArg, 4, (c3) => new Set(c3).size === c3.length)) {
      out.push(`(${c.name} ${combo.join(' ')})`);
      if (out.length >= 6) return out;
    }
  }
  return out;
}

function argFillChoices(desc, rawType, hole, scope, goalBox, code) {
  if (/^\s*\{/.test(rawType)) {
    // An explicit Pi whose type is a BOX is a comp-level witness the checker can
    // infer — offer the boxed wildcard (`Res [g ⊢ _] …`, the existential idiom).
    const pi = parsePiBinder(String(rawType).trim());
    const bd = pi && decomposeContextual(pi.type);
    if (bd) return [bd.ctx ? `[${bd.ctx} |- _]` : '[ |- _]', '_'];
    return ['_'];
  }
  // A BOXED comp-constructor argument `[Γ ⊢ fam idx…]`: candidates are boxed terms
  // in the argument's OWN declared context — the branch pattern's matched term
  // (the strengthened scrutinee) first, then in-scope hyps of the family, then the
  // family's nullary constructors (the `refl_proc` witness idiom).
  const boxedArg = String(rawType || '').trim().startsWith('[') ? decomposeContextual(rawType) : null;
  if (boxedArg) {
    // Notation-aware family head: an infix conclusion (`P ⇛ Q'`) must resolve to
    // the operator family, not the left operand.
    const famHead = typeFamilyHead(boxedArg.concl, code);
    const fam = (famHead && famHead !== 'type') ? famHead : headOfConclusion(boxedArg.concl);
    const bbox = (t) => (boxedArg.ctx ? `[${boxedArg.ctx} |- ${t}]` : `[ |- ${t}]`);
    const out = [];
    const pat = branchPatternBox(code, hole);
    const pd = pat && decomposeContextual(pat);
    if (pd && pd.concl && fam && typeFamilyHead(pd.concl, code) === fam) {
      out.push(bbox(pd.concl.trim()));
      // REASSEMBLE the pattern's constructor from strengthened let-results: each
      // argument slot takes the (unconsumed) result whose conclusion family
      // matches (`β≡ ≡PQ' ⇛QR' ≡RS'`); a higher-order slot re-lambdas it.
      const patHead = headOfConclusion(pd.concl);
      const pctor = enumerateConstructorsTyped(code, fam).find((c) => c.name === patHead);
      if (pctor && pctor.argTypes.length) {
        const pool = scope.filter((s) => /^R\d*$/.test(s.name));
        const perSlot = pctor.argTypes.map((at) => {
          const d2 = constructorArgDescriptor(at, []);
          const c2 = conclusionOf(d2.higherOrder ? d2.bodyType : at);
          const nota2 = typeFamilyHead(c2, code);
          const f2 = (nota2 && nota2 !== 'type') ? nota2 : headOfConclusion(c2);
          return pool.filter((s) => headOfConclusion(s.concl) === f2).map((s) => {
            if (!d2.higherOrder) return s.name;
            const bs = d2.binderCtx.map((b) => b.name);
            return '(' + bs.map((b) => `\\${b}. `).join('') + `${s.name}[.., ${bs.join(', ')}])`;
          });
        });
        if (perSlot.every((l) => l.length)) {
          // small combo budget; a result must not fill two slots
          for (const combo of cartesianArgCombos(perSlot, 4, (c3) => new Set(c3).size === c3.length)) {
            out.push(bbox(`${patHead} ${combo.join(' ')}`));
          }
        }
      }
    }
    for (const s of scope) {
      if (fam && headOfConclusion(s.concl) === fam) out.push(bbox(s.name));
    }
    for (const c of enumerateConstructorsTyped(code, fam)) {
      if (!c.argTypes.length) out.push(bbox(c.name));
    }
    if (out.length) return [...new Set(out)];
  }
  if (desc.higherOrder) {
    // Recursion results whose conclusion family matches the argument's BODY family
    // first (typed let bindings make this precise); the whole R-pool only when no
    // typed match exists.
    const bodyHead = headOfConclusion(conclusionOf(desc.bodyType || ''));
    let pool = scope.filter((s) => s.name && /^R\d*$/.test(s.name));
    if (bodyHead) {
      const typed = pool.filter((s) => headOfConclusion(s.concl) === bodyHead);
      if (typed.length) pool = typed;
    }
    // The descriptor's OWN binder arity leads; the branch pattern's deeper binder
    // chain is only a fallback variant (the checker picks — a 1-binder `linear`
    // slot must not be wrapped in the sibling wtp-arg's 4 binders). A result bound
    // over a matching BLOCK slot re-lambdas via the tuple substitution first.
    const out = [];
    const seenNames = new Set();
    for (const s of pool) {
      if (seenNames.has(s.name)) continue;
      seenNames.add(s.name);
      const tuple = hoLamTupleTerm(desc, s);
      if (tuple) out.push(tuple);
      const plain = hoLamTerm(desc, s.name);
      const chained = hoLamTermFromPattern(code, hole, desc, s.name);
      out.push(plain);
      if (chained !== plain) out.push(chained);
    }
    return out;
  }
  if (isHypArgType(rawType) || isHypArgType(desc.bodyType)) {
    const ht = hypFillTerms(rawType, hole.meta) || hypFillTerms(desc.bodyType, hole.meta);
    if (ht) return [ht.join(' ')];
    // The branch pattern matched this fused `{X:name}`+hyp argument with a
    // name-channel pair (`x[..] hx`): reuse the name metavar; the hyp slot takes a
    // strengthened result of the same family, else the pattern's own witness.
    const pair = branchPairChannel(code, hole);
    if (pair) {
      const wantHead = headOfConclusion(rawType) || headOfConclusion(desc.bodyType);
      const hypPool = [
        ...scope.filter((s) => headOfConclusion(s.concl) === wantHead).map((s) => s.name),
        pair.hypVar,
      ];
      return [...new Set(hypPool)].map((p) => `${pair.nameVar} ${p}`);
    }
    return scope.map((s) => s.name);
  }
  const pool = scope.filter((s) => !needsWeakening(s.type, goalBox));
  const ordered = pool.length ? pool : scope;
  // Candidates whose conclusion family matches the wanted type's head come first —
  // keeps the right choice inside the bounded combo enumeration.
  const wantHead = headOfConclusion(rawType);
  const ranked = wantHead
    ? [...ordered].sort((a, b) => ((headOfConclusion(b.concl) === wantHead) ? 1 : 0) - ((headOfConclusion(a.concl) === wantHead) ? 1 : 0))
    : ordered;
  const bare = ranked.map((s) => fillTermForHyp(s, goalBox, rawType));
  // Depth-2 fallback: a nested constructor witness when a bare in-scope hypothesis
  // does not inhabit the slot (the invert-then-rebuild idiom — appended AFTER the
  // bare choices so existing proofs' candidate order is unchanged).
  const nested = nestedCtorArgFills(rawType, scope, code);
  return nested.length ? [...bare, ...nested] : bare;
}

// Bounded cartesian enumeration. `validPrefix` prunes DURING the walk — without
// it the cap fills with prefixes a later filter rejects wholesale (e.g. every
// combo carrying duplicate higher-order bodies), starving the viable ones.
function cartesianArgCombos(lists, max = 64, validPrefix = null) {
  let acc = [[]];
  for (const list of lists) {
    const next = [];
    for (const pref of acc) {
      for (const item of list) {
        if (next.length >= max) break;
        const cand = [...pref, item];
        if (validPrefix && !validPrefix(cand)) continue;
        next.push(cand);
      }
      if (next.length >= max) break;
    }
    acc = next.length ? next : [];
    if (!acc.length) break;
  }
  return acc;
}

function distinctHoBodies(args) {
  const ho = args.filter((a) => String(a).startsWith('('));
  if (ho.length <= 1) return true;
  const inner = ho.map(hoLamInner);
  return new Set(inner).size === inner.length;
}

function freshBlockNamer(used) {
  const taken = new Set(used || []);
  const pool = ['bx', 'bly', 'bz', 'bw'];
  let n = 0;
  return () => {
    let name = pool[n];
    if (!name || taken.has(name)) {
      do { name = 'b' + n; n += 1; } while (taken.has(name));
    } else {
      n += 1;
    }
    taken.add(name);
    return name;
  };
}

function hypBlockPattern(blockFresh) {
  const b = blockFresh();
  return [`#${b}.x[..]`, `#${b}.h[..]`];
}

// Inhabit a hypothesis argument `hyp v A` whose witnessed variable `v` is a
// lowercase context name: the pair `v[..] hv` (the variable and its hypothesis
// witness). General: derived from the witnessed name in the type, no fixed names.
function hypNameChannel(typeText) {
  const m = /^hyp\s+([\p{L}_][\p{L}\p{N}_']*)\s/u.exec(String(typeText || '').trim());
  if (!m) return null;
  const vn = m[1];
  if (/^\p{Lu}/u.test(vn)) return null;
  return [`${vn}[..]`, 'h' + vn];
}

// The LF term for one constructor application, e.g. `z`, `s X`, `app X X1`,
// `lam (\x. X)`. Higher-order args get `\`-binders. When `contextProjection` is set
// (the context carries bare parameter binders), a higher-order binder that shadows a
// context-variable name is alpha-renamed to a fresh lowercase name and the body's
// meta gets the corresponding projection suffix — this is name-AGNOSTIC (driven by
// which binders collide with the context), not tied to any family.
export function constructorTerm(ctor, fresh, opts = {}) {
  if (!ctor.args || !ctor.args.length) return ctor.name;
  const parts = [ctor.name];
  const ctxNames = ctxBinderNames(opts.ctxStr);
  const project = !!(opts.contextProjection && ctxNames.length);
  const lower = project ? freshLowerNamer([...(opts.usedNames || []), ...ctxNames]) : null;
  const blockFresh = freshBlockNamer(opts.usedNames || []);
  const piCovered = piArgsCoveredByHyp(ctor.args.map((a) => (a && a.piBinder ? `{${a.piBinder.name}:${a.piBinder.type}}` : (a && a.bodyType) || '')));
  for (let ai = 0; ai < ctor.args.length; ai += 1) {
    const arg = ctor.args[ai];
    if (piCovered.has(ai)) continue;
    if (arg.higherOrder && arg.binders > 0) {
      // Reserve each chosen binder name so a context-colliding binder's rename
      // can't duplicate a sibling binder (`\x. \d. \y. \d.` was the bug).
      const bs = (arg.binderCtx || []).map((b) => {
        if (!project) return b.name;
        if (ctxNames.includes(b.name)) return lower.next();
        lower.reserve(b.name);
        return b.name;
      });
      for (let i = bs.length; i < arg.binders; i += 1) {
        bs.push(project ? lower.next() : ('x' + (i === 0 ? '' : i)));
      }
      // Dependency-closure annotation: the body metavar depends only on the context
      // binders whose types its family can reach (`linP'[.., x, z]` drops hz).
      const keepNames = arg.dep ? arg.dep.keep : ctxNames;
      const body = project ? `${fresh()}${metaProjectionSuffix(bs, keepNames)}` : fresh();
      parts.push('(' + bs.map((b) => '\\' + b + '. ').join('') + body + ')');
    } else if (isHypArgType(arg.bodyType)) {
      // A hypothesis argument: inhabit it with a block projection `#b.x[..] #b.h[..]`
      // when the schema block provides one; otherwise a fresh name + witness pair.
      const ctorHasHo = ctor.args.some((a) => a.higherOrder);
      if (opts.blockHypProjection || !ctorHasHo) {
        parts.push(...hypBlockPattern(blockFresh));
      } else {
        const n = lower ? lower.next() : 'x';
        parts.push(`${n}[..]`, 'h' + n);
      }
    } else if (arg.dep && arg.dep.closed) {
      // The arg family's dependency closure reaches NOTHING the context admits —
      // the metavar is necessarily closed there; pin it (`wtp_fwd D[] …`) so the
      // strengthened body can reuse it verbatim.
      parts.push(`${fresh()}[]`);
    } else if (arg.dep) {
      // Partial dependency: keep only the reachable-typed tail binders (plus the
      // context variable via `..`) — `linP1[.., z]` in a (…, z:name, hz:hyp …) ctx.
      parts.push(`${fresh()}[..${arg.dep.keep.length ? ', ' + arg.dep.keep.join(', ') : ''}]`);
    } else {
      parts.push(fresh());
    }
  }
  return parts.join(' ');
}

// Wrap an LF term as a contextual pattern matching the scrutinee's box: `[ |- T]`
// for an empty context, `[Ψ |- T]` otherwise.
export function boxPattern(ctxStr, term) {
  const ctx = String(ctxStr == null ? '' : ctxStr).trim();
  return ctx ? `[${ctx} |- ${term}]` : `[ |- ${term}]`;
}

// Does the scrutinee's context admit a VARIABLE of the head type? — i.e. could the
// matched term itself be a context variable (needing a `#p[..]` parameter pattern)?
// True when an explicit binding `name : HEAD` appears in the context, or when the
// context's schema (its leading context-variable's schema) lists HEAD as a block
// type. `ctxStr` is the raw context text; `schemaTypes` (optional) is the set of LF
// types the context schema admits.
export function contextAdmitsHead(ctxStr, head, schemaTypes) {
  const ctx = String(ctxStr == null ? '' : ctxStr).trim();
  if (!ctx || !head) return false;
  // Explicit `x : head` binding in the context.
  const re = new RegExp(':\\s*' + head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
  if (re.test(ctx)) return true;
  // Schema of the leading context variable admits HEAD.
  if (schemaTypes && schemaTypes.has && schemaTypes.has(head)) return true;
  return false;
}

// Build the full `case SCRUT of | PAT => ? | …` skeleton. `ctxStr` is the
// scrutinee box's context (may be empty). Branches:
//   • a PARAMETER-VARIABLE branch FIRST when the context's schema admits a variable
//     of the scrutinee head — the correct projection from the block (`#p.h[..]`) or
//     bare (`#p[..]`), generated by us from the schema (NOT lifted from Beluga's
//     unparseable `#p.2[..]` printer text);
//   • one branch per constructor WE enumerated.
// A type with NO constructors but a parameter branch (e.g. `hyp` in a hypothesis
// context — the str_hyp case) yields a valid single-branch split. Returns the
// case-expression text (no trailing `;`), or null when there is NOTHING to emit
// (no constructors AND no parameter branch — BelJar can't model it → cascade).
export function patternMetavars(term) {
  const out = new Set();
  for (const m of String(term || '').matchAll(/\b(\p{Lu}[\p{L}\p{N}_']*)(?=\[\]|\[\.\.|\s|,|\)|$)/gu)) {
    out.add(m[1]);
  }
  return [...out];
}

// The refined-result TYPE ANNOTATION for a constructor arm: the ctor's result
// with each schematic index variable renamed to a name that BINDS in this arm —
// the declaration's own name when free, else a fresh variant. Null when the
// result carries no index variables (nothing to bind), or when any of them is
// HIGHER-ORDER — the ctor's declared type APPLIES it, `(M x)` — since a bare HO
// metavariable in an annotation is rejected ("Higher-order meta-variables not
// supported"); the reference proofs annotate exactly the first-order arms.
// ── Fixity-aware application rendering ───────────────────────────────────────
// A `--infix name …` pragma makes prefix use of the head ILLEGAL ("operator is
// missing its left argument") — every EMITTED application must respect the
// declared fixity. Parsing already understands infix input (infixFamilySpine,
// typeFamilyHead's operator fallback); this is the emission dual. Pragma names
// are read from the program text, never hardcoded. Cached per code text.
let _infixOpsSrc = null;
let _infixOpsSet = null;
export function infixDeclaredOps(code) {
  const src = String(code || '');
  if (src !== _infixOpsSrc) {
    _infixOpsSrc = src;
    _infixOpsSet = new Set();
    for (const m of src.matchAll(/(?:^|\n)\s*--infix\s+(\S+)/g)) _infixOpsSet.add(m[1]);
  }
  return _infixOpsSet;
}

// Is `s` already ONE grouped operand (fully wrapped by a single bracket pair)?
function isOneGroup(s) {
  const open = s[0];
  const close = open === '(' ? ')' : open === '[' ? ']' : null;
  if (!close || s[s.length - 1] !== close) return false;
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === open) depth += 1;
    else if (s[i] === close) { depth -= 1; if (depth === 0) return i === s.length - 1; }
  }
  return false;
}

function wrapOperand(t) {
  const s = String(t == null ? '' : t).trim();
  if (!s || !/\s/.test(s) || isOneGroup(s)) return s;
  return `(${s})`;
}

// Render `head idx…` respecting fixity: a 2-ary application of an infix-
// declared head becomes `lhs head rhs` (compound operands parenthesized);
// everything else stays prefix (the checker arbitrates the leftovers).
export function renderApp(code, head, indices) {
  const idx = (indices || []).map((x) => String(x == null ? '' : x).trim());
  if (idx.length === 2 && infixDeclaredOps(code).has(String(head))) {
    return `${wrapOperand(idx[0])} ${head} ${wrapOperand(idx[1])}`;
  }
  return idx.length ? `${head} ${idx.join(' ')}` : String(head);
}

function armAnnotation(ctor, ctxStr, used, code) {
  if (!ctor || !ctor.result || !ctor.result.indices || !ctor.result.indices.length) return null;
  const vars = new Set();
  for (const idx of ctor.result.indices) {
    for (const m of String(idx).match(/\p{Lu}[\p{L}\p{N}_']*/gu) || []) vars.add(m);
  }
  if (!vars.size) return null;
  // A result index containing a LAMBDA puts its metavariables under local
  // binders — a bare annotation variable cannot express that dependency and the
  // check degenerates to constraints outside the decidable pattern fragment
  // ("[forceGlobalCnstr] … could not be solved"). Skip; the bare variant covers.
  if (ctor.result.indices.some((idx) => String(idx).includes('\\'))) return null;
  // HO detection: `(V a …)` anywhere in the ctor's declared type marks V.
  const declTexts = [
    ...ctor.result.indices.map(String),
    ...(ctor.args || []).map((a) => String((a && (a.rawType || a.bodyType)) || '')),
  ];
  for (const t of declTexts) {
    for (const m of t.matchAll(/\(\s*(\p{Lu}[\p{L}\p{N}_']*)\s+(\p{Ll}[^\s)]*)/gu)) {
      if (!vars.has(m[1])) continue;
      // `(X op Y)` with an infix-declared op is an OPERAND position, not an
      // HO application of X — only a true application marks X higher-order.
      if (infixDeclaredOps(code).has(m[2])) continue;
      return null; // an HO index var — skip this annotation
    }
  }
  const ren = new Map();
  for (const v of vars) {
    let name = v;
    let k = 0;
    while (used.includes(name)) { k += 1; name = v + k; }
    ren.set(v, name);
    used.push(name);
  }
  const indices = ctor.result.indices.map((idx) => String(idx)
    .replace(/\p{Lu}[\p{L}\p{N}_']*/gu, (m) => ren.get(m) || m));
  return boxPattern(ctxStr, renderApp(code, ctor.result.head, indices));
}

// Beluga shares metavars across sibling case arms; inversion on an earlier arm can
// allocate X1, X2, … that would collide with pattern names on later arms unless we
// leave a gap after each arm's pattern.
const ARM_PATTERN_SLACK = 4;

function reserveArmSlack(used, count = ARM_PATTERN_SLACK) {
  const fresh = freshNamer(used);
  for (let i = 0; i < count; i += 1) {
    const n = fresh();
    if (!used.includes(n)) used.push(n);
  }
}

// Split a context string on TOP-LEVEL commas (block/paren internals intact).
function splitCtxParts(ctxStr) {
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

export function buildSplitSkeleton(scrutVar, ctxStr, ctors, opts = {}) {
  const list = Array.isArray(ctors) ? ctors : [];
  const indent = opts.indent || '';
  const used = [...(opts.usedNames || [])];
  const branches = [];

  const paramTerm = (opts.head && opts.schema) ? parameterTermFor(opts.head, opts.schema) : null;
  const paramBranch = paramTerm
    ? `${indent}| ${boxPattern(ctxStr, paramTerm)} =>\n${indent}  ?`
    : null;

  // NAMED context entries (a context `g, u:fam A[..], v:fam B[..]` extends the
  // schema part by explicit declarations): Beluga's coverage demands an arm per
  // named entry whose type-family matches the scrutinee's — `#p[..]` ranges only
  // over the schema part. (spec §2 split; the exchange-lemma shape.)
  const namedEntryBranches = [];
  if (opts.head) {
    const parts = splitCtxParts(ctxStr);
    const entryNames = parts
      .map((p) => (p.includes(':') ? p.slice(0, p.indexOf(':')).trim() : ''))
      .filter((n) => /^\p{Ll}[\p{L}\p{N}_']*$/u.test(n));
    for (const part of parts) {
      const ci = part.indexOf(':');
      if (ci < 0) continue;
      const nm = part.slice(0, ci).trim();
      const ty = part.slice(ci + 1).trim();
      if (!/^\p{Ll}[\p{L}\p{N}_']*$/u.test(nm)) continue; // entries, not schema vars/blocks
      if (/\bblock\b/.test(ty)) continue; // block entries destructure by projection, not by name
      if (headOfConclusion(ty) !== opts.head) continue;
      // A DEPENDENT entry — its type mentions another entry of this extension
      // (`hz : hyp z C[]`) — is excluded by the scrutinee's strengthened indices
      // (`hyp X[..] A[]`: X over the base can never be the extension binder z),
      // so coverage does not demand its arm. An INDEPENDENT entry
      // (`u : pure A[..]`, indices strengthened over the base) is demanded.
      const dependsOnEntry = entryNames.some((other) => other !== nm
        && new RegExp(`(^|[^A-Za-z0-9_'])${other}([^A-Za-z0-9_']|$)`).test(ty));
      if (dependsOnEntry) continue;
      namedEntryBranches.push(`${indent}| ${boxPattern(ctxStr, nm)} =>\n${indent}  ?`);
    }
  }

  for (const ctor of list) {
    const fresh = freshNamer(used);
    const pat = constructorTerm(ctor, fresh, {
      contextProjection: opts.contextProjection,
      ctxStr,
      usedNames: used,
    });
    const metas = patternMetavars(pat);
    for (const n of metas) if (!used.includes(n)) used.push(n);
    if (metas.length) reserveArmSlack(used);
    // ANNOTATE the arm with the constructor's refined result type: the annotation
    // BINDS the pattern's implicit index metavariables (Beluga's discipline — an
    // index not named by the pattern/annotation is "an illegal free meta-variable"
    // in the branch body). The reference proofs write exactly this
    // (`| [g |- eval_app1 D1 D2] : [g |- eval (app M N) R] =>`); sharing with the
    // argument types is by unification, so the names only need to be fresh.
    // Suppressed via opts.annotate === false: an annotation's bare index vars
    // depend on the WHOLE context, which strengthening/block shapes reject — the
    // caller offers BOTH variants and the checker arbitrates.
    const ann = opts.annotate === false ? null : armAnnotation(ctor, ctxStr, used, opts.code || '');
    branches.push(`${indent}| ${boxPattern(ctxStr, pat)}${ann ? ` : ${ann}` : ''} =>\n${indent}  ?`);
  }
  for (const nb of namedEntryBranches) branches.push(nb);
  if (paramBranch) branches.push(paramBranch);

  if (!branches.length) return null;
  return `case ${scrutVar} of\n${branches.join('\n')}`;
}

// ── intro ───────────────────────────────────────────────────────────────────
// Count the explicit arrow/Pi binders of a computation goal so we can introduce
// the right `fn`/`mlam` binders ourselves. A comp goal looks like
// `[ |- A] -> [ |- B] -> [ |- C]` (→ two `fn`) or `{n:[ |- nat]} …` /
// `(g:ctx) …` (→ `mlam`). We model the common `->` / `=>` arrow case here; the
// dependent `{}`/`()` cases fall to the cascade.
export function introBinders(goalStr) {
  const t = String(goalStr == null ? '' : goalStr).trim();
  if (!t) return null;
  // Count top-level `->` arrows, not those nested in `[ … ]` boxes or `( … )`.
  let depthBracket = 0;
  let depthParen = 0;
  let arrows = 0;
  let mlam = 0;
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i];
    if (ch === '[') depthBracket += 1;
    else if (ch === ']') depthBracket -= 1;
    else if (ch === '(') depthParen += 1;
    else if (ch === ')') depthParen -= 1;
    else if (depthBracket === 0 && depthParen === 0) {
      if (ch === '-' && t[i + 1] === '>') { arrows += 1; i += 1; }
      else if (ch === '→') { arrows += 1; }
    }
  }
  // Leading `(g:ctx)` / `{x:…}` — implicit in proofs; only boxed premises get `fn`.
  if (/^[({]/.test(t)) return { kind: 'dependent', arrows, mlam };
  if (arrows === 0) return { kind: 'none', arrows: 0, mlam: 0 };
  return { kind: 'arrows', arrows, mlam: 0 };
}

// Build the intro binders for a comp goal: leading EXPLICIT Pi binders
// (`{g:eqCtx} {U:[g ⊢ exp]} …`) introduce via `mlam`, implicit `(g:ctx)` groups
// introduce nothing, and boxed premises via `fn`. Returns the expression text
// (no trailing `;`), or null when we don't model the goal shape.
// Optional `binderNames` supplies explicit fn binder ids (e.g. from totality).
export function buildIntroSkeleton(goalStr, opts = {}) {
  const info = introBinders(goalStr);
  if (!info) return null;
  if (info.kind !== 'arrows' && info.kind !== 'dependent') return null;
  const t = String(goalStr == null ? '' : goalStr).trim();
  // Walk the goal's SPINE and emit one binder per segment, IN SOURCE ORDER. The
  // inhabitant's shape is dictated by the type: an explicit `{n:…}` Pi binds with
  // `mlam n`, an implicit `(g:ctx)` group binds nothing, and every ordinary
  // premise binds with `fn`. The old skeleton only collected LEADING `{…}`s and
  // then appended N `fn`s, so a Pi binder that appears MID-SPINE
  // (`… -> {T:[⊢tp]} TmVar [g,x] [⊢T] -> Sem …`, the `extend`/`weaken` shape)
  // produced `fn … fn … fn …` — an expression of the wrong shape that the
  // checker rejects, leaving the theorem with no first move at all.
  const segs = introSpineSegments(t);
  if (!segs) return null;
  if (segs.length < 2) return null; // conclusion only — nothing to introduce
  const used = opts.usedNames || [];
  const fresh = freshNamer(used);
  const preset = Array.isArray(opts.binderNames) ? opts.binderNames : null;
  const binders = [];
  let fnIdx = 0;
  let sawMlam = false;
  for (const seg of segs.slice(0, -1)) {
    if (seg.kind === 'implicit') continue; // GENERAL: spine-segment kind tag, not a Beluga name
    if (seg.kind === 'pi') { // GENERAL: spine-segment kind tag, not a Beluga name
      if (!reIdentDollarHashExact.test(seg.binder)) return null; // malformed — no partial skeleton, ever
      binders.push('mlam ' + seg.binder);
      sawMlam = true;
      continue;
    }
    const nm = preset && preset[fnIdx] ? preset[fnIdx] : fresh();
    fnIdx += 1;
    binders.push('fn ' + nm);
  }
  if (!binders.length) return null;
  if (fnIdx < 1 && !sawMlam) return null;
  return binders.join(' => ') + ' => ?';
}

// Segment a comp type into its spine: leading/mid-spine dependent binders and
// ordinary premises, ending with the conclusion. Bracket/brace/paren aware, so
// arrows inside a boxed or parenthesized premise never split. Returns
// [{kind:'pi'|'implicit'|'premise', text, binder}] or null when unreadable.
function introSpineSegments(typeText) {
  const s = String(typeText == null ? '' : typeText).trim();
  if (!s) return null;
  const raw = [];
  let dSq = 0;
  let dPar = 0;
  let dBr = 0;
  let start = 0;
  const flush = (end) => { const seg = s.slice(start, end).trim(); if (seg) raw.push(seg); };
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '[') dSq += 1;
    else if (c === ']') dSq -= 1;
    else if (c === '(') dPar += 1;
    else if (c === ')') dPar -= 1;
    else if (c === '{') dBr += 1;
    else if (c === '}') dBr -= 1;
    const top = dSq === 0 && dPar === 0 && dBr === 0;
    // A dependent binder group that just CLOSED at depth 0 and OPENED this
    // segment is its own segment (`{T:…} rest` and `(g:ctx) rest` carry no arrow).
    if (top && (c === '}' || c === ')')) {
      const head = s.slice(start).trimStart();
      if (head[0] === '{' || head[0] === '(') { flush(i + 1); start = i + 1; continue; }
    }
    if (!top) continue;
    if (c === '-' && s[i + 1] === '>') { flush(i); start = i + 2; i += 1; } else if (c === '→') { flush(i); start = i + 1; }
  }
  flush(s.length);
  if (!raw.length) return null;
  return raw.map((text) => {
    if (text[0] === '{') {
      const close = text.indexOf('}');
      const binder = (close > 0 ? text.slice(1, close) : text.slice(1)).split(':')[0].trim();
      return { kind: 'pi', text, binder };
    }
    // A `(…)` group is an IMPLICIT binder (`(g:ctx)`) only when it declares a
    // name of a bare schema/type — no arrow, no box, no turnstile inside. A
    // parenthesized FUNCTION premise (`({T:…} TmVar … -> Sem …)`) is a premise
    // and must get its own `fn`.
    if (text[0] === '(' && text[text.length - 1] === ')') {
      const inner = text.slice(1, -1);
      if (inner.includes(':') && !/->|→|\||⊢|\[/.test(inner)) {
        return { kind: 'implicit', text, binder: (inner.split(':')[0] || '').trim() };
      }
    }
    return { kind: 'premise', text };
  });
}

// ── fill: candidate inhabiting terms for a hole's GOAL ──────────────────────
// The honest answer when a (sub)goal is directly provable: produce the term that
// inhabits it. We GENERATE candidates from BelJar's model — a context parameter
// projection whose type matches the goal head, an in-scope hypothesis/meta-var of
// the boxed goal type, a nullary constructor — ORDERED most-likely-first. The CALLER
// verifies each by checking it at the real hole and fills with the first that holds
// (so a wrong candidate is never inserted). This is BelJar finding the proof, not
// wrapping a Beluga command; verification keeps it honest.
//
// `hole` is the parsed hole ({ goal, ctx, meta }). `code` is the assembled program
// (for constructor lookup). Returns an array of boxed term strings (e.g.
// `[g |- #p.h[..]]`), possibly empty.
// Byte offset of a hole's (1-based line, 1-based col).
function offsetOfLineCol(code, line, col) {
  if (!(line > 0)) return -1;
  const lines = String(code || '').split('\n');
  if (line > lines.length) return -1;
  let off = 0;
  for (let i = 0; i < line - 1; i += 1) off += lines[i].length + 1;
  return off + Math.max(0, (col || 1) - 1);
}

// Is the LEAD context variable of `ctxStr` bound in the proof BODY before the
// hole? Only a body binder makes it writable: an `mlam g`, or a case-arm pattern
// (a pattern's context is a binding occurrence). An occurrence in the theorem's
// TYPE does not count — that is exactly the implicit-binder case. Fail-open:
// when the body region cannot be located, treat the name as writable (the old
// behaviour), so this can only ever remove a spelling we know to be dead.
function contextWritableAt(code, hole, ctxStr) {
  const lead = String(ctxStr || '').split(',')[0].trim();
  if (!lead || !/^[\p{L}_][\p{L}\p{N}_']*$/u.test(lead)) return true;
  const src = String(code || '');
  const off = offsetOfLineCol(src, hole && hole.line, hole && hole.col);
  if (off < 0) return true;
  // The enclosing declaration's BODY starts after its `=`; scan back to the decl
  // head, then forward to the first standalone `=`.
  const head = src.lastIndexOf('\nrec ', off);
  const head2 = src.lastIndexOf('\nproof ', off);
  const start = Math.max(head, head2);
  if (start < 0) return true;
  const eq = src.indexOf('=', start);
  if (eq < 0 || eq > off) return true;
  // The TOTALITY PRAGMA is not part of the proof term and routinely names the
  // context (`/ total d (ndhil g a d) /`) — counting it would call every such
  // context writable, which is exactly the case this guard exists for. Comments
  // likewise (invariant 18).
  const body = src.slice(eq + 1, off)
    .replace(/%\{[\s\S]*?\}%/g, ' ')
    .replace(/%[^\n]*/g, ' ')
    .replace(/^\s*\/[^/]*\//, ' ');
  const re = new RegExp(`(^|[^\\p{L}\\p{N}_'])${lead.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}_']|$)`, 'u');
  return re.test(body);
}

// Replace the LEAD context variable with `_`, keeping any declared tail binders
// (`g, x:tm A` → `_, x:tm A`). An empty context stays empty.
function underscoreLeadCtx(ctxStr) {
  const s = String(ctxStr || '').trim();
  if (!s) return s;
  const parts = s.split(',');
  const lead = parts[0].trim();
  if (!/^[\p{L}_][\p{L}\p{N}_']*$/u.test(lead)) return s;
  parts[0] = '_';
  return parts.join(',');
}

export function fillCandidates(hole, code) {
  const out = [];
  const seen = new Set();
  const push = (t) => { if (t && !seen.has(t)) { seen.add(t); out.push(t); } };

  const goalStr = unwrapExtraGoalBox(hole && hole.goal);

  // THE AXIOM RULE comes FIRST and is independent of the goal's box structure —
  // a bare ctype goal (`Extends [g] [h]`) has no contextual decomposition at
  // all, so it used to fall out of this function before any candidate was
  // proposed. See assumptionCompatible: exact spellings first, then the ones
  // compatible only up to the goal's inferred (`_`) slots.
  // An EXACT assumption is certain and leads; one that matches only up to the
  // goal's inferred (`_`) slots is a guess and is appended LAST (`looseAxioms`),
  // after every structurally-derived fill.
  const looseAxioms = [];
  for (const c of (hole.ctx || [])) {
    if (c && c.name && typesMatchModuloSpacing(c.type, goalStr)) push(c.name);
  }
  for (const c of (hole.ctx || [])) {
    if (c && c.name && !seen.has(c.name) && assumptionCompatible(c.type, goalStr)) looseAxioms.push(c.name);
  }

  let decomp = decomposeContextual(goalStr);
  if (!decomp) {
    const rg = resultGoalParts(hole);
    if (rg) decomp = { ctx: rg.ctx, concl: goalStr, boxed: false };
  }
  if (!decomp) { looseAxioms.forEach(push); return out; }
  // WRITABILITY of the goal's CONTEXT (invariant 11, the context half). A theorem
  // may bind its context IMPLICITLY — `rec ndhil : (g:ndhilCtx) [g |- nd A] → …`
  // binds `g` in the TYPE but not in the BODY. The hole report still prints the
  // context as `g`, so every fill we spell `[g |- …]` is rejected outright ("This
  // free context variable is illegal") — measured as 121 rejections over 35
  // targets, and it kills every fill at a PRE-SPLIT hole. A case ARM binds the
  // name (its pattern is a binding occurrence), which is why the same spelling
  // works after a split. `_` is the writable spelling for a context the checker
  // will infer: verified natively — at a pre-split hole `[g |- k]` dies on the
  // free-context error while `[_ |- k]` gets through to ordinary type checking.
  const ctxStr = contextWritableAt(code, hole, decomp.ctx) ? decomp.ctx : underscoreLeadCtx(decomp.ctx);
  const goalHead = headOfConclusion(decomp.concl);
  if (!goalHead) return out;
  const box = (term) => boxPattern(ctxStr, term);

  // (0) THE AXIOM RULE, META-CONTEXT HALF. Every case-split puts its
  //     sub-derivations in cD, so a goal is very often inhabited by one of them
  //     (`[g ⊢ aeq M N]` closed by `X1 : (g ⊢ aeq M N)` — spelled `[g ⊢ X1]`).
  //     Same discipline as the comp half above: exact spellings lead, spellings
  //     compatible only up to the goal's inferred `_` slots go last. Parameter
  //     and substitution variables are handled by (1) below, not here.
  //     (A meta's type is printed with `( … )`, the goal's with `[ … ]`, so
  //     "exact" is compared on the DECOMPOSED parts, not the raw text.)
  for (const m of (hole.meta || [])) {
    if (!m || !m.name || !/^[\p{L}_]/u.test(m.name)) continue;
    const md = decomposeContextual(m.type);
    if (md && typesMatchModuloSpacing(md.concl, decomp.concl)
      && typesMatchModuloSpacing(md.ctx || '_', ctxStr || '_')) push(box(m.name));
    else if (assumptionCompatible(m.type, goalStr)) looseAxioms.push(box(m.name));
  }

  // (1) A context parameter projection `#p.field[..]` whose field type-head matches
  //     the goal head — the str_hyp case. We read the parameter variable + its block
  //     type from the meta-context (`#p : #(g |- block (x : name, h : hyp x A1[]))`).
  // In-scope substitution variables ($W : $[h ⊢ g]): a parameter living in g is
  // transported into the goal context h by projecting UNDER the substitution —
  // `#p.2[$W]` (spec §2 fill: identity `[..]` OR the substitution variable when
  // the goal context differs). Both named and positional spellings are proposed;
  // the checker arbitrates.
  const substVars = (hole.meta || [])
    .map((sv) => sv && sv.name)
    .filter((n) => n && n[0] === '$');
  for (const m of (hole.meta || [])) {
    if (!m || !m.name || m.name[0] !== '#') continue;
    const fields = parseBlockFields(m.type);
    if (fields) {
      fields.forEach((f, fi) => {
        if (f.head !== goalHead) return;
        if (f.name) push(box(`${m.name}.${f.name}[..]`));
        for (const sv of substVars) {
          if (f.name) push(box(`${m.name}.${f.name}[${sv}]`));
          push(box(`${m.name}.${fi + 1}[${sv}]`));
        }
      });
    } else {
      // A bare parameter variable of the goal type. The reported spelling may be
      // `#(g |- pure X)` / `#(g ⊢ …)` — decompose, don't string-match.
      const pd = decomposeContextual(String(m.type || '').replace(/^#\s*/, ''));
      const pHead = pd && pd.concl ? headOfConclusion(pd.concl)
        : headOfBindingType(':' + String(m.type || ''));
      if (pHead === goalHead) {
        push(box(`${m.name}[..]`));
        for (const sv of substVars) push(box(`${m.name}[${sv}]`));
      }
    }
  }

  // (1b) A NAMED entry of the goal's own context whose declared type-family
  //      matches the goal head — the variable itself is the derivation
  //      (`[g, v:pure B[..], u:pure A[..] ⊢ u]`, the exchange u/v arms). The
  //      checker arbitrates the exact indices.
  for (const part of splitCtxParts(ctxStr)) {
    const ci = part.indexOf(':');
    if (ci < 0) continue;
    const nm = part.slice(0, ci).trim();
    const ty = part.slice(ci + 1).trim();
    if (!/^\p{Ll}[\p{L}\p{N}_']*$/u.test(nm)) continue;
    if (/\bblock\b/.test(ty)) continue; // block entries fill by projection
    if (headOfConclusion(ty) === goalHead) push(box(nm));
  }

  // (2) A computation-context variable whose boxed type IS the goal — return it
  //     directly (e.g. `fn n => n`). The comp var holds a contextual object.
  //     (Subsumed by the axiom rule above; `push` dedupes.)
  for (const c of (hole.ctx || [])) {
    if (c && c.name && typesMatchModuloSpacing(c.type, hole.goal)) push(c.name);
  }

  // A COMPUTATION-family goal (`Result [g ⊢ P] …`) is filled by a BARE comp
  // constructor application over boxed arguments — never re-boxed.
  const compFamily = isCTypeFamily(code, goalHead);

  // (3) Nullary constructors of the goal head — closes str_lin base cases where the
  //     checker has unfolded the goal to a concrete index (Y[..] vs bare Y).
  //     A CTYPE constructor is a COMP-level value and must NEVER be boxed (the
  //     M3/M4 rule): the engine was emitting `[_ ⊢ Ae_v]` for the nullary ctype
  //     constructor `Ae_v`, which is ill-formed by construction and cost a
  //     checker round-trip at every ctype goal that has one.
  for (const ctor of enumerateConstructorsTyped(code, goalHead)) {
    if (!ctor.argTypes.length) push(compFamily ? ctor.name : box(ctor.name));
  }

  // (4) Type-directed CONSTRUCTOR SYNTHESIS — inhabit the goal from constructors of
  //     its head, filling arguments with in-scope hypotheses (index-matched).
  if (!compFamily) {
    for (const term of synthesizeFills(decomp.concl, hole, code)) push(box(term));
  }

  // (5) Apply constructors of the goal head to in-scope names, index-matched.
  {
  const scope = fillScope(hole, code);
  const goalApp = parseAppType(decomp.concl);
  // Memoized "is this token a DECLARED constructor?" — the rigid-head conflict
  // pruner must never mistake a bound variable for a constructor.
  const ctorMemo = new Map();
  const isDeclaredCtor = (tok) => {
    if (!ctorMemo.has(tok)) {
      ctorMemo.set(tok, !!(enumerateConstructorsTyped(code, tok).length || familyOfConstructorName(code, tok)));
    }
    return ctorMemo.get(tok);
  };
  const rigidHeadOf = (text) => {
    let t = norm(text);
    for (let guard = 0; guard < 8; guard += 1) {
      t = stripParens(t);
      const toks = tokenizeTerm(t);
      if (!toks.length) return null;
      if (/^\\/.test(toks[0])) { t = toks.slice(1).join(' '); continue; }
      const h = toks[0];
      if (/^[A-Z#_]/.test(h) || h.includes('[')) return null; // flexible / projection
      return isDeclaredCtor(h) ? h : null;
    }
    return null;
  };
  // A constructor whose result index has a DIFFERENT rigid constructor head than
  // the goal's can never inhabit it (`out …` vs `inp …`) — skip without paying a
  // checker call. Flexible heads (metavars, variables) are never pruned.
  const rigidConflict = (ctorIdx, goalIdx) => {
    if (ctorIdx.length !== goalIdx.length) return true;
    for (let i = 0; i < ctorIdx.length; i += 1) {
      const a = rigidHeadOf(ctorIdx[i]);
      const b = rigidHeadOf(goalIdx[i]);
      if (a && b && a !== b) return true;
    }
    return false;
  };
  const emit = (t) => push(compFamily ? t : box(t));
  for (const ctor of enumerateConstructorsTyped(code, goalHead)) {
    const descs = ctor.argTypes.map((at) => constructorArgDescriptor(at, []));
    const subst = goalApp ? matchIndices(ctor.result.indices, goalApp.indices) : null;
    if (goalApp && goalApp.indices.length && rigidConflict(ctor.result.indices, goalApp.indices)) continue;
    const perArg = ctor.argTypes.map((at, i) => {
      const want = subst ? applySubst(at, subst) : at;
      const choices = argFillChoices(descs[i], want, hole, scope, hole.goal, code);
      // A COMPUTATION-family constructor takes comp expressions as arguments —
      // a comp-context variable of a matching boxed family passes BARE
      // (`Re q [ ⊢ plus/z]`), never spelled inside a box (spec §2 fill / D3).
      if (compFamily && /^\s*\[/.test(String(want).trim())) {
        const wantHead = headOfConclusion((decomposeContextual(want) || {}).concl || '');
        // Highest-signal first: (a) recently let-bound components of the same
        // family (a just-destructured recursion's pieces — `Re [⊢S1] [⊢plus/s S2]`),
        // then (b) comp variables of the matching family (the theorem's own
        // premises, passed bare). The DIAGONAL enumeration below keeps deeper
        // combinations reachable despite the prepends.
        for (const c2 of (hole.ctx || [])) {
          if (!c2 || !c2.name || !c2.type) continue;
          const cd2 = decomposeContextual(c2.type);
          if (cd2 && wantHead && headOfConclusion(cd2.concl) === wantHead) choices.unshift(c2.name);
        }
        for (const b2 of branchLetBindings(code, hole)) {
          if (!b2 || !b2.name || b2.head !== wantHead) continue;
          choices.unshift(b2.ctx ? `[${b2.ctx} |- ${b2.name}]` : `[ |- ${b2.name}]`);
        }
      }
      return choices;
    });
    if (perArg.some((opts) => !opts.length)) continue;
    if (perArg.every((opts) => opts.length === 1)) {
      const args = perArg.map((opts) => opts[0]);
      if (distinctHoBodies(args)) emit(renderApp(code, ctor.name, args));
      continue;
    }
    // Comp-family constructors mix meta/comp/nested-ctor argument sources; a
    // lexicographic walk starves later slot-1 choices under the cap, so combos
    // are enumerated FAIRLY (by increasing index sum — diagonal), cap 24.
    if (compFamily && perArg.length > 1) {
      const cap = 48;
      const emitted = new Set();
      const maxSum = perArg.reduce((a, o) => a + o.length - 1, 0);
      outer: for (let s = 0; s <= maxSum; s += 1) {
        const walk = (slot, left, acc) => {
          if (emitted.size >= cap) return true;
          if (slot === perArg.length) {
            if (left !== 0) return false;
            if (!distinctHoBodies(acc)) return false;
            const t = renderApp(code, ctor.name, acc);
            if (!emitted.has(t)) { emitted.add(t); emit(t); }
            return false;
          }
          for (let k = 0; k <= Math.min(left, perArg[slot].length - 1); k += 1) {
            if (walk(slot + 1, left - k, [...acc, perArg[slot][k]])) return true;
          }
          return false;
        };
        if (walk(0, s, [])) break outer;
      }
    } else {
      for (const args of cartesianArgCombos(perArg, 12, distinctHoBodies)) {
        emit(renderApp(code, ctor.name, args));
      }
    }
  }
  }

  looseAxioms.forEach(push);
  return out;
}

// Synthesise inhabiting TERMS for an LF conclusion `head idx…` from constructors
// of `head`, using ONLY in-scope hypotheses to fill arguments (one level — the
// recursion provides deeper terms as bound results). For each constructor of the
// goal head: first-order MATCH its result-index pattern against the goal's indices
// (binding the constructor's pattern variables), instantiate each argument type,
// and require each arg to be inhabited by an in-scope hypothesis of that type.
// Returns the constructor-application term texts (unboxed), most-applicable first.
export function synthesizeFills(goalConcl, hole, code) {
  const goal = parseAppType(goalConcl);
  if (!goal || !goal.head) return [];
  const ctors = enumerateConstructorsTyped(code, goal.head);
  const out = [];
  // In-scope hypotheses for argument inhabitation — BOTH the computation context
  // (cG, e.g. recursion results bound by `let`) AND the meta-context (cD, the LF
  // sub-derivations a split introduces). Decompose each to its conclusion text.
  const scope = fillScope(hole, code);

  for (const ctor of ctors) {
    const subst = matchIndices(ctor.result.indices, goal.indices);
    if (!subst) continue;
    const descs = ctor.argTypes.map((at) => constructorArgDescriptor(at, []));
    const ctorHasHo = descs.some((d) => d.higherOrder);
    const hypUsed = [...(hole.meta || []).map((m) => m.name), ...(hole.ctx || []).map((c) => c.name)];
    const piCovered = piArgsCoveredByHyp(ctor.argTypes);
    const argTerms = [];
    let ok = true;
    for (let ai = 0; ai < ctor.argTypes.length; ai += 1) {
      const at = ctor.argTypes[ai];
      if (piCovered.has(ai)) continue;
      if (/^\s*\{/.test(at)) {
        argTerms.push('_');
        continue;
      }
      const want = applySubst(at, subst);
      // A closed argument (e.g. dual_sym's `dual A A'`): its witness is the closed
      // metavar named in the branch scrutinee, boxed `[]`.
      if (isClosedArgType(want)) {
        const body = code && hole?.line ? branchBodyBefore(code, hole) : '';
        const arm = body.split('\n').find((l) => /^\s*\|/.test(l)) || body;
        const turn = arm.lastIndexOf('|-');
        const afterTurn = turn >= 0 ? arm.slice(turn + 2) : arm;
        const dm = afterTurn.match(/^\s*\w+\s+(\p{Lu}[\p{L}\p{N}_']*)\[\]/u);
        if (dm) {
          argTerms.push(`${dm[1]}[]`);
          continue;
        }
      }
      const hypTerms = isHypArgType(want) ? hypFillTerms(want, hole.meta, { blockHyp: !ctorHasHo, usedNames: hypUsed }) : null;
      if (hypTerms) {
        argTerms.push(...hypTerms);
        for (const t of hypTerms) {
          const m = /#(\w+)\./.exec(t);
          if (m) hypUsed.push(m[1]);
        }
        continue;
      }
      // Fused `{X:name}`+hyp argument matched by the pattern's name channel: reuse
      // the name metavar and a strengthened hyp result (arity TWO, like the pattern).
      if (isHypArgType(want)) {
        const pair = branchPairChannel(code, hole);
        if (pair) {
          const wantHead = headOfConclusion(want);
          const hl = scope.find((s) => /^R\d*$/.test(s.name) && headOfConclusion(s.concl) === wantHead);
          argTerms.push(pair.nameVar, hl ? hl.name : pair.hypVar);
          continue;
        }
      }
      const hyp = findScopeForArg(want, scope, hole.goal);
      if (hyp) {
        argTerms.push(fillTermForHyp(hyp, hole.goal, want));
        continue;
      }
      const choices = argFillChoices(descs[ai], want, hole, scope, hole.goal, code);
      if (choices.length === 1 && !descs[ai].higherOrder) {
        argTerms.push(choices[0]);
        continue;
      }
      ok = false;
      break;
    }
    if (!ok) continue;
    out.push(argTerms.length ? renderApp(code, ctor.name, argTerms) : ctor.name);
  }
  return out;
}

// ── Inversion: destructure a DETERMINED hypothesis (a one-branch case = a let) ─
// When a hypothesis `h : [Γ |- F idx…]` could only have come from certain
// constructors (its indices pin the shape), inverting it refines the index
// variables and exposes its sub-derivations — the move `let [Γ |- c Y1…Yn] = h in ?`
// binding FRESH metavars Y… (the human idiom, per reference-totality-and-proof-idioms:
// a one-branch case IS a let, binding fresh vars, NOT committing to a projection).
//
// We propose the inversion for each constructor of F whose RESULT unifies with the
// hypothesis's current indices (so a fully-determined hypothesis yields exactly the
// valid constructor; the checker certifies coverage). `hyp` = { name, type }. `used`
// = names to avoid for the fresh pattern vars. `scope` (optional) = the in-scope
// hypotheses [{name,type}] — when given, we SKIP an inversion whose constructor's
// sub-derivations are ALL already inhabited (the hypothesis is already destructured,
// e.g. the just-split scrutinee — re-inverting it adds nothing and would loop).
// Returns the `let … in` lines (no trailing `?`), most-determined first.
export function invertCandidates(hyp, code, used, scope, opts = {}) {
  if (!hyp || !hyp.name) return [];
  const concl = conclusionOf(hyp.type);
  const parsed = parseAppType(concl);
  if (!parsed || !parsed.head) return [];
  const ctx = contextOf(hyp.type);
  const box = (inner) => (ctx ? `[${ctx} |- ${inner}]` : `[ |- ${inner}]`);
  const ctors = enumerateConstructorsTyped(code, parsed.head);
  const usedArr = [...(used || [])];
  const scopeConcls = (scope || []).map((s) => conclusionOf(s.type));
  const out = [];
  for (const ctor of ctors) {
    // Only invert to a constructor whose result CAN UNIFY with the hypothesis's
    // indices (symmetric: vars on either side refine) — a determined hypothesis
    // unifies with exactly one constructor; an undetermined one unifies with
    // several (then inversion is really a split — we leave that to split).
    const u = unifyIndices(ctor.result.indices, parsed.indices);
    if (!u) continue;
    // Redundancy guard: if EVERY sub-derivation this inversion would expose is
    // already in scope, the hypothesis is already destructured — skip (no progress).
    if (ctor.argTypes.length) {
      const wantConcls = ctor.argTypes.map((at) => conclusionOf(applySubstU(at, u.a)));
      const allPresent = wantConcls.every((w) => scopeConcls.some((s) => typesMatchModuloSpacing(s, w)));
      if (allPresent && scope) continue;
    }
    const fresh = freshNamer(usedArr);
    const pat = constructorTerm({
      name: ctor.name,
      args: ctor.argTypes.map((at) => constructorArgDescriptor(at, usedArr)),
    }, fresh);
    for (const n of patternMetavars(pat)) {
      if (!usedArr.includes(n)) usedArr.push(n);
    }
    // Phase F.1 — annotate like split arms: the annotation binds index metas so
    // they are source-writable (D11). Suppressed via opts.annotate === false;
    // the bridge dual-spells annotated + bare and the checker arbitrates.
    let ann = null;
    if (opts.annotate !== false) {
      ann = armAnnotation({
        result: ctor.result,
        args: (ctor.argTypes || []).map((at) => ({ rawType: String(at) })),
      }, ctx, usedArr, code);
    }
    out.push(`let ${box(pat)}${ann ? ` : ${ann}` : ''} = ${hyp.name} in`);
  }
  return out;
}

// ── Parameter inversion: destructure a hypothesis to a schema-block PROJECTION ─
// When a hypothesis' conclusion mentions a parameter (a `#`-headed projection or
// context variable), no constructor result can produce it — its only possible
// origin is the matching field of a context block, so the inversion is
// `let [Γ |- #q.field[..]] = h in ?` (the unique3 `let [g |- #r.2] = f in` idiom;
// unification then equates the fresh parameter with the one in the indices,
// refining the goal). Schema-driven and name-agnostic: the field is the block
// element whose type-family head equals the hypothesis' conclusion head; the
// checker certifies the refinement. Returns the `let … in` lines (no trailing `?`).
export function paramInvertCandidates(hyp, schema, used) {
  if (!hyp || !hyp.name || !schema || !Array.isArray(schema.elements)) return [];
  const concl = conclusionOf(hyp.type);
  // Only a parameter-mentioning conclusion is NECESSARILY block-born; anything else
  // is constructor territory (handled by invertCandidates/split).
  if (!concl.includes('#')) return [];
  const head = headOfConclusion(concl);
  const ctx = contextOf(hyp.type);
  if (!head || !ctx) return [];
  const out = [];
  for (const el of schema.elements) {
    if (!el.block) continue;
    const field = (el.fields || []).find((f) => f.head === head && f.name);
    if (!field) continue;
    const p = freshParamName(used);
    out.push(`let [${ctx} |- #${p}.${field.name}[..]] = ${hyp.name} in`);
  }
  return out;
}

// A fresh parameter-variable name (for `#q`, `#r`, …) avoiding names in scope
// (scope names may carry their `#` prefix).
function freshParamName(used) {
  const taken = new Set((used || []).map((n) => String(n).replace(/^#/, '')));
  for (const n of ['q', 'r', 's']) if (!taken.has(n)) return n;
  let i = 1;
  while (taken.has('q' + i)) i += 1;
  return 'q' + i;
}

// Apply a unify-substitution (the `a`-side of unifyIndices) to an arg-type text.
function applySubstU(typeText, subst) {
  return String(typeText).replace(/\p{Lu}[\p{L}\p{N}_']*/gu, (m) => (subst[m] != null ? subst[m] : m));
}

// The context part of a boxed hypothesis type (`[Γ |- C]` → "Γ"; `( |- C)` → "").
function contextOf(typeStr) {
  let t = String(typeStr == null ? '' : typeStr).trim();
  if ((t[0] === '[' && t[t.length - 1] === ']') || (t[0] === '(' && t[t.length - 1] === ')')) {
    t = t.slice(1, -1).trim();
  }
  const turn = t.search(/\|-|⊢|\|/);
  return turn > 0 ? t.slice(0, turn).trim() : '';
}

// The LF conclusion of a hypothesis type, stripping ONE outer box of either form:
// `[ Γ |- C]` (computation/boxed) OR `( |- C)` (a meta-context derivation). When
// there's no turnstile, the whole (bracket-stripped) text is the conclusion.
export function conclusionOf(typeStr) {
  let t = String(typeStr == null ? '' : typeStr).trim();
  if ((t[0] === '[' && t[t.length - 1] === ']') || (t[0] === '(' && t[t.length - 1] === ')')) {
    t = t.slice(1, -1).trim();
  }
  const m = t.match(/(?:\|-|⊢|\|)\s*([\s\S]*)$/);
  return (m ? m[1] : t).trim();
}

// Parse an applicative LF type text `head a1 a2 …` into { head, indices:[a1,…] },
// splitting the spine at TOP-LEVEL spaces (args grouped by parens stay whole).
export function parseAppType(text) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return null;
  const toks = splitTopLevel(t, ' ').map((s) => s.trim()).filter(Boolean);
  if (!toks.length) return null;
  return { head: toks[0], indices: toks.slice(1) };
}

// First-order match of a constructor's result index PATTERN against the goal's
// indices, UNIFYING under constructors/operators. Pattern variables are uppercase
// identifiers (`A`, `A'`, `B'`); they bind to the corresponding goal subterm. A
// structured pattern (`A ⊗ B`, `s X`, `(A' ⅋ B')`) matches a goal term of the
// SAME shape, recursing into the parts (so `A⊗B` vs `A'⊗B'` ⇒ A:=A', B:=B'). The
// checker certifies the final term, so we match structurally, not semantically.
// Returns the substitution { VAR: text } or null.
function matchIndices(patternIdx, goalIdx) {
  if (patternIdx.length !== goalIdx.length) return null;
  const subst = {};
  for (let i = 0; i < patternIdx.length; i += 1) {
    if (!matchTerm(patternIdx[i], goalIdx[i], subst)) return null;
  }
  return subst;
}

// Match one index TERM (pattern vs goal) into `subst`. Tokenises each into a flat
// sequence of atoms/operators (parens stripped, infix ops kept as tokens) and
// matches position-wise: a bare uppercase pattern token binds; anything else must
// align with the goal token (recursing if the token is itself parenthesised).
function matchTerm(patternText, goalText, subst, alpha = new Map()) {
  const p = tokenizeTerm(patternText);
  const g = tokenizeTerm(goalText);
  if (p.length !== g.length) return false;
  for (let i = 0; i < p.length; i += 1) {
    const pt = p[i];
    const gt = g[i];
    // Lambda binders match up to ALPHA (`\x.` vs `\y.`): record the renaming so a
    // later occurrence of the bound name compares through it.
    const pb = /^\\([\w']+)\.$/.exec(pt);
    const gb = /^\\([\w']+)\.$/.exec(gt);
    if (pb || gb) {
      if (!pb || !gb) return false;
      alpha.set(pb[1], gb[1]);
      continue;
    }
    if (/^\p{Lu}[\p{L}\p{N}_']*$/u.test(pt)) {
      if (subst[pt] != null && norm(subst[pt]) !== norm(gt)) return false;
      subst[pt] = gt;
    } else if (pt[0] === '(' || gt[0] === '(') {
      if (!matchTerm(stripParens(pt), stripParens(gt), subst, alpha)) return false;
    } else if (alpha.has(pt)) {
      if (alpha.get(pt) !== gt) return false;
    } else if (norm(pt) !== norm(gt)) {
      return false;
    }
  }
  return true;
}

// SYMMETRIC unification (vs the one-directional matchTerm above): an uppercase var
// on EITHER side may bind to the other side's subterm. Used for INVERSION, where
// the hypothesis indices carry the free vars to refine AND the constructor result
// may carry its own — a constructor inverts the hypothesis iff they unify. Two
// substitutions (one per side) keep the bindings apart; a token that is a var on
// neither side must match structurally (recursing into parens).
function unifyIndices(aIdx, bIdx) {
  if (aIdx.length !== bIdx.length) return null;
  const sa = {};
  const sb = {};
  for (let i = 0; i < aIdx.length; i += 1) {
    if (!unifyTerm(aIdx[i], bIdx[i], sa, sb)) return null;
  }
  return { a: sa, b: sb };
}
function unifyTerm(aText, bText, sa, sb, alpha = new Map()) {
  let a = tokenizeTerm(aText);
  let b = tokenizeTerm(bText);
  // A substitution-closed metavariable (`T'[]`, `X[..]`, `P[.., y]`) is still a
  // VARIABLE for unification — the bracket suffix is a closure, not term structure.
  const isVar = (t) => /^\p{Lu}[\p{L}\p{N}_']*(\[[^[\]]*\])?$/u.test(t);
  const lamTok = (t) => /^\\([\w']+)\.$/.exec(t);
  // Matched leading lambda binders unify up to ALPHA — record the renaming so
  // later occurrences of the bound names compare through it.
  while (a.length && b.length) {
    const la = lamTok(a[0]);
    const lb = lamTok(b[0]);
    if (!la || !lb) break;
    alpha.set(la[1], lb[1]);
    alpha.set(lb[1], la[1]);
    a = a.slice(1);
    b = b.slice(1);
  }
  // A FLEXIBLE side — a metavariable head applied to bound variables (`E x`) —
  // binds wholesale: it is the eta-variant of the bare metavar (`\x. E x` vs the
  // report's `\x. F`).
  const isFlex = (toks) => toks.length >= 1 && isVar(toks[0])
    && toks.slice(1).every((t) => /^\p{Ll}[\p{L}\p{N}_']*$/u.test(t));
  const flexA = isFlex(a);
  const flexB = isFlex(b);
  if (flexA && (!flexB || a.length !== b.length)) {
    if (flexB && b.length > a.length) {
      const at = a.join(' ');
      if (sb[b[0]] != null && norm(sb[b[0]]) !== norm(at)) return false;
      sb[b[0]] = at; return true;
    }
    const bt = b.join(' ');
    if (sa[a[0]] != null && norm(sa[a[0]]) !== norm(bt)) return false;
    sa[a[0]] = bt; return true;
  }
  if (flexB && !flexA) {
    const at = a.join(' ');
    if (sb[b[0]] != null && norm(sb[b[0]]) !== norm(at)) return false;
    sb[b[0]] = at; return true;
  }
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const at = a[i];
    const bt = b[i];
    if (isVar(at) && isVar(bt)) {
      // Two vars align — record on both sides (consistently).
      if (sa[at] != null && norm(sa[at]) !== norm(bt)) return false;
      if (sb[bt] != null && norm(sb[bt]) !== norm(at)) return false;
      sa[at] = bt; sb[bt] = at;
    } else if (isVar(at)) {
      if (sa[at] != null && norm(sa[at]) !== norm(bt)) return false;
      sa[at] = bt;
    } else if (isVar(bt)) {
      if (sb[bt] != null && norm(sb[bt]) !== norm(at)) return false;
      sb[bt] = at;
    } else if (at[0] === '(' || bt[0] === '(') {
      if (!unifyTerm(stripParens(at), stripParens(bt), sa, sb, alpha)) return false;
    } else if (norm(at) !== norm(bt) && alpha.get(at) !== bt) {
      return false;
    }
  }
  return true;
}

// Split a term into top-level tokens: identifiers, operators, and parenthesised
// groups (kept whole, recursed into by matchTerm). E.g. "A ⊗ B" → ["A","⊗","B"],
// "(A' ⅋ B')" → ["(A' ⅋ B')"], "s X" → ["s","X"].
function tokenizeTerm(text) {
  return splitTopLevel(norm(text), ' ').map((s) => s.trim()).filter(Boolean);
}

function applySubst(typeText, subst) {
  return String(typeText).replace(/\p{Lu}[\p{L}\p{N}_']*/gu, (m) => (subst[m] != null ? subst[m] : m));
}
function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function stripParens(s) {
  const t = norm(s);
  return (t[0] === '(' && t[t.length - 1] === ')') ? t.slice(1, -1).trim() : t;
}

// Parse a block type `#(g |- block (x : name, h : hyp x A1[]))` (or `block x:name,
// h:hyp x A`) into [{name, head}], or null when it isn't a block.
function parseBlockFields(typeStr) {
  const t = String(typeStr == null ? '' : typeStr);
  const bi = t.indexOf('block');
  if (bi < 0) return null;
  let rest = t.slice(bi + 5).trim();
  if (rest[0] === '(') {
    const close = rest.lastIndexOf(')');
    rest = rest.slice(1, close < 0 ? rest.length : close);
  } else {
    // strip a trailing `)` from the `#( … )` wrapper
    rest = rest.replace(/\)\s*$/, '');
  }
  const fields = [];
  for (const part of splitTopLevel(rest, ',')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim();
    const head = headOfBindingType(':' + part.slice(colon + 1));
    if (name) fields.push({ name, head });
  }
  return fields.length ? fields : null;
}

// Split on `sep` at bracket/paren depth 0.
function splitTopLevel(s, sep) {
  const parts = [];
  let depth = 0; let cur = '';
  for (const ch of String(s || '')) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === sep && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

// Loose type equality (collapse whitespace) — Beluga reports types with varying
// spacing (`[ |- nat]` vs `[ |-  nat]`).
function typesMatchModuloSpacing(a, b) {
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return !!norm(a) && norm(a) === norm(b);
}

// ── The INIT / ASSUMPTION rule, up to unifiability ──────────────────────────
// Sequent calculus's axiom — `Γ, x:A ⊢ A` closes by `x` — is the cheapest and
// most decisive move any proof search has. The engine carried it only as STRING
// equality, which is strictly weaker than the rule: the checker prints a hole's
// goal with `_` wherever it will still INFER an index or a context, so a
// hypothesis reported `Extends [g] [g1]` never matched a goal printed
// `Extends [_] [g1]`, and every branch that closes by an assumption produced NO
// candidate at all.
//
// We cannot decide the checker's unification inside our model, so the rule is
// stated as an OVER-APPROXIMATION of unifiability and the checker arbitrates the
// candidate — the same dual-spelling doctrine the split annotations use. Two
// types are compatible when they have the same shape (both boxed or both bare,
// neither a function type), the same rigid family head, the same arity, and no
// index position where BOTH sides are RIGID-GROUND and different. Everything
// flexible (a `_`, a metavariable, a parameter/substitution variable, a
// context) is unjudgeable and therefore passes.
const RIGID_GROUND_RE = /(^|[^\p{L}\p{N}_'])\p{Lu}/u;
function rigidGroundIndex(text) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return false;
  if (/[_?[\]#$\\]/.test(t)) return false; // inferred slot, box/context, parameter, subst, binder
  return !RIGID_GROUND_RE.test(t);         // no metavariable occurrence
}
const hasFunctionArrow = (s) => /->|→|\{/.test(String(s == null ? '' : s));

export function assumptionCompatible(hypType, goalType) {
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const h0 = norm(hypType);
  const g0 = norm(goalType);
  if (!h0 || !g0) return false;
  if (h0 === g0) return true;
  // A function/Pi-typed hypothesis does not inhabit an atomic goal (it would
  // need arguments — that is the LEMMA move, not the axiom), and vice versa.
  if (hasFunctionArrow(h0) || hasFunctionArrow(g0)) return false;
  const hb = decomposeContextual(h0);
  const gb = decomposeContextual(g0);
  if (!hb !== !gb) return false; // boxed object vs bare comp value — different shapes
  const ha = parseAppType(hb ? hb.concl : h0);
  const ga = parseAppType(gb ? gb.concl : g0);
  if (!ha || !ga) return false;
  if (ha.head !== ga.head) return false;
  if (!/^[\p{L}\p{S}_]/u.test(ha.head)) return false; // flexible head — not a family
  if (ha.indices.length !== ga.indices.length) return false;
  for (let i = 0; i < ha.indices.length; i += 1) {
    const a = norm(ha.indices[i]);
    const b = norm(ga.indices[i]);
    if (a === b) continue;
    if (rigidGroundIndex(a) && rigidGroundIndex(b)) return false;
  }
  return true;
}
