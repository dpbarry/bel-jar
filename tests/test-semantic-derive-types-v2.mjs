// Semantic Engine V2 — reconstructed-type data layer (derivationStore).
// deriveFrontier populates an elaborated-type store (implicits expanded) keyed by
// the STABLE structural key; it is the engine data layer that future features
// (expected-type-while-typing, holes) consume via reconstructedTypeOf/At. It
// outranks hydrated + source-annotation types, survives export/import, and is
// fp-gated so a changed declaration never shows a stale reconstruction.
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const upd = (e, src) => e.update(parser.parse(src), Text.of(src.split('\n')));
const at = (src, needle, off = 0) => src.indexOf(needle) + off;
const SAMPLE = `LF o : type =\n  | imp : o → o → o\n;\nLF nd : o → type =\n  | impI : nd → nd\n;\n`;
const ndPos = at(SAMPLE, 'LF nd') + 3; // inside the `nd` declaration name

// A mock session that returns a reconstructed type with implicits expanded.
function mockSession(type) {
  return { ideDeclType: async () => ({ ok: true, type }) };
}

// --- deriveFrontier populates the store; accessors expose it. ----------------
const s1 = createSemanticEngine({ session: mockSession('{g:ctx} nd → type') });
upd(s1, SAMPLE);
const more = await s1.deriveFrontier();

// Resolve the symbol id for `nd` to test the symbolId-keyed accessor.
const q = s1.queryAt(ndPos);
expect(q && q.symbol, 'queryAt should resolve a symbol at the nd decl name');
const ndId = q.symbol.id;

const byId = s1.reconstructedTypeOf(ndId);
expect(byId && byId.type === '{g:ctx} nd → type' && byId.status === 'fresh',
  `reconstructedTypeOf should return the derived type/fresh, got ${byId && byId.type}/${byId && byId.status}`);

const byPos = s1.reconstructedTypeAt(ndPos);
expect(byPos && byPos.type === '{g:ctx} nd → type',
  `reconstructedTypeAt should return the derived type, got ${byPos && byPos.type}`);

// All decls derived in this batch (only 2 globals) → no remaining work.
expect(more === false, 'deriveFrontier should report no remaining work when all decls fit one batch');

// --- First consumer: reconstructed OUTRANKS hydrated and source annotation. --
s1.observeType(ndPos, 'HYDRATED-T'); // would normally show hydrated/stale-known
const cached = s1.cachedTypeAt(ndPos);
expect(cached && cached.type === '{g:ctx} nd → type'
  && cached.source === 'reconstructed' && cached.status === 'fresh',
  `cachedTypeAt should prefer reconstructed over hydrated, got ${cached && cached.source}/${cached && cached.type}`);

// --- Export/import round-trip of the reconstructed store. ---------------------
const blob = s1.exportTypes();
expect(Array.isArray(blob.reconstructed) && blob.reconstructed.some(([, t]) => t === '{g:ctx} nd → type'),
  'export should contain the reconstructed type for nd');

const s2 = createSemanticEngine(); // no session — pure persistence
upd(s2, SAMPLE);
s2.importTypes(blob);
const r2 = s2.reconstructedTypeOf(s2.queryAt(ndPos).symbol.id);
expect(r2 && r2.type === '{g:ctx} nd → type',
  `reconstructed type should round-trip via export/import, got ${r2 && r2.type}`);
const c2 = s2.cachedTypeAt(ndPos);
expect(c2 && c2.source === 'reconstructed',
  `imported reconstructed type should win in cachedTypeAt, got ${c2 && c2.source}`);

// --- Fingerprint gate: a changed decl must NOT show a stale reconstruction. ---
const s3 = createSemanticEngine();
upd(s3, SAMPLE.replace('| impI : nd → nd', '| impI : nd → nd → nd'));
s3.importTypes(blob);
expect(s3.reconstructedTypeOf(s3.queryAt(ndPos).symbol.id) === null,
  'a changed declaration must NOT report a stale reconstructed type (fp gate)');
expect(s3.cachedTypeAt(ndPos).source === 'annotation',
  'a changed declaration falls back to source annotation, not a stale reconstruction');

// --- Termination: a permanently-failing session is attempted once, then idle. -
let calls = 0;
const failSession = { ideDeclType: async () => { calls++; return { ok: false }; } };
const s4 = createSemanticEngine({ session: failSession });
upd(s4, SAMPLE);
const more4a = await s4.deriveFrontier();
const callsAfterFirst = calls;
const more4b = await s4.deriveFrontier(); // second pass must not re-attempt same fp
expect(calls === callsAfterFirst,
  `deriveFrontier must not re-attempt decls already tried at the same fingerprint, got ${calls} vs ${callsAfterFirst}`);
expect(more4b === false,
  'deriveFrontier should report no remaining work once every decl has been attempted');

console.log('OK semantic derive-types v2 (deriveFrontier, accessors, priority, persist, fp-gate, termination)');
