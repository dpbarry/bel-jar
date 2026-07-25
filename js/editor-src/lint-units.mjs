export const GAP_PRAGMA_LINE =
  /^\s*--(?:open|abbrev|name|infix|prefix|assoc|not|nostrengthen|opaque|coverage|warncoverage|query)\b/i;

export const TOP_LEVEL_PRAGMA_INNER = new Set([
  'OpenPragma',
  'AbbrevPragma',
  'NamePragma',
  'InfixPragma',
  'PrefixPragma',
  'AssocPragma',
  'NotPragma',
  'NoStrengthenPragma',
  'OpaquePragma',
  'CoveragePragma',
  'WarnCoveragePragma',
  'QueryPragma',
]);

const CONTINUATION_INNER = new Set([
  'LFDeclaration',
  'LFConstructor',
  'LFBlock',
]);

const BAD_DOUBLE_DASH_LINE = /^\s*--/;

function subtreeHasError(node) {
  const lo = node.from;
  const hi = node.to;
  let bad = false;
  // Zero-width error nodes (Lezer's "missing token" recovery — unclosed paren,
  // missing colon) are real syntax faults too; requiring from < to here used to
  // let broken blocks through to the Beluga checker unmasked.
  node.cursor().iterate((n) => {
    if (n.type.isError && n.from >= lo && n.to <= hi) bad = true;
  });
  return bad;
}

export function lfDeclarationHasColon(node) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === ':') return true;
  }
  return false;
}

function hasBadPragmaLineInRange(doc, from, to) {
  const l0 = doc.lineAt(from).number;
  const l1 = doc.lineAt(Math.max(from, to - 1)).number;
  for (let n = l0; n <= l1; n++) {
    const t = doc.line(n).text.trimStart();
    if (t === '') continue;
    if (BAD_DOUBLE_DASH_LINE.test(t) && !GAP_PRAGMA_LINE.test(t)) return true;
  }
  return false;
}

export function lineSyntaxMessage(lineText) {
  const t = lineText.trimStart();
  if (BAD_DOUBLE_DASH_LINE.test(t) && !GAP_PRAGMA_LINE.test(t)) return 'Unknown pragma';
  return 'Syntax error';
}

function moduleEnvelopeSyntaxFault(modDecl, doc, raw) {
  if (hasBadPragmaLineInRange(doc, raw.from, raw.to)) return true;
  for (let c = modDecl.firstChild; c; c = c.nextSibling) {
    if (c.name === 'Declaration') break;
    if (c.type.isError) return true;
    if (subtreeHasError(c)) return true;
  }
  return false;
}

function unitSyntaxFault(inner, doc, raw) {
  if (!inner) return true;
  const realError = inner.type.isError && inner.from < inner.to;
  if (TOP_LEVEL_PRAGMA_INNER.has(inner.name)) {
    return hasBadPragmaLineInRange(doc, raw.from, raw.to) || realError;
  }
  if (subtreeHasError(inner)) return true;
  if (inner.name === 'LFDeclaration' && !lfDeclarationHasColon(inner)) return true;
  if (realError) return true;
  if (hasBadPragmaLineInRange(doc, raw.from, raw.to)) return true;
  return false;
}

function rawFromDecl(decl) {
  const inner = decl.firstChild;
  return {
    from: decl.from,
    to: decl.to,
    inners: inner ? [inner] : [],
  };
}

function gatherRawDecls(program) {
  const raws = [];
  for (let cur = program.firstChild; cur; cur = cur.nextSibling) {
    if (cur.name !== 'Declaration') continue;
    const inner = cur.firstChild;
    if (inner && inner.name === 'ModuleDeclaration') {
      const nested = [];
      let firstNested = null;
      for (let c = inner.firstChild; c; c = c.nextSibling) {
        if (c.name === 'Declaration') {
          if (!firstNested) firstNested = c;
          nested.push(rawFromDecl(c));
        }
      }
      if (firstNested && cur.from < firstNested.from) {
        raws.push({
          from: cur.from,
          to: firstNested.from,
          inners: [],
          moduleHeader: true,
          modNode: inner,
        });
      } else if (!nested.length) {
        raws.push({
          from: cur.from,
          to: cur.to,
          inners: [inner],
          moduleHeader: true,
          modNode: inner,
        });
      }
      for (let i = 0; i < nested.length; i++) raws.push(nested[i]);
    } else {
      raws.push(rawFromDecl(cur));
    }
  }
  return raws;
}

function clusterDeclarations(rawDecls) {
  const blocks = [];
  let i = 0;
  while (i < rawDecls.length) {
    const cur = rawDecls[i];
    const inner = cur.inners[0];
    if (inner && inner.name === 'LFDatatypeDeclaration') {
      let groupFrom = cur.from;
      let groupTo = cur.to;
      const inners = [inner];
      let j = i + 1;
      while (j < rawDecls.length) {
        const nxtInner = rawDecls[j].inners[0];
        if (nxtInner && CONTINUATION_INNER.has(nxtInner.name)) {
          groupTo = rawDecls[j].to;
          inners.push(nxtInner);
          j++;
        } else {
          break;
        }
      }
      blocks.push({ from: groupFrom, to: groupTo, inners });
      i = j;
    } else if (inner && inner.type.isError && inner.from < inner.to) {
      let groupFrom = cur.from;
      let groupTo = cur.to;
      const inners = [inner];
      let j = i + 1;
      while (j < rawDecls.length) {
        const nxtInner = rawDecls[j].inners[0];
        if (nxtInner && ((nxtInner.type.isError && nxtInner.from < nxtInner.to)
                         || CONTINUATION_INNER.has(nxtInner.name))) {
          groupTo = rawDecls[j].to;
          inners.push(nxtInner);
          j++;
        } else {
          break;
        }
      }
      blocks.push({ from: groupFrom, to: groupTo, inners });
      i = j;
    } else {
      blocks.push({
        from: cur.from,
        to: cur.to,
        inners: cur.inners,
        moduleHeader: cur.moduleHeader,
        modNode: cur.modNode,
      });
      i++;
    }
  }
  return blocks;
}

function finalizeBlock(raw, doc) {
  const inner = raw.inners[0] || null;
  let syntaxFault;
  if (raw.moduleHeader && raw.modNode) {
    syntaxFault = moduleEnvelopeSyntaxFault(raw.modNode, doc, raw);
  } else {
    syntaxFault =
      raw.inners.length === 0 ||
      raw.inners.some((n) => unitSyntaxFault(n, doc, raw)) ||
      hasBadPragmaLineInRange(doc, raw.from, raw.to);
  }
  return {
    from: raw.from,
    to: raw.to,
    inner: inner ? inner.name : (raw.moduleHeader ? 'ModuleDeclaration' : null),
    innerNodes: raw.inners,
    syntaxFault,
    trustBeluga: !raw.moduleHeader && !syntaxFault,
  };
}

function coalesceSameLineBlocks(blocks, doc) {
  if (blocks.length < 2) return blocks;
  const out = [{ ...blocks[0] }];
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    const prev = out[out.length - 1];
    const sameLine = doc.lineAt(prev.from).number === doc.lineAt(b.from).number;
    const touch = b.from <= prev.to + 1;
    if (sameLine && touch) {
      prev.from = Math.min(prev.from, b.from);
      prev.to = Math.max(prev.to, b.to);
      prev.syntaxFault = prev.syntaxFault || b.syntaxFault;
      prev.trustBeluga = prev.trustBeluga && b.trustBeluga;
      if (!prev.inner && b.inner) prev.inner = b.inner;
      if (b.innerNodes && b.innerNodes.length) {
        prev.innerNodes = (prev.innerNodes || []).concat(b.innerNodes);
      }
    } else {
      out.push({ ...b });
    }
  }
  return out;
}

export function lineMaskSpans(doc, blocks) {
  const lines = new Set();
  for (const b of blocks) {
    if (!b.syntaxFault) continue;
    const l0 = doc.lineAt(b.from).number;
    const l1 = doc.lineAt(Math.max(b.from, b.to - 1)).number;
    for (let n = l0; n <= l1; n++) lines.add(n);
  }
  for (let n = 1; n <= doc.lines; n++) {
    const t = doc.line(n).text.trimStart();
    if (BAD_DOUBLE_DASH_LINE.test(t) && !GAP_PRAGMA_LINE.test(t)) lines.add(n);
  }
  return [...lines]
    .sort((a, b) => a - b)
    .map((n) => ({ from: doc.line(n).from, to: doc.line(n).to }));
}

export function applySyntaxFaultMask(code, doc, blocks) {
  const spans = lineMaskSpans(doc, blocks);
  let masked = code;
  for (let i = spans.length - 1; i >= 0; i--) {
    const s = spans[i];
    masked = masked.slice(0, s.from)
      + masked.slice(s.from, s.to).replace(/[^\n]/g, ' ')
      + masked.slice(s.to);
  }
  return masked;
}

function blankBlockLines(masked, doc, b) {
  const l0 = doc.lineAt(b.from).number;
  const l1 = doc.lineAt(Math.max(b.from, b.to - 1)).number;
  for (let n = l0; n <= l1; n++) {
    const line = doc.line(n);
    masked = masked.slice(0, line.from)
      + masked.slice(line.from, line.to).replace(/[^\n]/g, ' ')
      + masked.slice(line.to);
  }
  return masked;
}

// Blank out a specific set of blocks (by index) on top of `code`. Used by the
// multi-pass settlement: after a Beluga error is attributed to a block, that
// block (and everything impacted by it) is masked so the next pass can reach
// errors in the remaining independent blocks.
export function maskBlocksByIndex(code, doc, blocks, indices) {
  let masked = code;
  for (let j = blocks.length - 1; j >= 0; j--) {
    if (indices.has(j)) masked = blankBlockLines(masked, doc, blocks[j]);
  }
  return masked;
}

export function maskBelugaBlockContext(code, doc, blocks, activeIndex) {
  let masked = code;
  for (let j = blocks.length - 1; j >= 0; j--) {
    const b = blocks[j];
    if (b.syntaxFault || j > activeIndex) {
      masked = blankBlockLines(masked, doc, b);
    }
  }
  return masked;
}

export function hasSyntaxFaultBlock(blocks) {
  return blocks.some((b) => b.syntaxFault);
}

export function countSyntaxFaultBlocks(blocks) {
  let n = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].syntaxFault) n++;
  }
  return n;
}

const _blocksCache = new WeakMap();

export function computeLintBlocks(tree, doc) {
  let blocks = _blocksCache.get(tree);
  if (!blocks) {
    const rawDecls = gatherRawDecls(tree.topNode);
    blocks = clusterDeclarations(rawDecls).map((b) => finalizeBlock(b, doc));
    blocks = coalesceSameLineBlocks(blocks, doc);
    _blocksCache.set(tree, blocks);
  }

  function blockAt(pos) {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (pos >= b.from && pos < b.to) return { index: i, block: b };
    }
    return null;
  }

  return { blocks, blockAt };
}

export function unitContentStart(src, unit) {
  const slice = src.slice(unit.from, unit.to);
  const m = slice.match(/\S/);
  return m ? unit.from + m.index : unit.from;
}
