// Stale implicit types after signature edit (⊃E repro) and scope-gated checkpoints.
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';
import { STATUS } from '../editor-src/semantic/ids.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const upd = (e, src) => e.update(parser.parse(src), Text.of(src.split('\n')));
const at = (src, needle, off = 0) => src.indexOf(needle) + off;

const SRC = `LF o : type =
  | ⊃ : o → o → o
;

LF nd : o → type =
  | ⊃E : nd (A ⊃ B) → nd A → nd B
;
`;

const SRC_TRIM = `LF o : type =
  | ⊃ : o → o → o
;

LF nd : o → type =
  | ⊃E : nd (A ⊃ B) → nd A ;
;
`;

function mockSession(typeOf = () => 'tp') {
  return {
    async typeAt() { return { ok: true, type: typeOf() }; },
    async elaborateDecl(code, a, b, positions) {
      return {
        ok: true,
        implicits: positions.map((p) => ({ name: p.name, type: typeOf(p.name) })),
      };
    },
    async elaboratePositions() { return { ok: false, implicits: [] }; },
  };
}

{
  const session = mockSession(() => 'tp');
  const e = createSemanticEngine({ session, getScopeKey: () => 'standalone:test.bel' });
  upd(e, SRC);
  const bPos = at(SRC, '(A ⊃ B)') + 6;
  await e.elaborateAt(bPos);
  expect(e.stores.metavar.get(
    [...e.getSnapshot().symbols.globalSymbols].find((s) => s.name === '⊃E')?.id,
    'B',
  )?.type === 'tp', 'precondition: B learned as tp');

  upd(e, SRC_TRIM);
  const h = e.hoverAt(bPos);
  const sync = e.intelSyncAt(bPos);
  expect(h.status !== 'ready' || h.type !== 'tp',
    `after signature trim B must not show stale tp (status=${h.status} type=${h.type})`);
  expect(sync.typePending || sync.type !== 'tp',
    `inspector must not settle on stale tp (type=${sync.type} pending=${sync.typePending})`);
}

{
  const session = mockSession(() => 'tp');
  const e1 = createSemanticEngine({ session, getScopeKey: () => 'standalone:untitled.bel' });
  upd(e1, SRC);
  await e1.elaborateAt(at(SRC, '(A ⊃ B)') + 6);
  const blob = { ...e1.exportCheckpoint(), docFp: '', scopeKey: 'standalone:untitled.bel' };

  const e2 = createSemanticEngine({ getScopeKey: () => 'standalone:untitled.bel' });
  upd(e2, SRC_TRIM);
  e2.importCheckpoint(blob, { scopeKey: 'standalone:untitled.bel' });
  const bPos = at(SRC_TRIM, '(A ⊃ B)') + 6;
  const h = e2.hoverAt(bPos);
  expect(h.status !== 'ready' || h.type !== 'tp', 'same scope still drops stale tp after edit');

  const e3 = createSemanticEngine({ getScopeKey: () => 'standalone:other.bel' });
  upd(e3, SRC_TRIM);
  e3.importCheckpoint(blob, { scopeKey: 'standalone:other.bel' });
  const h3 = e3.hoverAt(bPos);
  expect(h3.status !== 'ready' || h3.type == null,
    'scope mismatch must not hydrate foreign tp');
}

{
  const e = createSemanticEngine({ getScopeKey: () => 'legacy' });
  upd(e, SRC_TRIM);
  e.importCheckpoint({
    types: {
      v: 1,
      decls: [],
      metavars: [['⊃E::B', 'tp', 'fp1']],
      reconstructed: [],
    },
    scopeKey: 'legacy',
  }, { scopeKey: 'standalone:untitled.bel' });
  const bPos = at(SRC_TRIM, '(A ⊃ B)') + 6;
  const h = e.hoverAt(bPos);
  expect(h.status !== 'ready' || h.type !== 'tp', 'legacy scope must not import oracle metavars');
}

console.log('OK semantic isolation regressions (stale signature, scope checkpoint)');
