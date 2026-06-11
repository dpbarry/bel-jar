/** Query pragma diagnostics: static bounds checks + runtime count errors from check output. */

const STAR_STAR_MSG =
  '`* *` expects infinitely many solutions, so any finite search result fails. Use `1 *` to find one witness.';

export function queryPragmaSourceLines(doc) {
  const out = [];
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    if (/^\s*--query\b/.test(line.text)) {
      out.push({ from: line.from, to: line.to, number: n });
    }
  }
  return out;
}

function boundIsStar(node, doc) {
  if (!node || node.name !== 'QueryBound') return false;
  return doc.sliceString(node.from, node.to).trim() === '*';
}

export function lintQueryPragmaBounds(tree, doc) {
  const diags = [];
  tree.iterate({
    enter(ref) {
      if (ref.name !== 'QueryPragma') return;
      const bounds = [];
      for (let c = ref.node.firstChild; c; c = c.nextSibling) {
        if (c.name === 'QueryBound') bounds.push(c);
      }
      if (bounds.length < 2) return;
      if (!boundIsStar(bounds[0], doc) || !boundIsStar(bounds[1], doc)) return;
      diags.push({
        from: bounds[0].from,
        to: bounds[1].to,
        severity: 'error',
        message: STAR_STAR_MSG,
      });
    },
  });
  return diags;
}

function splitQueryRuntimeBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    if (!/^--query\b/.test(lines[i].trim())) { i++; continue; }
    let queryError = null;
    let started = false;
    while (i < lines.length) {
      const qt = lines[i].trim();
      if (started && /^--query\b/.test(qt)) break;
      started = true;
      if (/^Query error/i.test(qt)) {
        queryError = qt;
        i++;
        break;
      }
      if (/^Done\.?\s*$/.test(qt) || /^Skipping query/i.test(qt)) {
        i++;
        break;
      }
      i++;
    }
    blocks.push({ queryError });
  }
  return blocks;
}

export function parseQueryRuntimeDiagnostics(raw, doc) {
  const text = String(raw != null ? raw : '').replace(/\r\n/g, '\n');
  if (!/Query error/i.test(text)) return [];
  const sources = queryPragmaSourceLines(doc);
  const blocks = splitQueryRuntimeBlocks(text);
  const diags = [];
  for (let b = 0; b < blocks.length && b < sources.length; b++) {
    const err = blocks[b].queryError;
    if (!err) continue;
    const src = sources[b];
    diags.push({
      from: src.from,
      to: src.to,
      severity: 'error',
      message: err,
    });
  }
  return diags;
}

export function mergeDiagnostics(primary, secondary) {
  const merged = primary.slice();
  for (const d of secondary) {
    if (!primary.some((e) => e.from < d.to && d.from < e.to)) merged.push(d);
  }
  merged.sort((a, b) => a.from - b.from);
  return merged;
}
