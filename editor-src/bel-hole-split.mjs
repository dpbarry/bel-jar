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
// bel-hole-actions.mjs.

import { parser } from './beluga-parser.js';
import { parseCompType } from './bel-prover.mjs';
import { firstChildNamed, firstIdentChild, isLFDatatypeHead } from './bel-tree-helpers.mjs';

// ── Contextual type decomposition ───────────────────────────────────────────
// A hole scrutinee var has a type like `[ |- nat]`, `[g |- tm]`, `[g, x:tm |- tm]`,
// or a bare `nat`. Split it into the context part (before the turnstile, may be
// empty) and the conclusion (after). Returns { ctx, concl } or null when there's
// no contextual wrapper (a plain computation type we don't case-split here).
export function decomposeContextual(typeStr) {
  const t = String(typeStr == null ? '' : typeStr).trim();
  if (!t) return null;
  // Strip one outer [ … ] (computation) or ( … ) (meta) box when a turnstile is present.
  const boxed = (t[0] === '[' && t[t.length - 1] === ']')
    || (t[0] === '(' && t[t.length - 1] === ')');
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

function familyOfConstructorName(code, ctorName) {
  if (!ctorName) return null;
  const esc = ctorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  const opRe = /\s([A-Za-z_⇛≡⅋&⊕⊗][A-Za-z0-9_⇛≡⅋&⊕⊗]*)\s/g;
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

export function enumerateConstructorsTyped(code, family) {
  if (!family) return [];
  const src = String(code == null ? '' : code);
  const memo = memoFor(src);
  if (memo.ctors.has(family)) return memo.ctors.get(family);
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
    if (!isCtorNode && !isDecl) continue;
    const node = cur.node;
    const id = firstIdentChild(node);
    if (!id) continue;
    const name = slice(id);
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
    out.push({ name, argTypes: spine.argTypes, result: spine.result });
  } while (cur.next());
  for (const c of enumerateCTypeConstructorsText(src, family)) {
    const key = c.name + '::' + c.result.indices.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
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

function ctypeCtorArms(body) {
  const arms = [];
  let cur = null;
  for (const raw of String(body || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line === ';') break;
    if (line.startsWith('|')) {
      if (cur) arms.push(cur);
      cur = line.slice(1).trim();
    } else if (cur && (/^[→\-]|^\|/.test(line) || !/^[A-Za-z_]/.test(line.split(/\s/)[0]))) {
      cur += ` ${line}`;
    } else break;
  }
  if (cur) arms.push(cur);
  return arms;
}

function enumerateCTypeConstructorsText(src, family) {
  const out = [];
  const re = /\binductive\s+([A-Za-z_][A-Za-z0-9_']*)\s*:[\s\S]*?=\s*/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const body = src.slice(m.index + m[0].length);
    for (const arm of ctypeCtorArms(body)) {
      const colon = arm.indexOf(':');
      if (colon < 0) continue;
      const name = arm.slice(0, colon).trim();
      const typeText = arm.slice(colon + 1).replace(/\s+/g, ' ').trim();
      const spine = compArrowSpineTyped(typeText);
      if (spine && spine.result.head === family) out.push({ name, ...spine });
    }
  }
  return out;
}

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

// Walk an LFType's top-level arrow spine, returning explicit argument TYPE texts
// and the result type decomposed into { head, indices:[arg texts] }. Skips leading
// `{Pi}` implicit binders (index variables, not term args). `slice` reads node text.
function lfArrowSpineTyped(typeNode, slice) {
  const argTypes = [];
  let node = typeNode;
  for (let guard = 0; node && guard < 256; guard += 1) {
    const children = [];
    for (let c = node.firstChild; c; c = c.nextSibling) children.push(c);
    const brace = children.find((c) => c.name === '{');
    const arrow = children.find((c) => c.name === 'ArrowOp');
    if (brace) {
      const close = children.findIndex((c) => c.name === '}');
      const body = close >= 0 ? children.slice(close + 1).find((c) => c.name === 'LFType') : null;
      if (!body) return null;
      node = body;
      continue;
    }
    if (!arrow) break; // atomic result
    const lf = children.filter((c) => c.name === 'LFType');
    if (lf.length < 2) break;
    argTypes.push(slice(lf[0]));
    node = lf[lf.length - 1];
  }
  // `node` is now the (atomic) result type — read its head + index args.
  const result = appHeadAndIndices(node, slice);
  if (!result || !result.head) return null;
  return { argTypes, result };
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

// The type-family head of an `name : type` style binding text, e.g. `hyp x A`
// from `h : hyp x A`, `name` from `x : name`. Null when no head reads.
function headOfBindingType(text) {
  const m = String(text == null ? '' : text).replace(/^[^:]*:/, '').trim()
    .match(/([A-Za-z_][A-Za-z0-9_'.]*)/);
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
    .map((m) => m[0]).filter((t) => !/^[A-Z]/.test(t));
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
function freshNamer(used) {
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
  return {
    higherOrder: binders.length > 0,
    binders: binders.length,
    binderCtx: binders,
    bodyType,
    explicitPi,
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
  const m = /^\{\s*([A-Za-z_][A-Za-z0-9_']*)\s*:\s*([\s\S]*)\}$/.exec(String(text || '').trim());
  return m ? { name: m[1], type: m[2].trim() } : null;
}

function splitArrowSpineText(text) {
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
  if (!/^[a-z]/i.test(toks[0])) return false;
  return toks.slice(1).every((x) => /^[A-Z][A-Za-z0-9_']*$/.test(x));
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
  for (const m of body.matchAll(/let\s+(\[[\s\S]*?\])\s*=\s*([A-Za-z_][A-Za-z0-9_']*)/g)) {
    const d = decomposeContextual(m[1]);
    if (!d) continue;
    const bind = String(d.concl || '').trim().split(/\s+/)[0].replace(/\[.*/, '');
    if (!bind || !/^[A-Za-z_][A-Za-z0-9_']*$/.test(bind)) continue;
    out.push({ name: bind, ctx: d.ctx, head: declConclusionHead(code, m[2]) });
  }
  // CTYPE-pattern lets `let Res [b1] [b2] … = fn …` — each box binding a fresh
  // metavar is typed by the corresponding constructor argument's family (the
  // wildcard/constant boxes bind nothing).
  const re2 = /let\s+([A-Za-z_][A-Za-z0-9_']*)\s*\[/g;
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
    const fnm = /^=\s*([A-Za-z_][A-Za-z0-9_']*)/.exec(body.slice(i));
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
      if (!/^[A-Za-z_][A-Za-z0-9_']*$/.test(tok) || tok === '_') return; // GENERAL: `_` is the wildcard token, not a name
      // a declared constant in the pattern (refl_proc) binds nothing
      if (enumerateConstructorsTyped(code, tok).length || familyOfConstructorName(code, tok)) return;
      const at = ctor.argTypes[k];
      if (!at) return;
      const t = String(at).trim();
      const pim = t.startsWith('{') ? /^\{\s*[A-Za-z_][A-Za-z0-9_']*\s*:\s*([\s\S]*)\}$/.exec(t) : null;
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
  const concl = conclusionOf(parts[parts.length - 1]);
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
  const m = /\b([a-z][A-Za-z0-9_']*)\[\.\.\]\s+(h[A-Za-z0-9_']*)/.exec(box);
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
  for (const c of (hole.ctx || [])) add(c.name, c.type);
  for (const m of (hole.meta || [])) add(m.name, m.type);
  for (const b of branchLetBindings(code, hole)) {
    add(b.name, b.head ? `[${b.ctx} |- ${b.head} _]` : '');
  }
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
  for (const m of String(box).matchAll(/\(((?:\\\w+\.\s*)+)([A-Za-z_][A-Za-z0-9_']*)\[\.\./g)) {
    const binders = [...m[1].matchAll(/\\(\w+)\./g)].map((x) => x[1]);
    if (!best || binders.length > best.length) best = binders;
  }
  if (best && best.length > desc.binders) {
    return '(' + best.map((b) => '\\' + b + '. ').join('') + term + ')';
  }
  return hoLamTerm(desc, term);
}

function hoLamInner(term) {
  const m = /\.\s*([A-Za-z_][A-Za-z0-9_']*)\s*\)\s*$/.exec(String(term || ''));
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
  return ranked.map((s) => fillTermForHyp(s, goalBox, rawType));
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
  const m = /^hyp\s+([A-Za-z_][A-Za-z0-9_']*)\s/.exec(String(typeText || '').trim());
  if (!m) return null;
  const vn = m[1];
  if (/^[A-Z]/.test(vn)) return null;
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
  for (let ai = 0; ai < ctor.args.length; ai += 1) {
    const arg = ctor.args[ai];
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
function patternMetavars(term) {
  const out = new Set();
  for (const m of String(term || '').matchAll(/\b([A-Z][A-Za-z0-9_']*)(?=\[\]|\[\.\.|\s|,|\)|$)/g)) {
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
function armAnnotation(ctor, ctxStr, used) {
  if (!ctor || !ctor.result || !ctor.result.indices || !ctor.result.indices.length) return null;
  const vars = new Set();
  for (const idx of ctor.result.indices) {
    for (const m of String(idx).match(/[A-Z][A-Za-z0-9_']*/g) || []) vars.add(m);
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
    for (const m of t.matchAll(/\(\s*([A-Z][A-Za-z0-9_']*)\s+[a-z]/g)) {
      if (vars.has(m[1])) return null; // an HO index var — skip this annotation
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
    .replace(/[A-Z][A-Za-z0-9_']*/g, (m) => ren.get(m) || m));
  return boxPattern(ctxStr, `${ctor.result.head} ${indices.join(' ')}`);
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

export function buildSplitSkeleton(scrutVar, ctxStr, ctors, opts = {}) {
  const list = Array.isArray(ctors) ? ctors : [];
  const indent = opts.indent || '';
  const used = [...(opts.usedNames || [])];
  const branches = [];

  const paramTerm = (opts.head && opts.schema) ? parameterTermFor(opts.head, opts.schema) : null;
  const paramBranch = paramTerm
    ? `${indent}| ${boxPattern(ctxStr, paramTerm)} =>\n${indent}  ?`
    : null;

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
    const ann = opts.annotate === false ? null : armAnnotation(ctor, ctxStr, used);
    branches.push(`${indent}| ${boxPattern(ctxStr, pat)}${ann ? ` : ${ann}` : ''} =>\n${indent}  ?`);
  }
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
  const mlams = [];
  let rest = t;
  for (let guard = 0; guard < 16; guard += 1) {
    if (rest[0] === '{') {
      const close = rest.indexOf('}');
      if (close < 0) break;
      const nm = rest.slice(1, close).split(':')[0].trim();
      if (!/^[A-Za-z_][A-Za-z0-9_']*$/.test(nm)) break;
      mlams.push(nm);
      rest = rest.slice(close + 1).trim();
      continue;
    }
    if (rest[0] === '(') {
      let depth = 0;
      let i = 0;
      for (; i < rest.length; i += 1) {
        if (rest[i] === '(') depth += 1;
        else if (rest[i] === ')') { depth -= 1; if (!depth) break; }
      }
      rest = rest.slice(i + 1).trim();
      continue;
    }
    break;
  }
  if (info.arrows < 1 && !mlams.length) return null;
  const used = opts.usedNames || [];
  const fresh = freshNamer(used);
  const preset = Array.isArray(opts.binderNames) ? opts.binderNames : null;
  const binders = mlams.map((n) => 'mlam ' + n);
  for (let i = 0; i < info.arrows; i += 1) {
    const nm = preset && preset[i] ? preset[i] : fresh();
    binders.push('fn ' + nm);
  }
  return binders.join(' => ') + ' => ?';
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
export function fillCandidates(hole, code) {
  const out = [];
  const seen = new Set();
  const push = (t) => { if (t && !seen.has(t)) { seen.add(t); out.push(t); } };

  const goalStr = unwrapExtraGoalBox(hole && hole.goal);
  let decomp = decomposeContextual(goalStr);
  if (!decomp) {
    const rg = resultGoalParts(hole);
    if (rg) decomp = { ctx: rg.ctx, concl: goalStr, boxed: false };
  }
  if (!decomp) return out;
  const ctxStr = decomp.ctx;
  const goalHead = headOfConclusion(decomp.concl);
  if (!goalHead) return out;
  const box = (term) => boxPattern(ctxStr, term);

  // (1) A context parameter projection `#p.field[..]` whose field type-head matches
  //     the goal head — the str_hyp case. We read the parameter variable + its block
  //     type from the meta-context (`#p : #(g |- block (x : name, h : hyp x A1[]))`).
  for (const m of (hole.meta || [])) {
    if (!m || !m.name || m.name[0] !== '#') continue;
    const fields = parseBlockFields(m.type);
    if (fields) {
      for (const f of fields) if (f.head === goalHead && f.name) push(box(`${m.name}.${f.name}[..]`));
    } else if (headOfBindingType(':' + String(m.type || '')) === goalHead) {
      // A bare parameter variable of the goal type.
      push(box(`${m.name}[..]`));
    }
  }

  // (2) A computation-context variable whose boxed type IS the goal — return it
  //     directly (e.g. `fn n => n`). The comp var holds a contextual object.
  for (const c of (hole.ctx || [])) {
    if (c && c.name && typesMatchModuloSpacing(c.type, hole.goal)) push(c.name);
  }

  // (3) Nullary constructors of the goal head — closes str_lin base cases where the
  //     checker has unfolded the goal to a concrete index (Y[..] vs bare Y).
  for (const ctor of enumerateConstructorsTyped(code, goalHead)) {
    if (!ctor.argTypes.length) push(box(ctor.name));
  }

  // A COMPUTATION-family goal (`Result [g ⊢ P] …`) is filled by a BARE comp
  // constructor application over boxed arguments — never re-boxed.
  const compFamily = isCTypeFamily(code, goalHead);

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
      return argFillChoices(descs[i], want, hole, scope, hole.goal, code);
    });
    if (perArg.some((opts) => !opts.length)) continue;
    if (perArg.every((opts) => opts.length === 1)) {
      const args = perArg.map((opts) => opts[0]);
      if (distinctHoBodies(args)) emit(`${ctor.name} ${args.join(' ')}`);
      continue;
    }
    for (const args of cartesianArgCombos(perArg, 12, distinctHoBodies)) {
      emit(`${ctor.name} ${args.join(' ')}`);
    }
  }
  }

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
    const argTerms = [];
    let ok = true;
    for (let ai = 0; ai < ctor.argTypes.length; ai += 1) {
      const at = ctor.argTypes[ai];
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
        const dm = afterTurn.match(/^\s*\w+\s+([A-Z][A-Za-z0-9_']*)\[\]/);
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
    out.push(argTerms.length ? `${ctor.name} ${argTerms.join(' ')}` : ctor.name);
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
export function invertCandidates(hyp, code, used, scope) {
  if (!hyp || !hyp.name) return [];
  const concl = conclusionOf(hyp.type);
  const parsed = parseAppType(concl);
  if (!parsed || !parsed.head) return [];
  const ctx = contextOf(hyp.type);
  const box = (inner) => (ctx ? `[${ctx} |- ${inner}]` : `[ |- ${inner}]`);
  const ctors = enumerateConstructorsTyped(code, parsed.head);
  const fresh = freshNamer(used || []);
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
    const pat = constructorTerm({
      name: ctor.name,
      args: ctor.argTypes.map((at) => constructorArgDescriptor(at, used || [])),
    }, fresh);
    out.push(`let ${box(pat)} = ${hyp.name} in`);
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
  return String(typeText).replace(/[A-Z][A-Za-z0-9_']*/g, (m) => (subst[m] != null ? subst[m] : m));
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
    if (/^[A-Z][A-Za-z0-9_']*$/.test(pt)) {
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
  const isVar = (t) => /^[A-Z][A-Za-z0-9_']*(\[[^[\]]*\])?$/.test(t);
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
    && toks.slice(1).every((t) => /^[a-z][A-Za-z0-9_']*$/.test(t));
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
  return String(typeText).replace(/[A-Z][A-Za-z0-9_']*/g, (m) => (subst[m] != null ? subst[m] : m));
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
