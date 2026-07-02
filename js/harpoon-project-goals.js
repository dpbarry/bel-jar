'use strict';

(function (global) {
  function dirOf(name) {
    var PS = global.BelJarProjectSource;
    if (PS && typeof PS.dirOf === 'function') return PS.dirOf(name);
    var i = String(name || '').lastIndexOf('/');
    return i === -1 ? '' : name.slice(0, i);
  }

  function baseName(name) {
    var s = String(name || '');
    var i = s.lastIndexOf('/');
    return i === -1 ? s : s.slice(i + 1);
  }

  function cfgBaseLabel(cfgPath) {
    var base = baseName(cfgPath);
    var dot = base.lastIndexOf('.');
    return dot === -1 ? base : base.slice(0, dot);
  }

  function holeHostFile(name) {
    var PS = global.BelJarProjectSource;
    if (PS && typeof PS.isSignaturePath === 'function') return PS.isSignaturePath(name);
    var low = String(name || '').toLowerCase();
    if (low.endsWith('.cfg') || low.endsWith('.elf')) return false;
    if (low.endsWith('.bel')) return true;
    var base = String(name || '').slice(String(name || '').lastIndexOf('/') + 1);
    return base.indexOf('.') === -1;
  }

  function scanFileHoles(text) {
    var ed = global.BelJarEditor;
    if (ed && typeof ed.scanFileHoles === 'function') return ed.scanFileHoles(text);
    return [];
  }

  function mergeRichHoles(syntacticHits, richHoles) {
    if (!richHoles || !richHoles.length || !syntacticHits.length) return syntacticHits;
    var byPos = {};
    for (var i = 0; i < richHoles.length; i++) {
      var rh = richHoles[i];
      byPos[rh.line + ':' + rh.col] = rh;
    }
    return syntacticHits.map(function (hit) {
      var key = hit.hole.line + ':' + hit.hole.col;
      var rich = byPos[key];
      if (!rich) return hit;
      var settlementGoal = hit.hole.goal || null;
      var goal = settlementGoal || rich.goal || null;
      return {
        hole: {
          line: hit.hole.line,
          col: hit.hole.col,
          from: hit.hole.from,
          to: hit.hole.to,
          index: hit.hole.index,
          name: rich.name || hit.hole.name,
          goal: goal,
          ctx: settlementGoal ? (hit.hole.ctx || []) : (rich.ctx || []),
          meta: settlementGoal ? (hit.hole.meta || []) : (rich.meta || []),
        },
        from: hit.from,
        to: hit.to,
      };
    });
  }

  function hitsForFile(file, getText, activeHits, memberHoles) {
    var base = activeHits && activeHits.length
      ? activeHits
      : scanFileHoles(getText(file.id)).map(function (h) {
        return { hole: h, from: h.from, to: h.to };
      });
    var rich = memberHoles && memberHoles[file.name];
    return rich ? mergeRichHoles(base, rich) : base;
  }

  function normalizeFile(file) {
    return {
      id: file.id,
      name: file.name,
      baseName: file.baseName || baseName(file.name),
    };
  }

  function buildSections(opts) {
    opts = opts || {};
    var files = (opts.files || []).map(normalizeFile);
    var getText = opts.getText || function () { return ''; };
    var getActiveCfgsForDir = opts.getActiveCfgsForDir || function () { return []; };
    var computeDirLayout = opts.computeDirLayout;
    var activeFileId = opts.activeFileId || null;
    var activeHits = opts.activeHits || null;
    var memberHoles = opts.memberHoles || {};
    var developmentPaths = opts.developmentPaths || null;

    var SL = global.BelJarExplorerSuiteLayout;
    var PS = global.BelJarProjectSource;
    var resolveMembers = opts.resolveMembers || (PS && typeof PS.orderedPathsForCfg === 'function'
      ? function (all, cfgPath, gt) { return PS.orderedPathsForCfg(all, cfgPath, gt); }
      : null);

    var fileByName = {};
    for (var i = 0; i < files.length; i++) fileByName[files[i].name] = files[i];

    var byDir = {};
    for (var j = 0; j < files.length; j++) {
      var d = dirOf(files[j].name);
      if (!byDir[d]) byDir[d] = [];
      byDir[d].push(files[j]);
    }

    var dirKeys = Object.keys(byDir).sort();
    var activeDir = opts.activeFileDir;
    if (activeDir == null && activeFileId) {
      for (var ai = 0; ai < files.length; ai++) {
        if (files[ai].id === activeFileId) {
          activeDir = dirOf(files[ai].name);
          break;
        }
      }
    }
    if (activeDir != null) {
      dirKeys.sort(function (a, b) {
        if (a === activeDir) return -1;
        if (b === activeDir) return 1;
        return a.localeCompare(b);
      });
    }
    var sections = [];
    var totalCount = 0;

    for (var di = 0; di < dirKeys.length; di++) {
      var dir = dirKeys[di];
      var filesInDir = byDir[dir];
      var layout = { orderedFiles: filesInDir, suiteByFile: {} };
      if (typeof computeDirLayout === 'function') {
        layout = computeDirLayout(dir, filesInDir);
      } else if (SL && typeof SL.computeDirLayout === 'function') {
        var activeCfgs = getActiveCfgsForDir(dir);
        layout = SL.computeDirLayout(filesInDir, activeCfgs, resolveMembers, files, getText);
      }

      var suiteByFile = layout.suiteByFile || {};
      var activeCfgs = getActiveCfgsForDir(dir);
      var placed = {};
      var dirEntries = [];

      for (var si = 0; si < activeCfgs.length; si++) {
        var cfgPath = activeCfgs[si];
        var cfgFile = fileByName[cfgPath];
        if (!cfgFile) continue;

        var memberPaths = resolveMembers
          ? resolveMembers(files, cfgPath, getText)
          : [];
        var blockNames = [cfgPath];
        for (var mi = 0; mi < memberPaths.length; mi++) blockNames.push(memberPaths[mi]);

        var meta = suiteByFile[cfgPath] || {};
        var suiteLabel = cfgBaseLabel(cfgPath);
        var suiteHue = meta.hue != null ? meta.hue : null;

        for (var bi = 0; bi < blockNames.length; bi++) {
          var path = blockNames[bi];
          placed[path] = true;
          var f = fileByName[path];
          if (!f || !holeHostFile(f.name)) continue;
          var hits = hitsForFile(f, getText, f.id === activeFileId ? activeHits : null, memberHoles);
          for (var hi = 0; hi < hits.length; hi++) {
            dirEntries.push({
              fileId: f.id,
              filePath: f.name,
              fileBaseName: f.baseName || baseName(f.name),
              inDevelopment: !developmentPaths || developmentPaths.indexOf(f.name) !== -1,
              suiteLabel: suiteLabel,
              suiteHue: suiteHue,
              hit: hits[hi],
            });
          }
        }
      }

      for (var fi = 0; fi < filesInDir.length; fi++) {
        var file = filesInDir[fi];
        if (!holeHostFile(file.name) || placed[file.name]) continue;
        var fileHits = hitsForFile(file, getText, file.id === activeFileId ? activeHits : null, memberHoles);
        for (var oi = 0; oi < fileHits.length; oi++) {
          dirEntries.push({
            fileId: file.id,
            filePath: file.name,
            fileBaseName: file.baseName || baseName(file.name),
            inDevelopment: !developmentPaths || developmentPaths.indexOf(file.name) !== -1,
            suiteLabel: null,
            suiteHue: null,
            hit: fileHits[oi],
          });
        }
      }

      if (!dirEntries.length) continue;
      totalCount += dirEntries.length;
      sections.push({
        id: 'dir:' + dir,
        label: dir || '/',
        suiteHue: null,
        entries: dirEntries,
      });
    }

    return { sections: sections, totalCount: totalCount };
  }

  global.BelJarHarpoonProjectGoals = {
    buildSections: buildSections,
  };
})(typeof window !== 'undefined' ? window : self);
