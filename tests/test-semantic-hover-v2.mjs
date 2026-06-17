// Milestone 1 — authoritative hoverAt: source instant, cache instant,
// implicits classified, and a query that settles (never a fabricated type,
// never an endless spinner). The Beluga authority is the single warm session.
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

// Mock session: typeAt drives elaborateAt's per-occurrence query; elaborateDecl
// drives the implicit-batch path hoverAt uses for unannotated metavars. `typeOf`
// returning null models "Beluga ran but has no type at this site".
function mockSession(typeOf = (name) => 'MV@' + name) {
  const s = { typeAtCalls: 0, elabCalls: 0 };
  s.typeAt = async (code, line, col) => { s.typeAtCalls++; return { ok: true, type: `MV@${line}:${col}` }; };
  s.elaborateDecl = async (code, a, b, positions) => {
    s.elabCalls++;
    const implicits = positions.map((p) => ({ name: p.name, type: typeOf(p.name) })).filter((x) => x.type != null);
    return { ok: true, implicits };
  };
  s.elaboratePositions = async () => ({ ok: false, implicits: [] });
  return s;
}

// Explicit implicit binder: source tier, no Beluga.
{
  const SRC = `o : type.\nmstep : o -> o -> type.\nschema ctx = o;\nrec t : (g:ctx) (P:[g |- o]) (Q:[g |- o])\n  [g |- mstep P Q] -> [g |- mstep P Q] =\nfn x => x\n;\n`;
  const e = createSemanticEngine();
  upd(e, SRC);
  const h = e.hoverAt(at(SRC, 'mstep P Q') + 6);
  expect(h.status === 'ready' && (h.source === 'source' || h.source === 'local'),
    `annotated implicit: ${h.status}/${h.source}`);
  expect(h.type === '[g |- o]', `type from source, got ${h.type}`);
  expect(h.classification === 'explicit-binder', `classification ${h.classification}`);
}

// Persisted stale-known metavar: instant on a fresh session via the cache.
{
  const META = `o : type.\npf : o -> type.\nc : pf A -> pf A.\n`;
  const session = mockSession();
  const m1 = createSemanticEngine({ session });
  upd(m1, META);
  await m1.elaborateAt(at(META, 'pf A') + 3); // learns A via session.typeAt
  const blob = m1.exportTypes();

  const m2 = createSemanticEngine();
  upd(m2, META);
  m2.importTypes(blob);
  const h = m2.hoverAt(at(META, 'pf A') + 3);
  expect(h.status === 'ready', `hydrated hover ready, got ${h.status}`);
  expect(h.type === 'o', `structural wins over stale cache, got ${h.type}`);
  expect(!h.promise, 'no async path when instant');
}

// Unannotated metavar with no structural rule (bare body term): pending, then
// ready via the session, with the in-flight promise shared across hovers.
{
  const SRC = `o : type.\npf : o → type.\nrec c : o = M;\n`;
  const session = mockSession();
  const e = createSemanticEngine({ session });
  upd(e, SRC);
  const mPos = at(SRC, '= M') + 2;
  const h1 = e.hoverAt(mPos);
  expect(h1.status === 'pending', `first hover pending, got ${h1.status}`);
  expect(h1.classification === 'implicit-metavar', `metavar class ${h1.classification}`);
  const h2 = e.hoverAt(mPos);
  expect(h2.status === 'pending', 'second hover also pending (shared promise)');
  const final = await h1.promise;
  expect(final.status === 'ready' && final.source === 'beluga', `session result ${final.status}/${final.source}`);
  expect(session.elabCalls === 1, `deduped session work (${session.elabCalls} elaborateDecl calls)`);
  const h3 = e.hoverAt(mPos);
  expect(h3.status === 'ready' && h3.source === 'fresh-cache', `cached after derive ${h3.status}/${h3.source}`);
}

// Blocked owner: independent decl must not be reported unavailable.
{
  const BAD = `LF o : type =\n  | ⊤ : o\n;\nrec foo : [ |- o] =\n  bogusref\n;\nLF good : o → type =\n  | gI : good ⊤\n;\n`;
  const e = createSemanticEngine();
  upd(e, BAD);
  const giPos = at(BAD, 'gI') + 1;
  expect(e.debugSnapshot().graph.nodes.find((n) => n.name === 'foo').status === STATUS.BLOCKED, 'precondition');
  const h = e.hoverAt(giPos);
  expect(h.status !== 'unavailable', 'independent decl must not be unavailable');
}

// Settles without fabricating a type: when Beluga runs and reports no type for
// the site, the hover never goes 'ready' with a bogus type (and never hangs —
// the bel-hover layer renders the settled no-type result as head-only).
{
  const SRC = `o : type.\npf : o → type.\nrec c : o = M;\n`;
  const session = mockSession(() => null); // session runs but has no type for M
  const e = createSemanticEngine({ session });
  upd(e, SRC);
  const mPos = at(SRC, '= M') + 2;
  const h = e.hoverAt(mPos);
  expect(h.status === 'pending', `pending before the query settles, got ${h.status}`);
  const final = await h.promise;
  expect(final.status !== 'ready' && final.type == null,
    `a no-type result must never fabricate a type, got ${JSON.stringify(final)}`);
}

console.log('OK semantic hover v2 (hoverAt authoritative: source, stale-cache, metavar pending→ready, blocked, no fabricated type)');
