// Reconstructed decl types merge with source: explicit binders preserved, inferred added.
import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSemanticEngine } from '../js/editor-src/semantic/semantic-engine.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const upd = (e, src) => e.update(parser.parse(src), Text.of(src.split('\n')));
const at = (src, needle, off = 0) => src.indexOf(needle) + off;

const EXPLICIT = `o : type.\nschema ctx = o;\nmstep : (g:ctx) (P:[g |- o]) (Q:[g |- o]) [g |- mstep P Q] -> type.\n`;
const stripped = '[g |- mstep P Q] -> type';

{
  const e = createSemanticEngine({
    session: { ideDeclType: async () => ({ ok: true, type: stripped }) },
  });
  upd(e, EXPLICIT);
  await e.deriveFrontier();
  const h = e.hoverAt(at(EXPLICIT, 'mstep', 1));
  expect(h.status === 'ready' && h.source === 'reconstructed',
    `merged hover stays reconstructed, got ${h.status}/${h.source}`);
  expect(h.type.includes('(g:ctx)'), `keeps explicit binders, got ${h.type}`);
  expect(h.type.includes('(Q:[g |- o])'), `keeps Q binder, got ${h.type}`);
}

const MINIMAL = `nat : type.\nz : nat.\nvec : nat -> type.\nvnil : vec z.\nvcons : vec N -> vec (s N).\n`;
const expanded = '(N : nat) vec N -> vec (s N)';

{
  const e = createSemanticEngine({
    session: { ideDeclType: async () => ({ ok: true, type: expanded }) },
  });
  upd(e, MINIMAL);
  await e.deriveFrontier();
  const h = e.hoverAt(at(MINIMAL, 'vcons', 1));
  expect(h.status === 'ready' && h.source === 'reconstructed',
    `inferred implicit still wins, got ${h.status}/${h.source}`);
  expect(h.type.startsWith('(N : nat)'), `expanded implicit shown, got ${h.type}`);
}

console.log('OK reconstructed display (merge source + reconstruction)');
