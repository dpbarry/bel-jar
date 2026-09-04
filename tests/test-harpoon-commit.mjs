import {
  buildCommitCheckCodes,
  needsFullCommitCheck,
  countSiblingHoledDecls,
} from '../js/editor-src/harpoon/harpoon-program.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const assembled = [
  'LF nat : type =', '| z : nat', '| s : nat -> nat', ';', '',
  'rec id : {n : [ |- nat]} [ |- nat] =', 'fn n => ?', ';', '',
  'rec other : [ |- nat] = ?;', '',
].join('\n');

const declStart = assembled.indexOf('rec id');
const declEnd = assembled.indexOf(';', declStart) + 1;
const prep = {
  name: 'id',
  assembledDeclFrom: declStart,
  assembledDeclTo: declEnd,
  fileStart: 0,
};

const newDecl = 'rec id : {n : [ |- nat]} [ |- nat] =\nfn n => z\n;';

const codes = buildCommitCheckCodes(assembled, prep, newDecl);
expect(codes.patched.includes('fn n => z'), 'patched contains new body');
expect(codes.orchestration.includes('fn n => z'), 'orchestration contains new body');
expect(codes.orchestration.length < codes.patched.length,
  'orchestration smaller when sibling holed decl stripped');

expect(countSiblingHoledDecls(assembled, 'id') === 1, 'one sibling holed decl');
expect(countSiblingHoledDecls('rec a : T = ?;', 'a') === 0, 'no sibling for lone decl');

const mutualHoled = [
  'rec f : [ |- tp] = [ |- z]',
  'and g : [ |- tp] = ?',
  ';',
].join('\n');
expect(countSiblingHoledDecls(mutualHoled, 'g') === 0,
  'complete mutual sibling is not a holed decl');
expect(countSiblingHoledDecls(mutualHoled + '\nrec other : T = ?;', 'g') === 1,
  'a holed rec outside the block still counts');

expect(needsFullCommitCheck({ compromise: { level: 'none' }, docText: 'rec a : T = x;', declName: 'a' }) === false,
  'clean anchor no full check');
expect(needsFullCommitCheck({ compromise: { level: 'warn' }, docText: 'rec a : T = x;', declName: 'a' }) === false,
  'warn alone does not trigger orchestration check');
expect(needsFullCommitCheck({
  compromise: { level: 'none' },
  docText: 'rec a : T = ?;\nrec b : T = x;',
  declName: 'b',
}) === true, 'sibling hole triggers full check');

console.log(`OK test-harpoon-commit (${n} assertions)`);
