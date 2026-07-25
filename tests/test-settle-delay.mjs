import { computeSettleDelayMs, noteTypingVelocity, resetSettleDelayState } from '../js/editor-src/semantic/settle-delay.mjs';
import { Text } from '@codemirror/state';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

resetSettleDelayState();
const small = { doc: Text.of('x') };
const large = { doc: Text.of('x'.repeat(15000)) };
const dSmall = computeSettleDelayMs(small);
const dLarge = computeSettleDelayMs(large, { preludePaths: 2 });
expect(dSmall >= 120 && dSmall <= 350, 'small delay in range');
expect(dLarge >= dSmall, 'large/suite delay >= small');
noteTypingVelocity();
noteTypingVelocity();
const dFast = computeSettleDelayMs(small);
expect(dFast <= dSmall, 'fast typing shortens delay');
console.log('OK test-settle-delay');
