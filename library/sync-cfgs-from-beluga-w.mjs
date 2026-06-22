#!/usr/bin/env node
// Copy all resolvable .cfg files from Beluga-W into library/data (original names + content).
import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const BW = join(root, 'Beluga-W');
const DATA = join(here, 'data');

function rel(rootDir, abs) {
  return abs.slice(rootDir.length + 1).split(/[/\\]/).join('/');
}

function walkDirs(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const p = join(dir, ent.name);
    acc.push(p);
    walkDirs(p, acc);
  }
  return acc;
}

function memberNames(dir) {
  return readdirSync(dir).filter((n) => /\.(bel|elf)$/i.test(n));
}

function cfgNames(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith('.cfg')).sort();
}

function parseCfgEntries(text) {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('%'));
}

function cfgEntriesResolve(text, members, allCfgs) {
  for (const entry of parseCfgEntries(text)) {
    if (entry.toLowerCase().endsWith('.cfg')) {
      if (!allCfgs.includes(entry)) return false;
      continue;
    }
    if (!members.includes(entry)) return false;
  }
  return true;
}

let copied = 0;
let removed = 0;
let skipped = 0;

for (const libDir of [DATA, ...walkDirs(DATA)]) {
  const relDir = rel(DATA, libDir);
  const bwDir = join(BW, relDir);
  const libCfgs = cfgNames(libDir);
  const members = memberNames(libDir);
  const bwCfgs = cfgNames(bwDir);

  if (!libCfgs.length && !bwCfgs.length) continue;

  if (!bwCfgs.length) {
    for (const name of libCfgs) {
      unlinkSync(join(libDir, name));
      removed += 1;
      console.log(`removed ${relDir}/${name} (no Beluga-W cfg)`);
    }
    continue;
  }

  const keep = new Set();
  for (const name of bwCfgs) {
    const src = join(bwDir, name);
    const text = readFileSync(src, 'utf8');
    if (!cfgEntriesResolve(text, members, bwCfgs)) {
      console.warn(`skip ${relDir}/${name}: unresolved entries for library members`);
      skipped += 1;
      continue;
    }
    keep.add(name);
    writeFileSync(join(libDir, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
    copied += 1;
    console.log(`synced ${relDir}/${name}`);
  }

  for (const name of libCfgs) {
    if (!keep.has(name)) {
      unlinkSync(join(libDir, name));
      removed += 1;
      console.log(`removed ${relDir}/${name} (not in Beluga-W)`);
    }
  }
}

console.log(`\nDone: ${copied} synced, ${removed} removed, ${skipped} skipped`);
