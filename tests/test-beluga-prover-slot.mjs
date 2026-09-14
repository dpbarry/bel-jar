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

expect(/function abortProverWorkload/.test(src), 'abortProverWorkload exists');
expect(/abortProverWorkload:\s*abortProverWorkload/.test(src),
  'abortProverWorkload registered on the public API');

const abortBlock = src.slice(src.indexOf('function abortProverWorkload'), src.indexOf('function cancelCheckerWorkload'));
expect(abortBlock.includes('proverSlot'), 'abortProverWorkload terminates proverSlot');
expect(abortBlock.includes('terminateProverPool'), 'abortProverWorkload terminates the prover pool');
expect(abortBlock.includes('terminateSlot'), 'abortProverWorkload kills in-flight prover jobs');

const cancelBlock = src.slice(src.indexOf('function cancelCheckerWorkload'), src.indexOf('function intelLoadThen'));
expect(cancelBlock.includes('checkerSlot'), 'cancelCheckerWorkload targets checkerSlot');
expect(!cancelBlock.includes('proverSlot'), 'cancelCheckerWorkload must not touch proverSlot');

expect(/function outputLooksLikeSuccessfulHoleReport/.test(src),
  'a hole report is not treated as a failed check');
expect(/if \(!ok && outputLooksLikeSuccessfulHoleReport\(output\)\) ok = true/.test(src),
  'checkResultOf accepts a hole report even when ok was lost in transit');

const worker = readFileSync(join(root, 'js', 'beluga', 'beluga-worker.js'), 'utf8');
expect(/function cloneBelugaResult/.test(worker), 'worker posts a plain {ok, output} clone');
expect(/cloneBelugaResult\(Beluga\.checkFromString/.test(worker),
  'check results are cloned before postMessage');
expect(/cloneBelugaResult\(Beluga\.loadFromString/.test(worker),
  'load results are cloned before postMessage');

console.log(`OK test-beluga-prover-slot (${n} assertions)`);
