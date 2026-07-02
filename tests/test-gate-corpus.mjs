// Cosmetic gate parity: library files must stay cosmetic under whitespace/comment
// tweaks and semantic under real token edits.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import {
  belugaCheckFingerprint,
  settlementTrigger,
} from '../editor-src/semantic/check-gate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dataRoot = join(here, '..', 'library', 'data');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function walkBel(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walkBel(p, acc);
    else if (ent.name.endsWith('.bel')) acc.push(p);
  }
  return acc;
}

function syntaxOf(text, version) {
  const tree = parser.parse(text);
  return { tree, doc: Text.of(text.split('\n')), version };
}

function parseClean(path) {
  const text = readFileSync(path, 'utf8');
  const tree = parser.parse(text);
  let bad = 0;
  tree.iterate({ enter(n) { if (n.type.isError && n.to > n.from) bad += 1; } });
  if (bad) return null;
  return text;
}

function firstIdentMutation(text) {
  const tree = parser.parse(text);
  let hit = null;
  tree.iterate({
    enter(n) {
      if (hit) return;
      if (n.name === 'LowerIdentifier' && n.to > n.from) {
        hit = { from: n.from, to: n.to, name: text.slice(n.from, n.to) };
      }
    },
  });
  if (!hit) return null;
  const repl = hit.name.length > 1 ? hit.name.slice(0, -1) + 'X' : hit.name + 'X';
  return text.slice(0, hit.from) + repl + text.slice(hit.to);
}

const files = walkBel(dataRoot);
let checked = 0;
let cosmeticOk = 0;
let semanticOk = 0;

for (const path of files) {
  const text = parseClean(path);
  if (!text) continue;
  checked += 1;
  const rel = path.slice(dataRoot.length + 1);
  const s0 = syntaxOf(text, 1);

  const trailing = text.replace(/(\S)$/gm, '$1 ');
  if (settlementTrigger(s0, syntaxOf(trailing, 2)) !== 'cosmetic') {
    fail(`${rel}: trailing-space edit must be cosmetic`);
  }
  cosmeticOk += 1;

  const inlineComment = text.includes('\n')
    ? text.replace('\n', ' % gate\n', 1)
    : `${text} % gate`;
  if (settlementTrigger(s0, syntaxOf(inlineComment, 3)) !== 'cosmetic') {
    fail(`${rel}: inline comment on first line must be cosmetic`);
  }
  cosmeticOk += 1;

  if (belugaCheckFingerprint(s0) !== belugaCheckFingerprint(syntaxOf(trailing, 4))) {
    fail(`${rel}: fingerprint must ignore trailing space`);
  }

  const mutated = firstIdentMutation(text);
  if (mutated && settlementTrigger(s0, syntaxOf(mutated, 5)) === 'cosmetic') {
    fail(`${rel}: identifier mutation must not be cosmetic`);
  }
  if (mutated) semanticOk += 1;
}

if (checked < 50) fail(`too few clean files (${checked})`);
console.log(`OK gate-corpus (${checked} files, ${cosmeticOk} cosmetic checks, ${semanticOk} semantic checks)`);
