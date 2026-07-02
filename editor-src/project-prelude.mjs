// Project prelude — Beluga .cfg lists .elf (LF) and .bel files in load order.
// Cross-file visibility is governed by editor-src/development.mjs.
import { isSignaturePath } from './bel-paths.mjs';
import { Text } from '@codemirror/state';
import { parser } from './beluga-parser.js';
import { walkTree } from './bel-walk.mjs';
import { expandBelAliases, readAliasActivationMode } from './bel-aliases.mjs';
import { prepareEditorDoc, sanitizeEditorText } from './editor-doc-prep.mjs';
import { parseHoles } from './bel-holes.mjs';
import {
  developmentForFile,
  dirOf,
  preludePathsFor,
  resolveCfgOrder,
  visibilityPaths,
} from './development.mjs';

export { cfgByDirFromFiles, dirOf, parseCfg, developmentForFile, activeCfgResolver } from './development.mjs';

function pickCfgForDir(cfgByDir, dir, paths) {
  const map = cfgByDir[dir];
  if (!map) return null;
  const names = Object.keys(map);
  if (names.length === 1) return map[names[0]];
  let best = null;
  let bestCount = -1;
  const inDir = Object.fromEntries(paths.filter((p) => dirOf(p) === dir).map((p) => [p, true]));
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
    const cfgText = pickCfgForDir(cfgByDir, dir, belPaths);
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

function pathsToFiles(files, paths) {
  return paths
    .map((name) => files.find((f) => f.name === name))
    .filter(Boolean);
}

function referencePaths(dev) {
  if (!dev || !dev.paths.length) return [];
  if (dev.kind === 'module') return dev.paths;
  return visibilityPaths(dev);
}

export function preludeFilesFor(files, activeId, getText, options = {}) {
  return pathsToFiles(files, preludePathsFor(files, activeId, getText, options));
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

function firstChildNamed(node, name) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === name) return c;
  }
  return null;
}

function clampSignature(type) {
  const t = type.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > 160 ? `${t.slice(0, 159)}…` : t;
}

// The ": T" part of a declaration head — what hover shows as the source type.
// Schemas have no ":"; their body lives after "=" in the SchemaBody node (and
// itself contains ":"), so it must be read structurally, not by string search.
function signatureFromDecl(src, declParent, ident) {
  if (declParent.name === 'SchemaDeclaration') {
    const body = firstChildNamed(declParent, 'SchemaBody');
    return body ? clampSignature(src.slice(body.from, body.to)) : null;
  }
  const declText = src.slice(declParent.from, declParent.to);
  const colonAt = declText.indexOf(':', ident.to - declParent.from);
  if (colonAt === -1) return null;
  let body = declText.slice(colonAt + 1);
  const eq = body.indexOf('=');
  const semi = body.indexOf(';');
  const stop = eq >= 0 && semi >= 0 ? Math.min(eq, semi) : (eq >= 0 ? eq : semi);
  if (stop >= 0) body = body.slice(0, stop);
  return clampSignature(body);
}

// Match bel-editor mount: sanitize, alias expand, auto-indent for .bel/.elf.
export function editorTextForIndexing(text, fileName) {
  if (fileName && isSignaturePath(fileName)) {
    return prepareEditorDoc(text, fileName);
  }
  let src = sanitizeEditorText(text);
  if (fileName && readAliasActivationMode() === 'greedy' && isSignaturePath(fileName)) {
    src = expandBelAliases(src);
  }
  return src;
}

function parsedDefsOfSrc(src) {
  const hit = defsCache.get(src);
  if (hit) return hit;
  let entry = { names: new Set(), defs: [], uses: [], sigByName: new Map() };
  try {
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
  defsCache.set(src, entry);
  return entry;
}

function parsedDefsOfRaw(raw, fileName = null) {
  return parsedDefsOfSrc(editorTextForIndexing(raw, fileName));
}

export function usesOf(text, fileName = null) {
  return parsedDefsOfRaw(text, fileName).uses;
}

function namesOf(text, fileName = null) {
  return parsedDefsOfRaw(text, fileName).names;
}

export function defsOf(text, fileName = null) {
  return parsedDefsOfRaw(text, fileName).defs;
}

// Prelude predecessors + active file — the IDE signature/hover visibility scope.
export function groupFilesFor(files, activeId, getText, options = {}) {
  const dev = developmentForFile(files, activeId, getText, options);
  return pathsToFiles(files, visibilityPaths(dev));
}

function moduleGroupFilesFor(files, activeId, getText, options = {}) {
  const dev = developmentForFile(files, activeId, getText, options);
  return pathsToFiles(files, referencePaths(dev));
}

// Module group files in cfg / development order (for reference listing).
export function referenceGroupFilesFor(files, activeId, getText, options = {}) {
  return moduleGroupFilesFor(files, activeId, getText, options);
}

// ALL members of the active file's development (module: every cfg member, in
// load order; standalone: the file alone) — the view-INDEPENDENT scope for
// cross-file STRUCTURE (dependency graph, used-by, impact, source signature).
// Distinct from groupFilesFor, which is the prelude-PREFIX hover scope: structure
// must read identically from any member, so it spans the whole development, not
// just predecessors of whichever file happens to be active.
export function developmentFilesFor(files, activeId, getText, options = {}) {
  return moduleGroupFilesFor(files, activeId, getText, options);
}

// Source signature (": T" of the head) of `name` as defined in a SPECIFIC file's
// text. Unlike findGroupSignature, it does not skip any "active" file — point it
// at the defining file and it reads it. Used by cross-file inspect, where the
// symbol's own file is known (so the signature must come from that file, even
// though findGroupSignature would skip it as the queried id).
export function sourceSignatureOf(text, name, fileName = null) {
  if (!name) return null;
  return parsedDefsOfRaw(String(text ?? ''), fileName).sigByName.get(name) || null;
}

// Where is `name` defined elsewhere in the active file's group? Prefers the
// CLOSEST prelude definition (later files shadow earlier ones); falls back to
// the first definition in a file after the active one. Null when unknown.
export function findProjectDefinition(files, activeId, name, getText, options = {}) {
  if (!name) return null;
  const group = moduleGroupFilesFor(files, activeId, getText, options);
  const activeIdx = group.findIndex((f) => f.id === activeId);
  let best = null;
  for (let i = 0; i < group.length; i++) {
    const f = group[i];
    if (f.id === activeId) continue;
    const def = defsOf(String(getText(f.id) ?? ''), f.name).find((d) => d.name === name);
    if (!def) continue;
    const hit = { fileId: f.id, fileName: f.name, from: def.from, to: def.to };
    if (activeIdx === -1 || i < activeIdx) best = hit; // later prelude wins
    else if (!best) best = hit;                        // first post-active hit
  }
  return best;
}

// Cross-file definition lookup over the hover/IDE visibility scope (prelude + active).
export function findGroupDefinition(files, activeId, name, getText, options = {}) {
  if (!name) return null;
  const group = groupFilesFor(files, activeId, getText, options);
  const activeIdx = group.findIndex((f) => f.id === activeId);
  let best = null;
  for (let i = 0; i < group.length; i++) {
    const f = group[i];
    if (f.id === activeId) continue;
    const def = defsOf(String(getText(f.id) ?? ''), f.name).find((d) => d.name === name);
    if (!def) continue;
    const hit = { fileId: f.id, fileName: f.name, from: def.from, to: def.to };
    if (activeIdx === -1 || i < activeIdx) best = hit;
    else if (!best) best = hit;
  }
  return best;
}

// ALL cross-file definitions of `name` in the active file's group (one per
// defining file, excluding the active file), ordered closest-prelude-first then
// post-active. Backs go-to-def disambiguation when a name is defined in more
// than one visible file. `findProjectDefinition` returns the single best of
// these; this returns every candidate so the UI can offer a chooser.
export function findProjectDefinitions(files, activeId, name, getText, options = {}) {
  if (!name) return [];
  const group = moduleGroupFilesFor(files, activeId, getText, options);
  const activeIdx = group.findIndex((f) => f.id === activeId);
  const before = [];
  const after = [];
  for (let i = 0; i < group.length; i++) {
    const f = group[i];
    if (f.id === activeId) continue;
    const def = defsOf(String(getText(f.id) ?? ''), f.name).find((d) => d.name === name);
    if (!def) continue;
    const hit = { fileId: f.id, fileName: f.name, from: def.from, to: def.to };
    if (activeIdx === -1 || i < activeIdx) before.push(hit);
    else after.push(hit);
  }
  // Closest prelude (latest before the active file) first, then post-active.
  before.reverse();
  return before.concat(after);
}

// Every definition in the group's OTHER files (the engine owns the active
// file's symbols) — palette "@" fodder. Deduped per file by name.
export function listGroupSymbols(files, activeId, getText, options = {}) {
  const out = [];
  for (const f of groupFilesFor(files, activeId, getText, options)) {
    if (f.id === activeId) continue;
    const seen = new Set();
    for (const d of defsOf(String(getText(f.id) ?? ''), f.name)) {
      if (seen.has(d.name)) continue;
      seen.add(d.name);
      out.push({ name: d.name, fileId: f.id, fileName: f.name, from: d.from, to: d.to });
    }
  }
  return out;
}

// Source signature (": T" of the declaration head) for a name defined in
// another group file — the cross-file hover payload. Closest prelude wins.
export function findGroupSignature(files, activeId, name, getText, options = {}) {
  if (!name) return null;
  const group = groupFilesFor(files, activeId, getText, options);
  const activeIdx = group.findIndex((f) => f.id === activeId);
  let best = null;
  for (let i = 0; i < group.length; i++) {
    const f = group[i];
    if (f.id === activeId) continue;
    const sig = parsedDefsOfRaw(String(getText(f.id) ?? ''), f.name).sigByName.get(name);
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
export function groupReferencesFor(files, activeId, name, getText, opts = {}) {
  if (!name) return [];
  const { defFileId = null, activeCfgForDir } = opts;
  const devOpts = activeCfgForDir ? { activeCfgForDir } : {};
  const out = [];
  for (const f of moduleGroupFilesFor(files, activeId, getText, devOpts)) {
    if (f.id === activeId) continue;
    const raw = String(getText(f.id) ?? '');
    const text = editorTextForIndexing(raw, f.name);
    const parsed = parsedDefsOfSrc(text);
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
export function groupRenameEdits(files, activeId, name, getText, opts = {}) {
  if (!name) return [];
  let defFileId = null;
  let devOpts = {};
  if (opts != null && typeof opts === 'object') {
    defFileId = opts.defFileId != null ? opts.defFileId : null;
    if (opts.activeCfgForDir) devOpts = { activeCfgForDir: opts.activeCfgForDir };
  } else {
    defFileId = opts;
  }
  const plans = [];
  for (const f of moduleGroupFilesFor(files, activeId, getText, devOpts)) {
    if (f.id === activeId) continue;
    const raw = String(getText(f.id) ?? '');
    const text = editorTextForIndexing(raw, f.name);
    const parsed = parsedDefsOfSrc(text);
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
export function groupDefinesName(files, activeId, name, getText, options = {}) {
  if (!name) return false;
  for (const f of groupFilesFor(files, activeId, getText, options)) {
    if (f.id === activeId) continue;
    if (parsedDefsOfRaw(String(getText(f.id) ?? ''), f.name).names.has(name)) return true;
  }
  return false;
}

// Beluga accepts these only at the very start of the combined program. When a
// project prelude is prepended, peel them from the active file and reattach
// ahead of the prelude so checking matches standalone Beluga semantics.
export const GLOBAL_FILE_PRAGMA_LINE =
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

// Like peelGlobalFilePragmas, but instead of DROPPING the pragma lines from the
// body it BLANKS them in place — preserving the body's exact line numbering.
// A copy of the pragmas still rides at the top of the combined program (Beluga
// requires them there), but because the active file keeps every original line in
// position, a checker diagnostic on line N maps straight back to doc line N — no
// peel/join delta to compensate. This is what keeps "Ill-typed on the schema"
// from landing on the blank line below it. `hoisted` is empty when there is no
// leading pragma, in which case `body` is the text unchanged.
export function peelGlobalFilePragmasInPlace(fileCode) {
  const text = String(fileCode ?? '');
  const peeled = peelGlobalFilePragmas(text);
  if (!peeled.hoisted) return { hoisted: '', body: text };
  const lines = text.split('\n');
  // Blank exactly the pragma lines we hoisted (leave following blanks as-is).
  let blanked = 0;
  for (let i = 0; i < lines.length && blanked < peeled.hoistLineCount; i += 1) {
    if (GLOBAL_FILE_PRAGMA_LINE.test(lines[i])) { lines[i] = ''; blanked += 1; }
  }
  return { hoisted: peeled.hoisted, body: lines.join('\n') };
}

function joinCheckerParts(parts) {
  return parts.filter((p) => p != null && p !== '').join('\n\n');
}

export function assembleCheckerCode(fileCode, prelude) {
  // No prelude: the file stands alone, so a leading pragma is ALREADY at the top
  // of the program — nothing to hoist. Leave the text byte-for-byte so a checker
  // diagnostic on line N maps to doc line N (no spurious blank-line shift). This
  // is what was previously broken: peeling+rejoining shifted the body down, so an
  // error on the schema landed on the blank line below it.
  if (!prelude) {
    return { code: String(fileCode ?? ''), prelude: null, fileOffset: 0 };
  }
  // With a prelude, the pragma must jump AHEAD of it (Beluga only honours global
  // pragmas at the very top). Blank the pragma in place rather than deleting it,
  // so the active body keeps its exact line numbers and the `offsetLines` shift
  // maps body line N straight back to doc line N.
  const { hoisted, body } = peelGlobalFilePragmasInPlace(fileCode);
  if (!hoisted) {
    const prefix = joinCheckerParts([prelude.code]);
    const code = joinCheckerParts([prelude.code, body]);
    const fileOffset = prefix ? prefix.length + 2 : 0;
    return { code, prelude, fileOffset };
  }
  const hoistOffset = hoisted.split('\n').length + 1; // pragma lines + the join blank
  const adjustedPrelude = {
    ...prelude,
    spans: prelude.spans.map((s) => ({
      ...s,
      startLine: s.startLine + hoistOffset,
      endLine: s.endLine + hoistOffset,
    })),
    offsetLines: prelude.offsetLines + hoistOffset,
  };
  const prefix = joinCheckerParts([hoisted, prelude.code]);
  const code = joinCheckerParts([hoisted, prelude.code, body]);
  const fileOffset = prefix ? prefix.length + 2 : 0;
  return {
    code,
    prelude: adjustedPrelude,
    fileOffset,
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

export function buildPrelude(files, activeId, getText, options = {}) {
  const pre = preludeFilesFor(files, activeId, getText, options);
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

function renumberHoles(list) {
  list.sort((a, b) => a.line - b.line || a.col - b.col);
  list.forEach((h, i) => { h.index = i; });
  return list;
}

// Split a clean checker holes report into active-file holes (doc-relative) and
// per-member holes for prelude files. Beluga reports assembled line numbers.
export function attributeCheckerHoles(rawOutput, { prelude, activeFileName } = {}) {
  const parsed = parseHoles(rawOutput || '');
  const activeHoles = [];
  const memberHoles = {};
  if (!parsed.length) return { activeHoles, memberHoles };

  const offset = prelude ? prelude.offsetLines : 0;
  for (const h of parsed) {
    const hole = {
      line: h.line,
      col: h.col,
      goal: h.goal,
      ctx: h.ctx || [],
      meta: h.meta || [],
      name: h.name,
    };
    if (!prelude || h.line > offset) {
      if (activeFileName) {
        activeHoles.push({ ...hole, line: prelude ? h.line - offset : h.line });
      }
      continue;
    }
    const hit = preludeFileAt(prelude.spans, h.line);
    if (!hit) continue;
    (memberHoles[hit.name] || (memberHoles[hit.name] = [])).push({ ...hole, line: hit.line });
  }
  renumberHoles(activeHoles);
  for (const name of Object.keys(memberHoles)) renumberHoles(memberHoles[name]);
  return { activeHoles, memberHoles };
}

// The Beluga location ("File ..., line N") and the message sit on separate
// lines, and our match index lands mid-location-line — so the FIRST tail line is
// usually the location's leftover (", column 11:") rather than the error. Skip
// location remnants and caret rows, then return the real "Error: …" line.
function messageAfter(text, index) {
  const tail = text.slice(index, index + 400);
  for (const raw of tail.split('\n')) {
    let t = raw.trim().replace(/^[,:]\s*/, ''); // drop a leading ", " / ": "
    if (!t) continue;
    if (/^columns?\s+\d/i.test(t)) continue; // "column 11:" remnant
    if (/^line\s+\d/i.test(t)) continue; // stray "line N" remnant
    if (/^[-^~\s]+$/.test(t)) continue; // caret / underline rows
    t = t.replace(/^(Error|Warning):\s*/i, '');
    if (/[A-Za-z]/.test(t)) return t.slice(0, 160);
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
