// Active suite discovery for Library "add to prelude" magic action.
(function (global) {
  'use strict';

  function dirOf(path) {
    var i = String(path || '').lastIndexOf('/');
    return i === -1 ? '' : path.slice(0, i);
  }

  function listActiveSuites(opts) {
    opts = opts || {};
    var listFiles = opts.listFiles;
    var getActiveCfgForDir = opts.getActiveCfgForDir;
    if (typeof listFiles !== 'function' || typeof getActiveCfgForDir !== 'function') return [];

    var files = listFiles();
    var cfgDirs = {};
    for (var i = 0; i < files.length; i++) {
      var name = files[i].name;
      if (!/\.cfg$/i.test(name)) continue;
      var dir = dirOf(name);
      if (!Object.prototype.hasOwnProperty.call(cfgDirs, dir)) cfgDirs[dir] = true;
    }

    var names = new Set();
    for (var j = 0; j < files.length; j++) names.add(files[j].name);

    var out = [];
    for (var dirKey in cfgDirs) {
      if (!Object.prototype.hasOwnProperty.call(cfgDirs, dirKey)) continue;
      var cfgPath = getActiveCfgForDir(dirKey);
      if (!cfgPath || !names.has(cfgPath)) continue;
      var base = cfgPath.slice(cfgPath.lastIndexOf('/') + 1).replace(/\.cfg$/i, '');
      var label = dirKey ? dirKey + ' / ' + base : base;
      out.push({ dir: dirKey, cfgPath: cfgPath, label: label });
    }

    out.sort(function (a, b) { return a.label.localeCompare(b.label); });
    return out;
  }

  global.BelJarLibrarySuites = { listActiveSuites: listActiveSuites };
})(typeof window !== 'undefined' ? window : globalThis);
