import { LIST_STEP as stripStep, LIST_PAGE as stripPage, listStepDelta as stripDelta } from '../js/status-strip/status-strip-line-ui.mjs';
import { LIST_STEP as edStep, LIST_PAGE as edPage, listStepDelta as edDelta } from '../js/editor-src/ide/completion/list-keys.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

expect(JSON.stringify(stripStep) === JSON.stringify(edStep),
  'LIST_STEP is the same table on both sides of the seam');
expect(stripPage === edPage, 'LIST_PAGE is the same on both sides of the seam');
expect(stripStep.n === 1 && stripStep.m === 1 && stripStep.p === -1,
  'C-n and C-m walk forward, C-p walks back');

function key(partial) {
  return Object.assign({
    key: '',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
  }, partial);
}

for (const delta of [stripDelta, edDelta]) {
  const who = delta === stripDelta ? 'strip' : 'editor';
  expect(delta(key({ key: 'ArrowDown' })) === 1, `${who}: ArrowDown`);
  expect(delta(key({ key: 'ArrowUp' })) === -1, `${who}: ArrowUp`);
  expect(delta(key({ key: 'PageDown' })) === stripPage, `${who}: PageDown`);
  expect(delta(key({ key: 'PageUp' })) === -stripPage, `${who}: PageUp`);
  expect(delta(key({ key: 'n', ctrlKey: true })) === 1, `${who}: C-n`);
  expect(delta(key({ key: 'm', ctrlKey: true })) === 1, `${who}: C-m`);
  expect(delta(key({ key: 'M', ctrlKey: true })) === 1, `${who}: C-M`);
  expect(delta(key({ key: 'Enter', ctrlKey: true, code: 'KeyM' })) === 1,
    `${who}: C-m reported as Enter`);
  expect(delta(key({ key: 'p', ctrlKey: true })) === -1, `${who}: C-p`);
  expect(delta(key({ key: 'ArrowDown' }), { arrows: false }) === 0,
    `${who}: vim ex does not take arrows`);
  expect(delta(key({ key: 'n', ctrlKey: true }), { arrows: false }) === 1,
    `${who}: vim ex still takes C-n`);
  expect(delta(key({ key: 'm', ctrlKey: true, altKey: true })) === 0,
    `${who}: C-M-m is not a list-step`);
  expect(delta(key({ key: 'j', ctrlKey: true })) === 0,
    `${who}: unbound C-j is not a list-step`);
}

expect(stripDelta(null) === 0 && edDelta(undefined) === 0, 'missing events are 0');

console.log('OK list-step (strip + editor tables agree)');
