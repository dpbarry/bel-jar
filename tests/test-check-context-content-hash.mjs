// Content-hash check context: same text with different Text objects must hit.
import { Text } from '@codemirror/state';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function fnv1a(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${s.length.toString(16)}:${h.toString(16).padStart(8, '0')}`;
}

const a = Text.of('LF a : type.');
const b = Text.of('LF a : type.');
expect(a !== b, 'distinct Text objects');
expect(fnv1a(a.toString()) === fnv1a(b.toString()), 'content hash equal for same text');
expect(fnv1a('LF a : type.') !== fnv1a('LF b : type.'), 'different text different hash');

console.log('OK check-context-content-hash');
