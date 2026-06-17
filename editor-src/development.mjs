// Canonical module scope — cross-file state only through the active .cfg in a folder.

export function dirOf(name) {
  const i = String(name || '').lastIndexOf('/');
  return i === -1 ? '' : name.slice(0, i);
}

export function baseNoExt(name) {
  const s = String(name || '');
  const base = s.slice(s.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot === -1 ? base : base.slice(0, dot);
}

export function joinPath(dir, entry) {
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

export function allSignaturePaths(files) {
  const out = [];
  for (const f of files) {
    const fn = String(f.name || '');
    const low = fn.toLowerCase();
    if (low.endsWith('.bel') || low.endsWith('.elf')) out.push(fn);
  }
  return out;
}

function pathSetFrom(paths) {
  return Object.fromEntries(paths.map((p) => [p, true]));
}

// FNV-1a over the cfg text — distinguishes two same-length sibling cfgs that a
// length-only key would false-collide and silently drop during nested includes.
function cfgHash(text) {
  let hash = 0x811c9dc5;
  const s = String(text || '');
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

export function resolveCfgOrder(cfgDir, cfgText, cfgByDir, pathSet, seenCfg) {
  seenCfg = seenCfg || new Set();
  const key = `${cfgDir}\0${cfgHash(cfgText)}`;
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

function topLevelCfgPaths(files, getText) {
  const cfgByDir = cfgByDirFromFiles(files, getText);
  const referenced = {};
  const cfgPaths = [];
  for (const f of files) {
    const n = String(f.name || '');
    if (!n.toLowerCase().endsWith('.cfg')) continue;
    cfgPaths.push(n);
    const cdir = dirOf(n);
    for (const entry of parseCfg(getText(f.id))) {
      if (entry.toLowerCase().endsWith('.cfg')) {
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
  const base = cfgPath.slice(cfgPath.lastIndexOf('/') + 1);
  const map = cfgByDir[dir];
  if (!map?.[base]) return [];
  return resolveCfgOrder(dir, map[base], cfgByDir, allSet, new Set());
}

function bestCfgInDir(files, getText, dir) {
  const cfgByDir = cfgByDirFromFiles(files, getText);
  const map = cfgByDir[dir != null ? String(dir) : ''];
  if (!map) return null;
  const pathSet = pathSetFrom(allSignaturePaths(files).filter((p) => dirOf(p) === dir));
  let best = null;
  let bestCount = -1;
  for (const cfgName of Object.keys(map)) {
    const cfgPath = joinPath(dir, cfgName);
    const ord = resolveCfgOrder(dir, map[cfgName], cfgByDir, pathSet, new Set());
    if (ord.length > bestCount || (ord.length === bestCount && cfgPath < (best || ''))) {
      bestCount = ord.length;
      best = cfgPath;
    }
  }
  return best;
}

/** Longest resolved chain in one folder; null when the folder has no .cfg. */
export function inferActiveCfgForDir(files, getText, dir) {
  return bestCfgInDir(files, getText, dir);
}

/** Best active .cfg per folder that has at least one cfg file. */
export function inferActiveCfgByDir(files, getText) {
  const cfgByDir = cfgByDirFromFiles(files, getText);
  const out = {};
  for (const dir of Object.keys(cfgByDir)) {
    const best = bestCfgInDir(files, getText, dir);
    if (best) out[dir] = best;
  }
  return out;
}

export function defaultActiveCfgForDir(dir) {
  const d = dir != null ? String(dir) : '';
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  const P = g.BelJarPersist;
  if (P && typeof P.getActiveCfgForDir === 'function') {
    const path = P.getActiveCfgForDir(d);
    if (path) {
      if (typeof P.listFiles === 'function') {
        const files = P.listFiles();
        if (files.some((f) => f.name === path)) return path;
      } else return path;
    }
  }
  if (P && typeof P.listFiles === 'function' && typeof P.getFileText === 'function') {
    return inferActiveCfgForDir(P.listFiles(), (id) => P.getFileText(id), d);
  }
  return null;
}

export function activeCfgResolver(map) {
  const byDir = map || {};
  return (dir) => byDir[dir != null ? String(dir) : ''] || null;
}

function resolveActiveCfgForDir(options) {
  if (typeof options?.activeCfgForDir === 'function') return options.activeCfgForDir;
  return defaultActiveCfgForDir;
}

function standaloneResult(active) {
  return {
    kind: 'standalone',
    cfg: null,
    paths: active ? [active.name] : [],
    activeIndex: active ? 0 : -1,
    preludePaths: [],
    scopeKey: active ? `standalone:${active.name}` : 'standalone:',
  };
}

/**
 * @returns {{
 *   kind: 'module' | 'standalone',
 *   cfg: string | null,
 *   paths: string[],
 *   activeIndex: number,
 *   preludePaths: string[],
 *   scopeKey: string,
 * }}
 */
export function developmentForFile(files, activeId, getText, options = {}) {
  const activeCfgForDir = resolveActiveCfgForDir(options);
  const active = files.find((f) => f.id === activeId);
  if (!active || !/\.(?:bel|elf)$/i.test(String(active.name))) {
    return {
      kind: 'standalone',
      cfg: null,
      paths: [],
      activeIndex: -1,
      preludePaths: [],
      scopeKey: 'standalone:',
    };
  }

  const cfgPath = activeCfgForDir(dirOf(active.name));
  if (!cfgPath) return standaloneResult(active);

  const paths = resolveActiveChain(files, cfgPath, getText);
  const activeIndex = paths.indexOf(active.name);
  if (activeIndex >= 0) {
    return {
      kind: 'module',
      cfg: cfgPath,
      paths,
      activeIndex,
      preludePaths: activeIndex > 0 ? paths.slice(0, activeIndex) : [],
      scopeKey: `module:${cfgPath}`,
    };
  }

  return standaloneResult(active);
}

/** Module cfg when the file is a listed member of the folder's active cfg. */
export function cfgPathForActive(files, activeId, getText, options = {}) {
  const dev = developmentForFile(files, activeId, getText, options);
  return dev.kind === 'module' && dev.cfg ? dev.cfg : null;
}

/** Files visible for cross-file IDE operations: prelude predecessors + active. */
export function visibilityPaths(dev) {
  if (!dev || !dev.paths.length) return [];
  const active = dev.paths[dev.activeIndex >= 0 ? dev.activeIndex : dev.paths.length - 1];
  const out = [...dev.preludePaths];
  if (active && out.indexOf(active) === -1) out.push(active);
  return out;
}

export function workspaceDevelopments(files, getText) {
  const sigPaths = allSignaturePaths(files);
  const cfgByDir = cfgByDirFromFiles(files, getText);
  const allSet = pathSetFrom(sigPaths);
  const developments = [];
  const covered = {};

  for (const cfgPath of topLevelCfgPaths(files, getText)) {
    const dir = dirOf(cfgPath);
    const base = cfgPath.slice(cfgPath.lastIndexOf('/') + 1);
    const map = cfgByDir[dir];
    if (!map?.[base]) continue;
    const ordered = resolveCfgOrder(dir, map[base], cfgByDir, allSet, new Set());
    if (!ordered.length) continue;
    for (const p of ordered) covered[p] = true;
    developments.push({
      kind: 'config',
      name: baseNoExt(cfgPath),
      cfg: cfgPath,
      paths: ordered,
    });
  }

  // A file in no cfg operates in isolation — the same standalone scope the IDE
  // uses while editing. So the whole-project run checks each orphan ALONE, one
  // development per file (not dir-grouped), keeping run-time and edit-time
  // visibility identical: "not in a cfg ⇒ isolation, period."
  for (const p of sigPaths) {
    if (covered[p]) continue;
    developments.push({ kind: 'orphan', name: p, cfg: null, paths: [p] });
  }

  return developments;
}

export function orderedDevelopmentPaths(files, activeId, getText, options = {}) {
  return developmentForFile(files, activeId, getText, options).paths;
}

export function preludePathsFor(files, activeId, getText, options = {}) {
  return developmentForFile(files, activeId, getText, options).preludePaths;
}
