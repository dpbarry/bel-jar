import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lab = readFileSync(join(root, 'js', 'harpoon', 'harpoon-lab.mjs'), 'utf8');
const manual = readFileSync(join(root, 'js', 'harpoon', 'harpoon-lab-manual.mjs'), 'utf8');

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

expect(lab.includes('Session.prototype.abortCompute'), 'session can abort live compute');
expect(lab.includes('abortProverWorkload'), 'close kills the prover worker');
expect(lab.includes('abortMovesWorkload'), 'close kills move generation');
expect(lab.includes('fromWindowClose'), 'window close disposes the session');
expect(lab.includes('this.disposed'), 'session tracks disposed');
expect(/if \(this\.disposed \|\| !this\.bodyEl\) return/.test(lab),
  'render is a no-op after dispose');

const onClose = lab.slice(lab.indexOf('onClose: function ()'), lab.indexOf('onClose: function ()') + 280);
expect(onClose.includes('disposeSession'), 'float window close disposes the session');
expect(!onClose.includes('s.userCancelled = true') || onClose.includes('disposeSession'),
  'float close is not a partial teardown');

expect(manual.includes('movesAtAsync'), 'tactics load off the render path');
expect(manual.includes('movesPending'), 'tactics stay skeletoned until moves arrive');
expect(manual.includes('m.syncing || (m.movesPending && !moves.length)'),
  'Orca-running keeps cached tactics visible');
expect(!/ed\.movesAt\s*\(\s*st/.test(manual), 'render must not synthesise tactics on the UI thread');
expect(manual.includes('self.disposed'), 'manual continuations bail after close');
expect(manual.includes('loadMoves'), 'moves load is a cancellable job');
const asyncSrc = readFileSync(join(root, 'js', 'editor-src', 'prover', 'prover-moves-async.mjs'), 'utf8');
expect(asyncSrc.includes('settleWithoutUiWork'),
  'a dead moves worker must not synthesise tactics on the UI thread');

console.log(`OK test-harpoon-abort (${n} assertions)`);
