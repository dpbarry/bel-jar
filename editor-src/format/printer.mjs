import {
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
import { splitCompRecPrefix } from './comp-prefix.mjs';
import { layoutArrowChain, layoutPrefixChain, layoutStack, measureDoc } from './layout.mjs';
import {
  formatContextualProofScript,
  formatMultilineExprSticky,
  reindentStickyBlock,
} from './proof-script.mjs';
import { mergeStyle } from './style.mjs';
import { children, childrenArr, firstOfType, txt } from './tree.mjs';

export function makePrinter(src, opts = {}) {
  const printWidth = opts.printWidth ?? 80;
  const style = mergeStyle(opts.style);
  const segmentLayoutWidth = 1e9;
  const verbatim = (node) => text(src.slice(node.from, node.to));

  function sliceNormalized(from, to, trimEnds = false) {
    const raw = src.slice(from, to);
    if (raw.includes('%')) return trimEnds ? raw.trim() : raw;
    const collapsed = raw.replace(/[ \t]+/g, ' ');
    return trimEnds ? collapsed.trim() : collapsed;
  }

  function subtreeHasError(node) {
    const lo = node.from;
    const hi = node.to;
    let bad = false;
    node.cursor().iterate((n) => {
      if (n.type.isError && n.from >= lo && n.to <= hi) bad = true;
    });
    return bad;
  }

  function pp(node) {
    const fn = rules[node.name];
    if (fn) return fn(node);
    return verbatim(node);
  }

  function declSemicolon() {
    return concat(hardline, text(';'));
  }

  const rules = {
    LFDeclaration(node) {
      const id = node.firstChild?.name === 'LowerIdentifier' ? node.firstChild : firstOfType(node, 'LowerIdentifier');
      const ty = firstOfType(node, 'LFKind') || firstOfType(node, 'LFType');
      if (!id || !ty) return verbatim(node);
      const head = `${txt(id, src)} : `;
      const laid = lfArrowChainLayout(head, ty, { terminator: '.', widthSlack: 1 });
      if (laid) return laid;
      return concat(text(head), ppTypeLike(ty), text('.'));
    },

    LFDatatypeDeclaration(node) {
      return ppLFDatatypeGroup(node);
    },

    InductiveDeclaration: (node) => ppInductive(node, 'inductive'),
    StratifiedDeclaration: (node) => ppInductive(node, 'stratified'),

    SchemaDeclaration(node) {
      return ppSchemaDecl(node);
    },

    TypedefDeclaration(node) {
      return ppTypedefDecl(node);
    },

    RecDeclaration(node) {
      return ppRecGroup(node);
    },

    LetDeclaration(node) {
      return ppLetDecl(node);
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

  function ppComment(node) {
    return concat(hardline, verbatim(node));
  }

  function ppInlineComment(node) {
    return concat(space, verbatim(node));
  }

  function isTypeFamilyId(node) {
    return node.name === 'LowerIdentifier' || node.name === 'UpperIdentifier';
  }

  function ppCtorListBody(bodyItems) {
    if (bodyItems.length === 0) return empty;
    const docs = bodyItems.map((item) => {
      if (item.type === 'comment') return verbatim(item.node);
      if (item.type === 'raw') return item.doc;
      return concat(text('| '), ppCtor(item.node));
    });
    return concat(hardline, text('  '), join(concat(hardline, text('  ')), docs));
  }

  function pushSegmentComment(c, equalsEnd, afterEquals, bodyItems) {
    if (bodyItems.length === 0 && equalsEnd != null && !src.slice(equalsEnd, c.from).includes('\n')) {
      afterEquals.push(ppInlineComment(c));
      return;
    }
    bodyItems.push({ type: 'comment', node: c });
  }

  function ppLFDatatypeSegment(id, kind, afterEquals, bodyItems) {
    const header = concat(
      text(txt(id, src)),
      text(' : '),
      kind ? ppKind(kind) : empty,
      text(' ='),
      ...afterEquals,
    );
    return concat(header, ppCtorListBody(bodyItems));
  }

  function readLFDatatypeSegment(children, start) {
    const id = children[start];
    let kind = null;
    let equalsEnd = null;
    const afterEquals = [];
    const bodyItems = [];
    let i = start + 1;
    while (i < children.length) {
      const c = children[i];
      if (c.name === 'AndKeyword' || c.name === ';' || isTypeFamilyId(c)) break;
      if (c.name === 'LFKind') {
        kind = c;
        i++;
        continue;
      }
      if (c.name === '=') {
        equalsEnd = c.to;
        i++;
        continue;
      }
      if (c.name === ':' || c.name === '|') {
        i++;
        continue;
      }
      if (c.name === 'LFConstructor') {
        bodyItems.push({ type: 'ctor', node: c });
        i++;
        continue;
      }
      if (c.name === 'LineComment' || c.name === 'BlockComment') {
        pushSegmentComment(c, equalsEnd, afterEquals, bodyItems);
        i++;
        continue;
      }
      if (bodyItems.length === 0) afterEquals.push(verbatim(c));
      else bodyItems.push({ type: 'raw', doc: verbatim(c) });
      i++;
    }
    return { doc: ppLFDatatypeSegment(id, kind, afterEquals, bodyItems), next: i };
  }

  function ppLFDatatypeGroup(node) {
    const children = childrenArr(node);
    const kw = firstOfType(node, 'LFKeyword') || firstOfType(node, 'DatatypeKeyword');
    if (!kw) return verbatim(node);
    const parts = [text(txt(kw, src)), space];
    let i = 0;
    while (i < children.length) {
      const c = children[i];
      if (c.name === ';') break;
      if (c.name === 'LFKeyword' || c.name === 'DatatypeKeyword') {
        i++;
        continue;
      }
      if (c.name === 'AndKeyword') {
        parts.push(hardline, text('and '));
        i++;
        continue;
      }
      if (isTypeFamilyId(c)) {
        const segment = readLFDatatypeSegment(children, i);
        parts.push(segment.doc);
        i = segment.next;
        continue;
      }
      if (c.name === 'LineComment' || c.name === 'BlockComment') {
        parts.push(ppComment(c));
        i++;
        continue;
      }
      if (c.name === ':' || c.name === '=' || c.name === '|') {
        i++;
        continue;
      }
      parts.push(verbatim(c));
      i++;
    }
    return concat(...parts, text('\n;'));
  }

  function ppSchemaDecl(node) {
    const parts = [text('schema ')];
    let id = null;
    let body = null;
    for (const c of childrenArr(node)) {
      if (c.name === ';') continue;
      if (c.name === 'SchemaKeyword') continue;
      if (c.name === 'LowerIdentifier') {
        id = c;
        parts.push(text(txt(c, src)));
        continue;
      }
      if (c.name === '=') {
        parts.push(text(' = '));
        continue;
      }
      if (c.name === 'SchemaBody') {
        body = c;
        parts.push(hardline, nest(style.indent, ppSchemaBody(c)));
        continue;
      }
      if (c.name === 'LineComment' || c.name === 'BlockComment') {
        parts.push(ppInlineComment(c));
        continue;
      }
      parts.push(verbatim(c));
    }
    if (!id) return verbatim(node);
    if (!body && parts.length <= 2) return verbatim(node);
    return concat(...parts, declSemicolon());
  }

  function ppTypedefDecl(node) {
    let id = null;
    let kind = null;
    let ty = null;
    const afterEquals = [];
    for (const c of childrenArr(node)) {
      if (c.name === 'TypedefKeyword' || c.name === ';' || c.name === ':' || c.name === '=') continue;
      if (!id && isTypeFamilyId(c)) {
        id = c;
        continue;
      }
      if (c.name === 'CompKind') {
        kind = c;
        continue;
      }
      if (c.name === 'CompType') {
        ty = c;
        continue;
      }
      if (c.name === 'LineComment' || c.name === 'BlockComment') {
        afterEquals.push(
          src.lastIndexOf('\n', c.from) > src.lastIndexOf('=', c.from) ? ppComment(c) : ppInlineComment(c),
        );
        continue;
      }
    }
    if (!id || !ty) return verbatim(node);
    return concat(
      text('typedef '),
      text(txt(id, src)),
      text(' : '),
      kind ? ppKind(kind) : empty,
      text(' ='),
      ...afterEquals,
      line,
      group(nest(style.indent, ppType(ty))),
      declSemicolon(),
    );
  }

  function ppLetDecl(node) {
    const parts = [text('let ')];
    let id = null;
    let ty = null;
    let expr = null;
    for (const c of childrenArr(node)) {
      if (c.name === ';') continue;
      if (c.name === 'LetKeyword') continue;
      if (c.name === 'LowerIdentifier') {
        id = c;
        parts.push(text(txt(c, src)));
        continue;
      }
      if (c.name === 'CompType') {
        ty = c;
        continue;
      }
      if (c.name === 'Expression') {
        expr = c;
        continue;
      }
      if (c.name === ':') {
        if (ty) parts.push(text(' : '), group(nest(style.indent, ppType(ty))));
        continue;
      }
      if (c.name === '=') {
        parts.push(text(' = '));
        continue;
      }
      if (c.name === 'LineComment' || c.name === 'BlockComment') {
        parts.push(ppComment(c));
        continue;
      }
      parts.push(verbatim(c));
    }
    if (!id) return verbatim(node);
    if (expr) parts.push(group(nest(2, concat(softline, ppExpr(expr)))));
    return concat(...parts, declSemicolon());
  }

  function ppRecContinuation(node) {
    const body = firstOfType(node, 'RecBody');
    const prefix = firstOfType(node, 'RecKeyword') ? 'and rec ' : 'and ';
    return concat(text(prefix), body ? ppRecBody(body, false) : empty);
  }

  function ppRecGroup(node) {
    const parts = [];
    let first = true;
    for (const c of childrenArr(node)) {
      if (c.name === 'RecKeyword' || c.name === ';') continue;
      if (c.name === 'RecBody') {
        parts.push(concat(first ? text('rec ') : empty, ppRecBody(c, first)));
        first = false;
      } else if (c.name === 'RecContinuation') {
        parts.push(concat(hardline, ppRecContinuation(c)));
        first = false;
      } else if (c.name === 'LineComment' || c.name === 'BlockComment') {
        parts.push(ppComment(c));
      } else {
        parts.push(verbatim(c));
      }
    }
    return concat(...parts, declSemicolon());
  }

  function ppDatatypeContinuation(node) {
    const body = firstOfType(node, 'InductiveBody');
    let prefix = 'and ';
    if (firstOfType(node, 'InductiveKeyword')) prefix = 'and inductive ';
    else if (firstOfType(node, 'StratifiedKeyword')) prefix = 'and stratified ';
    return concat(text(prefix), body ? ppInductiveBody(body) : empty);
  }

  function ppInductive(node, kw) {
    const parts = [];
    let first = true;
    for (const c of childrenArr(node)) {
      if (c.name === 'InductiveKeyword' || c.name === 'StratifiedKeyword' || c.name === ';') continue;
      if (c.name === 'InductiveBody') {
        parts.push(concat(first ? text(`${kw} `) : empty, ppInductiveBody(c)));
        first = false;
      } else if (c.name === 'DatatypeContinuation') {
        parts.push(concat(hardline, ppDatatypeContinuation(c)));
        first = false;
      } else if (c.name === 'LineComment' || c.name === 'BlockComment') {
        parts.push(ppComment(c));
      } else {
        parts.push(verbatim(c));
      }
    }
    return concat(...parts, declSemicolon());
  }

  function ppInductiveBody(node) {
    const id = firstOfType(node, 'LowerIdentifier') || firstOfType(node, 'UpperIdentifier');
    if (!id) return verbatim(node);
    const kind = firstOfType(node, 'CompKind');
    let equalsEnd = null;
    const afterEquals = [];
    const bodyItems = [];
    for (const c of childrenArr(node)) {
      if (c.name === '=') {
        equalsEnd = c.to;
        continue;
      }
      if (c.name === ':' || c.name === '|' || c.name === 'CompKind') continue;
      if (isTypeFamilyId(c)) continue;
      if (c.name === 'CompConstructor') {
        bodyItems.push({ type: 'ctor', node: c });
        continue;
      }
      if (c.name === 'LineComment' || c.name === 'BlockComment') {
        pushSegmentComment(c, equalsEnd, afterEquals, bodyItems);
        continue;
      }
    }
    const header = concat(
      text(txt(id, src)),
      text(' : '),
      kind ? ppKind(kind) : empty,
      text(' ='),
      ...afterEquals,
    );
    return concat(header, ppCtorListBody(bodyItems));
  }

  function ppCtor(node) {
    const id = firstOfType(node, 'LowerIdentifier') || firstOfType(node, 'UpperIdentifier');
    const ty = firstOfType(node, 'LFType') || firstOfType(node, 'CompType');
    const idt = txt(id, src);
    // `  | name :` — continuation lines align with the declaration colon.
    const colonCol = 5 + idt.length;
    return concat(text(idt), text(' : '), ty ? ppTypeLike(ty, { colonCol }) : empty);
  }

  function ppRecBody(node, isFirstRec = false) {
    const id = firstOfType(node, 'LowerIdentifier');
    const ty = firstOfType(node, 'CompType');
    const total = firstOfType(node, 'TotalityAnnotation');
    const expr = firstOfType(node, 'Expression');
    const idt = txt(id, src);
    const head = `${idt} : `;

    const tail = concat(
      text(' ='),
      total ? concat(hardline, text(sliceNormalized(total.from, total.to, true))) : empty,
      hardline,
      expr ? ppExpr(expr, { baseCol: style.indent }) : empty,
    );

    if (!ty) return concat(text(idt), text(' : '), tail);

    const typeRaw = src.slice(ty.from, ty.to);
    if (typeRaw.includes('\n')) {
      const typeLines = reindentStickyBlock(typeRaw, 0, style.indent);
      let sig = concat(text(idt), text(' : '), text(typeLines[0] ?? ''));
      for (let i = 1; i < typeLines.length; i++) {
        if (typeLines[i]) sig = concat(sig, hardline, text(typeLines[i]));
      }
      return concat(sig, tail);
    }

    const sig = ppRecTypeSignature(ty, head);
    if (sig) return concat(sig, tail);
    const laid = lfArrowChainLayout(head, ty, { widthSlack: 2 });
    if (laid) return concat(laid, tail);
    return concat(text(idt), text(' : '), group(nest(style.indent, ppType(ty))), tail);
  }

  function ppClausePartial({ node, endBefore }) {
    const parts = [];
    for (const c of childrenArr(node)) {
      if (c.from >= endBefore) break;
      if (c.name === 'CompTypeBinder') parts.push(ppCompTypeBinder(c));
      else if (c.name === 'ContextualType' || c.name === 'ContextualObject')
        parts.push(ppContextual(c, c.name === 'ContextualType' ? 'type' : 'term'));
      else if (c.name === 'CompType' || c.name === 'CompAppType' || c.name === 'CompAtomicType')
        parts.push(ppTypeLike(c));
      else parts.push(text(txt(c, src)));
    }
    if (parts.length === 0) return empty;
    if (parts.length === 1) return parts[0];
    const glued = group(concat(...parts));
    const m = measureDoc(glued, printWidth);
    if (m.oneLine && m.width <= printWidth) return glued;
    return layoutStack(parts, { printWidth, indent: 0, baseCol: 0 });
  }

  function ppRecTypeSignature(ty, head) {
    const split = splitCompRecPrefix(ty);
    if (!split.arrowRoot) return null;

    const clauseDocs = split.clauses.map((c) => ppClausePartial(c));
    const prefixDoc = layoutPrefixChain(text(head), clauseDocs, { indent: style.indent });

    const chain = lfArrowSegmentsAndOps(split.arrowRoot);
    if (!chain) {
      if (clauseDocs.length === 0) return null;
      return concat(prefixDoc, space, ppTypeLike(split.arrowRoot));
    }

    const { segments, ops } = chain;
    const prefixFlat = render(prefixDoc, 1e9).replace(/\s*\n\s*/g, ' ').trim();
    let flatLine = prefixFlat;
    if (!split.peeledBeforeArrow) flatLine += ` ${flatTypeSegmentOneLine(segments[0])}`;
    for (let i = 0; i < ops.length; i++) {
      flatLine += ` ${txt(ops[i], src)} ${flatTypeSegmentOneLine(segments[i + 1])}`;
    }

    const sticky = arrowChainHasStickyBreak(segments, ops);
    if (!sticky && flatLine.length + 2 <= printWidth) {
      return text(flatLine);
    }

    const arrowDoc = layoutArrowChain({
      printWidth,
      lineIndent: style.indent,
      continuationIndent: style.indent,
      headPrefix: '',
      segments,
      ops,
      renderSegment: (seg) => renderTypeSegmentString(seg, segmentLayoutWidth),
      stickyBeforeOp: (seg, op) => src.slice(segmentEnd(seg), op.from).includes('\n'),
      widthSlack: 2,
      flatLine: null,
      opToText: (op) => txt(op, src),
      omitLeadingSegment: !!split.peeledBeforeArrow,
    });

    return split.peeledBeforeArrow ? concat(prefixDoc, arrowDoc) : concat(prefixDoc, hardline, arrowDoc);
  }

  function ppSchemaBody(node) {
    const elts = childrenArr(node).filter((c) => c.name === 'SchemaElement');
    if (elts.length === 0) return empty;
    if (elts.length === 1) return verbatimNormalised(elts[0]);
    const tail = elts.slice(1).map((e) => concat(hardline, text('+ '), verbatimNormalised(e)));
    return concat(verbatimNormalised(elts[0]), nest(style.indent, concat(...tail)));
  }

  function verbatimNormalised(node) {
    return verbatim(node);
  }

  function ppKind(node) {
    return ppTypeLike(node);
  }
  function ppType(node) {
    return ppTypeLike(node);
  }

  const ARROW_CHAIN_TYPES = new Set(['CompType', 'LFType', 'LFKind', 'CompKind']);

  function bindingRhsCompact(n) {
    if (!n) return false;
    if (n.name === 'CompType' || n.name === 'LFType' || n.name === 'LFKind' || n.name === 'CompKind') {
      const ch = childrenArr(n).filter((c) => c.name !== '⚠');
      if (ch.length === 1) return bindingRhsCompact(ch[0]);
      return false;
    }
    if (n.name === 'LFAtomicType') return true;
    if (n.name === 'LFAppType') {
      const s = src.slice(n.from, n.to);
      if (s.includes('[') || s.includes('(')) return false;
      const parts = s.trim().split(/[ \t]+/).filter(Boolean);
      if (parts.length >= 3) return false;
      return s.length < 48 && !/\s{2,}/.test(s);
    }
    if (n.name === 'CompAtomicType' || n.name === 'CompAppType') {
      const s = src.slice(n.from, n.to);
      if (s.includes('[')) return false;
      const parts = s.trim().split(/[ \t]+/).filter(Boolean);
      if (parts.length >= 3) return false;
      return s.length < 48;
    }
    return false;
  }

  function binderRhsTight(nx) {
    if (!nx) return false;
    if (nx.name === 'ContextualType' || nx.name === 'ContextualObject') return true;
    if (nx.name === 'CompType' || nx.name === 'LFType' || nx.name === 'LFKind' || nx.name === 'CompKind') {
      const ch = childrenArr(nx).filter((c) => c.name !== '⚠');
      if (ch.length === 1) return binderRhsTight(ch[0]);
    }
    return bindingRhsCompact(nx);
  }

  function ppCompTypeBinder(node) {
    const parts = [];
    for (const c of children(node)) {
      if (c.name === 'LowerIdentifier' || c.name === 'UpperIdentifier') {
        parts.push(text(txt(c, src)));
        continue;
      }
      if (c.name === 'ParameterVariable' || c.name === 'SubstitutionVariable') {
        parts.push(text(txt(c, src)));
        continue;
      }
      if (c.name === ':') {
        const prev = c.prevSibling;
        const nx = c.nextSibling;
        const prevIsName =
          prev &&
          (prev.name === 'LowerIdentifier' ||
            prev.name === 'UpperIdentifier' ||
            prev.name === 'ParameterVariable' ||
            prev.name === 'SubstitutionVariable');
        const tight =
          style.binderColon === 'tight' &&
          prevIsName &&
          binderRhsTight(nx);
        parts.push(tight ? text(':') : text(' : '));
        continue;
      }
      if (c.name === '::') {
        parts.push(text(txt(c, src)));
        continue;
      }
      if (
        c.name === 'CompType' ||
        c.name === 'LFType' ||
        c.name === 'LFKind' ||
        c.name === 'CompKind' ||
        c.name === 'ContextualType' ||
        c.name === 'ContextualObject'
      ) {
        parts.push(ppTypeLike(c));
        continue;
      }
      parts.push(text(txt(c, src)));
    }
    return concat(...parts);
  }

  function splitFirstArrow(n) {
    if (!ARROW_CHAIN_TYPES.has(n.name)) return null;
    const ch = childrenArr(n);
    const ai = ch.findIndex((c) => c.name === 'ArrowOp');
    if (ai <= 0 || ai + 1 >= ch.length) return null;
    return { lhs: ch.slice(0, ai), op: ch[ai], rhs: ch[ai + 1] };
  }

  function flattenArrowSegmentNodes(rootType) {
    const lhsSegs = [];
    const ops = [];
    let cur = rootType;
    for (;;) {
      const sp = splitFirstArrow(cur);
      if (!sp) break;
      lhsSegs.push(sp.lhs);
      ops.push(sp.op);
      cur = sp.rhs;
    }
    if (ops.length === 0) return { segments: [rootType], ops: [] };
    const segments = lhsSegs.map((lhs) =>
      lhs.length === 1 ? lhs[0] : { spanFrom: lhs[0].from, spanTo: lhs[lhs.length - 1].to },
    );
    segments.push(cur);
    return { segments, ops };
  }

  function ppArrowSpineDoc(node) {
    const lhsSegs = [];
    const ops = [];
    let cur = node;
    for (;;) {
      const sp = splitFirstArrow(cur);
      if (!sp) break;
      lhsSegs.push(sp.lhs);
      ops.push(sp.op);
      cur = sp.rhs;
    }
    if (ops.length === 0) return null;
    const docs = [];
    for (const lhs of lhsSegs) {
      docs.push(lhs.length === 1 ? ppTypeLike(lhs[0]) : ppTypeLinear(lhs));
    }
    docs.push(ppTypeLike(cur));
    let d = docs[0];
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const lhs = lhsSegs[i];
      const fromTok = lhs[lhs.length - 1].to;
      const sticky = src.slice(fromTok, op.from).includes('\n');
      d = concat(d, sticky ? hardline : line, text(txt(op, src)), space, docs[i + 1]);
    }
    return group(d);
  }

  function typeChildIsAtomic(c) {
    return (
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
      c.name === 'ContextualObject'
    );
  }

  function ppTypeLinear(nodes) {
    const parts = [];
    let prevAtomic = false;
    for (const c of nodes) {
      let piece;
      switch (c.name) {
        case 'CompTypeBinder':
          piece = ppCompTypeBinder(c);
          break;
        case 'LFType':
        case 'LFKind':
        case 'CompType':
        case 'CompKind':
          piece = ppTypeLike(c);
          break;
        case 'LFAppType':
        case 'LFAtomicType':
        case 'CompAppType':
        case 'CompAtomicType':
        case 'CompTypeArg':
          piece = ppTypeLikeCore(c);
          break;
        case 'ContextualType':
        case 'ContextualObject':
          piece = ppContextual(c, c.name === 'ContextualType' ? 'type' : 'term');
          break;
        default:
          piece = text(txt(c, src));
      }
      if (prevAtomic && typeChildIsAtomic(c)) parts.push(space);
      parts.push(piece);
      prevAtomic = typeChildIsAtomic(c);
    }
    return concat(...parts);
  }

  function ppTypeLike(node, opts = {}) {
    if (!node.firstChild) return text(txt(node, src));
    if (!opts.colonCol && ARROW_CHAIN_TYPES.has(node.name)) {
      const spine = ppArrowSpineDoc(node);
      if (spine != null) return spine;
    }
    return ppTypeLikeCore(node, opts);
  }

  function stickyBreakBefore(prev, cur) {
    return prev != null && src.slice(prev.to, cur.from).includes('\n');
  }

  function ppTypeLikeCore(node, opts = {}) {
    if (!node.firstChild) return text(txt(node, src));

    const { colonCol } = opts;
    const contPad = colonCol != null ? text(' '.repeat(colonCol)) : null;
    const parts = [];
    let prevAtomic = false;
    let prevChild = null;

    for (const c of children(node)) {
      let piece = null;
      switch (c.name) {
        case 'ArrowOp': {
          const stickyBreak = stickyBreakBefore(c.prevSibling, c);
          if (stickyBreak && contPad) {
            parts.push(hardline, contPad, text(txt(c, src)), space);
          } else if (colonCol != null) {
            parts.push(space, text(txt(c, src)), space);
          } else {
            parts.push(stickyBreak ? hardline : line, text(txt(c, src)), space);
          }
          prevAtomic = false;
          prevChild = c;
          continue;
        }
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
        case 'PiBinder':
          if (prevAtomic) parts.push(space);
          parts.push(text(txt(c, src)));
          prevAtomic = true;
          continue;
        case ':': {
          const prev = c.prevSibling;
          const next = c.nextSibling;
          const tight =
            style.binderColon === 'tight' &&
            prev &&
            (prev.name === 'LowerIdentifier' ||
              prev.name === 'PiBinder' ||
              prev.name === 'UpperIdentifier') &&
            next &&
            (next.name === 'LFType' || next.name === 'LFKind' || bindingRhsCompact(next));
          parts.push(tight ? text(':') : text(' : '));
          prevAtomic = false;
          continue;
        }
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
        case 'CompTypeBinder':
          piece = ppCompTypeBinder(c);
          break;
        case 'LFType':
        case 'LFKind':
        case 'LFAppType':
        case 'LFAtomicType':
        case 'CompType':
        case 'CompKind':
        case 'CompAppType':
        case 'CompAtomicType':
        case 'CompTypeArg':
          piece = ppTypeLike(c, opts);
          break;
        case 'ContextualType':
        case 'ContextualObject':
          piece = ppContextual(c, c.name === 'ContextualType' ? 'type' : 'term');
          break;
        default:
          piece = text(txt(c, src));
      }
      if (prevChild && stickyBreakBefore(prevChild, c) && contPad) {
        parts.push(hardline, contPad);
      } else if (prevAtomic && typeChildIsAtomic(c)) {
        parts.push(space);
      }
      parts.push(piece);
      prevAtomic = typeChildIsAtomic(c);
      prevChild = c;
    }
    const doc = concat(...parts);
    return colonCol != null ? doc : group(doc);
  }

  function renderTypeSegmentString(seg, w) {
    if (seg && typeof seg.spanFrom === 'number') return sliceNormalized(seg.spanFrom, seg.spanTo, true);
    if (!seg) return '';
    if (subtreeHasError(seg)) return sliceNormalized(seg.from, seg.to, true);
    return render(ppTypeLike(seg), w);
  }

  function flatTypeSegmentOneLine(seg) {
    if (seg && typeof seg.spanFrom === 'number')
      return sliceNormalized(seg.spanFrom, seg.spanTo, true).replace(/\s+/g, ' ').trim();
    if (!seg) return '';
    if (subtreeHasError(seg)) return sliceNormalized(seg.from, seg.to, true).replace(/\s+/g, ' ').trim();
    const r = render(ppTypeLike(seg), 1e9);
    return r.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim();
  }

  function segmentEnd(seg) {
    if (seg && typeof seg.spanFrom === 'number') return seg.spanTo;
    return seg.to;
  }

  function splitPiPrefix(ty) {
    const ch = childrenArr(ty);
    if (ch[0]?.name !== '{') return null;
    const closeIdx = ch.findIndex((c) => c.name === '}');
    if (closeIdx < 0 || closeIdx + 1 >= ch.length) return null;
    const suffix = ch[closeIdx + 1];
    if (suffix?.name !== 'LFType' && suffix?.name !== 'LFKind') return null;
    return { prefixFrom: ty.from, prefixTo: suffix.from, suffix };
  }

  function lfArrowSegmentsAndOps(ty) {
    const pi = splitPiPrefix(ty);
    const root = pi ? pi.suffix : ty;
    const { segments, ops } = flattenArrowSegmentNodes(root);
    if (ops.length === 0) return null;
    const segmentsUse = pi
      ? [{ spanFrom: pi.prefixFrom, spanTo: segmentEnd(segments[0]) }, ...segments.slice(1)]
      : segments;
    return { segments: segmentsUse, ops };
  }

  function lfArrowChainLayout(head, ty, opts = {}) {
    const chain = lfArrowSegmentsAndOps(ty);
    if (!chain) return null;
    const { segments, ops } = chain;
    const { terminator = null, widthSlack = 0, lineIndent = style.indent } = opts;

    const flat = flatArrowChainPlain(head, segments, ops);
    const termLen = terminator ? terminator.length : 0;
    if (!arrowChainHasStickyBreak(segments, ops) && flat.length + termLen + widthSlack <= printWidth) {
      return concat(text(flat), terminator ? text(terminator) : empty);
    }

    const arrowDoc = layoutArrowChain({
      printWidth,
      lineIndent,
      continuationIndent: style.indent,
      headPrefix: head,
      segments,
      ops,
      renderSegment: (seg) => renderTypeSegmentString(seg, segmentLayoutWidth),
      stickyBeforeOp: (seg, op) => src.slice(segmentEnd(seg), op.from).includes('\n'),
      widthSlack: termLen + widthSlack,
      flatLine: null,
      opToText: (op) => txt(op, src),
    });
    return concat(arrowDoc, terminator ? text(terminator) : empty);
  }

  function arrowChainHasStickyBreak(segments, ops) {
    for (let i = 0; i < ops.length; i++) {
      const end = segmentEnd(segments[i]);
      if (src.slice(end, ops[i].from).includes('\n')) return true;
    }
    return false;
  }

  function flatArrowChainPlain(head, segments, ops) {
    let s = flatTypeSegmentOneLine(segments[0]);
    for (let i = 0; i < ops.length; i++) {
      s += ` ${txt(ops[i], src)} ${flatTypeSegmentOneLine(segments[i + 1])}`;
    }
    return head + s;
  }

  function ppTerm(node) {
    if (node.name === 'LFAtomicTerm') return ppAtomicTerm(node);
    if (node.name === 'LFLambda') {
      const binder = firstOfType(node, 'LFLambdaBinder');
      const body = node.lastChild;
      return concat(binder ? text(txt(binder, src)) : empty, text(' '), body && body !== binder ? ppTerm(body) : empty);
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

  function ppAtomicTerm(node) {
    const ch = childrenArr(node);
    if (
      ch.length === 5 &&
      ch[0].name === '(' &&
      ch[2].name === ':' &&
      ch[4].name === ')'
    ) {
      return concat(text('('), ppTerm(ch[1]), text(' : '), ppTypeLike(ch[3]), text(')'));
    }
    if (ch.length === 3 && ch[0].name === '(' && ch[2].name === ')') {
      return concat(text('('), ppTerm(ch[1]), text(')'));
    }
    return text(txt(node, src));
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
        return ppTerm(c);
      case 'LFAtomicTerm':
        return ppAtomicTerm(c);
      default:
        return text(txt(c, src));
    }
  }

  function needsSpace(prev, next) {
    if (next.name === ')' || next.name === ',' || next.name === '.') return false;
    if (next.name === ']') return prev.name === 'LFType' || prev.name === 'LFTerm';
    if (prev.name === '(') return false;
    if (prev.name === '[') return next.name === 'ContextPart' || next.name === 'Turnstile';
    return true;
  }

  function exprHasBlockingError(node) {
    const lo = node.from;
    const hi = node.to;
    let bad = false;
    node.cursor().iterate((n) => {
      if (!(n.type.isError && n.from >= lo && n.to <= hi)) return;
      if (n.name === '⚠' && n.from === n.to) return;
      bad = true;
    });
    return bad;
  }

  const STICKY_EXPR_NODES = new Set([
    'LetExpression',
    'AppExpression',
    'CaseExpression',
    'MLamExpression',
    'FnExpression',
  ]);

  function isContextualProofApp(node) {
    if (node.name === 'AppExpression') {
      const ch = childrenArr(node);
      if (ch.length === 1) return isContextualProofApp(ch[0]);
      if (ch.length === 2) return isContextualProofApp(ch[1]);
      return false;
    }
    if (node.name === 'AtomicExpression') {
      const inner = node.firstChild;
      return inner?.name === 'ContextualObject';
    }
    return false;
  }

  function shouldUseStickyExpr(node) {
    if (!STICKY_EXPR_NODES.has(node.name)) return false;
    if (node.name === 'AppExpression' && isContextualProofApp(node)) return false;
    return true;
  }

  function ppExpr(node, opts = {}) {
    if (node.name === 'Expression' && node.firstChild && !node.firstChild.nextSibling) return ppExpr(node.firstChild, opts);

    if (exprHasBlockingError(node)) return text(src.slice(node.from, node.to));

    if (shouldUseStickyExpr(node)) {
      const sticky = formatMultilineExprSticky(node, src, {
        baseCol: opts.baseCol ?? 0,
        step: style.indent,
      });
      if (sticky) return text(sticky);
    }

    if (node.name === 'AppExpression') return ppAppExpr(node, opts);

    if (node.name === 'CaseExpression') return ppCaseProof(node);
    if (node.name === 'FnExpression') return ppFn(node);
    if (node.name === 'MLamExpression') return ppMLam(node);
    if (node.name === 'LetExpression') return ppLetProof(node, opts);
    if (node.name === 'IfExpression') return ppIf(node);
    if (node.name === 'ImpossibleExpression') return concat(text('impossible '), ppExpr(node.lastChild, opts));

    const parts = [];
    for (const c of children(node)) parts.push(exprPiece(c, opts));
    return concat(...parts);
  }

  function ppAppExpr(node, opts = {}) {
    const parts = [];
    function walk(n) {
      if (n.name === 'AppExpression') {
        const ch = childrenArr(n);
        if (ch.length === 2) {
          walk(ch[0]);
          parts.push(atomicExprPiece(ch[1], opts));
          return;
        }
        if (ch.length === 1) {
          walk(ch[0]);
          return;
        }
      }
      parts.push(atomicExprPiece(n, opts));
    }
    walk(node);
    if (parts.length === 0) return text(txt(node, src));
    let doc = parts[0];
    for (let i = 1; i < parts.length; i++) doc = concat(doc, space, parts[i]);
    return group(doc);
  }

  function atomicExprPiece(n, opts = {}) {
    if (n.name === 'AtomicExpression') {
      const inner = n.firstChild;
      return inner ? atomicExprPiece(inner, opts) : text(txt(n, src));
    }
    if (n.name === 'ContextualObject') return ppContextual(n, 'term', opts);
    if (n.name === 'TupleOrParenExpression') return ppTupleOrParenExpr(n);
    if (n.name === 'ContextApplication') return text(txt(n, src));
    if (n.name === 'AngleHatTerm') return text(txt(n, src));
    if (n.name === 'LowerIdentifier' || n.name === 'UpperIdentifier') return text(txt(n, src));
    return text(txt(n, src));
  }

  function ppTupleOrParenExpr(node) {
    const exprs = childrenArr(node).filter((c) => c.name === 'Expression');
    if (exprs.length === 0) return text(txt(node, src));
    const inner = exprs.map((e) => ppExpr(e));
    return concat(text('('), join(concat(text(','), space), inner), text(')'));
  }

  function exprPiece(c, opts = {}) {
    switch (c.name) {
      case 'Expression':
        return ppExpr(c, opts);
      case 'AppExpression':
        return ppAppExpr(c, opts);
      case 'AtomicExpression':
        return atomicExprPiece(c, opts);
      case 'ContextualObject':
        return ppContextual(c, 'term', opts);
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

  function ppCaseProof(node) {
    const exprs = childrenArr(node).filter((c) => c.name === 'Expression');
    const scrutinee = exprs[0];
    const body = firstOfType(node, 'CaseBody');
    const branches = body ? childrenArr(body).filter((c) => c.name === 'CaseBranch') : [];
    const branchDocs = branches.map((b) => ppBranchProof(b));
    return concat(
      text('case '),
      scrutinee ? ppExpr(scrutinee) : empty,
      text(' of'),
      hardline,
      join(hardline, branchDocs),
    );
  }

  function ppFatArrow(node) {
    const a = firstOfType(node, 'FatArrow');
    return text(a ? txt(a, src) : '⇒');
  }

  function ppQuantifiedBinder(node) {
    const binder = firstOfType(node, 'CompTypeBinder');
    return concat(text('{'), binder ? ppCompTypeBinder(binder) : empty, text('}'));
  }

  function ppBranchProof(node) {
    const binders = childrenArr(node).filter((c) => c.name === 'QuantifiedBinder');
    const pat = firstOfType(node, 'Pattern');
    const expr = firstOfType(node, 'Expression');
    const barPad = ' '.repeat(style.indent);
    const bodyPad = ' '.repeat(style.indent * 2);
    const headParts = [text(barPad + '| ')];
    for (const b of binders) headParts.push(ppQuantifiedBinder(b), space);
    headParts.push(pat ? ppPattern(pat) : empty, text(' '), ppFatArrow(node));
    const head = concat(...headParts);
    if (!expr) return head;
    if (style.proofCase.arrowBreaksBody) {
      return concat(head, hardline, text(bodyPad), ppExpr(expr));
    }
    return concat(head, text(' '), group(ppExpr(expr)));
  }

  function ppLetProof(node, opts = {}) {
    const pat = firstOfType(node, 'Pattern');
    const exprs = childrenArr(node).filter((c) => c.name === 'Expression');
    const rhs = exprs[0];
    const body = exprs[1];
    const bind = concat(text('let '), pat ? ppPattern(pat) : empty, text(' = '), rhs ? ppExpr(rhs, opts) : empty);
    if (!body) return bind;
    if (style.proofLet.breakChains && (body.name === 'LetExpression' || render(bind, printWidth).length > printWidth - 8)) {
      const ind = ' '.repeat(style.indent);
      return concat(
        bind,
        text(' in'),
        hardline,
        text(ind),
        body.name === 'LetExpression' ? ppLetProof(body, opts) : ppExpr(body, opts),
      );
    }
    return concat(bind, text(' in '), ppExpr(body, opts));
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
          piece = text(txt(c, src));
      }
      if (prev && needsSpace(prev, c)) parts.push(space);
      parts.push(piece);
      prev = c;
    }
    return concat(...parts);
  }

  function ppFn(node) {
    const kw = firstOfType(node, 'FnKeyword') || firstOfType(node, 'FunKeyword');
    const params = childrenArr(node).filter((c) => c.name === 'FnParam');
    const body = firstOfType(node, 'Expression');
    const head = kw ? txt(kw, src) : 'fn';
    return concat(text(`${head} `), join(space, params.map((p) => text(txt(p, src)))), text(' '), ppFatArrow(node), text(' '), body ? ppExpr(body) : empty);
  }

  function ppMLam(node) {
    const kw = firstOfType(node, 'MLamKeyword') || firstOfType(node, 'FNKeyword');
    const params = childrenArr(node).filter((c) => c.name === 'MLamParam');
    const body = firstOfType(node, 'Expression');
    return concat(
      text(`${txt(kw, src)} `),
      join(space, params.map((p) => text(txt(p, src)))),
      text(' '),
      ppFatArrow(node),
      text(' '),
      body ? ppExpr(body) : empty,
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

  function ppContextual(node, _kind, opts = {}) {
    const baseCol = opts.baseCol ?? 0;
    const turnstile = firstOfType(node, 'Turnstile');
    const proof = formatContextualProofScript(node, src, {
      baseCol,
      step: style.indent,
      bracket: style.contextualBracket,
      turnstileText: turnstile ? txt(turnstile, src) : '⊢',
    });
    if (proof) return text(proof);

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
        parts.push(txt(c, src).replace(/[ \t]+/g, ' ').trim());
        continue;
      }
      if (c.name === 'LFType' || c.name === 'LFTerm') {
        parts.push(render(ppTypeLike(c), 1e9));
        continue;
      }
      parts.push(txt(c, src));
    }
    const inner = parts.join('').trim();
    const pad = baseCol ? text(' '.repeat(baseCol)) : empty;
    if (style.contextualBracket === 'tight') return concat(pad, text('['), text(inner), text(']'));
    return concat(pad, text('[ '), text(inner), text(' ]'));
  }

  function normalisePragma(node) {
    const raw = src.slice(node.from, node.to);
    if (raw.includes('%')) return text(raw.trim());
    const out = raw
      .split('\n')
      .map((ln) => ln.trimStart().replace(/[ \t]+/g, ' ').trimEnd())
      .join('\n')
      .trim();
    return text(out);
  }

  return { pp };
}
