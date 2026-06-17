// Project prelude — Beluga .cfg lists .elf (LF) and .bel files in load order.
// Checking a .bel file means loading every predecessor from the same folder.
import { Text } from '@codemirror/state';
import { parser } from './beluga-parser.js';
import { walkTree } from './bel-walk.mjs';

export function dirOf(name) {
  const i = String(name || '').lastIndexOf('/');
  return i === -1 ? '' : name.slice(0, i);
}

// File base name without directory or extension. Lets an orphan `par-red.bel`
// (not listed in the .cfg) borrow the load position of its sibling `par-red.elf`
// (which is listed), so it still sees the project prelude.
function baseNoExt(name) {
  const s = String(name || '');
  const base = s.slice(s.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot === -1 ? base : base.slice(0, dot);
}

function joinPath(dir, entry) {
  if (!dir) return entry;
  if (!entry) return dir;
  return `${dir}/${entry}`;
}

export function parseCfg(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (!t || t.charAt(0) === '%') continue;
    out.push(t);
  }
  return out;
}

function resolveCfgOrder(cfgDir, cfgText, cfgByDir, pathSet, seenCfg) {
  seenCfg = seenCfg || new Set();
  const key = `${cfgDir}\0${cfgText ? cfgText.length : 0}`;
  if (seenCfg.has(key)) return [];
  seenCfg.add(key);
  const ordered = [];
  const seen = new Set();
  for (const entry of parseCfg(cfgText)) {
    const low = entry.toLowerCase();
    if (low.endsWith('.cfg')) {
      const slash = entry.lastIndexOf('/');
      const subDir = slash === -1 ? cfgDir : joinPath(cfgDir, entry.slice(0, slash));
      const subName = slash === -1 ? entry : entry.slice(slash + 1);
      const subMap = cfgByDir[subDir];
      if (subMap?.[subName]) {
        for (const p of resolveCfgOrder(subDir, subMap[subName], cfgByDir, pathSet, seenCfg)) {
          if (!seen.has(p)) { seen.add(p); ordered.push(p); }
        }
      }
    } else if (low.endsWith('.bel') || low.endsWith('.elf')) {
      const full = joinPath(cfgDir, entry);
      if (pathSet[full] && !seen.has(full)) {
        seen.add(full);
        ordered.push(full);
      }
    }
  }
  return ordered;
}

function pickCfgForDir(cfgByDir, dir, paths, activeName) {
  const map = cfgByDir[dir];
  if (!map) return null;
  const names = Object.keys(map);
  if (!names.length) return null;
  const inDir = Object.fromEntries(paths.filter((p) => dirOf(p) === dir).map((p) => [p, true]));
  if (activeName) {
    for (const cfgName of names) {
      const ordered = resolveCfgOrder(dir, map[cfgName], cfgByDir, inDir, new Set());
      if (ordered.indexOf(activeName) !== -1) return map[cfgName];
    }
  }
  if (names.length === 1) return map[names[0]];
  let best = null;
  let bestCount = -1;
  for (const cfgName of names) {
    const resolved = resolveCfgOrder(dir, map[cfgName], cfgByDir, inDir, new Set());
    if (resolved.length > bestCount) { bestCount = resolved.length; best = map[cfgName]; }
  }
  return best;
}

export function orderBelPaths(belPaths, cfgByDir = {}) {
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
      const pathSet = Object.fromEntries(files.map((p) => [p, true]));
      const ordered = resolveCfgOrder(dir, cfgText, cfgByDir, pathSet, new Set());
      const seen = new Set(ordered);
      for (const p of ordered) out.push(p);
      for (const p of files) if (!seen.has(p)) out.push(p);
    } else {
      for (const p of files) out.push(p);
    }
  }
  return out;
}

export function cfgByDirFromFiles(files, getText) {
  const cfgByDir = {};
  for (const f of files) {
    const n = String(f.name || '');
    if (!n.toLowerCase().endsWith('.cfg')) continue;
    const dir = dirOf(n);
    const base = n.slice(n.lastIndexOf('/') + 1);
    if (!cfgByDir[dir]) cfgByDir[dir] = {};
    cfgByDir[dir][base] = String(getText(f.id) ?? '');
  }
  return cfgByDir;
}

export function preludeFilesFor(files, activeId, getText) {
  const active = files.find((f) => f.id === activeId);
  // A project member is any .bel or .elf file. An .elf prelude (Twelf-style LF,
  // e.g. lam.elf) must load ahead of the files that use it, exactly like a .bel.
  if (!active || !/\.(?:bel|elf)$/i.test(String(active.name))) return [];
  const dir = dirOf(active.name);
  const paths = files
    .filter((f) => {
      const n = String(f.name || '').toLowerCase();
      return dirOf(f.name) === dir && (n.endsWith('.bel') || n.endsWith('.elf'));
    })
    .map((f) => f.name);
  const cfgByDir = cfgByDirFromFiles(files, getText);
  const pathSet = Object.fromEntries(paths.map((p) => [p, true]));
  const cfgText = pickCfgForDir(cfgByDir, dir, paths, active.name);
  const ordered = cfgText
    ? resolveCfgOrder(dir, cfgText, cfgByDir, pathSet, new Set())
    : paths.filter((p) => /\.(?:bel|elf)$/i.test(p)).sort();
  let idx = ordered.indexOf(active.name);
  if (idx < 0) {
    // Not listed in the cfg — borrow the position of a same-base-name sibling
    // (e.g. editing par-red.bel while the cfg lists par-red.elf).
    const base = baseNoExt(active.name);
    idx = ordered.findIndex((p) => baseNoExt(p) === base);
  }
  if (idx <= 0) return [];
  return ordered.slice(0, idx)
    .map((name) => files.find((f) => f.name === name))
    .filter(Boolean);
}

// Per-text parse cache: a file's defined names (with positions + signatures)
// and its FREE identifier uses. Inactive files don't change while another file
// is edited, so text-keyed caching makes repeated lookups (hover, ctrl-click,
// palette, rename, find-refs) cheap.
const defsCache = new Map(); // text -> { names, defs, uses, sigByName }
const NAMES_CACHE_CAP = 128;

const KIND_LABELS = {
  LFDeclaration: 'LF type family',
  LFDatatypeDeclaration: 'LF type family',
  LFConstructor: 'LF constructor',
  CompConstructor: 'constructor',
  InductiveDeclaration: 'inductive type',
  StratifiedDeclaration: 'stratified type',
  CoinductiveDeclaration: 'coinductive type',
  RecDeclaration: 'recursive function',
  SchemaDeclaration: 'schema',
  TypedefDeclaration: 'typedef',
};

// The ": T" part of a declaration head — what hover shows as the source type.
function signatureFromDecl(src, declParent, ident) {
  const declText = src.slice(declParent.from, declParent.to);
  const colonAt = declText.indexOf(':', ident.to - declParent.from);
  if (colonAt === -1) return null;
  let body = declText.slice(colonAt + 1);
  const eq = body.indexOf('=');
  const semi = body.indexOf(';');
  const stop = eq >= 0 && semi >= 0 ? Math.min(eq, semi) : (eq >= 0 ? eq : semi);
  if (stop >= 0) body = body.slice(0, stop);
  const type = body.replace(/\s+/g, ' ').trim();
  if (!type) return null;
  return type.length > 160 ? `${type.slice(0, 159)}…` : type;
}

function parsedDefsOf(text) {
  const hit = defsCache.get(text);
  if (hit) return hit;
  let entry = { names: new Set(), defs: [], uses: [], sigByName: new Map() };
  try {
    const src = String(text);
    const doc = Text.of(src.split('\n'));
    const walk = walkTree(parser.parse(src), doc);
    const seenDef = new Set();
    for (const d of walk.definedNames) {
      // walkTree can note the same definition twice (decl + datatype walk).
      const key = `${d.from}:${d.name}`;
      if (seenDef.has(key)) continue;
      seenDef.add(key);
      entry.defs.push({ name: d.name, from: d.from, to: d.from + d.name.length });
      entry.names.add(d.name);
    }
    // Only FREE occurrences — a locally-bound use (binder shadowing) never
    // refers to a group-level definition. The walk also lists the defining
    // tokens themselves among uses; exclude them so uses = references.
    for (const u of walk.uses) {
      if (u.bound) continue;
      if (seenDef.has(`${u.from}:${u.name}`)) continue;
      entry.uses.push({ name: u.name, from: u.from, to: u.to });
    }
    for (const [name, defEntries] of walk.defMap) {
      const e = defEntries[0];
      if (!e || !e.declParent || !e.ident) continue;
      const type = signatureFromDecl(src, e.declParent, e.ident);
      if (type) {
        entry.sigByName.set(name, {
          type,
          label: KIND_LABELS[e.declParent.name] || 'declaration',
        });
      }
    }
  } catch {
    entry = { names: new Set(), defs: [], uses: [], sigByName: new Map() };
  }
  if (defsCache.size >= NAMES_CACHE_CAP) defsCache.clear();
  defsCache.set(text, entry);
  return entry;
}

export function usesOf(text) {
  return parsedDefsOf(text).uses;
}

function namesOf(text) {
  return parsedDefsOf(text).names;
}

export function defsOf(text) {
  return parsedDefsOf(text).defs;
}

// The active file's whole development group, in load order: cfg-ordered when a
// cfg covers it (includes .elf), else alphabetical signature files in its
// directory. Includes the active file itself.
export function groupFilesFor(files, activeId, getText) {
  const active = files.find((f) => f.id === activeId);
  if (!active) return [];
  const dir = dirOf(active.name);
  const paths = files
    .filter((f) => {
      const n = String(f.name || '').toLowerCase();
      return dirOf(f.name) === dir && (n.endsWith('.bel') || n.endsWith('.elf'));
    })
    .map((f) => f.name);
  const cfgByDir = cfgByDirFromFiles(files, getText);
  const pathSet = Object.fromEntries(paths.map((p) => [p, true]));
  const cfgText = pickCfgForDir(cfgByDir, dir, paths, active.name);
  let ordered = cfgText
    ? resolveCfgOrder(dir, cfgText, cfgByDir, pathSet, new Set())
    : paths.slice().sort();
  if (ordered.indexOf(active.name) === -1) ordered = ordered.concat([active.name]);
  return ordered
    .map((name) => files.find((f) => f.name === name))
    .filter(Boolean);
}

// Where is `name` defined elsewhere in the active file's group? Prefers the
// CLOSEST prelude definition (later files shadow earlier ones); falls back to
// the first definition in a file after the active one. Null when unknown.
export function findProjectDefinition(files, activeId, name, getText) {
  if (!name) return null;
  const group = groupFilesFor(files, activeId, getText);
  const activeIdx = group.findIndex((f) => f.id === activeId);
  let best = null;
  for (let i = 0; i < group.length; i++) {
    const f = group[i];
    if (f.id === activeId) continue;
    const def = defsOf(String(getText(f.id) ?? '')).find((d) => d.name === name);
    if (!def) continue;
    const hit = { fileId: f.id, fileName: f.name, from: def.from, to: def.to };
    if (activeIdx === -1 || i < activeIdx) best = hit; // later prelude wins
    else if (!best) best = hit;                        // first post-active hit
  }
  return best;
}

// Every definition in the group's OTHER files (the engine owns the active
// file's symbols) — palette "@" fodder. Deduped per file by name.
export function listGroupSymbols(files, activeId, getText) {
  const out = [];
  for (const f of groupFilesFor(files, activeId, getText)) {
    if (f.id === activeId) continue;
    const seen = new Set();
    for (const d of defsOf(String(getText(f.id) ?? ''))) {
      if (seen.has(d.name)) continue;
      seen.add(d.name);
      out.push({ name: d.name, fileId: f.id, fileName: f.name, from: d.from, to: d.to });
    }
  }
  return out;
}

// Source signature (": T" of the declaration head) for a name defined in
// another group file — the cross-file hover payload. Closest prelude wins.
export function findGroupSignature(files, activeId, name, getText) {
  if (!name) return null;
  const group = groupFilesFor(files, activeId, getText);
  const activeIdx = group.findIndex((f) => f.id === activeId);
  let best = null;
  for (let i = 0; i < group.length; i++) {
    const f = group[i];
    if (f.id === activeId) continue;
    const sig = parsedDefsOf(String(getText(f.id) ?? '')).sigByName.get(name);
    if (!sig) continue;
    const hit = { fileName: f.name, type: sig.type, label: sig.label };
    if (activeIdx === -1 || i < activeIdx) best = hit;
    else if (!best) best = hit;
  }
  return best;
}

function posToLineCol(text, from) {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < from && i < text.length; i++) {
    if (text[i] === '\n') { line += 1; lineStart = i + 1; }
  }
  const lineEnd = text.indexOf('\n', lineStart);
  return {
    line,
    col: from - lineStart + 1,
    lineText: text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trim(),
  };
}

// Occurrences of `name` in the group's OTHER files: free uses plus definitions
// (marked isDef). Files that DEFINE the name themselves are skipped unless they
// are the queried definition's own file — their occurrences bind locally.
export function groupReferencesFor(files, activeId, name, getText, { defFileId = null } = {}) {
  if (!name) return [];
  const out = [];
  for (const f of groupFilesFor(files, activeId, getText)) {
    if (f.id === activeId) continue;
    const text = String(getText(f.id) ?? '');
    const parsed = parsedDefsOf(text);
    const defines = parsed.defs.some((d) => d.name === name);
    // defFileId null = the ACTIVE file owns the definition; any other file
    // defining the same name shadows it, so its occurrences don't belong here.
    const isDefFile = defFileId != null && f.id === defFileId;
    if (defines && !isDefFile) continue;
    const occs = [];
    if (isDefFile) {
      for (const d of parsed.defs) {
        if (d.name === name) occs.push({ from: d.from, to: d.to, isDef: true });
      }
    }
    for (const u of parsed.uses) {
      if (u.name === name) occs.push({ from: u.from, to: u.to, isDef: false });
    }
    occs.sort((a, b) => a.from - b.from);
    for (const o of occs) {
      out.push({
        fileId: f.id,
        fileName: f.name,
        from: o.from,
        to: o.to,
        isDef: o.isDef,
        ...posToLineCol(text, o.from),
      });
    }
  }
  return out;
}

// Rename plan for the group's OTHER files. `defFileId` names the file owning
// the definition being renamed (null = the active file owns it); that file
// gets its definition tokens renamed too. Files defining the same name
// themselves are skipped — their occurrences refer to their own definition.
export function groupRenameEdits(files, activeId, name, getText, defFileId = null) {
  if (!name) return [];
  const plans = [];
  for (const f of groupFilesFor(files, activeId, getText)) {
    if (f.id === activeId) continue;
    const text = String(getText(f.id) ?? '');
    const parsed = parsedDefsOf(text);
    const defines = parsed.defs.some((d) => d.name === name);
    const isDefFile = defFileId != null && f.id === defFileId;
    if (defines && !isDefFile) continue;
    const edits = [];
    if (isDefFile) {
      for (const d of parsed.defs) if (d.name === name) edits.push({ from: d.from, to: d.to });
    }
    for (const u of parsed.uses) if (u.name === name) edits.push({ from: u.from, to: u.to });
    if (!edits.length) continue;
    edits.sort((a, b) => a.from - b.from);
    plans.push({ fileId: f.id, fileName: f.name, edits });
  }
  return plans;
}

// Apply position edits to a text (descending order so offsets stay valid).
export function applyTextEdits(text, edits, insert) {
  let out = String(text);
  const sorted = edits.slice().sort((a, b) => b.from - a.from);
  for (const e of sorted) {
    out = out.slice(0, e.from) + insert + out.slice(e.to);
  }
  return out;
}

// Would `name` collide with a definition somewhere in the group (other files)?
export function groupDefinesName(files, activeId, name, getText) {
  if (!name) return false;
  for (const f of groupFilesFor(files, activeId, getText)) {
    if (f.id === activeId) continue;
    if (parsedDefsOf(String(getText(f.id) ?? '')).names.has(name)) return true;
  }
  return false;
}

// Beluga accepts these only at the very start of the combined program. When a
// project prelude is prepended, peel them from the active file and reattach
// ahead of the prelude so checking matches standalone Beluga semantics.
const GLOBAL_FILE_PRAGMA_LINE =
  /^\s*--(?:nostrengthen|coverage|warncoverage)\s*\.?\s*(?:%.*)?$/i;

export function peelGlobalFilePragmas(fileCode) {
  const text = String(fileCode ?? '');
  const lines = text.split('\n');
  let start = -1;
  if (lines[0] && GLOBAL_FILE_PRAGMA_LINE.test(lines[0])) start = 0;
  else if (lines[0]?.trim() === '' && lines[1] && GLOBAL_FILE_PRAGMA_LINE.test(lines[1])) start = 1;
  if (start < 0) {
    return { hoisted: '', rest: text, hoistLineCount: 0 };
  }
  const hoisted = [];
  let i = start;
  while (i < lines.length && GLOBAL_FILE_PRAGMA_LINE.test(lines[i])) {
    hoisted.push(lines[i]);
    i++;
  }
  while (i < lines.length && lines[i].trim() === '') i++;
  const hoistedText = hoisted.join('\n');
  return {
    hoisted: hoistedText,
    rest: lines.slice(i).join('\n'),
    hoistLineCount: hoistedText ? hoistedText.split('\n').length : 0,
  };
}

function joinCheckerParts(parts) {
  return parts.filter((p) => p != null && p !== '').join('\n\n');
}

export function assembleCheckerCode(fileCode, prelude) {
  const { hoisted, rest, hoistLineCount } = peelGlobalFilePragmas(fileCode);
  if (!prelude) {
    return { code: joinCheckerParts([hoisted, rest]), prelude: null };
  }
  const hoistOffset = hoistLineCount ? hoistLineCount + 1 : 0;
  const adjustedPrelude = hoistOffset
    ? {
      ...prelude,
      spans: prelude.spans.map((s) => ({
        ...s,
        startLine: s.startLine + hoistOffset,
        endLine: s.endLine + hoistOffset,
      })),
      offsetLines: prelude.offsetLines + hoistOffset,
    }
    : prelude;
  return {
    code: joinCheckerParts([hoisted, prelude.code, rest]),
    prelude: adjustedPrelude,
  };
}

// Whole-project run: peel file-top global pragmas out of every file, prepend them
// once, then concatenate — same rule Beluga uses for a single development.
export function assembleProjectCode(files) {
  const hoistedLines = [];
  const stripped = [];
  for (const f of files) {
    const peeled = peelGlobalFilePragmas(String(f.text ?? ''));
    if (peeled.hoisted) {
      for (const line of peeled.hoisted.split('\n')) {
        if (line && !hoistedLines.includes(line)) hoistedLines.push(line);
      }
    }
    stripped.push({ id: f.id, name: f.name, text: peeled.rest });
  }
  const hoisted = hoistedLines.join('\n');
  const parts = [];
  const spans = [];
  let cursor = hoisted ? hoistedLines.length + 2 : 1;
  for (let i = 0; i < stripped.length; i++) {
    const text = String(stripped[i].text ?? '');
    const lineCount = text.split('\n').length;
    spans.push({
      id: stripped[i].id,
      name: stripped[i].name,
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

export function buildPrelude(files, activeId, getText) {
  const pre = preludeFilesFor(files, activeId, getText);
  if (!pre.length) return null;
  const parts = [];
  const spans = [];
  const names = new Set();
  let cursor = 1;
  for (const f of pre) {
    const text = String(getText(f.id) ?? '');
    const lineCount = text.split('\n').length;
    spans.push({ id: f.id, name: f.name, startLine: cursor, endLine: cursor + lineCount - 1 });
    parts.push(text);
    cursor += lineCount + 1;
    for (const n of namesOf(text)) names.add(n);
  }
  const last = spans[spans.length - 1];
  return {
    code: parts.join('\n\n'),
    spans,
    offsetLines: last.endLine + 1,
    names,
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
  const tail = text.slice(index, index + 400);
  for (const line of tail.split('\n')) {
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
    const key = `${hit.name}:${hit.line}`;
    if (seen.has(key)) return;
    seen.add(key);
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

  out = out.replace(/([^\s:"]+)\.(?:bel|elf):(\d+)\.(\d+)(?:-(\d+)\.(\d+))?:/g,
    (whole, fname, sl, sc, el, ec, idx, src) => {
      const SL = +sl;
      if (SL > offset) {
        const EL = el != null ? +el - offset : null;
        if (el != null && EL < 1) return whole;
        return `${fname}:${SL - offset}.${sc}${el != null ? `-${EL}.${ec}` : ''}:`;
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
