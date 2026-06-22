// Whole-project run support — pure logic, no DOM.
//
// Beluga's web shim accepts ONE string, so a project run is an ordered
// concatenation of every file (registry order = project order) with a line map
// back to the real files. Checker output locations are rewritten through that
// map so errors point at "sub/foo.bel line 12", not "input.bel line 173".
//
// The three Beluga location grammars handled (same set as bel-beluga-diag.mjs):
//   1. File "input.bel", line L[, column C | , characters C-C]
//   2. compact  name.bel:L.C-L.C:
//   3. at line L, characters C-C
(function (global) {
  'use strict';

  // files: [{ id, name, text }] in project order.
  // Returns { code, spans } where spans = [{ id, name, startLine, endLine }]
  // (1-based, inclusive). Files are joined with a blank line, so consecutive
  // spans differ by 2 (endLine + blank + next startLine).
  function concat(files) {
    var parts = [];
    var spans = [];
    var cursor = 1;
    for (var i = 0; i < files.length; i++) {
      var text = String(files[i].text != null ? files[i].text : '');
      var lineCount = text.split('\n').length;
      spans.push({
        id: files[i].id,
        name: files[i].name,
        startLine: cursor,
        endLine: cursor + lineCount - 1,
      });
      parts.push(text);
      cursor += lineCount + 1; // +1 for the blank separator line
    }
    return { code: parts.join('\n\n'), spans: spans };
  }

  // Map a 1-based project line to { id, name, line } (file-relative, 1-based).
  // Lines in the blank gaps between files (or out of range) return null.
  function mapLine(spans, line) {
    if (!spans || !isFinite(line)) return null;
    for (var i = 0; i < spans.length; i++) {
      var s = spans[i];
      if (line >= s.startLine && line <= s.endLine) {
        return { id: s.id, name: s.name, line: line - s.startLine + 1 };
      }
    }
    return null;
  }

  // Rewrite every recognized location in checker output through the map.
  // Unmappable locations (gap lines, out of range) are left untouched.
  function remapLocations(text, spans) {
    if (!text || !spans || !spans.length) return text;
    var out = String(text);

    // 1. File "X", line L ...  (keep the rest of the clause verbatim)
    out = out.replace(
      /File\s+"([^"]*)"\s*,\s*line\s+(\d+)/g,
      function (whole, fname, line) {
        var hit = mapLine(spans, +line);
        if (!hit) return whole;
        return 'File "' + hit.name + '", line ' + hit.line;
      }
    );

    // 2. compact name.bel:L.C-L.C:  (start and end lines map independently;
    //    if either falls outside the map, leave the whole token alone)
    out = out.replace(
      /([^\s:"]+)\.bel:(\d+)\.(\d+)(?:-(\d+)\.(\d+))?:/g,
      function (whole, fname, sl, sc, el, ec) {
        var start = mapLine(spans, +sl);
        if (!start) return whole;
        var name = start.name;
        var token = name + ':' + start.line + '.' + sc;
        if (el != null) {
          var end = mapLine(spans, +el);
          if (!end || end.id !== start.id) return whole;
          token += '-' + end.line + '.' + ec;
        }
        return token + ':';
      }
    );

    // 3. at line L, characters C-C
    out = out.replace(
      /(^|\n)(\s*)at line\s+(\d+),(\s*characters?\s+\d+(?:-\d+)?)/g,
      function (whole, lead, ws, line, rest) {
        var hit = mapLine(spans, +line);
        if (!hit) return whole;
        return lead + ws + 'in ' + hit.name + ', at line ' + hit.line + ',' + rest;
      }
    );

    return out;
  }

  function dirOf(name) {
    var s = String(name || '');
    var i = s.lastIndexOf('/');
    return i === -1 ? '' : s.slice(0, i);
  }

  // Beluga .cfg: one file path per line; lines starting with % are comments.
  // Entries may be .bel or nested .cfg (resolved relative to the cfg's directory).
  function parseCfg(text) {
    var out = [];
    var lines = String(text || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t || t.charAt(0) === '%') continue;
      out.push(t);
    }
    return out;
  }

  function joinPath(dir, entry) {
    if (!dir) return entry;
    if (!entry) return dir;
    return dir + '/' + entry;
  }

  function resolveCfgOrder(cfgDir, cfgText, cfgByDir, belSet, seenCfg) {
    seenCfg = seenCfg || new Set();
    var key = cfgDir + '\0' + (cfgText ? cfgText.length : 0);
    if (seenCfg.has(key)) return [];
    seenCfg.add(key);
    var ordered = [];
    var seenBel = new Set();
    var entries = parseCfg(cfgText);
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var low = entry.toLowerCase();
      if (low.endsWith('.cfg')) {
        var slash = entry.lastIndexOf('/');
        var subDir = slash === -1 ? cfgDir : joinPath(cfgDir, entry.slice(0, slash));
        var subName = slash === -1 ? entry : entry.slice(slash + 1);
        var subMap = cfgByDir[subDir];
        if (subMap && subMap[subName]) {
          var sub = resolveCfgOrder(subDir, subMap[subName], cfgByDir, belSet, seenCfg);
          for (var j = 0; j < sub.length; j++) {
            if (!seenBel.has(sub[j])) { seenBel.add(sub[j]); ordered.push(sub[j]); }
          }
        }
      } else if (low.endsWith('.bel') || low.endsWith('.elf')) {
        var full = joinPath(cfgDir, entry);
        if (belSet[full] && !seenBel.has(full)) {
          seenBel.add(full);
          ordered.push(full);
        }
      }
    }
    return ordered;
  }

  function pickCfgForDir(cfgByDir, dir, paths, activeName) {
    var map = cfgByDir[dir];
    if (!map) return null;
    var names = Object.keys(map);
    if (!names.length) return null;
    var pathSet = {};
    for (var i = 0; i < paths.length; i++) {
      if (dirOf(paths[i]) === dir) pathSet[paths[i]] = true;
    }
    if (activeName) {
      for (var a = 0; a < names.length; a++) {
        var ord = resolveCfgOrder(dir, map[names[a]], cfgByDir, pathSet, new Set());
        if (ord.indexOf(activeName) !== -1) return map[names[a]];
      }
    }
    if (names.length === 1) return map[names[0]];
    var best = null;
    var bestCount = -1;
    for (var k = 0; k < names.length; k++) {
      var resolved = resolveCfgOrder(dir, map[names[k]], cfgByDir, pathSet, new Set());
      if (resolved.length > bestCount) { bestCount = resolved.length; best = map[names[k]]; }
    }
    return best;
  }

  function signaturePathsInDir(paths, dir) {
    var out = [];
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      var low = p.toLowerCase();
      if (dirOf(p) === dir && (low.endsWith('.bel') || low.endsWith('.elf'))) out.push(p);
    }
    return out;
  }

  // Order .bel and .elf paths: group by directory, honour local .cfg when present.
  function orderSignaturePaths(paths, cfgByDir) {
    cfgByDir = cfgByDir || {};
    var byDir = {};
    for (var i = 0; i < paths.length; i++) {
      var d = dirOf(paths[i]);
      if (!byDir[d]) byDir[d] = [];
      byDir[d].push(paths[i]);
    }
    var out = [];
    var dirs = Object.keys(byDir).sort();
    for (var di = 0; di < dirs.length; di++) {
      var dir = dirs[di];
      var inDir = byDir[dir].slice().sort();
      var cfgText = pickCfgForDir(cfgByDir, dir, paths, null);
      if (cfgText) {
        var pathSet = {};
        for (var fi = 0; fi < inDir.length; fi++) pathSet[inDir[fi]] = true;
        var ordered = resolveCfgOrder(dir, cfgText, cfgByDir, pathSet, new Set());
        var seen = {};
        for (var oi = 0; oi < ordered.length; oi++) {
          if (!seen[ordered[oi]]) { seen[ordered[oi]] = true; out.push(ordered[oi]); }
        }
        for (var fi2 = 0; fi2 < inDir.length; fi2++) {
          if (!seen[inDir[fi2]]) out.push(inDir[fi2]);
        }
      } else {
        for (var fi3 = 0; fi3 < inDir.length; fi3++) out.push(inDir[fi3]);
      }
    }
    return out;
  }

  // Order imported .bel paths only (legacy helper).
  function orderBelPaths(belPaths, cfgByDir) {
    cfgByDir = cfgByDir || {};
    var byDir = {};
    for (var i = 0; i < belPaths.length; i++) {
      var p = belPaths[i];
      var d = dirOf(p);
      if (!byDir[d]) byDir[d] = [];
      byDir[d].push(p);
    }
    var dirs = Object.keys(byDir).sort();
    var out = [];
    for (var di = 0; di < dirs.length; di++) {
      var dir = dirs[di];
      var files = byDir[dir].slice().sort();
      var cfgText = pickCfgForDir(cfgByDir, dir, belPaths, null);
      if (cfgText) {
        var belSet = {};
        for (var fi = 0; fi < files.length; fi++) belSet[files[fi]] = true;
        var ordered = resolveCfgOrder(dir, cfgText, cfgByDir, belSet, new Set());
        var seen = {};
        for (var oi = 0; oi < ordered.length; oi++) seen[ordered[oi]] = true;
        for (var oi2 = 0; oi2 < ordered.length; oi2++) out.push(ordered[oi2]);
        for (var fi2 = 0; fi2 < files.length; fi2++) {
          if (!seen[files[fi2]]) out.push(files[fi2]);
        }
      } else {
        for (var fi3 = 0; fi3 < files.length; fi3++) out.push(files[fi3]);
      }
    }
    return out;
  }

  function cfgByDirFromFiles(files, getText) {
    var cfgByDir = {};
    for (var i = 0; i < files.length; i++) {
      var n = String(files[i].name || '');
      if (!n.toLowerCase().endsWith('.cfg')) continue;
      var dir = dirOf(n);
      var base = n.slice(n.lastIndexOf('/') + 1);
      if (!cfgByDir[dir]) cfgByDir[dir] = {};
      cfgByDir[dir][base] = String(getText(files[i].id) != null ? getText(files[i].id) : '');
    }
    return cfgByDir;
  }

  function topLevelCfgPaths(files, getText) {
    var cfgByDir = cfgByDirFromFiles(files, getText);
    var referenced = {};
    var cfgPaths = [];
    for (var i = 0; i < files.length; i++) {
      var n = String(files[i].name || '');
      if (!n.toLowerCase().endsWith('.cfg')) continue;
      cfgPaths.push(n);
      var cdir = dirOf(n);
      var entries = parseCfg(getText(files[i].id));
      for (var e = 0; e < entries.length; e++) {
        if (entries[e].toLowerCase().endsWith('.cfg')) referenced[joinPath(cdir, entries[e])] = true;
      }
    }
    cfgPaths.sort();
    var out = [];
    for (var c = 0; c < cfgPaths.length; c++) {
      if (!referenced[cfgPaths[c]]) out.push(cfgPaths[c]);
    }
    return out;
  }

  function resolveActiveChain(files, cfgPath, getText) {
    if (!cfgPath) return [];
    var allSig = allSignaturePaths(files);
    var allSet = {};
    for (var sp = 0; sp < allSig.length; sp++) allSet[allSig[sp]] = true;
    var cfgByDir = cfgByDirFromFiles(files, getText);
    var dir = dirOf(cfgPath);
    var base = cfgPath.slice(cfgPath.lastIndexOf('/') + 1);
    var map = cfgByDir[dir];
    if (!map || !map[base]) return [];
    return resolveCfgOrder(dir, map[base], cfgByDir, allSet, new Set());
  }

  function bestCfgInDir(files, getText, dir) {
    var cfgByDir = cfgByDirFromFiles(files, getText);
    var d = dir != null ? String(dir) : '';
    var map = cfgByDir[d];
    if (!map) return null;
    var sigPaths = allSignaturePaths(files);
    var pathSet = {};
    for (var p = 0; p < sigPaths.length; p++) {
      if (dirOf(sigPaths[p]) === d) pathSet[sigPaths[p]] = true;
    }
    var best = null;
    var bestCount = -1;
    for (var cfgName in map) {
      if (!Object.prototype.hasOwnProperty.call(map, cfgName)) continue;
      var cfgPath = joinPath(d, cfgName);
      var ord = resolveCfgOrder(d, map[cfgName], cfgByDir, pathSet, new Set());
      if (ord.length > bestCount || (ord.length === bestCount && cfgPath < (best || ''))) {
        bestCount = ord.length;
        best = cfgPath;
      }
    }
    return best;
  }

  function inferActiveCfgForDir(files, getText, dir) {
    return bestCfgInDir(files, getText, dir);
  }

  function inferActiveCfgByDir(files, getText) {
    var cfgByDir = cfgByDirFromFiles(files, getText);
    var out = {};
    for (var dir in cfgByDir) {
      if (!Object.prototype.hasOwnProperty.call(cfgByDir, dir)) continue;
      var best = bestCfgInDir(files, getText, dir);
      if (best) out[dir] = best;
    }
    return out;
  }

  function defaultActiveCfgForDir(dir) {
    var d = dir != null ? String(dir) : '';
    var g = typeof window !== 'undefined' ? window : globalThis;
    var P = g.BelJarPersist;
    if (P && typeof P.getActiveCfgForDir === 'function') {
      var path = P.getActiveCfgForDir(d);
      if (path) {
        if (typeof P.listFiles === 'function') {
          var files = P.listFiles();
          for (var i = 0; i < files.length; i++) {
            if (files[i].name === path) return path;
          }
        } else return path;
      }
    }
    if (P && typeof P.listFiles === 'function' && typeof P.getFileText === 'function') {
      return inferActiveCfgForDir(P.listFiles(), function (id) { return P.getFileText(id); }, d);
    }
    return null;
  }

  function activeCfgResolver(map) {
    var byDir = map || {};
    return function (dir) {
      return byDir[dir != null ? String(dir) : ''] || null;
    };
  }

  function resolveActiveCfgForDir(options) {
    if (options && typeof options.activeCfgForDir === 'function') return options.activeCfgForDir;
    return defaultActiveCfgForDir;
  }

  function standaloneResult(active) {
    return {
      kind: 'standalone',
      cfg: null,
      paths: active ? [active.name] : [],
      activeIndex: active ? 0 : -1,
      preludePaths: [],
      scopeKey: active ? 'standalone:' + active.name : 'standalone:',
    };
  }

  function developmentForFile(files, activeId, getText, options) {
    options = options || {};
    var activeCfgForDir = resolveActiveCfgForDir(options);
    var active = null;
    for (var i = 0; i < files.length; i++) {
      if (files[i].id === activeId) { active = files[i]; break; }
    }
    if (!active) {
      return { kind: 'standalone', cfg: null, paths: [], activeIndex: -1, preludePaths: [], scopeKey: 'standalone:' };
    }
    if (/\.cfg$/i.test(String(active.name))) {
      var cfgPaths = resolveActiveChain(files, active.name, getText);
      return {
        kind: 'module',
        cfg: active.name,
        paths: cfgPaths,
        activeIndex: -1,
        preludePaths: [],
        scopeKey: 'module:' + active.name,
      };
    }
    if (!/\.(?:bel|elf)$/i.test(String(active.name))) {
      return { kind: 'standalone', cfg: null, paths: [], activeIndex: -1, preludePaths: [], scopeKey: 'standalone:' };
    }
    var cfgPath = activeCfgForDir(dirOf(active.name));
    if (!cfgPath) return standaloneResult(active);
    var paths = resolveActiveChain(files, cfgPath, getText);
    var activeIndex = paths.indexOf(active.name);
    if (activeIndex >= 0) {
      return {
        kind: 'module',
        cfg: cfgPath,
        paths: paths,
        activeIndex: activeIndex,
        preludePaths: activeIndex > 0 ? paths.slice(0, activeIndex) : [],
        scopeKey: 'module:' + cfgPath,
      };
    }
    return standaloneResult(active);
  }

  // Cfg-ordered signature files for the active file's development scope.
  function orderedDevelopmentPaths(files, activeId, getText, options) {
    return developmentForFile(files, activeId, getText, options || {}).paths;
  }

  function developmentFilesFor(files, activeId, getText, options) {
    var ordered = orderedDevelopmentPaths(files, activeId, getText, options);
    var out = [];
    for (var k = 0; k < ordered.length; k++) {
      for (var m = 0; m < files.length; m++) {
        if (files[m].name === ordered[k]) { out.push(files[m]); break; }
      }
    }
    return out;
  }

  // Cfg-ordered signature files for an explicit .cfg path (whole-project run).
  function orderedPathsForCfg(files, cfgPath, getText) {
    if (!cfgPath) return [];
    var dir = dirOf(cfgPath);
    var base = cfgPath.slice(cfgPath.lastIndexOf('/') + 1);
    var paths = [];
    for (var j = 0; j < files.length; j++) {
      var fn = String(files[j].name || '');
      var low = fn.toLowerCase();
      if (dirOf(fn) === dir && (low.endsWith('.bel') || low.endsWith('.elf'))) paths.push(fn);
    }
    var cfgByDir = cfgByDirFromFiles(files, getText);
    var map = cfgByDir[dir];
    if (!map || !map[base]) return [];
    var pathSet = {};
    for (var pi = 0; pi < paths.length; pi++) pathSet[paths[pi]] = true;
    return resolveCfgOrder(dir, map[base], cfgByDir, pathSet, new Set());
  }

  function developmentFilesForCfg(files, cfgPath, getText) {
    var ordered = orderedPathsForCfg(files, cfgPath, getText);
    var out = [];
    for (var k = 0; k < ordered.length; k++) {
      for (var m = 0; m < files.length; m++) {
        if (files[m].name === ordered[k]) { out.push(files[m]); break; }
      }
    }
    return out;
  }

  function allSignaturePaths(files) {
    var out = [];
    for (var i = 0; i < files.length; i++) {
      var fn = String(files[i].name || '');
      var low = fn.toLowerCase();
      if (low.endsWith('.bel') || low.endsWith('.elf')) out.push(fn);
    }
    return out;
  }

  // Module cfg when the file is a listed member of the folder's active cfg.
  function cfgPathForActive(files, activeId, getText, options) {
    var dev = developmentForFile(files, activeId, getText, options || {});
    return dev.kind === 'module' && dev.cfg ? dev.cfg : null;
  }

  // Every independent development in the workspace, for a whole-project run:
  // each top-level .cfg chain, plus each directory-group of orphan signature
  // files (those in no cfg). Returns [{ kind, name, cfg, paths:[name,...] }];
  // a "config" carries its resolved load order, an "orphan" group uses registry
  // order so the user controls it from the explorer.
  function workspaceDevelopments(files, getText) {
    var sigPaths = allSignaturePaths(files);
    var cfgByDir = cfgByDirFromFiles(files, getText);
    var allSet = {};
    for (var sp = 0; sp < sigPaths.length; sp++) allSet[sigPaths[sp]] = true;
    var referenced = {};
    var cfgPaths = [];
    for (var i = 0; i < files.length; i++) {
      var n = String(files[i].name || '');
      if (!n.toLowerCase().endsWith('.cfg')) continue;
      cfgPaths.push(n);
      var cdir = dirOf(n);
      var entries = parseCfg(getText(files[i].id));
      for (var e = 0; e < entries.length; e++) {
        if (entries[e].toLowerCase().endsWith('.cfg')) referenced[joinPath(cdir, entries[e])] = true;
      }
    }
    cfgPaths.sort();
    var developments = [];
    var covered = {};
    for (var c = 0; c < cfgPaths.length; c++) {
      if (referenced[cfgPaths[c]]) continue;
      var dir = dirOf(cfgPaths[c]);
      var base = cfgPaths[c].slice(cfgPaths[c].lastIndexOf('/') + 1);
      var map = cfgByDir[dir];
      if (!map || !map[base]) continue;
      // Resolve against ALL signature files so nested cfgs in sub-directories
      // pull in their members (orderedPathsForCfg only sees same-dir files).
      var ordered = resolveCfgOrder(dir, map[base], cfgByDir, allSet, new Set());
      if (!ordered.length) continue;
      for (var o = 0; o < ordered.length; o++) covered[ordered[o]] = true;
      developments.push({ kind: 'config', name: baseNoExt(cfgPaths[c]), cfg: cfgPaths[c], paths: ordered });
    }
    // A file in no cfg operates in isolation — the same standalone scope the IDE
    // uses while editing. So the whole-project run checks each orphan ALONE, one
    // development per file (not dir-grouped): run-time visibility matches
    // edit-time, "not in a cfg ⇒ isolation, period."
    for (var s = 0; s < sigPaths.length; s++) {
      if (covered[sigPaths[s]]) continue;
      developments.push({ kind: 'orphan', name: sigPaths[s], cfg: null, paths: [sigPaths[s]] });
    }
    return developments;
  }

  // Pick the longest resolved .cfg chain (tie-break: path name).
  function inferDefaultCfgPath(files, getText) {
    var cfgFiles = [];
    for (var i = 0; i < files.length; i++) {
      if (String(files[i].name || '').toLowerCase().endsWith('.cfg')) cfgFiles.push(files[i]);
    }
    if (!cfgFiles.length) return null;
    var cfgByDir = cfgByDirFromFiles(files, getText);
    var sigPaths = [];
    for (var j = 0; j < files.length; j++) {
      var fn = String(files[j].name || '');
      var low = fn.toLowerCase();
      if (low.endsWith('.bel') || low.endsWith('.elf')) sigPaths.push(fn);
    }
    var best = null;
    var bestCount = -1;
    for (var c = 0; c < cfgFiles.length; c++) {
      var cfgPath = cfgFiles[c].name;
      var dir = dirOf(cfgPath);
      var base = cfgPath.slice(cfgPath.lastIndexOf('/') + 1);
      var map = cfgByDir[dir];
      if (!map || !map[base]) continue;
      var pathSet = {};
      for (var p = 0; p < sigPaths.length; p++) {
        if (dirOf(sigPaths[p]) === dir) pathSet[sigPaths[p]] = true;
      }
      var ord = resolveCfgOrder(dir, map[base], cfgByDir, pathSet, new Set());
      if (!best || ord.length > bestCount || (ord.length === bestCount && cfgPath < best)) {
        bestCount = ord.length;
        best = cfgPath;
      }
    }
    return best;
  }

  function baseNoExt(name) {
    var s = String(name || '');
    var base = s.slice(s.lastIndexOf('/') + 1);
    var dot = base.lastIndexOf('.');
    return dot === -1 ? base : base.slice(0, dot);
  }

  function preludeFilesFor(files, activeId, getText, options) {
    options = options || {};
    var dev = developmentForFile(files, activeId, getText, options);
    if (!dev.preludePaths.length) return [];
    var out = [];
    for (var k = 0; k < dev.preludePaths.length; k++) {
      for (var m = 0; m < files.length; m++) {
        if (files[m].name === dev.preludePaths[k]) { out.push(files[m]); break; }
      }
    }
    return out;
  }

  var GLOBAL_FILE_PRAGMA_LINE =
    /^\s*--(?:nostrengthen|coverage|warncoverage)\s*\.?\s*(?:%.*)?$/i;

  function peelGlobalFilePragmas(fileCode) {
    var text = String(fileCode != null ? fileCode : '');
    var lines = text.split('\n');
    var start = -1;
    if (lines[0] && GLOBAL_FILE_PRAGMA_LINE.test(lines[0])) start = 0;
    else if (lines[0] && lines[0].trim() === '' && lines[1] && GLOBAL_FILE_PRAGMA_LINE.test(lines[1])) start = 1;
    if (start < 0) {
      return { hoisted: '', rest: text, hoistLineCount: 0 };
    }
    var hoisted = [];
    var i = start;
    while (i < lines.length && GLOBAL_FILE_PRAGMA_LINE.test(lines[i])) {
      hoisted.push(lines[i]);
      i++;
    }
    while (i < lines.length && lines[i].trim() === '') i++;
    var hoistedText = hoisted.join('\n');
    return {
      hoisted: hoistedText,
      rest: lines.slice(i).join('\n'),
      hoistLineCount: hoistedText ? hoistedText.split('\n').length : 0,
    };
  }

  // Blank the leading pragma lines in place (preserve line numbering) instead of
  // dropping them; a copy still rides ahead of the prelude. Keeps active-file
  // diagnostics mapping to the right doc line. Mirror of project-prelude.mjs.
  function peelGlobalFilePragmasInPlace(fileCode) {
    var text = String(fileCode != null ? fileCode : '');
    var peeled = peelGlobalFilePragmas(text);
    if (!peeled.hoisted) return { hoisted: '', body: text };
    var lines = text.split('\n');
    var blanked = 0;
    for (var i = 0; i < lines.length && blanked < peeled.hoistLineCount; i++) {
      if (GLOBAL_FILE_PRAGMA_LINE.test(lines[i])) { lines[i] = ''; blanked++; }
    }
    return { hoisted: peeled.hoisted, body: lines.join('\n') };
  }

  function joinCheckerParts(parts) {
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] != null && parts[i] !== '') out.push(parts[i]);
    }
    return out.join('\n\n');
  }

  function assembleCheckerCode(fileCode, prelude) {
    // No prelude: leave the text untouched so a diagnostic on line N maps to doc
    // line N (a leading pragma is already at the top of a standalone program).
    if (!prelude) {
      return { code: String(fileCode != null ? fileCode : ''), prelude: null };
    }
    // With a prelude, blank the pragma in place + prepend a copy so the body
    // keeps its exact line numbers and the offsetLines shift stays exact.
    var peeled = peelGlobalFilePragmasInPlace(fileCode);
    if (!peeled.hoisted) {
      return { code: joinCheckerParts([prelude.code, peeled.body]), prelude: prelude };
    }
    var hoistOffset = peeled.hoisted.split('\n').length + 1;
    var adjustedPrelude = {
      code: prelude.code,
      spans: prelude.spans.map(function (s) {
        return {
          id: s.id,
          name: s.name,
          startLine: s.startLine + hoistOffset,
          endLine: s.endLine + hoistOffset,
        };
      }),
      offsetLines: prelude.offsetLines + hoistOffset,
      names: prelude.names,
    };
    return {
      code: joinCheckerParts([peeled.hoisted, prelude.code, peeled.body]),
      prelude: adjustedPrelude,
    };
  }

  function assembleProjectCode(files) {
    var hoistedLines = [];
    var stripped = [];
    for (var i = 0; i < files.length; i++) {
      var peeled = peelGlobalFilePragmas(String(files[i].text != null ? files[i].text : ''));
      if (peeled.hoisted) {
        var hlines = peeled.hoisted.split('\n');
        for (var h = 0; h < hlines.length; h++) {
          if (hlines[h] && hoistedLines.indexOf(hlines[h]) === -1) hoistedLines.push(hlines[h]);
        }
      }
      stripped.push({ id: files[i].id, name: files[i].name, text: peeled.rest });
    }
    var hoisted = hoistedLines.join('\n');
    var parts = [];
    var spans = [];
    var cursor = hoisted ? hoistedLines.length + 2 : 1;
    for (var j = 0; j < stripped.length; j++) {
      var text = String(stripped[j].text != null ? stripped[j].text : '');
      var lineCount = text.split('\n').length;
      spans.push({
        id: stripped[j].id,
        name: stripped[j].name,
        startLine: cursor,
        endLine: cursor + lineCount - 1,
      });
      parts.push(text);
      cursor += lineCount + 1;
    }
    var body = parts.join('\n\n');
    return {
      code: hoisted ? joinCheckerParts([hoisted, body]) : body,
      spans: spans,
    };
  }

  // Prepend same-directory predecessors for checking / running the active file.
  function buildPrelude(files, activeId, getText, options) {
    var pre = preludeFilesFor(files, activeId, getText, options);
    if (!pre.length) return null;
    var parts = [];
    var spans = [];
    var cursor = 1;
    for (var i = 0; i < pre.length; i++) {
      var text = String(getText(pre[i].id) != null ? getText(pre[i].id) : '');
      var lineCount = text.split('\n').length;
      spans.push({ id: pre[i].id, name: pre[i].name, startLine: cursor, endLine: cursor + lineCount - 1 });
      parts.push(text);
      cursor += lineCount + 1;
    }
    var last = spans[spans.length - 1];
    return {
      code: parts.join('\n\n'),
      spans: spans,
      offsetLines: last.endLine + 1,
    };
  }

  function preludeFileAt(spans, line) {
    for (var i = 0; i < spans.length; i++) {
      var s = spans[i];
      if (line >= s.startLine && line <= s.endLine) {
        return { name: s.name, line: line - s.startLine + 1 };
      }
    }
    return null;
  }

  function messageAfter(text, index) {
    var tail = String(text).slice(index, index + 400);
    var lines = tail.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim().replace(/^(Error|Warning):\s*/i, '');
      if (t && !/^[-^~\s]+$/.test(t)) return t.slice(0, 160);
    }
    return '';
  }

  // Map checker output from prelude+file coordinates back to the active file.
  function shiftCheckerOutput(text, prelude) {
    if (!text || !prelude) return { text: text || '', preludeIssues: [] };
    var offset = prelude.offsetLines;
    var issues = [];
    var seen = new Set();

    function noteIssue(hit, src, index) {
      var k = hit.name + ':' + hit.line;
      if (seen.has(k)) return;
      seen.add(k);
      issues.push({ name: hit.name, line: hit.line, message: messageAfter(src, index) });
    }

    var out = String(text);

    out = out.replace(/File\s+"([^"]*)"\s*,\s*line\s+(\d+)/g, function (whole, fname, line, idx, src) {
      var L = +line;
      if (L > offset) return 'File "' + fname + '", line ' + (L - offset);
      var hit = preludeFileAt(prelude.spans, L);
      if (hit) noteIssue(hit, src, idx + whole.length);
      return '(project prelude ' + (hit ? hit.name : '?') + ' line ' + (hit ? hit.line : L) + ')';
    });

    out = out.replace(/([^\s:"]+)\.bel:(\d+)\.(\d+)(?:-(\d+)\.(\d+))?:/g,
      function (whole, fname, sl, sc, el, ec, idx, src) {
        var SL = +sl;
        if (SL > offset) {
          var EL = el != null ? (+el - offset) : null;
          if (el != null && EL < 1) return whole;
          return fname + '.bel:' + (SL - offset) + '.' + sc + (el != null ? '-' + EL + '.' + ec : '') + ':';
        }
        var hit = preludeFileAt(prelude.spans, SL);
        if (hit) noteIssue(hit, src, idx + whole.length);
        return '(project prelude ' + (hit ? hit.name : '?') + ' line ' + (hit ? hit.line : SL) + ')';
      });

    out = out.replace(/(^|\n)(\s*)at line\s+(\d+),(\s*characters?\s+\d+(?:-\d+)?)/g,
      function (whole, lead, ws, line, rest, idx, src) {
        var L = +line;
        if (L > offset) return lead + ws + 'at line ' + (L - offset) + ',' + rest;
        var hit = preludeFileAt(prelude.spans, L);
        if (hit) noteIssue(hit, src, idx + whole.length);
        return lead + ws + '(project prelude ' + (hit ? hit.name : '?') + ' line ' + (hit ? hit.line : L) + ')' + rest.replace(/^\s*/, ' ');
      });

    return { text: out, preludeIssues: issues };
  }

  // Project-wide text search (palette "#" mode). files: [{id, name, text}].
  // Case-insensitive substring per line; returns [{id, name, line, col,
  // lineText, from, to}] (line/col 1-based; from/to absolute offsets), capped.
  function scanProjectText(files, query, limit) {
    var cap = limit || 60;
    var q = String(query || '').toLowerCase();
    if (!q) return [];
    var out = [];
    for (var fi = 0; fi < files.length; fi++) {
      var text = String(files[fi].text != null ? files[fi].text : '');
      var lines = text.split('\n');
      var offset = 0;
      for (var li = 0; li < lines.length; li++) {
        var lower = lines[li].toLowerCase();
        var k = lower.indexOf(q);
        while (k !== -1) {
          out.push({
            id: files[fi].id,
            name: files[fi].name,
            line: li + 1,
            col: k + 1,
            lineText: lines[li].trim(),
            from: offset + k,
            to: offset + k + q.length,
          });
          if (out.length >= cap) return out;
          k = lower.indexOf(q, k + Math.max(1, q.length));
        }
        offset += lines[li].length + 1; // +1 for the newline
      }
    }
    return out;
  }

  // Pure reorder used by UI move-up/move-down; persist.moveFile mirrors this.
  function reorder(files, id, delta) {
    var idx = -1;
    for (var i = 0; i < files.length; i++) {
      if (files[i].id === id) { idx = i; break; }
    }
    if (idx === -1) return files;
    var to = Math.max(0, Math.min(files.length - 1, idx + (delta || 0)));
    if (to === idx) return files;
    var next = files.slice();
    var entry = next.splice(idx, 1)[0];
    next.splice(to, 0, entry);
    return next;
  }

  global.BelJarProjectSource = {
    concat: concat,
    mapLine: mapLine,
    remapLocations: remapLocations,
    reorder: reorder,
    dirOf: dirOf,
    parseCfg: parseCfg,
    orderBelPaths: orderBelPaths,
    orderSignaturePaths: orderSignaturePaths,
    pickCfgForDir: pickCfgForDir,
    cfgByDirFromFiles: cfgByDirFromFiles,
    developmentForFile: developmentForFile,
    activeCfgResolver: activeCfgResolver,
    defaultActiveCfgForDir: defaultActiveCfgForDir,
    orderedDevelopmentPaths: orderedDevelopmentPaths,
    developmentFilesFor: developmentFilesFor,
    orderedPathsForCfg: orderedPathsForCfg,
    developmentFilesForCfg: developmentFilesForCfg,
    cfgPathForActive: cfgPathForActive,
    workspaceDevelopments: workspaceDevelopments,
    inferDefaultCfgPath: inferDefaultCfgPath,
    inferActiveCfgForDir: inferActiveCfgForDir,
    inferActiveCfgByDir: inferActiveCfgByDir,
    preludeFilesFor: preludeFilesFor,
    buildPrelude: buildPrelude,
    assembleCheckerCode: assembleCheckerCode,
    assembleProjectCode: assembleProjectCode,
    peelGlobalFilePragmas: peelGlobalFilePragmas,
    shiftCheckerOutput: shiftCheckerOutput,
    scanProjectText: scanProjectText,
  };
})(typeof window !== 'undefined' ? window : globalThis);
