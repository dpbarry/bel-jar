// Library preview stacks files the way the explorer does on a fresh project:
// one inferred suite, then the rest. Activating every .cfg paints a separator
// on each of them (church-rosser).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function loadScript(path) {
  const src = readFileSync(join(root, path), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', src)(globalThis);
}

loadScript('js/workspace/workspace.js');

const { layoutPreviewFolder } = await import('../js/library/library-preview.mjs');

function file(name) {
  return { type: 'file', id: name, label: name, ext: name.slice(name.lastIndexOf('.') + 1) };
}

const dir = join(root, 'library/data/examples/church-rosser');
const names = readdirSync(dir).filter((n) => /\.(cfg|bel|elf)$/i.test(n)).sort();
const children = names.map(file);
const texts = {};
for (const name of names) {
  if (name.endsWith('.cfg')) texts[name] = readFileSync(join(dir, name), 'utf8');
}

const laid = layoutPreviewFolder(children, texts);
const order = laid.files.map((f) => f.label);
const cover = [
  'test-crec-cover.cfg',
  'lam.elf',
  'ord-red.elf',
  'par-red.elf',
  'par-lemmas-crec.bel',
  'par-cr-crec-cover.bel',
  'ord-lemmas-crec.bel',
  'equiv-crec.bel',
  'ord-cr-crec.bel',
];

expect(order.slice(0, cover.length).join('|') === cover.join('|'),
  `suite block follows the longest cfg, got ${order.slice(0, cover.length).join('|')}`);
expect(laid.suiteByFile['test-crec-cover.cfg'].role === 'head'
  && laid.suiteByFile['test-crec-cover.cfg'].suiteIndex === 0,
  'the inferred cfg is the only suite head');
expect(laid.suiteByFile['ord-cr-crec.bel'].role === 'tail', 'last member is the tail');
for (const cfg of ['ord.cfg', 'test.cfg', 'test-crec.cfg']) {
  expect(!laid.suiteByFile[cfg], `${cfg} is not a second active suite`);
}
const extraHeads = Object.keys(laid.suiteByFile).filter((name) => {
  const meta = laid.suiteByFile[name];
  return meta.role === 'head' && meta.suiteIndex > 0;
});
expect(extraHeads.length === 0, `no stacked suite separators, got ${extraHeads.join(',')}`);

{
  const nested = layoutPreviewFolder([
    file('b.bel'),
    { type: 'folder', id: 'sub', name: 'sub', children: [] },
    file('a.cfg'),
  ], { 'a.cfg': '' });
  expect(nested.folders.length === 1 && nested.folders[0].name === 'sub', 'folders stay in front of files');
  expect(nested.files.map((f) => f.label).join('|') === 'a.cfg|b.bel',
    `cfg bucket then signature, got ${nested.files.map((f) => f.label).join('|')}`);
}

console.log('OK library preview tree (one suite, explorer order)');
