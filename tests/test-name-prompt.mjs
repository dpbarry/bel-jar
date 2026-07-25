import {
  normalizeBelFileName,
  defaultValidate,
  selectionForValue,
} from '../js/ui/name-prompt.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

expect(normalizeBelFileName('foo') === 'foo.bel', 'append .bel when no extension');
expect(normalizeBelFileName('foo.cfg') === 'foo.cfg', 'keep explicit extension');
expect(normalizeBelFileName('  bar.elf  ') === 'bar.elf', 'trim whitespace');

expect(defaultValidate('x') === null, 'non-empty passes default validate');
expect(defaultValidate('') === 'Name is required.', 'empty fails default validate');

const sel = selectionForValue('untitled.bel', { start: 0, end: 8 });
expect(sel.start === 0 && sel.end === 8, 'selection clamps to value length');

console.log('OK name-prompt');
