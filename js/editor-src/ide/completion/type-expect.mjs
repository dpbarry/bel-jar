import {
  applicationExprType,
  resolveHoverDoc,
  signatureBinderType,
  slotExpectedType,
} from '../../name-resolve.mjs';
import { domainAtArrowIndex, splitArrowSpineText } from '../../prover/hole-split.mjs';
import { firstIdentChild } from '../../tree-helpers.mjs';

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

// Statically known expected type at an ident completion site, or null.
export function expectedGoalType(tree, doc, site) {
  if (!site || site.kind !== 'ident' || !tree) return null;
  const ctx = site.ctxName || null;

  if (ctx === 'AtomicPattern') return patternScrutineeType(tree, doc, site.from);
  if (ctx === 'LFAtomicTerm' || ctx === 'LFAtomicType') return slotExpectedType(tree, doc, site.from);
  if (ctx === 'AtomicExpression') return expressionExpectedType(tree, doc, site.from);
  if (ctx === 'ContextHead' || ctx === 'ContextTailEntry') {
    return contextVarExpectedType(tree, doc, site.from);
  }
  return null;
}
