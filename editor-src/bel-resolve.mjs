import { syntaxTree } from '@codemirror/language';
import { walkTree } from './bel-walk.mjs';

const IDENT = new Set(['LowerIdentifier', 'UpperIdentifier']);

const TYPE_RHS = new Set([
  'LFType', 'LFKind', 'CompType', 'CompKind',
  'ContextualType', 'LFBlock',
]);

const GLOBAL_DECL_PARENT = new Set([
  'LFDeclaration',
  'LFDatatypeDeclaration',
  'LFConstructor',
  'SchemaDeclaration',
  'TypedefDeclaration',
  'LetDeclaration',
  'ModuleDeclaration',
  'InductiveBody',
  'CompConstructor',
  'RecBody',
]);

const LOCAL_BINDER_INLINE_TYPE = new Set([
  'CompTypeBinder',
  'LFBlockField',
  'ContextEntry',
  'SchemaSomeBindings',
]);

const LOCAL_BINDER_OUTER_TYPE = new Set(['PiBinder']);

const LOCAL_BINDER_BARE = new Set([
  'LFLambdaBinder',
  'FnParam',
  'MLamParam',
  'ContextHat',
  'ContextHead',
  'ContextTailEntry',
]);

function firstIdentChild(node) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (IDENT.has(c.name)) return c;
    if (c.name === 'ParameterVariable' || c.name === 'SubstitutionVariable') {
      const sigil = c.firstChild;
      if (!sigil || (sigil.name !== '#' && sigil.name !== '$')) continue;
      const id = sigil.nextSibling;
      if (id && IDENT.has(id.name)) return id;
    }
  }
  return null;
}

const LOCAL_BINDER_LABEL = {
  PiBinder:           'Pi Binder',
  CompTypeBinder:     'Meta Binder',
  LFBlockField:       'Block Field',
  ContextEntry:       'Context Variable',
  ContextHead:        'Context Variable',
  ContextTailEntry:   'Context Variable',
  ContextHat:         'Context Variable',
  LFLambdaBinder:     'Lambda Binder',
  FnParam:            'Parameter',
  MLamParam:          'Meta Parameter',
  SchemaSomeBindings: 'Schema Binder',
};

function globalLabel(declParent) {
  const n = declParent.name;
  if (n === 'LFDeclaration') {
    for (let c = declParent.firstChild; c; c = c.nextSibling) {
      if (c.name === 'LFKind') return 'LF Type Family';
      if (c.name === 'LFType') return 'LF Constant';
    }
    return 'LF Declaration';
  }
  if (n === 'LFDatatypeDeclaration')   return 'LF Type Family';
  if (n === 'LFConstructor')           return 'LF Constructor';
  if (n === 'InductiveBody')           return 'Inductive Type';
  if (n === 'CompConstructor')         return 'Constructor';
  if (n === 'RecBody')                 return 'Recursive Function';
  if (n === 'TypedefDeclaration')      return 'Type Alias';
  if (n === 'SchemaDeclaration')       return 'Schema';
  if (n === 'LetDeclaration')          return 'Let Binding';
  if (n === 'ModuleDeclaration')       return 'Module';
  return null;
}

function localLabel(binderParent) {
  return LOCAL_BINDER_LABEL[binderParent.name] || 'Local Binding';
}

function nextTypeSibling(node) {
  for (let s = node.nextSibling; s; s = s.nextSibling) {
    if (TYPE_RHS.has(s.name)) return s;
  }
  return null;
}

function identAt(tree, pos) {
  let n = tree.resolveInner(pos, 1);
  if (n && IDENT.has(n.name)) return n;
  if (n && (n.name === '#' || n.name === '$')) {
    const p = n.parent;
    if (p && (p.name === 'ParameterVariable' || p.name === 'SubstitutionVariable')) {
      const id = n.nextSibling;
      if (id && IDENT.has(id.name)) return id;
    }
    const sib = n.nextSibling;
    if (sib && IDENT.has(sib.name)) return sib;
  }
  n = tree.resolveInner(pos, -1);
  if (n && IDENT.has(n.name)) return n;
  if (n && (n.name === '#' || n.name === '$')) {
    const p = n.parent;
    if (p && (p.name === 'ParameterVariable' || p.name === 'SubstitutionVariable')) {
      const id = n.nextSibling;
      if (id && IDENT.has(id.name)) return id;
    }
    const sib = n.nextSibling;
    if (sib && IDENT.has(sib.name)) return sib;
  }
  return null;
}

function extendedNameOf(ident, doc) {
  const p = ident.parent;
  if (!p) return doc.sliceString(ident.from, ident.to);
  if (p.name === 'ParameterVariable' || p.name === 'SubstitutionVariable') {
    const h = p.firstChild;
    if (h && (h.name === '#' || h.name === '$')) {
      return doc.sliceString(h.from, ident.to);
    }
  }
  return doc.sliceString(ident.from, ident.to);
}

function lineColAt(doc, pos) {
  const line = doc.lineAt(pos);
  return { line: line.number, col: pos - line.from };
}

function widenToBracket(doc, from, to) {
  const text = doc.toString();
  let s = from;
  while (s > 0) {
    const ch = text.charAt(s - 1);
    if (ch === '{' || ch === '(') { s -= 1; break; }
    if (!/\s/.test(ch)) break;
    s -= 1;
  }
  let e = to;
  while (e < text.length) {
    const ch = text.charAt(e);
    if (ch === '}' || ch === ')') { e += 1; break; }
    if (!/\s/.test(ch)) break;
    e += 1;
  }
  return text.slice(s, e).replace(/\s+/g, ' ').trim();
}

function sliceText(doc, from, to) {
  return doc.sliceString(from, to).replace(/\s+/g, ' ').trim();
}

function sourceSignatureForGlobal(declParent, ident, doc) {
  if (!declParent || !ident) return null;
  const dname = declParent.name;
  if (dname === 'ModuleDeclaration' || dname === 'SchemaDeclaration') return null;
  if (dname === 'LetDeclaration') return null;

  const ty = nextTypeSibling(ident);
  if (!ty) return null;
  const text = sliceText(doc, ty.from, ty.to);
  return text || null;
}

function findEnclosingLocalBinder(ident, doc, name) {
  for (let p = ident.parent; p; p = p.parent) {
    const matched = scanFrameForName(p, doc, name);
    if (matched) return matched;
  }
  return null;
}

function hit(text, binderKind) { return { text, binderKind }; }

function scanFrameForName(frame, doc, name) {
  const fname = frame.name;

  if (fname === 'LFKind' || fname === 'LFType') {
    const pi = firstChildNamed(frame, 'PiBinder');
    if (pi) {
      const id = firstIdentChild(pi);
      if (id && doc.sliceString(id.from, id.to) === name) {
        const ty = nextTypeSibling(pi);
        if (ty) return hit(sliceText(doc, ty.from, ty.to), 'PiBinder');
      }
    }
  }

  if (fname === 'CompType' || fname === 'CompKind') {
    const ctb = firstChildNamed(frame, 'CompTypeBinder');
    if (ctb) {
      const id = firstIdentChild(ctb);
      if (id && doc.sliceString(id.from, id.to) === name) {
        const ty = nextTypeSibling(id);
        if (ty) return hit(sliceText(doc, ty.from, ty.to), 'CompTypeBinder');
      }
    }
  }

  if (fname === 'CaseBranch') {
    for (let c = frame.firstChild; c; c = c.nextSibling) {
      if (c.name !== 'QuantifiedBinder') continue;
      const ctb = firstChildNamed(c, 'CompTypeBinder');
      if (!ctb) continue;
      const id = firstIdentChild(ctb);
      if (id && doc.sliceString(id.from, id.to) === name) {
        const ty = nextTypeSibling(id);
        if (ty) return hit(sliceText(doc, ty.from, ty.to), 'CompTypeBinder');
      }
    }
  }

  if (fname === 'LFLambda') {
    const binder = firstChildNamed(frame, 'LFLambdaBinder');
    if (binder) {
      const id = firstIdentChild(binder);
      if (id && doc.sliceString(id.from, id.to) === name) return hit('', 'LFLambdaBinder');
    }
  }

  if (fname === 'FnExpression' || fname === 'MLamExpression') {
    const childKind = fname === 'FnExpression' ? 'FnParam' : 'MLamParam';
    for (let c = frame.firstChild; c; c = c.nextSibling) {
      if (c.name !== childKind) continue;
      const id = firstIdentChild(c);
      if (id && doc.sliceString(id.from, id.to) === name) return hit('', childKind);
    }
  }

  if (fname === 'SchemaElement') {
    const some = firstChildNamed(frame, 'SchemaSomeBlock');
    if (some) {
      const wrap = firstChildNamed(some, 'SchemaSomeBindings');
      if (wrap) {
        for (let c = wrap.firstChild; c; c = c.nextSibling) {
          if (c.name !== 'LowerIdentifier') continue;
          if (doc.sliceString(c.from, c.to) !== name) continue;
          const ty = nextTypeSibling(c);
          if (ty) return hit(sliceText(doc, ty.from, ty.to), 'SchemaSomeBindings');
        }
      }
    }
  }

  if (fname === 'ContextualType' || fname === 'ContextualObject') {
    const part = firstChildNamed(frame, 'ContextPart');
    if (part) {
      const found = scanContextPartForName(part, doc, name);
      if (found) return found;
    }
  }

  if (fname === 'LFBlock') {
    for (let c = frame.firstChild; c; c = c.nextSibling) {
      if (c.name !== 'LFBlockField') continue;
      const id = firstIdentChild(c);
      if (id && doc.sliceString(id.from, id.to) === name) {
        const ty = nextTypeSibling(id);
        if (ty) return hit(sliceText(doc, ty.from, ty.to), 'LFBlockField');
      }
    }
  }

  return null;
}

function scanContextPartForName(part, doc, name) {
  const stack = [part];
  while (stack.length) {
    const node = stack.pop();
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.name === 'ContextEntry' || c.name === 'LFBlockField') {
        const id = firstIdentChild(c);
        if (id && doc.sliceString(id.from, id.to) === name) {
          const ty = nextTypeSibling(id);
          if (ty) return hit(sliceText(doc, ty.from, ty.to), c.name);
        }
      }
      stack.push(c);
    }
  }
  return null;
}

function firstChildNamed(node, name) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === name) return c;
  }
  return null;
}

function findGlobalDeclarationIdent(tree, doc, name, isUpper) {
  const entries = walkTree(tree, doc).defMap.get(name);
  if (!entries) return null;
  for (const e of entries) {
    if (e.isUpper === isUpper) return { ident: e.ident, declParent: e.declParent };
  }
  return null;
}

const TYPE_APP = new Set(['LFAppType', 'CompAppType']);
const TERM_APP = new Set(['LFAppTerm']);

function typeAppArgChild(app) {
  let arg = null;
  for (let c = app.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LFAtomicTerm' || c.name === 'CompTypeArg') arg = c;
  }
  return arg;
}

function termAppArgChild(app) {
  let arg = null;
  for (let c = app.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LFAtomicTerm') arg = c;
  }
  return arg;
}

function headIdentOfTypeApp(app) {
  let node = app.firstChild;
  while (node && TYPE_APP.has(node.name)) node = node.firstChild;
  if (!node) return null;
  return firstIdentChild(node);
}

function headIdentOfTermApp(app) {
  let node = app.firstChild;
  while (node && TERM_APP.has(node.name)) node = node.firstChild;
  if (!node) return null;
  return firstIdentChild(node);
}

function innermostTypeAppForIdent(ident) {
  let app = null;
  for (let p = ident.parent; p; p = p.parent) {
    if (!TYPE_APP.has(p.name)) continue;
    const arg = typeAppArgChild(p);
    if (arg && ident.from >= arg.from && ident.to <= arg.to) app = p;
  }
  return app;
}

function innermostTermAppForIdent(ident) {
  let app = null;
  for (let p = ident.parent; p; p = p.parent) {
    if (!TERM_APP.has(p.name)) continue;
    const arg = termAppArgChild(p);
    if (!arg || ident.from < arg.from || ident.to > arg.to) continue;
    app = p;
  }
  return app;
}

function isHeadOnlyTypeApp(app) {
  return TYPE_APP.has(app.name) && !typeAppArgChild(app);
}

function isHeadOnlyTermApp(app) {
  return TERM_APP.has(app.name) && !termAppArgChild(app);
}

function argIndexInTypeApp(ident) {
  const app = innermostTypeAppForIdent(ident);
  if (!app) return null;

  let index = 0;
  let node = app.firstChild;
  while (node) {
    if (!TYPE_APP.has(node.name)) break;
    if (!isHeadOnlyTypeApp(node)) index += 1;
    node = node.firstChild;
  }
  return index;
}

function argIndexInTermApp(ident) {
  const app = innermostTermAppForIdent(ident);
  if (!app) return null;

  let index = 0;
  let node = app.firstChild;
  while (node) {
    if (!TERM_APP.has(node.name)) break;
    if (!isHeadOnlyTermApp(node)) index += 1;
    node = node.firstChild;
  }
  return index;
}

function splitArrowType(typeStr) {
  const s = typeStr.trim();
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{' || ch === '(' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      if (s[i] === '→') {
        return { domain: s.slice(0, i).trim(), codomain: s.slice(i + 1).trim() };
      }
      if (s.startsWith('->', i)) {
        return { domain: s.slice(0, i).trim(), codomain: s.slice(i + 2).trim() };
      }
      if (s.startsWith('<-', i)) {
        return { domain: s.slice(i + 2).trim(), codomain: s.slice(0, i).trim() };
      }
    }
  }
  return null;
}

function unwrapParens(typeStr) {
  const s = typeStr.trim();
  if (!s.startsWith('(')) return s;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth += 1;
    else if (s[i] === ')') {
      depth -= 1;
      if (depth === 0) {
        if (i === s.length - 1) return s.slice(1, -1).trim();
        break;
      }
    }
  }
  return s;
}

function splitParameterType(typeStr) {
  const s = typeStr.trim();
  if (!s.length) return null;

  if (s[0] === '{') {
    let depth = 0;
    let i = 0;
    for (; i < s.length; i++) {
      if (s[i] === '{') depth += 1;
      else if (s[i] === '}') {
        depth -= 1;
        if (depth === 0) { i += 1; break; }
      }
    }
    const rest = s.slice(i).trim();
    const arrow = splitArrowType(rest);
    if (!arrow) return null;
    return {
      domain: `${s.slice(0, i).trim()} ${arrow.domain}`.trim(),
      codomain: arrow.codomain,
    };
  }

  if (s[0] === '(') {
    let depth = 0;
    let i = 0;
    for (; i < s.length; i++) {
      if (s[i] === '(') depth += 1;
      else if (s[i] === ')') {
        depth -= 1;
        if (depth === 0) { i += 1; break; }
      }
    }
    let rest = s.slice(i).trim();
    if (rest.startsWith('->')) rest = rest.slice(2).trim();
    else if (rest.startsWith('→')) rest = rest.slice(1).trim();
    else if (rest.startsWith('<-')) rest = rest.slice(2).trim();
    if (!rest.length) return splitParameterType(s.slice(1, i - 1).trim());
    return { domain: s.slice(0, i).trim(), codomain: rest };
  }

  return splitArrowType(s);
}

function domainAtArrowIndex(typeStr, index) {
  let cur = unwrapParens(typeStr.trim());
  for (let i = 0; i < index; i++) {
    const split = splitParameterType(cur);
    if (!split) return null;
    cur = unwrapParens(split.codomain);
  }
  const split = splitParameterType(cur);
  return split ? split.domain : cur;
}

function peelDependentArrows(typeStr, count) {
  let cur = unwrapParens(typeStr.trim());
  for (let i = 0; i < count; i++) {
    if (cur.startsWith('↦')) return cur;
    const split = splitParameterType(cur);
    if (!split) break;
    cur = unwrapParens(split.codomain);
    if (cur.startsWith('↦')) return cur;
  }
  return cur || null;
}

function stripContextualWrapper(typeStr) {
  const s = typeStr.trim();
  if (!s.startsWith('[') || !s.endsWith(']')) return s;
  const inner = s.slice(1, -1).trim();
  const turn = inner.search(/[|⊢\-]/);
  if (turn < 0) return inner;
  const after = inner.slice(turn + 1).replace(/^[\s|⊢\-]+/, '').trim();
  return after || inner;
}

function patternAnnotationType(ident, doc) {
  for (let p = ident.parent; p; p = p.parent) {
    if (p.name !== 'CaseBranch') continue;
    let patternNode = null;
    let annType = null;
    for (let c = p.firstChild; c; c = c.nextSibling) {
      if (c.name !== 'Pattern') continue;
      patternNode = c;
      let pastColon = false;
      for (let pc = c.firstChild; pc; pc = pc.nextSibling) {
        if (pc.name === ':') { pastColon = true; continue; }
        if (pastColon && (pc.name === 'CompType' || pc.name === 'ContextualType' || pc.name === 'LFType')) {
          annType = pc;
        }
      }
    }
    if (!patternNode || !annType) continue;
    if (ident.from < patternNode.from || ident.to > patternNode.to) continue;
    let inObjectTerm = false;
    for (let q = ident.parent; q && q.from >= patternNode.from && q.to <= patternNode.to; q = q.parent) {
      if (q.name === 'ContextPart' || q.name === 'ContextHead') break;
      if (q.name === 'LFTerm' || q.name === 'ContextualObject') { inObjectTerm = true; break; }
    }
    if (!inObjectTerm) continue;
    return stripContextualWrapper(sliceText(doc, annType.from, annType.to));
  }
  return null;
}

function lambdaDepthInSpan(span, ident) {
  let depth = 0;
  for (let p = ident.parent; p && p.from >= span.from && p.to <= span.to; p = p.parent) {
    if (p.name !== 'LFLambda') continue;
    const binder = p.firstChild;
    const body = binder && binder.nextSibling;
    if (body && ident.from >= body.from && ident.to <= body.to) depth += 1;
  }
  return depth;
}

function implicitBinderInTypePrefix(typeStr, name) {
  let rest = typeStr.trim();
  while (rest.length) {
    const open = rest[0];
    if (open !== '(' && open !== '{') break;
    const close = open === '(' ? ')' : '}';
    let i = 1;
    while (i < rest.length && /\s/.test(rest[i])) i += 1;
    const nameStart = i;
    while (i < rest.length && rest[i] !== ':' && rest[i] !== close) i += 1;
    const binderName = rest.slice(nameStart, i).trim();
    if (!binderName || rest[i] !== ':') break;
    i += 1;
    while (i < rest.length && /\s/.test(rest[i])) i += 1;
    const typeStart = i;
    let depth = 1;
    while (i < rest.length && depth > 0) {
      const ch = rest[i];
      if (ch === open) depth += 1;
      else if (ch === close) depth -= 1;
      i += 1;
    }
    if (depth !== 0) break;
    const binderType = rest.slice(typeStart, i - 1).trim();
    if (binderName === name) return binderType;
    rest = rest.slice(i).trim();
  }
  return null;
}

function implicitTypeFromDeclSignature(tree, doc, ident) {
  const encl = findEnclosingGlobalDecl(ident);
  if (!encl) return null;
  const enclIdent = firstIdentChild(encl);
  if (!enclIdent || enclIdent === ident) return null;
  const sig = sourceSignatureForGlobal(encl, enclIdent, doc);
  if (!sig) return null;
  const name = doc.sliceString(ident.from, ident.to);
  return implicitBinderInTypePrefix(sig, name);
}

function inferImplicitFromTypeApp(tree, doc, ident) {
  const app = innermostTypeAppForIdent(ident);
  if (!app) return null;
  const argIndex = argIndexInTypeApp(ident);
  if (argIndex == null) return null;

  const head = headIdentOfTypeApp(app);
  if (!head) return null;
  const headName = doc.sliceString(head.from, head.to);
  const decl = findGlobalDeclarationIdent(tree, doc, headName, head.name === 'UpperIdentifier');
  if (!decl) return null;

  const sig = sourceSignatureForGlobal(decl.declParent, decl.ident, doc);
  if (!sig) return null;

  return domainAtArrowIndex(sig, argIndex) || null;
}

function inferImplicitFromTermApp(tree, doc, ident) {
  const app = innermostTermAppForIdent(ident);
  if (!app) return null;
  const argIndex = argIndexInTermApp(ident);
  if (argIndex == null) return null;

  const head = headIdentOfTermApp(app);
  if (!head) return null;
  const headName = doc.sliceString(head.from, head.to);
  const headDecl = findGlobalDeclarationIdent(tree, doc, headName, head.name === 'UpperIdentifier');
  if (!headDecl) return null;

  const sig = sourceSignatureForGlobal(headDecl.declParent, headDecl.ident, doc);
  if (!sig) return null;

  const domain = domainAtArrowIndex(sig, argIndex);
  if (!domain) return null;

  const arg = termAppArgChild(app);
  const depth = arg ? lambdaDepthInSpan(arg, ident) : 0;
  return depth > 0 ? peelDependentArrows(domain, depth) : domain;
}

function inferImplicitArgType(tree, doc, ident) {
  return inferImplicitFromTypeApp(tree, doc, ident)
    || inferImplicitFromTermApp(tree, doc, ident)
    || patternAnnotationType(ident, doc)
    || implicitTypeFromDeclSignature(tree, doc, ident);
}

function lfTermIsBareIdent(termNode) {
  let app = null;
  for (let c = termNode.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LFAppTerm') app = c;
  }
  if (!app) return false;
  for (let c = app.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LFAppTerm') return false;
  }
  return true;
}

function ascribedTypeForIdent(ident, doc) {
  for (let p = ident.parent; p; p = p.parent) {
    if (p.name !== 'LFAtomicTerm') continue;
    let termPart = null, typePart = null, hasColon = false;
    for (let c = p.firstChild; c; c = c.nextSibling) {
      if (c.name === 'LFTerm' && !termPart) termPart = c;
      else if (c.name === ':') hasColon = true;
      else if (c.name === 'LFType') typePart = c;
    }
    if (!hasColon || !termPart || !typePart) continue;
    if (ident.from < termPart.from || ident.to > termPart.to) continue;
    if (!lfTermIsBareIdent(termPart)) return null;
    return sliceText(doc, typePart.from, typePart.to) || null;
  }
  return null;
}

function findEnclosingGlobalDecl(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (GLOBAL_DECL_PARENT.has(p.name)) return p;
  }
  return null;
}

function classifyAsBinderSite(ident) {
  const p = ident.parent;
  if (!p) return null;
  const pname = p.name;

  if (GLOBAL_DECL_PARENT.has(pname) && firstIdentChild(p) === ident) {
    return { kind: 'decl-global', declParent: p };
  }

  if (LOCAL_BINDER_INLINE_TYPE.has(pname)) {
    if (pname === 'SchemaSomeBindings' || firstIdentChild(p) === ident) {
      return { kind: 'binder-inline', binderParent: p };
    }
  }

  if (LOCAL_BINDER_OUTER_TYPE.has(pname)) {
    return { kind: 'binder-outer', binderParent: p };
  }

  if (LOCAL_BINDER_BARE.has(pname)) {
    return { kind: 'binder-bare', binderParent: p };
  }

  return null;
}

function fallbackForGlobal(declParent, ident, doc) {
  const dname = declParent.name;
  const name = doc.sliceString(ident.from, ident.to);
  if (!name) return null;

  if (dname === 'RecBody') {
    return { kind: 'fsig', name };
  }
  if (dname === 'CompConstructor') {
    const body = declParent.parent;
    if (!body || body.name !== 'InductiveBody') return null;
    const parentId = firstIdentChild(body);
    if (!parentId) return null;
    const parentName = doc.sliceString(parentId.from, parentId.to);
    if (!parentName) return null;
    return { kind: 'comp-ctor', parent: parentName, ctor: name };
  }
  if (dname === 'InductiveBody') {
    const kindNode = nextTypeSibling(ident);
    if (!kindNode) return null;
    return { kind: 'inline-kind', text: sliceText(doc, kindNode.from, kindNode.to) };
  }
  if (dname === 'TypedefDeclaration') {
    const ty = nextTypeSibling(ident);
    if (!ty) return null;
    return { kind: 'inline-kind', text: sliceText(doc, ty.from, ty.to) };
  }
  return null;
}

export function referenceKind(tree, doc, from) {
  const ident = identAt(tree, from);
  if (!ident) return null;

  const name = doc.sliceString(ident.from, ident.to);
  if (!name) return null;

  const cls = classifyAsBinderSite(ident);
  if (cls?.kind === 'decl-global') return 'global';
  if (cls?.kind === 'binder-inline' || cls?.kind === 'binder-outer' || cls?.kind === 'binder-bare') {
    return 'local';
  }
  if (ascribedTypeForIdent(ident, doc)) return 'local';
  if (findEnclosingLocalBinder(ident, doc, name) !== null) return 'local';

  const isUpper = ident.name === 'UpperIdentifier';
  if (findGlobalDeclarationIdent(tree, doc, name, isUpper)) return 'global';

  const encl = findEnclosingGlobalDecl(ident);
  if (encl) {
    const enclIdent = firstIdentChild(encl);
    if (enclIdent && enclIdent !== ident) return 'implicit';
  }

  return 'unbound';
}

export function resolveHoverDoc(tree, doc, from) {
  const ident = identAt(tree, from);
  if (!ident) return null;

  const name = doc.sliceString(ident.from, ident.to);
  if (!name) return null;
  const displayName = extendedNameOf(ident, doc);

  const cls = classifyAsBinderSite(ident);

  if (cls && cls.kind === 'decl-global') {
    const { line, col } = lineColAt(doc, ident.from);
    const sourceText = sourceSignatureForGlobal(cls.declParent, ident, doc);
    return {
      kind: 'global',
      line, col,
      name, displayName,
      declParent: cls.declParent.name,
      label: globalLabel(cls.declParent),
      sourceText,
      sourceType: sourceText,
      fallback: fallbackForGlobal(cls.declParent, ident, doc),
    };
  }

  if (cls && cls.kind === 'binder-inline') {
    const ty = nextTypeSibling(ident);
    const innerTo = ty ? ty.to : cls.binderParent.to;
    const innerFrom = cls.binderParent.from;
    const text = widenToBracket(doc, innerFrom, innerTo);
    const sourceType = ty ? sliceText(doc, ty.from, ty.to) : null;
    return { kind: 'local', text, name, displayName, label: localLabel(cls.binderParent), sourceType };
  }

  if (cls && cls.kind === 'binder-outer') {
    const ty = nextTypeSibling(cls.binderParent);
    const innerFrom = cls.binderParent.from;
    const innerTo = ty ? ty.to : cls.binderParent.to;
    const text = widenToBracket(doc, innerFrom, innerTo);
    const sourceType = ty ? sliceText(doc, ty.from, ty.to) : null;
    return { kind: 'local', text, name, displayName, label: localLabel(cls.binderParent), sourceType };
  }

  if (cls && cls.kind === 'binder-bare') {
    return { kind: 'local', text: null, name, displayName, label: localLabel(cls.binderParent) };
  }

  const ascribed = ascribedTypeForIdent(ident, doc);
  if (ascribed) {
    return {
      kind: 'local',
      text: ascribed,
      sourceType: ascribed,
      name, displayName,
      label: 'Binding',
    };
  }

  const local = findEnclosingLocalBinder(ident, doc, name);
  if (local !== null) {
    return {
      kind: 'local',
      text: local.text ? local.text : null,
      sourceType: local.text ? local.text : null,
      name, displayName,
      label: LOCAL_BINDER_LABEL[local.binderKind] || 'Local Binding',
    };
  }

  const isUpper = ident.name === 'UpperIdentifier';
  const decl = findGlobalDeclarationIdent(tree, doc, name, isUpper);
  if (decl) {
    const { line, col } = lineColAt(doc, ident.from);
    const sourceText = sourceSignatureForGlobal(decl.declParent, decl.ident, doc);
    return {
      kind: 'global',
      line, col,
      name, displayName,
      declParent: decl.declParent.name,
      label: globalLabel(decl.declParent),
      sourceText,
      sourceType: sourceText,
      fallback: fallbackForGlobal(decl.declParent, decl.ident, doc),
    };
  }

  const encl = findEnclosingGlobalDecl(ident);
  if (encl) {
    const enclIdent = firstIdentChild(encl);
    if (enclIdent && enclIdent !== ident) {
      const { line, col } = lineColAt(doc, ident.from);
      const enclDeclName = doc.sliceString(enclIdent.from, enclIdent.to);
      const sourceType = inferImplicitArgType(tree, doc, ident);
      return {
        kind: 'implicit',
        line, col,
        name, displayName,
        label: 'Implicit Binder',
        sourceType,
        needsElaboration: !sourceType,
        owningDeclaration: enclDeclName,
        owningDeclNode: encl,
      };
    }
  }

  return null;
}

export function resolveHover(state, from) {
  return resolveHoverDoc(syntaxTree(state), state.doc, from);
}

export function isHoverableIdent(state, pos) {
  return identAt(syntaxTree(state), pos) != null;
}
