import {
  expandBelAliases,
  maybeExpandBelAliases,
  readAliasActivationMode,
} from '../js/editor-src/aliases.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

expect(expandBelAliases('\\Leftrightarrow') === '⇔', 'longest alias');
expect(expandBelAliases('A \\lor B') === 'A ∨ B', 'lor alias');
expect(expandBelAliases('x |- y -> z') === 'x ⊢ y → z', 'ascii shortcuts');

const once = expandBelAliases('\\lambda \\lor');
expect(once === 'λ ∨', 'multi alias');
expect(expandBelAliases(once) === once, 'idempotent');

// Greedy scan window must include text already present after an insertion.
function aliasScanWindow(docLen, fromB, toB) {
  const MAX = 13; // \\Leftrightarrow length
  return {
    from: Math.max(0, fromB - MAX + 1),
    to: Math.min(docLen, toB + MAX - 1),
  };
}
const doc = '\\land';
const win = aliasScanWindow(doc.length, 0, 3);
const chunk = doc.slice(win.from, win.to);
expect(chunk === '\\land', 'paste-before scan window includes suffix');
expect(expandBelAliases(chunk) === '∧', 'paste-before completes alias');

const prev = globalThis.Persist;
globalThis.Persist = { readStoredAliasActivation() { return 'strict'; } };
expect(maybeExpandBelAliases('\\lor') === '\\lor', 'strict leaves text');
globalThis.Persist = { readStoredAliasActivation() { return 'greedy'; } };
expect(maybeExpandBelAliases('\\lor') === '∨', 'greedy expands text');
globalThis.Persist = undefined;
expect(readAliasActivationMode() === 'strict', 'default strict');
globalThis.Persist = prev;

console.log('OK bel-aliases');
