// Semantic Engine V2 — cross-session type persistence lock-down.
// Types are keyed by the STABLE structural key, so they survive a refresh:
// exported to storage and re-imported into a fresh session, hovers show
// last-known types INSTANTLY (stale-known) with no Beluga round-trip. The
// production producers are observeType (decl types forwarded from a check)
// and observeMetavarAt / the warm session query (implicit metavar types).
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
const ndPos = at(SAMPLE, 'LF nd') + 3;

// --- Decl type: observeType populates the durable cache; export/import round-trip.
const s1 = createSemanticEngine();
upd(s1, SAMPLE);
s1.observeType(ndPos, 'D(nd)');
const c1 = s1.cachedTypeAt(ndPos);
expect(c1 && c1.type === 'D(nd)' && c1.source === 'hydrated' && c1.status === 'stale-known',
  `observed decl type should be served hydrated/stale-known, got ${c1 && c1.source}/${c1 && c1.status}`);
const blob = s1.exportTypes();
expect(blob.decls.some(([, t]) => t === 'D(nd)'), 'export should contain the observed type for nd');

// Fresh session, hydrated from the blob — instant, no Beluga.
const s2 = createSemanticEngine();
upd(s2, SAMPLE);
s2.importTypes(blob);
const c2 = s2.cachedTypeAt(ndPos);
expect(c2 && c2.type === 'D(nd)' && c2.source === 'hydrated',
  `persisted decl type should round-trip via export/import, got ${c2 && c2.type}`);

// The inspector's sync query serves the persisted type without a session.
const intel = s2.intelSyncAt(ndPos);
expect(intel.type === 'D(nd)', `intelSyncAt should serve the persisted type, got ${intel.type}`);

// Source-annotation fallback when nothing is cached (never a blank).
const s3 = createSemanticEngine();
upd(s3, SAMPLE);
expect(s3.cachedTypeAt(ndPos).source === 'annotation',
  'falls back to source annotation when nothing cached');

// Fingerprint gate: a persisted type is NOT shown for a decl whose content
// changed since it was saved.
const s4 = createSemanticEngine();
upd(s4, SAMPLE.replace('| impI : nd → nd', '| impI : nd → nd → nd'));
s4.importTypes(blob);
expect(s4.cachedTypeAt(ndPos).source === 'annotation',
  'a changed declaration must NOT show a persisted stale type (fp gate)');

// --- Metavar type: a first session query learns it; it then persists.
// `A` in `pf A` is a free metavar with enclosing decl `c`. elaborateAt checks
// the cache, then queries the single warm session (structural inference is
// hoverAt's concern), so a mock session drives the learn path deterministically.
const META = `o : type.\npf : o -> type.\nc : pf A -> pf A.\n`;
const aPos = META.indexOf('pf A') + 3;
let calls = 0;
const mockSession = { typeAt: async () => { calls++; return { ok: true, type: 'META-A' }; } };
const m1 = createSemanticEngine({ session: mockSession });
upd(m1, META);
const first = await m1.elaborateAt(aPos);
expect(first.type === 'META-A', `first metavar query should learn META-A, got ${first.type}`);
expect(calls === 1, `session.typeAt should be called exactly once, got ${calls}`);
const metaBlob = m1.exportTypes();
expect(metaBlob.metavars.length >= 1, 'metavar type should be exported');

// Fresh session, hydrated — returns the persisted metavar without any session.
const throwSession = { typeAt: async () => { throw new Error('persisted metavar must not hit the session'); } };
const m2 = createSemanticEngine({ session: throwSession });
upd(m2, META);
m2.importTypes(metaBlob);
const hyd = await m2.elaborateAt(aPos);
expect(hyd.type === 'META-A' && hyd.source === 'hydrated',
  `hydrated metavar should return META-A/hydrated, got ${hyd.type}/${hyd.source}`);

// observeMetavarAt is the zero-Beluga producer (production forwards a learned
// type straight into the durable cache); it must also persist across refresh.
const m3 = createSemanticEngine();
upd(m3, META);
m3.observeMetavarAt(aPos, 'OBS-A');
const m3blob = m3.exportTypes();
expect(m3blob.metavars.some(([, t]) => t === 'OBS-A'), 'observeMetavarAt type should export');
const m4 = createSemanticEngine();
upd(m4, META);
m4.importTypes(m3blob);
const obs = await m4.elaborateAt(aPos);
expect(obs.type === 'OBS-A', `observed metavar should persist across export/import, got ${obs.type}`);

console.log('OK semantic persist-types v2 (observeType, fp-gate, source fallback, session-learn, metavar persist)');
