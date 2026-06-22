import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pickPrimaryCfgName } from '../library/cfg-primary.mjs';

export function suiteCfgNames(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith('.cfg')).sort();
}

export function primarySuiteCfgName(dir) {
  const cfgs = suiteCfgNames(dir);
  if (!cfgs.length) return null;
  if (cfgs.length === 1) return cfgs[0];
  const members = readdirSync(dir).filter((n) => /\.(bel|elf)$/i.test(n));
  const texts = Object.fromEntries(cfgs.map((n) => [n, readFileSync(join(dir, n), 'utf8')]));
  return pickPrimaryCfgName(members, texts);
}

/** @deprecated use primarySuiteCfgName */
export function sourcesCfgName(dir) {
  return primarySuiteCfgName(dir);
}

export function pathsFromSuiteCfg(dataRoot, relDir, cfgName) {
  const name = cfgName || primarySuiteCfgName(join(dataRoot, relDir));
  if (!name) return null;
  const lines = readFileSync(join(dataRoot, relDir, name), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%'));
  return lines.map((entry) => `${relDir}/${entry}`);
}

/** @deprecated use pathsFromSuiteCfg */
export function pathsFromSourcesCfg(dataRoot, relDir) {
  return pathsFromSuiteCfg(dataRoot, relDir);
}
