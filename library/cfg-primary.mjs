// Pick the primary .cfg for a folder — same rule as BelJarProjectSource.bestCfgInDir.

import { isCfgSourceEntry } from '../editor-src/bel-paths.mjs';

export function parseCfg(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('%')) continue;
    out.push(t);
  }
  return out;
}

function joinPath(dir, entry) {
  if (!dir) return entry;
  if (!entry) return dir;
  return `${dir}/${entry}`;
}

export function resolveCfgOrder(cfgDir, cfgText, cfgByDir, sigSet, seenCfg = new Set()) {
  const key = `${cfgDir}\0${cfgText?.length ?? 0}`;
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
        for (const p of resolveCfgOrder(subDir, subMap[subName], cfgByDir, sigSet, seenCfg)) {
          if (!seen.has(p)) { seen.add(p); ordered.push(p); }
        }
      }
    } else if (isCfgSourceEntry(entry)) {
      const full = joinPath(cfgDir, entry);
      if (sigSet[full] && !seen.has(full)) { seen.add(full); ordered.push(full); }
    }
  }
  return ordered;
}

export function pickPrimaryCfgName(members, cfgTextsByName, cfgDir = '') {
  const names = Object.keys(cfgTextsByName).sort();
  if (!names.length) return null;
  if (names.length === 1) return names[0];

  const cfgByDir = { [cfgDir]: cfgTextsByName };
  const sigSet = Object.fromEntries(members.map((m) => [joinPath(cfgDir, m), true]));

  let bestName = null;
  let bestCount = -1;
  const tieRank = (name) => {
    if (name === 'sources.cfg') return 0;
    if (name === 'test.cfg') return 1;
    if (/^test[-.]/.test(name)) return 3;
    return 2;
  };
  for (const name of names) {
    const cfgPath = joinPath(cfgDir, name);
    const ord = resolveCfgOrder(cfgDir, cfgTextsByName[name], cfgByDir, sigSet, new Set());
    const better = ord.length > bestCount
      || (ord.length === bestCount && bestName && (
        tieRank(name) < tieRank(bestName)
        || (tieRank(name) === tieRank(bestName) && cfgPath < joinPath(cfgDir, bestName))
      ));
    if (better) {
      bestCount = ord.length;
      bestName = name;
    }
  }
  return bestName;
}
