'use strict';

/**
 * BelJar-local `run` REPL grammar — captions and typed input share one form.
 * Never sent to Beluga; dispatches to BelugaRun.
 *
 *   run               active file: alone if orphan, else suite-to-here
 *   run &             active file with prelude (always)
 *   run path          file alone
 *   run &path         file + prelude (amalgamation)
 *   run suite Name    whole suite
 *   run folder path   folder development
 *   run project       every workspace development
 */

import { dirOf, joinPath } from '../editor-src/semantic/development.mjs';

const global = globalThis;

function baseName(path) {
  var s = String(path || '');
  var i = s.lastIndexOf('/');
  return i === -1 ? s : s.slice(i + 1);
}

/** Prefer basename when target is in cwd; else full workspace path. */
function formatRunPath(absPath, cwd) {
  var p = String(absPath || '');
  if (!p) return p;
  if (dirOf(p) === String(cwd != null ? cwd : '')) return baseName(p);
  return p;
}

function formatRunCaption(absPath, cwd, amalgam) {
  var shown = formatRunPath(absPath, cwd);
  return amalgam ? 'run &' + shown : 'run ' + shown;
}

/** Label Beluga status chatter uses (Type Reconstruction / Holes) — mirrors caption path + `&`. */
function formatRunStatusName(absPath, cwd, amalgam) {
  var shown = formatRunPath(absPath, cwd);
  return amalgam ? '&' + shown : shown;
}

/**
 * Retarget ## Type Reconstruction / ## Holes file labels without touching File "…" paths.
 * @param {string} raw
 * @param {string} fromLabel e.g. a.bel
 * @param {string} toLabel e.g. &a.bel
 */
function rewriteRunStatusLabel(raw, fromLabel, toLabel) {
  var from = String(fromLabel || '');
  var to = String(toLabel || '');
  if (!from || !to || from === to) return String(raw == null ? '' : raw);
  var esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(raw).replace(
    new RegExp('(##\\s*(?:Type Reconstruction (?:begin|done)|Holes)\\s*:\\s*)' + esc + '(\\s*##)', 'gi'),
    '$1' + to + '$2',
  );
}

/**
 * Collapse path segments under a base dir. `..` past workspace root → error.
 * @returns {{ path: string } | { error: string }}
 */
function collapseSegments(baseDir, rel) {
  var parts = [];
  var base = String(baseDir != null ? baseDir : '');
  if (base) {
    var baseSegs = base.split('/');
    for (var b = 0; b < baseSegs.length; b++) {
      if (baseSegs[b]) parts.push(baseSegs[b]);
    }
  }
  var segs = String(rel != null ? rel : '').split('/');
  for (var i = 0; i < segs.length; i++) {
    var seg = segs[i];
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (!parts.length) return { error: 'Path escapes workspace root.' };
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return { path: parts.join('/') };
}

function hasDotSegment(s) {
  var segs = String(s || '').split('/');
  for (var i = 0; i < segs.length; i++) {
    if (segs[i] === '.' || segs[i] === '..') return true;
  }
  return false;
}

/**
 * Shell-style workspace path: ~/…, ./…, ../…, mid-path . / ..
 * Returns null when the arg should use legacy exact/cwd-join/basename resolve.
 * @returns {{ path: string } | { error: string } | null}
 */
function normalizeWorkspacePath(arg, cwd) {
  var s = String(arg != null ? arg : '').trim().replace(/\\/g, '/');
  if (!s) return null;

  if (s.charAt(0) === '~') {
    if (s !== '~' && s.slice(0, 2) !== '~/') {
      return { error: 'Only ~ and ~/… are supported (not ~user).' };
    }
    var rest = s === '~' ? '' : s.slice(2);
    return collapseSegments('', rest);
  }

  if (s === '.' || s === '..' || s.slice(0, 2) === './' || s.slice(0, 3) === '../') {
    return collapseSegments(cwd != null ? cwd : '', s);
  }

  if (hasDotSegment(s)) {
    return collapseSegments('', s);
  }

  return null;
}

function lookupFileByPath(files, path) {
  for (var i = 0; i < files.length; i++) {
    if (files[i].name === path) return { path: files[i].name, id: files[i].id };
  }
  return null;
}

/**
 * @param {string} bare full command without %: (e.g. "run &b.bel")
 * @returns {{ kind: string, path?: string, suite?: string } | { error: string }}
 */
function parseRunCommand(bare) {
  var s = String(bare != null ? bare : '').replace(/^%:\s*/, '').trim();
  if (!/^run\b/i.test(s)) return { error: 'Not a run command.' };
  var rest = s.replace(/^run\b/i, '').trim();

  if (!rest) return { kind: 'fileActive' };
  if (rest === '&') return { kind: 'hereActive' };

  if (/^&\s/.test(rest)) {
    return { error: 'Use run &path with no space after &.' };
  }

  if (rest.charAt(0) === '&') {
    var herePath = rest.slice(1);
    if (!herePath) return { kind: 'hereActive' };
    if (/\s/.test(herePath)) {
      return { error: 'Unexpected arguments after run &path.' };
    }
    return { kind: 'here', path: herePath };
  }

  if (/^project$/i.test(rest)) return { kind: 'project' };

  if (/^suite\b/i.test(rest)) {
    var suiteArg = rest.replace(/^suite\b/i, '').trim();
    if (!suiteArg) return { error: 'Missing suite name.' };
    if (/\s/.test(suiteArg)) return { error: 'Unexpected arguments after suite name.' };
    return { kind: 'suite', suite: suiteArg.replace(/\.cfg$/i, '') };
  }

  if (/^folder\b/i.test(rest)) {
    var folderArg = rest.replace(/^folder\b/i, '').trim();
    if (/\s/.test(folderArg)) return { error: 'Unexpected arguments after folder path.' };
    if (folderArg === '(root)') return { kind: 'folder', path: '' };
    return { kind: 'folder', path: folderArg };
  }

  if (/\s/.test(rest)) return { error: 'Unrecognized run form.' };
  return { kind: 'file', path: rest };
}

/**
 * Resolve a file path arg against workspace files.
 * Nav forms (~, ./, ../, mid . / ..) normalize first (exact only).
 * Else: exact → cwd-joined → unique basename → error.
 */
function resolveRunTarget(arg, opts) {
  opts = opts || {};
  var files = opts.files || [];
  var cwd = opts.cwd != null ? opts.cwd : '';
  var want = String(arg || '').trim();
  if (!want) return { error: 'Missing path.' };

  var nav = normalizeWorkspacePath(want, cwd);
  if (nav && nav.error) return { error: nav.error };
  if (nav && nav.path != null) {
    var navHit = lookupFileByPath(files, nav.path);
    if (navHit) return navHit;
    return { error: 'No file matching "' + want + '".' };
  }

  var i;
  for (i = 0; i < files.length; i++) {
    if (files[i].name === want) return { path: files[i].name, id: files[i].id };
  }

  var joined = joinPath(cwd, want);
  if (joined !== want) {
    for (i = 0; i < files.length; i++) {
      if (files[i].name === joined) return { path: files[i].name, id: files[i].id };
    }
  }

  var baseWant = baseName(want);
  var hits = [];
  for (i = 0; i < files.length; i++) {
    var bn = baseName(files[i].name);
    if (bn === baseWant || bn === want) hits.push(files[i]);
  }
  if (hits.length === 1) return { path: hits[0].name, id: hits[0].id };
  if (hits.length > 1) {
    return {
      error: 'Ambiguous path "' + want + '": ' + hits.map(function (f) { return f.name; }).join(', '),
    };
  }
  return { error: 'No file matching "' + want + '".' };
}

function resolveSuiteCfg(suite, files, cwd) {
  var name = String(suite || '').trim();
  if (!name) return { error: 'Missing suite name.' };

  var nav = normalizeWorkspacePath(name, cwd);
  if (nav && nav.error) return { error: nav.error };
  if (nav && nav.path != null) {
    var navPath = nav.path;
    if (navPath && !/\.cfg$/i.test(navPath)) navPath = navPath + '.cfg';
    for (var n = 0; n < files.length; n++) {
      if (files[n].name === navPath) return { path: files[n].name };
    }
    return { error: 'No suite matching "' + suite + '".' };
  }

  var cfgBase = /\.cfg$/i.test(name) ? name : name + '.cfg';
  var candidates = [cfgBase, joinPath(cwd, cfgBase)];
  var i;
  for (i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    for (var j = 0; j < files.length; j++) {
      if (files[j].name === c) return { path: files[j].name };
    }
  }
  var hits = [];
  for (i = 0; i < files.length; i++) {
    var fn = files[i].name || '';
    if (!/\.cfg$/i.test(fn)) continue;
    var bn = baseName(fn);
    if (bn === cfgBase || bn.replace(/\.cfg$/i, '') === name.replace(/\.cfg$/i, '')) {
      hits.push(fn);
    }
  }
  if (hits.length === 1) return { path: hits[0] };
  if (hits.length > 1) {
    return { error: 'Ambiguous suite "' + name + '": ' + hits.join(', ') };
  }
  return { error: 'No suite matching "' + name + '".' };
}

function resolveFolderPath(arg, files, cwd) {
  var want = arg == null ? '' : String(arg);
  if (want === '(root)') want = '';
  // Root is always a valid folder target (may be empty of signatures).
  if (want === '') return { path: '' };

  var nav = normalizeWorkspacePath(want, cwd);
  if (nav && nav.error) return { error: nav.error };
  if (nav && nav.path != null) {
    want = nav.path;
    if (want === '') return { path: '' };
  }

  var dirs = Object.create(null);
  for (var i = 0; i < files.length; i++) {
    dirs[dirOf(files[i].name)] = true;
  }
  if (Object.prototype.hasOwnProperty.call(dirs, want)) return { path: want };
  if (!(nav && nav.path != null)) {
    var joined = joinPath(cwd, want);
    if (Object.prototype.hasOwnProperty.call(dirs, joined)) return { path: joined };
  }
  return { error: 'No folder matching "' + arg + '".' };
}

function activeCwd(files, activeId) {
  if (!activeId) return '';
  for (var i = 0; i < (files || []).length; i++) {
    if (files[i].id === activeId) return dirOf(files[i].name);
  }
  return '';
}

function fileTextForResolve(fileId, activeId) {
  if (
    fileId === activeId &&
    typeof CurrentEditor !== 'undefined' &&
    CurrentEditor &&
    typeof CurrentEditor.getValue === 'function'
  ) {
    return CurrentEditor.getValue();
  }
  if (typeof Persist !== 'undefined' && Persist.getFileText) {
    return Persist.getFileText(fileId) || '';
  }
  return '';
}

/** Bare `run`: to-here when active file is in a suite, else file alone. */
function activeFileInSuite(files, activeId) {
  if (!activeId || typeof ProjectSource === 'undefined' || !ProjectSource.cfgPathForActive) {
    return false;
  }
  return !!ProjectSource.cfgPathForActive(files, activeId, function (id) {
    return fileTextForResolve(id, activeId);
  });
}

/**
 * Parse + dispatch. On success BelugaRun owns turn/history.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function executeRunCommand(bare) {
  var parsed = parseRunCommand(bare);
  if (parsed.error) return { ok: false, error: parsed.error };
  return dispatchRunCommand(parsed);
}

async function dispatchRunCommand(parsed) {
  if (!parsed || parsed.error) {
    return { ok: false, error: (parsed && parsed.error) || 'Invalid run command.' };
  }
  if (typeof BelugaRun === 'undefined') {
    return { ok: false, error: 'Run is not available.' };
  }

  var files = typeof Persist !== 'undefined' && Persist.listFiles ? Persist.listFiles() || [] : [];
  var activeId = typeof Persist !== 'undefined' && Persist.getActiveFileId
    ? Persist.getActiveFileId()
    : null;
  var cwd = activeCwd(files, activeId);

  switch (parsed.kind) {
    case 'fileActive':
      if (!activeId) return { ok: false, error: 'No active file.' };
      if (activeFileInSuite(files, activeId)) await BelugaRun.runToHere();
      else await BelugaRun.runFile();
      return { ok: true };
    case 'hereActive':
      if (!activeId) return { ok: false, error: 'No active file.' };
      await BelugaRun.runToHere();
      return { ok: true };
    case 'project':
      await BelugaRun.runProject();
      return { ok: true };
    case 'file': {
      var fileHit = resolveRunTarget(parsed.path, { files: files, cwd: cwd });
      if (fileHit.error) return { ok: false, error: fileHit.error };
      await BelugaRun.runFile(fileHit.id);
      return { ok: true };
    }
    case 'here': {
      var hereHit = resolveRunTarget(parsed.path, { files: files, cwd: cwd });
      if (hereHit.error) return { ok: false, error: hereHit.error };
      await BelugaRun.runToHere(hereHit.id);
      return { ok: true };
    }
    case 'suite': {
      var suiteHit = resolveSuiteCfg(parsed.suite, files, cwd);
      if (suiteHit.error) return { ok: false, error: suiteHit.error };
      await BelugaRun.runModuleCfg(suiteHit.path);
      return { ok: true };
    }
    case 'folder': {
      var folderHit = resolveFolderPath(parsed.path, files, cwd);
      if (folderHit.error) return { ok: false, error: folderHit.error };
      await BelugaRun.runFolder(folderHit.path);
      return { ok: true };
    }
    default:
      return { ok: false, error: 'Unrecognized run form.' };
  }
}

var api = {
  dirOf: dirOf,
  joinPath: joinPath,
  baseName: baseName,
  formatRunPath: formatRunPath,
  formatRunCaption: formatRunCaption,
  formatRunStatusName: formatRunStatusName,
  rewriteRunStatusLabel: rewriteRunStatusLabel,
  collapseSegments: collapseSegments,
  normalizeWorkspacePath: normalizeWorkspacePath,
  parseRunCommand: parseRunCommand,
  resolveRunTarget: resolveRunTarget,
  resolveSuiteCfg: resolveSuiteCfg,
  resolveFolderPath: resolveFolderPath,
  activeCwd: activeCwd,
  dispatchRunCommand: dispatchRunCommand,
  executeRunCommand: executeRunCommand,
};

global.ReplRunCmd = api;
global.BelJarReplRunCmd = api;

export {
  dirOf,
  joinPath,
  baseName,
  formatRunPath,
  formatRunCaption,
  formatRunStatusName,
  rewriteRunStatusLabel,
  collapseSegments,
  normalizeWorkspacePath,
  parseRunCommand,
  resolveRunTarget,
  resolveSuiteCfg,
  resolveFolderPath,
  activeCwd,
  dispatchRunCommand,
  executeRunCommand,
};
