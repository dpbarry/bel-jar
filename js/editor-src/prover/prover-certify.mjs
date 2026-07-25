/** Certify / orchestration / splice substrate for the prover bridge. */
import { enumerateDecls } from './prover-corpus-decls.mjs';

export function theoremDeclRange(code, name) {
  if (!name) return null;
  const lines = String(code || '').split('\n');
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const head = new RegExp(`^\\s*(?:rec|proof)\\s+${esc}\\s*:`);
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (head.test(lines[i])) { start = i + 1; break; }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i += 1) {
    if (/^\s*;\s*$/.test(lines[i])) { end = i + 1; break; }
    if (i > start && /^\s*(?:(?:and\s+)?rec|proof)\s+[\p{L}_]/u.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

/** Suite prelude + trimmed active prefix + target decl for the search oracle. */
export function proveOrchestrationCode(fullAssembled, thmName, declStart, declEnd, fileStart) {
  const src = String(fullAssembled || '');
  const fs = fileStart == null ? 0 : fileStart;
  const prelude = src.slice(0, fs).trimEnd();
  const filePrefix = src.slice(fs, declStart);
  const keptPrefixRaw = stripHoledSiblingDecls(filePrefix, thmName);
  const decl = src.slice(declStart, declEnd).trim();
  const seedCore = nonLfSeedText(keptPrefixRaw, decl);
  const keptPrefix = trimUnusedLfPrelude(keptPrefixRaw, seedCore);
  const trimmedPrelude = trimUnusedLfPrelude(prelude, `${keptPrefix}\n${decl}`);
  const parts = [trimmedPrelude, keptPrefix, decl].filter((s) => s && String(s).trim());
  return parts.join('\n\n') + '\n';
}

const LF_TRIM_SKIP = new Set([
  'type', 'ctype', 'schema', 'rec', 'proof', 'fn', 'mlam', 'case', 'of', 'let', 'in',
  'total', 'impossible', 'and', 'LF', 'inductive', 'coinductive', 'stratified',
]);

const LF_TRIM_TOKEN = String.raw`[\p{L}_][^\s()[\]{}.,:;%\\|]*`;

export function stripLfComments(text) {
  return String(text || '')
    .replace(/%{[\s\S]*?}%/g, ' ')
    .replace(/%[^\n]*/g, ' ');
}

function freeIdents(text) {
  const clean = stripLfComments(text).replace(/->|→/g, ' ');
  const out = new Set();
  for (const m of clean.matchAll(new RegExp(LF_TRIM_TOKEN, 'gu'))) {
    if (!LF_TRIM_SKIP.has(m[0])) out.add(m[0]);
  }
  return out;
}

function lfDeclHead(text) {
  const m = new RegExp(String.raw`^\s*(${LF_TRIM_TOKEN})\s*:`, 'u')
    .exec(stripLfComments(text).trim());
  return m ? m[1] : null;
}

function lfResultIdents(text) {
  const m = new RegExp(String.raw`^\s*${LF_TRIM_TOKEN}\s*:\s*([\s\S]+?)\.\s*$`, 'u')
    .exec(stripLfComments(text).trim());
  if (!m) return null;
  const ty = m[1].trim();
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < ty.length; i += 1) {
    const ch = ty[i];
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    if (depth === 0 && ty.slice(i, i + 2) === '->') {
      parts.push(cur.trim());
      cur = '';
      i += 1;
      continue;
    }
    if (depth === 0 && ty[i] === '→') {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  const result = parts[parts.length - 1] || '';
  if (!result) return null;
  if (/^type\b/.test(result)) return new Set();
  return freeIdents(result);
}

function trimUnusedLfPrelude(prelude, seedText) {
  const src = String(prelude || '').trimEnd();
  if (!src) return src;
  const decls = enumerateDecls(src);
  if (!decls.length) return src;
  const S = freeIdents(seedText);
  const keep = decls.map((d) => d.kind !== 'lf');
  const heads = decls.map((d, i) => (keep[i] ? null : lfDeclHead(d.text)));
  const resIdents = decls.map((d, i) => (keep[i] ? null : lfResultIdents(d.text)));
  for (let i = 0; i < decls.length; i += 1) {
    if (keep[i]) continue;
    if (!heads[i] || resIdents[i] == null) {
      keep[i] = true;
      for (const id of freeIdents(decls[i].text)) S.add(id);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < decls.length; i += 1) {
      if (keep[i] || decls[i].kind !== 'lf') continue;
      const headHit = heads[i] && S.has(heads[i]);
      let resHit = false;
      for (const id of resIdents[i]) { if (S.has(id)) { resHit = true; break; } }
      if (!headHit && !resHit) continue;
      keep[i] = true;
      for (const id of freeIdents(decls[i].text)) {
        if (!S.has(id)) {
          S.add(id);
          changed = true;
        }
      }
      changed = true;
    }
  }
  const parts = [];
  for (let i = 0; i < decls.length; i += 1) {
    if (keep[i]) parts.push(String(decls[i].text).trim());
  }
  return parts.join('\n');
}

/** Certify-closure trim. Returns { code, targetStartLine, targetEndLine } or null. */
export function trimForCertify(spliced, thmName) {
  const src = String(spliced || '');
  if (!src || !thmName) return null;
  const decls = enumerateDecls(src);
  if (decls.length < 4) return null;
  const recNamesOf = (text) => {
    const out = [];
    for (const m of String(text).matchAll(/(?:^|\band\s+)(?:rec|proof)\s+([\p{L}_][\p{L}\p{N}_']*)/gu)) out.push(m[1]);
    return out;
  };
  const definedNamesOf = (d) => {
    const t = stripLfComments(d.text);
    switch (d.kind) {
      case 'rec': case 'proof': case 'and-rec':
        return recNamesOf(t);
      case 'schema': {
        const m = /^\s*schema\s+([\p{L}_][\p{L}\p{N}_']*)/u.exec(t);
        return m ? [m[1]] : null;
      }
      case 'inductive': case 'coinductive': case 'stratified': case 'typedef': case 'and-inductive': {
        const out = [];
        for (const m of t.matchAll(/(?:^|\band\s+)(?:LF\s+)?(?:inductive\s+|coinductive\s+|stratified\s+|typedef\s+)?([\p{L}_][\p{L}\p{N}_']*)\s*:/gu)) out.push(m[1]);
        for (const m of t.matchAll(/(?:^|\n)\s*\|\s*(\S+)\s*:/g)) out.push(m[1]);
        return out.length ? out : null;
      }
      case 'lf': {
        const h = lfDeclHead(t);
        return h ? [h] : null;
      }
      default:
        return null;
    }
  };
  let targetIdx = -1;
  const defined = decls.map((d, i) => {
    const names = definedNamesOf(d);
    if (names && names.includes(thmName)) targetIdx = i;
    return names;
  });
  if (targetIdx < 0) return null;
  const S = freeIdents(decls[targetIdx].text);
  const keep = decls.map((d, i) => i === targetIdx || defined[i] == null);
  for (let i = 0; i < decls.length; i += 1) {
    if (keep[i] && i !== targetIdx && defined[i] == null) {
      for (const id of freeIdents(decls[i].text)) S.add(id);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < decls.length; i += 1) {
      if (keep[i]) continue;
      if (!defined[i].some((n) => S.has(n))) continue;
      keep[i] = true;
      for (const id of freeIdents(decls[i].text)) {
        if (!S.has(id)) { S.add(id); changed = true; }
      }
      changed = true;
    }
  }
  const parts = [];
  let targetStartLine = 1;
  let targetEndLine = 1;
  let line = 1;
  for (let i = 0; i < decls.length; i += 1) {
    if (!keep[i]) continue;
    const text = String(decls[i].text).trim();
    if (i === targetIdx) {
      targetStartLine = line;
      targetEndLine = line + text.split('\n').length - 1;
    }
    parts.push(text);
    line += text.split('\n').length + 1;
  }
  return { code: parts.join('\n\n') + '\n', targetStartLine, targetEndLine };
}

function nonLfSeedText(prefix, decl) {
  const parts = [];
  for (const d of enumerateDecls(prefix)) {
    if (d.kind !== 'lf') parts.push(String(d.text || '').trim());
  }
  if (decl) parts.push(String(decl).trim());
  return parts.join('\n');
}

function stripHoledSiblingDecls(filePrefix, targetName) {
  const re = /\b(?:rec|proof)\s+([\p{L}_][\p{L}\p{N}_']*)\s*:[\s\S]*?;\s*/gu;
  return String(filePrefix || '').replace(re, (block, name) => {
    if (name === targetName) return block;
    return /\?/.test(block) ? '' : block;
  }).trim();
}

export function holesForTheorem(code, thm, holes) {
  const range = theoremDeclRange(code, thm && thm.name);
  if (!range) return holes;
  return holes.filter((h) => h.line >= range.start && h.line <= range.end);
}

/** Map prove-orchestration holes onto editor-document hole hits. */
export function mapProveHolesToDocHits(parsed, proveCode, thmName, docHits) {
  const scoped = holesForTheorem(proveCode, { name: thmName }, parsed || []);
  if (!scoped.length || !docHits?.length) return [];
  const hits = [...docHits].sort((a, b) =>
    (a.hole.line - b.hole.line) || ((a.hole.col || 1) - (b.hole.col || 1)));
  const out = [];
  for (let i = 0; i < Math.min(hits.length, scoped.length); i += 1) {
    out.push({
      ...scoped[i],
      line: hits[i].hole.line,
      col: hits[i].hole.col || 1,
    });
  }
  return out;
}

export function normalizeHoleCol(code, hole) {
  if (!hole) return hole;
  const lines = String(code || '').split('\n');
  const ln = lines[hole.line - 1];
  if (!ln) return hole;
  const qi = ln.indexOf('?');
  if (qi >= 0 && qi + 1 !== hole.col) return { ...hole, col: qi + 1 };
  return hole;
}

export function holeLineIndent(code, hole) {
  const lines = String(code || '').split('\n');
  const ln = lines[hole.line - 1] || '';
  const qi = ln.indexOf('?');
  if (qi > 0) return ln.slice(0, qi);
  const m = /^(\s*)/.exec(ln);
  return m ? m[1] : '';
}

function offsetOfLineCol(code, line, col) {
  let idx = 0;
  for (let l = 1; l < line; l += 1) {
    const nl = code.indexOf('\n', idx);
    if (nl === -1) return -1;
    idx = nl + 1;
  }
  return idx + (col - 1);
}

export function holeByteOffset(code, hole) {
  const h = normalizeHoleCol(code, hole);
  let off = offsetOfLineCol(code, h.line, h.col);
  if (off < 0 || off >= code.length || code.charAt(off) !== '?') {
    const ln = String(code || '').split('\n')[h.line - 1];
    const qi = ln ? ln.indexOf('?') : -1;
    if (qi >= 0) off = offsetOfLineCol(code, h.line, qi + 1);
  }
  return off;
}

/** Splice `text` over the hole's `?` in `code` (1-based line/col). */
export function spliceAtHole(code, hole, text) {
  const off = holeByteOffset(code, hole);
  if (off < 0 || off >= code.length || code.charAt(off) !== '?') return null;
  const lines = String(code || '').split('\n');
  const ln = lines[hole.line - 1] || '';
  const qi = ln.indexOf('?');
  const pre = qi > 0 ? ln.slice(0, qi) : '';
  const ind = /^\s*$/.test(pre) ? pre : '';
  const cont = ind || '  ';
  const body = String(text || '').split('\n').map((line, i) => {
    const t = line.trim();
    if (!t) return '';
    return (i === 0 && !ind) ? t : cont + t;
  }).join('\n');
  return code.slice(0, off) + body + code.slice(off + 1);
}
