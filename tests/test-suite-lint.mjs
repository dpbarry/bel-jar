// Suite-composition analysis, shared by the cfg linter (anchors on cfg lines) and
// the settlement (anchors in the offending .bel file). Pins: pragma leak across
// files, and — the subtle one — SHADOWED USE. Re-declaring an LF type is legal
// shadowing in Beluga and harmless on its own; the error only appears when a
// LATER file uses a constructor the redefinition shadowed away. We must flag the
// VICTIM at its use, never the (innocent) redefiner.
import { analyzeSuite, suiteFileDiagnostics, leadingGlobalPragma, fileShadowInfo } from '../js/editor-src/ide/suite-lint.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// Minimal stand-ins for the real fol example, keeping the essential structure:
// fol.elf's `o` has atom/conj; the handbook's `o` has all/not (NO atom/conj).
const ELF = `LF atm : type = ;
LF o : type =
  | imp : o -> o -> o
  | conj : o -> o -> o
  | atom : atm -> o
;`;
const HANDBOOK = `LF i : type = ;
LF o : type =
  | imp : o -> o -> o
  | all : (i -> o) -> o
;
LF nd : o -> type =
  | impi : nd (imp A B)
;`;
const FOLBEL = `rec r : [ |- atom P] = ?;`; // uses atom (fol.elf's o), not handbook's

// ── leadingGlobalPragma ──────────────────────────────────────────────────────
expect(leadingGlobalPragma('--nostrengthen\nLF x : type = ;').pragma === '--nostrengthen',
  'detects a leading global pragma');
expect(leadingGlobalPragma('\n\n  --coverage\nLF x:type=;').line === 2,
  'reports the 0-based line of the pragma past blank lines');
expect(leadingGlobalPragma('LF x : type = ;') === null, 'no pragma → null');
expect(leadingGlobalPragma('% a comment\n--nostrengthen') === null,
  'a non-blank non-pragma first line means no LEADING pragma');

// ── fileShadowInfo: parser-backed family + use extraction ────────────────────
{
  const i = fileShadowInfo(ELF);
  const o = i.families.get('o');
  expect(o && o.members.has('atom') && o.members.has('conj') && o.members.has('imp'),
    'an LF family maps its head to its constructor members');
  expect(o.members.has('o'), 'the family head is itself a member');
  expect(i.memberType.get('atom') === 'o', 'a constructor maps back to its family head');
}

// ── THE CONTRADICTION the user caught ────────────────────────────────────────
// fol.elf + fol-handbook.bel both declare `o`, yet check together perfectly:
// the handbook only uses its OWN o. Re-declaration alone must NOT be flagged.
{
  const f = analyzeSuite([
    { key: 'fol.elf', text: ELF },
    { key: 'fol-handbook.bel', text: HANDBOOK },
  ]);
  expect(f.length === 0,
    `two files declaring the same LF type but not misusing it is CLEAN, got: ${JSON.stringify(f)}`);
}

// Add fol.bel, which uses `atom` (fol.elf's o, shadowed away by the handbook).
// NOW it's an error — flagged on fol.bel (the victim), naming shadower + origin.
{
  const f = analyzeSuite([
    { key: 'fol.elf', text: ELF },
    { key: 'fol-handbook.bel', text: HANDBOOK },
    { key: 'fol.bel', text: FOLBEL },
  ]);
  const su = f.find((x) => x.kind === 'shadowed-use');
  expect(su, 'a later use of a shadowed-away constructor IS flagged');
  expect(su.at === 'fol.bel', 'flagged on the VICTIM (fol.bel), not the redefiner');
  expect(su.useName === 'atom', 'names the shadowed constructor actually used');
  expect(su.type === 'o' && su.shadower === 'fol-handbook.bel' && su.origin === 'fol.elf',
    'records the type, the redefiner that dropped it, and where it originally came from');
  expect(su.severity === 'error', 'a shadowed use is an error (it WILL mis-type)');
}

// Control: fol.elf + fol.bel (no handbook between them) → atom is in scope → CLEAN.
{
  const f = analyzeSuite([
    { key: 'fol.elf', text: ELF },
    { key: 'fol.bel', text: FOLBEL },
  ]);
  expect(f.length === 0, 'no shadowing file between origin and use → clean');
}

// Re-providing the dropped constructor heals it: a third file that re-declares
// `o` WITH atom puts it back in scope, so a later use is fine.
{
  const REPROVIDE = `LF o : type = | imp : o->o->o | conj : o->o->o | atom : atm -> o ;`;
  const f = analyzeSuite([
    { key: 'a', text: ELF },
    { key: 'b', text: HANDBOOK },
    { key: 'c', text: REPROVIDE },
    { key: 'd', text: FOLBEL },
  ]);
  expect(!f.some((x) => x.kind === 'shadowed-use'),
    'a later redefinition that restores the constructor heals the shadow');
}

// ── analyzeSuite: pragma leak (unchanged) ────────────────────────────────────
{
  const f = analyzeSuite([
    { key: 'a', text: 'LF foo : type = ;' },
    { key: 'b', text: '--nostrengthen\nLF bar : type = ;' },
  ]);
  const leak = f.find((x) => x.kind === 'pragma-leak');
  expect(leak && leak.at === 'b' && leak.severity === 'warning', 'later-file pragma → warning at that file');
  expect(leak.affected.length === 1 && leak.affected[0] === 'a', 'names the earlier affected file');
  expect(leak.pragmaLine === 0, 'records the pragma line for in-file anchoring');
}
{
  const f = analyzeSuite([
    { key: 'a', text: '--nostrengthen\nLF foo : type = ;' },
    { key: 'b', text: 'LF bar : type = ;' },
  ]);
  expect(!f.some((x) => x.kind === 'pragma-leak'), 'pragma on the first file leads the suite — fine');
}

// ── suiteFileDiagnostics: in-file anchoring on the victim's use line ──────────
{
  const entries = [
    { key: 'fol.elf', name: 'fol.elf', text: ELF },
    { key: 'fol-handbook.bel', name: 'fol-handbook.bel', text: HANDBOOK },
    { key: 'fol.bel', name: 'fol.bel', text: FOLBEL }, // uses atom on line 0
  ];
  const spans = [];
  const lineSpan = (i) => { spans.push(i); return { from: i, to: i + 1 }; };
  const d = suiteFileDiagnostics(entries, 'fol.bel', lineSpan);
  const su = d.find((x) => /no longer in scope/.test(x.message));
  expect(su && su.source === 'suite' && su.severity === 'error', 'victim file gets the error diagnostic');
  expect(spans.includes(0), 'anchored on the real use line in the victim file (line 0)');
  expect(/atom is no longer in scope/.test(su.message) && /fol-handbook\.bel redefines o/.test(su.message),
    'message names the constructor, the redefiner, and the type');
}

// A file outside the suite gets nothing.
{
  const d = suiteFileDiagnostics(
    [{ key: 'a', name: 'a.bel', text: ELF }, { key: 'b', name: 'b.bel', text: HANDBOOK }],
    'stranger', () => ({ from: 0, to: 1 }),
  );
  expect(d.length === 0, 'a file outside the suite gets no suite diagnostics');
}

console.log('OK suite lint (legal re-declaration is clean; only a later USE of a shadowed-away '
  + 'constructor is flagged, on the victim; pragma leak)');
