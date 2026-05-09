import {
  align,
  blankline,
  concat,
  empty,
  group,
  hardline,
  join,
  line,
  nest,
  render,
  softline,
  space,
  text,
} from './doc.mjs';
import { children, childrenArr, firstOfType, txt } from './tree.mjs';

export function makePrinter(src) {
  const verbatim = (node) => text(src.slice(node.from, node.to));

  function sliceNormalized(from, to, trimEnds = false) {
    const raw = src.slice(from, to);
    if (raw.includes('%')) return trimEnds ? raw.trim() : raw;
    const collapsed = raw.replace(/\s+/g, ' ');
    return trimEnds ? collapsed.trim() : collapsed;
  }

  function pp(node) {
    const fn = rules[node.name];
    if (fn) return fn(node);
    return verbatim(node);
  }

  const rules = {
    LFDeclaration(node) {
      const id = firstOfType(node, 'LowerIdentifier');
      const ty = firstOfType(node, 'LFKind') || firstOfType(node, 'LFType');
      return concat(text(txt(id, src)), text(' : '), group(nest(2, ppType(ty))), text('.'));
    },

    LFDatatypeDeclaration(node) {
      const kw = firstOfType(node, 'LFKeyword') || firstOfType(node, 'DatatypeKeyword');
      const id = firstOfType(node, 'LowerIdentifier');
      const kind = firstOfType(node, 'LFKind');
      const ctors = childrenArr(node).filter((c) => c.name === 'LFConstructor');

      const header = concat(
        text(txt(kw, src)),
        space,
        text(txt(id, src)),
        text(' : '),
        kind ? ppKind(kind) : empty,
        text(' ='),
      );

      const body =
        ctors.length === 0
          ? empty
          : concat(
              hardline,
              text('  '),
              join(
                concat(hardline, text('  ')),
                ctors.map((c) => concat(text('| '), ppCtor(c))),
              ),
            );

      return concat(header, body, hardline, text(';'));
    },

    InductiveDeclaration: (node) => ppInductive(node, 'inductive'),
    StratifiedDeclaration: (node) => ppInductive(node, 'stratified'),

    SchemaDeclaration(node) {
      const id = firstOfType(node, 'LowerIdentifier');
      const body = firstOfType(node, 'SchemaBody');
      return concat(text('schema '), text(txt(id, src)), text(' = '), body ? align(ppSchemaBody(body)) : empty, text(';'));
    },

    TypedefDeclaration(node) {
      const id = firstOfType(node, 'LowerIdentifier') || firstOfType(node, 'UpperIdentifier');
      const kind = firstOfType(node, 'CompKind');
      const ty = firstOfType(node, 'CompType');
      return concat(
        text('typedef '),
        text(txt(id, src)),
        text(' : '),
        kind ? ppKind(kind) : empty,
        text(' ='),
        line,
        nest(2, ty ? ppType(ty) : empty),
        text(';'),
      );
    },

    RecDeclaration(node) {
      const bodies = childrenArr(node).filter((c) => c.name === 'RecBody');
      const parts = bodies.map((b, i) => concat(i === 0 ? text('rec ') : text('and '), ppRecBody(b)));
      return concat(join(hardline, parts), text(';'));
    },

    LetDeclaration(node) {
      const id = firstOfType(node, 'LowerIdentifier');
      const ty = firstOfType(node, 'CompType');
      const exprs = childrenArr(node).filter((c) => c.name === 'Expression');
      const expr = exprs[0];
      return concat(
        text('let '),
        text(txt(id, src)),
        ty ? concat(text(' : '), ppType(ty)) : empty,
        text(' = '),
        expr ? group(nest(2, concat(softline, ppExpr(expr)))) : empty,
        text(';'),
      );
    },

    ModuleDeclaration(node) {
      const name = firstOfType(node, 'UpperIdentifier');
      const decls = childrenArr(node).filter((c) => c.name === 'Declaration');
      const inner =
        decls.length === 0 ? empty : concat(hardline, join(blankline, decls.map(pp)));
      return concat(text('module '), text(txt(name, src)), text(' = struct'), nest(2, inner), hardline, text('end;'));
    },

    OpenPragma: (n) => normalisePragma(n),
    AbbrevPragma: (n) => normalisePragma(n),
    NamePragma: (n) => normalisePragma(n),
    InfixPragma: (n) => normalisePragma(n),
    PrefixPragma: (n) => normalisePragma(n),
    AssocPragma: (n) => normalisePragma(n),
    NotPragma: (n) => normalisePragma(n),
    NoStrengthenPragma: (n) => normalisePragma(n),
    OpaquePragma: (n) => normalisePragma(n),
    CoveragePragma: (n) => normalisePragma(n),
    WarnCoveragePragma: (n) => normalisePragma(n),
    QueryPragma: (n) => normalisePragma(n),

    LFConstructor: (node) => ppCtor(node),
    CompConstructor: (node) => ppCtor(node),
    RecBody: (node) => ppRecBody(node),

    LFKind: (n) => ppKind(n),
    LFType: (n) => ppType(n),
    CompKind: (n) => ppKind(n),
    CompType: (n) => ppType(n),

    LFTerm: (n) => ppTerm(n),
    LFAppTerm: (n) => ppTerm(n),
    LFAtomicTerm: (n) => ppTerm(n),

    Expression: (n) => ppExpr(n),

    ContextualType: (n) => ppContextual(n, 'type'),
    ContextualObject: (n) => ppContextual(n, 'term'),
  };

  function ppInductive(node, kw) {
    const bodies = childrenArr(node).filter((c) => c.name === 'InductiveBody');
    const parts = bodies.map((b, i) => concat(i === 0 ? text(`${kw} `) : text('and '), ppInductiveBody(b)));
    return concat(join(hardline, parts), text(';'));
  }

  function ppInductiveBody(node) {
    const id = firstOfType(node, 'UpperIdentifier');
    const kind = firstOfType(node, 'CompKind');
    const ctors = childrenArr(node).filter((c) => c.name === 'CompConstructor');
    const header = concat(text(txt(id, src)), text(' : '), kind ? ppKind(kind) : empty, text(' ='));
    const body =
      ctors.length === 0
        ? empty
        : concat(
            hardline,
            text('  '),
            join(
              concat(hardline, text('  ')),
              ctors.map((c) => concat(text('| '), ppCtor(c))),
            ),
          );
    return concat(header, body);
  }

  function ppCtor(node) {
    const id = firstOfType(node, 'LowerIdentifier') || firstOfType(node, 'UpperIdentifier');
    const ty = firstOfType(node, 'LFType') || firstOfType(node, 'CompType');
    return concat(text(txt(id, src)), text(' : '), group(nest(4, ty ? ppType(ty) : empty)));
  }

  function ppRecBody(node) {
    const id = firstOfType(node, 'LowerIdentifier');
    const ty = firstOfType(node, 'CompType');
    const expr = firstOfType(node, 'Expression');
    return concat(
      text(txt(id, src)),
      text(' : '),
      ty ? group(nest(4, ppType(ty))) : empty,
      text(' ='),
      hardline,
      text('  '),
      expr ? align(ppExpr(expr)) : empty,
    );
  }

  function ppSchemaBody(node) {
    const elts = childrenArr(node).filter((c) => c.name === 'SchemaElement');
    return join(text(' + '), elts.map(verbatimNormalised));
  }

  function verbatimNormalised(node) {
    return text(sliceNormalized(node.from, node.to, true));
  }

  function ppKind(node) {
    return ppTypeLike(node);
  }
  function ppType(node) {
    return ppTypeLike(node);
  }

  function ppTypeLike(node) {
    if (!node.firstChild) return text(txt(node, src));

    const parts = [];
    let prevAtomic = false;

    const isAtomic = (c) =>
      c.name === 'LowerIdentifier' ||
      c.name === 'UpperIdentifier' ||
      c.name === 'LFAtomicType' ||
      c.name === 'LFAppType' ||
      c.name === 'LFType' ||
      c.name === 'LFKind' ||
      c.name === 'CompAtomicType' ||
      c.name === 'CompAppType' ||
      c.name === 'CompType' ||
      c.name === 'CompKind' ||
      c.name === 'CompTypeBinder' ||
      c.name === 'LFAtomicTerm' ||
      c.name === 'LFAppTerm' ||
      c.name === 'CompTypeArg' ||
      c.name === 'ContextualType' ||
      c.name === 'ContextualObject';

    for (const c of children(node)) {
      let piece = null;
      switch (c.name) {
        case 'ArrowOp':
          parts.push(line, text(txt(c, src)), space);
          prevAtomic = false;
          continue;
        case '{':
        case '(':
          parts.push(text(txt(c, src)));
          prevAtomic = false;
          continue;
        case '}':
        case ')':
          parts.push(text(txt(c, src)));
          prevAtomic = true;
          continue;
        case ':':
          parts.push(text(' : '));
          prevAtomic = false;
          continue;
        case ',':
          parts.push(text(', '));
          prevAtomic = false;
          continue;
        case 'TypeKeyword':
        case 'CTypeKeyword':
          if (prevAtomic) parts.push(space);
          parts.push(text(txt(c, src)));
          prevAtomic = true;
          continue;
        case 'LFType':
        case 'LFKind':
        case 'LFAppType':
        case 'LFAtomicType':
        case 'CompType':
        case 'CompKind':
        case 'CompAppType':
        case 'CompAtomicType':
        case 'CompTypeBinder':
        case 'CompTypeArg':
          piece = ppTypeLike(c);
          break;
        case 'ContextualType':
        case 'ContextualObject':
          piece = ppContextual(c, c.name === 'ContextualType' ? 'type' : 'term');
          break;
        default:
          piece = text(sliceNormalized(c.from, c.to));
      }
      if (prevAtomic && isAtomic(c)) parts.push(space);
      parts.push(piece);
      prevAtomic = isAtomic(c);
    }
    return group(concat(...parts));
  }

  function ppTerm(node) {
    if (node.name === 'LFLambda') {
      const binder = firstOfType(node, 'LFLambdaBinder');
      const body = node.lastChild;
      return concat(binder ? text(txt(binder, src)) : empty, text('. '), body && body !== binder ? ppTerm(body) : empty);
    }
    const parts = [];
    let prev = null;
    for (const c of children(node)) {
      if (prev && needsSpace(prev, c)) parts.push(space);
      parts.push(termPiece(c));
      prev = c;
    }
    return concat(...parts);
  }

  function termPiece(c) {
    switch (c.name) {
      case '(':
      case ')':
      case '[':
      case ']':
      case '.':
      case ',':
        return text(txt(c, src));
      case 'LFLambda':
        return ppTerm(c);
      case 'LFTerm':
      case 'LFAppTerm':
      case 'LFAtomicTerm':
        return ppTerm(c);
      default:
        return text(txt(c, src));
    }
  }

  function needsSpace(prev, next) {
    if (next.name === ')' || next.name === ']' || next.name === ',' || next.name === '.') return false;
    if (prev.name === '(' || prev.name === '[') return false;
    return true;
  }

  function ppExpr(node) {
    if (node.name === 'Expression' && node.firstChild && !node.firstChild.nextSibling) return ppExpr(node.firstChild);

    if (node.name === 'CaseExpression') return ppCase(node);
    if (node.name === 'FnExpression') return ppFn(node);
    if (node.name === 'MLamExpression') return ppMLam(node);
    if (node.name === 'LetExpression') return ppLet(node);
    if (node.name === 'IfExpression') return ppIf(node);
    if (node.name === 'ImpossibleExpression') return concat(text('impossible '), ppExpr(node.lastChild));

    const parts = [];
    let prev = null;
    for (const c of children(node)) {
      if (prev && needsSpace(prev, c)) parts.push(line);
      parts.push(exprPiece(c));
      prev = c;
    }
    return group(concat(...parts));
  }

  function exprPiece(c) {
    switch (c.name) {
      case 'Expression':
      case 'AppExpression':
      case 'AtomicExpression':
        return ppExpr(c);
      case 'ContextualObject':
        return ppContextual(c, 'term');
      case 'ContextualType':
        return ppContextual(c, 'type');
      case '(':
      case ')':
      case '[':
      case ']':
      case ',':
      case ';':
        return text(txt(c, src));
      default:
        return text(txt(c, src));
    }
  }

  function ppCase(node) {
    const exprs = childrenArr(node).filter((c) => c.name === 'Expression');
    const scrutinee = exprs[0];
    const body = firstOfType(node, 'CaseBody');
    const branches = body ? childrenArr(body).filter((c) => c.name === 'CaseBranch') : [];
    const branchDocs = branches.map((b) => concat(hardline, text('| '), ppBranch(b)));
    return concat(text('case '), scrutinee ? ppExpr(scrutinee) : empty, text(' of'), nest(2, concat(...branchDocs)));
  }

  function ppBranch(node) {
    const pat = firstOfType(node, 'Pattern');
    const expr = firstOfType(node, 'Expression');
    return concat(pat ? ppPattern(pat) : empty, text(' => '), expr ? group(nest(4, ppExpr(expr))) : empty);
  }

  function ppPattern(node) {
    if (!node.firstChild) return text(txt(node, src));

    const parts = [];
    let prev = null;
    for (const c of children(node)) {
      let piece;
      switch (c.name) {
        case 'ContextualObject':
          piece = ppContextual(c, 'term');
          break;
        case 'ContextualType':
          piece = ppContextual(c, 'type');
          break;
        case 'Pattern':
        case 'AppPattern':
        case 'AtomicPattern':
        case 'TupleOrParenPattern':
          piece = ppPattern(c);
          break;
        case '(':
        case ')':
        case '[':
        case ']':
        case ',':
          piece = text(txt(c, src));
          break;
        default:
          piece = text(sliceNormalized(c.from, c.to));
      }
      if (prev && needsSpace(prev, c)) parts.push(space);
      parts.push(piece);
      prev = c;
    }
    return concat(...parts);
  }

  function ppFn(node) {
    const params = childrenArr(node).filter((c) => c.name === 'FnParam');
    const body = firstOfType(node, 'Expression');
    return concat(text('fn '), join(space, params.map((p) => text(txt(p, src)))), text(' => '), body ? ppExpr(body) : empty);
  }

  function ppMLam(node) {
    const kw = firstOfType(node, 'MLamKeyword') || firstOfType(node, 'FNKeyword');
    const params = childrenArr(node).filter((c) => c.name === 'MLamParam');
    const body = firstOfType(node, 'Expression');
    return concat(
      text(`${txt(kw, src)} `),
      join(space, params.map((p) => text(txt(p, src)))),
      text(' => '),
      body ? ppExpr(body) : empty,
    );
  }

  function ppLet(node) {
    const pat = firstOfType(node, 'Pattern');
    const exprs = childrenArr(node).filter((c) => c.name === 'Expression');
    return concat(
      text('let '),
      pat ? ppPattern(pat) : empty,
      text(' = '),
      exprs[0] ? ppExpr(exprs[0]) : empty,
      text(' in '),
      exprs[1] ? ppExpr(exprs[1]) : empty,
    );
  }

  function ppIf(node) {
    const exprs = childrenArr(node).filter((c) => c.name === 'Expression');
    return concat(
      text('if '),
      exprs[0] ? ppExpr(exprs[0]) : empty,
      text(' then '),
      exprs[1] ? ppExpr(exprs[1]) : empty,
      text(' else '),
      exprs[2] ? ppExpr(exprs[2]) : empty,
    );
  }

  function ppContextual(node, _kind) {
    const parts = [];
    for (const c of children(node)) {
      if (c.name === '[' || c.name === ']') continue;
      if (c.name === 'Turnstile') {
        if (parts.length > 0) parts.push(' ');
        parts.push(txt(c, src));
        parts.push(' ');
        continue;
      }
      if (c.name === 'ContextPart') {
        parts.push(sliceNormalized(c.from, c.to, true));
        continue;
      }
      if (c.name === 'LFType' || c.name === 'LFTerm') {
        parts.push(render(ppTypeLike(c), 1e9));
        continue;
      }
      parts.push(sliceNormalized(c.from, c.to));
    }
    return concat(text('[ '), text(parts.join('').trim()), text(' ]'));
  }

  function normalisePragma(node) {
    return text(sliceNormalized(node.from, node.to, true));
  }

  return { pp };
}
