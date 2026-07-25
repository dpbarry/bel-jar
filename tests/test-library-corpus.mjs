// Batch parse + syntax lint sweep over every library .bel file (and cfg lint for
// any .cfg under library/data). Catches grammar regressions and false-positive
// syntax lint before demo.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { syntaxLintTree } from '../js/editor-src/ide/syntax-lint.mjs';
import { cfgDiagnosticsFor } from '../js/editor-src/ide/cfg-lint.mjs';
import { suiteCfgNames } from './_library-cfg.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dataRoot = join(root, 'library', 'data');
const bwRoot = join(root, 'Beluga-W');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function parseErrorCount(tree) {
  let n = 0;
  tree.iterate({ enter(node) { if (node.type.isError && node.to > node.from) n += 1; } });
  return n;
}

function walkDir(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walkDir(p, acc);
    else if (ent.isFile()) acc.push(p);
  }
  return acc;
}

const allFiles = walkDir(dataRoot);
const belPaths = allFiles.filter((p) => p.endsWith('.bel'));
const cfgPaths = allFiles.filter((p) => p.endsWith('.cfg'));
const nameSet = new Set(allFiles.map((p) => relative(dataRoot, p).replace(/\\/g, '/')));

const parseFails = [];
const lintFails = [];
const cfgFails = [];
const missingSuiteCfg = [];

function memberFilesInDir(dir) {
  return readdirSync(dir)
    .filter((n) => /\.(bel|elf)$/i.test(n))
    .sort();
}

function parseCfgEntries(text) {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('%'));
}

function cfgResolvableInLibrary(text, members, allCfgs) {
  for (const entry of parseCfgEntries(text)) {
    if (entry.toLowerCase().endsWith('.cfg')) {
      if (!allCfgs.includes(entry)) return false;
      continue;
    }
    if (!members.includes(entry)) return false;
  }
  return true;
}

function expectedBwCfgs(rel, members) {
  const bwDir = join(bwRoot, rel);
  if (!existsSync(bwDir)) return [];
  const bwCfgs = suiteCfgNames(bwDir);
  return bwCfgs.filter((name) => {
    const text = readFileSync(join(bwDir, name), 'utf8');
    return cfgResolvableInLibrary(text, members, bwCfgs);
  });
}

function dirsWithMultiFiles(dir, prefix = '', acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
    const abs = join(dir, ent.name);
    const members = memberFilesInDir(abs);
    if (members.length >= 2) acc.push({ rel, members });
    dirsWithMultiFiles(abs, rel, acc);
  }
  return acc;
}

for (const abs of belPaths) {
  const rel = relative(dataRoot, abs).replace(/\\/g, '/');
  const src = readFileSync(abs, 'utf8');
  const tree = parser.parse(src);
  const parseErrs = parseErrorCount(tree);
  if (parseErrs > 0) {
    parseFails.push({ rel, parseErrs });
    continue;
  }
  const doc = Text.of(src.split('\n'));
  const diags = syntaxLintTree(tree, doc);
  const bad = diags.filter((d) =>
    d.severity === 'error' && (
      d.message.includes('Syntax error')
      || d.message.includes('Unknown pragma')
      || d.message.includes('is not defined')
      || d.message.includes('infinitely many solutions')
    ),
  );
  if (bad.length) lintFails.push({ rel, msg: bad[0].message });
}

for (const abs of cfgPaths) {
  const rel = relative(dataRoot, abs).replace(/\\/g, '/');
  const text = readFileSync(abs, 'utf8');
  const diags = cfgDiagnosticsFor(text, rel, nameSet);
  const errs = diags.filter((d) => d.severity === 'error');
  if (errs.length) cfgFails.push({ rel, msg: errs[0].message });
}

for (const { rel, members } of dirsWithMultiFiles(dataRoot)) {
  const dirPath = join(dataRoot, rel);
  const libCfgs = suiteCfgNames(dirPath);
  for (const bwName of expectedBwCfgs(rel, members)) {
    if (!libCfgs.includes(bwName)) missingSuiteCfg.push(`${rel}/${bwName}`);
  }

  for (const cfgName of libCfgs) {
    const cfgRel = `${rel}/${cfgName}`;
    const cfgText = readFileSync(join(dataRoot, cfgRel), 'utf8');
    for (const entry of parseCfgEntries(cfgText)) {
      if (entry.toLowerCase().endsWith('.cfg')) {
        if (!libCfgs.includes(entry)) {
          cfgFails.push({ rel: cfgRel, msg: `nested cfg not in folder: ${entry}` });
        }
        continue;
      }
      if (!members.includes(entry)) {
        cfgFails.push({ rel: cfgRel, msg: `entry not in folder: ${entry}` });
      }
    }
  }
}

if (parseFails.length) {
  console.error(`\n${parseFails.length} library .bel file(s) with parse errors:`);
  for (const f of parseFails.slice(0, 20)) console.error(`  ${f.rel}: ${f.parseErrs} error node(s)`);
  if (parseFails.length > 20) console.error(`  ... and ${parseFails.length - 20} more`);
  process.exit(1);
}

if (lintFails.length) {
  console.error(`\n${lintFails.length} library .bel file(s) with syntax lint errors:`);
  for (const f of lintFails.slice(0, 20)) console.error(`  ${f.rel}: ${f.msg}`);
  if (lintFails.length > 20) console.error(`  ... and ${lintFails.length - 20} more`);
  process.exit(1);
}

if (cfgFails.length) {
  console.error(`\n${cfgFails.length} library .cfg file(s) with unresolved entries:`);
  for (const f of cfgFails) console.error(`  ${f.rel}: ${f.msg}`);
  process.exit(1);
}

if (missingSuiteCfg.length) {
  console.error(`\n${missingSuiteCfg.length} Beluga-W .cfg file(s) missing from library:`);
  for (const rel of missingSuiteCfg) console.error(`  ${rel}`);
  process.exit(1);
}

console.log(`OK library corpus (${belPaths.length} .bel parse+lint clean${cfgPaths.length ? `, ${cfgPaths.length} .cfg` : ''})`);
