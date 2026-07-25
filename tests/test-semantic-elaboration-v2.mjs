// Semantic Engine V2 — elaboration (implicit-binder typing) lock-down.
// Two tiers, proven against a mock SESSION (the single Beluga authority):
//   * ANNOTATION — an explicitly-bound implicit (e.g. a rec's `(P : [g |- o])`)
//     is typed instantly from the scope model, NO Beluga round-trip. This is
//     exactly the case the legacy hover got wrong ("type unavailable").
//   * SESSION — an UNANNOTATED implicit metavariable (free uppercase var) is
//     typed via the warm session at its USE-SITE occurrence (the only place
//     Beluga answers), cached by enclosing decl + name: shared across
//     occurrences and surviving edits to other declarations (stale-known).
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
// Offset -> Beluga (1-based line, 0-based col), matching syntax doc.lineAt.
const lc = (src, off) => {
  const pre = src.slice(0, off);
  return { line: pre.split('\n').length, col: off - (pre.lastIndexOf('\n') + 1) };
};
const tyAt = (src, off) => { const { line, col } = lc(src, off); return `MV@${line}:${col}`; };

// Mock session: typeAt returns a position-tagged type and records calls. This
// is the per-occurrence query elaborateAt drives (the only Beluga path now).
function mockSession() {
  const calls = [];
  return {
    calls,
    async typeAt(code, line, col) { calls.push(`${line}:${col}`); return { ok: true, type: `MV@${line}:${col}` }; },
  };
}

// --- Tier ANNOTATION: explicitly-bound implicit, no session -------------
{
  const SRC = `o : type.\nmstep : o -> o -> type.\nschema ctx = o;\nrec t : (g:ctx) (P:[g |- o]) (Q:[g |- o])\n  [g |- mstep P Q] -> [g |- mstep P Q] =\nfn x => x\n;\n`;
  const session = mockSession();
  const e = createSemanticEngine({ session });
  upd(e, SRC);
  const r = await e.elaborateAt(at(SRC, 'mstep P Q') + 6); // the P use
  expect(r && r.source === 'annotation', `annotated implicit should resolve from source, got ${r && r.source}`);
  expect(r.type === '[g |- o]', `expected P's written type, got ${r.type}`);
  expect(session.calls.length === 0, 'an annotated implicit must NOT query the session');
}

// --- Tier SESSION: unannotated metavar, occurrence-resolved + cached ----
{
  // A, B, R are free uppercase metavars in `c`'s type (no `(A:..)` binders).
  const SRC = `o : type.\nthen : o -> o -> o -> o.\npf : o -> type.\nc : pf A -> pf (then A B R).\n`;
  const session = mockSession();
  const e = createSemanticEngine({ session });
  upd(e, SRC);

  // First occurrence of A (in `pf A`).
  const aPos1 = at(SRC, 'pf A') + 3;
  const r1 = await e.elaborateAt(aPos1);
  expect(r1 && r1.source === 'oracle', `unannotated metavar should resolve via the session, got ${r1 && r1.source}`);
  expect(r1.type === tyAt(SRC, aPos1), `expected session type for A, got ${r1.type}`);
  expect(session.calls.length === 1, 'first metavar query should hit the session once');

  // Second occurrence of A (in `then A B R`) → served from cache (same decl+name).
  const aPos2 = at(SRC, 'then A B R') + 5;
  const r2 = await e.elaborateAt(aPos2);
  expect(r2 && r2.type === r1.type, 'a second occurrence of the same metavar must reuse the cached type');
  expect(session.calls.length === 1, 'cached metavar must NOT query the session again');

  // A different metavar (R) is a distinct entry → one more session call.
  const rPos = at(SRC, 'then A B R') + 9;
  const r3 = await e.elaborateAt(rPos);
  expect(r3 && r3.source === 'oracle' && r3.type === tyAt(SRC, rPos), 'R resolves via the session independently');
  expect(session.calls.length === 2, 'distinct metavar should add exactly one session call');
}

// --- Stale-known: metavar type survives an edit to ANOTHER declaration --
{
  const SRC = `o : type.\nthen : o -> o -> o -> o.\npf : o -> type.\nc : pf A -> pf (then A B R).\n`;
  const session = mockSession();
  const e = createSemanticEngine({ session });
  upd(e, SRC);
  const aPos = at(SRC, 'pf A') + 3;
  await e.elaborateAt(aPos); // cache A
  expect(session.calls.length === 1, 'precondition: A cached via one session call');

  // Edit an UNRELATED declaration (append a new one) — c is untouched.
  upd(e, SRC + 'extra : o -> type.\n');
  const after = await e.elaborateAt(aPos);
  expect(after && after.type === tyAt(SRC, aPos), 'A type must survive an edit to another declaration');
  expect(session.calls.length === 1, 'A was not dirtied → no re-query (cache survived)');
}

console.log('OK semantic elaboration v2 (annotation tier instant, session tier cached/shared/stale-known)');
