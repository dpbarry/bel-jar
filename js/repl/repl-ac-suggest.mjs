'use strict';

/**
 * Pure REPL completion suggestions (no DOM).
 * Used by ReplAutocomplete and unit tests.
 */

import { dirOf } from '../editor-src/semantic/development.mjs';
import {
  isCfgPath,
  isElfPath,
  isSignaturePath,
} from '../editor-src/project-paths.mjs';
import { normalizeWorkspacePath, formatRunPath, baseName } from './repl-run-cmd.mjs';

var MAX_ITEMS = 16;

var DEFAULT_VERBS = [
  'run', 'help', 'constructors', 'constructors-comp', 'countholes',
  'fdef', 'fsig', 'lookuphole', 'printhole', 'query', 'type', 'types',
];

function extOf(path) {
  var b = baseName(path);
  var d = b.lastIndexOf('.');
  if (d === -1) return 'bel';
  return b.slice(d + 1).toLowerCase() || 'bel';
}

function basenameCounts(paths) {
  var counts = Object.create(null);
  for (var i = 0; i < paths.length; i++) {
    var bn = baseName(paths[i]);
    counts[bn] = (counts[bn] || 0) + 1;
  }
  return counts;
}

/** Label that round-trips with resolve; ambiguous basenames stay fully qualified. */
function suggestPathLabel(absPath, cwd, counts) {
  var bn = baseName(absPath);
  if ((counts[bn] || 0) > 1) return absPath;
  var formatted = formatRunPath(absPath, cwd);
  if (formatted === bn && dirOf(absPath) !== String(cwd != null ? cwd : '')) {
    return absPath;
  }
  if (!dirOf(absPath) && String(cwd || '') !== '') return '~/' + bn;
  return formatted;
}

function isNavToken(token) {
  var t = String(token || '');
  return (
    t === '.' ||
    t === '..' ||
    t === '~' ||
    t.slice(0, 2) === './' ||
    t.slice(0, 3) === '../' ||
    t.slice(0, 2) === '~/'
  );
}

/**
 * If token is nav-shaped, require label/path to stay under that prefix intent.
 * Returns false when a candidate should be dropped.
 */
function matchesToken(absPath, label, token, cwd) {
  var t = String(token || '').replace(/\\/g, '/');
  if (!t) return true;
  var tl = t.toLowerCase();
  var labelL = String(label || '').toLowerCase();
  var pathL = String(absPath || '').toLowerCase();
  var bnL = baseName(absPath).toLowerCase();

  if (!isNavToken(t)) {
    return labelL.indexOf(tl) === 0 || bnL.indexOf(tl) === 0 || pathL.indexOf(tl) !== -1;
  }

  // Prefer labels that share the typed nav prefix.
  if (labelL.indexOf(tl) === 0) return true;

  // Incomplete dir: "../li" — check normalize of token+'*' via prefix of collapsed path.
  var lastSlash = t.lastIndexOf('/');
  var dirTyped = lastSlash >= 0 ? t.slice(0, lastSlash) : t;
  var filter = lastSlash >= 0 ? t.slice(lastSlash + 1).toLowerCase() : '';
  var dirNorm = normalizeWorkspacePath(
    dirTyped === '~' ? '~' : (dirTyped || '.'),
    cwd,
  );
  if (dirNorm && dirNorm.error) return false;
  if (dirNorm && dirNorm.path != null) {
    var base = dirNorm.path;
    if (base === '') {
      if (dirOf(absPath) !== '') return false;
    } else if (absPath !== base && absPath.indexOf(base + '/') !== 0 && dirOf(absPath) !== base) {
      return false;
    }
    if (filter && bnL.indexOf(filter) !== 0 && pathL.indexOf(filter) === -1) return false;
    return true;
  }
  return labelL.indexOf(tl) === 0;
}

function compareByPath(aPath, bPath, cwd) {
  var aDir = dirOf(aPath);
  var bDir = dirOf(bPath);
  var aCwd = aDir === String(cwd || '') ? 0 : 1;
  var bCwd = bDir === String(cwd || '') ? 0 : 1;
  if (aCwd !== bCwd) return aCwd - bCwd;
  // Folder groups, then basename — numeric so 1_ < 5_ < 8_
  return String(aPath).localeCompare(String(bPath), undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

/**
 * @returns {{ kind: string, token: string, replaceFrom: number, amalgam?: boolean } | null}
 */
function parseCompletionContext(line) {
  var raw = String(line != null ? line : '');
  var s = raw.replace(/^%:\s*/, '');
  var offset = raw.length - s.length;

  // First word (verbs): no whitespace yet, unless run&path form.
  if (!/\s/.test(s) && !/^run&/i.test(s)) {
    return {
      kind: 'verb',
      token: s,
      replaceFrom: offset,
    };
  }

  var m;
  if ((m = /^run&([\s\S]*)$/i.exec(s))) {
    return {
      kind: 'runPath',
      token: m[1],
      replaceFrom: offset + (s.length - m[1].length),
      amalgam: true,
    };
  }
  if ((m = /^run\s+suite\s+([\s\S]*)$/i.exec(s))) {
    return {
      kind: 'runSuite',
      token: m[1],
      replaceFrom: offset + (s.length - m[1].length),
    };
  }
  if ((m = /^run\s+folder\s+([\s\S]*)$/i.exec(s))) {
    return {
      kind: 'runFolder',
      token: m[1],
      replaceFrom: offset + (s.length - m[1].length),
    };
  }
  if (/^run\s+project\b/i.test(s)) return null;
  if ((m = /^run\s+&([\s\S]*)$/i.exec(s))) {
    return {
      kind: 'runPath',
      token: m[1],
      replaceFrom: offset + (s.length - m[1].length),
      amalgam: true,
    };
  }
  if ((m = /^run\s+([\s\S]*)$/i.exec(s))) {
    var rest = m[1];
    // Don't treat incomplete "s" / "su" as path — still suite keyword? Keep as path
    // unless exact suite/folder keyword start with trailing incomplete second word only.
    if (/^(suite|folder)(\s|$)/i.test(rest)) return null;
    return {
      kind: 'runPath',
      token: rest,
      replaceFrom: offset + (s.length - rest.length),
      amalgam: false,
    };
  }
  return null;
}

function suggestVerbs(token, verbs) {
  var list = verbs && verbs.length ? verbs : DEFAULT_VERBS;
  var t = String(token || '').toLowerCase();
  var seen = Object.create(null);
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var v = String(list[i] || '');
    if (!v) continue;
    var key = v.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    if (t && key.indexOf(t) !== 0) continue;
    out.push({
      label: v,
      insert: v,
      kind: 'verb',
      ext: '',
    });
  }
  return out.slice(0, MAX_ITEMS);
}

function suggestRunPaths(files, cwd, token) {
  var paths = [];
  for (var i = 0; i < files.length; i++) {
    var n = files[i] && files[i].name;
    if (!n) continue;
    if (isSignaturePath(n) || isCfgPath(n)) paths.push(n);
  }
  var counts = basenameCounts(paths);
  var items = [];
  for (var j = 0; j < paths.length; j++) {
    var p = paths[j];
    var label = suggestPathLabel(p, cwd, counts);
    if (!matchesToken(p, label, token, cwd)) continue;
    items.push({
      label: label,
      insert: label,
      kind: 'path',
      ext: isCfgPath(p) ? 'cfg' : (isElfPath(p) ? 'elf' : 'bel'),
      absPath: p,
    });
  }
  items.sort(function (a, b) { return compareByPath(a.absPath, b.absPath, cwd); });
  return items.slice(0, MAX_ITEMS).map(function (it) {
    delete it.absPath;
    return it;
  });
}

function suggestRunSuites(files, cwd, token) {
  var paths = [];
  for (var i = 0; i < files.length; i++) {
    var n = files[i] && files[i].name;
    if (n && isCfgPath(n)) paths.push(n);
  }
  var counts = basenameCounts(paths.map(function (p) {
    return baseName(p).replace(/\.cfg$/i, '');
  }));
  // recount by suite name
  counts = Object.create(null);
  for (var c = 0; c < paths.length; c++) {
    var sn = baseName(paths[c]).replace(/\.cfg$/i, '');
    counts[sn] = (counts[sn] || 0) + 1;
  }
  var items = [];
  for (var j = 0; j < paths.length; j++) {
    var p = paths[j];
    var suite = baseName(p).replace(/\.cfg$/i, '');
    var label = (counts[suite] || 0) > 1 ? p.replace(/\.cfg$/i, '') : suite;
    if (dirOf(p) !== String(cwd || '') && (counts[suite] || 0) <= 1) {
      label = suggestPathLabel(p, cwd, basenameCounts(paths)).replace(/\.cfg$/i, '');
    }
    if (!matchesToken(p, label, token, cwd) && !matchesToken(p, suite, token, cwd)) continue;
    items.push({
      label: label,
      insert: label,
      kind: 'suite',
      ext: 'cfg',
      absPath: p,
    });
  }
  items.sort(function (a, b) { return compareByPath(a.absPath, b.absPath, cwd); });
  return items.slice(0, MAX_ITEMS).map(function (it) {
    delete it.absPath;
    return it;
  });
}

function suggestRunFolders(files, cwd, token) {
  var dirs = Object.create(null);
  dirs[''] = true;
  for (var i = 0; i < files.length; i++) {
    var n = files[i] && files[i].name;
    if (!n) continue;
    var d = dirOf(n);
    dirs[d] = true;
    if (d) {
      var parts = d.split('/');
      var acc = '';
      for (var p = 0; p < parts.length; p++) {
        if (!parts[p]) continue;
        acc = acc ? acc + '/' + parts[p] : parts[p];
        dirs[acc] = true;
      }
    }
  }
  var keys = Object.keys(dirs);
  var items = [];
  for (var j = 0; j < keys.length; j++) {
    var folder = keys[j];
    var label;
    if (folder === '') label = '~';
    else if (folder === String(cwd || '')) label = '.';
    else if (dirOf(folder) === String(cwd || '')) label = baseName(folder);
    else if (!dirOf(folder) && String(cwd || '')) label = '~/' + folder;
    else label = folder;

    var t = String(token || '').replace(/\\/g, '/');
    if (t) {
      var tl = t.toLowerCase();
      if (
        label.toLowerCase().indexOf(tl) !== 0 &&
        folder.toLowerCase().indexOf(tl) !== 0 &&
        !(t.charAt(0) === '~' && ('~/' + folder).toLowerCase().indexOf(tl) === 0) &&
        !matchesToken(folder || '~', label, t, cwd)
      ) {
        continue;
      }
    }
    items.push({
      label: label,
      insert: label,
      kind: 'folder',
      ext: '',
      absPath: folder,
    });
  }
  items.sort(function (a, b) {
    var aCwd = a.absPath === String(cwd || '') ? 0 : 1;
    var bCwd = b.absPath === String(cwd || '') ? 0 : 1;
    if (aCwd !== bCwd) return aCwd - bCwd;
    return String(a.absPath).localeCompare(String(b.absPath), undefined, {
      sensitivity: 'base',
      numeric: true,
    });
  });
  return items.slice(0, MAX_ITEMS).map(function (it) {
    delete it.absPath;
    return it;
  });
}

/**
 * @param {{ line: string, files?: array, cwd?: string, verbs?: string[] }} opts
 * @returns {{ items: array, replaceFrom: number, token: string } | null}
 */
function suggestReplCompletions(opts) {
  opts = opts || {};
  var ctx = parseCompletionContext(opts.line);
  if (!ctx) return null;
  var files = opts.files || [];
  var cwd = opts.cwd != null ? opts.cwd : '';
  var items = [];
  if (ctx.kind === 'verb') {
    items = suggestVerbs(ctx.token, opts.verbs);
  } else if (ctx.kind === 'runPath') {
    items = suggestRunPaths(files, cwd, ctx.token);
  } else if (ctx.kind === 'runSuite') {
    items = suggestRunSuites(files, cwd, ctx.token);
  } else if (ctx.kind === 'runFolder') {
    items = suggestRunFolders(files, cwd, ctx.token);
  }
  if (!items.length) return null;
  return {
    items: items,
    replaceFrom: ctx.replaceFrom,
    token: ctx.token,
    amalgam: !!ctx.amalgam,
  };
}

export {
  MAX_ITEMS,
  DEFAULT_VERBS,
  parseCompletionContext,
  suggestReplCompletions,
  suggestVerbs,
  suggestRunPaths,
  suggestRunSuites,
  suggestRunFolders,
  suggestPathLabel,
  matchesToken,
  isNavToken,
};
