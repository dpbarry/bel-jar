// Pure explorer layout: stack active suites (cfg → members), spine metadata, disjoint checks.
import { isCfgPath, isSignaturePath, isCfgEntryToken } from '../editor-src/project-paths.mjs';
import { dirOf, parseCfg } from '../editor-src/semantic/development.mjs';
import { orderedPathsForCfg } from '../workspace/project-source.mjs';

export const SUITE_HUES = [156, 217, 280, 32];

export function explorerFileBucket(name) {
  if (isCfgPath(name)) return 0;
  if (isSignaturePath(name)) return 1;
  return 2;
}

function byBaseName(a, b) {
  return a.baseName.localeCompare(b.baseName);
}

export function resolveMembersDefault(allFiles, cfgPath, getText) {
  return orderedPathsForCfg(allFiles, cfgPath, getText);
}

export function memberSet(allFiles, cfgPath, getText, resolveMembers) {
  const paths = typeof resolveMembers === 'function'
    ? resolveMembers(allFiles, cfgPath, getText)
    : resolveMembersDefault(allFiles, cfgPath, getText);
  const out = {};
  for (const p of paths) out[p] = true;
  return out;
}

export function cfgHasDanglingEntry(allFiles, cfgPath, getText) {
  const names = {};
  for (const f of allFiles) names[f.name] = true;
  let cfgFile = null;
  for (const f of allFiles) {
    if (f.name === cfgPath) { cfgFile = f; break; }
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

export function canActivateCfg(cfgPath, activeCfgs, allFiles, getText, resolveMembers) {
  const nextSet = memberSet(allFiles, cfgPath, getText, resolveMembers);
  const active = activeCfgs || [];
  for (const other of active) {
    if (other === cfgPath) return { ok: true };
    const existing = memberSet(allFiles, other, getText, resolveMembers);
    for (const p of Object.keys(nextSet)) {
      if (existing[p]) {
        const shareBase = p.slice(p.lastIndexOf('/') + 1);
        const otherBase = other.slice(other.lastIndexOf('/') + 1);
        return {
          ok: false,
          reason: `Shares ${shareBase} with active suite ${otherBase}`,
        };
      }
    }
  }
  return { ok: true };
}

export function findCfgIntersection(cfgPath, otherCfgs, allFiles, getText, resolveMembers) {
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

export function computeDirLayout(filesInDir, activeCfgPaths, resolveMembers, allFiles, getText) {
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

    const memberPaths = resolver(allFiles || filesInDir, cfgPath, getText || (() => ''));
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
      memberCount: blockRows.length,
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
      if (block.memberCount === 1) role = 'solo';
      else if (ri2 === 0) role = 'head';
      else if (ri2 === block.memberCount - 1) role = 'tail';
      else role = 'mid';
      suiteByFile[row.name] = {
        suiteId: block.cfgPath,
        role,
        suiteIndex: block.suiteIndex,
        memberIndex: ri2,
        memberCount: block.memberCount,
        hue,
      };
    }
  }

  return { orderedFiles, suiteByFile };
}

export const ExplorerSuiteLayout = {
  SUITE_HUES,
  computeDirLayout,
  memberSet,
  canActivateCfg,
  findCfgIntersection,
  cfgHasDanglingEntry,
};

const g = typeof window !== 'undefined' ? window : globalThis;
g.ExplorerSuiteLayout = ExplorerSuiteLayout;
g.BelJarExplorerSuiteLayout = g.ExplorerSuiteLayout
