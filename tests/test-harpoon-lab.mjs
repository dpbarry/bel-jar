// Proof Lab orchestration (editor side): parsing a rec/proof declaration and
// building the Harpoon `proof`-form program the engine needs. commitProof is
// exercised against a minimal fake EditorView (it only needs doc.sliceString +
// dispatch + indentRange-tolerant state), so we test parseDecl + buildProofProgram
// directly and commit's text construction via a stub.
import {
  parseDecl, buildProofProgram, locateMember, committedMemberText, listCompMembers,
} from '../js/editor-src/harpoon/harpoon-program.mjs';
import { memberSpanInText } from '../js/editor-src/harpoon/scan-file-holes.mjs';
import { theoremUnderProof } from '../js/editor-src/prover/prover-hyp.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}
function eq(a, b, msg) { expect(JSON.stringify(a) === JSON.stringify(b), `${msg}\n  got ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`); }

// --- parseDecl --------------------------------------------------------------
const recDecl = parseDecl('rec id : {n : [ |- nat]} [ |- nat] =\nfn n => ?\n;');
expect(recDecl && recDecl.kw === 'rec', 'parses rec keyword');
eq(recDecl.name, 'id', 'rec name');
eq(recDecl.type, '{n : [ |- nat]} [ |- nat]', 'rec type (up to first top-level =)');

const proofDecl = parseDecl('proof double : [ |- nat] -> [ |- nat] =\n?\n;');
expect(proofDecl && proofDecl.kw === 'proof', 'parses proof keyword');
eq(proofDecl.type, '[ |- nat] -> [ |- nat]', 'proof type');

// A type containing => (an mlam in the type position is unusual, but a body with
// => must NOT be mistaken for the type/body separator).
const arrow = parseDecl('rec f : [ |- a] -> [ |- b] =\nfn x => x\n;');
eq(arrow.type, '[ |- a] -> [ |- b]', 'arrow type not split at =>');

// `=` nested in brackets is not the separator.
const nested = parseDecl('rec g : [ |- eq z z] =\n[ |- refl]\n;');
eq(nested.type, '[ |- eq z z]', 'type with bracketed content');

expect(parseDecl('LF nat : type =') === null || parseDecl('LF nat : type =').kw !== 'rec',
  'LF declaration is not a rec/proof');
expect(parseDecl('schema ctx = some [t:tp] block x:tm') === null, 'schema is not rec/proof');

// Beluga decl names may contain/end with symbols (classical-processes `lin_s≡`).
const unicodeSrc =
  'rec lin_s≡ : (g : ctx) [g |- P ≡ P\'] → [g |- linear (\\x. P)] =\n?\n;';
const unicodeName = parseDecl(unicodeSrc);
expect(unicodeName && unicodeName.kw === 'rec', 'parses rec with symbol suffix');
eq(unicodeName.name, 'lin_s≡', 'keeps ≡ in decl name');
expect(unicodeName.type.includes('linear'), 'type after symbol-suffixed name');
const thm = theoremUnderProof(unicodeSrc);
expect(thm && thm.name === 'lin_s≡', 'theoremUnderProof reads symbol-suffixed name');

// --- buildProofProgram ------------------------------------------------------
const assembled = [
  'LF nat : type =', '| z : nat', '| s : nat -> nat', ';', '',
  'rec id : {n : [ |- nat]} [ |- nat] =', 'fn n => ?', ';', ''
].join('\n');
const declStart = assembled.indexOf('rec id');
const declEnd = assembled.indexOf(';', declStart) + 1;
const built = buildProofProgram(assembled, declStart, declEnd);
expect(built && built.code.includes('proof id : {n : [ |- nat]} [ |- nat] ='),
  'builds a proof-form declaration');
expect(!built.code.includes('rec id'), 'rec keyword replaced by proof');
expect(built.code.includes('proof id'), 'proof form present');
// The `?` is the body — find it and confirm the reported line:col point at it.
const lines = built.code.split('\n');
const qLine = lines[built.line - 1];
expect(qLine[built.col - 1] === '?', `reported (line ${built.line}, col ${built.col}) points at '?', got ${JSON.stringify(qLine)}`);

// The LF prelude is preserved ahead of the proof.
expect(built.code.startsWith('LF nat : type ='), 'prelude preserved before proof');

// --- mutual `and` members ---------------------------------------------------
const andG = parseDecl('and g : [ |- tp] =\n?\n');
expect(andG && andG.kw === 'rec' && andG.leader === 'and', 'parses and-member leader');
eq(andG.name, 'g', 'and-member name');
eq(andG.type, '[ |- tp]', 'and-member type');

const andRecG = parseDecl('and rec h : [ |- tp] -> [ |- tp] =\nfn x => ?');
expect(andRecG && andRecG.leader === 'and rec' && andRecG.name === 'h', 'parses and rec member');

const andThm = theoremUnderProof('and g : [ |- tp] =\n?\n;');
expect(andThm && andThm.name === 'g', 'theoremUnderProof reads and-member');

const mutual = [
  'LF nat : type =',
  '| z : nat',
  ';',
  'rec f : [ |- nat] = [ |- z]',
  'and g : [ |- nat] = ?',
  ';',
].join('\n');
const locG = locateMember(mutual, 'g');
expect(locG && mutual.slice(locG.from, locG.to).startsWith('and g'), 'locateMember finds and g');
expect(mutual.slice(locG.from, locG.to).indexOf('rec f') < 0, 'member span excludes sibling f');
expect(mutual.slice(locG.blockFrom, locG.blockTo).includes('rec f')
  && mutual.slice(locG.blockFrom, locG.blockTo).includes('and g'),
  'block span keeps both members');

const locF = locateMember(mutual, 'f');
const builtF = buildProofProgram(mutual, locF.from, locF.to);
expect(builtF && /rec f : \[ \|- nat\] =/.test(builtF.code), 'mutual head stays rec (not proof)');
expect(builtF.code.includes('and g'), 'masking f keeps sibling g');
expect(!/proof f/.test(builtF.code), 'does not rewrite mutual head to proof');
expect(!/\?and/.test(builtF.code), 'masked hole is not glued to the next member');

const builtG = buildProofProgram(mutual, locG.from, locG.to);
expect(builtG && /and g : \[ \|- nat\] =/.test(builtG.code), 'and-member stays and');
expect(/rec f : \[ \|- nat\] = \[ \|- z\]/.test(builtG.code), 'masking g keeps sibling f complete');

const qOff = mutual.indexOf('?');
const memSpan = memberSpanInText(mutual, qOff);
expect(memSpan && mutual.slice(memSpan.from, memSpan.to).trimStart().startsWith('and g'),
  'memberSpanInText at g\'s hole is the g clause');

const commitAnd = committedMemberText(andG, '[ |- z]', false);
expect(commitAnd.startsWith('and g :'), 'commit keeps and leader');
expect(!/;/.test(commitAnd), 'non-last member commit has no semicolon');

const commitHead = committedMemberText(parseDecl('rec f : [ |- tp] = ?'), '[ |- z]', false);
expect(commitHead.startsWith('rec f :') && !/;/.test(commitHead),
  'mutual-head commit is rec without semicolon');

const members = listCompMembers(mutual);
expect(members.some((m) => m.name === 'f') && members.some((m) => m.name === 'g'),
  'listCompMembers splits the mutual block');

console.log(`OK test-proof-lab (${n} assertions)`);
