// Suite-composition analysis, shared by the cfg linter (anchors on cfg lines) and
// the settlement (anchors in the offending .bel file). Pins: pragma leak across
// files, and — the subtle one — SHADOWED USE. Re-declaring an LF type is legal
// shadowing in Beluga and harmless on its own; the error only appears when a
// LATER file uses a name the redefinition shadowed away. The VICTIM gets the
// error at its use; the redefiner gets a warning only in that case, never for
// the redeclaration alone.
import {
  analyzeSuite, suiteFileDiagnostics, leadingGlobalPragma, fileShadowInfo, findingLine, findingMessage,
} from '../js/editor-src/ide/suite-lint.mjs';

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

// ── The redefiner is warned too, but only when a later file uses what it dropped ──
{
  const f = analyzeSuite([
    { key: 'fol.elf', text: ELF },
    { key: 'fol-handbook.bel', text: HANDBOOK },
    { key: 'fol.bel', text: FOLBEL },
  ]);
  const rd = f.find((x) => x.kind === 'shadowing-redeclaration');
  expect(rd && rd.at === 'fol-handbook.bel' && rd.severity === 'warning', 'the redefiner gets a warning');
  expect(rd.type === 'o' && rd.headLine === 1, 'on the line of its redeclared head (line 1)');
  expect(rd.dropped.join(',') === 'atom' && rd.users.join(',') === 'fol.bel', 'naming what it dropped and who uses it');
}
{
  const f = analyzeSuite([
    { key: 'a', text: ELF },
    { key: 'b', text: HANDBOOK },
    { key: 'c', text: `LF o : type = | imp : o->o->o | conj : o->o->o | atom : atm -> o ;` },
    { key: 'd', text: FOLBEL },
  ]);
  expect(!f.some((x) => x.kind === 'shadowing-redeclaration'), 'no warning once a later file restores the dropped name');
}

// ── Twelf-style families: `nat : type.` is a family, its constants are its members ──
const NAT = 'nat : type.\nz : nat.\ns : nat -> nat.';
const NAT_NO_S = 'nat : type.\nz : nat.';
const USES_S = 'rec one : [ |- nat] = [ |- s z];';
{
  const i = fileShadowInfo(NAT);
  const nat = i.families.get('nat');
  expect(nat && nat.members.has('nat') && nat.members.has('z') && nat.members.has('s'),
    '`nat : type.` is a family whose members are its constants');
  expect(i.memberType.get('s') === 'nat' && i.memberType.get('z') === 'nat', 'a constant maps back to its family');
}
{
  const f = analyzeSuite([
    { key: 'a', text: NAT },
    { key: 'b', text: NAT_NO_S },
    { key: 'c', text: USES_S },
  ]);
  const su = f.find((x) => x.kind === 'shadowed-use');
  expect(su && su.at === 'c' && su.useName === 's' && su.type === 'nat' && su.shadower === 'b' && su.origin === 'a',
    'redeclaring a Twelf-style family without a constant shadows it away');
  const rd = f.find((x) => x.kind === 'shadowing-redeclaration');
  expect(rd && rd.at === 'b' && rd.headLine === 0 && rd.dropped.join(',') === 's', 'and warns the redefiner');
  expect(analyzeSuite([{ key: 'a', text: NAT }, { key: 'b', text: NAT_NO_S }]).length === 0,
    'with no later use, redeclaring it is clean');
}
{
  // A constant declared in a LATER file than its family joins it, and is dropped with it.
  const f = analyzeSuite([
    { key: 'a', text: 'nat : type.\nz : nat.' },
    { key: 'b', text: 's : nat -> nat.' },
    { key: 'c', text: NAT_NO_S },
    { key: 'd', text: USES_S },
  ]);
  const su = f.find((x) => x.kind === 'shadowed-use');
  expect(su && su.at === 'd' && su.origin === 'b' && su.shadower === 'c', 'a family member declared in a later file is tracked');
}
{
  // Where a constant's type ends: `->` right, `<-` left, Π body, parentheses, application head.
  const i = fileShadowInfo([
    'plus : nat -> nat -> nat -> type.',
    'p/z : plus z N N.',
    'p/s : plus (s M) N (s P) <- plus M N P.',
    'q : {x : nat} eq x x.',
    'r : (nat -> nat) -> nat.',
    'w : nat → nat.',
    'LF o : type = | c : o;',
    'k : o.',
  ].join('\n'));
  const want = { 'p/z': 'plus', 'p/s': 'plus', q: 'eq', r: 'nat', w: 'nat', k: 'o' };
  for (const [name, family] of Object.entries(want)) {
    expect(i.memberType.get(name) === family, `${name} belongs to ${family} (got ${i.memberType.get(name)})`);
  }
  expect(i.families.get('plus') && i.families.get('o').members.has('k'), 'a kind-declared family, and a datatype with a constant of its type');
}
{
  // Wording for several dropped names and several users.
  const f = analyzeSuite([
    { key: 'a', text: 'nat : type.\nz : nat.\ns : nat -> nat.\nt : nat.' },
    { key: 'b', text: NAT_NO_S },
    { key: 'c', text: USES_S },
    { key: 'd', text: 'rec two : [ |- nat] = [ |- s t];' },
  ]);
  const rd = f.find((x) => x.kind === 'shadowing-redeclaration');
  expect(rd && findingMessage(rd, (k) => `${k}.bel`) === 'Redefining nat here drops s and t, which c.bel and d.bel use.',
    `plural wording (got ${rd && findingMessage(rd, (k) => `${k}.bel`)})`);
}

// ── suiteFileDiagnostics: the redefiner's warning, on its redeclared head ──────
{
  const entries = [
    { key: 'a', name: 'a.bel', text: NAT },
    { key: 'b', name: 'b.bel', text: `% the second nat\n${NAT_NO_S}` },
    { key: 'c', name: 'c.bel', text: USES_S },
  ];
  const spans = [];
  const lineSpan = (i) => { spans.push(i); return { from: i, to: i + 1 }; };
  const d = suiteFileDiagnostics(entries, 'b', lineSpan);
  expect(d.length === 1 && d[0].severity === 'warning' && d[0].source === 'suite', 'the redefiner file gets one warning');
  expect(d[0].message === 'Redefining nat here drops s, which c.bel uses.', `redefiner wording (got ${d[0].message})`);
  expect(spans.includes(1), 'anchored on the redeclared head, line 1');
  expect(findingLine({ kind: 'shadowing-redeclaration', headLine: 4 }) === 4 && findingLine({ kind: 'pragma-leak', pragmaLine: 2 }) === 2
    && findingLine({ kind: 'shadowed-use', useLine: 3 }) === 3, 'findingLine reads each kind\'s own line');
}

console.log('OK suite lint (legal re-declaration is clean; a later USE of a shadowed-away name is an error '
  + 'on the victim and a warning on the redefiner; Twelf-style families; pragma leak)');
