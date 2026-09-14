import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { proveOrchestrationCode } from '../js/editor-src/prover/prover-orchestrator.mjs';
import { locateMember } from '../js/editor-src/harpoon/harpoon-program.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'tests', 'fixtures', 'all.bel'), 'utf8');

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function orch(name) {
  const loc = locateMember(src, name, 0);
  expect(!!loc, `locate ${name}`);
  const from = loc.blockFrom != null ? loc.blockFrom : loc.from;
  const to = loc.blockTo != null ? loc.blockTo : loc.to;
  return proveOrchestrationCode(src, name, from, to, 0);
}

const first = orch('lem7-clo-app-c');
expect(first.includes('and rec lem7-clo-app-c'), 'first hole keeps its mutual rec');
expect(first.includes('rec lem7-clo-app:'), 'first hole keeps the leading mutual member');

const later = orch('clo-match1-1');
expect(later.includes('clo-match1-1'), 'later hole keeps the target');
expect(later.includes('rec lem7-clo-app'),
  'later hole keeps the incomplete lemma that main applies');
expect(later.includes('rec main:'), 'later hole keeps the enclosing mutual rec');

console.log(`OK test-prove-orch-allbel (${n} assertions)`);
