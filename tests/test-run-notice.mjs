// It finished while you were elsewhere (plan v6 phase 04, n1;
// js/beluga/run-notice.mjs): a run's verdict read as the REPL reads it, when
// a finished run earns a notice, and what the notice says and opens.
import { runVerdict, leftDuringRun, runNotice } from '../js/beluga/run-notice.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const ok = '## Type Reconstruction begin: main.bel ##\n## Type Reconstruction done:  main.bel ##\n';
expect(runVerdict(ok).kind === 'ok' && runVerdict('').kind === 'ok', 'type reconstruction and nothing else: it checks');
const holes = ok + '## Holes: main.bel ##\n- hole at line 3\n  ?x : nat\n';
const v = runVerdict(holes);
expect(v.kind === 'holes' && v.holes === 1 && v.first === null, 'holes: it checks, with holes left, and no error to open');
const err = '## Type Reconstruction begin: lib/nat.bel ##\nFile "lib/nat.bel", line 7, characters 4-9:\nError: Identifier plus is unbound\n';
const e = runVerdict(err);
expect(e.kind === 'error' && e.first && e.first.path === 'lib/nat.bel' && e.first.line === 7, `an error, and where the first one is (${JSON.stringify(e)})`);
const compact = 'main.bel:12.3-12.9: Type mismatch\n';
expect(runVerdict(compact).first.line === 12, 'in the compact form too');
expect(runVerdict('Identifier & is unbound.\n').kind === 'error', 'fail closed: a line that is neither status nor hole is an error, located or not');
expect(runVerdict('\x1b[31mFile "a.bel", line 2:\x1b[0m\nError: x\n').first.line === 2, 'colour codes are not in the way');

expect(!leftDuringRun({ fileId: 'f1' }, { fileId: 'f1', hidden: false }), 'still on the file, the tab in sight: you watched it finish, no notice');
expect(leftDuringRun({ fileId: 'f1' }, { fileId: 'f2', hidden: false }), 'on another file when it ends: a notice');
expect(leftDuringRun({ fileId: 'f1' }, { fileId: 'f1', hidden: true }), 'the tab out of sight when it ends: a notice');

const fileOf = (p) => (p === 'lib/nat.bel' ? 'f_nat' : null);
const ne = runNotice(e, 'the project', fileOf);
expect(ne.kind === 'error' && ne.title === 'Errors in the project' && ne.links.fileId === 'f_nat' && ne.links.line === 7 && /nat\.bel, line 7/.test(ne.body),
  `an error notice opens the first error (${JSON.stringify(ne)})`);
expect(runNotice(runVerdict(ok), 'main.bel', fileOf).title === 'Checked main.bel' && !runNotice(runVerdict(ok), 'main.bel').links, 'a clean run says so, and opens nothing');
expect(/holes/.test(runNotice(v, 'main.bel').body), 'one with holes says so');
expect(!runNotice(runVerdict('Identifier & is unbound.\n'), 'main.bel', fileOf).links, 'an error with no place opens nothing, and says where the details are');
const words = [ne, runNotice(v, 'x'), runNotice(runVerdict(ok), 'x')].map((x) => x.title + ' ' + x.body).join(' ');
expect(!/—|–/.test(words), 'in the house voice: no dashes');

console.log(`OK run notice (${n} checks: the verdict as the REPL reads it, when a run earns a notice, what it says and opens)`);
