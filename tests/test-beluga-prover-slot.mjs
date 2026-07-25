import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'js', 'beluga', 'beluga-client.js'), 'utf8');

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

expect(/var proverSlot = null/.test(src), 'prover slot declared');
expect(/function beginProverSession/.test(src), 'beginProverSession exists');
expect(/function endProverSession/.test(src), 'endProverSession exists');
expect(/checkResultForProver/.test(src), 'checkResultForProver exported');
expect(/loadProverChecker/.test(src), 'loadProverChecker exported');
expect(/function dispatchIdeDeclTypeForProver/.test(src), 'prover decl-type dispatcher exists');
expect(/ideDeclTypeForProver:\s*function/.test(src),
  'ideDeclTypeForProver registered on the public API (dispatcher alone is unreachable)');

const noteEditorChange = src.slice(src.indexOf('function noteEditorChange'), src.indexOf('function dispatchCheckResult'));
expect(noteEditorChange.includes('checkerSlot'), 'noteEditorChange still manages checkerSlot');
expect(!noteEditorChange.includes('proverSlot'), 'noteEditorChange must not touch proverSlot');

const cancelBlock = src.slice(src.indexOf('function cancelCheckerWorkload'), src.indexOf('function intelLoadThen'));
expect(cancelBlock.includes('checkerSlot'), 'cancelCheckerWorkload targets checkerSlot');
expect(!cancelBlock.includes('proverSlot'), 'cancelCheckerWorkload must not touch proverSlot');

console.log(`OK test-beluga-prover-slot (${n} assertions)`);
