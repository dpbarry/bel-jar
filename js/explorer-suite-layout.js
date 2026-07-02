// Pure explorer layout: stack active suites (cfg → members), spine metadata, disjoint checks.
(function (global) {
  'use strict';

  var SUITE_HUES = [156, 217, 280, 32];

  function explorerFileBucket(name) {
    var PS = global.BelJarProjectSource;
    if (PS && PS.isCfgPath(name)) return 0;
    if (PS && PS.isSignaturePath(name)) return 1;
    return 2;
  }

  function byBaseName(a, b) {
    return a.baseName.localeCompare(b.baseName);
  }

  function resolveMembersDefault(allFiles, cfgPath, getText) {
    var PS = global.BelJarProjectSource;
    if (!PS || typeof PS.orderedPathsForCfg !== 'function') return [];
    return PS.orderedPathsForCfg(allFiles, cfgPath, getText);
  }

  function memberSet(allFiles, cfgPath, getText, resolveMembers) {
    var paths = typeof resolveMembers === 'function'
      ? resolveMembers(allFiles, cfgPath, getText)
      : resolveMembersDefault(allFiles, cfgPath, getText);
    var out = {};
    for (var i = 0; i < paths.length; i++) out[paths[i]] = true;
    return out;
  }

  function cfgHasDanglingEntry(allFiles, cfgPath, getText) {
    var PS = global.BelJarProjectSource;
    if (!PS || typeof PS.parseCfg !== 'function' || typeof PS.dirOf !== 'function') return false;
    var names = {};
    for (var i = 0; i < allFiles.length; i++) names[allFiles[i].name] = true;
    var cfgFile = null;
    for (var j = 0; j < allFiles.length; j++) {
      if (allFiles[j].name === cfgPath) { cfgFile = allFiles[j]; break; }
    }
    if (!cfgFile) return true;
    var dir = PS.dirOf(cfgPath);
    var entries = PS.parseCfg(getText(cfgFile.id));
    for (var e = 0; e < entries.length; e++) {
      var entry = entries[e];
      if (!PS.isCfgEntryToken(entry)) continue;
      var full = dir ? dir + '/' + entry : entry;
      if (!names[full]) return true;
    }
    return false;
  }

  function canActivateCfg(cfgPath, activeCfgs, allFiles, getText, resolveMembers) {
    var nextSet = memberSet(allFiles, cfgPath, getText, resolveMembers);
    var active = activeCfgs || [];
    for (var i = 0; i < active.length; i++) {
      if (active[i] === cfgPath) return { ok: true };
      var existing = memberSet(allFiles, active[i], getText, resolveMembers);
      for (var p in nextSet) {
        if (!Object.prototype.hasOwnProperty.call(nextSet, p)) continue;
        if (existing[p]) {
          var shareBase = p.slice(p.lastIndexOf('/') + 1);
          var otherBase = active[i].slice(active[i].lastIndexOf('/') + 1);
          return {
            ok: false,
            reason: 'Shares ' + shareBase + ' with active suite ' + otherBase,
          };
        }
      }
    }
    return { ok: true };
  }

  function findCfgIntersection(cfgPath, otherCfgs, allFiles, getText, resolveMembers) {
    var a = memberSet(allFiles, cfgPath, getText, resolveMembers);
    var hits = [];
    for (var i = 0; i < otherCfgs.length; i++) {
      if (otherCfgs[i] === cfgPath) continue;
      var b = memberSet(allFiles, otherCfgs[i], getText, resolveMembers);
      for (var p in a) {
        if (Object.prototype.hasOwnProperty.call(a, p) && b[p]) {
          hits.push({ file: p, otherCfg: otherCfgs[i] });
        }
      }
    }
    return hits;
  }

  function computeDirLayout(filesInDir, activeCfgPaths, resolveMembers, allFiles, getText) {
    var fileByName = {};
    for (var i = 0; i < filesInDir.length; i++) fileByName[filesInDir[i].name] = filesInDir[i];

    var placed = {};
    var orderedFiles = [];
    var suiteEntries = [];
    var activeList = activeCfgPaths || [];
    var resolver = resolveMembers || resolveMembersDefault;

    for (var si = 0; si < activeList.length; si++) {
      var cfgPath = activeList[si];
      var cfgFile = fileByName[cfgPath];
      if (!cfgFile) continue;

      var memberPaths = resolver(allFiles || filesInDir, cfgPath, getText || function () { return ''; });
      var blockRows = [cfgFile];
      placed[cfgPath] = true;

      for (var mi = 0; mi < memberPaths.length; mi++) {
        var mf = fileByName[memberPaths[mi]];
        if (mf && !placed[memberPaths[mi]]) {
          blockRows.push(mf);
          placed[memberPaths[mi]] = true;
        }
      }

      suiteEntries.push({
        suiteIndex: suiteEntries.length,
        cfgPath: cfgPath,
        rows: blockRows,
        memberCount: blockRows.length,
      });
      for (var ri = 0; ri < blockRows.length; ri++) orderedFiles.push(blockRows[ri]);
    }

    var inactiveCfg = [];
    var orphanBel = [];
    var other = [];
    for (var fi = 0; fi < filesInDir.length; fi++) {
      var f = filesInDir[fi];
      if (placed[f.name]) continue;
      var bucket = explorerFileBucket(f.name);
      if (bucket === 0) inactiveCfg.push(f);
      else if (bucket === 1) orphanBel.push(f);
      else other.push(f);
    }
    inactiveCfg.sort(byBaseName);
    orphanBel.sort(byBaseName);
    other.sort(byBaseName);
    orderedFiles = orderedFiles.concat(inactiveCfg, orphanBel, other);

    var suiteByFile = {};
    var activeSuiteCount = suiteEntries.length;
    for (var bi = 0; bi < suiteEntries.length; bi++) {
      var block = suiteEntries[bi];
      var hue = activeSuiteCount <= 1 ? SUITE_HUES[0] : SUITE_HUES[block.suiteIndex % SUITE_HUES.length];
      for (var ri2 = 0; ri2 < block.rows.length; ri2++) {
        var row = block.rows[ri2];
        var role;
        if (block.memberCount === 1) role = 'solo';
        else if (ri2 === 0) role = 'head';
        else if (ri2 === block.memberCount - 1) role = 'tail';
        else role = 'mid';
        suiteByFile[row.name] = {
          suiteId: block.cfgPath,
          role: role,
          suiteIndex: block.suiteIndex,
          memberIndex: ri2,
          memberCount: block.memberCount,
          hue: hue,
        };
      }
    }

    return { orderedFiles: orderedFiles, suiteByFile: suiteByFile };
  }

  global.BelJarExplorerSuiteLayout = {
    SUITE_HUES: SUITE_HUES,
    computeDirLayout: computeDirLayout,
    memberSet: memberSet,
    canActivateCfg: canActivateCfg,
    findCfgIntersection: findCfgIntersection,
    cfgHasDanglingEntry: cfgHasDanglingEntry,
  };
})(typeof window !== 'undefined' ? window : globalThis);
