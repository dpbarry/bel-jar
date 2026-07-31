(() => {
  // js/editor-src/project-paths.mjs
  function fileBase(name) {
    const s = String(name || "");
    return s.slice(s.lastIndexOf("/") + 1);
  }
  function isExtensionless(name) {
    return !fileBase(name).includes(".");
  }
  function isCfgPath(name) {
    return String(name || "").toLowerCase().endsWith(".cfg");
  }
  function isElfPath(name) {
    return String(name || "").toLowerCase().endsWith(".elf");
  }
  function isBelPath(name) {
    const low = String(name || "").toLowerCase();
    if (isCfgPath(name) || isElfPath(name)) return false;
    if (low.endsWith(".bel")) return true;
    return isExtensionless(name);
  }
  function isSignaturePath(name) {
    return isBelPath(name) || isElfPath(name);
  }
  function isProjectSourcePath(name) {
    return isSignaturePath(name) || isCfgPath(name);
  }
  function isCfgEntryToken(text) {
    const t = String(text || "").trim();
    if (!t || t.charAt(0) === "%") return false;
    const low = t.toLowerCase();
    if (low.endsWith(".cfg") || low.endsWith(".elf") || low.endsWith(".bel")) return true;
    const base = t.includes("/") ? t.slice(t.lastIndexOf("/") + 1) : t;
    return !base.includes(".");
  }
  function isCfgSourceEntry(text) {
    return isCfgEntryToken(text) && !String(text || "").trim().toLowerCase().endsWith(".cfg");
  }

  // js/editor-src/semantic/development.mjs
  function dirOf(name) {
    const i = String(name || "").lastIndexOf("/");
    return i === -1 ? "" : name.slice(0, i);
  }
  function baseNoExt(name) {
    const s = String(name || "");
    const base = s.slice(s.lastIndexOf("/") + 1);
    const dot = base.lastIndexOf(".");
    return dot === -1 ? base : base.slice(0, dot);
  }
  function joinPath(dir, entry) {
    if (!dir) return entry;
    if (!entry) return dir;
    return `${dir}/${entry}`;
  }
  function parseCfg(text) {
    const out = [];
    for (const line of String(text || "").split("\n")) {
      const t = line.trim();
      if (!t || t.charAt(0) === "%") continue;
      out.push(t);
    }
    return out;
  }
  function cfgByDirFromFiles(files, getText) {
    const cfgByDir = {};
    for (const f of files) {
      const n = String(f.name || "");
      if (!n.toLowerCase().endsWith(".cfg")) continue;
      const dir = dirOf(n);
      const base = n.slice(n.lastIndexOf("/") + 1);
      if (!cfgByDir[dir]) cfgByDir[dir] = {};
      cfgByDir[dir][base] = String(getText(f.id) ?? "");
    }
    return cfgByDir;
  }
  function allSignaturePaths(files) {
    const out = [];
    for (const f of files) {
      const fn = String(f.name || "");
      const low = fn.toLowerCase();
      if (isSignaturePath(fn)) out.push(fn);
    }
    return out;
  }
  function pathSetFrom(paths) {
    return Object.fromEntries(paths.map((p) => [p, true]));
  }
  function cfgHash(text) {
    let hash = 2166136261;
    const s = String(text || "");
    for (let i = 0; i < s.length; i += 1) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(16);
  }
  function resolveCfgOrder(cfgDir, cfgText, cfgByDir, pathSet, seenCfg) {
    seenCfg = seenCfg || /* @__PURE__ */ new Set();
    const key = `${cfgDir}\0${cfgHash(cfgText)}`;
    if (seenCfg.has(key)) return [];
    seenCfg.add(key);
    const ordered = [];
    const seen = /* @__PURE__ */ new Set();
    for (const entry of parseCfg(cfgText)) {
      const low = entry.toLowerCase();
      if (low.endsWith(".cfg")) {
        const slash = entry.lastIndexOf("/");
        const subDir = slash === -1 ? cfgDir : joinPath(cfgDir, entry.slice(0, slash));
        const subName = slash === -1 ? entry : entry.slice(slash + 1);
        const subMap = cfgByDir[subDir];
        if (subMap?.[subName]) {
          for (const p of resolveCfgOrder(subDir, subMap[subName], cfgByDir, pathSet, seenCfg)) {
            if (!seen.has(p)) {
              seen.add(p);
              ordered.push(p);
            }
          }
        }
      } else if (isCfgSourceEntry(entry)) {
        const full = joinPath(cfgDir, entry);
        if (pathSet[full] && !seen.has(full)) {
          seen.add(full);
          ordered.push(full);
        }
      }
    }
    return ordered;
  }
  function topLevelCfgPaths(files, getText) {
    const cfgByDir = cfgByDirFromFiles(files, getText);
    const referenced = {};
    const cfgPaths = [];
    for (const f of files) {
      const n = String(f.name || "");
      if (!n.toLowerCase().endsWith(".cfg")) continue;
      cfgPaths.push(n);
      const cdir = dirOf(n);
      for (const entry of parseCfg(getText(f.id))) {
        if (entry.toLowerCase().endsWith(".cfg")) {
          referenced[joinPath(cdir, entry)] = true;
        }
      }
    }
    cfgPaths.sort();
    return cfgPaths.filter((p) => !referenced[p]);
  }
  function resolveActiveChain(files, cfgPath, getText) {
    if (!cfgPath) return [];
    const allSet = pathSetFrom(allSignaturePaths(files));
    const cfgByDir = cfgByDirFromFiles(files, getText);
    const dir = dirOf(cfgPath);
    const base = cfgPath.slice(cfgPath.lastIndexOf("/") + 1);
    const map = cfgByDir[dir];
    if (!map?.[base]) return [];
    return resolveCfgOrder(dir, map[base], cfgByDir, allSet, /* @__PURE__ */ new Set());
  }
  function owningCfgForFile(files, fileName, getText, preferredCfg = null) {
    const dir = dirOf(fileName);
    const cfgs = files.filter((f) => /\.cfg$/i.test(String(f.name || "")) && dirOf(f.name) === dir).map((f) => f.name);
    if (!cfgs.length) return null;
    const owning = cfgs.filter((cfg) => resolveActiveChain(files, cfg, getText).includes(fileName));
    if (!owning.length) return null;
    if (preferredCfg && owning.includes(preferredCfg)) return preferredCfg;
    return owning[0];
  }
  function bestCfgInDir(files, getText, dir) {
    const cfgByDir = cfgByDirFromFiles(files, getText);
    const map = cfgByDir[dir != null ? String(dir) : ""];
    if (!map) return null;
    const pathSet = pathSetFrom(allSignaturePaths(files).filter((p) => dirOf(p) === dir));
    let best = null;
    let bestCount = -1;
    for (const cfgName of Object.keys(map)) {
      const cfgPath = joinPath(dir, cfgName);
      const ord = resolveCfgOrder(dir, map[cfgName], cfgByDir, pathSet, /* @__PURE__ */ new Set());
      if (ord.length > bestCount || ord.length === bestCount && cfgPath < (best || "")) {
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
    const cfgByDir = cfgByDirFromFiles(files, getText);
    const out = {};
    for (const dir of Object.keys(cfgByDir)) {
      const best = bestCfgInDir(files, getText, dir);
      if (best) out[dir] = best;
    }
    return out;
  }
  function defaultActiveCfgForDir(dir) {
    const d = dir != null ? String(dir) : "";
    const g6 = typeof globalThis !== "undefined" ? globalThis : {};
    const P2 = g6.Persist;
    if (P2 && typeof P2.getActiveCfgForDir === "function") {
      const path = P2.getActiveCfgForDir(d);
      if (path) {
        if (typeof P2.listFiles === "function") {
          const files = P2.listFiles();
          if (files.some((f) => f.name === path)) return path;
        } else return path;
      }
    }
    if (P2 && typeof P2.listFiles === "function" && typeof P2.getFileText === "function") {
      return inferActiveCfgForDir(P2.listFiles(), (id) => P2.getFileText(id), d);
    }
    return null;
  }
  function activeCfgResolver(map) {
    const byDir = map || {};
    return (dir) => byDir[dir != null ? String(dir) : ""] || null;
  }
  function resolveActiveCfgForDir(options) {
    if (typeof options?.activeCfgForDir === "function") return options.activeCfgForDir;
    return defaultActiveCfgForDir;
  }
  function defaultActiveCfgsForDir(dir) {
    const d = dir != null ? String(dir) : "";
    const g6 = typeof globalThis !== "undefined" ? globalThis : {};
    const P2 = g6.Persist;
    if (P2 && typeof P2.getActiveCfgsForDir === "function") {
      const list = P2.getActiveCfgsForDir(d);
      if (list?.length) {
        if (typeof P2.listFiles === "function") {
          const names = new Set(P2.listFiles().map((f) => f.name));
          const out = list.filter((p) => names.has(p));
          if (out.length) return out;
        } else return list.slice();
      }
    }
    const one = defaultActiveCfgForDir(d);
    return one ? [one] : [];
  }
  function resolveActiveCfgsForDir(options) {
    if (typeof options?.activeCfgsForDir === "function") return options.activeCfgsForDir;
    return defaultActiveCfgsForDir;
  }
  function resolveOwningActiveCfg(files, filePath, getText, activeCfgs) {
    if (!activeCfgs?.length) return null;
    const owning = activeCfgs.filter((cfg) => resolveActiveChain(files, cfg, getText).includes(filePath));
    return owning.length === 1 ? owning[0] : null;
  }
  function standaloneResult(active) {
    return {
      kind: "standalone",
      cfg: null,
      paths: active ? [active.name] : [],
      activeIndex: active ? 0 : -1,
      preludePaths: [],
      scopeKey: active ? `standalone:${active.name}` : "standalone:"
    };
  }
  function developmentForFile(files, activeId, getText, options = {}) {
    const activeCfgsForDir = resolveActiveCfgsForDir(options);
    const activeCfgForDir = resolveActiveCfgForDir(options);
    const active = files.find((f) => f.id === activeId);
    if (!active) {
      return {
        kind: "standalone",
        cfg: null,
        paths: [],
        activeIndex: -1,
        preludePaths: [],
        scopeKey: "standalone:"
      };
    }
    if (/\.cfg$/i.test(String(active.name))) {
      const paths2 = resolveActiveChain(files, active.name, getText);
      return {
        kind: "module",
        cfg: active.name,
        paths: paths2,
        activeIndex: -1,
        preludePaths: [],
        scopeKey: `module:${active.name}`
      };
    }
    if (!isSignaturePath(active.name)) {
      return {
        kind: "standalone",
        cfg: null,
        paths: [],
        activeIndex: -1,
        preludePaths: [],
        scopeKey: "standalone:"
      };
    }
    let cfgPath = resolveOwningActiveCfg(files, active.name, getText, activeCfgsForDir(dirOf(active.name)));
    if (!cfgPath) cfgPath = activeCfgForDir(dirOf(active.name));
    let paths = cfgPath ? resolveActiveChain(files, cfgPath, getText) : [];
    let activeIndex = paths.indexOf(active.name);
    if (activeIndex < 0) {
      cfgPath = owningCfgForFile(files, active.name, getText, cfgPath);
      if (!cfgPath) return standaloneResult(active);
      paths = resolveActiveChain(files, cfgPath, getText);
      activeIndex = paths.indexOf(active.name);
      if (activeIndex < 0) return standaloneResult(active);
    }
    return {
      kind: "module",
      cfg: cfgPath,
      paths,
      activeIndex,
      preludePaths: activeIndex > 0 ? paths.slice(0, activeIndex) : [],
      scopeKey: `module:${cfgPath}`
    };
  }
  function cfgPathForActive(files, activeId, getText, options = {}) {
    const dev = developmentForFile(files, activeId, getText, options);
    return dev.kind === "module" && dev.cfg ? dev.cfg : null;
  }
  function visibilityPaths(dev) {
    if (!dev || !dev.paths.length) return [];
    const active = dev.paths[dev.activeIndex >= 0 ? dev.activeIndex : dev.paths.length - 1];
    const out = [...dev.preludePaths];
    if (active && out.indexOf(active) === -1) out.push(active);
    return out;
  }
  function workspaceDevelopments(files, getText) {
    const sigPaths = allSignaturePaths(files);
    const cfgByDir = cfgByDirFromFiles(files, getText);
    const allSet = pathSetFrom(sigPaths);
    const developments = [];
    const covered = {};
    for (const cfgPath of topLevelCfgPaths(files, getText)) {
      const dir = dirOf(cfgPath);
      const base = cfgPath.slice(cfgPath.lastIndexOf("/") + 1);
      const map = cfgByDir[dir];
      if (!map?.[base]) continue;
      const ordered = resolveCfgOrder(dir, map[base], cfgByDir, allSet, /* @__PURE__ */ new Set());
      if (!ordered.length) continue;
      for (const p of ordered) covered[p] = true;
      developments.push({
        kind: "config",
        name: baseNoExt(cfgPath),
        cfg: cfgPath,
        paths: ordered
      });
    }
    for (const p of sigPaths) {
      if (covered[p]) continue;
      developments.push({ kind: "orphan", name: p, cfg: null, paths: [p] });
    }
    return developments;
  }
  function orderedDevelopmentPaths(files, activeId, getText, options = {}) {
    return developmentForFile(files, activeId, getText, options).paths;
  }
  function preludePathsFor(files, activeId, getText, options = {}) {
    return developmentForFile(files, activeId, getText, options).preludePaths;
  }
  function listDevelopmentMembers(files, activeId, getText, options = {}, liveActiveText = null) {
    const dev = developmentForFile(files, activeId, getText, options);
    const byName = new Map(files.map((f) => [f.name, f]));
    const members = [];
    for (const path of dev.paths) {
      const f = byName.get(path);
      if (!f) continue;
      const text = f.id === activeId && liveActiveText != null ? liveActiveText : String(getText(f.id) ?? "");
      members.push({ id: f.id, name: f.name, text });
    }
    if (!members.length) {
      const f = files.find((x) => x.id === activeId);
      if (f) {
        members.push({
          id: f.id,
          name: f.name,
          text: String(liveActiveText != null && f.id === activeId ? liveActiveText : getText(f.id) ?? "")
        });
      }
    }
    return { members, paths: dev.paths };
  }

  // js/workspace/project-source.mjs
  function concat(files) {
    const parts = [];
    const spans = [];
    let cursor = 1;
    for (const f of files) {
      const text = String(f.text != null ? f.text : "");
      const lineCount = text.split("\n").length;
      spans.push({
        id: f.id,
        name: f.name,
        startLine: cursor,
        endLine: cursor + lineCount - 1
      });
      parts.push(text);
      cursor += lineCount + 1;
    }
    return { code: parts.join("\n\n"), spans };
  }
  function mapLine(spans, line) {
    if (!spans || !isFinite(line)) return null;
    for (const s of spans) {
      if (line >= s.startLine && line <= s.endLine) {
        return { id: s.id, name: s.name, line: line - s.startLine + 1 };
      }
    }
    return null;
  }
  function remapLocations(text, spans) {
    if (!text || !spans || !spans.length) return text;
    let out = String(text);
    out = out.replace(
      /File\s+"([^"]*)"\s*,\s*line\s+(\d+)/g,
      (whole, _fname, line) => {
        const hit = mapLine(spans, +line);
        if (!hit) return whole;
        return `File "${hit.name}", line ${hit.line}`;
      }
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
      }
    );
    out = out.replace(
      /(^|\n)(\s*)at line\s+(\d+),(\s*characters?\s+\d+(?:-\d+)?)/g,
      (whole, lead, ws, line, rest) => {
        const hit = mapLine(spans, +line);
        if (!hit) return whole;
        return `${lead}${ws}in ${hit.name}, at line ${hit.line},${rest}`;
      }
    );
    return out;
  }
  function pickCfgForDir(cfgByDir, dir, paths, activeName) {
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
        const ord = resolveCfgOrder(dir, map[name], cfgByDir, pathSet, /* @__PURE__ */ new Set());
        if (ord.indexOf(activeName) !== -1) return map[name];
      }
    }
    if (names.length === 1) return map[names[0]];
    let best = null;
    let bestCount = -1;
    for (const name of names) {
      const resolved = resolveCfgOrder(dir, map[name], cfgByDir, pathSet, /* @__PURE__ */ new Set());
      if (resolved.length > bestCount) {
        bestCount = resolved.length;
        best = map[name];
      }
    }
    return best;
  }
  function orderSignaturePaths(paths, cfgByDir) {
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
        const ordered = resolveCfgOrder(dir, cfgText, cfgByDir, pathSet, /* @__PURE__ */ new Set());
        const seen = {};
        for (const p of ordered) {
          if (!seen[p]) {
            seen[p] = true;
            out.push(p);
          }
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
  function orderBelPaths(belPaths, cfgByDir) {
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
        const ordered = resolveCfgOrder(dir, cfgText, cfgByDir, belSet, /* @__PURE__ */ new Set());
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
  function developmentFilesFor(files, activeId, getText, options) {
    const ordered = orderedDevelopmentPaths(files, activeId, getText, options);
    const out = [];
    for (const name of ordered) {
      for (const f of files) {
        if (f.name === name) {
          out.push(f);
          break;
        }
      }
    }
    return out;
  }
  function orderedPathsForCfg(files, cfgPath, getText) {
    if (!cfgPath) return [];
    const dir = dirOf(cfgPath);
    const base = cfgPath.slice(cfgPath.lastIndexOf("/") + 1);
    const paths = [];
    for (const f of files) {
      const fn = String(f.name || "");
      if (dirOf(fn) === dir && isSignaturePath(fn)) paths.push(fn);
    }
    const cfgByDir = cfgByDirFromFiles(files, getText);
    const map = cfgByDir[dir];
    if (!map || !map[base]) return [];
    const pathSet = Object.fromEntries(paths.map((p) => [p, true]));
    return resolveCfgOrder(dir, map[base], cfgByDir, pathSet, /* @__PURE__ */ new Set());
  }
  function developmentFilesForCfg(files, cfgPath, getText) {
    const ordered = orderedPathsForCfg(files, cfgPath, getText);
    const out = [];
    for (const name of ordered) {
      for (const f of files) {
        if (f.name === name) {
          out.push(f);
          break;
        }
      }
    }
    return out;
  }
  function inferDefaultCfgPath(files, getText) {
    const cfgFiles = files.filter((f) => String(f.name || "").toLowerCase().endsWith(".cfg"));
    if (!cfgFiles.length) return null;
    const cfgByDir = cfgByDirFromFiles(files, getText);
    const sigPaths = allSignaturePaths(files);
    let best = null;
    let bestCount = -1;
    for (const cfg of cfgFiles) {
      const cfgPath = cfg.name;
      const dir = dirOf(cfgPath);
      const base = cfgPath.slice(cfgPath.lastIndexOf("/") + 1);
      const map = cfgByDir[dir];
      if (!map || !map[base]) continue;
      const pathSet = {};
      for (const p of sigPaths) {
        if (dirOf(p) === dir) pathSet[p] = true;
      }
      const ord = resolveCfgOrder(dir, map[base], cfgByDir, pathSet, /* @__PURE__ */ new Set());
      if (!best || ord.length > bestCount || ord.length === bestCount && cfgPath < best) {
        bestCount = ord.length;
        best = cfgPath;
      }
    }
    return best;
  }
  function preludeFilesFor(files, activeId, getText, options) {
    const paths = preludePathsFor(files, activeId, getText, options || {});
    if (!paths.length) return [];
    const out = [];
    for (const name of paths) {
      for (const f of files) {
        if (f.name === name) {
          out.push(f);
          break;
        }
      }
    }
    return out;
  }
  var GLOBAL_FILE_PRAGMA_LINE = /^\s*--(?:nostrengthen|coverage|warncoverage)\s*\.?\s*(?:%.*)?$/i;
  function peelGlobalFilePragmas(fileCode) {
    const text = String(fileCode != null ? fileCode : "");
    const lines = text.split("\n");
    let start = -1;
    if (lines[0] && GLOBAL_FILE_PRAGMA_LINE.test(lines[0])) start = 0;
    else if (lines[0] && lines[0].trim() === "" && lines[1] && GLOBAL_FILE_PRAGMA_LINE.test(lines[1])) start = 1;
    if (start < 0) {
      return { hoisted: "", rest: text, hoistLineCount: 0 };
    }
    const hoisted = [];
    let i = start;
    while (i < lines.length && GLOBAL_FILE_PRAGMA_LINE.test(lines[i])) {
      hoisted.push(lines[i]);
      i += 1;
    }
    while (i < lines.length && lines[i].trim() === "") i += 1;
    const hoistedText = hoisted.join("\n");
    return {
      hoisted: hoistedText,
      rest: lines.slice(i).join("\n"),
      hoistLineCount: hoistedText ? hoistedText.split("\n").length : 0
    };
  }
  function peelGlobalFilePragmasInPlace(fileCode) {
    const text = String(fileCode != null ? fileCode : "");
    const peeled = peelGlobalFilePragmas(text);
    if (!peeled.hoisted) return { hoisted: "", body: text };
    const lines = text.split("\n");
    let blanked = 0;
    for (let i = 0; i < lines.length && blanked < peeled.hoistLineCount; i += 1) {
      if (GLOBAL_FILE_PRAGMA_LINE.test(lines[i])) {
        lines[i] = "";
        blanked += 1;
      }
    }
    return { hoisted: peeled.hoisted, body: lines.join("\n") };
  }
  function joinCheckerParts(parts) {
    return parts.filter((p) => p != null && p !== "").join("\n\n");
  }
  function assembleCheckerCode(fileCode, prelude) {
    if (!prelude) {
      return { code: String(fileCode != null ? fileCode : ""), prelude: null };
    }
    const peeled = peelGlobalFilePragmasInPlace(fileCode);
    if (!peeled.hoisted) {
      return { code: joinCheckerParts([prelude.code, peeled.body]), prelude };
    }
    const hoistOffset = peeled.hoisted.split("\n").length + 1;
    const adjustedPrelude = {
      code: prelude.code,
      spans: prelude.spans.map((s) => ({
        id: s.id,
        name: s.name,
        startLine: s.startLine + hoistOffset,
        endLine: s.endLine + hoistOffset
      })),
      offsetLines: prelude.offsetLines + hoistOffset,
      names: prelude.names
    };
    return {
      code: joinCheckerParts([peeled.hoisted, prelude.code, peeled.body]),
      prelude: adjustedPrelude
    };
  }
  function assembleProjectCode(files) {
    const hoistedLines = [];
    const stripped = [];
    for (const f of files) {
      const peeled = peelGlobalFilePragmas(String(f.text != null ? f.text : ""));
      if (peeled.hoisted) {
        for (const line of peeled.hoisted.split("\n")) {
          if (line && hoistedLines.indexOf(line) === -1) hoistedLines.push(line);
        }
      }
      stripped.push({ id: f.id, name: f.name, text: peeled.rest });
    }
    const hoisted = hoistedLines.join("\n");
    const parts = [];
    const spans = [];
    let cursor = hoisted ? hoistedLines.length + 2 : 1;
    for (const s of stripped) {
      const text = String(s.text != null ? s.text : "");
      const lineCount = text.split("\n").length;
      spans.push({
        id: s.id,
        name: s.name,
        startLine: cursor,
        endLine: cursor + lineCount - 1
      });
      parts.push(text);
      cursor += lineCount + 1;
    }
    const body = parts.join("\n\n");
    return {
      code: hoisted ? joinCheckerParts([hoisted, body]) : body,
      spans
    };
  }
  function buildPrelude(files, activeId, getText, options) {
    const pre = preludeFilesFor(files, activeId, getText, options);
    if (!pre.length) return null;
    const parts = [];
    const spans = [];
    let cursor = 1;
    for (const f of pre) {
      const text = String(getText(f.id) != null ? getText(f.id) : "");
      const lineCount = text.split("\n").length;
      spans.push({ id: f.id, name: f.name, startLine: cursor, endLine: cursor + lineCount - 1 });
      parts.push(text);
      cursor += lineCount + 1;
    }
    const last = spans[spans.length - 1];
    return {
      code: parts.join("\n\n"),
      spans,
      offsetLines: last.endLine + 1
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
    const lines = String(text).slice(index, index + 400).split("\n");
    for (const line of lines) {
      const t = line.trim().replace(/^(Error|Warning):\s*/i, "");
      if (t && !/^[-^~\s]+$/.test(t)) return t.slice(0, 160);
    }
    return "";
  }
  function shiftCheckerOutput(text, prelude) {
    if (!text || !prelude) return { text: text || "", preludeIssues: [] };
    const offset = prelude.offsetLines;
    const issues = [];
    const seen = /* @__PURE__ */ new Set();
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
      return `(project prelude ${hit ? hit.name : "?"} line ${hit ? hit.line : L})`;
    });
    out = out.replace(
      /([^\s:"]+)\.bel:(\d+)\.(\d+)(?:-(\d+)\.(\d+))?:/g,
      (whole, fname, sl, sc, el, ec, idx, src) => {
        const SL = +sl;
        if (SL > offset) {
          const EL = el != null ? +el - offset : null;
          if (el != null && EL < 1) return whole;
          return `${fname}.bel:${SL - offset}.${sc}${el != null ? `-${EL}.${ec}` : ""}:`;
        }
        const hit = preludeFileAt(prelude.spans, SL);
        if (hit) noteIssue(hit, src, idx + whole.length);
        return `(project prelude ${hit ? hit.name : "?"} line ${hit ? hit.line : SL})`;
      }
    );
    out = out.replace(
      /(^|\n)(\s*)at line\s+(\d+),(\s*characters?\s+\d+(?:-\d+)?)/g,
      (whole, lead, ws, line, rest, idx, src) => {
        const L = +line;
        if (L > offset) return `${lead}${ws}at line ${L - offset},${rest}`;
        const hit = preludeFileAt(prelude.spans, L);
        if (hit) noteIssue(hit, src, idx + whole.length);
        return `${lead}${ws}(project prelude ${hit ? hit.name : "?"} line ${hit ? hit.line : L})${rest.replace(/^\s*/, " ")}`;
      }
    );
    return { text: out, preludeIssues: issues };
  }
  function scanProjectText(files, query, limit) {
    const cap = limit || 60;
    const q = String(query || "").toLowerCase();
    if (!q) return [];
    const out = [];
    for (const f of files) {
      const text = String(f.text != null ? f.text : "");
      const lines = text.split("\n");
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
            to: offset + k + q.length
          });
          if (out.length >= cap) return out;
          k = lower.indexOf(q, k + Math.max(1, q.length));
        }
        offset += lines[li].length + 1;
      }
    }
    return out;
  }
  function reorder(files, id, delta) {
    const idx = files.findIndex((f) => f.id === id);
    if (idx === -1) return files;
    const to = Math.max(0, Math.min(files.length - 1, idx + (delta || 0)));
    if (to === idx) return files;
    const next = files.slice();
    const entry = next.splice(idx, 1)[0];
    next.splice(to, 0, entry);
    return next;
  }
  var ProjectSource = {
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
    scanProjectText
  };
  var g = typeof window !== "undefined" ? window : globalThis;
  g.ProjectSource = ProjectSource;
  g.BelJarProjectSource = g.ProjectSource;

  // js/workspace/workspace-state.mjs
  var SCHEMA_VERSION = 1;
  var MAX_FLOATING = 8;
  var SAVE_DEBOUNCE_MS = 400;
  var SIDE_PANEL_IDS = ["explorer", "inspector", "library", "harpoon"];
  var providers = /* @__PURE__ */ Object.create(null);
  var saveTimer = null;
  var restoredForProject = null;
  function P() {
    return globalThis.Persist;
  }
  function clampGeom(geom) {
    if (!geom || typeof geom !== "object") return null;
    var x = Number(geom.x);
    var y = Number(geom.y);
    var w = Number(geom.w != null ? geom.w : geom.width);
    var h = Number(geom.h != null ? geom.h : geom.height);
    if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) return null;
    return {
      x: Math.round(x),
      y: Math.round(y),
      w: Math.max(140, Math.round(w)),
      h: Math.max(96, Math.round(h))
    };
  }
  function normalizeInspectorTarget(raw) {
    if (!raw || typeof raw !== "object" || typeof raw.kind !== "string") return null;
    var out = { kind: raw.kind };
    if (typeof raw.name === "string") out.name = raw.name;
    if (typeof raw.fileId === "string") out.fileId = raw.fileId;
    var ph = Number(raw.posHint != null ? raw.posHint : raw.pos);
    if (isFinite(ph) && ph >= 0) out.posHint = Math.floor(ph);
    if (raw.kind === "global" && !out.fileId) return null;
    if (raw.kind === "symbol" && !out.name) return null;
    return out;
  }
  function normalizeProvingDecl(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.fileId !== "string" || typeof raw.declKey !== "string") return null;
    return { fileId: raw.fileId, declKey: raw.declKey };
  }
  function normalizeFloatingEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    var kind = raw.kind;
    if (kind !== "inspector" && kind !== "graph" && kind !== "harpoon") return null;
    if (typeof raw.fileId !== "string" || !raw.fileId) return null;
    var geom = clampGeom(raw.geom);
    if (!geom) return null;
    var anchor = raw.anchor && typeof raw.anchor === "object" ? raw.anchor : null;
    if (!anchor) return null;
    return {
      id: typeof raw.id === "string" ? raw.id : kind + ":" + raw.fileId + ":" + geom.x,
      kind,
      geom,
      fileId: raw.fileId,
      anchor,
      followEditor: !!raw.followEditor,
      zOrder: isFinite(Number(raw.zOrder)) ? Number(raw.zOrder) : 0
    };
  }
  function emptyWorkspace(projectId) {
    return {
      v: SCHEMA_VERSION,
      projectId: projectId || "default",
      updatedAt: 0,
      activeSidePanel: null,
      sidebar: {
        inspector: { target: null, histIndex: -1, scrollTop: 0 },
        explorer: { revealActiveFile: true, scrollActiveIntoView: true },
        library: { filterText: "" },
        harpoon: { provingDecl: null }
      },
      floating: []
    };
  }
  function normalizeWorkspace(raw, projectId) {
    var base = emptyWorkspace(projectId);
    if (!raw || typeof raw !== "object") return base;
    if (raw.v !== SCHEMA_VERSION) return base;
    if (typeof raw.projectId === "string") base.projectId = raw.projectId;
    if (typeof raw.updatedAt === "number") base.updatedAt = raw.updatedAt;
    var asp = raw.activeSidePanel;
    if (asp === null || SIDE_PANEL_IDS.indexOf(asp) !== -1) base.activeSidePanel = asp;
    if (raw.sidebar && typeof raw.sidebar === "object") {
      var sb = raw.sidebar;
      if (sb.inspector && typeof sb.inspector === "object") {
        base.sidebar.inspector.target = normalizeInspectorTarget(sb.inspector.target);
        var hi = Number(sb.inspector.histIndex);
        if (isFinite(hi)) base.sidebar.inspector.histIndex = Math.floor(hi);
        var st = Number(sb.inspector.scrollTop);
        if (isFinite(st) && st >= 0) base.sidebar.inspector.scrollTop = Math.floor(st);
      }
      if (sb.explorer && typeof sb.explorer === "object") {
        if (typeof sb.explorer.revealActiveFile === "boolean") {
          base.sidebar.explorer.revealActiveFile = sb.explorer.revealActiveFile;
        }
        if (typeof sb.explorer.scrollActiveIntoView === "boolean") {
          base.sidebar.explorer.scrollActiveIntoView = sb.explorer.scrollActiveIntoView;
        }
      }
      if (sb.library && typeof sb.library === "object" && typeof sb.library.filterText === "string") {
        base.sidebar.library.filterText = sb.library.filterText.slice(0, 200);
      }
      if (sb.harpoon && typeof sb.harpoon === "object") {
        base.sidebar.harpoon.provingDecl = normalizeProvingDecl(sb.harpoon.provingDecl);
      }
    }
    if (Array.isArray(raw.floating)) {
      var floats = [];
      for (var i = 0; i < raw.floating.length && floats.length < MAX_FLOATING; i++) {
        var entry = normalizeFloatingEntry(raw.floating[i]);
        if (entry) floats.push(entry);
      }
      base.floating = floats;
    }
    return base;
  }
  function readWorkspace(projectId) {
    var persist = P();
    if (!persist || typeof persist.readStoredWorkspace !== "function") {
      return emptyWorkspace(projectId);
    }
    return normalizeWorkspace(persist.readStoredWorkspace(projectId), projectId);
  }
  function writeWorkspace(snapshot, projectId) {
    var persist = P();
    if (!persist || typeof persist.writeStoredWorkspace !== "function") return false;
    var pid = projectId || (persist.getActiveProjectId ? persist.getActiveProjectId() : "default");
    var next = normalizeWorkspace(snapshot, pid);
    next.projectId = pid;
    next.updatedAt = Date.now();
    return persist.writeStoredWorkspace(next, pid);
  }
  function registerProvider(name, hooks) {
    if (!name || !hooks) return;
    providers[name] = hooks;
  }
  function collectFromProviders(out) {
    for (var name in providers) {
      if (!Object.prototype.hasOwnProperty.call(providers, name)) continue;
      var hooks = providers[name];
      if (hooks && typeof hooks.collect === "function") {
        try {
          hooks.collect(out);
        } catch (_) {
        }
      }
    }
  }
  function mergeFloatingSnapshots(priorFloating, activeFileId, openFileIds, liveFloating) {
    var open = openFileIds || [];
    var live = Array.isArray(liveFloating) ? liveFloating : [];
    var kept = (priorFloating || []).filter(function(entry) {
      if (!entry || entry.fileId === activeFileId) return false;
      if (open.indexOf(entry.fileId) === -1) return false;
      if (entry.kind === "graph" || entry.kind === "harpoon") return false;
      return true;
    });
    var merged = kept.concat(live);
    return merged.filter(function(entry) {
      return entry && open.indexOf(entry.fileId) !== -1;
    }).slice(0, MAX_FLOATING);
  }
  function collectWorkspace() {
    var persist = P();
    var pid = persist && persist.getActiveProjectId ? persist.getActiveProjectId() : "default";
    var prior = readWorkspace(pid);
    var snap = emptyWorkspace(pid);
    var openIds = persist && persist.getOpenFileIds ? persist.getOpenFileIds() : [];
    var activeFileId = persist && persist.getActiveFileId ? persist.getActiveFileId() : null;
    snap.activeSidePanel = persist && typeof persist.readStoredActiveSidePanel === "function" ? persist.readStoredActiveSidePanel(pid) : null;
    snap.floating = [];
    collectFromProviders(snap);
    snap.floating = mergeFloatingSnapshots(prior.floating, activeFileId, openIds, snap.floating);
    snap.projectId = pid;
    snap.updatedAt = Date.now();
    snap.v = SCHEMA_VERSION;
    return snap;
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = globalThis.setTimeout(function() {
      saveTimer = null;
      flushWorkspace();
    }, SAVE_DEBOUNCE_MS);
  }
  function flushWorkspace() {
    var snap = collectWorkspace();
    writeWorkspace(snap, snap.projectId);
  }
  function filterFloatingForFile(floating, fileId, openFileIds) {
    if (!Array.isArray(floating)) return [];
    var open = openFileIds || [];
    return floating.filter(function(entry) {
      if (!entry || entry.fileId !== fileId) return false;
      return open.indexOf(entry.fileId) !== -1;
    });
  }
  function applyWorkspace(snapshot, deps) {
    deps = deps || {};
    var persist = P();
    var pid = deps.projectId || (persist && persist.getActiveProjectId ? persist.getActiveProjectId() : "default");
    var ws = normalizeWorkspace(snapshot, pid);
    if (restoredForProject === pid + ":" + ws.updatedAt) return;
    restoredForProject = pid + ":" + ws.updatedAt;
    var openIds = deps.openFileIds || (persist && persist.getOpenFileIds ? persist.getOpenFileIds() : []);
    var activeFileId = deps.activeFileId || (persist && persist.getActiveFileId ? persist.getActiveFileId() : null);
    if (typeof deps.applySidePanel === "function" && ws.activeSidePanel) {
      deps.applySidePanel(ws.activeSidePanel);
    }
    for (var name in providers) {
      if (!Object.prototype.hasOwnProperty.call(providers, name)) continue;
      var hooks = providers[name];
      if (!hooks || typeof hooks.restoreSidebar !== "function") continue;
      try {
        hooks.restoreSidebar(ws.sidebar, deps);
      } catch (_) {
      }
    }
    if (typeof deps.restoreFloating === "function") {
      var floats = filterFloatingForFile(ws.floating, activeFileId, openIds);
      deps.restoreFloating(floats, deps);
    }
  }
  function resetWorkspaceState(projectId) {
    var persist = P();
    if (persist && typeof persist.resetStoredWorkspace === "function") {
      persist.resetStoredWorkspace(projectId);
    }
    restoredForProject = null;
  }
  var WorkspaceState = {
    SCHEMA_VERSION,
    MAX_FLOATING,
    SIDE_PANEL_IDS,
    normalizeWorkspace,
    normalizeFloatingEntry,
    normalizeInspectorTarget,
    readWorkspace,
    writeWorkspace,
    collectWorkspace,
    flushWorkspace,
    scheduleSave,
    registerProvider,
    applyWorkspace,
    filterFloatingForFile,
    resetWorkspaceState,
    mergeFloatingSnapshots,
    clampGeom
  };
  var g2 = typeof window !== "undefined" ? window : globalThis;
  g2.WorkspaceState = WorkspaceState;
  g2.BelJarWorkspaceState = g2.WorkspaceState;

  // js/workspace/workspace-split.mjs
  var STACK_MQ = "(max-width: 48rem)";
  var HIT_GRACE_PX = 6;
  function init(opts) {
    opts = opts || {};
    var workspace = document.querySelector(".workspace");
    var workspacePanes = document.querySelector(".workspace-panes");
    var editorPanel = document.querySelector(".editor-panel");
    var outputPanel = document.querySelector(".output-panel");
    var sidebar = document.querySelector(".workspace .sidebar");
    var explorerPanel = document.querySelector(".explorer-panel");
    var inspectorPanel = document.querySelector(".inspector-panel");
    var libraryPanel = document.querySelector(".library-panel");
    if (!workspace || !workspacePanes || !editorPanel || !outputPanel) return null;
    var persist = globalThis.Persist;
    var ratio = persist && persist.readStoredEditorSplit ? persist.readStoredEditorSplit() : 0.5;
    var stackedMq = globalThis.matchMedia(STACK_MQ);
    var dragging = false;
    var hitStrip = document.createElement("div");
    hitStrip.className = "workspace-resize-hit";
    hitStrip.setAttribute("aria-hidden", "true");
    hitStrip.tabIndex = -1;
    workspacePanes.appendChild(hitStrip);
    function clamp(r) {
      return persist && persist.clampEditorSplit ? persist.clampEditorSplit(r) : Math.min(0.82, Math.max(0.18, r));
    }
    function isStacked() {
      return stackedMq.matches;
    }
    function seamCoord() {
      var rect = editorPanel.getBoundingClientRect();
      return isStacked() ? rect.bottom : rect.right;
    }
    function positionHitStrip() {
      var panes = workspacePanes.getBoundingClientRect();
      var er = editorPanel.getBoundingClientRect();
      var seam = seamCoord();
      var span = HIT_GRACE_PX * 2;
      if (isStacked()) {
        hitStrip.style.left = er.left - panes.left + "px";
        hitStrip.style.width = er.width + "px";
        hitStrip.style.top = seam - panes.top - HIT_GRACE_PX + "px";
        hitStrip.style.height = span + "px";
      } else {
        hitStrip.style.top = er.top - panes.top + "px";
        hitStrip.style.height = er.height + "px";
        hitStrip.style.left = seam - panes.left - HIT_GRACE_PX + "px";
        hitStrip.style.width = span + "px";
      }
    }
    function applySplitVars(r) {
      var root = document.documentElement.style;
      var a = Math.round(r * 1e6) / 1e6;
      var b = Math.round((1 - r) * 1e6) / 1e6;
      if (isStacked()) {
        root.removeProperty("--workspace-split-cols");
        root.setProperty("--workspace-split-rows", a + "fr " + b + "fr");
      } else {
        root.removeProperty("--workspace-split-rows");
        root.setProperty("--workspace-split-cols", a + "fr " + b + "fr");
      }
    }
    function applyLayout(save) {
      ratio = clamp(ratio);
      applySplitVars(ratio);
      if (save && persist && persist.writeStoredEditorSplit) {
        persist.writeStoredEditorSplit(ratio);
      }
      if (typeof opts.onResize === "function") opts.onResize();
      requestAnimationFrame(positionHitStrip);
    }
    function pointerRatio(ev) {
      if (isStacked()) {
        var eRect = editorPanel.getBoundingClientRect();
        var oRect = outputPanel.getBoundingClientRect();
        var span = eRect.height + oRect.height;
        if (span <= 0) return ratio;
        return (ev.clientY - eRect.top) / span;
      }
      var left;
      var sidePanel = null;
      if (workspace.classList.contains("is-explorer-open")) sidePanel = explorerPanel;
      else if (workspace.classList.contains("is-inspector-open")) sidePanel = inspectorPanel;
      else if (workspace.classList.contains("is-library-open")) sidePanel = libraryPanel;
      if (sidePanel && sidePanel.getBoundingClientRect().width > 0) {
        left = sidePanel.getBoundingClientRect().right;
      } else {
        left = sidebar ? sidebar.getBoundingClientRect().right : workspace.getBoundingClientRect().left;
      }
      var right = workspacePanes.getBoundingClientRect().right;
      var span = right - left;
      if (span <= 0) return ratio;
      return (ev.clientX - left) / span;
    }
    function setDragging(on) {
      dragging = on;
      document.body.classList.toggle("workspace-resizing", on);
    }
    function onPointerMove(ev) {
      if (!dragging) return;
      ev.preventDefault();
      ratio = pointerRatio(ev);
      applyLayout(true);
    }
    function endDrag() {
      if (!dragging) return;
      setDragging(false);
      globalThis.removeEventListener("pointermove", onPointerMove);
      globalThis.removeEventListener("pointerup", endDrag);
      globalThis.removeEventListener("pointercancel", endDrag);
    }
    function startDrag(ev) {
      if (ev.button !== 0) return;
      ev.preventDefault();
      setDragging(true);
      ratio = pointerRatio(ev);
      applyLayout(true);
      globalThis.addEventListener("pointermove", onPointerMove);
      globalThis.addEventListener("pointerup", endDrag);
      globalThis.addEventListener("pointercancel", endDrag);
    }
    hitStrip.addEventListener("pointerdown", startDrag);
    stackedMq.addEventListener("change", function() {
      applyLayout(false);
    });
    globalThis.addEventListener("resize", positionHitStrip);
    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(function() {
        positionHitStrip();
      });
      ro.observe(workspacePanes);
      ro.observe(editorPanel);
    }
    applyLayout(false);
    return { getRatio: function() {
      return ratio;
    } };
  }
  var WorkspaceSplit = { init };
  var g3 = typeof window !== "undefined" ? window : globalThis;
  g3.WorkspaceSplit = WorkspaceSplit;
  g3.BelJarWorkspaceSplit = g3.WorkspaceSplit;

  // js/workspace/side-panel-resize.mjs
  var STACK_MQ2 = "(max-width: 48rem)";
  var HIT_GRACE_PX2 = 6;
  var DEFAULT_W = 250;
  var DEFAULT_H = 190;
  function init2(opts) {
    opts = opts || {};
    var workspace = document.querySelector(".workspace");
    if (!workspace) return null;
    var persist = globalThis.Persist;
    if (persist) {
      DEFAULT_W = persist.DEFAULT_SIDE_PANEL_WIDTH || DEFAULT_W;
      DEFAULT_H = persist.DEFAULT_SIDE_PANEL_HEIGHT || DEFAULT_H;
    }
    var stackedMq = globalThis.matchMedia(STACK_MQ2);
    var resizers = [];
    function isStacked() {
      return stackedMq.matches;
    }
    function createResizer(config) {
      var panel = config.panel;
      if (!panel) return null;
      var dragging = false;
      var size = config.read(isStacked());
      var hitStrip = document.createElement("div");
      hitStrip.className = "panel-resize-hit";
      hitStrip.setAttribute("aria-hidden", "true");
      hitStrip.tabIndex = -1;
      panel.appendChild(hitStrip);
      function isOpen() {
        return workspace.classList.contains(config.openClass);
      }
      function applySize(save) {
        if (save && config.write) config.write(Math.round(size), isStacked());
        size = config.read(isStacked());
        var root2 = document.documentElement.style;
        if (isStacked()) {
          root2.setProperty(config.cssVarH, size + "px");
        } else {
          root2.setProperty(config.cssVarW, size + "px");
        }
        if (typeof opts.onResize === "function") opts.onResize();
        requestAnimationFrame(positionHitStrip);
      }
      function activeSeam() {
        return isStacked() ? config.seamStacked : config.seam;
      }
      function positionHitStrip() {
        if (!isOpen()) {
          hitStrip.style.display = "none";
          return;
        }
        hitStrip.style.display = "";
        var span = HIT_GRACE_PX2 * 2;
        var seam = activeSeam();
        if (isStacked()) {
          hitStrip.style.left = "0";
          hitStrip.style.right = "0";
          hitStrip.style.width = "";
          hitStrip.style.height = span + "px";
          if (seam === "bottom") {
            hitStrip.style.top = "";
            hitStrip.style.bottom = -HIT_GRACE_PX2 + "px";
          } else {
            hitStrip.style.top = -HIT_GRACE_PX2 + "px";
            hitStrip.style.bottom = "";
          }
        } else {
          hitStrip.style.top = "0";
          hitStrip.style.bottom = "0";
          hitStrip.style.height = "";
          hitStrip.style.width = span + "px";
          if (seam === "right") {
            hitStrip.style.left = "";
            hitStrip.style.right = -HIT_GRACE_PX2 + "px";
          } else {
            hitStrip.style.left = -HIT_GRACE_PX2 + "px";
            hitStrip.style.right = "";
          }
        }
      }
      function pointerSize(ev) {
        var pr = panel.getBoundingClientRect();
        var seam = activeSeam();
        if (isStacked()) {
          if (seam === "bottom") return ev.clientY - pr.top;
          return pr.bottom - ev.clientY;
        }
        if (seam === "right") return ev.clientX - pr.left;
        return pr.right - ev.clientX;
      }
      function setDragging(on) {
        dragging = on;
        document.body.classList.toggle("workspace-resizing", on);
      }
      function onPointerMove(ev) {
        if (!dragging) return;
        ev.preventDefault();
        size = pointerSize(ev);
        applySize(true);
      }
      function endDrag() {
        if (!dragging) return;
        setDragging(false);
        globalThis.removeEventListener("pointermove", onPointerMove);
        globalThis.removeEventListener("pointerup", endDrag);
        globalThis.removeEventListener("pointercancel", endDrag);
      }
      function startDrag(ev) {
        if (!isOpen() || ev.button !== 0) return;
        ev.preventDefault();
        setDragging(true);
        size = pointerSize(ev);
        applySize(true);
        globalThis.addEventListener("pointermove", onPointerMove);
        globalThis.addEventListener("pointerup", endDrag);
        globalThis.addEventListener("pointercancel", endDrag);
      }
      hitStrip.addEventListener("pointerdown", startDrag);
      return {
        refresh: function() {
          size = config.read(isStacked());
          applySize(false);
        },
        reposition: positionHitStrip
      };
    }
    var panelConfigs = [
      {
        panel: document.querySelector(".explorer-panel"),
        openClass: "is-explorer-open",
        cssVarW: "--explorer-w",
        cssVarH: "--explorer-h",
        read: function(stacked) {
          if (!persist) return stacked ? DEFAULT_H : DEFAULT_W;
          return stacked ? persist.readStoredExplorerHeight() : persist.readStoredExplorerWidth();
        },
        write: function(px, stacked) {
          if (!persist) return;
          if (stacked) persist.writeStoredExplorerHeight(px);
          else persist.writeStoredExplorerWidth(px);
        }
      },
      {
        panel: document.querySelector(".inspector-panel"),
        openClass: "is-inspector-open",
        cssVarW: "--inspector-w",
        cssVarH: "--inspector-h",
        read: function(stacked) {
          if (!persist) return stacked ? DEFAULT_H : DEFAULT_W;
          return stacked ? persist.readStoredInspectorHeight() : persist.readStoredInspectorWidth();
        },
        write: function(px, stacked) {
          if (!persist) return;
          if (stacked) persist.writeStoredInspectorHeight(px);
          else persist.writeStoredInspectorWidth(px);
        }
      },
      {
        panel: document.querySelector(".library-panel"),
        openClass: "is-library-open",
        cssVarW: "--library-w",
        cssVarH: "--library-h",
        read: function(stacked) {
          if (!persist) return stacked ? DEFAULT_H : DEFAULT_W;
          return stacked ? persist.readStoredLibraryHeight() : persist.readStoredLibraryWidth();
        },
        write: function(px, stacked) {
          if (!persist) return;
          if (stacked) persist.writeStoredLibraryHeight(px);
          else persist.writeStoredLibraryWidth(px);
        }
      },
      {
        panel: document.querySelector(".harpoon-panel"),
        openClass: "is-harpoon-open",
        cssVarW: "--harpoon-w",
        cssVarH: "--harpoon-h",
        read: function(stacked) {
          if (!persist) return stacked ? DEFAULT_H : DEFAULT_W;
          return stacked ? persist.readStoredHarpoonHeight() : persist.readStoredHarpoonWidth();
        },
        write: function(px, stacked) {
          if (!persist) return;
          if (stacked) persist.writeStoredHarpoonHeight(px);
          else persist.writeStoredHarpoonWidth(px);
        }
      }
    ];
    if (persist) {
      var root = document.documentElement.style;
      for (var i = 0; i < panelConfigs.length; i++) {
        var cfg = panelConfigs[i];
        root.setProperty(cfg.cssVarW, cfg.read(false) + "px");
        root.setProperty(cfg.cssVarH, cfg.read(true) + "px");
      }
    }
    for (var j = 0; j < panelConfigs.length; j++) {
      panelConfigs[j].seam = "right";
      panelConfigs[j].seamStacked = "bottom";
      var resizer = createResizer(panelConfigs[j]);
      if (resizer) resizers.push(resizer);
    }
    function refreshAll() {
      for (var k = 0; k < resizers.length; k++) resizers[k].refresh();
    }
    function repositionAll() {
      for (var m = 0; m < resizers.length; m++) resizers[m].reposition();
    }
    stackedMq.addEventListener("change", refreshAll);
    globalThis.addEventListener("resize", repositionAll);
    if (typeof MutationObserver !== "undefined") {
      var mo = new MutationObserver(repositionAll);
      mo.observe(workspace, { attributes: true, attributeFilter: ["class"] });
    }
    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(repositionAll);
      for (var n = 0; n < panelConfigs.length; n++) {
        if (panelConfigs[n].panel) ro.observe(panelConfigs[n].panel);
      }
    }
    refreshAll();
    return { refresh: refreshAll };
  }
  var SidePanelResize = { init: init2 };
  var g4 = typeof window !== "undefined" ? window : globalThis;
  g4.SidePanelResize = SidePanelResize;
  g4.BelJarSidePanelResize = g4.SidePanelResize;

  // js/explorer/explorer-suite-layout.mjs
  var SUITE_HUES = [156, 217, 280, 32];
  function explorerFileBucket(name) {
    if (isCfgPath(name)) return 0;
    if (isSignaturePath(name)) return 1;
    return 2;
  }
  function byBaseName(a, b) {
    return a.baseName.localeCompare(b.baseName);
  }
  function resolveMembersDefault(allFiles, cfgPath, getText) {
    return orderedPathsForCfg(allFiles, cfgPath, getText);
  }
  function memberSet(allFiles, cfgPath, getText, resolveMembers) {
    const paths = typeof resolveMembers === "function" ? resolveMembers(allFiles, cfgPath, getText) : resolveMembersDefault(allFiles, cfgPath, getText);
    const out = {};
    for (const p of paths) out[p] = true;
    return out;
  }
  function cfgHasDanglingEntry(allFiles, cfgPath, getText) {
    const names = {};
    for (const f of allFiles) names[f.name] = true;
    let cfgFile = null;
    for (const f of allFiles) {
      if (f.name === cfgPath) {
        cfgFile = f;
        break;
      }
    }
    if (!cfgFile) return true;
    const dir = dirOf(cfgPath);
    for (const entry of parseCfg(getText(cfgFile.id))) {
      if (!isCfgEntryToken(entry)) continue;
      const full = dir ? `${dir}/${entry}` : entry;
      if (!names[full]) return true;
    }
    return false;
  }
  function canActivateCfg(cfgPath, activeCfgs, allFiles, getText, resolveMembers) {
    const nextSet = memberSet(allFiles, cfgPath, getText, resolveMembers);
    const active = activeCfgs || [];
    for (const other of active) {
      if (other === cfgPath) return { ok: true };
      const existing = memberSet(allFiles, other, getText, resolveMembers);
      for (const p of Object.keys(nextSet)) {
        if (existing[p]) {
          const shareBase = p.slice(p.lastIndexOf("/") + 1);
          const otherBase = other.slice(other.lastIndexOf("/") + 1);
          return {
            ok: false,
            reason: `Shares ${shareBase} with active suite ${otherBase}`
          };
        }
      }
    }
    return { ok: true };
  }
  function findCfgIntersection(cfgPath, otherCfgs, allFiles, getText, resolveMembers) {
    const a = memberSet(allFiles, cfgPath, getText, resolveMembers);
    const hits = [];
    for (const other of otherCfgs) {
      if (other === cfgPath) continue;
      const b = memberSet(allFiles, other, getText, resolveMembers);
      for (const p of Object.keys(a)) {
        if (b[p]) hits.push({ file: p, otherCfg: other });
      }
    }
    return hits;
  }
  function computeDirLayout(filesInDir, activeCfgPaths, resolveMembers, allFiles, getText) {
    const fileByName = {};
    for (const f of filesInDir) fileByName[f.name] = f;
    const placed = {};
    let orderedFiles = [];
    const suiteEntries = [];
    const activeList = activeCfgPaths || [];
    const resolver = resolveMembers || resolveMembersDefault;
    for (const cfgPath of activeList) {
      const cfgFile = fileByName[cfgPath];
      if (!cfgFile) continue;
      const memberPaths = resolver(allFiles || filesInDir, cfgPath, getText || (() => ""));
      const blockRows = [cfgFile];
      placed[cfgPath] = true;
      for (const mp of memberPaths) {
        const mf = fileByName[mp];
        if (mf && !placed[mp]) {
          blockRows.push(mf);
          placed[mp] = true;
        }
      }
      suiteEntries.push({
        suiteIndex: suiteEntries.length,
        cfgPath,
        rows: blockRows,
        memberCount: blockRows.length
      });
      orderedFiles.push(...blockRows);
    }
    const inactiveCfg = [];
    const orphanBel = [];
    const other = [];
    for (const f of filesInDir) {
      if (placed[f.name]) continue;
      const bucket = explorerFileBucket(f.name);
      if (bucket === 0) inactiveCfg.push(f);
      else if (bucket === 1) orphanBel.push(f);
      else other.push(f);
    }
    inactiveCfg.sort(byBaseName);
    orphanBel.sort(byBaseName);
    other.sort(byBaseName);
    orderedFiles = orderedFiles.concat(inactiveCfg, orphanBel, other);
    const suiteByFile = {};
    const activeSuiteCount = suiteEntries.length;
    for (const block of suiteEntries) {
      const hue = activeSuiteCount <= 1 ? SUITE_HUES[0] : SUITE_HUES[block.suiteIndex % SUITE_HUES.length];
      for (let ri2 = 0; ri2 < block.rows.length; ri2 += 1) {
        const row = block.rows[ri2];
        let role;
        if (block.memberCount === 1) role = "solo";
        else if (ri2 === 0) role = "head";
        else if (ri2 === block.memberCount - 1) role = "tail";
        else role = "mid";
        suiteByFile[row.name] = {
          suiteId: block.cfgPath,
          role,
          suiteIndex: block.suiteIndex,
          memberIndex: ri2,
          memberCount: block.memberCount,
          hue
        };
      }
    }
    return { orderedFiles, suiteByFile };
  }
  var ExplorerSuiteLayout = {
    SUITE_HUES,
    computeDirLayout,
    memberSet,
    canActivateCfg,
    findCfgIntersection,
    cfgHasDanglingEntry
  };
  var g5 = typeof window !== "undefined" ? window : globalThis;
  g5.ExplorerSuiteLayout = ExplorerSuiteLayout;
  g5.BelJarExplorerSuiteLayout = g5.ExplorerSuiteLayout;
})();
