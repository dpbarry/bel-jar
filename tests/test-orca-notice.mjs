// Orca finished, or gave up (plan v6 phase 04, n3; js/harpoon/orca-notice.mjs):
// when a search earns a notice, and what it says and opens.
import { orcaNotice, harpoonInView, LONG_MS } from '../js/harpoon/orca-notice.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const base = { complete: true, stuck: null, name: 'plus_zero', elapsedMs: LONG_MS, panelOpen: false, hidden: false, link: { fileId: 'f1', path: 'nat.bel', from: 120 } };
const done = orcaNotice(base);
expect(done && done.kind === 'success' && done.title === 'Orca proved plus_zero' && done.links.fileId === 'f1' && done.links.from === 120,
  `a long search that ends with the panel closed: one notice, named, opening the hole (${JSON.stringify(done)})`);
const gave = orcaNotice(Object.assign({}, base, { complete: false, stuck: { reason: 'no move left' } }));
expect(gave && gave.kind === 'warn' && gave.title === 'Orca gave up on plus_zero', 'one that gives up says so');
expect(orcaNotice(Object.assign({}, base, { panelOpen: true })) === null, 'with the panel open you watched it end: nothing');
expect(orcaNotice(Object.assign({}, base, { panelOpen: true, hidden: true })) !== null, 'the panel open in a tab out of sight: you did not');
expect(orcaNotice(Object.assign({}, base, { elapsedMs: LONG_MS - 1 })) === null, 'a quick search: you had no time to look away');
expect(orcaNotice(Object.assign({}, base, { complete: false, stuck: { reason: 'stopped' } })) === null
  && orcaNotice(Object.assign({}, base, { complete: false, stuck: { reason: 'cancelled' } })) === null, 'one you stopped yourself: nothing');
expect(orcaNotice(Object.assign({}, base, { name: '', link: null })).title === 'Orca proved a hole' && !orcaNotice(Object.assign({}, base, { link: null })).links,
  'without a name or a place it still reads, and opens nothing');
expect(orcaNotice(Object.assign({}, base, { elapsedMs: 5, longMs: 0 })) !== null, 'the threshold can be lowered (the probe does)');
expect(harpoonInView({ host: { kind: 'float' }, win: {} }, false) === true
  && harpoonInView({ host: { kind: 'float' }, win: null }, true) === false,
  'a floating lab is in view while its window is open, whatever the side panel does');
expect(harpoonInView({ host: { kind: 'panel' } }, true) === true && harpoonInView({ host: { kind: 'panel' } }, false) === false
  && harpoonInView({ host: { kind: 'panel' }, disposed: true }, true) === false, 'the panel lab, while the side panel is open');
expect(![done, gave].some((x) => /—|–/.test(x.title + x.body)), 'in the house voice: no dashes');

console.log(`OK orca notice (${n} checks: a long search ended out of sight leaves one notice, named and opening the hole; one watched, quick or stopped says nothing)`);
