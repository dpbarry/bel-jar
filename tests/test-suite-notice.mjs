// A suite changes colour (plan v6 phase 04, n2; js/app/suite-notice.mjs).
// Done when: "three red checks in a row make one notice, not three".
import { createSuiteWatch } from '../js/app/suite-notice.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const w = createSuiteWatch();
const green = [{ path: 'nat/lemmas.bel', errors: 0 }, { path: 'nat/main.bel', errors: 0 }];
const red = [{ path: 'nat/lemmas.bel', errors: 0 }, { path: 'nat/main.bel', fileId: 'f_main', errors: 2, line: 4 }];
expect(w.observe('nat/nat.cfg', green, 'nat/lemmas.bel') === null, 'the first sight of a suite says nothing');
const turned = w.observe('nat/nat.cfg', red, 'nat/lemmas.bel');
expect(turned && turned.title === 'Suite nat has errors' && /main\.bel has errors now/.test(turned.body) && turned.links.fileId === 'f_main' && turned.links.line === 4,
  `an edit to lemmas.bel turns main.bel red: one notice, naming it, opening its first error (${JSON.stringify(turned)})`);
expect(w.observe('nat/nat.cfg', red, 'nat/lemmas.bel') === null && w.observe('nat/nat.cfg', red, 'nat/lemmas.bel') === null,
  'three red checks in a row make one notice, not three');
const back = w.observe('nat/nat.cfg', green, 'nat/lemmas.bel');
expect(back && back.kind === 'success' && back.title === 'Suite nat checks again' && /main\.bel was the last to be fixed/.test(back.body), 'back to green: one notice');
expect(turned.dedupeKey === back.dedupeKey, 'the same card, refreshed: a suite has one');

const typing = createSuiteWatch();
typing.observe('s.cfg', green, 'nat/main.bel');
expect(typing.observe('s.cfg', [{ path: 'nat/lemmas.bel', errors: 0 }, { path: 'nat/main.bel', errors: 1 }], 'nat/main.bel') === null,
  'a typo in the open file turns the suite red in front of you: nothing');
expect(typing.observe('s.cfg', green, 'nat/main.bel') === null, 'and fixing it: nothing');

const two = createSuiteWatch();
two.observe('a.cfg', green, null);
two.observe('b.cfg', green, null);
expect(!!two.observe('a.cfg', red, null) && two.observe('b.cfg', green, null) === null, 'each suite is watched on its own');
expect(![turned, back].some((x) => /—|–/.test(x.title + x.body)), 'in the house voice: no dashes');

console.log(`OK suite notice (${n} checks: once per change and per suite, naming the file that turned it, nothing for what you watched)`);
