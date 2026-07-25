// Pick the primary .cfg for a folder — same rule as development.mjs bestCfgInDir.

import {
  parseCfg,
  joinPath,
  resolveCfgOrder,
} from '../js/editor-src/semantic/development.mjs';

export { parseCfg, resolveCfgOrder };

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
