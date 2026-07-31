import {
  applicationExprType,
  resolveHoverDoc,
  signatureBinderType,
  slotExpectedType,
} from '../../name-resolve.mjs';
import {
  decomposeContextual,
  domainAtArrowIndex,
  splitArrowSpineText,
} from '../../prover/hole-split.mjs';
import { firstChildNamed, firstIdentChild } from '../../tree-helpers.mjs';

function nextTypeSibling(node) {
  for (let s = node.nextSibling; s; s = s.nextSibling) {
    if (s.name === 'CompType' || s.name === 'LFType' || s.name === 'LFKind' || s.name === 'CompKind') {
      return s;
    }
  }
  return null;
}

function identAt(tree, pos) {
  for (const bias of [-1, 1, 0]) {
    const n = tree.resolveInner(pos, bias);
    if (n && (n.name === 'LowerIdentifier' || n.name === 'UpperIdentifier')) return n;
  }
  return null;
}

function caseScrutineeNode(tree, pos) {
  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (cur.name !== 'CaseExpression') continue;
    for (let c = cur.firstChild; c; c = c.nextSibling) {
      if (c.name === 'Expression') return c;
    }
    return null;
  }
  return null;
}

function recBodyNode(tree, pos) {
  for (let p = tree.resolveInner(pos, -1); p; p = p.parent) {
    if (p.name === 'RecBody') return p;
  }
  return null;
}

function recSignatureAt(tree, doc, pos) {
  const recBody = recBodyNode(tree, pos);
  if (!recBody) return null;
  const recId = firstIdentChild(recBody);
  const compType = recId && nextTypeSibling(recId);
  return compType ? doc.sliceString(compType.from, compType.to) : null;
}

function cumulativeLambdaParamIndex(tree, doc, identNode, recBody) {
  const name = doc.sliceString(identNode.from, identNode.to);
  if (!name || !recBody) return null;
  let idx = 0;
  let found = null;

  function walkExpr(node) {
    if (!node || found != null) return;
    if (node.name === 'FnExpression' || node.name === 'MLamExpression') {
      const paramKind = node.name === 'FnExpression' ? 'FnParam' : 'MLamParam';
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.name === paramKind) {
          const id = firstIdentChild(c);
          if (id && doc.sliceString(id.from, id.to) === name) {
            found = idx;
            return;
          }
          idx += 1;
        }
        if (c.name === 'FatArrow') {
          const body = c.nextSibling;
          if (body) walkExpr(body);
          return;
        }
      }
      return;
    }
    for (let c = node.firstChild; c; c = c.nextSibling) walkExpr(c);
  }

  for (let c = recBody.firstChild; c; c = c.nextSibling) {
    if (c.name === 'Expression') walkExpr(c);
  }
  return found;
}

function signaturePrefixBinderCount(sig) {
  let rest = String(sig || '').trim();
  let n = 0;
  while (rest.length) {
    const open = rest[0];
    if (open !== '(' && open !== '{') break;
    const close = open === '(' ? ')' : '}';
    let i = 1;
    while (i < rest.length && /\s/.test(rest[i])) i += 1;
    while (i < rest.length && rest[i] !== ':' && rest[i] !== close) i += 1;
    if (rest[i] !== ':') break;
    i += 1;
    let depth = 1;
    while (i < rest.length && depth > 0) {
      const ch = rest[i];
      if (ch === open) depth += 1;
      else if (ch === close) depth -= 1;
      i += 1;
    }
    if (depth !== 0) break;
    n += 1;
    rest = rest.slice(i).trim();
  }
  return n;
}

function lambdaParamType(tree, doc, identNode) {
  const name = doc.sliceString(identNode.from, identNode.to);
  if (!name) return null;

  const recBody = recBodyNode(tree, identNode.from);
  const sig = recSignatureAt(tree, doc, identNode.from);
  if (!sig) return null;

  const fromPrefix = signatureBinderType(sig, name);
  if (fromPrefix) return fromPrefix;

  const bodyIdx = cumulativeLambdaParamIndex(tree, doc, identNode, recBody);
  if (bodyIdx == null) return null;
  return domainAtArrowIndex(sig, signaturePrefixBinderCount(sig) + bodyIdx);
}

function codomainAfterPeel(sig, peel) {
  let cur = String(sig || '').trim();
  for (let i = 0; i < peel; i += 1) {
    const parts = splitArrowSpineText(cur);
    if (parts.length <= 1) return parts[0] || cur;
    cur = parts.slice(1).join(' → ');
  }
  const parts = splitArrowSpineText(cur);
  return parts.length ? parts[parts.length - 1] : cur;
}

function recBodyExpectedType(tree, doc, pos) {
  const sig = recSignatureAt(tree, doc, pos);
  if (!sig) return null;
  let peel = 0;
  for (let p = tree.resolveInner(pos, -1); p; p = p.parent) {
    if (p.name === 'FnExpression' || p.name === 'MLamExpression') peel += 1;
  }
  peel += signaturePrefixBinderCount(sig);
  return codomainAfterPeel(sig, peel);
}

function contextVarExpectedType(tree, doc, pos) {
  const id = identAt(tree, pos);
  if (!id) return null;
  const name = doc.sliceString(id.from, id.to);
  const sig = recSignatureAt(tree, doc, pos);
  if (name && sig) {
    const fromRec = signatureBinderType(sig, name);
    if (fromRec) return fromRec;
  }
  return lambdaParamType(tree, doc, id);
}

function typeOfExpression(tree, doc, exprNode) {
  if (!exprNode) return null;
  if (exprNode.name === 'ContextualObject') {
    return doc.sliceString(exprNode.from, exprNode.to);
  }
  const id = identAt(tree, exprNode.from);
  if (!id) return null;

  const hover = resolveHoverDoc(tree, doc, id.from);
  if (hover?.sourceType) return hover.sourceType;

  const fromLambda = lambdaParamType(tree, doc, id);
  if (fromLambda) return fromLambda;

  const appType = applicationExprType(tree, doc, exprNode.from, exprNode.to);
  if (appType) return appType;

  return null;
}

function patternScrutineeType(tree, doc, pos) {
  const scrutinee = caseScrutineeNode(tree, pos);
  if (!scrutinee) return null;
  return typeOfExpression(tree, doc, scrutinee);
}

function expressionExpectedType(tree, doc, pos) {
  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (cur.name !== 'Expression') continue;
    let inner = null;
    for (let c = cur.firstChild; c; c = c.nextSibling) {
      if (c.name === 'Expression' && !inner) inner = c;
      if (c.name === ':' && c.nextSibling?.name === 'CompType' && inner
          && pos >= inner.from && pos <= inner.to) {
        return doc.sliceString(c.nextSibling.from, c.nextSibling.to);
      }
    }
  }
  return recBodyExpectedType(tree, doc, pos);
}

// Head signature of a computation AppExpression (rec / inductive ctor / local).
function appHeadSignature(tree, doc, appNode) {
  let head = appNode;
  while (head && head.name === 'AppExpression' && head.firstChild
      && head.firstChild.name === 'AppExpression') {
    head = head.firstChild;
  }
  const atom = head && (head.name === 'AtomicExpression' ? head
    : head?.firstChild?.name === 'AtomicExpression' ? head.firstChild
    : null);
  if (!atom) return null;
  const id = firstIdentChild(atom) || identAt(tree, atom.from);
  if (!id) return null;
  return typeOfExpression(tree, doc, atom);
}

// Argument index of `pos` under a left-associative AppExpression spine.
// Head = index -1 (no expected domain); first arg = 0.
function appArgIndexAt(appRoot, pos) {
  const atoms = [];
  function collect(node) {
    if (!node) return;
    if (node.name === 'AppExpression') {
      const kids = [];
      for (let c = node.firstChild; c; c = c.nextSibling) kids.push(c);
      if (kids.length === 1 && kids[0].name === 'AtomicExpression') {
        atoms.push(kids[0]);
        return;
      }
      for (const c of kids) {
        if (c.name === 'AppExpression' || c.name === 'AtomicExpression') collect(c);
      }
      return;
    }
    if (node.name === 'AtomicExpression') atoms.push(node);
  }
  collect(appRoot);
  if (atoms.length < 2) return null;
  for (let i = 1; i < atoms.length; i += 1) {
    const a = atoms[i];
    if (pos >= a.from && pos <= a.to) return i - 1;
  }
  return null;
}

function outermostAppAt(tree, pos) {
  let best = null;
  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (cur.name === 'AppExpression') best = cur;
    if (cur.name === 'Expression' || cur.name === 'FnExpression'
        || cur.name === 'MLamExpression' || cur.name === 'CaseExpression'
        || cur.name === 'LetExpression' || cur.name === 'RecBody') {
      break;
    }
  }
  return best;
}

// Expected domain type for the argument under the cursor in `f a b …`.
function appArgExpectedType(tree, doc, pos) {
  const app = outermostAppAt(tree, pos);
  if (!app) return null;
  const idx = appArgIndexAt(app, pos);
  if (idx == null || idx < 0) return null;
  const sig = appHeadSignature(tree, doc, app);
  if (!sig) return null;
  // Peel implicit/prefix binders so arrow domains align with applied args.
  const peel = signaturePrefixBinderCount(sig);
  const domain = domainAtArrowIndex(sig, peel + idx);
  return domain || null;
}

function letRhsExpectedType(tree, doc, pos) {
  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (cur.name !== 'LetExpression') continue;
    let pat = null;
    let eq = null;
    let rhs = null;
    let inKw = null;
    for (let c = cur.firstChild; c; c = c.nextSibling) {
      if (c.name === 'Pattern') pat = c;
      if (c.name === '=') eq = c;
      if (eq && !inKw && (c.name === 'Expression' || c.name === 'AppExpression') && !rhs) {
        rhs = c;
      }
      if (c.name === 'InKeyword') inKw = c;
    }
    if (!pat || !eq || !rhs) return null;
    if (pos < eq.to || (inKw && pos >= inKw.from)) return null;
    if (pos < rhs.from || pos > rhs.to) return null;
    // Pattern annotation: `x : T` / `p : T`.
    for (let c = pat.firstChild; c; c = c.nextSibling) {
      if (c.name === ':' && c.nextSibling?.name === 'CompType') {
        return doc.sliceString(c.nextSibling.from, c.nextSibling.to);
      }
    }
    return null;
  }
  return null;
}

function boxContentsExpectedType(tree, doc, pos) {
  let box = null;
  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (cur.name === 'ContextualObject' || cur.name === 'ContextualType') {
      box = cur;
      break;
    }
  }
  if (!box) return null;
  // Only the term/type after the turnstile is the conclusion slot.
  const turnstile = firstChildNamed(box, 'Turnstile');
  if (!turnstile || pos < turnstile.to) return null;

  // Prefer an ascription / expected type of the whole box as an expression.
  const outer = expressionExpectedType(tree, doc, box.from);
  if (outer) {
    const parts = decomposeContextual(outer);
    if (parts?.concl) return parts.concl;
  }

  // Parent pattern/expression may carry a contextual type via hover of a
  // surrounding ascription — fall back to slotExpectedType for LF apps inside.
  return slotExpectedType(tree, doc, pos);
}

function schemaElementExpectedType(tree, doc, pos) {
  // Inside schema LF type positions, reuse application-slot inference
  // (`vec z` → z expects nat). Bare family heads have no richer goal.
  return slotExpectedType(tree, doc, pos);
}

// Statically known expected type at an ident completion site, or null.
export function expectedGoalType(tree, doc, site) {
  if (!site || !tree) return null;
  if (site.kind !== 'ident' && site.kind !== 'structure') return null;

  let ctx = site.ctxName || null;
  if (!ctx) {
    for (let cur = tree.resolveInner(site.from ?? 0, -1); cur; cur = cur.parent) {
      if (cur.name === 'AtomicPattern'
          || cur.name === 'LFAtomicTerm'
          || cur.name === 'LFAtomicType'
          || cur.name === 'CompAtomicType'
          || cur.name === 'AtomicExpression'
          || cur.name === 'ContextHead'
          || cur.name === 'ContextTailEntry'
          || cur.name === 'SchemaElement'
          || cur.name === 'SchemaSomeBindings') {
        ctx = cur.name;
        break;
      }
      if (cur.name === 'FnExpression' || cur.name === 'MLamExpression'
          || cur.name === 'CaseExpression' || cur.name === 'RecBody') {
        break;
      }
    }
  }

  const pos = site.from;

  // Let-RHS ascription wins when present (more specific than rec-body peel).
  const letGoal = letRhsExpectedType(tree, doc, pos);
  if (letGoal) return letGoal;

  // Box conclusion after ⊢ / |-.
  if (ctx === 'LFAtomicTerm' || ctx === 'LFAtomicType') {
    const boxGoal = boxContentsExpectedType(tree, doc, pos);
    if (boxGoal) return boxGoal;
  }

  if (ctx === 'AtomicPattern') return patternScrutineeType(tree, doc, pos);
  if (ctx === 'LFAtomicTerm' || ctx === 'LFAtomicType' || ctx === 'CompAtomicType') {
    return slotExpectedType(tree, doc, pos);
  }
  if (ctx === 'SchemaElement' || ctx === 'SchemaSomeBindings') {
    return schemaElementExpectedType(tree, doc, pos);
  }
  if (ctx === 'AtomicExpression') {
    // App-arg domains are more specific than the enclosing expression goal.
    const argGoal = appArgExpectedType(tree, doc, pos);
    if (argGoal) return argGoal;
    return expressionExpectedType(tree, doc, pos);
  }
  if (ctx === 'ContextHead' || ctx === 'ContextTailEntry') {
    return contextVarExpectedType(tree, doc, pos);
  }
  // Empty expr-head after `=` / `⇒`: peel the enclosing rec signature.
  if (site.structure === 'expr-head') {
    return expressionExpectedType(tree, doc, pos);
  }
  // App-arg fallback when ctxName was missing but we are mid-application.
  const argGoal = appArgExpectedType(tree, doc, pos);
  if (argGoal) return argGoal;
  return null;
}
