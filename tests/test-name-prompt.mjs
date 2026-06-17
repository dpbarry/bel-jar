import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));

function loadModule(path) {
  const src = readFileSync(join(here, '..', path), 'utf8');
  const fakeWindow = {};
  // eslint-disable-next-line no-new-func
  new Function('window', src)(fakeWindow);
  return fakeWindow;
}

const NP = loadModule('js/name-prompt.js').BelJarNamePrompt;

expect(NP.normalizeBelFileName('foo') === 'foo.bel', 'append .bel when no extension');
expect(NP.normalizeBelFileName('foo.cfg') === 'foo.cfg', 'keep explicit extension');
expect(NP.normalizeBelFileName('  bar.elf  ') === 'bar.elf', 'trim whitespace');

expect(NP.defaultValidate('x') === null, 'non-empty passes default validate');
expect(NP.defaultValidate('') === 'Name is required.', 'empty fails default validate');

const sel = NP.selectionForValue('untitled.bel', { start: 0, end: 8 });
expect(sel.start === 0 && sel.end === 8, 'selection clamps to value length');

console.log('OK name-prompt');
