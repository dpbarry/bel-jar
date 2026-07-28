// Proof Lab orchestration (editor side): parsing a rec/proof declaration and
// building the Harpoon `proof`-form program the engine needs. commitProof is
// exercised against a minimal fake EditorView (it only needs doc.sliceString +
// dispatch + indentRange-tolerant state), so we test parseDecl + buildProofProgram
// directly and commit's text construction via a stub.
import { parseDecl, buildProofProgram } from '../js/editor-src/harpoon/harpoon-program.mjs';
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

console.log(`OK test-proof-lab (${n} assertions)`);
