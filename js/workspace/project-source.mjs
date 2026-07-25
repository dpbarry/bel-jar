/**
 * Project source — authored ESM for the shell build.
 * Path/development policy: js/editor-src/project-paths.mjs + semantic/development.mjs.
 * Run/assemble helpers live here. Bundled via workspace.mjs → workspace.js.
 */
import {
  fileBase,
  isExtensionless,
  isCfgPath,
  isElfPath,
  isBelPath,
  isSignaturePath,
  isProjectSourcePath,
  isCfgEntryToken,
  isCfgSourceEntry,
} from '../editor-src/project-paths.mjs';
import {
  dirOf,
  baseNoExt,
  joinPath,
  parseCfg,
  cfgByDirFromFiles,
  allSignaturePaths,
  resolveCfgOrder,
  inferActiveCfgForDir,
  inferActiveCfgByDir,
  defaultActiveCfgForDir,
  defaultActiveCfgsForDir,
  activeCfgResolver,
  resolveOwningActiveCfg,
  developmentForFile,
  cfgPathForActive,
  visibilityPaths,
  workspaceDevelopments,
  orderedDevelopmentPaths,
  preludePathsFor,
  listDevelopmentMembers,
} from '../editor-src/semantic/development.mjs';

export function concat(files) {
  const parts = [];
  const spans = [];
  let cursor = 1;
  for (const f of files) {
    const text = String(f.text != null ? f.text : '');
    const lineCount = text.split('\n').length;
    spans.push({
      id: f.id,
      name: f.name,
      startLine: cursor,
      endLine: cursor + lineCount - 1,
    });
    parts.push(text);
    cursor += lineCount + 1;
  }
  return { code: parts.join('\n\n'), spans };
}

export function mapLine(spans, line) {
  if (!spans || !isFinite(line)) return null;
  for (const s of spans) {
    if (line >= s.startLine && line <= s.endLine) {
      return { id: s.id, name: s.name, line: line - s.startLine + 1 };
    }
  }
  return null;
}

export function remapLocations(text, spans) {
  if (!text || !spans || !spans.length) return text;
  let out = String(text);

  out = out.replace(
    /File\s+"([^"]*)"\s*,\s*line\s+(\d+)/g,
    (whole, _fname, line) => {
      const hit = mapLine(spans, +line);
      if (!hit) return whole;
      return `File "${hit.name}", line ${hit.line}`;
    },
  );

  out = out.replace(
    /([^\s:"]+)\.bel:(\d+)\.(\d+)(?:-(\d+)\.(\d+))?:/g,
    (whole, _fname, sl, sc, el, ec) => {
      const start = mapLine(spans, +sl);
      if (!start) return whole;
      let token = `${start.name}:${start.line}.${sc}`;
      if (el != null) {
        const end = mapLine(spans, +el);
        if (!end || end.id !== start.id) return whole;
        token += `-${end.line}.${ec}`;
      }
      return `${token}:`;
    },
  );

  out = out.replace(
    /(^|\n)(\s*)at line\s+(\d+),(\s*characters?\s+\d+(?:-\d+)?)/g,
    (whole, lead, ws, line, rest) => {
      const hit = mapLine(spans, +line);
      if (!hit) return whole;
      return `${lead}${ws}in ${hit.name}, at line ${hit.line},${rest}`;
    },
  );

  return out;
}

export function pickCfgForDir(cfgByDir, dir, paths, activeName) {
  const map = cfgByDir[dir];
  if (!map) return null;
  const names = Object.keys(map);
  if (!names.length) return null;
  const pathSet = {};
  for (const p of paths) {
    if (dirOf(p) === dir) pathSet[p] = true;
  }
  if (activeName) {
    for (const name of names) {
      const ord = resolveCfgOrder(dir, map[name], cfgByDir, pathSet, new Set());
      if (ord.indexOf(activeName) !== -1) return map[name];
    }
  }
  if (names.length === 1) return map[names[0]];
  let best = null;
  let bestCount = -1;
  for (const name of names) {
    const resolved = resolveCfgOrder(dir, map[name], cfgByDir, pathSet, new Set());
    if (resolved.length > bestCount) {
      bestCount = resolved.length;
      best = map[name];
    }
  }
  return best;
}

export function orderSignaturePaths(paths, cfgByDir) {
  cfgByDir = cfgByDir || {};
  const byDir = {};
  for (const p of paths) {
    const d = dirOf(p);
    if (!byDir[d]) byDir[d] = [];
    byDir[d].push(p);
  }
  const out = [];
  for (const dir of Object.keys(byDir).sort()) {
    const inDir = byDir[dir].slice().sort();
    const cfgText = pickCfgForDir(cfgByDir, dir, paths, null);
    if (cfgText) {
      const pathSet = Object.fromEntries(inDir.map((p) => [p, true]));
      const ordered = resolveCfgOrder(dir, cfgText, cfgByDir, pathSet, new Set());
      const seen = {};
      for (const p of ordered) {
        if (!seen[p]) { seen[p] = true; out.push(p); }
      }
      for (const p of inDir) {
        if (!seen[p]) out.push(p);
      }
    } else {
      out.push(...inDir);
    }
  }
  return out;
}

export function orderBelPaths(belPaths, cfgByDir) {
  cfgByDir = cfgByDir || {};
  const byDir = {};
  for (const p of belPaths) {
    const d = dirOf(p);
    if (!byDir[d]) byDir[d] = [];
    byDir[d].push(p);
  }
  const out = [];
  for (const dir of Object.keys(byDir).sort()) {
    const files = byDir[dir].slice().sort();
    const cfgText = pickCfgForDir(cfgByDir, dir, belPaths, null);
    if (cfgText) {
      const belSet = Object.fromEntries(files.map((p) => [p, true]));
      const ordered = resolveCfgOrder(dir, cfgText, cfgByDir, belSet, new Set());
      const seen = Object.fromEntries(ordered.map((p) => [p, true]));
      out.push(...ordered);
      for (const p of files) {
        if (!seen[p]) out.push(p);
      }
    } else {
      out.push(...files);
    }
  }
  return out;
}

export function developmentFilesFor(files, activeId, getText, options) {
  const ordered = orderedDevelopmentPaths(files, activeId, getText, options);
  const out = [];
  for (const name of ordered) {
    for (const f of files) {
      if (f.name === name) { out.push(f); break; }
    }
  }
  return out;
}

export function orderedPathsForCfg(files, cfgPath, getText) {
  if (!cfgPath) return [];
  const dir = dirOf(cfgPath);
  const base = cfgPath.slice(cfgPath.lastIndexOf('/') + 1);
  const paths = [];
  for (const f of files) {
    const fn = String(f.name || '');
    if (dirOf(fn) === dir && isSignaturePath(fn)) paths.push(fn);
  }
  const cfgByDir = cfgByDirFromFiles(files, getText);
  const map = cfgByDir[dir];
  if (!map || !map[base]) return [];
  const pathSet = Object.fromEntries(paths.map((p) => [p, true]));
  return resolveCfgOrder(dir, map[base], cfgByDir, pathSet, new Set());
}

export function developmentFilesForCfg(files, cfgPath, getText) {
  const ordered = orderedPathsForCfg(files, cfgPath, getText);
  const out = [];
  for (const name of ordered) {
    for (const f of files) {
      if (f.name === name) { out.push(f); break; }
    }
  }
  return out;
}

export function inferDefaultCfgPath(files, getText) {
  const cfgFiles = files.filter((f) => String(f.name || '').toLowerCase().endsWith('.cfg'));
  if (!cfgFiles.length) return null;
  const cfgByDir = cfgByDirFromFiles(files, getText);
  const sigPaths = allSignaturePaths(files);
  let best = null;
  let bestCount = -1;
  for (const cfg of cfgFiles) {
    const cfgPath = cfg.name;
    const dir = dirOf(cfgPath);
    const base = cfgPath.slice(cfgPath.lastIndexOf('/') + 1);
    const map = cfgByDir[dir];
    if (!map || !map[base]) continue;
    const pathSet = {};
    for (const p of sigPaths) {
      if (dirOf(p) === dir) pathSet[p] = true;
    }
    const ord = resolveCfgOrder(dir, map[base], cfgByDir, pathSet, new Set());
    if (!best || ord.length > bestCount || (ord.length === bestCount && cfgPath < best)) {
      bestCount = ord.length;
      best = cfgPath;
    }
  }
  return best;
}

export function preludeFilesFor(files, activeId, getText, options) {
  const paths = preludePathsFor(files, activeId, getText, options || {});
  if (!paths.length) return [];
  const out = [];
  for (const name of paths) {
    for (const f of files) {
      if (f.name === name) { out.push(f); break; }
    }
  }
  return out;
}

const GLOBAL_FILE_PRAGMA_LINE =
  /^\s*--(?:nostrengthen|coverage|warncoverage)\s*\.?\s*(?:%.*)?$/i;

export function peelGlobalFilePragmas(fileCode) {
  const text = String(fileCode != null ? fileCode : '');
  const lines = text.split('\n');
  let start = -1;
  if (lines[0] && GLOBAL_FILE_PRAGMA_LINE.test(lines[0])) start = 0;
  else if (lines[0] && lines[0].trim() === '' && lines[1] && GLOBAL_FILE_PRAGMA_LINE.test(lines[1])) start = 1;
  if (start < 0) {
    return { hoisted: '', rest: text, hoistLineCount: 0 };
  }
  const hoisted = [];
  let i = start;
  while (i < lines.length && GLOBAL_FILE_PRAGMA_LINE.test(lines[i])) {
    hoisted.push(lines[i]);
    i += 1;
  }
  while (i < lines.length && lines[i].trim() === '') i += 1;
  const hoistedText = hoisted.join('\n');
  return {
    hoisted: hoistedText,
    rest: lines.slice(i).join('\n'),
    hoistLineCount: hoistedText ? hoistedText.split('\n').length : 0,
  };
}

function peelGlobalFilePragmasInPlace(fileCode) {
  const text = String(fileCode != null ? fileCode : '');
  const peeled = peelGlobalFilePragmas(text);
  if (!peeled.hoisted) return { hoisted: '', body: text };
  const lines = text.split('\n');
  let blanked = 0;
  for (let i = 0; i < lines.length && blanked < peeled.hoistLineCount; i += 1) {
    if (GLOBAL_FILE_PRAGMA_LINE.test(lines[i])) {
      lines[i] = '';
      blanked += 1;
    }
  }
  return { hoisted: peeled.hoisted, body: lines.join('\n') };
}

function joinCheckerParts(parts) {
  return parts.filter((p) => p != null && p !== '').join('\n\n');
}

export function assembleCheckerCode(fileCode, prelude) {
  if (!prelude) {
    return { code: String(fileCode != null ? fileCode : ''), prelude: null };
  }
  const peeled = peelGlobalFilePragmasInPlace(fileCode);
  if (!peeled.hoisted) {
    return { code: joinCheckerParts([prelude.code, peeled.body]), prelude };
  }
  const hoistOffset = peeled.hoisted.split('\n').length + 1;
  const adjustedPrelude = {
    code: prelude.code,
    spans: prelude.spans.map((s) => ({
      id: s.id,
      name: s.name,
      startLine: s.startLine + hoistOffset,
      endLine: s.endLine + hoistOffset,
    })),
    offsetLines: prelude.offsetLines + hoistOffset,
    names: prelude.names,
  };
  return {
    code: joinCheckerParts([peeled.hoisted, prelude.code, peeled.body]),
    prelude: adjustedPrelude,
  };
}

export function assembleProjectCode(files) {
  const hoistedLines = [];
  const stripped = [];
  for (const f of files) {
    const peeled = peelGlobalFilePragmas(String(f.text != null ? f.text : ''));
    if (peeled.hoisted) {
      for (const line of peeled.hoisted.split('\n')) {
        if (line && hoistedLines.indexOf(line) === -1) hoistedLines.push(line);
      }
    }
    stripped.push({ id: f.id, name: f.name, text: peeled.rest });
  }
  const hoisted = hoistedLines.join('\n');
  const parts = [];
  const spans = [];
  let cursor = hoisted ? hoistedLines.length + 2 : 1;
  for (const s of stripped) {
    const text = String(s.text != null ? s.text : '');
    const lineCount = text.split('\n').length;
    spans.push({
      id: s.id,
      name: s.name,
      startLine: cursor,
      endLine: cursor + lineCount - 1,
    });
    parts.push(text);
    cursor += lineCount + 1;
  }
  const body = parts.join('\n\n');
  return {
    code: hoisted ? joinCheckerParts([hoisted, body]) : body,
    spans,
  };
}

export function buildPrelude(files, activeId, getText, options) {
  const pre = preludeFilesFor(files, activeId, getText, options);
  if (!pre.length) return null;
  const parts = [];
  const spans = [];
  let cursor = 1;
  for (const f of pre) {
    const text = String(getText(f.id) != null ? getText(f.id) : '');
    const lineCount = text.split('\n').length;
    spans.push({ id: f.id, name: f.name, startLine: cursor, endLine: cursor + lineCount - 1 });
    parts.push(text);
    cursor += lineCount + 1;
  }
  const last = spans[spans.length - 1];
  return {
    code: parts.join('\n\n'),
    spans,
    offsetLines: last.endLine + 1,
  };
}

function preludeFileAt(spans, line) {
  for (const s of spans) {
    if (line >= s.startLine && line <= s.endLine) {
      return { name: s.name, line: line - s.startLine + 1 };
    }
  }
  return null;
}

function messageAfter(text, index) {
  const lines = String(text).slice(index, index + 400).split('\n');
  for (const line of lines) {
    const t = line.trim().replace(/^(Error|Warning):\s*/i, '');
    if (t && !/^[-^~\s]+$/.test(t)) return t.slice(0, 160);
  }
  return '';
}

export function shiftCheckerOutput(text, prelude) {
  if (!text || !prelude) return { text: text || '', preludeIssues: [] };
  const offset = prelude.offsetLines;
  const issues = [];
  const seen = new Set();

  function noteIssue(hit, src, index) {
    const k = `${hit.name}:${hit.line}`;
    if (seen.has(k)) return;
    seen.add(k);
    issues.push({ name: hit.name, line: hit.line, message: messageAfter(src, index) });
  }

  let out = String(text);

  out = out.replace(/File\s+"([^"]*)"\s*,\s*line\s+(\d+)/g, (whole, fname, line, idx, src) => {
    const L = +line;
    if (L > offset) return `File "${fname}", line ${L - offset}`;
    const hit = preludeFileAt(prelude.spans, L);
    if (hit) noteIssue(hit, src, idx + whole.length);
    return `(project prelude ${hit ? hit.name : '?'} line ${hit ? hit.line : L})`;
  });

  out = out.replace(/([^\s:"]+)\.bel:(\d+)\.(\d+)(?:-(\d+)\.(\d+))?:/g,
    (whole, fname, sl, sc, el, ec, idx, src) => {
      const SL = +sl;
      if (SL > offset) {
        const EL = el != null ? (+el - offset) : null;
        if (el != null && EL < 1) return whole;
        return `${fname}.bel:${SL - offset}.${sc}${el != null ? `-${EL}.${ec}` : ''}:`;
      }
      const hit = preludeFileAt(prelude.spans, SL);
      if (hit) noteIssue(hit, src, idx + whole.length);
      return `(project prelude ${hit ? hit.name : '?'} line ${hit ? hit.line : SL})`;
    });

  out = out.replace(/(^|\n)(\s*)at line\s+(\d+),(\s*characters?\s+\d+(?:-\d+)?)/g,
    (whole, lead, ws, line, rest, idx, src) => {
      const L = +line;
      if (L > offset) return `${lead}${ws}at line ${L - offset},${rest}`;
      const hit = preludeFileAt(prelude.spans, L);
      if (hit) noteIssue(hit, src, idx + whole.length);
      return `${lead}${ws}(project prelude ${hit ? hit.name : '?'} line ${hit ? hit.line : L})${rest.replace(/^\s*/, ' ')}`;
    });

  return { text: out, preludeIssues: issues };
}

export function scanProjectText(files, query, limit) {
  const cap = limit || 60;
  const q = String(query || '').toLowerCase();
  if (!q) return [];
  const out = [];
  for (const f of files) {
    const text = String(f.text != null ? f.text : '');
    const lines = text.split('\n');
    let offset = 0;
    for (let li = 0; li < lines.length; li += 1) {
      const lower = lines[li].toLowerCase();
      let k = lower.indexOf(q);
      while (k !== -1) {
        out.push({
          id: f.id,
          name: f.name,
          line: li + 1,
          col: k + 1,
          lineText: lines[li].trim(),
          from: offset + k,
          to: offset + k + q.length,
        });
        if (out.length >= cap) return out;
        k = lower.indexOf(q, k + Math.max(1, q.length));
      }
      offset += lines[li].length + 1;
    }
  }
  return out;
}

export function reorder(files, id, delta) {
  const idx = files.findIndex((f) => f.id === id);
  if (idx === -1) return files;
  const to = Math.max(0, Math.min(files.length - 1, idx + (delta || 0)));
  if (to === idx) return files;
  const next = files.slice();
  const entry = next.splice(idx, 1)[0];
  next.splice(to, 0, entry);
  return next;
}

export const ProjectSource = {
  concat,
  mapLine,
  remapLocations,
  reorder,
  dirOf,
  joinPath,
  baseNoExt,
  fileBase,
  isExtensionless,
  isCfgPath,
  isElfPath,
  isBelPath,
  isSignaturePath,
  isProjectSourcePath,
  isCfgEntryToken,
  isCfgSourceEntry,
  parseCfg,
  resolveCfgOrder,
  allSignaturePaths,
  orderBelPaths,
  orderSignaturePaths,
  pickCfgForDir,
  cfgByDirFromFiles,
  developmentForFile,
  resolveOwningActiveCfg,
  activeCfgResolver,
  defaultActiveCfgForDir,
  defaultActiveCfgsForDir,
  orderedDevelopmentPaths,
  visibilityPaths,
  listDevelopmentMembers,
  developmentFilesFor,
  orderedPathsForCfg,
  developmentFilesForCfg,
  cfgPathForActive,
  workspaceDevelopments,
  inferDefaultCfgPath,
  inferActiveCfgForDir,
  inferActiveCfgByDir,
  preludePathsFor,
  preludeFilesFor,
  buildPrelude,
  assembleCheckerCode,
  assembleProjectCode,
  peelGlobalFilePragmas,
  shiftCheckerOutput,
  scanProjectText,
};

const g = typeof window !== 'undefined' ? window : globalThis;
g.ProjectSource = ProjectSource;
g.BelJarProjectSource = g.ProjectSource
