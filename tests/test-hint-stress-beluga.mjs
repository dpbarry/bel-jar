import assert from 'node:assert';
import { checkFile } from './_beluga-check.mjs';

const result = checkFile('tests/fixtures/hint-stress.bel');
assert.equal(result.ok, true, String(result.output ?? 'Beluga check failed'));
console.log('OK hint-stress.bel passes Beluga type-check');
